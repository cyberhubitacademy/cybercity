import * as THREE from 'three';
import type { WeaponId } from './weapons';

// Procedural low-poly weapon models (no downloads needed). Every model points
// down +z with the grip at the origin. Geometry and materials are shared, so
// each instance is just a handful of Mesh objects.

const metal = new THREE.MeshStandardMaterial({ color: '#2a2d34', metalness: 0.7, roughness: 0.38 });
const dark = new THREE.MeshStandardMaterial({ color: '#15161a', metalness: 0.4, roughness: 0.6 });
const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.7 });
const steel = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.9, roughness: 0.22 });
const yellow = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.5, emissive: '#3a2a00' });
const neon = new THREE.MeshStandardMaterial({ color: '#19e6ff', emissive: '#19e6ff', emissiveIntensity: 0.8 });
const tintPink = new THREE.MeshStandardMaterial({ color: '#ff2fa0', metalness: 0.5, roughness: 0.35, emissive: '#3a0020' });
const glass = new THREE.MeshStandardMaterial({ color: '#10202a', metalness: 0.9, roughness: 0.1, emissive: '#0a3a4a' });

type Part = [geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx?: number];
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, l: number) => new THREE.CylinderGeometry(r0, r1, l, 10).rotateX(Math.PI / 2);

const PARTS = new Map<WeaponId, Part[]>();
function parts(id: WeaponId): Part[] {
  const hit = PARTS.get(id);
  if (hit) return hit;
  let p: Part[] = [];
  switch (id) {
    case 'pistol':
      p = [[box(0.035, 0.05, 0.2), metal, 0, 0.045, 0.06], [box(0.03, 0.1, 0.045), dark, 0, -0.01, -0.01, -0.25], [cyl(0.009, 0.009, 0.03), dark, 0, 0.05, 0.17]];
      break;
    case 'taser':
      p = [[box(0.04, 0.055, 0.16), yellow, 0, 0.045, 0.05], [box(0.032, 0.1, 0.045), dark, 0, -0.01, -0.01, -0.25], [box(0.03, 0.03, 0.02), neon, 0, 0.05, 0.14]];
      break;
    case 'smg':
      p = [[box(0.045, 0.08, 0.32), metal, 0, 0.05, 0.08], [box(0.03, 0.09, 0.04), dark, 0, -0.01, 0], [box(0.025, 0.14, 0.035), dark, 0, -0.03, 0.12], [cyl(0.012, 0.012, 0.12), dark, 0, 0.06, 0.29]];
      break;
    case 'shotgun':
      p = [[box(0.05, 0.07, 0.35), metal, 0, 0.05, 0.12], [cyl(0.018, 0.018, 0.5), steel, 0, 0.07, 0.5], [cyl(0.022, 0.022, 0.18), wood, 0, 0.03, 0.4], [box(0.045, 0.09, 0.28), wood, 0, 0.0, -0.18, 0.15]];
      break;
    case 'rifle':
      p = [[box(0.05, 0.09, 0.42), metal, 0, 0.06, 0.12], [cyl(0.013, 0.013, 0.36), dark, 0, 0.075, 0.5], [box(0.03, 0.15, 0.06), dark, 0, -0.04, 0.14, 0.25], [box(0.035, 0.08, 0.04), dark, 0, -0.01, 0], [box(0.045, 0.08, 0.24), dark, 0, 0.04, -0.17], [box(0.02, 0.03, 0.12), neon, 0, 0.12, 0.1]];
      break;
    case 'sniper':
      p = [[box(0.05, 0.08, 0.5), metal, 0, 0.06, 0.15], [cyl(0.014, 0.012, 0.6), dark, 0, 0.07, 0.68], [cyl(0.03, 0.03, 0.28), glass, 0, 0.14, 0.14], [box(0.035, 0.08, 0.04), dark, 0, -0.01, 0], [box(0.05, 0.1, 0.32), wood, 0, 0.03, -0.24]];
      break;
    case 'bat':
      p = [[cyl(0.018, 0.04, 0.82), wood, 0, 0, 0.36]];
      break;
    case 'knife':
      p = [[box(0.025, 0.03, 0.1), dark, 0, 0, 0.02], [box(0.006, 0.035, 0.16), steel, 0, 0.005, 0.15]];
      break;
    default:
      p = [];
  }
  PARTS.set(id, p);
  return p;
}

/** Build a weapon model. `tint` applies the Neon Tint upgrade. */
export function buildWeapon(id: WeaponId, tint = false, suppressor = false, scope = false): THREE.Group {
  const g = new THREE.Group();
  g.name = `weapon-${id}`;
  for (const [geo, mat, x, y, z, rx] of parts(id)) {
    const m = new THREE.Mesh(geo, tint && mat === metal ? tintPink : mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    m.castShadow = true;
    g.add(m);
  }
  if (suppressor && id !== 'shotgun' && id !== 'taser') {
    const len = id === 'pistol' ? 0.2 : id === 'sniper' ? 1.0 : id === 'rifle' ? 0.72 : 0.36;
    const s = new THREE.Mesh(SUPP, dark);
    s.position.set(0, id === 'pistol' ? 0.05 : 0.07, len + 0.06);
    g.add(s);
  }
  if (scope && (id === 'rifle' || id === 'smg' || id === 'pistol')) {
    const s = new THREE.Mesh(SCOPE, glass);
    s.position.set(0, id === 'pistol' ? 0.09 : 0.12, 0.1);
    g.add(s);
  }
  return g;
}

const SUPP = cyl(0.02, 0.02, 0.14);
const SCOPE = cyl(0.02, 0.02, 0.14);

/** Muzzle offset (local +z) for tracer starts. */
export function muzzleOffset(id: WeaponId): number {
  return ({ pistol: 0.2, taser: 0.16, smg: 0.36, shotgun: 0.76, rifle: 0.7, sniper: 0.98 } as Partial<Record<WeaponId, number>>)[id] ?? 0.1;
}

/** Simple ammo box / armor vest / cash models for pickups. */
export function buildItem(kind: 'ammo' | 'armor' | 'cash' | 'health'): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); };
  if (kind === 'ammo') { add(box(0.32, 0.18, 0.2), new THREE.MeshStandardMaterial({ color: '#4b5d2a', roughness: 0.6 })); add(box(0.33, 0.04, 0.21), yellow, 0.06); }
  else if (kind === 'armor') { add(box(0.4, 0.5, 0.12), new THREE.MeshStandardMaterial({ color: '#2b3a55', roughness: 0.7 })); add(box(0.3, 0.08, 0.13), neon, 0.12); }
  else if (kind === 'health') { add(box(0.34, 0.24, 0.16), new THREE.MeshStandardMaterial({ color: '#f4f4f4' })); add(box(0.08, 0.2, 0.17), new THREE.MeshStandardMaterial({ color: '#e0453a' })); add(box(0.2, 0.06, 0.17), new THREE.MeshStandardMaterial({ color: '#e0453a' })); }
  else { add(box(0.3, 0.1, 0.16), new THREE.MeshStandardMaterial({ color: '#72cc72', roughness: 0.8 })); add(box(0.31, 0.03, 0.05), new THREE.MeshStandardMaterial({ color: '#ffffff' }), 0.02); }
  return g;
}
