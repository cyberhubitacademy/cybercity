import { describe, expect, it } from 'vitest';
import {
  DEALER_CATALOG, GARAGE_CAPACITY, PRICES, buyUpgrade, buyVehicle, emptySave, pruneTrunks, registerVehicle, resprayPrice, sanitizeSave,
  sellValue, trunkAdd, trunkRemove, upgradePrice,
} from '../src/systems/garage/logic';
import { NO_UPGRADES } from '../src/vehicles/physics';

describe('garage purchases', () => {
  it('buys a vehicle when affordable and records it', () => {
    const s = emptySave();
    const stinger = DEALER_CATALOG.find((c) => c.kind === 'stinger')!;
    expect(buyVehicle(s, 'stinger', stinger.price - 1, '#ff2fa0').ok).toBe(false);
    expect(s.owned).toHaveLength(0);
    const r = buyVehicle(s, 'stinger', 1e6, '#ff2fa0');
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(stinger.price);
    expect(s.owned).toHaveLength(1);
    expect(r.value).toMatchObject({ kind: 'stinger', stored: false, health: 1, look: { color: '#ff2fa0', finish: 'metallic', wheel: null, tint: 0 } });
    expect(r.value!.id).toBe('own-1');
    expect(s.nextId).toBe(2);
  });

  it('enforces garage capacity for land vehicles but not boats', () => {
    const s = emptySave();
    for (let i = 0; i < GARAGE_CAPACITY; i++) expect(buyVehicle(s, 'sedan', 1e9, '#ffffff').ok).toBe(true);
    expect(buyVehicle(s, 'sedan', 1e9, '#ffffff').reason).toBe('Garage full');
    expect(buyVehicle(s, 'jetski', 1e9, '#ffffff').ok).toBe(true);
  });

  it('upgrades: price, money check, no double buy', () => {
    const r1 = buyUpgrade(NO_UPGRADES, 'engine', 2, 1e6);
    expect(r1.ok).toBe(true);
    expect(r1.cost).toBe(PRICES.engine[2]);
    expect(r1.value!.engine).toBe(2);
    expect(buyUpgrade(r1.value!, 'engine', 2, 1e6).ok).toBe(false);
    expect(buyUpgrade(NO_UPGRADES, 'engine', 3, 10).reason).toBe('Not enough cash');
    expect(buyUpgrade(NO_UPGRADES, 'armor', 9, 1e6).ok).toBe(false);
    const n = buyUpgrade(NO_UPGRADES, 'nitro', 1, 1e6);
    expect(n.value!.nitro).toBe(true);
    expect(buyUpgrade(n.value!, 'nitro', 1, 1e6).ok).toBe(false);
    expect(upgradePrice('turbo')).toBe(PRICES.turbo);
    expect(resprayPrice('chrome')).toBeGreaterThan(resprayPrice('metallic'));
  });
});

describe('garage save data', () => {
  it('has a stable JSON shape that round-trips', () => {
    const s = emptySave();
    const o = registerVehicle(s, 'cabrio', '#19c3d6', { ...NO_UPGRADES, engine: 1, nitro: true });
    o.look.finish = 'pearlescent';
    trunkAdd(s, o.id, { id: 'repair-kit', name: 'Repair Kit' }, 2);
    s.cash[o.id] = 500;
    const json = JSON.parse(JSON.stringify(s));
    expect(Object.keys(json).sort()).toEqual(['cash', 'nextId', 'owned', 'trunks', 'v']);
    expect(Object.keys(json.owned[0]).sort()).toEqual(['health', 'id', 'kind', 'look', 'stored', 'upgrades']);
    expect(Object.keys(json.owned[0].upgrades).sort()).toEqual(['armor', 'brakes', 'engine', 'nitro', 'suspension', 'turbo']);
    expect(sanitizeSave(json)).toEqual(s);
  });

  it('sanitizes corrupt data', () => {
    const bad = {
      owned: [
        { id: 'own-4', kind: 'stinger', look: { color: 'red', finish: 'weird', tint: 9 }, upgrades: { engine: 99 }, health: 7, stored: 1 },
        { id: 5, kind: 'tank' },
        null,
      ],
      trunks: { x: [{ id: 'a', name: 'A', qty: -1 }, { id: 'b', name: 'B', qty: 2 }], y: 'nope' },
      cash: { x: -5, y: 10 },
      nextId: 'zz',
    };
    const s = sanitizeSave(bad);
    expect(s.owned).toHaveLength(1);
    expect(s.owned[0].look).toEqual({ color: '#ff2fa0', finish: 'metallic', wheel: null, tint: 3 });
    expect(s.owned[0].upgrades.engine).toBe(3);
    expect(s.owned[0].health).toBe(1);
    expect(s.trunks).toEqual({ x: [{ id: 'b', name: 'B', qty: 2 }] });
    expect(s.cash).toEqual({ y: 10 });
    expect(s.nextId).toBe(5);
    expect(sanitizeSave(null)).toEqual(emptySave());
  });

  it('trunk add/remove', () => {
    const s = emptySave();
    trunkAdd(s, 'k', { id: 'a', name: 'A' }, 3);
    trunkAdd(s, 'k', { id: 'a', name: 'A' }, 2);
    expect(s.trunks.k[0].qty).toBe(5);
    expect(trunkRemove(s, 'k', 'a', 10)).toBe(5);
    expect(s.trunks.k).toBeUndefined();
    expect(trunkRemove(s, 'k', 'a')).toBe(0);
  });

  it('prunes trunks of non-owned vehicles but keeps owned ones', () => {
    const s = emptySave();
    const o = registerVehicle(s, 'sedan', '#ffffff');
    trunkAdd(s, o.id, { id: 'a', name: 'A' });
    for (let i = 0; i < 20; i++) trunkAdd(s, `veh-${i}`, { id: 'a', name: 'A' });
    pruneTrunks(s, 5);
    expect(Object.keys(s.trunks)).toHaveLength(6);
    expect(s.trunks[o.id]).toBeDefined();
  });

  it('sell value depends on condition', () => {
    const s = emptySave();
    const o = registerVehicle(s, 'stinger', '#ffffff');
    const full = sellValue(o);
    o.health = 0.2;
    expect(sellValue(o)).toBeLessThan(full);
  });
});
