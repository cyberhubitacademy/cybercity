import {
  BEACH_X, DISTRICTS, DistrictId, HARBOR_Z, PLACES, ROADS_X, ROADS_Z, SHORE_X, buildBlocks,
} from '../world/layout';
import type { Blip, BlipKind, MinimapState } from './types';

// Map rendering shared by the circular HUD minimap and the full-screen map.
// The static base (water, beach, blocks, roads) is painted once at 1 px = 1 m.

export const MAP_X0 = -285;
export const MAP_Z0 = -285;
export const MAP_W = 615; // to x = 330
export const MAP_H = 545; // to z = 260

let baseCanvas: HTMLCanvasElement | null = null;

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

/** Static map image (built lazily, cached). */
export function mapBase(): HTMLCanvasElement {
  if (baseCanvas) return baseCanvas;
  const c = document.createElement('canvas');
  c.width = MAP_W;
  c.height = MAP_H;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const X = (x: number) => x - MAP_X0;
  const Z = (z: number) => z - MAP_Z0;

  // water
  const wg = g.createLinearGradient(0, 0, MAP_W, MAP_H);
  wg.addColorStop(0, '#0f5d86');
  wg.addColorStop(1, '#0a3f66');
  g.fillStyle = wg;
  g.fillRect(0, 0, MAP_W, MAP_H);
  // subtle wave lines
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < MAP_H; y += 9) {
    g.beginPath();
    for (let x = 0; x <= MAP_W; x += 12) g.lineTo(x, y + Math.sin(x * 0.08 + y) * 2);
    g.stroke();
  }
  // beach
  g.fillStyle = '#e9cc8f';
  g.fillRect(X(BEACH_X - 3), 0, X(SHORE_X) - X(BEACH_X - 3), Z(HARBOR_Z + 8));
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(X(SHORE_X) - 2, 0, 3, Z(HARBOR_Z + 8));
  // land (asphalt / road surface)
  g.fillStyle = '#3b3654';
  g.fillRect(0, 0, X(BEACH_X - 3), Z(HARBOR_Z));
  // district blocks
  for (const b of buildBlocks()) {
    const col = DISTRICTS[b.district].color;
    g.fillStyle = shade(col, 0.62);
    g.fillRect(X(b.x0), Z(b.z0), b.x1 - b.x0, b.z1 - b.z0);
    g.fillStyle = shade(col, 0.8);
    g.fillRect(X(b.x0) + 3, Z(b.z0) + 3, b.x1 - b.x0 - 6, b.z1 - b.z0 - 6);
  }
  // road center lines
  g.strokeStyle = 'rgba(255,210,63,0.45)';
  g.lineWidth = 1;
  g.setLineDash([4, 4]);
  for (const x of ROADS_X) {
    g.beginPath();
    g.moveTo(X(x), Z(ROADS_Z[0]));
    g.lineTo(X(x), Z(ROADS_Z[ROADS_Z.length - 1]));
    g.stroke();
  }
  for (const z of ROADS_Z) {
    g.beginPath();
    g.moveTo(X(ROADS_X[0]), Z(z));
    g.lineTo(X(ROADS_X[ROADS_X.length - 1]), Z(z));
    g.stroke();
  }
  g.setLineDash([]);
  // pier
  g.fillStyle = '#b98b5e';
  g.fillRect(X(SHORE_X - 12), Z(-126), 302 - (SHORE_X - 12), 12);
  g.fillRect(X(272), Z(-150), 34, 50);
  // edge vignette for the void beyond the hedge
  g.fillStyle = 'rgba(20,60,40,0.85)';
  g.fillRect(0, 0, X(-262), Z(HARBOR_Z));
  g.fillRect(0, 0, X(BEACH_X - 3), Z(-262));
  baseCanvas = c;
  return c;
}

const BLIP_COLORS: Record<BlipKind, string> = {
  mission: '#ff2fa0',
  giver: '#ff2fa0',
  terminal: '#19e6ff',
  shop: '#ffd23f',
  shard: '#ff7cc6',
  vehicle: '#ffffff',
  target: '#ff4d6d',
  objective: '#ffd23f',
  place: '#f6f2ff',
};

/** Kinds that stay visible clamped to the minimap edge when out of range. */
const EDGE_KINDS = new Set<BlipKind>(['objective', 'target', 'mission']);

