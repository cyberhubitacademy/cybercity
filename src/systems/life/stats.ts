// Pure character-stat dynamics for Rico (no DOM / three). All bars are 0..100.
// hunger/thirst: 100 = full, drain slowly. fatigue: 0 = rested, rises while awake.
// strength/stamina/lung: skills raised by training (diminishing returns per day).
// fat/muscle: body shape; eating vs exercise moves them, neglect drifts gently.

export type BoostId = 'energy' | 'protein' | 'coffee' | 'tipsy';

export interface Boost {
  id: BoostId;
  /** Game hours remaining. */
  hours: number;
}

export interface LifeState {
  hunger: number;
  thirst: number;
  fatigue: number;
  strength: number;
  stamina: number;
  lung: number;
  /** Focus meter (combat slow-mo fuel). */
  focus: number;
  fat: number;
  muscle: number;
  boosts: Boost[];
  /** Total game hours simulated (day index = floor(clock / 24)). */
  clock: number;
  /** Day index of the last workout of any kind (for muscle decay). */
  lastWorkoutDay: number;
  /** Sessions done today per exercise id (diminishing returns). */
  today: { day: number; sessions: Record<string, number> };
  /** Distance sprinted (m) accumulator used for cardio gains. */
  sprintMeters: number;
}

export function defaultLife(): LifeState {
  return {
    hunger: 80, thirst: 80, fatigue: 15,
    strength: 20, stamina: 25, lung: 20, focus: 100,
    fat: 30, muscle: 25,
    boosts: [], clock: 0, lastWorkoutDay: 0,
    today: { day: 0, sessions: {} }, sprintMeters: 0,
  };
}

export const clamp = (v: number, a = 0, b = 100): number => (v < a ? a : v > b ? b : v);

/** Repair a loaded save (missing/NaN fields fall back to defaults). */
export function sanitizeLife(raw: unknown): LifeState {
  const d = defaultLife();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<LifeState>;
  const n = (k: keyof LifeState, lo = 0, hi = 100): number => {
    const v = r[k];
    return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : (d[k] as number);
  };
  return {
    hunger: n('hunger'), thirst: n('thirst'), fatigue: n('fatigue'),
    strength: n('strength'), stamina: n('stamina'), lung: n('lung'), focus: n('focus'),
    fat: n('fat'), muscle: n('muscle'),
    boosts: Array.isArray(r.boosts) ? r.boosts.filter((b) => b && typeof b.hours === 'number' && typeof b.id === 'string').slice(0, 8) : [],
    clock: n('clock', 0, 1e7), lastWorkoutDay: n('lastWorkoutDay', 0, 1e6),
    today: r.today && typeof r.today.day === 'number' ? { day: r.today.day, sessions: { ...(r.today.sessions ?? {}) } } : d.today,
    sprintMeters: n('sprintMeters', 0, 1e6),
  };
}

export const day = (s: LifeState): number => Math.floor(s.clock / 24);

export function hasBoost(s: LifeState, id: BoostId): boolean {
  return s.boosts.some((b) => b.id === id && b.hours > 0);
}

export function addBoost(s: LifeState, id: BoostId, hours: number): void {
  const b = s.boosts.find((x) => x.id === id);
  if (b) b.hours = Math.max(b.hours, hours);
  else s.boosts.push({ id, hours });
}

export interface TickInput {
  /** Game hours elapsed this tick. */
  hours: number;
  sprinting: boolean;
  /** Meters moved this tick on foot. */
  meters: number;
}

/** Rates per game hour. A full belly lasts ~2 game days, thirst ~1.5, fatigue maxes after ~30 h awake. */
export const RATES = { hunger: 2.1, thirst: 2.8, fatigue: 3.2, focusRegen: 120 };

export function tick(s: LifeState, t: TickInput): void {
  const h = t.hours;
  if (h <= 0) return;
  const prevDay = day(s);
  s.clock += h;
  const sprintCost = t.sprinting ? 2.4 : 1;
  s.hunger = clamp(s.hunger - RATES.hunger * h * sprintCost);
  s.thirst = clamp(s.thirst - RATES.thirst * h * (t.sprinting ? 3 : 1));
  s.fatigue = clamp(s.fatigue + RATES.fatigue * h * (hasBoost(s, 'coffee') || hasBoost(s, 'energy') ? 0.4 : 1));
  s.focus = clamp(s.focus + RATES.focusRegen * h * (s.fatigue > 80 ? 0.5 : 1));
  // cardio: sprinting distance slowly builds stamina and burns fat
  if (t.sprinting && t.meters > 0) {
    s.sprintMeters += t.meters;
    while (s.sprintMeters >= 100) {
      s.sprintMeters -= 100;
      s.stamina = clamp(s.stamina + 0.12 * (1 - s.stamina / 130));
      s.fat = clamp(s.fat - 0.05, 8);
    }
  }
  // starving burns fat and some muscle
  if (s.hunger < 5) { s.fat = clamp(s.fat - 0.25 * h, 8); s.muscle = clamp(s.muscle - 0.08 * h, 10); }
  for (const b of s.boosts) b.hours -= h;
  s.boosts = s.boosts.filter((b) => b.hours > 0);
  // daily neglect: no workout for 2+ days -> muscle fades gently; idle life -> slight weight gain
  const now = day(s);
  for (let d = prevDay + 1; d <= now; d++) {
    if (d - s.lastWorkoutDay >= 2) {
      s.muscle = clamp(s.muscle - 0.6, 10);
      s.strength = clamp(s.strength - 0.25, 5);
    }
    if (s.hunger > 60) s.fat = clamp(s.fat + 0.3);
  }
  if (s.today.day !== now) s.today = { day: now, sessions: {} };
}

