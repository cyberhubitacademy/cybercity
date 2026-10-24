// Clothing / barber / tattoo / disguise catalog + pure purchase & disguise logic.

export type Pattern = 'plain' | 'hawaiian' | 'stripes' | 'camo' | 'neon' | 'check';
export type Beard = 'none' | 'stubble' | 'goatee' | 'mustache' | 'full';

export interface Look {
  shirt: string;
  accent: string;
  pattern: Pattern;
  pants: string;
  shoes: string;
  hair: string;
  bald: boolean;
  beard: Beard;
  hat: string | null;
  glasses: string | null;
  mask: string | null;
  /** slot -> design id */
  tattoos: Record<string, string>;
}

export const DEFAULT_LOOK: Look = {
  shirt: '#1fb5c9', accent: '#ff3d9a', pattern: 'hawaiian', pants: '#f1ece2', shoes: '#ffffff',
  hair: '#2b1a12', bald: false, beard: 'none', hat: null, glasses: null, mask: null, tattoos: {},
};

export type ShopId = 'suburban' | 'oceandrip' | 'barber' | 'tattoo' | 'masks';
export type Slot = 'shirt' | 'pants' | 'shoes' | 'hat' | 'glasses' | 'mask' | 'hair' | 'beard' | 'tattoo';

export interface CatalogItem {
  id: string;
  shop: ShopId;
  slot: Slot;
  name: string;
  price: number;
  /** Partial look this item applies. */
  look: Partial<Omit<Look, 'tattoos'>>;
  /** Tattoo: slot + design */
  tattoo?: { slot: string; design: string };
  /** Disguise value 0..1 for police (hats/glasses/masks). */
  disguise?: number;
  /** Consumable services (haircut/dye) are not "owned", just applied. */
  service?: boolean;
}

const shirt = (shop: ShopId, id: string, name: string, price: number, c: string, accent: string, pattern: Pattern): CatalogItem =>
  ({ id, shop, slot: 'shirt', name, price, look: { shirt: c, accent, pattern } });
const pants = (shop: ShopId, id: string, name: string, price: number, c: string): CatalogItem => ({ id, shop, slot: 'pants', name, price, look: { pants: c } });
const shoes = (shop: ShopId, id: string, name: string, price: number, c: string): CatalogItem => ({ id, shop, slot: 'shoes', name, price, look: { shoes: c } });
const acc = (shop: ShopId, slot: 'hat' | 'glasses' | 'mask', id: string, name: string, price: number, disguise: number): CatalogItem =>
  ({ id, shop, slot, name, price, look: { [slot]: id }, disguise });

