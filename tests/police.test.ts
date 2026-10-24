import { describe, expect, it } from 'vitest';
import { STAR_HEAT, WantedLevel, evadeTime, searchRadius, starsForHeat, witnesses } from '../src/systems/police/wanted';

// Wanted level escalation, evasion/decay and witness detection.

describe('wanted level', () => {
  it('maps heat to stars', () => {
    expect(starsForHeat(0)).toBe(0);
    expect(starsForHeat(1)).toBe(1);
    expect(starsForHeat(STAR_HEAT[3])).toBe(3);
    expect(starsForHeat(99999)).toBe(5);
  });

  it('unwitnessed crimes do nothing; witnessed ones escalate', () => {
    const w = new WantedLevel();
    expect(w.report('carjack', { x: 0, z: 0 }, false)).toBe(0);
    expect(w.stars).toBe(0);
    w.report('carjack', { x: 0, z: 0 }, true);
    expect(w.stars).toBe(1);
    w.report('murder', { x: 0, z: 0 }, true);
    expect(w.stars).toBeGreaterThanOrEqual(2);
    w.report('copMurder', { x: 0, z: 0 }, true);
    expect(w.stars).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 20; i++) w.report('copMurder', { x: 0, z: 0 }, true);
    expect(w.stars).toBe(5);
  });

  it('fires onChange and respects the cap', () => {
    const w = new WantedLevel();
    const seen: [number, number][] = [];
    w.onChange = (a, b) => seen.push([a, b]);
    w.cap = 2;
    w.report('copMurder', { x: 0, z: 0 }, true);
    expect(w.stars).toBe(2);
    expect(seen).toEqual([[0, 2]]);
  });

  it('stars never clear while police can see you', () => {
    const w = new WantedLevel();
    w.setStars(2);
    for (let i = 0; i < 600; i++) expect(w.update(0.1, true, { x: 0, z: 0 })).toBe(false);
    expect(w.stars).toBe(2);
  });

  it('hiding outside the search circle clears the stars; inside is slower', () => {
    const out = new WantedLevel();
    out.setStars(2);
    const far = { x: searchRadius(2) + 20, z: 0 };
    let t = 0;
    while (out.stars > 0 && t < 200) { out.update(0.1, false, far); t += 0.1; }
    expect(out.stars).toBe(0);
    expect(t).toBeGreaterThan(evadeTime(2));
    expect(t).toBeLessThan(evadeTime(2) + 5);

    const inside = new WantedLevel();
    inside.setStars(2);
    let t2 = 0;
    while (inside.stars > 0 && t2 < 400) { inside.update(0.1, false, { x: 5, z: 5 }); t2 += 0.1; }
    expect(inside.stars).toBe(0);
    expect(t2).toBeGreaterThan(t * 2);
  });

  it('a disguise (lower recognition) clears faster', () => {
    const a = new WantedLevel();
    const b = new WantedLevel();
    a.setStars(3); b.setStars(3);
    b.recognition = 0.4;
    const far = { x: 999, z: 0 };
    let ta = 0, tb = 0;
    while (a.stars > 0) { a.update(0.1, false, far); ta += 0.1; }
    while (b.stars > 0) { b.update(0.1, false, far); tb += 0.1; }
    expect(tb).toBeLessThan(ta);
  });

  it('enters search mode after losing sight and tracks evade progress', () => {
    const w = new WantedLevel();
    w.setStars(1);
    w.update(0.1, true, { x: 10, z: 10 });
    expect(w.lastSeen).toEqual({ x: 10, z: 10 });
    w.update(1, false, { x: 10, z: 10 });
    expect(w.searching).toBe(false);
    w.update(1, false, { x: 10, z: 10 });
    expect(w.searching).toBe(true);
    expect(w.evadeProgress).toBeGreaterThan(0);
    w.clear();
    expect(w.stars).toBe(0);
    expect(w.suspect.vehicleId).toBeNull();
  });
});

describe('witness detection', () => {
  const peds = [{ x: 0, z: 5 }, { x: 0, z: 30 }, { x: 12, z: 0 }, { x: -50, z: -50 }];
  it('counts observers within the radius', () => {
    expect(witnesses(peds, { x: 0, z: 0 }, 15)).toBe(2);
    expect(witnesses(peds, { x: 0, z: 0 }, 40)).toBe(3);
    expect(witnesses([], { x: 0, z: 0 }, 40)).toBe(0);
  });
  it('a wall (line-of-sight test) hides the crime', () => {
    expect(witnesses(peds, { x: 0, z: 0 }, 15, (o) => o.x !== 12)).toBe(1);
  });
});