export function drawBlipIcon(g: CanvasRenderingContext2D, b: Blip, x: number, y: number, size: number, t: number): void {
  const col = b.color ?? BLIP_COLORS[b.kind];
  g.save();
  g.translate(x, y);
  g.lineWidth = Math.max(1.5, size * 0.18);
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.fillStyle = col;
  switch (b.kind) {
    case 'giver':
    case 'mission': {
      g.beginPath();
      g.arc(0, 0, size, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#fff';
      g.font = `900 ${Math.round(size * 1.2)}px Bungee, Impact, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText((b.label ?? '!').charAt(0).toUpperCase(), 0, size * 0.08);
      break;
    }
    case 'terminal': {
      g.fillRect(-size * 0.8, -size * 0.65, size * 1.6, size * 1.2);
      g.strokeRect(-size * 0.8, -size * 0.65, size * 1.6, size * 1.2);
      g.fillStyle = '#0b0a24';
      g.fillRect(-size * 0.5, -size * 0.38, size, size * 0.62);
      break;
    }
    case 'shop': {
      g.beginPath();
      g.arc(0, 0, size, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#0b0a24';
      g.font = `900 ${Math.round(size * 1.3)}px Bungee, Impact, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', 0, size * 0.08);
      break;
    }
    case 'shard': {
      g.beginPath();
      g.moveTo(0, -size);
      g.lineTo(size * 0.7, 0);
      g.lineTo(0, size);
      g.lineTo(-size * 0.7, 0);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case 'vehicle': {
      g.fillRect(-size * 0.5, -size * 0.8, size, size * 1.6);
      g.strokeRect(-size * 0.5, -size * 0.8, size, size * 1.6);
      break;
    }
    case 'target': {
      const pulse = 1 + Math.sin(t * 8) * 0.18;
      g.beginPath();
      g.arc(0, 0, size * pulse, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = '#fff';
      g.beginPath();
      g.arc(0, 0, size * 0.45, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 'objective': {
      const pulse = 1 + Math.sin(t * 5) * 0.12;
      g.beginPath();
      g.arc(0, 0, size * pulse, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
    case 'place':
    default: {
      g.beginPath();
      g.arc(0, 0, size * 0.55, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
  g.restore();
}

/** Circular HUD minimap. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private size = 210;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  /** Meters shown from the center to the rim. */
  radiusMeters = 95;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cc-minimap-canvas';
    this.canvas.width = this.size * this.dpr;
    this.canvas.height = this.size * this.dpr;
    this.canvas.style.width = `${this.size}px`;
    this.canvas.style.height = `${this.size}px`;
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    this.g = g;
  }

  draw(m: MinimapState, speedKmh = 0): void {
    const g = this.g;
    const S = this.size;
    const R = S / 2 - 6;
    // zoom out a little when driving fast
    const radius = this.radiusMeters * (1 + Math.min(0.8, speedKmh / 160));
    const scale = R / radius;
    const theta = m.camYaw - Math.PI;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const toScreen = (wx: number, wz: number): [number, number] => {
      const dx = (wx - m.x) * scale, dz = (wz - m.z) * scale;
      return [dx * cos - dz * sin, dx * sin + dz * cos];
    };
    const t = performance.now() / 1000;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0a3f66';
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.rotate(theta);
    g.scale(scale, scale);
    g.drawImage(mapBase(), -(m.x - MAP_X0), -(m.z - MAP_Z0));
    g.restore();

    g.save();
    g.translate(S / 2, S / 2);
    // waypoint route line
    if (m.waypoint) {
      const [wx, wy] = toScreen(m.waypoint.x, m.waypoint.z);
      g.save();
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.clip();
      g.strokeStyle = 'rgba(181,77,255,0.9)';
      g.lineWidth = 3;
      g.setLineDash([6, 5]);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(wx, wy);
      g.stroke();
      g.restore();
    }
    const all: Blip[] = [...m.blips];
    if (m.waypoint) all.push({ x: m.waypoint.x, z: m.waypoint.z, kind: 'objective', color: '#b14dff', label: 'W' });
    for (const b of all) {
      let [bx, by] = toScreen(b.x, b.z);
      const d = Math.hypot(bx, by);
      const rimLimit = R - 9;
      if (d > rimLimit) {
        if (!EDGE_KINDS.has(b.kind)) continue;
        const a = Math.atan2(by, bx);
        bx = Math.cos(a) * rimLimit;
        by = Math.sin(a) * rimLimit;
        // edge arrow
        g.save();
        g.translate(bx, by);
        g.rotate(a);
        g.fillStyle = b.color ?? BLIP_COLORS[b.kind];
        g.strokeStyle = '#000';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(8, 0);
        g.lineTo(-5, -6);
        g.lineTo(-5, 6);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
        continue;
      }
      drawBlipIcon(g, b, bx, by, b.kind === 'vehicle' ? 4 : b.kind === 'place' ? 5 : 7, t);
    }
    // player arrow (heading relative to map rotation)
    const hx = Math.sin(m.heading), hz = Math.cos(m.heading);
    const ax = hx * cos - hz * sin, ay = hx * sin + hz * cos;
    const pa = Math.atan2(ay, ax);
    g.save();
    g.rotate(pa);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#0b0a24';
    g.lineWidth = 2;
    g.shadowColor = 'rgba(25,230,255,0.9)';
    g.shadowBlur = 8;
    g.beginPath();
    g.moveTo(11, 0);
    g.lineTo(-7, -7);
    g.lineTo(-3, 0);
    g.lineTo(-7, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // north marker on the rim
    const [nx, ny] = (() => {
      const dx = 0, dz = -1;
      const sx = dx * cos - dz * sin, sy = dx * sin + dz * cos;
      return [sx * (R - 1), sy * (R - 1)];
    })();
    g.fillStyle = '#0b0a24';
    g.strokeStyle = '#ff2fa0';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(nx, ny, 9, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = '900 11px Bungee, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', nx, ny + 1);
    g.restore();

    // rim
    g.save();
    g.lineWidth = 5;
    const rim = g.createLinearGradient(0, 0, S, S);
    rim.addColorStop(0, '#ff2fa0');
    rim.addColorStop(0.5, '#7b2cff');
    rim.addColorStop(1, '#19e6ff');
    g.strokeStyle = rim;
    g.beginPath();
    g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
}

/** Centroid of each district's blocks, for map labels. */
export function districtLabels(): { id: DistrictId; name: string; x: number; z: number }[] {
  const acc = new Map<DistrictId, { x: number; z: number; n: number }>();
  for (const b of buildBlocks()) {
    const a = acc.get(b.district) ?? { x: 0, z: 0, n: 0 };
    a.x += b.cx;
    a.z += b.cz;
    a.n++;
    acc.set(b.district, a);
  }
  return [...acc.entries()].map(([id, a]) => ({ id, name: DISTRICTS[id].name, x: a.x / a.n, z: a.z / a.n }));
}

export function placeList(): { name: string; x: number; z: number }[] {
  return Object.values(PLACES).filter((p) => p.id !== 'spawn').map((p) => ({ name: p.name, x: p.x, z: p.z }));
}

export { BLIP_COLORS };
