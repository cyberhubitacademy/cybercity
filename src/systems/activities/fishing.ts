// Pure fishing model: species/rarity odds, bite timing, weights, prices and
// the reel-tension minigame step.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface Species {
  id: string;
  name: string;
  rarity: Rarity;
  weight: [number, number];
  /** $ per kg at the fish market. */
  price: number;
  /** When it bites best. */
  time: 'day' | 'night' | 'any';
  /** How hard it fights 0..1. */
  fight: number;
  color: string;
}

export const SPECIES: Species[] = [
  { id: 'snapper', name: 'Red Snapper', rarity: 'common', weight: [0.8, 3.5], price: 8, time: 'any', fight: 0.25, color: '#e0453a' },
  { id: 'mullet', name: 'Striped Mullet', rarity: 'common', weight: [0.4, 2], price: 5, time: 'any', fight: 0.15, color: '#9aa3ad' },
  { id: 'grunt', name: 'Bluestriped Grunt', rarity: 'common', weight: [0.3, 1.2], price: 6, time: 'day', fight: 0.2, color: '#4aa4e0' },
  { id: 'snook', name: 'Common Snook', rarity: 'uncommon', weight: [2, 9], price: 12, time: 'night', fight: 0.45, color: '#d9c27a' },
  { id: 'mahi', name: 'Mahi-Mahi', rarity: 'uncommon', weight: [3, 14], price: 14, time: 'day', fight: 0.5, color: '#3dffb0' },
  { id: 'grouper', name: 'Goliath Grouper', rarity: 'rare', weight: [20, 120], price: 6, time: 'any', fight: 0.75, color: '#6b5a3a' },
  { id: 'tarpon', name: 'Silver Tarpon', rarity: 'rare', weight: [15, 60], price: 9, time: 'night', fight: 0.8, color: '#dfe7f0' },
  { id: 'sailfish', name: 'Sailfish', rarity: 'rare', weight: [18, 45], price: 15, time: 'day', fight: 0.85, color: '#2a6cc4' },
  { id: 'neonkoi', name: 'Neon Koi', rarity: 'legendary', weight: [4, 10], price: 120, time: 'night', fight: 0.7, color: '#ff2fa0' },
  { id: 'boot', name: 'Old Boot', rarity: 'common', weight: [0.5, 1], price: 0, time: 'any', fight: 0.05, color: '#4a3328' },
];

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, uncommon: 28, rare: 10, legendary: 2 };

export const isNight = (hour: number): boolean => hour >= 20 || hour < 6;

/** Relative odds for each species at this hour (sums to 1). */
export function speciesOdds(hour: number, luck = 0): { species: Species; p: number }[] {
  const night = isNight(hour);
  const w = SPECIES.map((s) => {
    let v = RARITY_WEIGHT[s.rarity] / SPECIES.filter((x) => x.rarity === s.rarity).length;
    if (s.time === 'night') v *= night ? 2 : 0.35;
    if (s.time === 'day') v *= night ? 0.35 : 1.6;
    if (s.rarity === 'rare' || s.rarity === 'legendary') v *= 1 + luck;
    return v;
  });
  const sum = w.reduce((a, b) => a + b, 0);
  return SPECIES.map((s, i) => ({ species: s, p: w[i] / sum }));
}

export function rollSpecies(rnd: () => number, hour: number, luck = 0): Species {
  let r = rnd();
  for (const o of speciesOdds(hour, luck)) {
    r -= o.p;
    if (r <= 0) return o.species;
  }
  return SPECIES[0];
}

/** Seconds until a bite after a cast; longer casts and dawn/dusk bite faster. */
export function biteDelay(rnd: () => number, castPower: number, hour: number): number {
  const golden = (hour >= 5.5 && hour < 8) || (hour >= 17.5 && hour < 20) ? 0.7 : 1;
  return (2.5 + rnd() * 6) * golden * (1.15 - castPower * 0.3);
}

export function rollWeight(rnd: () => number, s: Species): number {
  const [a, b] = s.weight;
  // skewed towards the small end
  return Math.round((a + (b - a) * rnd() * rnd()) * 10) / 10;
}

export function fishValue(s: Species, kg: number): number {
  return Math.round(s.price * kg);
}

/** Reaction window (seconds) to strike after the bobber dips. */
export function strikeWindow(s: Species): number {
  return 0.9 - s.fight * 0.35;
}

export interface ReelState {
  /** 0..1 line tension (1 = snap). */
  tension: number;
  /** 0..1 fish landed progress. */
  progress: number;
  /** Fish pull strength this moment 0..1. */
  pull: number;
  t: number;
  snapped: boolean;
  landed: boolean;
}

export function newReel(): ReelState {
  return { tension: 0.3, progress: 0.15, pull: 0.5, t: 0, snapped: false, landed: false };
}

/**
 * Step the reel fight. Holding reel raises tension and progress; the fish's
 * pull surges periodically (stronger fish surge harder). Keep tension in the
 * green band (0.3..0.8). Deterministic given `surge` (0..1 from rnd).
 */
export function reelStep(r: ReelState, dt: number, holding: boolean, fight: number, surge: number): void {
  if (r.snapped || r.landed) return;
  r.t += dt;
  r.pull = Math.max(0, Math.min(1, 0.35 + fight * 0.4 + Math.sin(r.t * (1.5 + fight * 2)) * 0.25 + (surge - 0.5) * fight * 0.5));
  const dT = holding ? (0.55 + r.pull * 0.6) : -(0.5 + (1 - r.pull) * 0.3);
  r.tension = Math.max(0, Math.min(1.05, r.tension + dT * dt));
  const inBand = r.tension >= 0.3 && r.tension <= 0.8;
  if (holding && inBand) r.progress += dt * (0.22 - fight * 0.1);
  else if (r.tension < 0.15) r.progress -= dt * 0.12 * (0.5 + fight);
  r.progress = Math.max(0, Math.min(1, r.progress));
  if (r.tension >= 1) r.snapped = true;
  if (r.progress >= 1) r.landed = true;
  if (r.progress <= 0 && r.t > 2) r.snapped = true; // it got away
}
