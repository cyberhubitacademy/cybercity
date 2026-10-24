// Pure relationship model: friends from the story cast plus two new optional
// companions (Skye Navarro, lifeguard; Ruby Lane, DJ at Club Afterglow).

export interface Person {
  id: string;
  name: string;
  color: string;
  emoji: string;
  /** Gift ids they love / like. */
  loves: string[];
  likes: string[];
  /** Activities they enjoy as hangouts. */
  fav: string[];
  /** New companion that must be met in the world first. */
  companion?: boolean;
  /** Can become a partner (dating). */
  dateable?: boolean;
  /** Rig look for spawning them. */
  female: boolean;
  outfit: { shirt: string; pants: string; skin: string; hair: string; accent?: string; pattern?: 'hawaiian' | 'plain' };
  bio: string;
  /** Hour range they're free to hang out. */
  free: [number, number];
}

export const PEOPLE: Person[] = [
  { id: 'carla', name: 'Carla Reyes', color: '#ff7f6b', emoji: '☕', loves: ['flowers', 'vinyl'], likes: ['chocolate', 'hotsauce'], fav: ['cafe', 'club', 'beach'], female: true, outfit: { shirt: '#ff7f6b', pants: '#2b2b33', skin: '#b5835a', hair: '#1a0f0a' }, bio: 'Runs Coral Café. Knows everyone.', free: [8, 23] },
  { id: 'max', name: 'Max Cortez', color: '#19e6ff', emoji: '🕶️', loves: ['cigar-box', 'vinyl'], likes: ['hotsauce'], fav: ['bar', 'pool', 'fishing'], female: false, outfit: { shirt: '#f4f4f4', pants: '#22306b', skin: '#a8714a', hair: '#3a3a3a' }, bio: 'Your boss. Old-school, loyal.', free: [17, 24] },
  { id: 'dex', name: 'Dex Holloway', color: '#7b2cff', emoji: '🎧', loves: ['cartridge', 'energy'], likes: ['vinyl'], fav: ['basketball', 'club', 'pool'], female: false, outfit: { shirt: '#7b2cff', pants: '#1c1c1c', skin: '#6b4a32', hair: '#111111' }, bio: 'SOC manager. Never sleeps.', free: [12, 26] },
  { id: 'tito', name: 'Tito Ramos', color: '#3dffb0', emoji: '🔧', loves: ['hotsauce', 'cartridge'], likes: ['chocolate'], fav: ['basketball', 'fishing', 'golf'], female: false, outfit: { shirt: '#3dffb0', pants: '#3b5c8f', skin: '#a8714a', hair: '#1a0f0a' }, bio: 'Network engineer, practical joker.', free: [16, 23] },
  { id: 'priya', name: 'Priya Shah', color: '#ffd23f', emoji: '🧪', loves: ['cartridge', 'book'], likes: ['flowers', 'plush'], fav: ['golf', 'cafe', 'pool'], female: true, outfit: { shirt: '#ffd23f', pants: '#1f1f24', skin: '#8d5a3b', hair: '#0e0e0e' }, bio: 'Researcher with a stall at Byte Bazaar.', free: [10, 22] },
  { id: 'lena', name: 'Dr. Lena Okafor', color: '#d3b8ff', emoji: '🔬', loves: ['book', 'flowers'], likes: ['vinyl'], fav: ['cafe', 'golf'], female: true, outfit: { shirt: '#d3b8ff', pants: '#f1ece2', skin: '#5a3a25', hair: '#0e0e0e' }, bio: 'Forensics professor. Brilliant, dry wit.', free: [9, 20] },
  { id: 'jules', name: 'Jules Park', color: '#9fd8ff', emoji: '☁️', loves: ['energy', 'plush'], likes: ['cartridge'], fav: ['club', 'basketball'], female: true, outfit: { shirt: '#9fd8ff', pants: '#1c1c1c', skin: '#e3b48a', hair: '#1a0f0a' }, bio: 'SRE at Harbor Cloud. Runs on cold brew.', free: [18, 27] },
  {
    id: 'skye', name: 'Skye Navarro', color: '#ff8a3d', emoji: '🏄', loves: ['flowers', 'sunglasses'], likes: ['plush', 'chocolate'], fav: ['beach', 'basketball', 'golf'],
    companion: true, dateable: true, female: true, outfit: { shirt: '#e0453a', pants: '#e0453a', skin: '#c98b5e', hair: '#e2c27a' },
    bio: 'Lifeguard at Neon Beach. Surfs at dawn, fearless.', free: [7, 21],
  },
  {
    id: 'ruby', name: 'Ruby Lane', color: '#ff2fa0', emoji: '🎛️', loves: ['vinyl', 'sunglasses'], likes: ['flowers', 'energy'], fav: ['club', 'bar', 'pool'],
    companion: true, dateable: true, female: true, outfit: { shirt: '#120a2e', pants: '#ff2fa0', skin: '#8d5a3b', hair: '#7b2cff' },
    bio: 'Resident DJ at Club Afterglow. Synthwave royalty.', free: [16, 28],
  },
];

