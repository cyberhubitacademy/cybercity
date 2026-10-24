import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ASSETS, type PersonModel } from '../../assets/Assets';
import { Humanoid } from '../../actors/Humanoid';
import { findBones, poseAim, poseCrouch, poseFlinch, poseHandsUp, posePunch, poseKick, poseSwing, poseBlock, type BoneSet } from './bones';

// Combat character: a skinned Quaternius model with its own mixer so enemies,
// officers and fighters can play Punch / Death clips, plus the procedural pose
// layer (aim, hands up, kick, crouch, flinch). Falls back to the procedural
// Humanoid when the models failed to load.

export interface ActorOutfit { shirt: string; pants: string; skin: string; hair: string; accent?: string; shoes?: string }

type Clip = 'idle' | 'walk' | 'run' | 'punch' | 'death' | 'slash';
const CLIPS: Record<Clip, RegExp> = {
  idle: /_Idle$/, walk: /_Walk$/, run: /_Run$/, punch: /_Punch$/, death: /_Death$/, slash: /SwordSlash$/,
};
const HEIGHT = 1.78;

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function sharedMat(src: THREE.Material, color: string | null, key: string): THREE.MeshStandardMaterial {
  const k = `${src.uuid}|${color ?? ''}|${key}`;
  let m = matCache.get(k);
  if (!m) {
    m = (src as THREE.MeshStandardMaterial).clone();
    if (color) { m.color.set(color); m.map = null; }
    m.roughness = key === 'skin' ? 0.55 : 0.8;
    m.metalness = 0;
    matCache.set(k, m);
  }
  return m;
}

export interface PoseState {
  /** World aim direction (unit) or null. */
  aim: THREE.Vector3 | null;
  twoHanded: boolean;
  handsUp: number;
  crouch: number;
  flinch: number;
  /** Melee: kind and phase 0..1 (negative = none). */
  melee: 'punchR' | 'punchL' | 'kick' | 'swing' | null;
  meleePhase: number;
  block: number;
}

export function emptyPose(): PoseState {
  return { aim: null, twoHanded: true, handsUp: 0, crouch: 0, flinch: 0, melee: null, meleePhase: 0, block: 0 };
}

const _fwd = new THREE.Vector3();

export class CombatActor {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<Clip, THREE.AnimationAction>();
  private current: Clip | null = null;
  private fallback: Humanoid | null = null;
  readonly bones: BoneSet | null = null;
  /** Set while lying on the ground (dead or knocked out). */
  private downed = false;
  private oneShot = 0;

