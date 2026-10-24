import { describe, expect, it } from 'vitest';
import {
  bodyShape, consume, defaultLife, hasBoost, regen, sanitizeLife, sessionFactor, sleep, speedMultiplier, staminaMultiplier, tick, warnings, workout,
} from '../src/systems/life/stats';
import { FOOD, canBuyFood, VENDORS } from '../src/systems/life/food';
import { Stash } from '../src/systems/life/stash';
import { normalizeEvent } from '../src/systems/life/bus';

describe('life stats', () => {
  it('hunger and thirst drain over game hours, fatigue rises', () => {
    const s = defaultLife();
    tick(s, { hours: 10, sprinting: false, meters: 0 });
    expect(s.hunger).toBeLessThan(80);
    expect(s.thirst).toBeLessThan(s.hunger);
    expect(s.fatigue).toBeGreaterThan(15);
  });

  it('low needs reduce stamina and add warnings', () => {
    const s = defaultLife();
    const base = staminaMultiplier(s);
    s.hunger = 5; s.thirst = 5; s.fatigue = 95;
    expect(staminaMultiplier(s)).toBeLessThan(base);
    expect(warnings(s)).toEqual(expect.arrayContaining(['starving', 'dehydrated', 'exhausted']));
    expect(regen(s).cap).toBe(0.5);
  });

  it('workouts have diminishing returns within a day', () => {
    const s = defaultLife();
    const a = workout(s, 'bench', 1).strength;
    const b = workout(s, 'bench', 1).strength;
    const c = workout(s, 'bench', 1).strength;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(sessionFactor(0)).toBe(1);
    // a different exercise is fresh again
    expect(workout(s, 'deadlift', 1).strength).toBeGreaterThan(c);
  });

  it('protein shake doubles strength gains', () => {
    const a = defaultLife(), b = defaultLife();
    consume(b, FOOD.protein);
    expect(hasBoost(b, 'protein')).toBe(true);
    expect(workout(b, 'squat', 0.8).strength).toBeCloseTo(workout(a, 'squat', 0.8).strength * 2, 5);
  });

  it('energy drink boosts sprint stamina', () => {
    const s = defaultLife();
    const before = staminaMultiplier(s);
    consume(s, FOOD.energy);
    expect(staminaMultiplier(s)).toBeGreaterThan(before * 1.2);
    tick(s, { hours: 7, sprinting: false, meters: 0 });
    expect(hasBoost(s, 'energy')).toBe(false);
  });

  it('overeating adds fat; exercise burns it; body shape widens with fat', () => {
    const s = defaultLife();
    s.hunger = 95;
    const fat0 = s.fat;
    consume(s, FOOD.burger);
    expect(s.fat).toBeGreaterThan(fat0 + 1);
    const wide = bodyShape(s).width;
    for (let i = 0; i < 5; i++) workout(s, 'treadmill', 1);
    expect(bodyShape(s).width).toBeLessThan(wide);
    s.fat = 90;
    expect(speedMultiplier(s)).toBeLessThan(1);
  });

  it('muscle fades gently after days without training', () => {
    const s = defaultLife();
    s.muscle = 60;
    for (let k = 0; k < 20; k++) { s.hunger = 50; s.thirst = 80; tick(s, { hours: 6, sprinting: false, meters: 0 }); }
    expect(s.muscle).toBeLessThan(60);
    expect(s.muscle).toBeGreaterThan(55);
  });

  it('sleep restores fatigue', () => {
    const s = defaultLife();
    s.fatigue = 90;
    sleep(s, 8);
    expect(s.fatigue).toBe(0);
    expect(s.focus).toBe(100);
  });

  it('sanitizes broken saves', () => {
    const s = sanitizeLife({ hunger: 'x', fat: 999, boosts: [{ id: 'energy', hours: 2 }, null] });
    expect(s.hunger).toBe(80);
    expect(s.fat).toBe(100);
    expect(s.boosts).toHaveLength(1);
  });
});

describe('food purchases', () => {
  it('checks price against credits', () => {
    expect(canBuyFood('taco', 100).ok).toBe(true);
    expect(canBuyFood('taco', 2).ok).toBe(false);
    expect(canBuyFood('nope', 100).ok).toBe(false);
  });
  it('every vendor item exists', () => {
    for (const v of VENDORS) for (const id of v.items) expect(FOOD[id], id).toBeTruthy();
  });
});

describe('stash', () => {
  it('stores, counts and removes with capacity', () => {
    const st = new Stash(5);
    expect(st.add({ id: 'watch', name: 'Gold Watch', qty: 3, value: 200 })).toBe(true);
    expect(st.add({ id: 'watch', name: 'Gold Watch', qty: 3 })).toBe(false);
    expect(st.count('watch')).toBe(3);
    expect(st.value()).toBe(600);
    expect(st.remove('watch', 2)).toBe(true);
    expect(st.remove('watch', 2)).toBe(false);
    st.load([{ id: 'x', name: 'X', qty: 2 }, { bad: 1 }]);
    expect(st.total()).toBe(2);
  });
});

describe('event bus payloads', () => {
  it('normalizes and drops malformed events', () => {
    expect(normalizeEvent(null)).toBeNull();
    expect(normalizeEvent({ type: 5 })).toBeNull();
    const e = normalizeEvent({ type: 'crime', crime: 'carjack', x: 3, bad: () => 1, nan: NaN, list: ['a', 2] });
    expect(e).toEqual({ type: 'crime', crime: 'carjack', x: 3, list: ['a'] });
  });
});
