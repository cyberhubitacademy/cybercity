import type { Look } from '../shops/catalog';
import type { ArsenalSave } from '../combat/weapons';
import { CHAR_IDS, type CharId, type CharSpot } from './characters';

// Pure character-switching logic (no three / DOM): saved per-character state,
// switch eligibility, "living their life" spot selection, the switch wheel
// pick and the sky-cam transition timeline.

// ---------------------------------------------------------------- saved state

/** A character you are NOT playing right now. The active one lives in the profile / other systems. */
export interface CharState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  armor: number;
  credits: number;
  /** Shops look (clothes, hair, accessories); null = their default. */
  look: Look | null;
  /** Combat loadout; null = fists only. */
  arsenal: ArsenalSave | null;
  /** Real time (ms) they were last played. */
  leftAt: number;
  /** Real time (ms) they last moved to a new hang-out on their own. */
  movedAt: number;
  /** Id of the hang-out they're at (null = where you left them). */
  spot: string | null;
}

export interface SwitchSave {
  v: 1;
  active: CharId;
  /** Stored state of each non-active character (null = never played yet). */
  chars: Record<CharId, CharState | null>;
}

export function defaultSave(): SwitchSave {
  return { v: 1, active: 'rico', chars: { rico: null, maya: null } };
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function sanitizeChar(raw: unknown): CharState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CharState>;
  if (typeof r.x !== 'number' || typeof r.z !== 'number') return null;
  return {
    x: num(r.x, 0), y: Math.max(0, num(r.y, 0)), z: num(r.z, 0), yaw: num(r.yaw, 0),
    health: Math.max(1, Math.min(200, num(r.health, 100))),
    armor: Math.max(0, Math.min(100, num(r.armor, 0))),
    credits: Math.max(0, Math.round(num(r.credits, 0))),
    look: r.look && typeof r.look === 'object' ? (r.look as Look) : null,
    arsenal: r.arsenal && typeof r.arsenal === 'object' ? (r.arsenal as ArsenalSave) : null,
    leftAt: num(r.leftAt, 0),
    movedAt: num(r.movedAt, num(r.leftAt, 0)),
    spot: typeof r.spot === 'string' ? r.spot : null,
  };
}

/** Accept anything from the save file; always returns a valid state. */
export function sanitizeSave(raw: unknown): SwitchSave {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SwitchSave>;
  const active: CharId = CHAR_IDS.includes(r.active as CharId) ? (r.active as CharId) : 'rico';
  const chars = (r.chars && typeof r.chars === 'object' ? r.chars : {}) as Partial<Record<CharId, unknown>>;
  for (const id of CHAR_IDS) d.chars[id] = id === active ? null : sanitizeChar(chars[id]);
  d.active = active;
  return d;
}

// ---------------------------------------------------------------- eligibility

export interface SwitchConditions {
  transitioning: boolean;
  busy: boolean;
  dead: boolean;
  mission: boolean;
  wanted: number;
  swimming: boolean;
  airborne: boolean;
  inVehicle: boolean;
  /** Getting in/out of a car, riding a tram/taxi, seated in an activity... */
  occupied: boolean;
  indoors: boolean;
}

/** Why switching isn't allowed right now (null = allowed). Message is shown as a notification. */
export function switchBlockReason(c: SwitchConditions): string | null {
  if (c.transitioning) return 'Already switching.';
  if (c.busy) return 'You can\'t switch characters right now.';
  if (c.dead) return 'You can\'t switch while you\'re down.';
  if (c.mission) return 'You can\'t switch characters during a mission.';
  if (c.wanted > 0) return 'Lose the cops first: no switching with a [y]wanted level[/y].';
  if (c.swimming) return 'Get out of the water to switch characters.';
  if (c.airborne) return 'Land first: no switching in mid-air.';
  if (c.inVehicle) return 'Step out of the vehicle to switch characters.';
  if (c.occupied) return 'Finish what you\'re doing to switch characters.';
  if (c.indoors) return 'Head outside to switch characters.';
  return null;
}

// ---------------------------------------------------------------- living their life

/** Left alone less than this, a character is still standing where you left them. */
export const STAY_MS = 2 * 60 * 1000;
/** While left alone (and out of sight) they move to a new hang-out at most this often. */
export const WANDER_MS = 6 * 60 * 1000;

/** Pick a hang-out for someone left alone `awayMin` minutes (rand in [0,1)). Avoids `exclude` when possible. */
export function pickSpot(spots: readonly CharSpot[], awayMin: number, rand: number, exclude: string | null = null): CharSpot | null {
  let n = 0;
  for (const s of spots) if (s.minAway <= awayMin && s.id !== exclude) n++;
  if (n === 0) {
    // nothing new fits: allow the excluded one again
    for (const s of spots) if (s.minAway <= awayMin) n++;
    exclude = null;
  }
  if (n === 0) return null;
  let k = Math.min(n - 1, Math.floor(Math.max(0, rand) * n));
  for (const s of spots) {
    if (s.minAway > awayMin || s.id === exclude) continue;
    if (k-- === 0) return s;
  }
  return null;
}

/**
 * The off-screen character "lives their life": once left alone > STAY_MS and not in sight,
 * they move to a hang-out (again every WANDER_MS). Mutates `st`; returns true if they moved.
 */
