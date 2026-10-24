// Pure minigame scoring shared by gym workouts, dancing, basketball, bars, fishing.

/** Quality of a timing press: 1 at the zone center, 0 at its edge, negative = miss. */
export function timingQuality(needle: number, center: number, halfWidth: number): number {
  if (halfWidth <= 0) return -1;
  const d = Math.abs(needle - center) / halfWidth;
  return d > 1 ? -1 : 1 - d * d * 0.6 - d * 0.4;
}

/** Triangle-wave needle position 0..1 for time t (seconds) at `speed` sweeps/sec. */
export function needleAt(t: number, speed: number): number {
  const p = (t * speed) % 2;
  return p < 1 ? p : 2 - p;
}

export type Judge = 'perfect' | 'great' | 'good' | 'miss';

export function rhythmJudge(deltaMs: number): Judge {
  const d = Math.abs(deltaMs);
  if (d <= 45) return 'perfect';
  if (d <= 90) return 'great';
  if (d <= 140) return 'good';
  return 'miss';
}

export const JUDGE_POINTS: Record<Judge, number> = { perfect: 1, great: 0.75, good: 0.45, miss: 0 };

export interface RhythmTally {
  perfect: number;
  great: number;
  good: number;
  miss: number;
  combo: number;
  maxCombo: number;
  score: number;
}

export function newTally(): RhythmTally {
  return { perfect: 0, great: 0, good: 0, miss: 0, combo: 0, maxCombo: 0, score: 0 };
}

/** Record a judgment; combo multiplies score (×1 .. ×2). */
export function tallyHit(t: RhythmTally, j: Judge): void {
  t[j]++;
  if (j === 'miss') t.combo = 0;
  else {
    t.combo++;
    t.maxCombo = Math.max(t.maxCombo, t.combo);
  }
  t.score += Math.round(JUDGE_POINTS[j] * 100 * (1 + Math.min(1, t.combo / 20)));
}

export function accuracy(t: RhythmTally): number {
  const n = t.perfect + t.great + t.good + t.miss;
  if (!n) return 0;
  return (t.perfect * 1 + t.great * 0.75 + t.good * 0.45) / n;
}

export function grade(acc: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (acc >= 0.93) return 'S';
  if (acc >= 0.8) return 'A';
  if (acc >= 0.62) return 'B';
  if (acc >= 0.42) return 'C';
  return 'D';
}

/** Punching-bag combo: accuracy and speed (fraction of the time limit left). */
export function comboScore(correct: number, total: number, timeUsed: number, timeLimit: number): number {
  if (total <= 0) return 0;
  const acc = correct / total;
  const speed = Math.max(0, 1 - timeUsed / Math.max(0.1, timeLimit));
  return Math.max(0, Math.min(1, acc * (0.7 + 0.3 * speed)));
}

/** Average of rep qualities with misses as 0. */
export function repsQuality(q: number[]): number {
  if (!q.length) return 0;
  return q.reduce((a, b) => a + Math.max(0, b), 0) / q.length;
}

/**
 * Basketball shot: power 0..1 pressed against the ideal power for this
 * distance. Returns 'swish' | 'bank' | 'rim' | 'miss'.
 */
export function shotOutcome(power: number, ideal: number, skill = 0): 'swish' | 'bank' | 'rim' | 'miss' {
  const tol = 0.035 + skill * 0.025;
  const d = Math.abs(power - ideal);
  if (d <= tol) return 'swish';
  if (d <= tol * 2) return 'bank';
  if (d <= tol * 3.4) return 'rim';
  return 'miss';
}

export function idealPower(distance: number): number {
  return Math.max(0.3, Math.min(0.95, 0.35 + distance * 0.055));
}

export function shotPoints(distance: number, outcome: string): number {
  if (outcome !== 'swish' && outcome !== 'bank') return 0;
  return distance >= 6.7 ? 3 : 2;
}
