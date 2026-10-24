// Pure wildlife log: species, sightings, photos and rewards.

export interface WildSpecies {
  id: string;
  name: string;
  hint: string;
  /** Reward for the first photo. */
  photoReward: number;
}

export const WILDLIFE: WildSpecies[] = [
  { id: 'dog', name: 'Shiba Inu', hint: 'Walked by their owners on Ocean Drive and in Old Town.', photoReward: 25 },
  { id: 'stray', name: 'Stray Dog', hint: 'Hangs around the beach taco truck. Looks hungry.', photoReward: 40 },
  { id: 'cat', name: 'Alley Cat', hint: 'Naps on Old Town porches and the market.', photoReward: 30 },
  { id: 'seagull', name: 'Laughing Gull', hint: 'Flocks on Neon Beach. Will steal your fries.', photoReward: 25 },
  { id: 'pigeon', name: 'Rock Pigeon', hint: 'Owns the downtown plazas.', photoReward: 20 },
  { id: 'crab', name: 'Ghost Crab', hint: 'Scuttles along the waterline. Shy.', photoReward: 35 },
  { id: 'alligator', name: 'American Alligator', hint: 'Harbor water by the industrial docks. Keep your distance!', photoReward: 120 },
  { id: 'fish-snapper', name: 'Red Snapper', hint: 'Catch it off Starlight Pier.', photoReward: 0 },
  { id: 'fish-mahi', name: 'Mahi-Mahi', hint: 'Daytime, off the pier.', photoReward: 0 },
  { id: 'fish-tarpon', name: 'Silver Tarpon', hint: 'Night fishing on the pier.', photoReward: 0 },
  { id: 'fish-neonkoi', name: 'Neon Koi', hint: 'Legendary. Night only. Good luck.', photoReward: 0 },
];

export interface LogEntry {
  seen: boolean;
  photographed: boolean;
  count: number;
}

export type WildLog = Record<string, LogEntry>;

export function newLog(): WildLog {
  return {};
}

export function sanitizeLog(raw: unknown): WildLog {
  const out: WildLog = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const e = v as Partial<LogEntry>;
    out[k] = { seen: !!e.seen, photographed: !!e.photographed, count: typeof e.count === 'number' ? e.count : 0 };
  }
  return out;
}

/** Record a sighting; returns true when it's the first time. */
export function observe(log: WildLog, id: string): boolean {
  const e = log[id] ?? (log[id] = { seen: false, photographed: false, count: 0 });
  e.count++;
  if (e.seen) return false;
  e.seen = true;
  return true;
}

/** Record a photo of several species; returns newly photographed ids and the reward. */
export function photograph(log: WildLog, ids: string[]): { newSpecies: string[]; reward: number } {
  const fresh: string[] = [];
  let reward = 0;
  for (const id of new Set(ids)) {
    observe(log, id);
    const e = log[id];
    if (!e.photographed) {
      e.photographed = true;
      fresh.push(id);
      reward += WILDLIFE.find((s) => s.id === id)?.photoReward ?? 0;
    }
  }
  return { newSpecies: fresh, reward };
}

export function entries(log: WildLog): { species: string; name: string; seen: boolean; photographed: boolean; count: number; hint: string }[] {
  return WILDLIFE.map((s) => ({ species: s.id, name: s.name, hint: s.hint, seen: !!log[s.id]?.seen, photographed: !!log[s.id]?.photographed, count: log[s.id]?.count ?? 0 }));
}

export function nameOf(id: string): string {
  return WILDLIFE.find((s) => s.id === id)?.name ?? id;
}

/** Flee decision for birds/crabs: run if the threat is close and moving fast, or very close. */
export function shouldFlee(dist: number, threatSpeed: number, skittish = 1): boolean {
  if (dist < 2.2 * skittish) return true;
  if (dist < 7 * skittish && threatSpeed > 4) return true;
  if (dist < 14 && threatSpeed > 12) return true; // cars
  return false;
}

/** Gator bite check: close and Rico is in/at the water. */
export function gatorBites(dist: number, inWater: boolean, basking: boolean): boolean {
  if (inWater) return dist < 2.6;
  return basking ? dist < 1.7 : dist < 2.0;
}
