import * as THREE from 'three';
import { POSE_BONES, POSE_ORDER, poseTargets, type PoseBone, type PoseName, type PoseOptions } from './poses';

// Applies procedural poses on top of whatever the animation mixer (or the
// Humanoid's own cycle) produced this frame. Each pose has a weight that
// blends smoothly toward its target, so several systems can layer poses:
// movement drives crouch/swim/dive/climb/fall/parachute/tuck, combat drives
// 'aim' (applied last, it owns the arms).

export interface PoseBinding {
  bone: THREE.Object3D;
  /** Bone-local unit vector pointing from this joint toward the next one. */
  along: THREE.Vector3;
}

export type PoseBindings = Partial<Record<PoseBone, PoseBinding>>;

/** Extra per-call options: `phase`/`move` override the rig's own cycle (e.g. climb progress, flare amount). */
export interface RigPoseOptions extends PoseOptions {
  phase?: number;
  move?: number;
  /** Blend speed (1/s) toward the target weight. Default 9. */
  blend?: number;
}

const LEG_BONES: ReadonlySet<PoseBone> = new Set<PoseBone>(['legUL', 'legLL', 'legUR', 'legLR']);
const _qBody = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _qTarget = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _vT = new THREE.Vector3();
const _vC = new THREE.Vector3();

function worldRotation(o: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
  _m.extractRotation(o.matrixWorld);
  return out.setFromRotationMatrix(_m);
}

export class PoseLayer {
  private weights = new Map<PoseName, number>();
  private targets = new Map<PoseName, number>();
  private opts = new Map<PoseName, RigPoseOptions>();
  private phase = Math.random() * 6;
  /** Highest current leg-pose weight after the last apply (rigs with IK feet use it). */
  legWeight = 0;

  set(name: PoseName, weight = 1, opts?: RigPoseOptions): void {
    if (name === 'none') {
      for (const k of this.targets.keys()) this.targets.set(k, 0);
      return;
    }
    this.targets.set(name, Math.max(0, Math.min(1, weight)));
    if (opts) this.opts.set(name, opts);
    else this.opts.delete(name);
    if (!this.weights.has(name)) this.weights.set(name, 0);
  }

  /** Current blended weight of a pose. */
  weight(name: PoseName): number {
    return this.weights.get(name) ?? 0;
  }

  get active(): boolean {
    for (const w of this.weights.values()) if (w > 0.001) return true;
    for (const w of this.targets.values()) if (w > 0.001) return true;
    return false;
  }

  /** Advance blends and apply poses. Call after the base animation has posed the bones. */
  apply(dt: number, speed: number, root: THREE.Object3D, body: THREE.Object3D, bones: PoseBindings): boolean {
    this.legWeight = 0;
    if (!this.active) return false;
    const moving = Math.min(1, speed / 1.5);
    this.phase += dt * (speed > 0.15 ? 2.2 + speed * 2.6 : 2.6);
    let any = false;
    root.updateMatrixWorld(true);
    worldRotation(body, _qBody);
    for (const name of POSE_ORDER) {
      const target = this.targets.get(name) ?? 0;
      let w = this.weights.get(name) ?? 0;
      const o = this.opts.get(name);
      const rate = o?.blend ?? 9;
      w += (target - w) * Math.min(1, dt * rate);
      if (Math.abs(w - target) < 0.002) w = target;
      this.weights.set(name, w);
      if (w <= 0.001) continue;
      any = true;
      const t = poseTargets(name, o?.phase ?? this.phase, o?.move ?? moving, o);
      for (const key of POSE_BONES) {
        const dir = t[key];
        const b = bones[key];
        if (!dir || !b) continue;
        aimBone(b, dir[0], dir[1], dir[2], w);
        if (LEG_BONES.has(key) && w > this.legWeight) this.legWeight = w;
      }
    }
    return any;
  }
}

/** Rotate `b.bone` (minimal arc, keeping its animated twist) so it points along body-space (x,y,z), blended by w. */
function aimBone(b: PoseBinding, x: number, y: number, z: number, w: number): void {
  const bone = b.bone;
  const parent = bone.parent;
  if (!parent) return;
  worldRotation(parent, _qParent).invert();
  _vT.set(x, y, z).applyQuaternion(_qBody).applyQuaternion(_qParent).normalize();
  _vC.copy(b.along).applyQuaternion(bone.quaternion).normalize();
  _qDelta.setFromUnitVectors(_vC, _vT);
  _qTarget.copy(bone.quaternion).premultiply(_qDelta);
  bone.quaternion.slerp(_qTarget, w);
  bone.updateMatrixWorld(true);
}
