// Pure movement math for Rico: terrain under the beach/sea, breath, fall
// damage, obstacle (vault/climb) detection on collision boxes, freefall and
// parachute flight, and slow stat growth. No three.js here so it is unit-tested.

import { BEACH_X, HARBOR_Z, SHORE_X } from '../../world/layout';
import type { Box } from '../../world/Collision';

export const WATER_Y = -0.35;
/** Root (feet) height while swimming at the surface (head just above water). */
export const SWIM_ROOT_Y = WATER_Y - 1.3;
/** Water depth (surface minus ground) at which Rico starts / stops swimming. */
export const SWIM_ENTER_DEPTH = 1.35;
export const SWIM_EXIT_DEPTH = 1.15;
/** Height above ground at which a fall becomes a skydive (freefall pose, parachute). */
export const FREEFALL_HEIGHT = 12;

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);

// ---------------------------------------------------------------- terrain

/** Same formula as the beach sand mesh in City.ts (sand slopes into the sea). */
export function sandHeight(x: number, z: number): number {
  const distShore = Math.max(x - (SHORE_X - 14), z - (HARBOR_Z - 6));
  let y = 0.06 + Math.sin(x * 0.08) * Math.cos(z * 0.05) * 0.18;
  if (distShore > 0) y -= distShore * 0.09;
  return y;
}

/** Natural ground height (no buildings): land 0, beach sand, sea floor. */
export function terrainHeight(x: number, z: number): number {
  if (x < BEACH_X - 3) {
    if (z > HARBOR_Z) return -7 + Math.sin(x * 0.11) * Math.cos(z * 0.17) * 0.6; // dredged harbor basin
    return 0;
  }
  const s = sandHeight(x, z);
  const floor = -13 + Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.9 + Math.sin(x * 0.031 + z * 0.027) * 1.4;
  return Math.max(s, floor);
}

export function waterDepth(groundY: number): number {
  return WATER_Y - groundY;
}

// ---------------------------------------------------------------- breath

export interface Breath {
  /** Seconds of air left. */
  air: number;
  /** Lung capacity in seconds. */
  capacity: number;
  /** Seconds spent with empty lungs (drowning). */
  drowning: number;
}

/** Lung capacity in seconds for a lung stat 0..100 (15 s untrained, 60 s maxed). */
export function lungCapacity(lungStat: number): number {
  return 15 + 45 * clamp01(lungStat / 100);
}

export const DROWN_DPS = 9;

/**
 * Advance breath. Returns drowning damage for this step (hp, fractional).
 * Underwater drains 1 air/s (1.6 when fast-swimming); scuba never drains.
 * At the surface lungs refill in about 4 seconds.
 */
export function stepBreath(b: Breath, dt: number, submerged: boolean, fast: boolean, scuba: boolean): number {
  if (submerged && !scuba) {
    b.air -= dt * (fast ? 1.6 : 1);
    if (b.air <= 0) {
      b.air = 0;
      b.drowning += dt;
      return DROWN_DPS * dt * (1 + Math.min(2, b.drowning / 5));
    }
    return 0;
  }
  b.drowning = 0;
  b.air = Math.min(b.capacity, b.air + dt * Math.max(6, b.capacity / 4));
  return 0;
}

// ---------------------------------------------------------------- falling

export type LandingKind = 'soft' | 'roll' | 'hard' | 'tumble';

/** How Rico lands after dropping `height` meters while moving at `horizSpeed`. */
export function landingKind(height: number, horizSpeed: number): LandingKind {
  if (height < 1.8) return 'soft';
  if (height < 3.5) return horizSpeed > 2.2 ? 'roll' : 'soft';
  if (height < 7) return horizSpeed > 2.2 ? 'roll' : 'hard';
  if (height < 9) return 'hard';
  return 'tumble';
}

/** Health lost when landing on solid ground after a drop of `height` meters (100 = dead). */
export function fallDamage(height: number, rolled = false): number {
  if (height <= 3) return 0;
  const d = Math.pow((height - 3) / 13, 1.5) * 100;
  return Math.round(rolled ? d * 0.5 : d);
}

