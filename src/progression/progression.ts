import { TOPIC_LABELS, type ChallengeResult, type Topic } from '../cyber/types';
import type { MissionRewards } from '../missions/types';
import { ORGS, type JournalEntry, type JournalKind, type MasteryStat, type Org, type PlayerProfile } from './types';

// XP, levels, rewards, challenge mastery and the learning journal.

export const MAX_LEVEL = 30;
const JOURNAL_CAP = 300;
const HISTORY_CAP = 500;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 200 + (Math.max(1, level) - 1) * 150;
}

/** Add XP (profile.xp is progress inside the current level). Returns levels gained. */
export function addXp(profile: PlayerProfile, amount: number): number {
  if (!(amount > 0)) return 0;
  profile.xp += Math.round(amount);
  let ups = 0;
  while (profile.level < MAX_LEVEL && profile.xp >= xpToNext(profile.level)) {
    profile.xp -= xpToNext(profile.level);
    profile.level++;
    profile.skillPoints++;
    ups++;
  }
  if (profile.level >= MAX_LEVEL) profile.xp = Math.min(profile.xp, xpToNext(MAX_LEVEL));
  return ups;
}

export interface RewardMods {
  xpMult: number;
  creditMult: number;
}

export interface RewardSummary {
  xp: number;
  credits: number;
  levelUps: number;
  rep: Partial<Record<Org, number>>;
  item?: string;
}

export function grantReward(profile: PlayerProfile, rewards: MissionRewards, mods: RewardMods = { xpMult: 1, creditMult: 1 }): RewardSummary {
  const xp = Math.round(rewards.xp * mods.xpMult);
  const credits = Math.round(rewards.credits * mods.creditMult);
  profile.credits += credits;
  const levelUps = addXp(profile, xp);
  const rep: Partial<Record<Org, number>> = {};
  for (const org of ORGS) {
    const delta = rewards.rep[org];
    if (!delta) continue;
    profile.rep[org] = Math.max(0, Math.min(100, profile.rep[org] + delta));
    rep[org] = delta;
  }
  let item: string | undefined;
  if (rewards.item && !profile.inventory.includes(rewards.item)) {
    profile.inventory.push(rewards.item);
    item = rewards.item;
  }
  return { xp, credits, levelUps, rep, item };
}

export function addJournal(profile: PlayerProfile, kind: JournalKind, title: string, text: string, time = Date.now()): void {
  profile.journal.push({ time, kind, title, text } satisfies JournalEntry);
  if (profile.journal.length > JOURNAL_CAP) profile.journal.splice(0, profile.journal.length - JOURNAL_CAP);
}

export function emptyMastery(): Record<Topic, MasteryStat> {
  const out = {} as Record<Topic, MasteryStat>;
  for (const t of Object.keys(TOPIC_LABELS) as Topic[]) out[t] = { attempts: 0, best: 0, total: 0 };
  return out;
}

export interface ChallengeOutcome {
  /** XP earned for this attempt (before multipliers). */
  xp: number;
  firstPass: boolean;
  newBest: boolean;
  previousBest: number;
  newConcepts: string[];
}

/**
 * Record a challenge attempt. XP is earned only for progress: the first pass
 * pays for the whole score, later attempts pay only for beating your best,
 * so replaying for practice is always allowed but cannot be farmed.
 */
export function recordChallenge(
  profile: PlayerProfile,
  result: ChallengeResult,
  topic: Topic,
  conceptTitles: Record<string, string> = {},
  time = Date.now(),
): ChallengeOutcome {
  const prior = profile.challengeHistory.filter((h) => h.id === result.challengeId);
  const previousBest = prior.reduce((m, h) => Math.max(m, h.score), 0);
  const passedBefore = prior.some((h) => h.passed);
  const score = Math.max(0, Math.min(100, Math.round(result.score)));

  profile.challengeHistory.push({ id: result.challengeId, score, passed: result.passed, hintsUsed: result.hintsUsed, at: time });
  if (profile.challengeHistory.length > HISTORY_CAP) profile.challengeHistory.splice(0, profile.challengeHistory.length - HISTORY_CAP);

  const m = profile.mastery[topic] ?? (profile.mastery[topic] = { attempts: 0, best: 0, total: 0 });
  m.attempts++;
  m.total += score;
  m.best = Math.max(m.best, score);

  const firstPass = result.passed && !passedBefore;
  const newBest = score > previousBest;
  let xp = 0;
  if (result.passed) {
    if (firstPass) xp = Math.round(score * 1.5);
    else if (newBest) xp = Math.round((score - previousBest) * 1.5);
  }
  if (firstPass) profile.stats.challengesPassed++;

  const name = TOPIC_LABELS[topic];
  addJournal(profile, 'challenge', `${result.passed ? 'Passed' : 'Attempted'}: ${result.challengeId}`, `${name} — score ${score}/100${result.hintsUsed ? `, ${result.hintsUsed} hint(s)` : ''}.`, time);
  for (const mistake of result.mistakes) addJournal(profile, 'mistake', 'Lesson learned', mistake, time);

  const newConcepts: string[] = [];
  for (const id of result.conceptsPracticed) {
    if (profile.concepts.includes(id)) continue;
    profile.concepts.push(id);
    newConcepts.push(id);
    addJournal(profile, 'concept', conceptTitles[id] ?? id, `New concept card unlocked (${name}).`, time);
  }
  return { xp, firstPass, newBest, previousBest, newConcepts };
}

/** 0..100 mastery for a topic: mostly best score, partly consistency. */
export function masteryPercent(profile: PlayerProfile, topic: Topic): number {
  const m = profile.mastery[topic];
  if (!m || m.attempts === 0) return 0;
  return Math.round(m.best * 0.7 + (m.total / m.attempts) * 0.3);
}

/** Up to three topics worth practicing next: untried first, then weakest. */
export function suggestions(profile: PlayerProfile): Topic[] {
  const topics = Object.keys(TOPIC_LABELS) as Topic[];
  return topics
    .map((t) => ({ t, tried: (profile.mastery[t]?.attempts ?? 0) > 0, pct: masteryPercent(profile, t) }))
    .filter((x) => !x.tried || x.pct < 85)
    .sort((a, b) => (a.tried === b.tried ? a.pct - b.pct : a.tried ? 1 : -1))
    .slice(0, 3)
    .map((x) => x.t);
}
