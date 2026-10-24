// Pure garage / customs / dealership logic (no DOM, no three.js) so it can be
// unit-tested: prices, purchases, upgrades, personal-vehicle save data, trunks.

import type { Look, VehicleKind } from '../../vehicles/Vehicle';
import type { Finish } from '../../vehicles/materials';
import { NO_UPGRADES, UPGRADE_MAX, sanitizeUpgrades, type Upgrades } from '../../vehicles/physics';

export interface CatalogEntry {
  kind: VehicleKind;
  name: string;
  price: number;
  category: 'Sports' | 'Coupes & Convertibles' | 'Sedans & SUVs' | 'Utility' | 'Motorcycles' | 'Bicycles' | 'Water' | 'Air';
  blurb: string;
}

/** Ocean Motors showroom (prices in $). */
export const DEALER_CATALOG: CatalogEntry[] = [
  { kind: 'stinger', name: 'Vortex Stinger', price: 12000, category: 'Sports', blurb: 'Wedge-shaped supercar. Fastest thing on Ocean Drive.' },
  { kind: 'cabrio', name: 'Palmetto Cabrio', price: 7500, category: 'Coupes & Convertibles', blurb: 'Top-down cruising, pastel paint, sunset vibes.' },
  { kind: 'shield', name: 'Sunset Shield Interceptor', price: 9000, category: 'Sedans & SUVs', blurb: 'Armored security SUV. Takes a beating.' },
  { kind: 'sedan', name: 'Coral Sedan', price: 3500, category: 'Sedans & SUVs', blurb: 'Reliable, forgettable, perfect for a low profile.' },
  { kind: 'pickup', name: 'Gulf Coast Pickup', price: 5200, category: 'Utility', blurb: 'Big bed, big trunk, handles the beach.' },
  { kind: 'van', name: 'Bayside Van', price: 4800, category: 'Utility', blurb: 'Room for gear. Lots of gear.' },
  { kind: 'bike', name: 'Neon PCJ', price: 4000, category: 'Motorcycles', blurb: 'Quick sport bike. Hold Shift for wheelies.' },
  { kind: 'dirtbike', name: 'Dune Ripper 250', price: 2800, category: 'Motorcycles', blurb: 'Off-road king. Owns the sand and the ramps.' },
  { kind: 'bicycle', name: 'Boardwalk Cruiser', price: 300, category: 'Bicycles', blurb: 'Pedal power. Great cardio, terrible getaways.' },
  { kind: 'jetski', name: 'Wave Viper Jet Ski', price: 2600, category: 'Water', blurb: 'Delivered to Neon Beach. Water only.' },
  { kind: 'airboat', name: 'Everglade Airboat', price: 5500, category: 'Water', blurb: 'Giant fan. Runs on water and wet sand.' },
  { kind: 'kayak', name: 'Mangrove Kayak', price: 400, category: 'Water', blurb: 'Slow, quiet, peaceful. Paddle with W.' },
  { kind: 'boat', name: 'Squalo Speedboat', price: 9500, category: 'Water', blurb: 'The classic Neon Bay speedboat.' },
  { kind: 'heli', name: 'Skylark Helicopter', price: 45000, category: 'Air', blurb: 'Delivered to the HQ helipad. Fly anywhere.' },
];

export function catalogEntry(kind: VehicleKind): CatalogEntry | undefined {
  return DEALER_CATALOG.find((c) => c.kind === kind);
}

export const PRICES = {
  respray: 400,
  finish: { metallic: 0, matte: 150, pearlescent: 350, chrome: 1200 } as Record<Finish, number>,
  wheels: 300,
  tint: [0, 150, 300, 450],
  engine: [0, 1500, 3000, 6000],
  brakes: [0, 800, 1600, 3200],
  suspension: [0, 600, 1200, 2400],
  armor: [0, 1000, 2000, 4000, 8000],
  turbo: 5000,
  nitro: 3500,
  repairKit: 150,
  register: 250,
};

export const GARAGE_CAPACITY = 8;

export type LevelKey = 'engine' | 'brakes' | 'suspension' | 'armor';
export type ToggleKey = 'turbo' | 'nitro';
export type UpgradeKey = LevelKey | ToggleKey;