/** Health lost hitting the water from `height` meters (dives from the pier are free). */
export function waterImpactDamage(height: number): number {
  return height <= 24 ? 0 : Math.round((height - 24) * 2.4);
}

// ---------------------------------------------------------------- obstacles

export interface Obstacle {
  kind: 'vault' | 'climb';
  /** Height of the obstacle top above the feet. */
  height: number;
  /** Top surface y. */
  top: number;
  /** Distance from the player center to the obstacle face. */
  dist: number;
  /** Thickness of the obstacle along the probe direction. */
  thickness: number;
  /** Where the feet end up (vault: beyond the obstacle, climb: on top). */
  landX: number;
  landZ: number;
}

export const VAULT_MIN = 0.4;
export const VAULT_MAX = 1.25;
export const CLIMB_MAX = 2.45;

/** Entry/exit distance of a 2D ray against a box footprint, or null. */
function rayFootprint(x: number, z: number, dx: number, dz: number, b: Box): [number, number] | null {
  let t0 = -Infinity, t1 = Infinity;
  if (Math.abs(dx) < 1e-9) { if (x < b.x0 || x > b.x1) return null; } else {
    let a = (b.x0 - x) / dx, c = (b.x1 - x) / dx;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
  }
  if (Math.abs(dz) < 1e-9) { if (z < b.z0 || z > b.z1) return null; } else {
    let a = (b.z0 - z) / dz, c = (b.z1 - z) / dz;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
  }
  if (t0 > t1) return null;
  return [t0, t1];
}

/** Is the space for a standing body at (x, z) from y up to y+h free of boxes? */
function clearAt(boxes: readonly Box[], x: number, z: number, y: number, h: number, r = 0.3): boolean {
  for (const b of boxes) {
    if (x + r < b.x0 || x - r > b.x1 || z + r < b.z0 || z - r > b.z1) continue;
    if (b.y1 > y + 0.05 && b.y0 < y + h) return false;
  }
  return true;
}

/**
 * Probe forward from feet (x, y, z) along unit (dx, dz) for something to
 * vault over (0.4–1.25 m, thin, clear behind) or climb onto (up to 2.45 m,
 * with room to stand on top). `reach` is how far ahead the face may be.
 */
export function detectObstacle(
  boxes: readonly Box[], x: number, y: number, z: number, dx: number, dz: number, reach = 1.0, radius = 0.38,
): Obstacle | null {
  let best: Box | null = null, bt0 = Infinity, bt1 = 0;
  for (const b of boxes) {
    if (b.y1 <= y + 0.3) continue; // a step, not an obstacle
    if (b.y0 > y + 1.2) continue; // overhead (railing above a deck, awning)
    const hit = rayFootprint(x, z, dx, dz, b);
    if (!hit) continue;
    const [t0, t1] = hit;
    if (t1 < 0 || t0 > reach + radius || t0 < -radius * 0.5) continue;
    if (t0 < bt0) { bt0 = t0; bt1 = t1; best = b; }
  }
  if (!best) return null;
  // The tallest box sharing this face decides the real top (stacked colliders).
  let top = best.y1;
  const fx = x + dx * (bt0 + 0.05), fz = z + dz * (bt0 + 0.05);
  for (const b of boxes) {
    if (b === best) continue;
    if (fx < b.x0 - 0.02 || fx > b.x1 + 0.02 || fz < b.z0 - 0.02 || fz > b.z1 + 0.02) continue;
    if (b.y0 <= top + 0.05 && b.y1 > top && b.y0 < y + 1.2) top = b.y1;
  }
  const height = top - y;
  if (height < VAULT_MIN - 0.05 || height > CLIMB_MAX) return null;
  const thickness = bt1 - bt0;
  if (height <= VAULT_MAX && thickness <= 1.6) {
    const lx = x + dx * (bt1 + 0.7), lz = z + dz * (bt1 + 0.7);
    if (clearAt(boxes, lx, lz, y, 1.6)) return { kind: 'vault', height, top, dist: bt0, thickness, landX: lx, landZ: lz };
  }
  if (thickness >= 0.45) {
    const into = Math.min(thickness * 0.5, 0.75);
    const lx = x + dx * (bt0 + into), lz = z + dz * (bt0 + into);
    if (clearAt(boxes, lx, lz, top, 1.7, 0.25)) return { kind: 'climb', height, top, dist: bt0, thickness, landX: lx, landZ: lz };
  }
  return null;
}

