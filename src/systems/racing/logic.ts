// Pure race logic (no DOM/three): race definitions, ordered checkpoint
// progress, along-track distance for positions, rubber-banding and stunt
// scoring. Unit-tested in tests/vehicles-racing.test.ts.

export type RaceType = 'street' | 'circuit' | 'oval';

export interface Point { x: number; z: number }

export interface RaceDef {
  id: string;
  name: string;
  type: RaceType;
  desc: string;
  /** Laps (street races: 1). */
  laps: number;
  start: Point & { yaw: number };
  /** Ordered checkpoints; the last one is the finish (circuits: the start/finish line). */
  checkpoints: Point[];
  /** Prize money for 1st, 2nd, 3rd. */
  reward: [number, number, number];
  entry: number;
  opponents: number;
}

export const RACES: RaceDef[] = [
  {
    id: 'ocean-sprint', name: 'Ocean Drive Sprint', type: 'street', laps: 1, entry: 100, opponents: 3,
    desc: 'Flat out down Ocean Drive, then hard right along the harbor road.',
    start: { x: 165, z: -205, yaw: 0 },
    checkpoints: [{ x: 165, z: -160 }, { x: 165, z: -100 }, { x: 165, z: -40 }, { x: 165, z: 20 }, { x: 165, z: 80 }, { x: 165, z: 135 }, { x: 162, z: 173 }, { x: 125, z: 175 }, { x: 90, z: 175 }],
    reward: [1500, 700, 300],
  },
  {
    id: 'downtown-circuit', name: 'Downtown Circuit', type: 'circuit', laps: 2, entry: 150, opponents: 3,
    desc: 'Two laps around the glass towers of the Cyber District.',
    start: { x: 26, z: -80, yaw: Math.PI / 2 },
    checkpoints: [{ x: 60, z: -80 }, { x: 89, z: -84 }, { x: 90, z: -125 }, { x: 87, z: -164 }, { x: 47, z: -165 }, { x: 7, z: -162 }, { x: 5, z: -120 }, { x: 8, z: -83 }, { x: 30, z: -80 }],
    reward: [2200, 1000, 450],
  },
  {
    id: 'harbor-run', name: 'Silicon Harbor Run', type: 'street', laps: 1, entry: 100, opponents: 3,
    desc: 'Past the docks and the data center, finish at Ocean Drive.',
    start: { x: -60, z: 175, yaw: Math.PI / 2 },
    checkpoints: [{ x: -20, z: 175 }, { x: 30, z: 175 }, { x: 70, z: 175 }, { x: 89, z: 171 }, { x: 90, z: 130 }, { x: 93, z: 92 }, { x: 130, z: 90 }, { x: 165, z: 90 }],
    reward: [1400, 650, 250],
  },
  {
    id: 'industrial-oval', name: 'Factory Oval 300', type: 'oval', laps: 3, entry: 200, opponents: 3,
    desc: 'Stock-car style: three laps of the industrial block. Rubbin\' is racin\'.',
    start: { x: -215, z: 90, yaw: Math.PI / 2 },
    checkpoints: [{ x: -183, z: 90 }, { x: -168, z: 96 }, { x: -165, z: 132 }, { x: -168, z: 169 }, { x: -207, z: 175 }, { x: -246, z: 169 }, { x: -250, z: 132 }, { x: -246, z: 95 }, { x: -212, z: 90 }],
    reward: [2600, 1200, 500],
  },
];

export interface Progress {
  lap: number;
  /** Index of the next checkpoint to hit. */
  cp: number;
  finished: boolean;
  finishTime: number | null;
}

export function newProgress(): Progress {
  return { lap: 0, cp: 0, finished: false, finishTime: null };
}

export function totalCheckpoints(r: RaceDef): number {
  return r.checkpoints.length * Math.max(1, r.laps);
}

/** Checkpoints passed so far (0..total). */
export function passedCount(r: RaceDef, p: Progress): number {
  return p.finished ? totalCheckpoints(r) : p.lap * r.checkpoints.length + p.cp;
}

/**
 * Try to pass the next checkpoint from position (x,z). Checkpoints must be
 * taken in order: only the next one counts. Returns what happened.
 */
export function advance(r: RaceDef, p: Progress, x: number, z: number, radius: number, time: number): 'none' | 'checkpoint' | 'lap' | 'finish' {
  if (p.finished) return 'none';
  const c = r.checkpoints[p.cp];
  if (!c || Math.hypot(c.x - x, c.z - z) > radius) return 'none';
  p.cp++;
  if (p.cp >= r.checkpoints.length) {
    p.lap++;
    p.cp = 0;
    if (p.lap >= Math.max(1, r.laps)) {
      p.finished = true;
      p.finishTime = time;
      return 'finish';
    }
    return 'lap';
  }
  return 'checkpoint';
}

/** Cumulative track distance at each checkpoint (from the start), plus one lap length. */
export function trackTable(r: RaceDef): { cum: number[]; lap: number } {
  const cum: number[] = [];
  let d = 0;
  let px = r.start.x, pz = r.start.z;
  for (const c of r.checkpoints) {
    d += Math.hypot(c.x - px, c.z - pz);
    cum.push(d);
    px = c.x; pz = c.z;
  }
  // circuits: lap length is start→...→finish line (the last cp sits at the start)
  return { cum, lap: d };
}

/** Along-track distance covered (meters) — used to rank racers and rubber-band. */
export function trackDistance(r: RaceDef, table: { cum: number[]; lap: number }, p: Progress, x: number, z: number): number {
  if (p.finished) return table.lap * Math.max(1, r.laps) + 1e6 - (p.finishTime ?? 0);
  const next = r.checkpoints[p.cp];
  const prevD = p.cp > 0 ? table.cum[p.cp - 1] : 0;
  const segLen = table.cum[p.cp] - prevD;
  const toNext = Math.hypot(next.x - x, next.z - z);
  const into = Math.max(0, Math.min(segLen, segLen - toNext));
  return p.lap * table.lap + prevD + into;
}

export interface RankEntry { id: string; distance: number }

/** Sort racers by distance covered (finished racers carry a large bonus). Returns ids, 1st first. */
export function rank(entries: RankEntry[]): string[] {
  return [...entries].sort((a, b) => b.distance - a.distance).map((e) => e.id);
}

/**
 * Rubber band: AI speed multiplier from its gap to the player (meters,
 * positive = AI ahead). Leaders ease off, stragglers get a push.
 */
export function rubberBand(gap: number): number {
  if (!Number.isFinite(gap)) return 1;
  if (gap > 0) return Math.max(0.84, 1 - gap / 450);
  return Math.min(1.2, 1 + -gap / 320);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}

// ------------------------------------------------------------------ stunts

/** Drift points per second: grows with speed and angle. */
export function driftRate(speed: number, slipAngle: number): number {
  if (speed < 8 || slipAngle < 0.3) return 0;
  return speed * Math.min(1.2, slipAngle) * 25;
}

/** Cash for a banked drift score. */
export function driftCash(score: number): number {
  return score >= 600 ? Math.floor(score / 150) : 0;
}

/** Cash for a wheelie of `seconds`. */
export function wheelieCash(seconds: number): number {
  return seconds >= 1.5 ? Math.floor(seconds * 10) : 0;
}

/** Stunt jump payout: unique jumps pay big once, repeats pay a little. */
export function stuntJumpCash(unique: boolean, airTime: number, distance: number): number {
  if (airTime < 0.8 || distance < 15) return 0;
  return unique ? 1000 : Math.round(60 + distance * 2);
}
