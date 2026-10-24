// Food & drink menus (pure data + purchase logic).
import type { Consumable } from './stats';

export interface FoodItem extends Consumable {
  id: string;
  name: string;
  price: number;
  icon: string;
  desc: string;
}

export interface Vendor {
  id: string;
  name: string;
  /** Header strapline in the menu. */
  tagline: string;
  color: string;
  x: number;
  z: number;
  kind: 'truck' | 'stand' | 'cafe' | 'vending' | 'fridge' | 'bar';
  items: string[];
}

const F = (id: string, name: string, price: number, icon: string, desc: string, c: Consumable): FoodItem => ({ id, name, price, icon, desc, ...c });

export const FOOD: Record<string, FoodItem> = Object.fromEntries([
  F('taco', 'Al Pastor Tacos', 9, '🌮', 'Three tacos, pineapple, lime. Beach classic.', { hunger: 32, health: 15, fat: 0.4 }),
  F('burrito', 'Neon Burrito', 12, '🌯', 'Huge. Fills you right up.', { hunger: 55, health: 20, fat: 1.2 }),
  F('fish-taco', 'Baja Fish Tacos', 11, '🐟', 'Lighter, fresher. Good for the waistline.', { hunger: 30, health: 22, fat: 0 }),
  F('horchata', 'Horchata', 4, '🥛', 'Cinnamon rice milk, ice cold.', { thirst: 35, hunger: 4, fat: 0.2 }),
  F('burger', 'Double Neon Burger', 10, '🍔', 'Two patties, special sauce, regret later.', { hunger: 45, health: 18, fat: 1.6 }),
  F('fries', 'Sunset Fries', 5, '🍟', 'Crispy, salty, perfect.', { hunger: 18, thirst: -6, fat: 0.8, health: 6 }),
  F('salad', 'Grilled Chicken Salad', 11, '🥗', 'Protein + greens. Your trainer approves.', { hunger: 30, health: 25, fat: -0.3 }),
  F('soda', 'Cyber Cola', 3, '🥤', 'Sugar rush in a can.', { thirst: 30, fat: 0.3, fatigue: -2 }),
  F('water', 'Spring Water', 2, '💧', 'Hydration, no drama.', { thirst: 40 }),
  F('energy', 'VOLT Energy Drink', 6, '⚡', 'Sprint stamina +35% for 3 minutes. Tingly.', { thirst: 25, fatigue: -12, boost: { id: 'energy', hours: 6 } }),
  F('protein', 'Protein Shake', 8, '💪', 'Strength & muscle gains ×2 for the next 10 minutes.', { thirst: 20, hunger: 15, boost: { id: 'protein', hours: 20 } }),
  F('chips', 'Byte Chips', 2, '🥔', 'Crunchy snack.', { hunger: 10, thirst: -4, fat: 0.4 }),
  F('candy', 'Starlight Candy Bar', 2, '🍫', 'Quick energy.', { hunger: 12, fatigue: -3, fat: 0.5 }),
  F('espresso', 'Cuban Espresso', 4, '☕', 'Wakes you up. Slows fatigue for a while.', { thirst: 8, fatigue: -18, focus: 20, boost: { id: 'coffee', hours: 6 } }),
  F('cafe-con-leche', 'Café con Leche', 5, '☕', 'Milky, sweet, comforting.', { thirst: 22, hunger: 6, fatigue: -10 }),
  F('pastelito', 'Guava Pastelito', 4, '🥐', 'Flaky guava pastry, Carla\'s recipe.', { hunger: 18, health: 8, fat: 0.5 }),
  F('cubano', 'Cubano Sandwich', 10, '🥪', 'Roast pork, ham, pickles, pressed.', { hunger: 42, health: 20, fat: 0.9 }),
  F('smoothie', 'Mango Smoothie', 7, '🥭', 'Fruit, ice, sunshine.', { thirst: 35, hunger: 10, health: 12 }),
  F('leftovers', 'Leftover Pizza', 0, '🍕', 'Still good. Probably.', { hunger: 30, fat: 0.8, health: 8 }),
  F('apple', 'Apple', 0, '🍎', 'Fresh and healthy.', { hunger: 10, thirst: 6, health: 5 }),
  F('milk', 'Milk', 0, '🥛', 'Straight from the carton.', { thirst: 25, hunger: 5 }),
  F('beer', 'Neon Lager', 6, '🍺', 'Cold beer. Makes you a little tipsy.', { thirst: 20, fat: 0.3, boost: { id: 'tipsy', hours: 2 } }),
  F('mojito', 'Mojito', 9, '🍹', 'Mint, lime, sparkle.', { thirst: 25, boost: { id: 'tipsy', hours: 2 } }),
  F('coconut', 'Fresh Coconut', 6, '🥥', 'Electrolytes, straight from the palm.', { thirst: 45, health: 8 }),
  F('virgin', 'Virgin Piña Colada', 7, '🍍', 'All the fun, none of the wobble.', { thirst: 35, hunger: 6, fat: 0.4 }),
].map((f) => [f.id, f]));