export const CATALOG: CatalogItem[] = [
  // Ocean Drip — beachwear, loud prints
  shirt('oceandrip', 'haw-teal', 'Rico Classic Hawaiian', 0, '#1fb5c9', '#ff3d9a', 'hawaiian'),
  shirt('oceandrip', 'haw-sunset', 'Sunset Hibiscus Hawaiian', 85, '#ff8a3d', '#ffd23f', 'hawaiian'),
  shirt('oceandrip', 'haw-pink', 'Flamingo Pink Hawaiian', 85, '#ff6fb5', '#ffffff', 'hawaiian'),
  shirt('oceandrip', 'haw-navy', 'Midnight Orchid Hawaiian', 95, '#1b2a6b', '#c27cff', 'hawaiian'),
  shirt('oceandrip', 'haw-lime', 'Key Lime Hawaiian', 85, '#9be15d', '#ff2fa0', 'hawaiian'),
  shirt('oceandrip', 'haw-white', 'Yacht Club Hawaiian', 120, '#f4f1ea', '#19c3d6', 'hawaiian'),
  shirt('oceandrip', 'neon-tee', 'Neon Grid Tee', 60, '#120a2e', '#19e6ff', 'neon'),
  shirt('oceandrip', 'neon-pink', 'Laser Pink Tee', 60, '#2a0a24', '#ff2fa0', 'neon'),
  pants('oceandrip', 'shorts-white', 'Linen Shorts (White)', 45, '#f1ece2'),
  pants('oceandrip', 'shorts-coral', 'Board Shorts (Coral)', 50, '#ff7f6b'),
  pants('oceandrip', 'shorts-aqua', 'Board Shorts (Aqua)', 50, '#3dd6c8'),
  shoes('oceandrip', 'loafer-white', 'White Boat Loafers', 0, '#ffffff'),
  shoes('oceandrip', 'sneak-pink', 'Hot Pink High-Tops', 110, '#ff2fa0'),
  shoes('oceandrip', 'sneak-cyan', 'Cyan Runners', 95, '#19e6ff'),
  acc('oceandrip', 'glasses', 'aviators', 'Gold Aviators', 70, 0.15),
  acc('oceandrip', 'glasses', 'neon-shades', 'Neon Wayfarers', 55, 0.15),
  acc('oceandrip', 'hat', 'bucket', 'Bucket Hat', 40, 0.2),
  acc('oceandrip', 'hat', 'straw', 'Straw Fedora', 65, 0.2),
  // Suburban Threads — casual / workwear
  shirt('suburban', 'tee-white', 'Plain White Tee', 25, '#f4f4f4', '#f4f4f4', 'plain'),
  shirt('suburban', 'tee-black', 'Plain Black Tee', 25, '#1c1c1c', '#1c1c1c', 'plain'),
  shirt('suburban', 'polo-navy', 'Navy Polo', 45, '#22306b', '#22306b', 'plain'),
  shirt('suburban', 'stripe-sailor', 'Sailor Stripes', 55, '#f4f4f4', '#1b3a8f', 'stripes'),
  shirt('suburban', 'stripe-red', 'Cherry Stripes', 55, '#ffffff', '#d7263d', 'stripes'),
  shirt('suburban', 'flannel', 'Red Flannel', 65, '#a8201a', '#1a1a1a', 'check'),
  shirt('suburban', 'camo', 'Jungle Camo Shirt', 70, '#4b5a2a', '#2a3318', 'camo'),
  shirt('suburban', 'camo-urban', 'Urban Camo Shirt', 70, '#7a7f87', '#3b3f45', 'camo'),
  pants('suburban', 'jeans', 'Blue Jeans', 60, '#3b5c8f'),
  pants('suburban', 'jeans-black', 'Black Jeans', 60, '#1f1f24'),
  pants('suburban', 'chinos', 'Khaki Chinos', 55, '#c9b48a'),
  pants('suburban', 'cargo', 'Olive Cargo Pants', 65, '#5b6136'),
  shoes('suburban', 'boots', 'Work Boots', 90, '#6b4a2b'),
  shoes('suburban', 'sneak-black', 'Black Sneakers', 70, '#1c1c1c'),
  acc('suburban', 'hat', 'cap-red', 'Red Snapback', 30, 0.25),
  acc('suburban', 'hat', 'cap-black', 'Black Baseball Cap', 30, 0.25),
  acc('suburban', 'hat', 'beanie', 'Grey Beanie', 25, 0.25),
  acc('suburban', 'glasses', 'nerd', 'Thick-Rim Glasses', 40, 0.2),
  // Masquerade (Byte Bazaar) — disguises
  acc('masks', 'mask', 'bandana', 'Bandana (Lower Face)', 35, 0.45),
  acc('masks', 'mask', 'ski', 'Ski Mask', 60, 0.7),
  acc('masks', 'mask', 'hockey', 'Hockey Mask', 80, 0.65),
  acc('masks', 'mask', 'luchador', 'Luchador Mask', 90, 0.65),
  acc('masks', 'mask', 'flamingo', 'Flamingo Head', 120, 0.6),
  acc('masks', 'glasses', 'mirror', 'Mirror Shades', 45, 0.2),
  acc('masks', 'hat', 'fedora', 'Black Fedora', 70, 0.25),
  // Fade Factory — barber (services)
  ...([
    ['hair-black', 'Jet Black', '#121212'], ['hair-brown', 'Espresso Brown', '#2b1a12'], ['hair-blonde', 'Beach Blonde', '#e2c27a'],
    ['hair-red', 'Copper Red', '#9c3b1a'], ['hair-pink', 'Neon Pink', '#ff2fa0'], ['hair-cyan', 'Electric Cyan', '#19e6ff'],
    ['hair-silver', 'Silver Fox', '#c9c9cf'], ['hair-purple', 'Ultraviolet', '#7b2cff'],
  ] as const).map(([id, name, c]): CatalogItem => ({ id, shop: 'barber', slot: 'hair', name: `Dye: ${name}`, price: id === 'hair-brown' ? 15 : 35, look: { hair: c, bald: false }, service: true })),
  { id: 'shave-head', shop: 'barber', slot: 'hair', name: 'Shave Head', price: 20, look: { bald: true }, service: true },
  { id: 'grow-hair', shop: 'barber', slot: 'hair', name: 'Hair Restore (Grow Back)', price: 40, look: { bald: false }, service: true },
  ...(['none', 'stubble', 'goatee', 'mustache', 'full'] as const).map((b): CatalogItem => ({
    id: `beard-${b}`, shop: 'barber', slot: 'beard', name: b === 'none' ? 'Clean Shave' : `Beard: ${b[0].toUpperCase()}${b.slice(1)}`,
    price: b === 'none' ? 10 : 25, look: { beard: b }, service: true,
  })),
];

