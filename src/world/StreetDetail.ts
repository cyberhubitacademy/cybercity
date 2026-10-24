import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BEACH_X, Block, HARBOR_Z, LANE_OFFSET, PLACES, ROADS_X, ROADS_Z, ROAD_WIDTH, SHORE_X, mulberry32,
} from './layout';
import { CityBuilder, pbr } from './City';
import type { Quality } from './Environment';
import { PARKED, POSTS, TERMINALS } from './spots';
import { grass } from './textures';

// Street clutter that makes Neon Bay read as lived-in: utility poles with sagging
// power lines, signs, bins, bollards, utility boxes, storm drains, newspaper
// boxes, benches, road wear decals, grass verges, hedges, bougainvillea,
// broadleaf trees and rooftop vents / water towers.
//
// Everything is static and built once: each prop type is ONE InstancedMesh for
// the whole city, and one-offs (wires, signs, decals, verges) are merged into a
// single mesh each. Nothing runs per frame. Meshes added:
//   low: road decals + signs (2) · medium: +poles, wires, bins, hedges, flowers, tree trunks/canopies (9)
//   high/ultra: + transformers, bollards, utility boxes, drains, newspaper boxes, benches, verges, roof
//   vents, water towers (18). Only poles (high) and tree canopies cast shadows; everything else sits on
//   DETAIL_LAYER so the shadow and water-reflection passes skip it.
//
// Kerb furniture lives in the strip 0.4-1.5 m from the road edge: outside the
// traffic lanes (cars drive LANE_OFFSET = 3.4 m from the centreline, the road is
// 7 m to each side) and outside the pedestrians' walking line (2 m in).

const HALF = ROAD_WIDTH / 2;

/**
 * Render layer for small props that neither cast shadows nor need to show in the
 * water reflection. The main camera enables it (WorldSim); the reflection camera
 * and shadow cameras only see layer 0, so these cost one draw call each instead of 2-3.
 */
export const DETAIL_LAYER = 1;

/** One straight sidewalk edge of a block. Points are edge + along * s + inward * d. */
export interface KerbEdge {
  block: Block;
  /** Start corner on the road edge. */
  ax: number; az: number;
  /** Unit direction along the kerb. */
  dx: number; dz: number;
  /** Unit normal pointing into the block (away from the road). */
  nx: number; nz: number;
  len: number;
  /** Centreline coordinate of the road this edge faces and whether that road runs north-south. */
  road: number;
  roadNS: boolean;
}

/** The four kerb edges of every block. */
export function kerbEdges(blocks: readonly Block[]): KerbEdge[] {
  const out: KerbEdge[] = [];
  for (const b of blocks) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    out.push(
      { block: b, ax: b.x0, az: b.z0, dx: 1, dz: 0, nx: 0, nz: 1, len: w, road: ROADS_Z[b.row], roadNS: false },
      { block: b, ax: b.x0, az: b.z1, dx: 1, dz: 0, nx: 0, nz: -1, len: w, road: ROADS_Z[b.row + 1], roadNS: false },
      { block: b, ax: b.x0, az: b.z0, dx: 0, dz: 1, nx: 1, nz: 0, len: d, road: ROADS_X[b.col], roadNS: true },
      { block: b, ax: b.x1, az: b.z0, dx: 0, dz: 1, nx: -1, nz: 0, len: d, road: ROADS_X[b.col + 1], roadNS: true },
    );
  }
  return out;
}

/** World point s metres along an edge and d metres in from the road edge (negative d = on the road). */
export function kerbPoint(e: KerbEdge, s: number, d: number): { x: number; z: number } {
  return { x: e.ax + e.dx * s + e.nx * d, z: e.az + e.dz * s + e.nz * d };
}

/** Yaw that turns a prop's local +z toward the road. */
export function kerbYaw(e: KerbEdge): number {
  return Math.atan2(-e.nx, -e.nz);
}

/** True if (x, z) is on a roadway (within ROAD_WIDTH / 2 of any road centreline, inside the grid). */
export function onRoadway(x: number, z: number): boolean {
  const inZ = z >= ROADS_Z[0] - HALF && z <= ROADS_Z[ROADS_Z.length - 1] + HALF;
  const inX = x >= ROADS_X[0] - HALF && x <= ROADS_X[ROADS_X.length - 1] + HALF;
  return (inZ && ROADS_X.some((r) => Math.abs(x - r) < HALF)) || (inX && ROADS_Z.some((r) => Math.abs(z - r) < HALF));
}

/** Sag of a hanging wire at parameter t (0..1): parabola approximating a catenary. */
export function wireSag(t: number, sag: number): number {
  return -4 * sag * t * (1 - t);
}

/**
 * Stop-sign spots: one per approach of every intersection, on the kerb to the
 * right of the approaching car, just before the zebra crossing, facing traffic.
 */
export function stopSignSpots(): { x: number; z: number; yaw: number }[] {
  const out: { x: number; z: number; yaw: number }[] = [];
  const dirs: [number, number, number, number][] = [[0, -1, 0, -1], [0, 1, 0, 1], [-1, 0, -1, 0], [1, 0, 1, 0]];
  for (let i = 0; i < ROADS_X.length; i++) {
    for (let j = 0; j < ROADS_Z.length; j++) {
      for (const [dx, dz, di, dj] of dirs) {
        // the approach needs a road segment in that direction
        if (ROADS_X[i + di] === undefined || ROADS_Z[j + dj] === undefined) continue;
        // car heading (-dx,-dz); its right-hand side in this y-up, +z-south frame
        const rx = dz, rz = -dx;
        const x = ROADS_X[i] + dx * (HALF + 5.3) + rx * (HALF + 0.6);
        const z = ROADS_Z[j] + dz * (HALF + 5.3) + rz * (HALF + 0.6);
        if (x > SHORE_X - 24 || z > HARBOR_Z - 3) continue;
        out.push({ x, z, yaw: Math.atan2(dx, dz) });
      }
    }
  }
  return out;
}

