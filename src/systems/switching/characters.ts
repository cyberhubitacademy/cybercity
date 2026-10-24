import type { Outfit } from '../../actors/Humanoid';
import type { Look } from '../shops/catalog';

// The playable cast for character switching. Everything about a character
// (name, colours, outfit, model, bio, where they start and where they hang out
// while you're not playing them) lives here, so it's one place to change.
// Pure data (type-only imports) so the logic stays testable in node.

export type CharId = 'rico' | 'maya';
export const CHAR_IDS: readonly CharId[] = ['rico', 'maya'];

/** A believable place a character is found at when you switch to them. */
export interface CharSpot {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Facing (radians, 0 = +z / south). */
  yaw: number;
  /** Only after they've been left alone at least this many minutes (GTA-style "living their life"). */
  minAway: number;
  /** Stand on the roof below this point instead of the street. */
  roof?: boolean;
}

export interface PlayableDef {
  id: CharId;
  name: string;
  initials: string;
  role: string;
  bio: string;
  /** Portrait ring colour on the switch wheel. */
  color: string;
  /** Female Quaternius model (createRig picks `woman_*` by seed % 4: 0 casual, 1 tank, 2 dress, 3 jacket). */
  female: boolean;
  modelSeed: number;
  /** Base rig outfit (null = the player's default rig, RICO_OUTFIT). */
  outfit: Outfit | null;
  /** Starting shop look (null = the shops default look). */
  look: Look | null;
  /** Credits in their own wallet the first time they are played. */
  startCredits: number;
  /** Where they are the first time you switch to them. */
  start: CharSpot;
  /** Hang-outs picked when they have been left alone a while. */
  spots: readonly CharSpot[];
}

const RICO: PlayableDef = {
  id: 'rico',
  name: 'Rico Vega',
  initials: 'RV',
  role: 'Blue team · SOC analyst',
  bio: 'Sunset Shield analyst. Reads logs like comics and catches attackers by their footprints.',
  color: '#19c3d6',
  female: false,
  modelSeed: 0,
  outfit: null,
  look: null,
  startCredits: 0, // Rico uses the profile's wallet from the start
  start: { id: 'hq', name: 'Sunset Shield HQ', x: 132, z: -38, yaw: Math.PI / 2, minAway: 0 },
  spots: [
    { id: 'hq', name: 'Sunset Shield HQ lobby', x: 132, z: -38, yaw: Math.PI / 2, minAway: 2 },
    { id: 'cafe', name: 'Coral Café', x: 151, z: 52, yaw: -Math.PI / 2, minAway: 2 },
    { id: 'pier', name: 'Starlight Pier', x: 258, z: -118, yaw: Math.PI / 2, minAway: 6 },
  ],
};

const MAYA: PlayableDef = {
  id: 'maya',
  name: 'Maya Torres',
  initials: 'MT',
  role: 'Red team · field operative',
  bio: 'Sunset Shield penetration tester. Breaks in first so the real crooks never can.',
  color: '#ff3d5a',
  female: true,
  modelSeed: 3, // woman_jacket
  outfit: {
    // woman_jacket: `accent` colours the jacket, `shirt` the top under it
    shirt: '#1d1d26', accent: '#b8192f', pattern: 'plain',
    pants: '#23232e', skin: '#a8714f', hair: '#2a1512', shoes: '#2b2b30',
    hairStyle: 'long', build: 0.95,
  },
  look: {
    shirt: '#1d1d26', accent: '#b8192f', pattern: 'plain', pants: '#23232e', shoes: '#2b2b30',
    hair: '#2a1512', bald: false, beard: 'none', hat: null, glasses: null, mask: null, tattoos: {},
  },
  startCredits: 1500,
  start: { id: 'apartment', name: "Maya's apartment, Old Town", x: -144.5, z: -52.5, yaw: Math.PI, minAway: 0 },
  spots: [
    { id: 'tiki', name: 'Tiki Bytes Beach Bar', x: 196, z: 116, yaw: -Math.PI / 2, minAway: 2 },
    { id: 'apartment', name: "Maya's apartment door", x: -144.5, z: -52.5, yaw: Math.PI, minAway: 2 },
    { id: 'soc-roof', name: 'Harbor SOC rooftop', x: -40, z: 128, yaw: Math.PI, minAway: 5, roof: true },
  ],
};

export const PLAYABLE: Record<CharId, PlayableDef> = { rico: RICO, maya: MAYA };

export function otherChar(id: CharId): CharId {
  return id === 'rico' ? 'maya' : 'rico';
}
