// Pure scoring helpers shared by the Season 2 challenges (no DOM).

import { clampScore, type ScoreLine } from '../../types';

/** Fraction (0..1) for a multi-select: hits minus wrong picks, over the number of correct options. */
export function setFraction(selected: readonly string[], correct: readonly string[]): number {
  if (!correct.length) return selected.length ? 0 : 1;
  const hits = selected.filter((s) => correct.includes(s)).length;
  const wrong = selected.filter((s) => !correct.includes(s)).length;
  return Math.max(0, Math.min(1, (hits - wrong) / correct.length));
}

/** Fraction (0..1) of item pairs placed in the same relative order as `ideal` (items not in ideal are ignored). */
export function pairwiseOrder(order: readonly string[], ideal: readonly string[]): number {
  const seq = order.filter((s) => ideal.includes(s));
  let total = 0;
  let good = 0;
  for (let i = 0; i < ideal.length; i++) {
    for (let j = i + 1; j < ideal.length; j++) {
      total++;
      const a = seq.indexOf(ideal[i]);
      const b = seq.indexOf(ideal[j]);
      if (a >= 0 && b >= 0 && a < b) good++;
    }
  }
  return total ? good / total : 1;
}

export interface Explained {
  title: string;
  ok: boolean;
  text: string;
}

export interface Graded {
  score: number;
  breakdown: ScoreLine[];
  items: Explained[];
  mistakes: string[];
}

/** Build a 0..100 score from weighted fractions. */
export function weigh(parts: { label: string; frac: number; max: number }[]): { score: number; breakdown: ScoreLine[] } {
  const breakdown = parts.map((p) => ({ label: p.label, value: Math.round(Math.max(0, Math.min(1, p.frac)) * p.max), max: p.max }));
  return { score: clampScore(breakdown.reduce((s, b) => s + b.value, 0)), breakdown };
}
