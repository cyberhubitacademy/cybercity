// World-building helpers shared by the life systems: neon signs, floating
// venue icons, facade snapping and free-space checks against the city colliders.
import * as THREE from 'three';
import type { CollisionWorld } from '../../world/Collision';

const tex = new Map<string, THREE.CanvasTexture>();

export function textTexture(text: string, color: string, opts: { font?: string; w?: number; h?: number; bg?: string } = {}): THREE.CanvasTexture {
  const key = `${text}|${color}|${opts.font ?? ''}|${opts.bg ?? ''}`;
  const hit = tex.get(key);
  if (hit) return hit;
  const w = opts.w ?? 512, h = opts.h ?? 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, w, h); }
  g.font = opts.font ?? `400 ${Math.round(h * 0.62)}px Pacifico, 'Brush Script MT', cursive`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = h * 0.18;
  g.fillStyle = '#ffffff';
  g.fillText(text, w / 2, h / 2, w * 0.94);
  g.shadowBlur = h * 0.08;
  g.fillStyle = color;
  g.globalAlpha = 0.55;
  g.fillText(text, w / 2, h / 2, w * 0.94);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  tex.set(key, t);
  return t;
}

/** Glowing neon sign plane (faces +z of its local frame). */
export function neonSign(text: string, color: string, width = 6, height = 1.5): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: textTexture(text, color), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
  mat.color.setScalar(1.6);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  m.renderOrder = 3;
  return m;
}

/** Floating venue icon sprite (emoji on a colored disc). */
export function iconSprite(emoji: string, color: string, size = 1.4): THREE.Sprite {
  const key = `icon|${emoji}|${color}`;
  let t = tex.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
    g.lineWidth = 7; g.strokeStyle = color; g.stroke();
    g.font = '64px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, 64, 70);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    tex.set(key, t);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true, toneMapped: false }));
  s.scale.setScalar(size);
  return s;
}

/** True if no collider taller than 0.3 m overlaps the rectangle. */
export function isClear(col: CollisionWorld, x0: number, z0: number, x1: number, z1: number): boolean {
  for (const b of col.near((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0))) {
    if (b.y1 < 0.3) continue;
    if (b.x0 < x1 && b.x1 > x0 && b.z0 < z1 && b.z1 > z0) return false;
  }
  return true;
}

/** Spiral search for a clear w×d footprint near (x, z). */
export function findClear(col: CollisionWorld, x: number, z: number, w: number, d: number, maxR = 24): { x: number; z: number } {
  if (isClear(col, x - w / 2, z - d / 2, x + w / 2, z + d / 2)) return { x, z };
  for (let r = 2; r <= maxR; r += 2) {
    for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
      if (isClear(col, px - w / 2, pz - d / 2, px + w / 2, pz + d / 2)) return { x: px, z: pz };
    }
  }
  return { x, z };
}

/**
 * Nearest building facade from (x, z): casts rays in 4 directions at chest height.
 * Returns the wall point, its outward normal yaw, and a door spot 1.6 m in front.
 */
export function facadeNear(col: CollisionWorld, x: number, z: number, maxD = 16): { wx: number; wz: number; nx: number; nz: number; doorX: number; doorZ: number; yaw: number } | null {
  // only real buildings (tall, wide) count — not palms, lamps or benches
  const big = col.near(x, z, maxD + 2).filter((b) => b.y1 > 3.5 && b.y0 < 1 && b.x1 - b.x0 > 3 && b.z1 - b.z0 > 3);
  let best: { t: number; dx: number; dz: number } | null = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    for (const b of big) {
      let t = Infinity;
      if (dx !== 0) {
        if (z < b.z0 || z > b.z1) continue;
        const face = dx > 0 ? b.x0 : b.x1;
        t = (face - x) * dx;
      } else {
        if (x < b.x0 || x > b.x1) continue;
        const face = dz > 0 ? b.z0 : b.z1;
        t = (face - z) * dz;
      }
      if (t >= -0.01 && t < maxD && (!best || t < best.t)) best = { t, dx, dz };
    }
  }
  if (!best) return null;
  const wx = x + best.dx * best.t, wz = z + best.dz * best.t;
  const nx = -best.dx, nz = -best.dz;
  return { wx, wz, nx, nz, doorX: wx + nx * 1.6, doorZ: wz + nz * 1.6, yaw: Math.atan2(nx, nz) };
}

/** Distance-culled show/hide for groups of decorative objects. */
export class Culler {
  private items: { obj: THREE.Object3D; x: number; z: number; r: number }[] = [];
  add(obj: THREE.Object3D, x: number, z: number, r = 140): void {
    this.items.push({ obj, x, z, r });
  }
  update(px: number, pz: number): void {
    for (const it of this.items) {
      const d2 = (it.x - px) ** 2 + (it.z - pz) ** 2;
      it.obj.visible = d2 < it.r * it.r;
    }
  }
}

export const mat = (color: string, rough = 0.7, metal = 0, emissive?: string, ei = 1): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? ei : 0 });

export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}