export const VENDORS: Vendor[] = [
  { id: 'taco', name: 'Taco Loco', tagline: 'Beach taco truck · since 1979', color: '#ff8a3d', x: 196, z: -96, kind: 'truck', items: ['taco', 'fish-taco', 'burrito', 'horchata', 'water', 'soda'] },
  { id: 'burger', name: 'Neon Burger Shack', tagline: 'Downtown burger stand', color: '#ff2fa0', x: 22, z: -92, kind: 'stand', items: ['burger', 'fries', 'salad', 'soda', 'water', 'protein'] },
  { id: 'cafe', name: 'Coral Café', tagline: 'Carla\'s café · Ocean Drive', color: '#ff7f6b', x: 151, z: 62, kind: 'cafe', items: ['espresso', 'cafe-con-leche', 'pastelito', 'cubano', 'smoothie', 'salad', 'water'] },
  { id: 'vend-spawn', name: 'Vending Machine', tagline: 'Insert coins', color: '#19e6ff', x: 178, z: -2, kind: 'vending', items: ['soda', 'water', 'energy', 'chips', 'candy'] },
  { id: 'vend-pier', name: 'Vending Machine', tagline: 'Starlight Pier', color: '#19e6ff', x: 228, z: -108, kind: 'vending', items: ['soda', 'water', 'energy', 'chips', 'candy'] },
  { id: 'vend-hq', name: 'Vending Machine', tagline: 'Sunset Shield break room', color: '#19e6ff', x: 150, z: -24, kind: 'vending', items: ['soda', 'water', 'energy', 'protein', 'candy'] },
  { id: 'vend-soc', name: 'Vending Machine', tagline: 'Harbor SOC', color: '#19e6ff', x: -40, z: 92, kind: 'vending', items: ['soda', 'water', 'energy', 'chips'] },
  { id: 'vend-uni', name: 'Vending Machine', tagline: 'Bayview campus', color: '#19e6ff', x: -112, z: -168, kind: 'vending', items: ['soda', 'water', 'energy', 'candy', 'chips'] },
  { id: 'coco', name: 'Coco Cabana', tagline: 'Fresh coconuts · Muscle Beach', color: '#3dffb0', x: 214, z: -162, kind: 'stand', items: ['coconut', 'water', 'protein', 'smoothie', 'energy'] },
];

/** Free food in Rico's fridge; refills each game day. */
export const FRIDGE_ITEMS = ['leftovers', 'apple', 'milk', 'water', 'protein'];
export const FRIDGE_PER_DAY = 3;

export type BuyResult = { ok: true; item: FoodItem } | { ok: false; reason: string };

/** Pure purchase check (money is applied by the caller). */
export function canBuyFood(itemId: string, credits: number): BuyResult {
  const item = FOOD[itemId];
  if (!item) return { ok: false, reason: 'Not on the menu.' };
  if (credits < item.price) return { ok: false, reason: `Not enough cash ($${item.price}).` };
  return { ok: true, item };
}

/** One-line effect summary for menus. */
export function effectLine(f: Consumable): string {
  const parts: string[] = [];
  if (f.hunger) parts.push(`${f.hunger > 0 ? '+' : ''}${f.hunger} food`);
  if (f.thirst) parts.push(`${f.thirst > 0 ? '+' : ''}${f.thirst} drink`);
  if (f.health) parts.push(`+${f.health} HP`);
  if (f.fatigue) parts.push(`${-f.fatigue > 0 ? '+' : ''}${-f.fatigue} energy`);
  if (f.boost) parts.push(f.boost.id === 'protein' ? 'Gains ×2' : f.boost.id === 'energy' ? 'Stamina boost' : f.boost.id === 'coffee' ? 'Awake' : 'Tipsy');
  return parts.join(' · ');
}
