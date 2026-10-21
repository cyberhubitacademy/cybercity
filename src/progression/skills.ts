import type { PlayerProfile } from './types';

// Skill tree: three branches of three tiers. Each tier needs the one before it.
// Skills only make play easier or richer; no lesson is ever locked behind them.

export type SkillBranch = 'analyst' | 'street' | 'hustle';

export interface SkillDef {
  id: string;
  name: string;
  branch: SkillBranch;
  tier: 1 | 2 | 3;
  requires: string | null;
  description: string;
}

export const SKILL_BRANCHES: Record<SkillBranch, string> = {
  analyst: 'Analyst',
  street: 'Street',
  hustle: 'Hustle',
};

export const SKILLS: SkillDef[] = [
  { id: 'hint-master', name: 'Hint Master', branch: 'analyst', tier: 1, requires: null, description: '+1 free hint in every challenge.' },
  { id: 'analyst-pro', name: 'Analyst Pro', branch: 'analyst', tier: 2, requires: 'hint-master', description: '+1 more free hint in every challenge.' },
  { id: 'mentor-network', name: 'Mentor Network', branch: 'analyst', tier: 3, requires: 'analyst-pro', description: '+25% XP from missions and challenges.' },
  { id: 'quick-feet', name: 'Quick Feet', branch: 'street', tier: 1, requires: null, description: '+50% sprint stamina.' },
  { id: 'street-smart', name: 'Street Smart', branch: 'street', tier: 2, requires: 'quick-feet', description: 'Hidden data shards show on the minimap.' },
  { id: 'iron-will', name: 'Iron Will', branch: 'street', tier: 3, requires: 'street-smart', description: '+50 maximum health.' },
  { id: 'negotiator', name: 'Negotiator', branch: 'hustle', tier: 1, requires: null, description: '+15% credits from rewards.' },
  { id: 'gearhead', name: 'Gearhead', branch: 'hustle', tier: 2, requires: 'negotiator', description: '+15% vehicle top speed.' },
  { id: 'radio-dj', name: 'Radio DJ', branch: 'hustle', tier: 3, requires: 'gearhead', description: 'Unlocks a bonus radio station.' },
];

const byId = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(id: string): SkillDef | undefined {
  return byId.get(id);
}

export type UnlockCheck = { ok: true } | { ok: false; reason: string };

export function canUnlock(profile: PlayerProfile, id: string): UnlockCheck {
  const s = byId.get(id);
  if (!s) return { ok: false, reason: 'Unknown skill.' };
  if (profile.skills.includes(id)) return { ok: false, reason: 'Already learned.' };
  if (s.requires && !profile.skills.includes(s.requires)) return { ok: false, reason: `Requires ${byId.get(s.requires)?.name ?? s.requires}.` };
  if (profile.skillPoints < 1) return { ok: false, reason: 'No skill points. Level up to earn more.' };
  return { ok: true };
}

export function unlockSkill(profile: PlayerProfile, id: string): UnlockCheck {
  const check = canUnlock(profile, id);
  if (check.ok) {
    profile.skills.push(id);
    profile.skillPoints -= 1;
  }
  return check;
}

export interface Effects {
  bonusHints: number;
  xpMult: number;
  creditMult: number;
  staminaMult: number;
  maxHealth: number;
  carSpeedMult: number;
  shardRadar: boolean;
  bonusStation: boolean;
}

/** Aggregate gameplay modifiers from skills and owned shop upgrades. */
export function effects(profile: PlayerProfile): Effects {
  const has = (id: string) => profile.skills.includes(id);
  const owns = (id: string) => profile.inventory.includes(id);
  return {
    bonusHints: (has('hint-master') ? 1 : 0) + (has('analyst-pro') ? 1 : 0) + (owns('workstation-upgrade') ? 1 : 0),
    xpMult: has('mentor-network') ? 1.25 : 1,
    creditMult: has('negotiator') ? 1.15 : 1,
    staminaMult: (has('quick-feet') ? 1.5 : 1) * (owns('running-shoes') ? 1.25 : 1),
    maxHealth: 100 + (has('iron-will') ? 50 : 0),
    carSpeedMult: (has('gearhead') ? 1.15 : 1) * (owns('turbo-kit') ? 1.1 : 1),
    shardRadar: has('street-smart'),
    bonusStation: has('radio-dj'),
  };
}
