import { describe, expect, it } from 'vitest';
import { PLAYABLE, otherChar } from '../src/systems/switching/characters';
import {
  STAY_MS, SWITCH_SWAP_AT, SWITCH_TOTAL, SKY_Y, WANDER_MS, defaultSave, lifeTick, pickSpot, sanitizeSave, switchBlockReason, switchFrame,
  wheelPick, type CharState, type SwitchConditions, type SwitchFrame, type SwitchPlan,
} from '../src/systems/switching/logic';

const ok: SwitchConditions = {
  transitioning: false, busy: false, dead: false, mission: false, wanted: 0,
  swimming: false, airborne: false, inVehicle: false, occupied: false, indoors: false,
};

function state(over: Partial<CharState> = {}): CharState {
  return {
    x: 10, y: 0, z: 20, yaw: 1, health: 80, armor: 25, credits: 900, look: null, arsenal: null,
    leftAt: 0, movedAt: 0, spot: null, ...over,
  };
}

describe('switch eligibility', () => {
  it('allows switching in free roam', () => {
    expect(switchBlockReason(ok)).toBeNull();
  });
  it('blocks each unsafe situation with a reason', () => {
    const cases: Partial<SwitchConditions>[] = [
      { transitioning: true }, { busy: true }, { dead: true }, { mission: true }, { wanted: 2 },
      { swimming: true }, { airborne: true }, { inVehicle: true }, { occupied: true }, { indoors: true },
    ];
    for (const c of cases) expect(switchBlockReason({ ...ok, ...c })).toMatch(/\w/);
  });
  it('mentions the cops when wanted', () => {
    expect(switchBlockReason({ ...ok, wanted: 1 })).toMatch(/wanted/);
  });
});

describe('spot selection', () => {
  const spots = PLAYABLE.maya.spots;
  it('only offers spots unlocked by time away', () => {
    for (let r = 0; r < 1; r += 0.1) {
      const s = pickSpot(spots, 3, r);
      expect(s && s.minAway <= 3).toBe(true);
    }
    expect(pickSpot(spots, 1, 0.5)).toBeNull();
  });
  it('avoids the current spot when another fits', () => {
    for (let r = 0; r < 1; r += 0.05) expect(pickSpot(spots, 60, r, 'tiki')?.id).not.toBe('tiki');
  });
  it('stays put when left recently, moves on later (only out of sight)', () => {
    const st = state({ leftAt: 0, movedAt: 0 });
    expect(lifeTick(st, STAY_MS - 1, spots, false, 0.3)).toBe(false);
    expect(st.spot).toBeNull();
    expect(lifeTick(st, STAY_MS + 1000, spots, true, 0.3)).toBe(false);
    expect(lifeTick(st, STAY_MS + 1000, spots, false, 0.3)).toBe(true);
    expect(spots.some((s) => s.id === st.spot && s.x === st.x && s.z === st.z)).toBe(true);
    const first = st.spot;
    expect(lifeTick(st, STAY_MS + 2000, spots, false, 0.3)).toBe(false); // not again so soon
    expect(lifeTick(st, STAY_MS + 1000 + WANDER_MS, spots, false, 0.3)).toBe(true);
    expect(st.spot).not.toBe(first);
  });
  it('every character has a start spot and hang-outs', () => {
    for (const id of ['rico', 'maya'] as const) {
      expect(PLAYABLE[id].spots.length).toBeGreaterThanOrEqual(3);
      expect(otherChar(otherChar(id))).toBe(id);
    }
  });
});

describe('saved state', () => {
  it('round-trips through JSON', () => {
    const s = defaultSave();
    s.active = 'maya';
    s.chars.rico = state({
      look: { shirt: '#111111', accent: '#222222', pattern: 'plain', pants: '#333333', shoes: '#444444', hair: '#555555', bald: false, beard: 'none', hat: 'cap', glasses: null, mask: null, tattoos: { neck: 'rose' } },
      arsenal: { owned: [{ id: 'pistol', mag: 12, reserve: 40, upgrades: [] }], current: 'pistol' },
      leftAt: 1234, movedAt: 1234, spot: 'cafe',
    });
    const back = sanitizeSave(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
  });
  it('repairs junk', () => {
    expect(sanitizeSave(null)).toEqual(defaultSave());
    expect(sanitizeSave({ active: 'trevor', chars: 5 })).toEqual(defaultSave());
    const s = sanitizeSave({ active: 'rico', chars: { maya: { x: 1, z: 2, health: 9999, armor: -5, credits: -3 }, rico: { x: 0, z: 0 } } });
    expect(s.chars.rico).toBeNull(); // the active character lives in the profile
    expect(s.chars.maya).toMatchObject({ x: 1, z: 2, health: 200, armor: 0, credits: 0, look: null, arsenal: null });
  });
});

describe('wheel + transition', () => {
  it('picks a side only past the deadzone', () => {
    expect(wheelPick(5, 3, 'rico')).toBe('rico');
    expect(wheelPick(80, 0, 'rico')).toBe('maya');
    expect(wheelPick(-80, 10, 'maya')).toBe('rico');
  });
  it('rises to the sky, pans, then lands behind the target', () => {
    const plan: SwitchPlan = {
      start: { x: 0, y: 3, z: 6 }, startLook: { x: 0, y: 1.4, z: 0 },
      from: { x: 0, y: 0, z: 0 }, to: { x: 200, y: 0, z: -100 },
      end: { x: 200, y: 2.9, z: -94 }, endLook: { x: 200, y: 1.55, z: -100 },
    };
    const f: SwitchFrame = { pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 }, grey: 0, drop: -1, done: false };
    expect(SWITCH_TOTAL).toBeGreaterThan(3);
    expect(SWITCH_TOTAL).toBeLessThan(4);
    switchFrame(plan, SWITCH_SWAP_AT + 0.01, f);
    expect(f.pos.y).toBeCloseTo(SKY_Y, 0);
    expect(f.pos.x).toBeCloseTo(0, 0);
    expect(f.grey).toBe(1);
    let lastY = Infinity;
    for (let t = SWITCH_SWAP_AT + 1.4; t < SWITCH_TOTAL; t += 0.05) {
      switchFrame(plan, t, f);
      expect(f.pos.y).toBeLessThanOrEqual(lastY + 1e-6); // only ever drops
      lastY = f.pos.y;
    }
    switchFrame(plan, SWITCH_TOTAL + 0.01, f);
    expect(f.done).toBe(true);
    switchFrame(plan, SWITCH_TOTAL - 0.001, f);
    expect(f.pos.x).toBeCloseTo(200, 0);
    expect(f.pos.z).toBeCloseTo(-94, 0);
    expect(f.pos.y).toBeLessThan(4);
  });
});
