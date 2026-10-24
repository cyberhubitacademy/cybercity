// Helpers for working with the player's rig from the outside (no edits to
// CharacterModel): bone lookup, bone-local frames measured from skin weights
// (for hats, beards, tattoos), body-shape scaling, procedural pose offsets,
// material recolors and generated UVs for patterned clothes.
import * as THREE from 'three';
import type { Rig } from '../../actors/CharacterModel';

export function findBone(root: THREE.Object3D, name: string): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Bone).isBone && o.name === name) found = o as THREE.Bone;
  });
  return found;
}

export function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh); });
  return out;
}

export function materialsNamed(root: THREE.Object3D, names: string[]): THREE.MeshStandardMaterial[] {
  const want = new Set(names.map((n) => n.toLowerCase()));
  const out: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) if (want.has((mat.name || '').toLowerCase())) out.push(mat as THREE.MeshStandardMaterial);
  });
  return out;
}

export function meshesWithMaterial(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const n = name.toLowerCase();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    if ((m.material.name || '').toLowerCase() === n) out.push(m);
  });
  return out;
}

/** A bone-local coordinate frame measured from the vertices skinned to it. */
export interface BoneFrame {
  bone: THREE.Bone;
  /** Vertex centroid in bone space. */
  center: THREE.Vector3;
  /** Unit axes (bone space): right, up (character up at rest), forward (facing). */
  right: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
  /** Extents along right/up/forward (half sizes) in bone units. */
  half: THREE.Vector3;
  /** Bone units per meter (to size accessories authored in meters). */
  unitsPerMeter: number;
  /** Basis matrix mapping canonical (x right, y up, z forward) into bone space. */
  basis: THREE.Matrix4;
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Measure a bone frame from rest-pose vertices weighted (> minWeight) to `boneName`.
 * `forwardHint` / `upHint` are character-space (root) directions.
 */
export function measureBone(rig: Rig, boneName: string, opts: { minWeight?: number; meshes?: string[] } = {}): BoneFrame | null {
  const meshes = skinnedMeshes(rig.root).filter((m) => !opts.meshes || opts.meshes.includes(((m.material as THREE.Material).name || '').toLowerCase()));
  if (!meshes.length) return null;
  const sk = meshes[0].skeleton;
  const bi = sk.bones.findIndex((b) => b.name === boneName);
  if (bi < 0) return null;
  const bone = sk.bones[bi];
  const pts: THREE.Vector3[] = [];
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!pos || !si || !sw) continue;
    const toBone = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[bi], mesh.bindMatrix);
    for (let i = 0; i < pos.count; i++) {
      for (let k = 0; k < 4; k++) {
        if (si.getComponent(i, k) === bi && sw.getComponent(i, k) > (opts.minWeight ?? 0.5)) {
          pts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(toBone));
          break;
        }
      }
    }
  }
  if (pts.length < 6) return null;
  // Character up/forward in bone space at rest: take the current world-space
  // directions of the character root and map them through the bone's rest
  // world matrix (bind matrix inverse of boneInverse).
  const mesh = meshes[0];
  rig.root.updateMatrixWorld(true);
  const restBoneWorld = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[bi]).invert().premultiply(mesh.matrixWorld);
  const inv = _m.copy(restBoneWorld).invert();
  const yaw = rig.body.rotation.y;
  const fwdW = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const upW = new THREE.Vector3(0, 1, 0);
  const dir = (w: THREE.Vector3) => w.clone().transformDirection(inv);
  const up = dir(upW).normalize();
  const forward = dir(fwdW).normalize();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  forward.crossVectors(right, up).normalize();
  const center = new THREE.Vector3();
  for (const p of pts) center.add(p);
  center.divideScalar(pts.length);
  const half = new THREE.Vector3();
  for (const p of pts) {
    _v.subVectors(p, center);
    half.x = Math.max(half.x, Math.abs(_v.dot(right)));
    half.y = Math.max(half.y, Math.abs(_v.dot(up)));
    half.z = Math.max(half.z, Math.abs(_v.dot(forward)));
  }
  // meters: bone space -> world scale
  const s = new THREE.Vector3();
  restBoneWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  const unitsPerMeter = 1 / (s.x || 1);
  const basis = new THREE.Matrix4().makeBasis(right, up, forward);
  return { bone, center, right, up, forward, half, unitsPerMeter, basis };
}