// ---------------------------------------------------------------- derived effects

/** Sprint endurance multiplier for Player.staminaMult. ~0.6 .. 2.0 */
export function staminaMultiplier(s: LifeState): number {
  let m = 1 + (s.stamina / 100) * 0.8 - Math.max(0, s.fat - 45) / 100;
  if (s.hunger < 20) m *= 0.8;
  if (s.thirst < 20) m *= 0.8;
  if (s.fatigue > 75) m *= 0.8;
  if (hasBoost(s, 'energy')) m *= 1.35;
  return Math.max(0.5, Math.min(2.2, m));
}

/** Movement speed multiplier (subtle). ~0.85 .. 1.07 */
export function speedMultiplier(s: LifeState): number {
  let m = 1 + (s.stamina / 100) * 0.05 - Math.max(0, s.fat - 55) * 0.0025;
  if (s.fatigue > 88) m -= 0.05;
  if (s.hunger < 8) m -= 0.04;
  if (hasBoost(s, 'tipsy')) m -= 0.04;
  return Math.max(0.82, Math.min(1.08, m));
}

/** Health regen per real second, and the cap (fraction of max health) it heals to. */
export function regen(s: LifeState): { perSec: number; cap: number } {
  const fed = s.hunger > 40 && s.thirst > 40;
  const perSec = (0.5 + s.stamina / 100) * (fed ? 1 : 0.4) * (s.fatigue > 85 ? 0.5 : 1);
  const cap = fed ? (s.hunger > 70 && s.thirst > 70 ? 1 : 0.75) : 0.5;
  return { perSec, cap };
}

/** Melee damage multiplier for combat. 1 .. 1.8 */
export function meleeMultiplier(s: LifeState): number {
  return 1 + (s.strength / 100) * 0.6 + (s.muscle / 100) * 0.2;
}

/** Breath-hold seconds underwater. 15 .. 60 */
export function lungSeconds(s: LifeState): number {
  return 15 + (s.lung / 100) * 45;
}

/** Visual body shape: width (root x/z scale) and arm/chest bulk factor. */
export function bodyShape(s: LifeState): { width: number; bulk: number } {
  const width = 1 + (s.fat - 30) / 100 * 0.42 + (s.muscle - 25) / 100 * 0.08;
  const bulk = 1 + (s.muscle - 25) / 100 * 0.45;
  return { width: Math.max(0.88, Math.min(1.35, width)), bulk: Math.max(0.9, Math.min(1.35, bulk)) };
}

export type Warning = 'hungry' | 'starving' | 'thirsty' | 'dehydrated' | 'tired' | 'exhausted';

export function warnings(s: LifeState): Warning[] {
  const w: Warning[] = [];
  if (s.hunger < 8) w.push('starving'); else if (s.hunger < 25) w.push('hungry');
  if (s.thirst < 8) w.push('dehydrated'); else if (s.thirst < 25) w.push('thirsty');
  if (s.fatigue > 90) w.push('exhausted'); else if (s.fatigue > 72) w.push('tired');
  return w;
}

// ---------------------------------------------------------------- actions

export interface Consumable {
  hunger?: number;
  thirst?: number;
  health?: number;
  fat?: number;
  fatigue?: number;
  focus?: number;
  boost?: { id: BoostId; hours: number };
}

/** Eat/drink. Returns health to add to the player. Overeating (stuffed) adds fat. */
export function consume(s: LifeState, c: Consumable): number {
  const before = s.hunger;
  s.hunger = clamp(s.hunger + (c.hunger ?? 0));
  s.thirst = clamp(s.thirst + (c.thirst ?? 0));
  s.fatigue = clamp(s.fatigue + (c.fatigue ?? 0));
  s.focus = clamp(s.focus + (c.focus ?? 0));
  const over = Math.max(0, before + (c.hunger ?? 0) - 100);
  s.fat = clamp(s.fat + (c.fat ?? 0) + over * 0.04, 8);
  if (c.boost) addBoost(s, c.boost.id, c.boost.hours);
  return c.health ?? 0;
}