/** Fixed gameplay spots owned by other systems (stops, shops, vehicle spawns, mission points): keep 3.5 m clear. */
const SYSTEM_SPOTS: readonly (readonly [number, number])[] = [
  [175, -30], [157, -22], [157, 30], [-3.5, -50], [-110, -172.5], [-195, 12.5], [60, 167.5], [156.5, -160], [156.5, -42],
  [110, -3.5], [-30, -3.5], [-120, -3.5], [-160, -3.5], [70, -89], [156.5, -62], [-110, -70.5], [156.5, -8], [-16, -73.2],
  [-118, -0.6], [-128, -170.6], [178, 10], [205, -12], [-248, 184], [84.6, -50], [32, 190], [156.5, 108], [-200, 96.5],
  [194.6, 119], [-112, -168], [-165, 132], [-168, 169], [-168, 96], [-175, 205], [-183, 90], [-20, 175], [-207, 175],
  [-212, 90], [-215, 90], [-246, 169], [-246, 95], [-250, 132], [-40, 92], [-50, -48], [-60, 175], [-71, -150], [-89, 150],
  [-89, 40], [100, 194], [110, 194], [125, 175], [130, 194], [130, 90], [14, -100], [14, -200], [140, 194], [150, -24],
  [150, 194], [151, 62], [162, 173], [165, -100], [165, -160], [165, -205], [165, -40], [165, 135], [165, 20], [165, 80],
  [165, 90], [174, 62], [178, -2], [22, -92], [24, 196], [26, -80], [30, -80], [30, 175], [47, -165], [5, -120], [60, -80],
  [7, -162], [70, 175], [8, -83], [81, -120], [81, -210], [81, 130], [87, -164], [89, -84], [89, 171], [90, -125], [90, 130],
  [90, 175], [93, 92], [99, -140], [99, -160],
];

const STREET_NAMES_X = ['WESTSHORE AVE', 'BAYVIEW AVE', 'PALMETTO AVE', 'NEON AVE', 'FLAMINGO AVE', 'OCEAN DR'];
const STREET_NAMES_Z = ['NORTH ST', 'CORAL ST', 'LAGOON ST', 'CENTRAL ST', 'HARBOR ST', 'DOCK ST'];

// ---------- geometry helpers ----------

/** Non-indexed copy with a flat vertex colour and no UVs, ready to merge. */
function part(geo: THREE.BufferGeometry, color: string, m?: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  geo.dispose();
  g.deleteAttribute('uv');
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('StreetDetail: merge failed');
  for (const p of parts) p.dispose();
  return g;
}

const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number): THREE.BufferGeometry =>
  part(new THREE.BoxGeometry(w, h, d), color, at(x, y, z));
const cyl = (r0: number, r1: number, h: number, seg: number, color: string, x: number, y: number, z: number, rx = 0, rz = 0): THREE.BufferGeometry =>
  part(new THREE.CylinderGeometry(r0, r1, h, seg), color, at(x, y, z, rx, 0, rz));

/** Wooden utility pole: crossarm across the road (local z), insulators, telecom bracket. */
function poleGeo(): THREE.BufferGeometry {
  const wood = '#6e5a48', steel = '#8d9196', glass = '#cfd8d6';
  return merge([
    cyl(0.11, 0.16, 9.6, 7, wood, 0, 4.8, 0),
    box(0.11, 0.11, 2.5, wood, 0, 8.85, 0),
    box(0.05, 0.05, 1.2, steel, 0, 8.45, -0.45),
    cyl(0.05, 0.06, 0.18, 6, glass, 0, 9.0, -1.05),
    cyl(0.05, 0.06, 0.18, 6, glass, 0, 9.0, 1.05),
    cyl(0.05, 0.06, 0.18, 6, glass, 0, 9.0, 0.35),
    box(0.06, 0.06, 0.36, steel, 0, 7.2, -0.2),
  ]);
}

/** Wire attach points on a pole in its local frame (x along kerb, z toward road). */
const WIRE_ATTACH: readonly [number, number][] = [[9.12, -1.05], [9.12, 1.05], [9.12, 0.35], [7.2, -0.38]];

function transformerGeo(): THREE.BufferGeometry {
  return merge([
    cyl(0.3, 0.3, 0.95, 8, '#9aa1a8', 0, 7.65, -0.48),
    cyl(0.32, 0.32, 0.06, 8, '#6f767d', 0, 8.15, -0.48),
    box(0.1, 0.5, 0.1, '#6f767d', 0, 7.65, -0.16),
  ]);
}

function binGeo(): THREE.BufferGeometry {
  return merge([
    cyl(0.3, 0.27, 0.9, 9, '#ffffff', 0, 0.63, 0),
    cyl(0.33, 0.33, 0.08, 9, '#c8c8c8', 0, 1.1, 0),
    cyl(0.2, 0.22, 0.18, 9, '#2b2d30', 0, 0.09, 0),
  ]);
}

function bollardGeo(): THREE.BufferGeometry {
  return merge([
    cyl(0.1, 0.11, 0.85, 7, '#3b3e44', 0, 0.6, 0),
    cyl(0.106, 0.106, 0.08, 7, '#e8c33a', 0, 0.86, 0),
    part(new THREE.SphereGeometry(0.1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), '#3b3e44', at(0, 1.02, 0)),
  ]);
}

function utilityBoxGeo(): THREE.BufferGeometry {
  return merge([
    box(0.9, 1.15, 0.5, '#9aa59c', 0, 0.78, 0),
    box(0.96, 0.06, 0.56, '#7d877f', 0, 1.38, 0),
    box(0.95, 0.1, 0.55, '#c9c4ba', 0, 0.23, 0),
    box(0.02, 0.9, 0.02, '#6a736c', 0, 0.8, 0.26),
  ]);
}

/** Storm-drain grate on the asphalt plus the inlet slot in the kerb face (origin = road edge, +z = road). */
function drainGeo(): THREE.BufferGeometry {
  // flat quads (2 triangles each) rather than boxes: there are a couple of hundred of these
  const flat = (w: number, d: number, color: string, x: number, y: number, z: number) => part(new THREE.PlaneGeometry(w, d), color, at(x, y, z, -Math.PI / 2));
  const parts = [
    flat(1.0, 0.56, '#4c4f53', 0, 0.006, 0.42),
    flat(0.84, 0.42, '#141517', 0, 0.008, 0.42),
    part(new THREE.PlaneGeometry(1.1, 0.07), '#0d0d0e', at(0, 0.075, 0.01)),
  ];
  for (let i = -3; i <= 3; i++) parts.push(flat(0.04, 0.42, '#55595e', i * 0.11, 0.01, 0.42));
  return merge(parts);
}

function newsBoxGeo(): THREE.BufferGeometry {
  return merge([
    box(0.48, 0.62, 0.42, '#ffffff', 0, 0.72, 0),
    box(0.5, 0.05, 0.44, '#d0d0d0', 0, 1.05, 0),
    box(0.36, 0.28, 0.02, '#202a33', 0, 0.82, 0.215),
    box(0.04, 0.42, 0.04, '#2a2c2f', -0.18, 0.21, 0),
    box(0.04, 0.42, 0.04, '#2a2c2f', 0.18, 0.21, 0),
  ]);
}

