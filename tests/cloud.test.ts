import { describe, expect, it } from 'vitest';
import { freshCloud, perfectCloud, posture, scoreCloud } from '../src/cyber/challenges/cloud/logic';
import { newProfile, validateProfile } from '../src/progression/SaveManager';

describe('cloud breach', () => {
  it('perfect answers score 100', () => {
    expect(scoreCloud(perfectCloud()).score).toBe(100);
  });
  it('empty answers fail', () => {
    expect(scoreCloud(freshCloud()).score).toBeLessThan(65);
  });
  it('posture rises only with correct fixes', () => {
    expect(posture({})).toBe(0);
    expect(posture({ bucket: 'rename' })).toBe(0);
    expect(posture({ bucket: 'block' })).toBeGreaterThan(0);
    expect(posture(perfectCloud().fixes)).toBe(100);
  });
  it('misattributing the key loses investigation points', () => {
    const p = perfectCloud();
    p.key = 'ASIAROLEapp7';
    expect(scoreCloud(p).score).toBeLessThan(100);
  });
});

describe('save compatibility with Season 2 topics', () => {
  it('an old save without the new topics loads and gets empty mastery for them', () => {
    const p = newProfile(0) as unknown as { mastery: Record<string, unknown> };
    for (const t of ['web', 'cloud', 'ai', 'ics', 'supplychain']) delete p.mastery[t];
    const loaded = validateProfile(JSON.parse(JSON.stringify(p)));
    expect(loaded).not.toBeNull();
    expect(loaded!.mastery.cloud).toEqual({ attempts: 0, best: 0, total: 0 });
    expect(loaded!.mastery.supplychain).toEqual({ attempts: 0, best: 0, total: 0 });
  });
});
