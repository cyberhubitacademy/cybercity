import { describe, expect, it } from 'vitest';
import { addXp, grantReward, masteryPercent, recordChallenge, suggestions, xpToNext } from '../src/progression/progression';
import { canUnlock, effects, unlockSkill } from '../src/progression/skills';
import { buy, equipShirt } from '../src/progression/shop';
import { newProfile } from '../src/progression/SaveManager';
import type { ChallengeResult } from '../src/cyber/types';

const result = (score: number, passed = score >= 60, extra: Partial<ChallengeResult> = {}): ChallengeResult => ({
  challengeId: 'phishing-1',
  score,
  passed,
  breakdown: [],
  conceptsPracticed: ['phishing-lookalike-domains'],
  mistakes: [],
  hintsUsed: 0,
  ...extra,
});

describe('xp and levels', () => {
  it('has an increasing curve', () => {
    expect(xpToNext(1)).toBe(200);
    expect(xpToNext(2)).toBeGreaterThan(xpToNext(1));
  });

  it('levels up with carry-over and grants skill points', () => {
    const p = newProfile(0);
    expect(addXp(p, 199)).toBe(0);
    expect(addXp(p, 1)).toBe(1);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(0);
    expect(p.skillPoints).toBe(1);
    const ups = addXp(p, xpToNext(2) + xpToNext(3) + 10);
    expect(ups).toBe(2);
    expect(p.level).toBe(4);
    expect(p.xp).toBe(10);
    expect(addXp(p, -50)).toBe(0);
  });

  it('grantReward applies multipliers, clamps rep and adds items once', () => {
    const p = newProfile(0);
    const start = p.credits;
    const r = grantReward(p, { xp: 100, credits: 1000, rep: { agency: 80, community: 5 }, item: 'wifi-analyzer' }, { xpMult: 1.25, creditMult: 1.15 });
    expect(r.xp).toBe(125);
    expect(r.credits).toBe(1150);
    expect(p.credits).toBe(start + 1150);
    expect(p.rep.agency).toBe(80);
    grantReward(p, { xp: 0, credits: 0, rep: { agency: 80 }, item: 'wifi-analyzer' });
    expect(p.rep.agency).toBe(100);
    expect(p.inventory.filter((i) => i === 'wifi-analyzer')).toHaveLength(1);
  });
});

describe('challenge records', () => {
  it('pays full XP on first pass, only improvement on replays (no farming)', () => {
    const p = newProfile(0);
    const fail = recordChallenge(p, result(40), 'phishing');
    expect(fail.xp).toBe(0);
    const first = recordChallenge(p, result(70), 'phishing');
    expect(first.firstPass).toBe(true);
    expect(first.xp).toBe(105);
    const same = recordChallenge(p, result(70), 'phishing');
    expect(same.xp).toBe(0);
    const lower = recordChallenge(p, result(65), 'phishing');
    expect(lower.xp).toBe(0);
    const better = recordChallenge(p, result(90), 'phishing');
    expect(better.newBest).toBe(true);
    expect(better.xp).toBe(30);
    expect(p.stats.challengesPassed).toBe(1);
    expect(p.mastery.phishing.attempts).toBe(5);
    expect(p.mastery.phishing.best).toBe(90);
  });

  it('records concepts once and mistakes into the journal', () => {
    const p = newProfile(0);
    const o = recordChallenge(p, result(80, true, { mistakes: ['Clicked the fake link'] }), 'phishing', { 'phishing-lookalike-domains': 'Lookalike domains' });
    expect(o.newConcepts).toEqual(['phishing-lookalike-domains']);
    expect(p.journal.some((j) => j.kind === 'mistake')).toBe(true);
    expect(p.journal.some((j) => j.kind === 'concept' && j.title === 'Lookalike domains')).toBe(true);
    expect(recordChallenge(p, result(90), 'phishing').newConcepts).toEqual([]);
  });

  it('mastery and suggestions', () => {
    const p = newProfile(0);
    expect(masteryPercent(p, 'phishing')).toBe(0);
    recordChallenge(p, result(100), 'phishing');
    expect(masteryPercent(p, 'phishing')).toBe(100);
    const s = suggestions(p);
    expect(s).toHaveLength(3);
    expect(s).not.toContain('phishing');
  });
});

describe('skills', () => {
  it('requires points and tier prerequisites', () => {
    const p = newProfile(0);
    expect(canUnlock(p, 'hint-master').ok).toBe(false); // no points
    p.skillPoints = 3;
    expect(unlockSkill(p, 'analyst-pro').ok).toBe(false); // needs tier 1
    expect(unlockSkill(p, 'hint-master').ok).toBe(true);
    expect(unlockSkill(p, 'hint-master').ok).toBe(false); // owned
    expect(unlockSkill(p, 'analyst-pro').ok).toBe(true);
    expect(p.skillPoints).toBe(1);
    expect(unlockSkill(p, 'nope').ok).toBe(false);
  });

  it('aggregates effects from skills and upgrades', () => {
    const p = newProfile(0);
    expect(effects(p)).toMatchObject({ bonusHints: 0, xpMult: 1, maxHealth: 100, shardRadar: false });
    p.skills.push('hint-master', 'analyst-pro', 'mentor-network', 'quick-feet', 'street-smart', 'iron-will', 'negotiator', 'gearhead', 'radio-dj');
    p.inventory.push('workstation-upgrade', 'turbo-kit', 'running-shoes');
    const e = effects(p);
    expect(e.bonusHints).toBe(3);
    expect(e.xpMult).toBe(1.25);
    expect(e.creditMult).toBe(1.15);
    expect(e.maxHealth).toBe(150);
    expect(e.staminaMult).toBeCloseTo(1.875);
    expect(e.carSpeedMult).toBeCloseTo(1.265);
    expect(e.shardRadar).toBe(true);
    expect(e.bonusStation).toBe(true);
  });
});

describe('shop', () => {
  it('validates credits, ownership and sale status', () => {
    const p = newProfile(0);
    p.credits = 500;
    expect(buy(p, 'turbo-kit').ok).toBe(false); // too expensive
    expect(buy(p, 'running-shoes').ok).toBe(true);
    expect(p.credits).toBe(200);
    expect(buy(p, 'running-shoes').ok).toBe(false); // owned
    expect(buy(p, 'wifi-analyzer').ok).toBe(false); // not for sale
    expect(buy(p, 'shirt-sunset').ok).toBe(true);
    expect(p.cosmetics.shirt).toBe('shirt-sunset');
    expect(equipShirt(p, 'shirt-midnight')).toBe(false);
    expect(equipShirt(p, 'default')).toBe(true);
  });

  it('medkit heals to max and can be bought repeatedly', () => {
    const p = newProfile(0);
    p.credits = 300;
    expect(buy(p, 'medkit').ok).toBe(false); // already full
    p.health = 20;
    expect(buy(p, 'medkit').ok).toBe(true);
    expect(p.health).toBe(100);
    p.health = 50;
    expect(buy(p, 'medkit').ok).toBe(true);
    expect(p.credits).toBe(100);
    expect(p.inventory).not.toContain('medkit');
  });
});
