// Pure layout data for Neon Bay. Units are meters; +x = east, +z = south, y = up.
// Used by the 3D builder, the minimap, missions and traffic AI.

export const ROADS_X = [-250, -165, -80, 5, 90, 165] as const; // north–south roads (165 = Ocean Drive)
export const ROADS_Z = [-250, -165, -80, 5, 90, 175] as const; // east–west roads
export const ROAD_WIDTH = 14;
export const SIDEWALK = 4;
export const LANE_OFFSET = 3.4;

/** Land/water boundaries. East of BEACH_X is sand, east of SHORE_X is ocean; south of HARBOR_Z is harbor water. */
export const BEACH_X = 175;
export const SHORE_X = 238;
export const HARBOR_Z = 212;
export const WORLD_MIN = -268;
export const WORLD_MAX_X = 330; // ocean playable for boats
export const WORLD_MAX_Z = 300;

export type DistrictId = 'beach' | 'downtown' | 'harbor' | 'oldtown' | 'industrial' | 'university' | 'market';

export interface District {
  id: DistrictId;
  name: string;
  color: string; // minimap tint
  blurb: string;
}

export const DISTRICTS: Record<DistrictId, District> = {
  beach: { id: 'beach', name: 'Neon Beach', color: '#ffb8d9', blurb: 'Hotels, palms and the Ocean Drive strip.' },
  downtown: { id: 'downtown', name: 'Downtown Cyber District', color: '#9fd8ff', blurb: 'Glass towers, banks and corporate HQs.' },
  harbor: { id: 'harbor', name: 'Silicon Harbor', color: '#a6ffe0', blurb: 'Data centers, docks and the SOC.' },
  oldtown: { id: 'oldtown', name: 'Old Town', color: '#ffd9a6', blurb: 'Pastel homes, cafés and corner shops.' },
  industrial: { id: 'industrial', name: 'Industrial Zone', color: '#ffc59a', blurb: 'Factories, cranes and the power plant.' },
  university: { id: 'university', name: 'Bayview University', color: '#d3b8ff', blurb: 'Labs, lecture halls and the CTF arena.' },
  market: { id: 'market', name: 'Underground Tech Market', color: '#ff9ef0', blurb: 'Neon stalls, rumors and gadgets.' },
};

export interface Block {
  col: number;
  row: number;
  x0: number; x1: number; z0: number; z1: number; // inner (sidewalk edge) bounds
  cx: number; cz: number;
  district: DistrictId;
}

function districtFor(col: number, row: number): DistrictId {
  if (col === 4) return 'beach';
  if (col <= 1) return row === 0 ? 'university' : row <= 2 ? 'oldtown' : 'industrial';
  if (row <= 1) return 'downtown';
  if (row === 2) return col === 2 ? 'market' : 'downtown';
  return 'harbor';
}

export function buildBlocks(): Block[] {
  const blocks: Block[] = [];
  const half = ROAD_WIDTH / 2;
  for (let c = 0; c < ROADS_X.length - 1; c++) {
    for (let r = 0; r < ROADS_Z.length - 1; r++) {
      const x0 = ROADS_X[c] + half, x1 = ROADS_X[c + 1] - half;
      const z0 = ROADS_Z[r] + half, z1 = ROADS_Z[r + 1] - half;
      blocks.push({ col: c, row: r, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, district: districtFor(c, r) });
    }
  }
  return blocks;
}

export function districtAt(x: number, z: number): DistrictId {
  if (x > ROADS_X[5]) return 'beach';
  const col = Math.max(0, Math.min(4, ROADS_X.findIndex((rx, i) => i < 5 && x >= rx && x < ROADS_X[i + 1])));
  const rowRaw = ROADS_Z.findIndex((rz, i) => i < 5 && z >= rz && z < ROADS_Z[i + 1]);
  const row = rowRaw < 0 ? (z < ROADS_Z[0] ? 0 : 4) : rowRaw;
  return districtFor(col < 0 ? 0 : col, row);
}

