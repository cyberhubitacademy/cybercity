import {
  BEACH_X, DISTRICTS, DistrictId, HARBOR_Z, PLACES, ROADS_X, ROADS_Z, SHORE_X, buildBlocks,
} from '../world/layout';
import type { Blip, BlipKind, MinimapState } from './types';

// Map rendering shared by the GTA V-style HUD radar and the full-screen map.
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

/** Static map image (built lazily, cached). GTA V radar palette: dark land, grey roads, slate water. */
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
  wg.addColorStop(0, '#36607f');
  wg.addColorStop(1, '#2a4c68');
  g.fillStyle = wg;
  g.fillRect(0, 0, MAP_W, MAP_H);
  // beach
  g.fillStyle = '#a8946c';
  g.fillRect(X(BEACH_X - 3), 0, X(SHORE_X) - X(BEACH_X - 3), Z(HARBOR_Z + 8));
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(X(SHORE_X) - 2, 0, 2, Z(HARBOR_Z + 8));
  // land
  g.fillStyle = '#2b2f34';
  g.fillRect(0, 0, X(BEACH_X - 3), Z(HARBOR_Z));
  // district blocks: neutral grey with a faint district tint, campus as park green
  for (const b of buildBlocks()) {
    const park = b.district === 'university';
    g.fillStyle = park ? '#45603a' : '#3d4147';
    g.fillRect(X(b.x0), Z(b.z0), b.x1 - b.x0, b.z1 - b.z0);
    g.globalAlpha = park ? 0.25 : 0.2;
    g.fillStyle = park ? '#78aa5a' : shade(DISTRICTS[b.district].color, 0.55);
    g.fillRect(X(b.x0) + 2, Z(b.z0) + 2, b.x1 - b.x0 - 4, b.z1 - b.z0 - 4);
    g.globalAlpha = 1;
  }
  // roads: light grey bands like the GTA radar
  g.strokeStyle = '#8c9197';
  g.lineCap = 'square';
  g.lineWidth = 9;
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
  // pier
  g.fillStyle = '#7d6a52';
  g.fillRect(X(SHORE_X - 12), Z(-126), 302 - (SHORE_X - 12), 12);
  g.fillRect(X(272), Z(-150), 34, 50);
  // edge of the playable area
  g.fillStyle = 'rgba(28,42,30,0.9)';
  g.fillRect(0, 0, X(-262), Z(HARBOR_Z));
  g.fillRect(0, 0, X(BEACH_X - 3), Z(-262));
  baseCanvas = c;
  return c;
}

// GTA convention: yellow = destination, blue = ally / friendly, red = enemy / target.
const BLIP_COLORS: Record<BlipKind, string> = {
  mission: '#f0c850',
  giver: '#5aa9e6',
  terminal: '#5ad1e6',
  shop: '#7ccf6e',
  shard: '#ff7cc6',
  vehicle: '#e8e8e8',
  target: '#e0453a',
  objective: '#f0c850',
  place: '#f0f0f0',
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

/** GTA V-style rectangular radar. Rotates with the camera; the player sits in the lower middle. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  readonly w = 270;
  readonly h = 172;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  /** Meters shown from the player to the top edge. */
  radiusMeters = 110;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cc-minimap-canvas';
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    this.g = g;
  }

  draw(m: MinimapState, speedKmh = 0): void {
    const g = this.g;
    const W = this.w, H = this.h;
    const cx = W / 2, cy = H * 0.62;
    // zoom out a little when driving fast (GTA does the same)
    const radius = this.radiusMeters * (1 + Math.min(0.9, speedKmh / 150));
    const scale = cy / radius;
    const theta = m.camYaw - Math.PI;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const toScreen = (wx: number, wz: number): [number, number] => {
      const dx = (wx - m.x) * scale, dz = (wz - m.z) * scale;
      return [dx * cos - dz * sin, dx * sin + dz * cos];
    };
    const t = performance.now() / 1000;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.roundRect(0, 0, W, H, 6);
    g.clip();
    g.fillStyle = '#2a4c68';
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(cx, cy);
    g.rotate(theta);
    g.scale(scale, scale);
    g.drawImage(mapBase(), -(m.x - MAP_X0), -(m.z - MAP_Z0));
    g.restore();

    g.translate(cx, cy);
    // GPS route: road-following polyline when provided, straight dashed line otherwise
    const routeColor = m.routeColor ?? (m.waypoint ? '#b05cff' : '#f0c850');
    if (m.route && m.route.length > 1) {
      g.save();
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(0, 0);
      for (const p of m.route) {
        const [px, py] = toScreen(p.x, p.z);
        g.lineTo(px, py);
      }
      g.stroke();
      g.strokeStyle = routeColor;
      g.lineWidth = 4.5;
      g.stroke();
      g.restore();
    } else if (m.waypoint) {
      const [wx, wy] = toScreen(m.waypoint.x, m.waypoint.z);
      g.save();
      g.strokeStyle = routeColor;
      g.lineWidth = 3;
      g.setLineDash([6, 5]);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(wx, wy);
      g.stroke();
      g.restore();
    }
    const all: Blip[] = [...m.blips];
    if (m.waypoint) all.push({ x: m.waypoint.x, z: m.waypoint.z, kind: 'objective', color: '#b05cff', label: 'W' });
    const minX = -cx + 9, maxX = W - cx - 9, minY = -cy + 9, maxY = H - cy - 9;
    const clampK = (dx: number, dy: number) =>
      Math.min(Math.abs((dx > 0 ? maxX : minX) / (dx || 1e-6)), Math.abs((dy > 0 ? maxY : minY) / (dy || 1e-6)));
    for (const b of all) {
      let [bx, by] = toScreen(b.x, b.z);
      const inside = bx > minX && bx < maxX && by > minY && by < maxY;
      if (!inside) {
        if (!EDGE_KINDS.has(b.kind)) continue;
        const k = clampK(bx, by);
        bx *= k;
        by *= k;
        const a = Math.atan2(by, bx);
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
      drawBlipIcon(g, b, bx, by, b.kind === 'vehicle' ? 4 : b.kind === 'place' ? 4.5 : 6.5, t);
    }
    // player arrow
    const hx = Math.sin(m.heading), hz = Math.cos(m.heading);
    const ax = hx * cos - hz * sin, ay = hx * sin + hz * cos;
    g.save();
    g.rotate(Math.atan2(ay, ax));
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(10, 0);
    g.lineTo(-7, -6.5);
    g.lineTo(-3.5, 0);
    g.lineTo(-7, 6.5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // north marker clamped to the frame
    {
      const sx = sin, sy = -cos;
      const k = clampK(sx, sy);
      const nx = sx * k, ny = sy * k;
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.beginPath();
      g.arc(nx, ny, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '700 11px Oswald, Rajdhani, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('N', nx, ny + 0.5);
    }
    g.restore();
    // frame
    g.save();
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(1.5, 1.5, W - 3, H - 3, 6);
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
