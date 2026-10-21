import { describe, expect, it } from 'vitest';
import { MissionManager, objectiveTarget, giverPosition } from '../src/missions/MissionManager';
import { MISSIONS } from '../src/missions/data';
import type { MissionDef } from '../src/missions/types';
import { PLACES } from '../src/world/layout';
import { TERMINALS, POSTS } from '../src/world/spots';

const CHALLENGE_IDS = ['phishing-1', 'traffic-1', 'firewall-1', 'password-1', 'social-1', 'malware-1', 'forensics-1', 'crypto-1', 'incident-1'];

function finishWelcome(mm: MissionManager) {
  mm.handle({ type: 'reach', place: 'hq' });
  return mm.handle({ type: 'talk', npc: 'max' });
}

describe('mission data', () => {
  it('references only existing places, terminals, npcs, challenges and missions', () => {
    const ids = new Set(MISSIONS.map((m) => m.id));
    expect(ids.size).toBe(MISSIONS.length);
    for (const m of MISSIONS) {
      for (const p of m.prerequisites) expect(ids.has(p)).toBe(true);
      if (m.giver) expect(POSTS.some((p) => p.npc === m.giver)).toBe(true);
      expect(m.objectives.length).toBeGreaterThan(0);
      for (const o of m.objectives) {
        if (o.type === 'goto') expect(PLACES[o.place]).toBeDefined();
        if (o.type === 'talk') expect(POSTS.some((p) => p.npc === o.npc)).toBe(true);
        if (o.type === 'challenge') {
          expect(TERMINALS.some((t) => t.id === o.terminal)).toBe(true);
          expect(CHALLENGE_IDS).toContain(o.challenge);
        }
        if (o.type !== 'drive') expect(objectiveTarget(o)).not.toBeNull();
      }
    }
    // every challenge is used by at least one mission
    const used = new Set(MISSIONS.flatMap((m) => m.objectives.flatMap((o) => (o.type === 'challenge' ? [o.challenge] : []))));
    for (const c of CHALLENGE_IDS) expect(used.has(c)).toBe(true);
  });
});

