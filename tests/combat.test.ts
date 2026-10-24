import { describe, expect, it } from 'vitest';
import { Arsenal, WEAPONS, applyDamage, damageAt, partMultiplier, spreadFor } from '../src/systems/combat/weapons';
import { EnemyBrain, enemyHitChance, type Perception } from '../src/systems/combat/ai';
import { ENEMY_TYPES, enemyCap, enemyType } from '../src/systems/combat/enemyTypes';
import { Robbery } from '../src/systems/crime/robbery';
import { CREW, escapeStars, heistPayout, validPlan, vaultTime, type HeistPlan } from '../src/systems/crime/heist';

// Pure combat logic: weapons, ammo, reloads, damage, enemy AI and crime state machines.

describe('weapons', () => {
  it('fires, empties the magazine and auto-reloads from reserve', () => {
    const a = new Arsenal();
    a.give('pistol', 20);
    a.select('pistol');
    expect(a.state.mag).toBe(12);
    expect(a.state.reserve).toBe(8);
    let shots = 0;
    for (let i = 0; i < 40; i++) {
      if (a.fire()) shots++;
      a.update(0.3);
    }
    expect(shots).toBe(20);
    expect(a.totalAmmo('pistol')).toBe(0);
  });

  it('respects fire rate and reload time', () => {
    const a = new Arsenal();
    a.give('rifle', 90);
    a.select('rifle');
    a.cooldown = 0;
    expect(a.fire()).toBe(true);
    expect(a.fire()).toBe(false); // cooldown 1/8 s
    a.update(1 / 8 + 0.001);
    expect(a.fire()).toBe(true);
    expect(a.startReload()).toBe(true);
    expect(a.reloading).toBe(true);
    expect(a.fire()).toBe(false);
    expect(a.update(WEAPONS.rifle.reloadTime + 0.01)).toBe(true);
    expect(a.state.mag).toBe(30);
  });

  it('extended magazine adds 50% and reload never exceeds reserve', () => {
    const a = new Arsenal();
    a.give('smg', 34);
    a.select('smg');
    a.addUpgrade('smg', 'extmag');
    expect(a.magSize('smg')).toBe(45);
    a.startReload();
    a.update(5);
    expect(a.state.mag).toBe(34);
    expect(a.state.reserve).toBe(0);
  });

  it('quick slots cycle owned weapons and holster falls back to fists', () => {
    const a = new Arsenal();
    a.give('smg', 30);
    a.give('shotgun', 7);
    expect(a.selectSlot(3)).toBe('smg');
    expect(a.selectSlot(3)).toBe('shotgun');
    expect(a.selectSlot(5)).toBeNull();
    a.holster();
    expect(a.active).toBe('fists');
  });

  it('headshots and falloff change damage; armor soaks most of it', () => {
    expect(partMultiplier(WEAPONS.pistol, 'head')).toBeGreaterThan(2);
    expect(partMultiplier(WEAPONS.sniper, 'head')).toBe(4);
    expect(damageAt(WEAPONS.pistol, 'body', 5)).toBe(WEAPONS.pistol.damage);
    expect(damageAt(WEAPONS.pistol, 'body', 44)).toBeLessThan(WEAPONS.pistol.damage);
    expect(damageAt(WEAPONS.pistol, 'limb', 5)).toBeLessThan(damageAt(WEAPONS.pistol, 'body', 5));
    const r = applyDamage(100, 50, 30);
    expect(r.armor).toBe(26);
    expect(r.health).toBe(94);
    expect(applyDamage(10, 0, 50).health).toBe(0);
  });

  it('aiming tightens spread; moving widens it', () => {
    const d = WEAPONS.rifle;
    expect(spreadFor(d, true, false, 0)).toBeLessThan(spreadFor(d, false, false, 0));
    expect(spreadFor(d, true, true, 0)).toBeGreaterThan(spreadFor(d, true, false, 0));
    expect(spreadFor(d, true, false, 0, true)).toBeLessThan(spreadFor(d, true, false, 0));
  });

  it('busted confiscates firearms but keeps melee; save round-trips', () => {
    const a = new Arsenal();
    a.give('bat', 0);
    a.give('rifle', 60);
    a.addUpgrade('rifle', 'suppressor');
    a.select('rifle');
    const saved = JSON.parse(JSON.stringify(a.save()));
    const b = new Arsenal();
    b.load(saved);
    expect(b.current).toBe('rifle');
    expect(b.hasUpgrade('rifle', 'suppressor')).toBe(true);
    expect(b.confiscate()).toEqual(['rifle']);
    expect(b.has('bat')).toBe(true);
    expect(b.current).toBe('fists');
  });

  it('open carry: rifles yes, concealed pistol no', () => {
    const a = new Arsenal();
    a.give('pistol', 12);
    a.give('rifle', 30);
    a.select('pistol');
    expect(a.openCarry()).toBe(false);
    a.select('rifle');
    expect(a.openCarry()).toBe(true);
    a.holster();
    expect(a.openCarry()).toBe(false);
  });
});