  constructor(outfit: ActorOutfit, female = false, seed = 0) {
    this.root.add(this.body);
    const model: PersonModel = female ? (['woman_casual', 'woman_tank', 'woman_jacket'] as PersonModel[])[seed % 3] : 'man';
    const src = ASSETS.people.get(model);
    if (src) {
      try {
        const obj = cloneSkinned(src.scene);
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        const s = HEIGHT / (box.max.y - box.min.y || 1);
        obj.scale.multiplyScalar(s);
        obj.position.y -= box.min.y * s;
        const colors: Record<string, string> = {
          shirt: outfit.shirt, lightjacket: outfit.shirt, jacket: outfit.accent ?? outfit.shirt, dress: outfit.shirt,
          pants: outfit.pants, skin: outfit.skin, hair: outfit.hair, hairbase: outfit.hair, eyebrows: outfit.hair,
          shoes: outfit.shoes ?? '#1b1b22', socks: '#222222',
        };
        obj.traverse((o) => {
          const mesh = o as THREE.SkinnedMesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.frustumCulled = false;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const next = mats.map((m) => {
            const key = (m.name || '').toLowerCase();
            return sharedMat(m, colors[key] ?? null, key);
          });
          mesh.material = Array.isArray(mesh.material) ? next : next[0];
        });
        this.body.add(obj);
        this.mixer = new THREE.AnimationMixer(obj);
        for (const [clip, re] of Object.entries(CLIPS) as [Clip, RegExp][]) {
          const a = src.animations.find((c) => re.test(c.name));
          if (!a) continue;
          const act = this.mixer.clipAction(a);
          if (clip === 'death' || clip === 'punch' || clip === 'slash') { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
          this.actions.set(clip, act);
        }
        this.bones = findBones(obj);
        this.play('idle', 0);
        this.mixer.update(seed * 0.37);
        return;
      } catch (err) {
        console.warn('[combat] actor model failed, using procedural', err);
      }
    }
    this.fallback = new Humanoid({ shirt: outfit.shirt, pants: outfit.pants, skin: outfit.skin, hair: outfit.hair, accent: outfit.accent, pattern: 'plain', hairStyle: 'short' });
    this.root.remove(this.body);
    this.root.add(this.fallback.root);
  }

  /** The group that carries yaw (rotation.y). */
  get yawNode(): THREE.Group { return this.fallback ? this.fallback.body : this.body; }

  private play(clip: Clip, fade = 0.2, timeScale = 1): void {
    const next = this.actions.get(clip) ?? this.actions.get('idle');
    if (!next) return;
    next.timeScale = timeScale;
    if (this.current === clip) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset().setEffectiveWeight(1).play();
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
    this.current = clip;
  }

  /** Fall to the ground (Death clip). */
  fall(): void {
    if (this.downed) return;
    this.downed = true;
    if (this.fallback) { this.fallback.body.rotation.x = -Math.PI / 2; this.fallback.root.position.y = 0.2; return; }
    this.play('death', 0.12);
  }

  /** Get back up from a knockout. */
  rise(): void {
    if (!this.downed) return;
    this.downed = false;
    if (this.fallback) { this.fallback.body.rotation.x = 0; this.fallback.root.position.y = 0; return; }
    this.play('idle', 0.6);
  }

  get isDown(): boolean { return this.downed; }

  /** Play the Punch clip once (enemy melee). */
  punch(): void {
    if (this.downed || !this.actions.has('punch')) return;
    this.oneShot = 0.75;
    this.current = null;
    this.play('punch', 0.08, 1.4);
  }

  update(dt: number, speed: number, pose: PoseState): void {
    if (this.fallback) {
      if (!this.downed) this.fallback.animate(dt, speed);
      return;
    }
    if (!this.mixer) return;
    if (!this.downed) {
      if (this.oneShot > 0) this.oneShot -= dt;
      else if (speed > 3.6) this.play('run', 0.2, Math.min(1.3, speed / 5.5));
      else if (speed > 0.25) this.play('walk', 0.2, Math.max(0.7, Math.min(1.5, speed / 1.6)));
      else this.play('idle', 0.25);
    }
    this.mixer.update(dt);
    const b = this.bones;
    if (!b || this.downed) return;
    _fwd.set(Math.sin(this.body.rotation.y), 0, Math.cos(this.body.rotation.y));
    if (pose.crouch > 0) {
      poseCrouch(b, _fwd, pose.crouch);
      this.body.position.y = -0.42 * pose.crouch;
    } else this.body.position.y = 0;
    if (pose.flinch > 0) poseFlinch(b, _fwd, pose.flinch);
    if (pose.handsUp > 0) poseHandsUp(b, _fwd, pose.handsUp);
    else if (pose.block > 0) poseBlock(b, _fwd, pose.block);
    else if (pose.melee === 'kick') poseKick(b, _fwd, pose.meleePhase);
    else if (pose.melee === 'swing') poseSwing(b, _fwd, pose.meleePhase);
    else if (pose.melee === 'punchR' || pose.melee === 'punchL') posePunch(b, _fwd, pose.meleePhase, pose.melee === 'punchL');
    else if (pose.aim) poseAim(b, pose.aim, 1, pose.twoHanded);
  }

  /** World position of the right hand (falls back to a point at chest height). */
  handPosition(out: THREE.Vector3): THREE.Vector3 {
    const h = this.bones?.handR;
    if (h && !this.fallback) return h.getWorldPosition(out);
    out.set(0.25, 1.25, 0.35).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yawNode.rotation.y).add(this.root.position);
    return out;
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}