// ---------------------------------------------------------------- skydiving

export interface FlightState {
  /** Horizontal airspeed along yaw (m/s). */
  speed: number;
  /** Vertical speed (m/s, negative = down). */
  vy: number;
  yaw: number;
  /** Visual bank (rad), follows turning. */
  bank: number;
  /** Canopy deployment 0..1 (parachute only). */
  open: number;
}

export interface FlightInput {
  /** -1 (S, brake) .. 1 (W, dive / accelerate). */
  fwd: number;
  /** -1 .. 1 (positive turns toward +yaw). */
  turn: number;
  /** Parachute flare (Space held). */
  flare?: boolean;
}

export const GRAVITY = 18;

/** Freefall: gravity with drag to a ~45 m/s terminal speed (52 head-down), steerable glide. */
export function stepFreefall(s: FlightState, inp: FlightInput, dt: number): void {
  const vt = 45 + Math.max(0, inp.fwd) * 7;
  s.vy += (-GRAVITY + GRAVITY * (s.vy * s.vy) / (vt * vt) * Math.sign(-s.vy)) * dt;
  if (s.vy < -vt * 1.05) s.vy = -vt * 1.05;
  const target = 4 + inp.fwd * 10;
  s.speed += (Math.max(0, target) - s.speed) * Math.min(1, dt * 0.8);
  s.yaw += inp.turn * 1.6 * dt;
  s.bank += (inp.turn * 0.6 - s.bank) * Math.min(1, dt * 4);
}

/** Open parachute: opening shock, ~9 m/s glide, ~4.5 m/s sink, W/S trim, A/D turns, Space flares. */
export function stepParachute(s: FlightState, inp: FlightInput, dt: number): void {
  s.open = Math.min(1, s.open + dt / 1.1);
  const turn = clamp(inp.turn, -1, 1);
  let targetSpeed = 9 + inp.fwd * 3;
  let sink = 4.4 + inp.fwd * 1.3 + Math.abs(turn) * 1.1;
  if (inp.flare) { targetSpeed = 3.5; sink = 1.1; }
  const k = 1.2 + s.open * 3;
  s.vy += (-sink - s.vy) * Math.min(1, dt * k);
  s.speed += (targetSpeed * s.open - s.speed) * Math.min(1, dt * (inp.flare ? 2.5 : 1.2));
  s.yaw += turn * 1.05 * dt;
  s.bank += (turn * 0.45 - s.bank) * Math.min(1, dt * 3);
}

// ---------------------------------------------------------------- stats

export interface MoveStats {
  /** 0..100 (sprint endurance). */
  stamina: number;
  /** 0..100 (lung capacity). */
  lung: number;
  sprintDist: number;
  swimDist: number;
  underwaterTime: number;
}

export const DEFAULT_STATS: MoveStats = { stamina: 20, lung: 20, sprintDist: 0, swimDist: 0, underwaterTime: 0 };

/** Sprint duration multiplier from the stamina stat (1x .. 2x). */
export function staminaMultiplier(stat: number): number {
  return 1 + clamp01(stat / 100);
}

/**
 * Train stats from exercise this step (meters sprinted, meters swum, seconds
 * underwater). Roughly 25 km of sprinting or 2.5 hours of mixed swimming maxes
 * a stat. Returns which stats crossed a whole point (for "stat up" toasts).
 */
export function growStats(s: MoveStats, sprintM: number, swimM: number, underS: number): { stamina: boolean; lung: boolean } {
  const st0 = Math.floor(s.stamina), lu0 = Math.floor(s.lung);
  s.sprintDist += sprintM;
  s.swimDist += swimM;
  s.underwaterTime += underS;
  s.stamina = Math.min(100, s.stamina + sprintM * 0.004 + swimM * 0.002);
  s.lung = Math.min(100, s.lung + swimM * 0.003 + underS * 0.06);
  return { stamina: Math.floor(s.stamina) > st0, lung: Math.floor(s.lung) > lu0 };
}