export const UPGRADE_LABELS: Record<UpgradeKey, string> = {
  engine: 'Engine', brakes: 'Brakes', suspension: 'Suspension', armor: 'Armor Plating', turbo: 'Turbo', nitro: 'Nitro (N)',
};

export const LEVEL_NAMES: Record<LevelKey, string[]> = {
  engine: ['Stock', 'EMS Upgrade 1', 'EMS Upgrade 2', 'EMS Upgrade 3'],
  brakes: ['Stock', 'Street Brakes', 'Sport Brakes', 'Race Brakes'],
  suspension: ['Stock', 'Lowered', 'Street', 'Competition'],
  armor: ['None', 'Armor 20%', 'Armor 40%', 'Armor 60%', 'Armor 80%'],
};

export function upgradePrice(key: UpgradeKey, level = 1): number {
  if (key === 'turbo') return PRICES.turbo;
  if (key === 'nitro') return PRICES.nitro;
  const table = PRICES[key];
  return table[Math.max(0, Math.min(table.length - 1, level))] ?? 0;
}

export interface PurchaseResult<T> {
  ok: boolean;
  cost: number;
  value?: T;
  reason?: string;
}

/**
 * Buy an upgrade level (or toggle) for `up`. Levels can be bought directly
 * (you pay that level's price); buying the level you already own fails.
 */
export function buyUpgrade(up: Upgrades, key: UpgradeKey, level: number, money: number): PurchaseResult<Upgrades> {
  const cur = sanitizeUpgrades(up);
  if (key === 'turbo' || key === 'nitro') {
    if (cur[key]) return { ok: false, cost: 0, reason: 'Already installed' };
    const cost = upgradePrice(key);
    if (money < cost) return { ok: false, cost, reason: 'Not enough cash' };
    return { ok: true, cost, value: { ...cur, [key]: true } };
  }
  const max = UPGRADE_MAX[key];
  const lvl = Math.floor(level);
  if (lvl < 0 || lvl > max) return { ok: false, cost: 0, reason: 'Invalid level' };
  if (cur[key] === lvl) return { ok: false, cost: 0, reason: 'Already installed' };
  const cost = upgradePrice(key, lvl);
  if (money < cost) return { ok: false, cost, reason: 'Not enough cash' };
  return { ok: true, cost, value: { ...cur, [key]: lvl } };
}

export function resprayPrice(finish: Finish): number {
  return PRICES.respray + (PRICES.finish[finish] ?? 0);
}

export function defaultLook(color: string): Look {
  return { color, finish: 'metallic', wheel: null, tint: 0 };
}

// ------------------------------------------------------------------ save data

export interface OwnedVehicle {
  id: string;
  kind: VehicleKind;
  look: Look;
  upgrades: Upgrades;
  /** Health fraction 0..1. */
  health: number;
  /** In the safehouse garage (true) or parked outside / in use (false). */
  stored: boolean;
}

export interface TrunkItem {
  id: string;
  name: string;
  qty: number;
}

export interface GarageSave {
  v: 1;
  owned: OwnedVehicle[];
  trunks: Record<string, TrunkItem[]>;
  /** Cash kept in a vehicle's trunk. */
  cash: Record<string, number>;
  nextId: number;
}

export function emptySave(): GarageSave {
  return { v: 1, owned: [], trunks: {}, cash: {}, nextId: 1 };
}

