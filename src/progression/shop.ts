import type { PlayerProfile } from './types';
import { effects } from './skills';

// Byte Bazaar: legit gear only. Credits buy convenience and style, never answers.

export type ShopKind = 'upgrade' | 'cosmetic' | 'consumable' | 'tool';

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  kind: ShopKind;
  description: string;
  forSale: boolean;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'turbo-kit', name: 'Turbo Kit', price: 800, kind: 'upgrade', description: '+10% top speed for every car you drive.', forSale: true },
  { id: 'running-shoes', name: 'Neon Running Shoes', price: 300, kind: 'upgrade', description: '+25% sprint stamina.', forSale: true },
  { id: 'shirt-sunset', name: 'Sunset Hawaiian Shirt', price: 200, kind: 'cosmetic', description: 'Orange and pink hibiscus. Pure Ocean Drive.', forSale: true },
  { id: 'shirt-midnight', name: 'Midnight Hawaiian Shirt', price: 250, kind: 'cosmetic', description: 'Deep purple with glowing cyan palms.', forSale: true },
  { id: 'shirt-mint', name: 'Mint Hawaiian Shirt', price: 200, kind: 'cosmetic', description: 'Cool mint with flamingo-free flowers.', forSale: true },
  { id: 'workstation-upgrade', name: 'Workstation Upgrade', price: 1200, kind: 'upgrade', description: 'Faster rig, better tooling: +1 free hint in challenges.', forSale: true },
  { id: 'medkit', name: 'First-Aid Kit', price: 100, kind: 'consumable', description: 'Restore your health to full.', forSale: true },
  { id: 'wifi-analyzer', name: 'Wi-Fi Analyzer', price: 0, kind: 'tool', description: 'Detects rogue access points. Earned in "Rogue Waves".', forSale: false },
  { id: 'gps-tracker', name: 'GPS Tracker Kit', price: 0, kind: 'tool', description: 'Issued by Sunset Shield for legal surveillance.', forSale: false },
];

const byId = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): ShopItem | undefined {
  return byId.get(id);
}

export type BuyResult = { ok: true; item: ShopItem } | { ok: false; reason: string };

export function buy(profile: PlayerProfile, id: string): BuyResult {
  const item = byId.get(id);
  if (!item) return { ok: false, reason: 'Unknown item.' };
  if (!item.forSale) return { ok: false, reason: 'Not for sale.' };
  if (item.kind !== 'consumable' && profile.inventory.includes(id)) return { ok: false, reason: 'You already own this.' };
  if (profile.credits < item.price) return { ok: false, reason: `Not enough credits (need $${item.price}).` };
  if (item.kind === 'consumable') {
    const max = effects(profile).maxHealth;
    if (profile.health >= max) return { ok: false, reason: 'Already at full health.' };
    profile.credits -= item.price;
    profile.health = max;
    return { ok: true, item };
  }
  profile.credits -= item.price;
  profile.inventory.push(id);
  if (item.kind === 'cosmetic') profile.cosmetics.shirt = id;
  return { ok: true, item };
}

/** Equip an owned shirt (or 'default'). */
export function equipShirt(profile: PlayerProfile, id: string): boolean {
  if (id !== 'default' && !(profile.inventory.includes(id) && byId.get(id)?.kind === 'cosmetic')) return false;
  profile.cosmetics.shirt = id;
  return true;
}