export function lifeTick(st: CharState, now: number, spots: readonly CharSpot[], inSight: boolean, rand: number): boolean {
  if (inSight) return false;
  if (now - st.leftAt < STAY_MS) return false;
  if (st.spot !== null && now - st.movedAt < WANDER_MS) return false;
  const s = pickSpot(spots, (now - st.leftAt) / 60000, rand, st.spot);
  if (!s) return false;
  st.x = s.x; st.z = s.z; st.yaw = s.yaw; st.y = 0;
  st.spot = s.id;
  st.movedAt = now;
  return true;
}

// ---------------------------------------------------------------- wheel

/** Mouse travel (px) needed before the wheel picks a side. */
export const WHEEL_DEADZONE = 28;

/** Wheel slot from accumulated mouse movement: Rico on the left, Maya on the right. */
export function wheelPick(dx: number, dy: number, current: CharId): CharId {
  if (dx * dx + dy * dy < WHEEL_DEADZONE * WHEEL_DEADZONE) return current;
  return dx < 0 ? 'rico' : 'maya';
}

// ---------------------------------------------------------------- transition timeline

export const SKY_Y = 250;
const RISE = 0.8, HOLD = 0.35, PAN = 0.95, DROP = 0.32, GAP = 0.16;
/** Heights of the stepped descent (the last step lands on the character's back). */
const DROP_Y = [SKY_Y, 115, 42];
export const SWITCH_TOTAL = RISE + HOLD + PAN + DROP_Y.length * DROP + (DROP_Y.length - 1) * GAP;
/** Time the bodies swap (camera is high above the city). */
export const SWITCH_SWAP_AT = RISE;

export interface Vec3Like { x: number; y: number; z: number }

export interface SwitchPlan {
  /** Camera where the gameplay camera was. */
  start: Vec3Like;
  /** Look target at the start (leaving character's head). */
  startLook: Vec3Like;
  /** Leaving character's position. */
  from: Vec3Like;
  /** Arriving character's position. */
  to: Vec3Like;
  /** Final over-the-shoulder camera position and look target. */
  end: Vec3Like;
  endLook: Vec3Like;
}

export interface SwitchFrame {
  pos: Vec3Like;
  look: Vec3Like;
  /** 0..1 desaturation. */
  grey: number;
  /** A drop just landed this frame range (for a thump/shake); index of the drop or -1. */
  drop: number;
  done: boolean;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Camera pose at `t` seconds into the switch. Writes into `out` (no allocations). */
export function switchFrame(plan: SwitchPlan, t: number, out: SwitchFrame): SwitchFrame {
  const { from: a, to: b } = plan;
  // look a few metres ahead along the travel direction (straight-down lookAt is degenerate)
  let dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) { dx = 0; dz = -1; } else { dx /= len; dz /= len; }
  const ahead = 9;
  out.drop = -1;
  out.done = false;
  const p = out.pos, l = out.look;
  if (t < RISE) {
    const k = easeInOut(t / RISE);
    p.x = lerp(plan.start.x, a.x, k); p.y = lerp(plan.start.y, SKY_Y, k); p.z = lerp(plan.start.z, a.z, k);
    const kl = clamp01(k * 1.6);
    l.x = lerp(plan.startLook.x, a.x + dx * ahead, kl); l.y = lerp(plan.startLook.y, 0, kl); l.z = lerp(plan.startLook.z, a.z + dz * ahead, kl);
    out.grey = clamp01((t - RISE * 0.6) / (RISE * 0.4));
    return out;
  }
  let u = t - RISE;
  if (u < HOLD + PAN) {
    const k = u < HOLD ? 0 : easeInOut((u - HOLD) / PAN);
    p.x = lerp(a.x, b.x, k); p.y = SKY_Y; p.z = lerp(a.z, b.z, k);
    l.x = p.x + dx * ahead; l.y = 0; l.z = p.z + dz * ahead;
    out.grey = 1;
    return out;
  }
  u -= HOLD + PAN;
  for (let i = 0; i < DROP_Y.length; i++) {
    const last = i === DROP_Y.length - 1;
    if (u < DROP || last) {
      const k = easeOut(clamp01(u / DROP));
      const y0 = DROP_Y[i], y1 = last ? plan.end.y : DROP_Y[i + 1];
      p.y = lerp(y0, y1, k);
      if (last) {
        p.x = lerp(b.x, plan.end.x, k); p.z = lerp(b.z, plan.end.z, k);
        l.x = lerp(b.x + dx * ahead, plan.endLook.x, k); l.y = lerp(0, plan.endLook.y, k); l.z = lerp(b.z + dz * ahead, plan.endLook.z, k);
      } else {
        p.x = b.x; p.z = b.z;
        l.x = b.x + dx * ahead; l.y = 0; l.z = b.z + dz * ahead;
      }
      out.grey = last ? 1 - k : 1 - (i + k) / DROP_Y.length * 0.5;
      out.done = last && u >= DROP;
      return out;
    }
    u -= DROP;
    if (u < GAP) {
      // hang for a beat after each drop
      p.x = b.x; p.z = b.z; p.y = DROP_Y[i + 1];
      l.x = b.x + dx * ahead; l.y = 0; l.z = b.z + dz * ahead;
      out.grey = 1 - (i + 1) / DROP_Y.length * 0.5;
      out.drop = i;
      return out;
    }
    u -= GAP;
  }
  out.done = true;
  return out;
}
