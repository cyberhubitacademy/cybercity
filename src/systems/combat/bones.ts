import * as THREE from 'three';

// Procedural pose layer on top of skinned animation: point a bone chain along
// a world direction after the mixer has posed the skeleton. Works for any rig
// orientation because it measures each bone's own bone->child axis.

export interface Limb {
  bone: THREE.Object3D;
  /** Unit vector from this bone to its child, in the bone's local space. */
  axis: THREE.Vector3;
}

export interface BoneSet {
  armR: Limb | null; foreR: Limb | null; handR: THREE.Object3D | null;
  armL: Limb | null; foreL: Limb | null; handL: THREE.Object3D | null;
  legR: Limb | null; shinR: Limb | null; legL: Limb | null; shinL: Limb | null;
  torso: Limb | null; head: THREE.Object3D | null;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _v = new THREE.Vector3();

function find(root: THREE.Object3D, re: RegExp): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => { if (!hit && (o as THREE.Bone).isBone && re.test(o.name)) hit = o; });
  return hit;
}

function limb(root: THREE.Object3D, re: RegExp, child: RegExp): Limb | null {
  const bone = find(root, re);
  if (!bone) return null;
  const c = bone.children.find((k) => child.test(k.name)) ?? bone.children[0];
  if (!c || c.position.lengthSq() < 1e-10) return null;
  return { bone, axis: c.position.clone().normalize() };
}

/** Find the Quaternius humanoid bones (GLTFLoader strips the dots: "UpperArm.R" -> "UpperArmR"). */
export function findBones(root: THREE.Object3D): BoneSet {
  return {
    armR: limb(root, /^UpperArm\.?R$/, /^LowerArm\.?R$/),
    foreR: limb(root, /^LowerArm\.?R$/, /^Palm\.?R$/),
    handR: find(root, /^Palm\.?R$/),
    armL: limb(root, /^UpperArm\.?L$/, /^LowerArm\.?L$/),
    foreL: limb(root, /^LowerArm\.?L$/, /^Palm\.?L$/),
    handL: find(root, /^Palm\.?L$/),
    legR: limb(root, /^UpperLeg\.?R$/, /^LowerLeg\.?R$/),
    shinR: limb(root, /^LowerLeg\.?R$/, /^(LowerLeg\.?R_end|Foot\.?R)$/),
    legL: limb(root, /^UpperLeg\.?L$/, /^LowerLeg\.?L$/),
    shinL: limb(root, /^LowerLeg\.?L$/, /^(LowerLeg\.?L_end|Foot\.?L)$/),
    torso: limb(root, /^Torso$/, /^Neck$/),
    head: find(root, /^Head$/),
  };
}

/** Rotate a bone so its bone->child axis points along worldDir (unit), blended by weight. */
export function pointLimb(l: Limb | null, worldDir: THREE.Vector3, weight: number): void {
  if (!l || weight <= 0.001) return;
  const b = l.bone;
  b.updateWorldMatrix(true, false);
  b.getWorldQuaternion(_q);
  _v.copy(l.axis).applyQuaternion(_q);
  _q2.setFromUnitVectors(_v, worldDir).multiply(_q); // desired world rotation
  if (b.parent) {
    b.parent.getWorldQuaternion(_pq);
    _q2.premultiply(_pq.invert());
  }
  if (weight >= 0.999) b.quaternion.copy(_q2);
  else b.quaternion.slerp(_q2, weight);
  b.updateMatrixWorld(true);
}

const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();

/** Both arms forward along aimDir (two-handed grip). */
export function poseAim(b: BoneSet, aimDir: THREE.Vector3, w: number, twoHanded = true): void {
  pointLimb(b.armR, aimDir, w);
  pointLimb(b.foreR, aimDir, w);
  if (twoHanded) {
    // left arm reaches across to the support hand
    _dir.copy(aimDir).multiplyScalar(0.9);
    _right.crossVectors(aimDir, _up).normalize();
    _dir.addScaledVector(_right, 0.38).normalize();
    pointLimb(b.armL, _dir, w);
    _dir.copy(aimDir).addScaledVector(_right, 0.15).normalize();
    pointLimb(b.foreL, _dir, w);
  }
}