describe('MissionManager', () => {
  it('auto-starts the welcome mission on a fresh state', () => {
    const mm = new MissionManager(MISSIONS);
    expect(mm.status('m01-welcome')).toBe('active');
    expect(mm.active()?.objective.type).toBe('goto');
    expect(mm.status('m02-phish')).toBe('locked');
  });

  it('ignores events that do not match the current objective', () => {
    const mm = new MissionManager(MISSIONS);
    expect(mm.handle({ type: 'talk', npc: 'max' }).advanced).toBe(false);
    expect(mm.handle({ type: 'reach', place: 'cafe' }).advanced).toBe(false);
    expect(mm.active()?.index).toBe(0);
  });

  it('completes a mission, grants once, and unlocks follow-ups', () => {
    const mm = new MissionManager(MISSIONS);
    const a = mm.handle({ type: 'reach', place: 'hq' });
    expect(a.advanced).toBe(true);
    expect(a.objective?.type).toBe('talk');
    const done = mm.handle({ type: 'talk', npc: 'max' });
    expect(done.completed?.id).toBe('m01-welcome');
    expect(done.finished?.id).toBe('m01-welcome');
    expect(mm.status('m01-welcome')).toBe('completed');
    expect(mm.status('m02-phish')).toBe('available');
    expect(mm.offeredBy('max').map((m) => m.id)).toContain('m02-phish');
    expect(mm.active()).toBeNull();
    // further events do nothing and never re-grant
    expect(mm.handle({ type: 'talk', npc: 'max' }).completed).toBeUndefined();
  });

  it('only accepts available missions and one at a time', () => {
    const mm = new MissionManager(MISSIONS);
    expect(mm.accept('m02-phish')).toBe(false); // locked + something active
    finishWelcome(mm);
    expect(mm.accept('m03-wire')).toBe(false); // locked
    expect(mm.accept('m02-phish')).toBe(true);
    expect(mm.accept('side-social')).toBe(false); // already busy
  });

  it('challenge objective needs a pass; a fail can be retried', () => {
    const mm = new MissionManager(MISSIONS);
    finishWelcome(mm);
    mm.accept('m02-phish');
    mm.handle({ type: 'reach', place: 'cafe' });
    mm.handle({ type: 'talk', npc: 'carla' });
    expect(mm.handle({ type: 'challenge', id: 'phishing-1', passed: false }).advanced).toBe(false);
    expect(mm.handle({ type: 'challenge', id: 'traffic-1', passed: true }).advanced).toBe(false);
    const r = mm.handle({ type: 'challenge', id: 'phishing-1', passed: true });
    expect(r.completed?.id).toBe('m02-phish');
    expect(mm.status('side-wifi')).toBe('available');
    expect(mm.status('side-social')).toBe('available');
  });

  it('drive + chase objectives; a lost chase fails back to available', () => {
    const state = { completed: ['m01-welcome', 'm02-phish', 'm03-wire', 'm04-walls'], active: null, objectiveIndex: 0, collected: [], started: ['m01-welcome'] };
    const mm = new MissionManager(MISSIONS, state);
    expect(mm.accept('m05-chase')).toBe(true);
    expect(mm.handle({ type: 'drive' }).objective?.type).toBe('chase');
    const fail = mm.handle({ type: 'chase', success: false });
    expect(fail.failed).toBeTruthy();
    expect(mm.status('m05-chase')).toBe('available');
    expect(mm.accept('m05-chase')).toBe(true);
    mm.handle({ type: 'drive' });
    expect(mm.handle({ type: 'chase', success: true }).advanced).toBe(true);
    expect(mm.handle({ type: 'talk', npc: 'max' }).completed?.id).toBe('m05-chase');
  });

  it('timeout fails a timed collect but not a plain goto', () => {
    const state = { completed: ['m01-welcome', 'm02-phish'], active: null, objectiveIndex: 0, collected: [], started: ['m01-welcome'] };
    const mm = new MissionManager(MISSIONS, state);
    mm.accept('side-social');
    expect(mm.handle({ type: 'timeout' }).failed).toBeUndefined();
    mm.abandon();
    mm.accept('side-wifi');
    expect(mm.handle({ type: 'timeout' }).failed).toBeTruthy();
    expect(mm.status('side-wifi')).toBe('available');
  });

  it('collect objective tracks unique items and completes when all are found', () => {
    const state = { completed: ['m01-welcome', 'm02-phish'], active: null, objectiveIndex: 0, collected: [], started: ['m01-welcome'] };
    const mm = new MissionManager(MISSIONS, state);
    mm.accept('side-wifi');
    const items = mm.remainingItems();
    expect(items).toHaveLength(4);
    expect(mm.handle({ type: 'collect', item: items[0].id }).advanced).toBe(false);
    mm.handle({ type: 'collect', item: items[0].id }); // duplicate ignored
    expect(mm.collectedCount()).toBe(1);
    expect(mm.handle({ type: 'collect', item: 'not-an-ap' }).advanced).toBe(false);
    mm.handle({ type: 'collect', item: items[1].id });
    mm.handle({ type: 'collect', item: items[2].id });
    const r = mm.handle({ type: 'collect', item: items[3].id });
    expect(r.completed?.id).toBe('side-wifi');
    expect(r.completed?.rewards.item).toBe('wifi-analyzer');
  });

  it('replays never re-grant rewards', () => {
    const mm = new MissionManager(MISSIONS);
    finishWelcome(mm);
    expect(mm.replay('m01-welcome')).toBe(true);
    expect(mm.active()?.replay).toBe(true);
    const r = finishWelcome(mm);
    expect(r.finished?.id).toBe('m01-welcome');
    expect(r.completed).toBeUndefined();
    expect(mm.replay('m09-final')).toBe(false);
  });

  it('serializes and restores mid-mission, and sanitizes bad saves', () => {
    const mm = new MissionManager(MISSIONS);
    finishWelcome(mm);
    mm.accept('m02-phish');
    mm.handle({ type: 'reach', place: 'cafe' });
    const saved = JSON.parse(JSON.stringify(mm.serialize()));
    const mm2 = new MissionManager(MISSIONS, saved);
    expect(mm2.active()?.def.id).toBe('m02-phish');
    expect(mm2.active()?.index).toBe(1);
    expect(mm2.status('m01-welcome')).toBe('completed');

    const bad = new MissionManager(MISSIONS, { completed: ['nope', 'm01-welcome'], active: 'ghost', objectiveIndex: 99, collected: [], started: [] });
    expect(bad.status('m01-welcome')).toBe('completed');
    expect(bad.active()).toBeNull();
  });

  it('auto-start does not restart a completed welcome mission', () => {
    const mm = new MissionManager(MISSIONS, { completed: ['m01-welcome'], active: null, objectiveIndex: 0, collected: [], started: [] });
    expect(mm.active()).toBeNull();
  });

  it('a full story run completes every main mission in order', () => {
    const mm = new MissionManager(MISSIONS);
    const solve = (def: MissionDef) => {
      for (const o of def.objectives) {
        if (o.type === 'goto') mm.handle({ type: 'reach', place: o.place });
        else if (o.type === 'talk') mm.handle({ type: 'talk', npc: o.npc });
        else if (o.type === 'challenge') mm.handle({ type: 'challenge', id: o.challenge, passed: true });
        else if (o.type === 'drive') mm.handle({ type: 'drive' });
        else if (o.type === 'chase') mm.handle({ type: 'chase', success: true });
        else for (const i of o.items) mm.handle({ type: 'collect', item: i.id });
      }
    };
    const main = MISSIONS.filter((m) => m.chapter !== 'side');
    for (const m of main) {
      if (m.giver) expect(mm.accept(m.id)).toBe(true);
      solve(m);
      expect(mm.status(m.id)).toBe('completed');
    }
    expect(mm.completedCount()).toBe(main.length);
    expect(giverPosition(MISSIONS[1])).not.toBeNull();
  });
});