export function isWater(x: number, z: number): boolean {
  return x > SHORE_X || z > HARBOR_Z;
}

/** Named places used by missions, interactions and the map. */
export interface Place {
  id: string;
  name: string;
  x: number;
  z: number;
  icon: 'hq' | 'cafe' | 'soc' | 'dc' | 'bank' | 'uni' | 'market' | 'pier' | 'home' | 'hospital' | 'shop';
}

export const PLACES: Record<string, Place> = {
  hq: { id: 'hq', name: 'Sunset Shield HQ', x: 136, z: -40, icon: 'hq' },
  cafe: { id: 'cafe', name: 'Coral Café', x: 153, z: 48, icon: 'cafe' },
  soc: { id: 'soc', name: 'Harbor SOC', x: -40, z: 102, icon: 'soc' },
  datacenter: { id: 'datacenter', name: 'Harbor Cloud Data Center', x: 48, z: 104, icon: 'dc' },
  bank: { id: 'bank', name: 'Palmetto Bank Tower', x: 48, z: -96, icon: 'bank' },
  university: { id: 'university', name: 'Bayview University', x: -125, z: -180, icon: 'uni' },
  market: { id: 'market', name: 'Byte Bazaar (Tech Market)', x: -38, z: -38, icon: 'market' },
  pier: { id: 'pier', name: 'Starlight Pier', x: 262, z: -120, icon: 'pier' },
  carla: { id: 'carla', name: "Carla's Apartment", x: -120, z: -6, icon: 'home' },
  hospital: { id: 'hospital', name: 'Neon Bay General', x: -205, z: 15, icon: 'hospital' },
  spawn: { id: 'spawn', name: 'Ocean Drive', x: 196, z: -24, icon: 'pier' },
};

/** Intersections of the road grid, used for the traffic graph. */
export interface RoadNode { id: number; x: number; z: number; links: number[] }

export function buildRoadGraph(): RoadNode[] {
  const nodes: RoadNode[] = [];
  const idx = (i: number, j: number) => i * ROADS_Z.length + j;
  for (let i = 0; i < ROADS_X.length; i++) {
    for (let j = 0; j < ROADS_Z.length; j++) {
      nodes.push({ id: idx(i, j), x: ROADS_X[i], z: ROADS_Z[j], links: [] });
    }
  }
  for (let i = 0; i < ROADS_X.length; i++) {
    for (let j = 0; j < ROADS_Z.length; j++) {
      const n = nodes[idx(i, j)];
      if (i > 0) n.links.push(idx(i - 1, j));
      if (i < ROADS_X.length - 1) n.links.push(idx(i + 1, j));
      if (j > 0) n.links.push(idx(i, j - 1));
      if (j < ROADS_Z.length - 1) n.links.push(idx(i, j + 1));
    }
  }
  return nodes;
}

/** Deterministic PRNG so the city looks the same every launch. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hidden collectible data shards. */
export const SHARDS: { id: string; x: number; z: number; hint: string }[] = [
  { id: 'shard-1', x: 228, z: -200, hint: 'North end of the beach' },
  { id: 'shard-2', x: 290, z: -120, hint: 'End of Starlight Pier' },
  { id: 'shard-3', x: 120, z: -215, hint: 'Behind a beachfront hotel' },
  { id: 'shard-4', x: 30, z: -200, hint: 'Downtown alley' },
  { id: 'shard-5', x: -40, z: -10, hint: 'Under the market canopy' },
  { id: 'shard-6', x: -210, z: -120, hint: 'University quad' },
  { id: 'shard-7', x: -120, z: 60, hint: 'Old Town backyard' },
  { id: 'shard-8', x: -205, z: 200, hint: 'Factory yard' },
  { id: 'shard-9', x: -30, z: 205, hint: 'Harbor dock edge' },
  { id: 'shard-10', x: 120, z: 200, hint: 'Container stacks' },
  { id: 'shard-11', x: 205, z: 150, hint: 'South beach dunes' },
  { id: 'shard-12', x: -240, z: -240, hint: 'Far north-west corner' },
];