export const GIFTS: { id: string; name: string; price: number; icon: string }[] = [
  { id: 'flowers', name: 'Hibiscus Bouquet', price: 30, icon: '🌺' },
  { id: 'chocolate', name: 'Box of Chocolates', price: 25, icon: '🍫' },
  { id: 'vinyl', name: 'Rare Synthwave Vinyl', price: 60, icon: '💿' },
  { id: 'cartridge', name: 'Retro Game Cartridge', price: 45, icon: '🎮' },
  { id: 'hotsauce', name: 'Ghost Pepper Hot Sauce', price: 15, icon: '🌶️' },
  { id: 'book', name: 'Signed Sci-Fi Novel', price: 35, icon: '📕' },
  { id: 'plush', name: 'Flamingo Plushie', price: 20, icon: '🦩' },
  { id: 'sunglasses', name: 'Designer Sunglasses', price: 80, icon: '🕶️' },
  { id: 'energy', name: 'VOLT Energy 12-pack', price: 25, icon: '⚡' },
  { id: 'cigar-box', name: 'Cedar Cigar Box (empty, classy)', price: 50, icon: '📦' },
];

export interface Rel {
  points: number;
  met: boolean;
  lastDay: number;
  hangouts: number;
  gifts: number;
  partner: boolean;
}

export const LEVELS = [
  { at: 0, name: 'Stranger' },
  { at: 15, name: 'Acquaintance' },
  { at: 35, name: 'Friend' },
  { at: 60, name: 'Close Friend' },
  { at: 85, name: 'Best Friend' },
];

export function newRel(met = true): Rel {
  return { points: met ? 18 : 0, met, lastDay: 0, hangouts: 0, gifts: 0, partner: false };
}

export function person(id: string): Person | undefined {
  return PEOPLE.find((p) => p.id === id);
}

export function levelOf(points: number): { index: number; name: string; next: number | null } {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (points >= LEVELS[k].at) i = k;
  return { index: i, name: LEVELS[i].name, next: i + 1 < LEVELS.length ? LEVELS[i + 1].at : null };
}

export function levelName(r: Rel): string {
  if (r.partner) return 'Partner ❤';
  return levelOf(r.points).name;
}

/** Add points (clamped 0..100); returns true if the level went up. */
export function addPoints(r: Rel, amount: number, today: number): boolean {
  const before = levelOf(r.points).index;
  r.points = Math.max(0, Math.min(100, r.points + amount));
  r.lastDay = today;
  return levelOf(r.points).index > before;
}

/** Gentle decay if you ignore someone for more than 3 days (never below Acquaintance once met). */
export function decay(r: Rel, today: number): void {
  const idle = today - r.lastDay;
  if (idle > 3) {
    const floor = r.met ? 15 : 0;
    r.points = Math.max(floor, r.points - (idle - 3) * 1.5);
    r.lastDay = today - 3;
  }
}

export function giftReaction(p: Person, giftId: string): { kind: 'love' | 'like' | 'meh'; points: number } {
  if (p.loves.includes(giftId)) return { kind: 'love', points: 12 };
  if (p.likes.includes(giftId)) return { kind: 'like', points: 6 };
  return { kind: 'meh', points: 2 };
}

/** Points for doing an activity together (favourites count more). */
export function hangoutPoints(p: Person, activity: string, quality = 0.6): number {
  const base = p.fav.includes(activity) ? 9 : 5;
  return Math.round(base * (0.6 + 0.6 * Math.max(0, Math.min(1, quality))));
}

/** Will they hang out right now? */
export function accepts(p: Person, r: Rel, hour: number, alreadyToday: boolean): { ok: boolean; reason: string } {
  if (!r.met) return { ok: false, reason: `You haven't met ${p.name.split(' ')[0]} yet.` };
  if (alreadyToday && r.points < 60) return { ok: false, reason: `${p.name.split(' ')[0]}: "We just hung out! Tomorrow?"` };
  const h = hour < p.free[0] ? hour + 24 : hour;
  if (h < p.free[0] || h > p.free[1]) return { ok: false, reason: `${p.name.split(' ')[0]} is busy right now (free ${p.free[0] % 24}:00–${p.free[1] % 24}:00).` };
  return { ok: true, reason: '' };
}

/** Challenge hints a following companion can give (0..2). */
export function hintsFrom(r: Rel | undefined): number {
  if (!r) return 0;
  if (r.partner || r.points >= 85) return 2;
  if (r.points >= 35) return 1;
  return 0;
}

/** Ask to be partners (dateable companions at Close Friend+). */
export function canDate(p: Person, r: Rel): boolean {
  return !!p.dateable && !r.partner && r.points >= 60;
}