const KINDS = new Set<string>(DEALER_CATALOG.map((c) => c.kind).concat(['taxi', 'police']));
const FINISH_SET = new Set<string>(['metallic', 'matte', 'pearlescent', 'chrome']);
const isColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** Defensive load: anything malformed is dropped or reset. */
export function sanitizeSave(raw: unknown): GarageSave {
  const out = emptySave();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<GarageSave>;
  if (Array.isArray(r.owned)) {
    for (const o of r.owned) {
      if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !KINDS.has(o.kind)) continue;
      const lk = (o.look ?? {}) as Partial<Look>;
      out.owned.push({
        id: o.id,
        kind: o.kind,
        look: {
          color: isColor(lk.color) ? lk.color : '#ff2fa0',
          finish: FINISH_SET.has(lk.finish as string) ? (lk.finish as Finish) : 'metallic',
          wheel: isColor(lk.wheel) ? lk.wheel : null,
          tint: Math.max(0, Math.min(3, Math.round(Number(lk.tint) || 0))),
        },
        upgrades: sanitizeUpgrades(o.upgrades),
        health: Math.max(0, Math.min(1, Number.isFinite(o.health) ? o.health : 1)),
        stored: !!o.stored,
      });
    }
  }
  if (r.trunks && typeof r.trunks === 'object') {
    for (const [k, list] of Object.entries(r.trunks)) {
      if (!Array.isArray(list)) continue;
      const items = list
        .filter((i): i is TrunkItem => !!i && typeof i.id === 'string' && typeof i.name === 'string' && Number(i.qty) > 0)
        .map((i) => ({ id: i.id, name: i.name, qty: Math.floor(i.qty) }));
      if (items.length) out.trunks[k] = items;
    }
  }
  if (r.cash && typeof r.cash === 'object') {
    for (const [k, v] of Object.entries(r.cash)) if (Number(v) > 0) out.cash[k] = Math.floor(Number(v));
  }
  const maxId = out.owned.reduce((m, o) => Math.max(m, Number(o.id.replace(/\D/g, '')) || 0), 0);
  out.nextId = Math.max(Number(r.nextId) || 1, maxId + 1);
  return out;
}

/** Buy a vehicle from the dealership. Returns the new owned record (save is updated in place on success). */
export function buyVehicle(save: GarageSave, kind: VehicleKind, money: number, color: string): PurchaseResult<OwnedVehicle> {
  const entry = catalogEntry(kind);
  if (!entry) return { ok: false, cost: 0, reason: 'Not for sale' };
  if (money < entry.price) return { ok: false, cost: entry.price, reason: 'Not enough cash' };
  const landCount = save.owned.filter((o) => !isWaterOrAir(o.kind)).length;
  if (!isWaterOrAir(kind) && landCount >= GARAGE_CAPACITY) return { ok: false, cost: entry.price, reason: 'Garage full' };
  const v = registerVehicle(save, kind, color);
  return { ok: true, cost: entry.price, value: v };
}

/** Add a vehicle to the owned list (e.g. a car registered at Neon Customs). */
export function registerVehicle(save: GarageSave, kind: VehicleKind, color: string, upgrades: Upgrades = NO_UPGRADES): OwnedVehicle {
  const v: OwnedVehicle = { id: `own-${save.nextId++}`, kind, look: defaultLook(color), upgrades: sanitizeUpgrades(upgrades), health: 1, stored: false };
  save.owned.push(v);
  return v;
}

export function isWaterOrAir(kind: VehicleKind): boolean {
  return kind === 'jetski' || kind === 'kayak' || kind === 'airboat' || kind === 'boat' || kind === 'heli';
}

export function sellValue(o: OwnedVehicle): number {
  const base = catalogEntry(o.kind)?.price ?? 2000;
  return Math.round(base * 0.5 * (0.5 + o.health * 0.5));
}

// ------------------------------------------------------------------ trunks

export function trunkAdd(save: GarageSave, key: string, item: { id: string; name: string }, qty = 1): void {
  if (!(qty > 0)) return;
  const list = (save.trunks[key] ??= []);
  const it = list.find((i) => i.id === item.id);
  if (it) it.qty += Math.floor(qty);
  else list.push({ id: item.id, name: item.name, qty: Math.floor(qty) });
}

/** Remove up to `qty`; returns how many were removed. */
export function trunkRemove(save: GarageSave, key: string, id: string, qty = 1): number {
  const list = save.trunks[key];
  if (!list) return 0;
  const it = list.find((i) => i.id === id);
  if (!it) return 0;
  const n = Math.min(it.qty, Math.max(0, Math.floor(qty)));
  it.qty -= n;
  if (it.qty <= 0) list.splice(list.indexOf(it), 1);
  if (!list.length) delete save.trunks[key];
  return n;
}

/** Keep the save small: drop trunks/cash of non-owned vehicles beyond `keep` entries. */
export function pruneTrunks(save: GarageSave, keep = 12): void {
  const owned = new Set(save.owned.map((o) => o.id));
  const extra = Object.keys(save.trunks).filter((k) => !owned.has(k));
  for (const k of extra.slice(0, Math.max(0, extra.length - keep))) delete save.trunks[k];
  const extraCash = Object.keys(save.cash).filter((k) => !owned.has(k));
  for (const k of extraCash.slice(0, Math.max(0, extraCash.length - keep))) delete save.cash[k];
}
