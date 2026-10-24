// Pure vehicle math (no three.js): tuning from upgrades, tire grip curve,
// suspension springs, damage and repair. Shared by Vehicle and unit tests.

export interface Upgrades {
  /** 0..3 */
  engine: number;
  /** 0..3 */
  brakes: number;
  /** 0..3 */
  suspension: number;
  turbo: boolean;
  nitro: boolean;
  /** 0..4 */
  armor: number;
}

export const NO_UPGRADES: Readonly<Upgrades> = Object.freeze({ engine: 0, brakes: 0, suspension: 0, turbo: false, nitro: false, armor: 0 });

export const UPGRADE_MAX = { engine: 3, brakes: 3, suspension: 3, armor: 4 } as const;

export interface BaseStats {
  maxSpeed: number;
  accel: number;
  brake: number;
  turn: number;
  grip: number;
}

export interface TunedStats extends BaseStats {
  /** Fraction of damage absorbed by armor (0..0.6). */
  armor: number;
  /** Suspension stiffness multiplier (body moves less when stiffer). */
  stiffness: number;
  /** Ride height drop in meters (lowered suspension). */
  lower: number;
}

export function sanitizeUpgrades(u: Partial<Upgrades> | null | undefined): Upgrades {
  const lvl = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  return {
    engine: lvl(u?.engine, UPGRADE_MAX.engine),
    brakes: lvl(u?.brakes, UPGRADE_MAX.brakes),
    suspension: lvl(u?.suspension, UPGRADE_MAX.suspension),
    turbo: !!u?.turbo,
    nitro: !!u?.nitro,
    armor: lvl(u?.armor, UPGRADE_MAX.armor),
  };
}

export function tunedStats(base: BaseStats, up: Upgrades): TunedStats {
  const turbo = up.turbo ? 1 : 0;
  return {
    maxSpeed: base.maxSpeed * (1 + 0.04 * up.engine + 0.06 * turbo),
    accel: base.accel * (1 + 0.12 * up.engine + 0.12 * turbo),
    brake: base.brake * (1 + 0.15 * up.brakes),
    turn: base.turn * (1 + 0.03 * up.suspension),
    grip: base.grip * (1 + 0.06 * up.suspension + 0.03 * up.brakes),
    armor: Math.min(0.6, 0.15 * up.armor),
    stiffness: 1 + 0.3 * up.suspension,
    lower: 0.03 * up.suspension,
  };
}

/**
 * Tire grip factor for a slip angle (radians, absolute). Peak grip near
 * 0.15 rad, then the tire lets go and settles at ~55% (a sustained drift).
 */
export function gripCurve(slip: number): number {
  const s = Math.abs(slip);
  if (!Number.isFinite(s)) return 0.55;
  if (s < 0.15) return 0.85 + s;
  return Math.max(0.55, 1 - (s - 0.15) * 0.75);
}

/** Engine torque falloff toward top speed (0 at and above max). */
export function torqueCurve(speedRatio: number): number {
  const r = Math.max(0, speedRatio);
  if (r >= 1) return 0;
  // strong low-end pull, tapering off
  return (1 - r * r) * (1.25 - 0.35 * r);
}

/** One semi-implicit step of a damped spring toward `target`. Returns [x, v]. */
export function springStep(x: number, v: number, target: number, k: number, c: number, dt: number): [number, number] {
  const a = -k * (x - target) - c * v;
  const nv = v + a * dt;
  return [x + nv * dt, nv];
}

/** Damage (hp out of ~1000) for an impact at `speed` m/s into a wall or car. */
export function impactDamage(speed: number, armor = 0): number {
  if (!(speed > 3)) return 0;
  return Math.pow(speed - 3, 1.35) * 5 * (1 - Math.min(0.9, Math.max(0, armor)));
}

/** Damage from a hard landing (vertical speed in m/s). */
export function landingDamage(vy: number, armor = 0): number {
  const s = Math.abs(vy);
  if (s < 10) return 0;
  return (s - 10) * 22 * (1 - Math.min(0.9, Math.max(0, armor)));
}

export type HealthState = 'ok' | 'damaged' | 'smoking' | 'critical' | 'dead';

export function healthState(health: number, max: number): HealthState {
  const r = max > 0 ? health / max : 0;
  if (r <= 0) return 'dead';
  if (r < 0.15) return 'critical';
  if (r < 0.35) return 'smoking';
  if (r < 0.7) return 'damaged';
  return 'ok';
}

/** Repair price: scales with missing health and the car's value. */
export function repairCost(health: number, max: number, value: number): number {
  const missing = Math.max(0, Math.min(1, 1 - health / (max || 1)));
  if (missing <= 0.001) return 0;
  return Math.round((60 + value * 0.05) * missing + 20);
}

/** Apply damage, returns new health (never below 0). */
export function applyDamage(health: number, amount: number): number {
  if (!(amount > 0)) return health;
  return Math.max(0, health - amount);
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
