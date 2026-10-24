import * as THREE from 'three';
import type { Vehicle } from '../../vehicles/Vehicle';
import type { Ped } from '../../actors/Pedestrians';
import type { HitPart } from './weapons';

// Ray tests against things that are not collision boxes: pedestrians,
// vehicles (oriented boxes) and registered shootables. Allocation-free.

export interface Shootable {
  readonly pos: THREE.Vector3;
  /** Sphere center height above pos and radius. */
  readonly height: number;
  readonly radius: number;
  alive(): boolean;
  onHit(damage: number, lethal: boolean, point: THREE.Vector3): void;
  readonly tag: string;
}

const STAND: [number, number, HitPart][] = [[1.63, 0.13, 'head'], [1.3, 0.24, 'body'], [1.0, 0.23, 'body'], [0.6, 0.2, 'limb'], [0.25, 0.18, 'limb']];

export function raySphere(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number): number {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : Infinity;
}

/** Standing humanoid at p: returns distance and part, writing into out. */
export function rayHumanoid(o: THREE.Vector3, d: THREE.Vector3, p: THREE.Vector3, maxT: number, out: { t: number; part: HitPart }): boolean {
  // quick reject with a bounding sphere
  if (raySphere(o, d, p.x, p.y + 0.9, p.z, 1.0) > maxT) return false;
  let hit = false;
  for (const [h, r, part] of STAND) {
    const t = raySphere(o, d, p.x, p.y + h, p.z, r);
    if (t < maxT && t < (hit ? out.t : Infinity)) { out.t = t; out.part = part; hit = true; }
  }
  return hit;
}

export function pedHit(o: THREE.Vector3, d: THREE.Vector3, peds: readonly Ped[], maxT: number, skip: (p: Ped) => boolean, out: { t: number; part: HitPart; ped: Ped | null }): boolean {
  let best = maxT;
  out.ped = null;
  const tmp = { t: 0, part: 'body' as HitPart };
  for (const p of peds) {
    if (!p.rig.root.visible || skip(p)) continue;
    if (rayHumanoid(o, d, p.pos, best, tmp)) { best = tmp.t; out.t = tmp.t; out.part = tmp.part; out.ped = p; }
  }
  return out.ped !== null;
}

export type VehiclePart = 'body' | 'tire' | 'engine';

export function vehicleHeight(v: Vehicle): number {
  const k = v.def.kind;
  return k === 'van' ? 2.3 : k === 'bike' ? 1.2 : k === 'boat' ? 1.4 : k === 'pickup' || k === 'shield' ? 1.75 : 1.45;
}

/** Ray vs a vehicle's oriented box. Returns t (Infinity on miss) and writes the part / tire index. */
export function rayVehicle(o: THREE.Vector3, d: THREE.Vector3, v: Vehicle, out: { part: VehiclePart; tire: number }): number {
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  const rx = o.x - v.position.x, ry = o.y - v.position.y, rz = o.z - v.position.z;
  const lox = rx * c - rz * s, loz = rx * s + rz * c;
  const ldx = d.x * c - d.z * s, ldz = d.x * s + d.z * c;
  const hw = v.def.width / 2, hl = v.def.length / 2, h = vehicleHeight(v);
  let tmin = 0, tmax = Infinity;
  const slab = (o0: number, d0: number, lo: number, hi: number): boolean => {
    if (Math.abs(d0) < 1e-9) return o0 >= lo && o0 <= hi;
    let t1 = (lo - o0) / d0, t2 = (hi - o0) / d0;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    return tmin <= tmax;
  };
  if (!slab(lox, ldx, -hw, hw) || !slab(ry, d.y, 0.15, h) || !slab(loz, ldz, -hl, hl)) return Infinity;
  if (tmin <= 0) return Infinity;
  const lx = lox + ldx * tmin, ly = ry + d.y * tmin, lz = loz + ldz * tmin;
  out.tire = -1;
  if (ly < 0.7 && Math.abs(lz) > hl * 0.45 && Math.abs(lx) > hw * 0.55) {
    out.part = 'tire';
    out.tire = (lz > 0 ? 0 : 2) + (lx > 0 ? 0 : 1);
  } else if (lz > hl * 0.5) out.part = 'engine';
  else out.part = 'body';
  return tmin;
}

/** Distance from point p to the ray segment o + d*[0, len]. */
export function pointRayDistance(p: THREE.Vector3, o: THREE.Vector3, d: THREE.Vector3, len: number): number {
  const px = p.x - o.x, py = p.y - o.y, pz = p.z - o.z;
  const t = Math.max(0, Math.min(len, px * d.x + py * d.y + pz * d.z));
  const qx = px - d.x * t, qy = py - d.y * t, qz = pz - d.z * t;
  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Random direction inside a cone of half-angle `spread` around `dir` (written to out). */
export function coneDirection(dir: THREE.Vector3, spread: number, out: THREE.Vector3, rnd: () => number = Math.random): THREE.Vector3 {
  if (spread <= 0) return out.copy(dir);
  _a.set(0, 1, 0);
  if (Math.abs(dir.y) > 0.95) _a.set(1, 0, 0);
  _b.crossVectors(dir, _a).normalize();
  _a.crossVectors(_b, dir).normalize();
  const r = Math.sqrt(rnd()) * Math.tan(spread);
  const th = rnd() * Math.PI * 2;
  out.copy(dir).addScaledVector(_b, Math.cos(th) * r).addScaledVector(_a, Math.sin(th) * r).normalize();
  return out;
}
