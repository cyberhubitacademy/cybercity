import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ASSETS, type PersonModel } from '../assets/Assets';
import { Humanoid, type Outfit } from './Humanoid';
import { hawaiianShirt } from '../world/textures';
import type { PoseName } from '../systems/movement/poses';
import { PoseLayer, type PoseBindings, type RigPoseOptions } from '../systems/movement/rigPose';

// Skinned, animated CC0 character (Quaternius) with outfit recoloring and
// smooth animation blending. Shares Humanoid's API so the player,
// pedestrians and story cast can use either; Humanoid is the fallback when
// models failed to load.

export interface Rig {
  readonly root: THREE.Group;
  readonly body: THREE.Group;
  animate(dt: number, speed: number, airborne?: boolean, seated?: boolean): void;
  setShirt(color: string, accent: string): void;
  wave(t: number): void;
  /**
   * Layer a procedural pose over the animation ('none' fades all out).
   * Weights blend smoothly; several poses can be active ('aim' is applied last).
   */
  setPose(name: PoseName, weight?: number, opts?: RigPoseOptions): void;
  /** Current blended weight of a pose (0..1). */
  poseWeight(name: PoseName): number;
}

export type { PoseName, RigPoseOptions };

const BONE_MAP: Record<string, keyof PoseBindings> = {
  Abdomen: 'spine', Torso: 'chest', Neck: 'neck',
  UpperArmL: 'armUL', LowerArmL: 'armLL', UpperArmR: 'armUR', LowerArmR: 'armLR',
  UpperLegL: 'legUL', LowerLegL: 'legLL', UpperLegR: 'legUR', LowerLegR: 'legLR',
};
const NEXT_JOINT: Record<string, string> = {
  Abdomen: 'Torso', Torso: 'Neck', Neck: 'Head',
  UpperArmL: 'LowerArmL', LowerArmL: 'PalmL', UpperArmR: 'LowerArmR', LowerArmR: 'PalmR',
  UpperLegL: 'LowerLegL', LowerLegL: 'LowerLegL_end', UpperLegR: 'LowerLegR', LowerLegR: 'LowerLegR_end',
};

/** Quaternius rigs keep the feet as IK bones under the root; when legs are posed, feet must follow the shins. */
interface FootFollow {
  foot: THREE.Object3D;
  shin: THREE.Object3D;
  pos: THREE.Vector3; // foot position in shin space (bind pose)
  rot: THREE.Quaternion; // foot rotation relative to the shin (bind pose)
}
const _fq = new THREE.Quaternion();
const _fq2 = new THREE.Quaternion();
const _fv = new THREE.Vector3();
const _fm = new THREE.Matrix4();

const HEIGHT = 1.78;
type Clip = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'wave';

const CLIP_PATTERNS: Record<Clip, RegExp> = {
  idle: /_Idle$|\|Idle$/,
  walk: /_Walk$|\|Walk$/,
  run: /_Run$|\|Run$/,
  jump: /_Jump$|\|Jump$/,
  sit: /Sitting/,
  wave: /Clapping|Wave/,
};