/**
 * Attach `obj` (authored in meters, canonical frame: +x right, +y up, +z forward,
 * origin at the bone's vertex centroid) to a measured bone frame.
 */
export function attachToFrame(f: BoneFrame, obj: THREE.Object3D, offsetMeters = new THREE.Vector3()): THREE.Group {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const u = f.unitsPerMeter;
  const off = new THREE.Vector3()
    .addScaledVector(f.right, offsetMeters.x * u)
    .addScaledVector(f.up, offsetMeters.y * u)
    .addScaledVector(f.forward, offsetMeters.z * u);
  g.matrix.copy(f.basis).scale(new THREE.Vector3(u, u, u)).setPosition(f.center.clone().add(off));
  g.add(obj);
  f.bone.add(g);
  return g;
}

/** Generate a simple cylindrical UV set (u around the body, v up) so patterns can map. */
export function ensureUVs(mesh: THREE.Mesh, repeat = 1): void {
  const g0 = mesh.geometry;
  if (g0.attributes.uv && g0.userData.lfUV) return;
  const g = g0.clone();
  g.userData.lfUV = true;
  const pos = g.attributes.position;
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  // vertical axis = the largest extent
  const ax = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
  const c = new THREE.Vector3();
  bb.getCenter(c);
  const uv = new Float32Array(pos.count * 2);
  const comp = (i: number, a: number) => (a === 0 ? pos.getX(i) : a === 1 ? pos.getY(i) : pos.getZ(i));
  const cc = [c.x, c.y, c.z];
  const lo = [bb.min.x, bb.min.y, bb.min.z][ax];
  const span = [size.x, size.y, size.z][ax] || 1;
  for (let i = 0; i < pos.count; i++) {
    const p1 = comp(i, a1) - cc[a1], p2 = comp(i, a2) - cc[a2];
    uv[i * 2] = (Math.atan2(p1, p2) / (Math.PI * 2) + 0.5) * 3 * repeat;
    uv[i * 2 + 1] = ((comp(i, ax) - lo) / span) * 4 * repeat;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry = g;
}

// ---------------------------------------------------------------- pose overrides

/** Additive Euler offsets (radians) applied to bones after the mixer runs. */
export type PoseOffsets = Partial<Record<string, [number, number, number]>>;

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class RigPoser {
  private bones = new Map<string, THREE.Bone>();
  private baseScale = new Map<string, THREE.Vector3>();
  constructor(readonly rig: Rig) {
    rig.root.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        this.bones.set(o.name, o as THREE.Bone);
        this.baseScale.set(o.name, o.scale.clone());
      }
    });
  }
  bone(name: string): THREE.Bone | undefined {
    return this.bones.get(name);
  }
  get hasBones(): boolean {
    return this.bones.size > 0;
  }
  /** Rotate bones by local-space euler offsets (call after rig.animate). */
  apply(off: PoseOffsets, weight = 1): void {
    for (const [name, r] of Object.entries(off)) {
      const b = this.bones.get(name);
      if (!b || !r) continue;
      _e.set(r[0] * weight, r[1] * weight, r[2] * weight);
      _q.setFromEuler(_e);
      b.quaternion.multiply(_q);
    }
  }
  /** Bulk-scale a bone across its two non-length axes (bones extend along local Y). */
  thicken(name: string, k: number, compensateChild?: string): void {
    const b = this.bones.get(name);
    const base = this.baseScale.get(name);
    if (!b || !base) return;
    b.scale.set(base.x * k, base.y, base.z * k);
    if (compensateChild) {
      const c = this.bones.get(compensateChild);
      const cb = this.baseScale.get(compensateChild);
      if (c && cb) c.scale.set(cb.x / k, cb.y, cb.z / k);
    }
  }
}

/** World position of a bone (e.g. the right hand for a fishing rod). */
export function boneWorld(rig: Rig, name: string, out: THREE.Vector3): THREE.Vector3 {
  const b = findBoneCached(rig, name);
  if (b) return b.getWorldPosition(out);
  return out.copy(rig.root.position).add(new THREE.Vector3(0, 1.2, 0));
}

const boneCache = new WeakMap<Rig, Map<string, THREE.Bone | null>>();
export function findBoneCached(rig: Rig, name: string): THREE.Bone | null {
  let m = boneCache.get(rig);
  if (!m) boneCache.set(rig, (m = new Map()));
  if (!m.has(name)) m.set(name, findBone(rig.root, name));
  return m.get(name) ?? null;
}