const P = (o: Partial<Perception> = {}): Perception => ({ dist: 20, canSee: false, heard: false, health: 1, hasCover: false, suppressed: 0, melee: false, ...o });

describe('enemy AI', () => {
  it('patrol notices the player over time, then attacks in range', () => {
    const b = new EnemyBrain(ENEMY_TYPES.lotus.tune, () => 0.9);
    expect(b.update(0.2, P({ canSee: true }))).not.toBe('attack');
    for (let i = 0; i < 20; i++) b.update(0.1, P({ canSee: true }));
    expect(b.state).toBe('attack');
  });

  it('hearing a gunshot makes a patrol alert, then chase on sight', () => {
    const b = new EnemyBrain(ENEMY_TYPES.gang.tune, () => 0.9);
    b.update(0.1, P({ heard: true }));
    expect(b.state).toBe('alert');
    for (let i = 0; i < 10; i++) b.update(0.1, P({ canSee: true, dist: 8 }));
    expect(['chase', 'attack']).toContain(b.state);
  });

  it('heavy suppression sends an attacker to cover, then it peeks back out', () => {
    const b = new EnemyBrain(ENEMY_TYPES.lotus.tune, () => 0.1);
    b.alert();
    b.update(0.1, P({ canSee: true, dist: 10 }));
    expect(b.state).toBe('attack');
    for (let i = 0; i < 10; i++) b.update(0.1, P({ canSee: true, dist: 10, suppressed: 0.9, hasCover: true }));
    expect(b.state).toBe('cover');
    for (let i = 0; i < 40; i++) b.update(0.1, P({ canSee: true, dist: 10, suppressed: 0.1, hasCover: true }));
    expect(b.state).toBe('attack');
  });

  it('losing sight leads to flanking or chasing; runners flee', () => {
    const b = new EnemyBrain(ENEMY_TYPES.lotus.tune, () => 0.2);
    b.alert();
    b.update(0.1, P({ canSee: true, dist: 10 }));
    for (let i = 0; i < 30; i++) b.update(0.1, P({ canSee: false, dist: 10 }));
    expect(['flank', 'chase']).toContain(b.state);
    const r = new EnemyBrain(ENEMY_TYPES.intruder.tune);
    r.alert();
    expect(r.state).toBe('flee');
  });

  it('badly hurt cowards may flee; locked states never change', () => {
    const b = new EnemyBrain({ ...ENEMY_TYPES.gang.tune, cowardice: 50 }, () => 0);
    b.alert();
    b.update(0.1, P({ canSee: true, dist: 10 }));
    for (let i = 0; i < 20; i++) b.update(0.1, P({ canSee: true, dist: 10, health: 0.1 }));
    expect(b.state).toBe('flee');
    b.set('dead');
    b.update(1, P({ canSee: true, heard: true }));
    b.alert();
    expect(b.state).toBe('dead');
  });

  it('wants to fire only while attacking with a view; melee needs to be close', () => {
    const b = new EnemyBrain(ENEMY_TYPES.thug.tune, () => 0.9);
    b.alert();
    b.update(0.1, P({ canSee: true, dist: 1.5, melee: true }));
    b.update(0.1, P({ canSee: true, dist: 1.5, melee: true }));
    expect(b.wantsFire).toBe(true);
    b.update(0.1, P({ canSee: true, dist: 1.6, melee: true, }));
    b.update(0.1, P({ canSee: true, dist: 5, melee: true }));
    expect(b.wantsFire).toBe(false);
  });

  it('accuracy falls with distance, movement and cover', () => {
    const near = enemyHitChance(0.4, 5, 0, false);
    expect(enemyHitChance(0.4, 60, 0, false)).toBeLessThan(near);
    expect(enemyHitChance(0.4, 5, 7, false)).toBeLessThan(near);
    expect(enemyHitChance(0.4, 5, 0, true)).toBeLessThan(near * 0.5);
    expect(enemyHitChance(0.4, 5, 0, false, 0.5)).toBeLessThan(near);
  });

  it('enemy types are well formed and capped by quality', () => {
    for (const t of Object.values(ENEMY_TYPES)) {
      expect(t.health).toBeGreaterThan(0);
      expect(t.weapons.length).toBeGreaterThan(0);
      for (const w of t.weapons) expect(WEAPONS[w]).toBeDefined();
    }
    expect(enemyType('nope').id).toBe('lotus');
    expect(enemyCap('low')).toBeLessThan(enemyCap('ultra'));
  });
});