export class CharacterModel implements Rig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Clip, THREE.AnimationAction>();
  private current: Clip | null = null;
  private shirtMats: THREE.MeshStandardMaterial[] = [];
  private waving = 0;
  private pose = new PoseLayer();
  private bones: PoseBindings = {};
  private feet: FootFollow[] = [];

  constructor(model: PersonModel, outfit: Outfit) {
    const src = ASSETS.people.get(model);
    if (!src) throw new Error(`model ${model} not loaded`);
    const obj = cloneSkinned(src.scene);
    // Normalize to human height, feet on the ground, facing +z.
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const h = box.max.y - box.min.y || 1;
    const s = HEIGHT / h;
    obj.scale.multiplyScalar(s);
    obj.position.y -= box.min.y * s;
    this.body.add(obj);
    this.root.add(this.body);

    // Recolor outfit materials (each character gets its own copies).
    const colors: Record<string, string> = {
      shirt: outfit.shirt, lightjacket: outfit.shirt, jacket: outfit.accent ?? outfit.shirt, dress: outfit.shirt,
      pants: outfit.pants, skin: outfit.skin, hair: outfit.hair, hairbase: outfit.hair, eyebrows: outfit.hair,
      shoes: outfit.shoes ?? '#f4f4f4', socks: '#ffffff',
    };
    obj.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // skinned bounds don't follow animation
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const mat = (m as THREE.MeshStandardMaterial).clone();
        const key = (m.name || '').toLowerCase();
        if (colors[key]) {
          mat.color.set(colors[key]);
          mat.map = null;
        }
        mat.roughness = key === 'skin' ? 0.55 : key.includes('hair') ? 0.7 : 0.82;
        mat.metalness = 0;
        if (key === 'shirt' || key === 'dress') this.shirtMats.push(mat);
        return mat;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
    if (outfit.pattern === 'hawaiian') this.setShirt(outfit.shirt, outfit.accent ?? '#ff3d9a');

    this.mixer = new THREE.AnimationMixer(obj);
    for (const [clip, re] of Object.entries(CLIP_PATTERNS) as [Clip, RegExp][]) {
      const a = src.animations.find((c) => re.test(c.name));
      if (a) {
        const action = this.mixer.clipAction(a);
        if (clip === 'jump') { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
        this.actions.set(clip, action);
      }
    }
    this.bindPoseBones(obj);
    this.play('idle', 0);
    this.mixer.update(Math.random() * 2);
  }

  private bindPoseBones(obj: THREE.Object3D): void {
    try {
      const byName = new Map<string, THREE.Object3D>();
      obj.traverse((o) => byName.set(o.name.replace(/\./g, ''), o));
      for (const [name, key] of Object.entries(BONE_MAP)) {
        const bone = byName.get(name), next = byName.get(NEXT_JOINT[name]);
        if (!bone || !next || next.parent !== bone || next.position.lengthSq() < 1e-12) continue;
        this.bones[key] = { bone, along: next.position.clone().normalize() };
      }
      obj.updateMatrixWorld(true);
      for (const side of ['L', 'R']) {
        const foot = byName.get(`Foot${side}`), shin = byName.get(`LowerLeg${side}`);
        if (!foot || !shin || !foot.parent) continue;
        const pos = shin.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
        const rot = shin.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(foot.getWorldQuaternion(new THREE.Quaternion()));
        this.feet.push({ foot, shin, pos, rot });
      }
    } catch (err) {
      console.warn('[rig] pose bones unavailable', err);
    }
  }

  setPose(name: PoseName, weight = 1, opts?: RigPoseOptions): void {
    this.pose.set(name, weight, opts);
  }

  poseWeight(name: PoseName): number {
    return this.pose.weight(name);
  }

  private applyPose(dt: number, speed: number): void {
    if (!this.pose.apply(dt, speed, this.root, this.body, this.bones)) return;
    if (this.pose.legWeight < 0.01) return;
    for (const f of this.feet) {
      const parent = f.foot.parent;
      if (!parent) continue;
      _fv.copy(f.pos);
      f.shin.localToWorld(_fv);
      parent.worldToLocal(_fv);
      f.foot.position.copy(_fv);
      _fm.extractRotation(f.shin.matrixWorld);
      _fq.setFromRotationMatrix(_fm).multiply(f.rot);
      _fm.extractRotation(parent.matrixWorld);
      _fq2.setFromRotationMatrix(_fm).invert();
      f.foot.quaternion.copy(_fq2.multiply(_fq));
      f.foot.updateMatrixWorld(true);
    }
  }

  private play(clip: Clip, fade = 0.22, timeScale = 1): void {
    const next = this.actions.get(clip) ?? this.actions.get('idle');
    if (!next) return;
    next.timeScale = timeScale;
    if (this.current === clip) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset().setEffectiveWeight(1).play();
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
    this.current = clip;
  }

  animate(dt: number, speed: number, airborne = false, seated = false): void {
    if (this.waving > 0) {
      this.waving -= dt;
      this.play('wave');
    } else if (seated) this.play('sit', 0.15);
    else if (airborne) this.play('jump', 0.1);
    else if (speed > 4.2) this.play('run', 0.2, Math.min(1.35, speed / 6));
    else if (speed > 0.25) this.play('walk', 0.2, Math.max(0.7, Math.min(1.5, speed / 1.6)));
    else this.play('idle', 0.3);
    this.mixer.update(dt);
    if (!seated) this.applyPose(dt, speed);
  }

  setShirt(color: string, accent: string): void {
    for (const m of this.shirtMats) {
      m.color.set('#ffffff');
      m.map = hawaiianShirt(color, accent);
      m.needsUpdate = true;
    }
  }

  wave(): void {
    if (this.waving <= 0) this.waving = 1.6;
  }
}

/** Pick a model that suits the outfit; fall back to the procedural rig. */
export function createRig(outfit: Outfit, opts: { female?: boolean; seed?: number } = {}): Rig {
  if (ASSETS.people.size) {
    const seed = opts.seed ?? Math.floor(Math.random() * 1000);
    const female: PersonModel[] = ['woman_casual', 'woman_tank', 'woman_dress', 'woman_jacket'];
    const model: PersonModel = opts.female ? female[seed % female.length] : 'man';
    try {
      return new CharacterModel(model, outfit);
    } catch (err) {
      console.warn('[rig] falling back to procedural', err);
    }
  }
  return new Humanoid(outfit);
}