export const TATTOO_DESIGNS: { id: string; name: string; price: number }[] = [
  { id: 'rose', name: 'Neon Rose', price: 120 },
  { id: 'anchor', name: 'Sailor Anchor', price: 90 },
  { id: 'palm', name: 'Sunset Palm', price: 110 },
  { id: 'skull', name: 'Sugar Skull', price: 150 },
  { id: 'koi', name: 'Koi Fish', price: 160 },
  { id: 'binary', name: 'Binary Band', price: 80 },
  { id: 'heart', name: 'Heart "MOM"', price: 70 },
  { id: 'bolt', name: 'Lightning Bolt', price: 75 },
  { id: 'flamingo', name: 'Flamingo', price: 130 },
  { id: 'tribal', name: 'Tribal Wave', price: 100 },
];

export const TATTOO_SLOTS: { id: string; name: string; bone: string }[] = [
  { id: 'forearm-l', name: 'Left Forearm', bone: 'LowerArmL' },
  { id: 'forearm-r', name: 'Right Forearm', bone: 'LowerArmR' },
  { id: 'upper-l', name: 'Left Bicep', bone: 'UpperArmL' },
  { id: 'upper-r', name: 'Right Bicep', bone: 'UpperArmR' },
  { id: 'neck', name: 'Neck', bone: 'Neck' },
];

for (const slot of TATTOO_SLOTS) {
  for (const d of TATTOO_DESIGNS) {
    CATALOG.push({ id: `tat-${slot.id}-${d.id}`, shop: 'tattoo', slot: 'tattoo', name: d.name, price: d.price, look: {}, tattoo: { slot: slot.id, design: d.id }, service: true });
  }
}

export function itemById(id: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.id === id);
}

export function shopItems(shop: ShopId): CatalogItem[] {
  return CATALOG.filter((c) => c.shop === shop);
}

export interface Wardrobe {
  owned: string[];
  look: Look;
}

export function defaultWardrobe(): Wardrobe {
  return { owned: CATALOG.filter((c) => c.price === 0 && !c.service).map((c) => c.id), look: { ...DEFAULT_LOOK, tattoos: {} } };
}

export function sanitizeWardrobe(raw: unknown): Wardrobe {
  const d = defaultWardrobe();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Wardrobe>;
  const owned = Array.isArray(r.owned) ? r.owned.filter((x): x is string => typeof x === 'string') : d.owned;
  const look = { ...DEFAULT_LOOK, ...(r.look ?? {}), tattoos: { ...((r.look && r.look.tattoos) || {}) } } as Look;
  return { owned: [...new Set([...d.owned, ...owned])], look };
}

export function applyItem(look: Look, item: CatalogItem): Look {
  const next: Look = { ...look, ...item.look, tattoos: { ...look.tattoos } };
  if (item.tattoo) next.tattoos[item.tattoo.slot] = item.tattoo.design;
  return next;
}

export type PurchaseResult = { ok: true; wardrobe: Wardrobe; spent: number } | { ok: false; reason: string };

/** Buy (or re-wear an owned item for free). Pure: returns a new wardrobe. */
export function purchase(w: Wardrobe, itemId: string, credits: number): PurchaseResult {
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: 'Item not found.' };
  const owned = !item.service && w.owned.includes(item.id);
  const price = owned ? 0 : item.price;
  if (credits < price) return { ok: false, reason: `You need ${'$'}${price}.` };
  const wardrobe: Wardrobe = {
    owned: !item.service && !owned ? [...w.owned, item.id] : [...w.owned],
    look: applyItem(w.look, item),
  };
  return { ok: true, wardrobe, spent: price };
}

/** Remove an accessory slot. */
export function removeAccessory(look: Look, slot: 'hat' | 'glasses' | 'mask'): Look {
  return { ...look, [slot]: null, tattoos: { ...look.tattoos } };
}

/** 0..1 how hard Rico is to recognize (police witnesses). */
export function disguiseLevel(look: Look): number {
  let d = 0;
  for (const id of [look.hat, look.glasses, look.mask]) {
    if (!id) continue;
    d += itemById(id)?.disguise ?? 0.15;
  }
  if (look.bald !== DEFAULT_LOOK.bald) d += 0.1;
  if (look.beard !== 'none') d += 0.05;
  return Math.min(1, Math.round(d * 100) / 100);
}

/** Short hash of the visible outfit so police can tell if Rico changed clothes. */
export function lookSignature(look: Look): string {
  const s = [look.shirt, look.pattern, look.pants, look.shoes, look.hair, look.bald, look.beard, look.hat, look.glasses, look.mask].join('|');
  let hsh = 2166136261;
  for (let i = 0; i < s.length; i++) hsh = Math.imul(hsh ^ s.charCodeAt(i), 16777619);
  return (hsh >>> 0).toString(36);
}
