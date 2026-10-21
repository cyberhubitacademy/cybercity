import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SETTINGS_KEY, SaveManager, newProfile, validateProfile, type StorageLike } from '../src/progression/SaveManager';
import { DEFAULT_SETTINGS, SAVE_VERSION } from '../src/progression/types';
import { recordChallenge } from '../src/progression/progression';

class MemStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('SaveManager', () => {
  it('round-trips a profile', () => {
    const store = new MemStorage();
    const sm = new SaveManager(store);
    expect(sm.load()).toBeNull();
    expect(sm.hasSave()).toBe(false);
    const p = newProfile(1);
    p.credits = 4321;
    p.level = 5;
    p.skills.push('hint-master');
    p.shards.push('shard-3');
    p.missions.completed.push('m01-welcome');
    recordChallenge(p, { challengeId: 'traffic-1', score: 88, passed: true, breakdown: [], conceptsPracticed: ['networking-ports'], mistakes: [], hintsUsed: 1 }, 'networking');
    expect(sm.save(p)).toBe(true);
    const back = sm.load();
    expect(back).toEqual(p);
    expect(sm.hasSave()).toBe(true);
    sm.reset();
    expect(sm.load()).toBeNull();
  });

  it('returns null for corrupt or foreign data, never throws', () => {
    const store = new MemStorage();
    const sm = new SaveManager(store);
    for (const bad of ['{not json', 'null', '42', '"text"', '[]', JSON.stringify({ hello: 'world' }), JSON.stringify({ version: 99, level: 1, xp: 0, credits: 0 }), JSON.stringify({ version: SAVE_VERSION, level: 'one', xp: 0, credits: 0 })]) {
      store.setItem(SAVE_KEY, bad);
      expect(sm.load()).toBeNull();
    }
    expect(new SaveManager(null).load()).toBeNull();
    const throwing: StorageLike = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    const sm2 = new SaveManager(throwing);
    expect(sm2.load()).toBeNull();
    expect(sm2.save(newProfile())).toBe(false);
    expect(() => sm2.reset()).not.toThrow();
    expect(sm2.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('fills missing optional fields with defaults and clamps values', () => {
    const p = validateProfile({ version: SAVE_VERSION, level: 99, xp: -5, credits: 1e12, rep: { agency: 500 }, health: 'x', journal: [{ title: 'ok', text: 'ok', kind: 'weird' }, 5] });
    expect(p).not.toBeNull();
    expect(p!.level).toBe(30);
    expect(p!.xp).toBe(0);
    expect(p!.credits).toBe(1e9);
    expect(p!.rep.agency).toBe(100);
    expect(p!.rep.community).toBe(0);
    expect(p!.health).toBe(100);
    expect(p!.journal).toHaveLength(1);
    expect(p!.journal[0].kind).toBe('mission');
    expect(p!.mastery.crypto).toEqual({ attempts: 0, best: 0, total: 0 });
    expect(p!.missions.completed).toEqual([]);
  });

  it('migrates a version-1 save', () => {
    const v1 = { version: 1, level: 3, xp: 50, money: 777, skills: ['quick-feet'] };
    const p = validateProfile(v1);
    expect(p?.version).toBe(SAVE_VERSION);
    expect(p?.credits).toBe(777);
    expect(p?.cosmetics.shirt).toBe('default');
    expect(p?.stats.challengesPassed).toBe(0);
    expect(p?.skills).toEqual(['quick-feet']);
  });

  it('settings merge with defaults and reject bad values', () => {
    const store = new MemStorage();
    const sm = new SaveManager(store);
    expect(sm.loadSettings()).toEqual(DEFAULT_SETTINGS);
    store.setItem(SETTINGS_KEY, JSON.stringify({ music: 3, quality: 'insane', invertY: true, mouseSensitivity: 'fast' }));
    const s = sm.loadSettings();
    expect(s.music).toBe(1);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.invertY).toBe(true);
    expect(s.mouseSensitivity).toBe(DEFAULT_SETTINGS.mouseSensitivity);
    sm.saveSettings({ ...DEFAULT_SETTINGS, quality: 'low' });
    expect(sm.loadSettings().quality).toBe('low');
  });
});
