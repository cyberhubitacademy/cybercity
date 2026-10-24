// Boids-lite fish schools: each school's center wanders around a home spot;
// fish steer toward their slot in the formation, keep apart from neighbors
// and scatter away from a nearby diver. Pure math, no three.js.

import { WATER_Y } from './physics';

export type FishQuality = 'low' | 'medium' | 'high' | 'ultra';

/** Total fish by graphics quality. */
export const FISH_COUNTS: Record<FishQuality, number> = { low: 36, medium: 80, high: 140, ultra: 220 };

export interface FishAgent {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Slot offset in the formation. */
  ox: number; oy: number; oz: number;
  scale: number;
}

export interface School {
  hx: number; hz: number;
  cx: number; cy: number; cz: number;
  phase: number;
  radius: number;
  speed: number;
  model: number;
  fish: FishAgent[];
  floor: (x: number, z: number) => number;
}

const MAX_SPEED = 3.6;
const MIN_SPEED = 0.6;

/** Advance one school. `diver` (if any) scares nearby fish. */
export function stepSchool(s: School, dt: number, time: number, diver: { x: number; y: number; z: number } | null): void {
  const a = time * s.speed + s.phase;
  s.cx = s.hx + Math.cos(a) * s.radius;
  s.cz = s.hz + Math.sin(a * 0.8) * s.radius * 0.7;
  const floor = s.floor(s.cx, s.cz);
  const mid = (floor + WATER_Y) / 2;
  s.cy = Math.max(floor + 1.2, Math.min(WATER_Y - 1.2, mid + Math.sin(a * 1.7) * 1.5));
  // Formation rotates with the travel direction.
  const hx = -Math.sin(a), hz = Math.cos(a * 0.8) * 0.8;
  const hl = Math.hypot(hx, hz) || 1;
  const fx = hx / hl, fz = hz / hl;
  const n = s.fish.length;
  for (let i = 0; i < n; i++) {
    const f = s.fish[i];
    // slot: offset in the school's heading frame
    const tx = s.cx + f.ox * fz + f.oz * fx;
    const tz = s.cz - f.ox * fx + f.oz * fz;
    const ty = s.cy + f.oy;
    let ax = (tx - f.x) * 1.4 + fx * 1.2;
    let ay = (ty - f.y) * 1.4;
    let az = (tz - f.z) * 1.4 + fz * 1.2;
    // separation from neighbors in the list (cheap, good enough)
    for (let k = -1; k <= 2; k++) {
      if (k === 0) continue;
      const o = s.fish[(i + k + n) % n];
      if (o === f) continue;
      const dx = f.x - o.x, dy = f.y - o.y, dz = f.z - o.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 0.36 && d2 > 1e-6) { const w = (0.36 - d2) * 12; ax += dx * w; ay += dy * w; az += dz * w; }
    }
    if (diver) {
      const dx = f.x - diver.x, dy = f.y - (diver.y + 1), dz = f.z - diver.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 25 && d2 > 1e-6) { const k = (25 - d2) * 0.9 / Math.sqrt(d2); ax += dx * k; ay += dy * k * 0.5; az += dz * k; }
    }
    f.vx += ax * dt; f.vy += ay * dt; f.vz += az * dt;
    let sp = Math.hypot(f.vx, f.vy, f.vz);
    if (sp > MAX_SPEED) { const k = MAX_SPEED / sp; f.vx *= k; f.vy *= k; f.vz *= k; sp = MAX_SPEED; }
    if (sp < MIN_SPEED) { const k = MIN_SPEED / (sp || 1); f.vx = (f.vx || fx) * k; f.vy *= k; f.vz = (f.vz || fz) * k; }
    f.vy *= 0.96;
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    const fl = s.floor(f.x, f.z) + 0.4;
    if (f.y < fl) { f.y = fl; f.vy = Math.abs(f.vy); }
    if (f.y > WATER_Y - 0.4) { f.y = WATER_Y - 0.4; f.vy = -Math.abs(f.vy); }
  }
}