/** Bench facing local -z (toward the building side); its back is on the road side. */
function benchGeo(): THREE.BufferGeometry {
  const wood = '#9a6b45', metal = '#2e3236';
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) parts.push(box(1.7, 0.04, 0.12, wood, 0, 0.46, -0.16 + i * 0.14));
  for (let i = 0; i < 2; i++) parts.push(part(new THREE.BoxGeometry(1.7, 0.12, 0.04), wood, at(0, 0.66 + i * 0.16, 0.2 + i * 0.03, -0.18)));
  for (const x of [-0.72, 0.72]) {
    parts.push(box(0.06, 0.44, 0.06, metal, x, 0.22, -0.14), box(0.06, 0.86, 0.06, metal, x, 0.43, 0.2), box(0.06, 0.05, 0.44, metal, x, 0.43, 0.02));
  }
  return merge(parts);
}

/** Lumpy box (1 x 1 x 1, base at y=0) for hedges; darker at the bottom. */
function hedgeGeo(rnd: () => number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 6, 3, 2).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(0, 0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  // jitter per unique vertex so faces stay welded
  const jit = new Map<string, number>();
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let j = jit.get(k);
    if (j === undefined) { j = (rnd() - 0.5) * 0.12; jit.set(k, j); }
    const top = y > 0.99 ? 0.06 : 0;
    p.setXYZ(i, x * (1 + j), y + (y > 0.01 ? j + top : 0), z * (1 + j * 1.5));
    const t = y;
    // linear-space olive greens (vertex colours are not sRGB-decoded)
    cols[i * 3] = 0.035 + t * 0.04; cols[i * 3 + 1] = 0.075 + t * 0.07; cols[i * 3 + 2] = 0.025 + t * 0.02;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

/** Bushy blob: olive leaves underneath, magenta / red / pink bracts on top (colours baked per vertex). */
function bougainvilleaGeo(rnd: () => number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(p.count * 3);
  const blooms = ['#a8174f', '#b81d4f', '#94123a', '#c23a6e', '#8f1a4a', '#7a3d2a'].map((c) => new THREE.Color(c));
  for (let i = 0; i < p.count; i++) {
    const j = 0.78 + rnd() * 0.4;
    const y = p.getY(i);
    p.setXYZ(i, p.getX(i) * j, Math.max(-0.15, y) * j * 0.85 + 0.12, p.getZ(i) * j);
    if (y > 0 && rnd() < 0.6) {
      const c = blooms[Math.floor(rnd() * blooms.length)];
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    } else { cols[i * 3] = 0.03; cols[i * 3 + 1] = 0.07; cols[i * 3 + 2] = 0.025; }
  }
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function treeTrunkGeo(): THREE.BufferGeometry {
  const bark = '#5d4a3a';
  return merge([
    cyl(0.16, 0.26, 3.4, 7, bark, 0, 1.7, 0),
    cyl(0.07, 0.13, 2.2, 6, bark, 0.55, 3.9, 0.1, 0, -0.55),
    cyl(0.07, 0.13, 2.0, 6, bark, -0.45, 3.8, -0.3, 0.3, 0.5),
  ]);
}

/** Canopy: several jittered blobs merged, olive greens with lighter tops. */
function treeCanopyGeo(rnd: () => number): THREE.BufferGeometry {
  const blobs: [number, number, number, number][] = [[0, 5.5, 0, 2.4], [1.4, 4.7, 0.4, 1.7], [-1.3, 4.8, -0.5, 1.8], [0.2, 4.6, 1.4, 1.6]];
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const j = 0.82 + rnd() * 0.3;
      p.setXYZ(i, p.getX(i) * j + x, p.getY(i) * j * 0.85 + y, p.getZ(i) * j + z);
      const t = Math.min(1, Math.max(0, (p.getY(i) - 3) / 4.5));
      cols[i * 3] = 0.04 + t * 0.05; cols[i * 3 + 1] = 0.08 + t * 0.07; cols[i * 3 + 2] = 0.025 + t * 0.02;
    }
    g.deleteAttribute('uv');
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(g);
  }
  const g = merge(parts);
  g.computeVertexNormals();
  return g;
}

function ventGeo(): THREE.BufferGeometry {
  return merge([
    cyl(0.22, 0.22, 0.8, 8, '#b9bec4', 0, 0.4, 0),
    cyl(0.04, 0.38, 0.22, 8, '#9ca2a8', 0, 0.9, 0),
    box(0.9, 0.5, 0.6, '#cfd3d8', 1.0, 0.25, 0.2),
    cyl(0.06, 0.06, 1.1, 6, '#8a9096', 1.2, 0.75, -0.3),
  ]);
}

/** Classic rooftop water tower: tank on a steel stand with a conical lid. */
function waterTowerGeo(): THREE.BufferGeometry {
  const steel = '#4f555c', wood = '#8a6a4e';
  const parts = [
    cyl(1.25, 1.25, 2.4, 12, wood, 0, 3.3, 0),
    part(new THREE.ConeGeometry(1.35, 0.8, 12), '#5d4a3a', at(0, 4.9, 0)),
    box(2.6, 0.12, 2.6, steel, 0, 2.06, 0),
  ];
  for (const x of [-1, 1]) for (const z of [-1, 1]) parts.push(box(0.12, 2.0, 0.12, steel, x, 1.0, z));
  parts.push(part(new THREE.BoxGeometry(2.8, 0.06, 0.06), steel, at(0, 1.0, 1, 0, 0, 0.62)), part(new THREE.BoxGeometry(2.8, 0.06, 0.06), steel, at(0, 1.0, -1, 0, 0, -0.62)));
  return merge(parts);
}

// ---------- sign atlas (all signs = one texture, one merged mesh) ----------

interface AtlasRect { u0: number; v0: number; u1: number; v1: number }
const ATLAS = 1024;

function atlasRect(x: number, y: number, w: number, h: number): AtlasRect {
  return { u0: x / ATLAS, u1: (x + w) / ATLAS, v0: 1 - (y + h) / ATLAS, v1: 1 - y / ATLAS };
}

const R_STOP = atlasRect(0, 0, 256, 256);
const R_SPEED = atlasRect(256, 0, 192, 256);
const R_NOPARK = atlasRect(448, 0, 192, 256);
const R_BIKE = atlasRect(640, 0, 192, 256);
const R_METAL = atlasRect(968, 8, 48, 48);
const R_NAME = (i: number): AtlasRect => atlasRect(0, 256 + i * 64, 448, 64);

function signAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const font = (px: number) => `bold ${px}px Arial, Helvetica, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // galvanised metal (poles, sign backs)
  g.fillStyle = '#a3a8ad';
  g.fillRect(960, 0, 64, 64);
  // STOP octagon, vertices at 22.5° + k·45° to match CircleGeometry(…, 8) rotated by π/8
  const oct = (r: number) => {
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI) / 4;
      g.lineTo(128 + Math.cos(a) * r, 128 - Math.sin(a) * r);
    }
    g.closePath();
  };
  g.fillStyle = '#ffffff'; oct(128); g.fill();
  g.fillStyle = '#c4161c'; oct(118); g.fill();
  g.fillStyle = '#ffffff'; g.font = font(78); g.fillText('STOP', 128, 132);
  // white regulatory plates with a black border
  const plate = (x: number) => {
    g.fillStyle = '#f4f4f0'; g.fillRect(x, 0, 192, 256);
    g.strokeStyle = '#111111'; g.lineWidth = 8; g.strokeRect(x + 10, 10, 172, 236);
  };
  plate(256);
  g.fillStyle = '#111111'; g.font = font(34); g.fillText('SPEED', 352, 50); g.fillText('LIMIT', 352, 88);
  g.font = font(110); g.fillText('35', 352, 180);
  plate(448);
  g.font = font(30); g.fillStyle = '#111111'; g.fillText('NO', 544, 42); g.fillText('PARKING', 544, 222);
  g.strokeStyle = '#c4161c'; g.lineWidth = 12;
  g.beginPath(); g.arc(544, 132, 64, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#111111'; g.font = font(96); g.fillText('P', 544, 136);
  g.strokeStyle = '#c4161c'; g.beginPath(); g.moveTo(500, 88); g.lineTo(588, 176); g.stroke();
  plate(640);
  g.fillStyle = '#111111'; g.font = font(36); g.fillText('BIKE', 736, 186); g.fillText('LANE', 736, 224);
  g.strokeStyle = '#1f7a3a'; g.lineWidth = 7;
  for (const cx of [700, 772]) { g.beginPath(); g.arc(cx, 112, 28, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(700, 112); g.lineTo(728, 70); g.lineTo(760, 70); g.lineTo(772, 112); g.moveTo(728, 70); g.lineTo(740, 112); g.lineTo(760, 70); g.stroke();
  // green street-name blades
  const names = [...STREET_NAMES_X, ...STREET_NAMES_Z];
  names.forEach((n, i) => {
    const y = 256 + i * 64;
    g.fillStyle = '#1d6b3c'; g.fillRect(0, y, 448, 64);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 4; g.strokeRect(5, y + 5, 438, 54);
    g.fillStyle = '#ffffff'; g.font = font(38); g.fillText(n, 224, y + 34);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Remap a geometry's 0..1 UVs into an atlas rect (or collapse them onto it). */
function atlasPart(geo: THREE.BufferGeometry, r: AtlasRect, m: THREE.Matrix4, collapse = false): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  geo.dispose();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = collapse ? 0.5 : uv.getX(i), v = collapse ? 0.5 : uv.getY(i);
    uv.setXY(i, r.u0 + (r.u1 - r.u0) * u, r.v0 + (r.v1 - r.v0) * v);
  }
  g.applyMatrix4(m);
  return g;
}

// ---------- placement ----------

interface Rect { x0: number; z0: number; x1: number; z1: number }

class Placer {
  private keep: { x: number; z: number; r: number }[] = [];
  private keepRects: Rect[] = [
    { x0: 100, z0: -66, x1: 160, z1: -14 }, // HQ lobby front
    { x0: 112, z0: 30, x1: 160, z1: 66 }, // café terrace
  ];

  constructor(private city: CityBuilder) {
    for (const [x, z] of SYSTEM_SPOTS) this.keep.push({ x, z, r: 3.5 });
    for (const p of Object.values(PLACES)) this.keep.push({ x: p.x, z: p.z, r: 4 });
    for (const t of TERMINALS) this.keep.push({ x: t.x, z: t.z, r: 3 });
    for (const p of POSTS) this.keep.push({ x: p.x, z: p.z, r: 3 });
    for (const p of PARKED) this.keep.push({ x: p.x, z: p.z, r: 4 });
    this.keep.push({ x: -38, z: -38, r: 30 }); // market ring
  }

  /** No collider taller than 0.3 m (buildings, palms, lamps, other props) within r, and not a gameplay spot. */
  free(x: number, z: number, r: number): boolean {
    if (onRoadway(x, z)) return false;
    return this.freeRect(x - r, z - r, x + r, z + r);
  }

  freeRect(x0: number, z0: number, x1: number, z1: number): boolean {
    for (const k of this.keep) {
      const cx = Math.max(x0, Math.min(k.x, x1)), cz = Math.max(z0, Math.min(k.z, z1));
      if ((cx - k.x) ** 2 + (cz - k.z) ** 2 < k.r * k.r) return false;
    }
    for (const k of this.keepRects) if (x0 < k.x1 && x1 > k.x0 && z0 < k.z1 && z1 > k.z0) return false;
    const r = Math.max(x1 - x0, z1 - z0) / 2 + 1;
    for (const b of this.city.collision.near((x0 + x1) / 2, (z0 + z1) / 2, r)) {
      if (b.y1 <= 0.3 || b.y0 > 3) continue;
      if (b.x0 < x1 && b.x1 > x0 && b.z0 < z1 && b.z1 > z0) return false;
    }
    return true;
  }

  /** Small square collider (pedestrians and cars bump it). */
  solid(x: number, z: number, r: number, h: number): void {
    this.city.collision.addRect(x - r, z - r, x + r, z + r, h);
  }
}

/** Instance list for one prop type. */
class Batch {
  readonly mats: THREE.Matrix4[] = [];
  readonly cols: THREE.Color[] = [];
  private static readonly q = new THREE.Quaternion();
  private static readonly e = new THREE.Euler();
  private static readonly p = new THREE.Vector3();
  private static readonly s = new THREE.Vector3();

  add(x: number, y: number, z: number, yaw: number, sx = 1, sy = sx, sz = sx, color?: THREE.Color): void {
    Batch.q.setFromEuler(Batch.e.set(0, yaw, 0));
    this.mats.push(new THREE.Matrix4().compose(Batch.p.set(x, y, z), Batch.q, Batch.s.set(sx, sy, sz)));
    if (color) this.cols.push(color);
  }

  flush(group: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, castShadow: boolean): void {
    if (!this.mats.length) { geo.dispose(); return; }
    const inst = new THREE.InstancedMesh(geo, mat, this.mats.length);
    this.mats.forEach((m, i) => inst.setMatrixAt(i, m));
    if (this.cols.length === this.mats.length) this.cols.forEach((c, i) => inst.setColorAt(i, c));
    inst.castShadow = castShadow;
    inst.receiveShadow = true;
    if (!castShadow) inst.layers.set(DETAIL_LAYER);
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();
    group.add(inst);
  }
}

/** Accumulates flat RGBA quads for the road decal mesh. */
class Decals {
  readonly pos: number[] = [];
  readonly col: number[] = [];

  private v(x: number, y: number, z: number, r: number, g: number, b: number, a: number): void {
    this.pos.push(x, y, z);
    this.col.push(r, g, b, a);
  }

  /** Quad from corner points (counter-clockwise seen from above) with per-corner alpha. */
  quad(p: [number, number][], y: number, rgb: THREE.Color, a: [number, number, number, number]): void {
    const idx = [0, 2, 1, 0, 3, 2];
    for (const i of idx) this.v(p[i][0], y, p[i][1], rgb.r, rgb.g, rgb.b, a[i]);
  }

  /** Strip along an axis-aligned centreline, soft (alpha 0) at both long edges when soft = true. */
  strip(ns: boolean, c: number, t0: number, t1: number, w: number, y: number, rgb: THREE.Color, a: number, soft: boolean): void {
    const pt = (t: number, o: number): [number, number] => (ns ? [c + o, t] : [t, c + o]);
    if (!soft) {
      this.quad([pt(t0, -w / 2), pt(t0, w / 2), pt(t1, w / 2), pt(t1, -w / 2)], y, rgb, [a, a, a, a]);
      return;
    }
    this.quad([pt(t0, -w / 2), pt(t0, 0), pt(t1, 0), pt(t1, -w / 2)], y, rgb, [0, a, a, 0]);
    this.quad([pt(t0, 0), pt(t0, w / 2), pt(t1, w / 2), pt(t1, 0)], y, rgb, [a, 0, 0, a]);
  }

  /** Soft round stain. */
  disc(x: number, z: number, r: number, y: number, rgb: THREE.Color, a: number): void {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      this.v(x, y, z, rgb.r, rgb.g, rgb.b, a);
      this.v(x + Math.cos(a1) * r, y, z + Math.sin(a1) * r, rgb.r, rgb.g, rgb.b, 0);
      this.v(x + Math.cos(a0) * r, y, z + Math.sin(a0) * r, rgb.r, rgb.g, rgb.b, 0);
    }
  }

  mesh(): THREE.Mesh | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 4));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array<number>(this.pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    return mesh;
  }
}

/** Build all street detail into city.group (and colliders into city.collision). */
export function buildStreetDetail(city: CityBuilder, quality: Quality): void {
  try {
    new StreetDetail(city, quality).build();
  } catch (err) {
    // decoration only: never take the game down with it
    console.warn('[StreetDetail] skipped', err);
  }
}

class StreetDetail {
  private rnd = mulberry32(9090);
  /** Everything built here hangs off this group (named so it can be toggled when profiling). */
  private root = new THREE.Group();
  private place: Placer;
  private edges: KerbEdge[];
  private readonly mid: boolean;
  private readonly full: boolean;
  private furniture = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.2 });
  private leaves = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });

  constructor(private city: CityBuilder, quality: Quality) {
    this.mid = quality !== 'low';
    this.full = quality === 'high' || quality === 'ultra';
    this.place = new Placer(city);
    this.edges = kerbEdges(city.blocks);
  }

  build(): void {
    this.root.name = 'StreetDetail';
    this.city.group.add(this.root);
    this.roadDecals();
    this.signs();
    if (!this.mid) return;
    this.powerLines();
    this.kerbFurniture();
    this.greenery();
    if (this.full) this.rooftops();
  }

  // ---------- road surface ----------

  private roadDecals(): void {
    const d = new Decals();
    const r = this.rnd;
    const dark = new THREE.Color('#0b0b0d');
    const patchC = new THREE.Color('#1a1b1f');
    const oil = new THREE.Color('#050506');
    const green = new THREE.Color('#2e6e40');
    const white = new THREE.Color('#f2f2ee');
    const zMin = ROADS_Z[0] - HALF, zMax = ROADS_Z[ROADS_Z.length - 1] + HALF;
    const xMin = ROADS_X[0] - HALF, xMax = ROADS_X[ROADS_X.length - 1] + HALF;
    const roads: [boolean, number, number, number, readonly number[]][] = [
      ...ROADS_X.map((x): [boolean, number, number, number, readonly number[]] => [true, x, zMin, zMax, ROADS_Z]),
      ...ROADS_Z.map((z): [boolean, number, number, number, readonly number[]] => [false, z, xMin, xMax, ROADS_X]),
    ];
    // avenues with painted bike lanes (not the tram roads x = 165 / z = 5)
    const bike = new Set(['x' + ROADS_X[2], 'x' + ROADS_X[4], 'z' + ROADS_Z[2], 'z' + ROADS_Z[4]]);
    for (const [ns, c, t0, t1, cross] of roads) {
      // worn tyre bands: two per lane, soft-edged
      for (const lane of [-LANE_OFFSET, LANE_OFFSET]) {
        for (const w of [-0.82, 0.82]) d.strip(ns, c + lane + w, t0, t1, 0.55, 0.012, dark, 0.13, true);
        // oil drip down the middle of the lane
        d.strip(ns, c + lane, t0, t1, 0.9, 0.011, dark, 0.06, true);
      }
      // segments between intersections
      for (let i = 0; i < cross.length - 1; i++) {
        const s0 = cross[i] + HALF + 4.6, s1 = cross[i + 1] - HALF - 4.6;
        // stop-line stains in front of each crossing
        for (const lane of [-LANE_OFFSET, LANE_OFFSET]) {
          const at0 = lane > 0 !== ns ? s1 - 2.5 : s0 + 2.5;
          const p: [number, number] = ns ? [c + lane, at0] : [at0, c + lane];
          d.disc(p[0], p[1], 1.4, 0.013, oil, 0.22);
        }
        // asphalt patches
        const n = 1 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) {
          const t = s0 + 4 + r() * (s1 - s0 - 8);
          const o = (r() - 0.5) * (ROAD_WIDTH - 3);
          const len = 1.5 + r() * 3.5, w = 1 + r() * 2.2;
          d.strip(ns, c + o, t, t + len, w, 0.014, patchC, 0.32, false);
        }
        if (this.mid && bike.has((ns ? 'x' : 'z') + c)) {
          for (const side of [-1, 1]) {
            d.strip(ns, c + side * (HALF - 1.15), s0, s1, 1.5, 0.016, green, 0.72, false);
            d.strip(ns, c + side * (HALF - 2.0), s0, s1, 0.14, 0.017, white, 0.7, false);
          }
        }
      }
    }
    const m = d.mesh();
    if (m) { m.layers.set(DETAIL_LAYER); this.root.add(m); }
  }

  // ---------- signs (stop, regulatory, street names): one merged mesh ----------

  private signs(): void {
    const parts: THREE.BufferGeometry[] = [];
    const r = this.rnd;
    const pole = (x: number, z: number, h: number) => {
      parts.push(atlasPart(new THREE.CylinderGeometry(0.04, 0.04, h, 6, 1, true), R_METAL, at(x, h / 2, z), true));
      this.place.solid(x, z, 0.08, h);
    };
    /** Plate facing yaw (local +z) at height y, with a metal back. */
    const plate = (geo: () => THREE.BufferGeometry, rect: AtlasRect, x: number, y: number, z: number, yaw: number) => {
      const fx = Math.sin(yaw) * 0.05, fz = Math.cos(yaw) * 0.05;
      parts.push(atlasPart(geo(), rect, at(x + fx, y, z + fz, 0, yaw, 0)));
      parts.push(atlasPart(geo(), R_METAL, at(x + fx * 0.8, y, z + fz * 0.8, 0, yaw + Math.PI, 0), true));
    };
    const octagon = () => new THREE.CircleGeometry(0.4, 8, Math.PI / 8);

    for (const s of stopSignSpots()) {
      if (!this.place.free(s.x, s.z, 0.25)) continue;
      pole(s.x, s.z, 2.6);
      plate(octagon, R_STOP, s.x, 2.35, s.z, s.yaw);
    }
    // street-name blades on one corner of every intersection
    for (let i = 0; i < ROADS_X.length; i++) {
      for (let j = 0; j < ROADS_Z.length; j++) {
        const sx = r() < 0.5 ? -1 : 1, sz = r() < 0.5 ? -1 : 1;
        const x = ROADS_X[i] + sx * (HALF + 0.7), z = ROADS_Z[j] + sz * (HALF + 0.7);
        if (x > SHORE_X - 24 || z > HARBOR_Z - 3 || !this.place.free(x, z, 0.25)) continue;
        pole(x, z, 3.5);
        const blade = () => new THREE.PlaneGeometry(1.15, 0.17);
        // blade along x names the east-west street, blade along z the north-south one
        for (const back of [0, Math.PI]) {
          parts.push(atlasPart(blade(), R_NAME(STREET_NAMES_X.length + j), at(x - sx * 0.5, 3.2, z, 0, back, 0)));
          parts.push(atlasPart(blade(), R_NAME(i), at(x, 3.42, z - sz * 0.5, 0, back + Math.PI / 2, 0)));
        }
      }
    }
    // regulatory signs along some kerbs
    const bikeRoads = new Set<number>([ROADS_X[2], ROADS_X[4], ROADS_Z[2], ROADS_Z[4]]);
    for (const e of this.edges) {
      if (r() > 0.45) continue;
      const s = 14 + r() * (e.len - 28);
      const p = kerbPoint(e, s, 0.5);
      if (!this.place.free(p.x, p.z, 0.3)) continue;
      const kind = bikeRoads.has(e.road) && r() < 0.6 ? R_BIKE : r() < 0.55 ? R_SPEED : R_NOPARK;
      const yaw = Math.atan2(-e.nz, e.nx); // face the oncoming traffic in the kerb-side lane
      pole(p.x, p.z, 2.7);
      plate(() => new THREE.PlaneGeometry(0.45, 0.6), kind, p.x, 2.3, p.z, yaw);
    }
    if (!parts.length) return;
    const geo = merge(parts);
    const mat = new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.5, metalness: 0.15, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.layers.set(DETAIL_LAYER);
    this.root.add(mesh);
  }

  // ---------- utility poles + power lines ----------

  private powerLines(): void {
    const poles = new Batch();
    const trans = new Batch();
    const wire: number[] = [];
    const wv = 0.022; // half wire thickness
    const pushWire = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const span = Math.hypot(bx - ax, bz - az);
      const sag = 0.35 + span * 0.018;
      const segs = 8;
      // horizontal unit perpendicular to the span
      const px = -(bz - az) / span, pz = (bx - ax) / span;
      let x0 = ax, y0 = ay, z0 = az;
      for (let k = 1; k <= segs; k++) {
        const t = k / segs;
        const x1 = ax + (bx - ax) * t, z1 = az + (bz - az) * t, y1 = ay + (by - ay) * t + wireSag(t, sag);
        // two crossed ribbons so the wire reads from any angle
        wire.push(x0, y0 - wv, z0, x1, y1 - wv, z1, x1, y1 + wv, z1, x0, y0 - wv, z0, x1, y1 + wv, z1, x0, y0 + wv, z0);
        wire.push(x0 - px * wv, y0, z0 - pz * wv, x1 - px * wv, y1, z1 - pz * wv, x1 + px * wv, y1, z1 + pz * wv,
          x0 - px * wv, y0, z0 - pz * wv, x1 + px * wv, y1, z1 + pz * wv, x0 + px * wv, y0, z0 + pz * wv);
        x0 = x1; y0 = y1; z0 = z1;
      }
    };
    // one run per road, on the east side of north-south roads and the south side of east-west roads;
    // no poles downtown (buried cables) or on Ocean Drive (palms and promenade)
    const runs: KerbEdge[][] = [];
    for (let i = 0; i < ROADS_X.length - 1; i++) runs.push(this.edges.filter((e) => e.roadNS && e.road === ROADS_X[i] && e.nx === 1).sort((a, b) => a.az - b.az));
    for (let j = 0; j < ROADS_Z.length - 1; j++) runs.push(this.edges.filter((e) => !e.roadNS && e.road === ROADS_Z[j] && e.nz === 1).sort((a, b) => a.ax - b.ax));
    let count = 0;
    for (const run of runs) {
      let prev: { x: number; z: number; yaw: number } | null = null;
      for (const e of run) {
        if (e.block.district === 'downtown') { prev = null; continue; }
        const n = Math.max(2, Math.round((e.len - 8) / 26) + 1);
        for (let k = 0; k < n; k++) {
          const s0 = 4 + (k * (e.len - 8)) / (n - 1);
          let spot: { x: number; z: number } | null = null;
          for (const ds of [0, 1.5, -1.5, 3, -3]) {
            const p = kerbPoint(e, s0 + ds, 0.45);
            if (this.place.free(p.x, p.z, 0.3)) { spot = p; break; }
          }
          if (!spot) { prev = null; continue; }
          const yaw = kerbYaw(e);
          poles.add(spot.x, 0, spot.z, yaw);
          this.place.solid(spot.x, spot.z, 0.16, 9.6);
          if (this.full && count++ % 3 === 1) trans.add(spot.x, 0, spot.z, yaw);
          if (prev && Math.hypot(spot.x - prev.x, spot.z - prev.z) < 34) {
            for (const [y, o] of WIRE_ATTACH) {
              // local z (toward road) = (sin yaw, cos yaw)
              pushWire(prev.x + Math.sin(prev.yaw) * o, y, prev.z + Math.cos(prev.yaw) * o, spot.x + Math.sin(yaw) * o, y, spot.z + Math.cos(yaw) * o);
            }
          }
          prev = { x: spot.x, z: spot.z, yaw };
        }
      }
    }
    poles.flush(this.root, poleGeo(), this.furniture, this.full);
    trans.flush(this.root, transformerGeo(), this.furniture, false);
    if (wire.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#1c1d20', side: THREE.DoubleSide }));
      m.matrixAutoUpdate = false;
      m.layers.set(DETAIL_LAYER);
      this.root.add(m);
    }
  }

  // ---------- kerb furniture ----------

  private kerbFurniture(): void {
    const r = this.rnd;
    const bins = new Batch(), bollards = new Batch(), boxes = new Batch(), drains = new Batch(), news = new Batch(), benches = new Batch();
    const binCols = ['#2f4a3a', '#2c3f5c', '#3a3a3e'].map((c) => new THREE.Color(c));
    const newsCols = ['#2b5fae', '#c23b30', '#e0b52a', '#e9e9e4', '#2f8a5a'].map((c) => new THREE.Color(c));
    const busy = (e: KerbEdge) => e.block.district === 'downtown' || e.block.district === 'market' || e.block.district === 'beach';
    const tryAt = (e: KerbEdge, s: number, d: number, rad: number): { x: number; z: number } | null => {
      if (s < 5.5 || s > e.len - 5.5) return null;
      const p = kerbPoint(e, s, d);
      return this.place.free(p.x, p.z, rad) ? p : null;
    };
    for (const e of this.edges) {
      const yaw = kerbYaw(e);
      // bins every ~30 m
      for (let s = 9 + r() * 6; s < e.len - 6; s += 26 + r() * 10) {
        if (r() > 0.75) continue;
        const p = tryAt(e, s, 1.0, 0.4);
        if (!p) continue;
        bins.add(p.x, 0.18, p.z, r() * 6.28, 1, 1, 1, binCols[Math.floor(r() * binCols.length)]);
        this.place.solid(p.x, p.z, 0.32, 1.15);
      }
      if (this.full) {
        // storm drains on the asphalt at the kerb, near both ends and mid-block
        for (const s of [8.5, e.len / 2 + (r() - 0.5) * 10, e.len - 8.5]) {
          if (r() < 0.25) continue;
          const p = kerbPoint(e, s, 0);
          drains.add(p.x, 0, p.z, yaw);
        }
        // bollards just past the crossings on busy corners
        if (busy(e)) {
          for (const s of [5.6, 6.9, e.len - 6.9, e.len - 5.6]) {
            const p = kerbPoint(e, s, 0.45);
            if (!this.place.free(p.x, p.z, 0.15)) continue;
            bollards.add(p.x, 0.18, p.z, 0);
            this.place.solid(p.x, p.z, 0.12, 1.05);
          }
        }
        // newspaper boxes in a row near a corner
        if (r() < (busy(e) ? 0.55 : 0.3)) {
          const s0 = r() < 0.5 ? 9.5 : e.len - 11.5;
          const n = 1 + Math.floor(r() * 3);
          for (let k = 0; k < n; k++) {
            const p = tryAt(e, s0 + k * 0.62, 1.05, 0.28);
            if (!p) continue;
            news.add(p.x, 0.18, p.z, yaw, 1, 1, 1, newsCols[Math.floor(r() * newsCols.length)]);
            this.place.solid(p.x, p.z, 0.26, 1.1);
          }
        }
        // utility box
        if (r() < 0.35) {
          const p = tryAt(e, 12 + r() * (e.len - 24), 1.0, 0.55);
          if (p) {
            boxes.add(p.x, 0.18, p.z, yaw);
            this.kerbBox(e, p, 0.48, 0.3, 1.4);
          }
        }
        // benches facing the sidewalk
        if (e.block.district !== 'industrial' && e.block.district !== 'harbor' && r() < 0.45) {
          const p = tryAt(e, 14 + r() * (e.len - 28), 1.12, 0.95);
          if (p) {
            benches.add(p.x, 0.18, p.z, yaw);
            this.kerbBox(e, p, 0.88, 0.32, 0.95);
          }
        }
      }
    }
    const g = this.root;
    bins.flush(g, binGeo(), this.furniture, false);
    bollards.flush(g, bollardGeo(), this.furniture, false);
    boxes.flush(g, utilityBoxGeo(), this.furniture, false);
    drains.flush(g, drainGeo(), this.furniture, false);
    news.flush(g, newsBoxGeo(), this.furniture, false);
    benches.flush(g, benchGeo(), this.furniture, false);
  }

  /** Collider aligned with the kerb: `along` half-length on the kerb, `across` half-depth. */
  private kerbBox(e: KerbEdge, p: { x: number; z: number }, along: number, across: number, h: number): void {
    const hx = e.dx !== 0 ? along : across, hz = e.dx !== 0 ? across : along;
    this.city.collision.add({ x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz, y0: 0, y1: h });
  }

  // ---------- verges, hedges, flowers, trees ----------

  private greenery(): void {
    const r = this.rnd;
    const hedges = new Batch(), flowers = new Batch(), trunks = new Batch(), canopies = new Batch();
    const verge: number[] = [], vergeUv: number[] = [];
    const leafy = (e: KerbEdge) => e.block.district === 'oldtown' || e.block.district === 'university' || e.block.district === 'beach';

    const addTree = (x: number, z: number, scale: number): boolean => {
      if (!this.place.free(x, z, 2.6 * scale)) return false;
      const yaw = r() * 6.28, sy = scale * (0.85 + r() * 0.3);
      trunks.add(x, 0, z, yaw, scale, sy, scale);
      canopies.add(x, 0, z, yaw, scale * (0.9 + r() * 0.2), sy, scale * (0.9 + r() * 0.2));
      this.place.solid(x, z, 0.28, 4);
      return true;
    };

    for (const e of this.edges) {
      // grass verge strips between kerb and footpath on leafy streets, broken by driveways
      if (this.full && leafy(e) && e.road !== ROADS_X[5]) {
        let s = 5.5;
        while (s < e.len - 8) {
          const l = Math.min(6 + r() * 14, e.len - 5.5 - s);
          const a = kerbPoint(e, s, 0.35), b = kerbPoint(e, s + l, 1.55);
          const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
          verge.push(x0, 0.186, z0, x0, 0.186, z1, x1, 0.186, z1, x0, 0.186, z0, x1, 0.186, z1, x1, 0.186, z0);
          for (const [u, v] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) vergeUv.push(u / 4, v / 4);
          s += l + 2.5 + r() * 3;
        }
      }
      // street trees in the verge line on leafy streets (not Ocean Drive, palms own it)
      if (leafy(e) && e.road !== ROADS_X[5]) {
        for (let s = 12 + r() * 8; s < e.len - 10; s += 22 + r() * 14) {
          if (r() < 0.35) continue;
          const p = kerbPoint(e, s, 1.0);
          addTree(p.x, p.z, 0.75 + r() * 0.3);
        }
      }
      // hedge rows and flower beds along open lot edges (only where no building sits right behind,
      // so building doors stay reachable)
      if (e.block.district === 'downtown' || e.block.district === 'market') continue;
      for (let s = 7 + r() * 6; s < e.len - 9; s += 9 + r() * 12) {
        const len = 5 + r() * 8;
        if (s + len > e.len - 6) break;
        const a = kerbPoint(e, s, 4.7), b = kerbPoint(e, s + len, 5.5);
        const back = kerbPoint(e, s + len, 10);
        const fx0 = Math.min(a.x, b.x), fx1 = Math.max(a.x, b.x), fz0 = Math.min(a.z, b.z), fz1 = Math.max(a.z, b.z);
        const bx0 = Math.min(a.x, back.x), bx1 = Math.max(a.x, back.x), bz0 = Math.min(a.z, back.z), bz1 = Math.max(a.z, back.z);
        if (!this.place.freeRect(bx0, bz0, bx1, bz1)) continue;
        const c = kerbPoint(e, s + len / 2, 5.1);
        if (r() < 0.6) {
          // hedge: unit geometry, x along the kerb
          hedges.add(c.x, 0.18, c.z, kerbYaw(e), len, 0.85 + r() * 0.35, 0.85);
          this.city.collision.add({ x0: fx0, x1: fx1, z0: fz0, z1: fz1, y0: 0, y1: 1.1 });
          // a few bougainvillea spilling over one end
          if (r() < 0.6) {
            const end = r() < 0.5 ? s - 0.4 : s + len + 0.4;
            for (let k = 0; k < 3; k++) {
              const p = kerbPoint(e, end + (r() - 0.5) * 1.6, 4.8 + r() * 0.8);
              const sc = 0.55 + r() * 0.4;
              flowers.add(p.x, 0.18, p.z, r() * 6.28, sc, sc * (0.9 + r() * 0.5), sc);
            }
          }
        } else {
          // flower bed: a cluster of bougainvillea
          const n = 3 + Math.floor(r() * 4);
          for (let k = 0; k < n; k++) {
            const p = kerbPoint(e, s + (k / n) * len, 4.8 + r() * 0.9);
            const sc = 0.6 + r() * 0.45;
            flowers.add(p.x, 0.18, p.z, r() * 6.28, sc, sc * (0.9 + r() * 0.4), sc);
          }
        }
      }
    }
    // broadleaf trees in parks and campus lawns
    for (const l of this.city.lawns) {
      const area = (l.x1 - l.x0) * (l.z1 - l.z0);
      const tries = Math.round(area / (this.full ? 140 : 260));
      for (let k = 0; k < tries; k++) {
        const x = l.x0 + 2.5 + r() * (l.x1 - l.x0 - 5), z = l.z0 + 2.5 + r() * (l.z1 - l.z0 - 5);
        addTree(x, z, 0.85 + r() * 0.5);
      }
    }
    const g = this.root;
    hedges.flush(g, hedgeGeo(mulberry32(31)), this.leaves, false);
    flowers.flush(g, bougainvilleaGeo(mulberry32(32)), this.leaves, false);
    trunks.flush(g, treeTrunkGeo(), this.furniture, false);
    canopies.flush(g, treeCanopyGeo(mulberry32(33)), this.leaves, true);
    if (verge.length) {
      const vg = new THREE.BufferGeometry();
      vg.setAttribute('position', new THREE.Float32BufferAttribute(verge, 3));
      vg.setAttribute('uv', new THREE.Float32BufferAttribute(vergeUv, 2));
      vg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array<number>(verge.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      const mat = pbr('grass', 1, 1, '#b8c98e') ?? new THREE.MeshStandardMaterial({ map: grass(), roughness: 0.95, color: '#a9c487' });
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits = -1;
      const m = new THREE.Mesh(vg, mat);
      m.receiveShadow = true;
      m.layers.set(DETAIL_LAYER);
      g.add(m);
    }
  }

  // ---------- rooftops ----------

  private rooftops(): void {
    const r = this.rnd;
    const vents = new Batch(), towers = new Batch();
    const covered = (x: number, z: number, y: number) =>
      this.city.collision.near(x, z, 1).some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y0 <= y + 0.2 && b.y1 > y + 0.6);
    for (const roof of this.city.roofs) {
      const w = roof.x1 - roof.x0, d = roof.z1 - roof.z0;
      if (w < 6 || d < 6) continue;
      const pick = (inset: number) => ({ x: roof.x0 + inset + r() * (w - inset * 2), z: roof.z0 + inset + r() * (d - inset * 2) });
      const n = 1 + Math.floor(r() * (w * d > 400 ? 3 : 2));
      for (let k = 0; k < n; k++) {
        const p = pick(1.6);
        if (!covered(p.x, p.z, roof.y)) vents.add(p.x, roof.y, p.z, r() * 6.28);
      }
      if (roof.kind !== 'glass' && w * d > 160 && r() < 0.35) {
        const p = pick(2.4);
        if (!covered(p.x, p.z, roof.y)) towers.add(p.x, roof.y, p.z, r() * 6.28, 0.8 + r() * 0.35);
      }
    }
    vents.flush(this.root, ventGeo(), this.furniture, false);
    towers.flush(this.root, waterTowerGeo(), this.furniture, false);
  }
}

/** Exposed for tests: is a point inside some block's sidewalk/lot area (never on the roadway)? */
export function inBlock(blocks: readonly Block[], x: number, z: number): boolean {
  return blocks.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) && x < BEACH_X + 70;
}