describe('store robbery state machine', () => {
  it('aim -> intimidate -> fill the bag -> alarm -> grab the cash', () => {
    const r = new Robbery(800, () => 0.5);
    const events: string[] = [];
    let cash = 0;
    r.events = { alarm: (s) => events.push(`alarm${s}`), done: (c) => { cash = c; events.push('done'); } };
    r.update(0.1, { aiming: true, dist: 4, shots: false });
    expect(r.phase).toBe('intimidate');
    for (let i = 0; i < 15; i++) r.update(0.1, { aiming: true, dist: 4, shots: false });
    expect(r.phase).toBe('filling');
    for (let i = 0; i < 90; i++) r.update(0.1, { aiming: true, dist: 4, shots: false });
    expect(r.phase).toBe('grab');
    expect(events).toEqual(['alarm2']);
    r.update(0.1, { aiming: false, dist: 1, shots: false });
    expect(events).toContain('done');
    expect(cash).toBeGreaterThan(600);
    r.update(0.1, { aiming: false, dist: 1, shots: false });
    expect(r.phase).toBe('cooldown');
  });

  it('stop aiming and the clerk hits the alarm early; shots mean 3 stars', () => {
    const r = new Robbery(800, () => 0.5);
    const alarms: number[] = [];
    r.events = { alarm: (s) => alarms.push(s) };
    r.update(0.1, { aiming: true, dist: 4, shots: true });
    for (let i = 0; i < 15; i++) r.update(0.1, { aiming: true, dist: 4, shots: false });
    for (let i = 0; i < 40; i++) r.update(0.1, { aiming: false, dist: 4, shots: false });
    expect(alarms).toEqual([3]);
    expect(r.phase).toBe('grab');
    expect(r.cash).toBeLessThan(800 * 0.6);
  });

  it('walking out fails the robbery', () => {
    const r = new Robbery(800);
    let failed = '';
    r.events = { failed: (m) => { failed = m; } };
    r.update(0.1, { aiming: true, dist: 4, shots: false });
    for (let i = 0; i < 15; i++) r.update(0.1, { aiming: true, dist: 4, shots: false });
    r.update(0.1, { aiming: false, dist: 20, shots: false });
    expect(failed).toMatch(/left/);
  });
});

describe('heist planning', () => {
  const plan: HeistPlan = { approach: 'stealth', hacker: 'ghost', gunman: 'vex', driver: 'wren', getaway: 'sedan' };
  it('validates crew roles', () => {
    expect(validPlan(plan)).toBe(true);
    expect(validPlan({ ...plan, hacker: 'vex' })).toBe(false);
    expect(CREW.length).toBe(6);
  });
  it('better crew: faster vault, less heat, bigger cut', () => {
    const cheap: HeistPlan = { ...plan, hacker: 'byte', driver: 'lil', gunman: 'brick' };
    expect(vaultTime(plan)).toBeLessThan(vaultTime(cheap));
    expect(escapeStars(plan, false)).toBeLessThanOrEqual(escapeStars(cheap, false));
    expect(heistPayout(plan, false, 0).cuts).toBeGreaterThan(heistPayout(cheap, false, 0).cuts);
  });
  it('getting detected or going loud costs money and adds stars', () => {
    expect(heistPayout(plan, true, 0).gross).toBeLessThan(heistPayout(plan, false, 0).gross);
    expect(escapeStars({ ...plan, approach: 'loud' }, false)).toBeGreaterThan(escapeStars(plan, false));
    expect(heistPayout(plan, false, 100).gross).toBeGreaterThan(heistPayout(plan, false, 0).gross);
  });
});