export interface WorkoutDef {
  strength: number;
  stamina: number;
  muscle: number;
  lung?: number;
  fatBurn: number;
  fatigue: number;
}

export const WORKOUTS: Record<string, WorkoutDef> = {
  treadmill: { strength: 0, stamina: 2.4, muscle: 0.2, lung: 1.2, fatBurn: 1.6, fatigue: 6 },
  bench: { strength: 2.2, stamina: 0.3, muscle: 1.6, fatBurn: 0.5, fatigue: 5 },
  deadlift: { strength: 2.6, stamina: 0.4, muscle: 1.4, fatBurn: 0.6, fatigue: 7 },
  squat: { strength: 2.0, stamina: 0.8, muscle: 1.4, fatBurn: 0.8, fatigue: 6 },
  pulldown: { strength: 1.8, stamina: 0.3, muscle: 1.5, fatBurn: 0.4, fatigue: 4 },
  bag: { strength: 1.2, stamina: 1.6, muscle: 0.8, fatBurn: 1.2, fatigue: 6 },
  swim: { strength: 0.4, stamina: 1.6, muscle: 0.4, lung: 2, fatBurn: 1.2, fatigue: 6 },
};

/** Diminishing returns: 1st session today = 100%, then 55%, 35%, 25%... */
export function sessionFactor(sessionsToday: number): number {
  return 1 / (1 + sessionsToday * 0.8);
}

/** Skill gains also shrink as the stat approaches its cap. */
export function capFactor(v: number): number {
  return Math.max(0.08, 1 - v / 115);
}

export interface WorkoutResult {
  strength: number;
  stamina: number;
  muscle: number;
  lung: number;
  fat: number;
}

/** Apply a finished workout with a performance quality 0..1. */
export function workout(s: LifeState, exercise: string, quality: number): WorkoutResult {
  const def = WORKOUTS[exercise];
  const res: WorkoutResult = { strength: 0, stamina: 0, muscle: 0, lung: 0, fat: 0 };
  if (!def) return res;
  const q = clamp(quality, 0, 1);
  const n = s.today.sessions[exercise] ?? 0;
  const f = sessionFactor(n) * (0.35 + 0.65 * q) * (s.fatigue > 85 ? 0.5 : 1) * (s.hunger < 15 ? 0.6 : 1);
  const prot = hasBoost(s, 'protein') ? 2 : 1;
  res.strength = def.strength * f * prot * capFactor(s.strength);
  res.stamina = def.stamina * f * capFactor(s.stamina);
  res.muscle = def.muscle * f * prot * capFactor(s.muscle);
  res.lung = (def.lung ?? 0) * f * capFactor(s.lung);
  res.fat = -def.fatBurn * (0.5 + 0.5 * q);
  s.strength = clamp(s.strength + res.strength);
  s.stamina = clamp(s.stamina + res.stamina);
  s.muscle = clamp(s.muscle + res.muscle);
  s.lung = clamp(s.lung + res.lung);
  s.fat = clamp(s.fat + res.fat, 8);
  s.fatigue = clamp(s.fatigue + def.fatigue);
  s.hunger = clamp(s.hunger - 3);
  s.thirst = clamp(s.thirst - 5);
  s.today.sessions[exercise] = n + 1;
  s.lastWorkoutDay = day(s);
  return res;
}

/** Sleep for `hours`: restores fatigue, costs some hunger/thirst. */
export function sleep(s: LifeState, hours: number): void {
  s.fatigue = clamp(s.fatigue - hours * 14);
  s.hunger = clamp(s.hunger - hours * 1.2);
  s.thirst = clamp(s.thirst - hours * 1.6);
  s.focus = 100;
  s.boosts = s.boosts.filter((b) => b.id !== 'tipsy');
}

/** Lounging on the beach (per game hour). */
export function lounge(s: LifeState, hours: number): void {
  s.fatigue = clamp(s.fatigue - hours * 6);
}

/** Use focus; returns false when empty. amount per call. */
export function spendFocus(s: LifeState, amount: number): boolean {
  if (s.focus <= 0) return false;
  s.focus = clamp(s.focus - amount);
  return true;
}

/** Lung training from time spent underwater (movement system reports seconds). */
export function trainLung(s: LifeState, seconds: number): void {
  s.lung = clamp(s.lung + seconds * 0.02 * capFactor(s.lung));
}

export function bodyLabel(s: LifeState): string {
  if (s.fat > 65) return 'Heavyset';
  if (s.muscle > 70 && s.fat < 35) return 'Shredded';
  if (s.muscle > 50) return 'Athletic';
  if (s.fat < 18) return 'Lean';
  return 'Average';
}