/** Hands up (surrender / intimidated). */
export function poseHandsUp(b: BoneSet, forward: THREE.Vector3, w: number): void {
  _dir.set(0, 1, 0).addScaledVector(forward, 0.25).normalize();
  _right.crossVectors(forward, _up).normalize();
  _fwd.copy(_dir).addScaledVector(_right, 0.5).normalize();
  pointLimb(b.armR, _fwd, w);
  pointLimb(b.foreR, _dir, w);
  _fwd.copy(_dir).addScaledVector(_right, -0.5).normalize();
  pointLimb(b.armL, _fwd, w);
  pointLimb(b.foreL, _dir, w);
}

/** Straight punch (right or left) at phase 0..1. */
export function posePunch(b: BoneSet, forward: THREE.Vector3, phase: number, left: boolean): void {
  const w = Math.sin(Math.PI * Math.min(1, Math.max(0, phase)));
  _dir.copy(forward).addScaledVector(_up, 0.12).normalize();
  if (left) { pointLimb(b.armL, _dir, w); pointLimb(b.foreL, _dir, w); }
  else { pointLimb(b.armR, _dir, w); pointLimb(b.foreR, _dir, w); }
}

/** Front kick with the right leg at phase 0..1. */
export function poseKick(b: BoneSet, forward: THREE.Vector3, phase: number): void {
  const w = Math.sin(Math.PI * Math.min(1, Math.max(0, phase)));
  _dir.copy(forward).multiplyScalar(0.95).addScaledVector(_up, -0.15).normalize();
  pointLimb(b.legR, _dir, w);
  pointLimb(b.shinR, _dir, w);
}

/** Overhead swing (bat/knife): arm sweeps from raised-back to forward-down. */
export function poseSwing(b: BoneSet, forward: THREE.Vector3, phase: number): void {
  const p = Math.min(1, Math.max(0, phase));
  const w = Math.sin(Math.PI * p);
  const a = -0.9 + p * 2.0; // angle from up/back to forward/down
  _dir.copy(_up).multiplyScalar(Math.cos(a)).addScaledVector(forward, Math.sin(a) + 0.2).normalize();
  pointLimb(b.armR, _dir, w);
  pointLimb(b.foreR, _dir, w);
}

/** Crouch: thighs forward, shins down, slight lean. Caller lowers the root. */
export function poseCrouch(b: BoneSet, forward: THREE.Vector3, w: number): void {
  _dir.copy(forward).multiplyScalar(0.8).addScaledVector(_up, -0.6).normalize();
  pointLimb(b.legR, _dir, w);
  pointLimb(b.legL, _dir, w);
  _dir.copy(forward).multiplyScalar(-0.35).addScaledVector(_up, -0.94).normalize();
  pointLimb(b.shinR, _dir, w);
  pointLimb(b.shinL, _dir, w);
  _dir.copy(_up).addScaledVector(forward, 0.35).normalize();
  pointLimb(b.torso, _dir, w * 0.8);
}

/** Lean the torso back (hit reaction) by amount 0..1. */
export function poseFlinch(b: BoneSet, forward: THREE.Vector3, amount: number): void {
  if (amount <= 0.01) return;
  _dir.copy(_up).addScaledVector(forward, -0.55 * amount).normalize();
  pointLimb(b.torso, _dir, Math.min(1, amount));
}

/** Block: forearms up in front of the face. */
export function poseBlock(b: BoneSet, forward: THREE.Vector3, w: number): void {
  _right.crossVectors(forward, _up).normalize();
  _dir.copy(forward).multiplyScalar(0.6).addScaledVector(_up, -0.2).addScaledVector(_right, 0.3).normalize();
  pointLimb(b.armR, _dir, w);
  _dir.copy(_up).addScaledVector(forward, 0.3).addScaledVector(_right, -0.4).normalize();
  pointLimb(b.foreR, _dir, w);
  _dir.copy(forward).multiplyScalar(0.6).addScaledVector(_up, -0.2).addScaledVector(_right, -0.3).normalize();
  pointLimb(b.armL, _dir, w);
  _dir.copy(_up).addScaledVector(forward, 0.3).addScaledVector(_right, 0.4).normalize();
  pointLimb(b.foreL, _dir, w);
}
