import * as THREE from 'three';
import { buildItem, buildWeapon } from './models';
import { isWeaponId, WEAPONS, type WeaponId } from './weapons';

// Glowing ground pickups: weapons (dropped by enemies or placed by scripts),
// ammo boxes, armor vests, health packs and cash. Walk over to collect.

export type PickupKind = { type: 'weapon'; weapon: WeaponId; ammo: number } | { type: 'ammo'; amount: number } | { type: 'armor' } | { type: 'health' } | { type: 'cash'; amount: number };

export interface Pickup {
  id: number;
  kind: PickupKind;
  root: THREE.Group;
  model: THREE.Group;
  life: number;
  t: number;
  persistent: boolean;
}

const beamGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.4, 12, 1, true).translate(0, 1.2, 0);
const ringGeo = new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2);
const beamMats = new Map<string, THREE.MeshBasicMaterial>();
function beamMat(color: string): THREE.MeshBasicMaterial {
  let m = beamMats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    beamMats.set(color, m);
  }
  return m;
}

/** Parse a script item name: weapon id, "ammo", "armor", "health", "cash". */
export function parseItem(item: string, ammo = 0): PickupKind {
  if (isWeaponId(item)) return { type: 'weapon', weapon: item, ammo: ammo || WEAPONS[item].magSize * 3 };
  if (item === 'armor') return { type: 'armor' };
  if (item === 'health') return { type: 'health' };
  if (item === 'cash') return { type: 'cash', amount: ammo || 150 };
  return { type: 'ammo', amount: ammo || 60 };
}

export function pickupColor(k: PickupKind): string {
  return k.type === 'weapon' ? '#ffd23f' : k.type === 'armor' ? '#19e6ff' : k.type === 'health' ? '#ff4d6d' : k.type === 'cash' ? '#72cc72' : '#ffffff';
}

let nextPickupId = 1;

export class Pickups {
  readonly list: Pickup[] = [];
  private max = 40;

  constructor(private scene: THREE.Scene) {}

  spawn(kind: PickupKind, x: number, z: number, y = 0, persistent = false): Pickup {
    if (this.list.length >= this.max) {
      const old = this.list.find((p) => !p.persistent);
      if (old) this.remove(old);
    }
    const root = new THREE.Group();
    root.position.set(x, y, z);
    const model = kind.type === 'weapon' ? buildWeapon(kind.weapon) : buildItem(kind.type === 'ammo' ? 'ammo' : kind.type);
    if (kind.type === 'weapon') model.rotation.set(0, 0, Math.PI / 2);
    model.position.y = 0.45;
    const holder = new THREE.Group();
    holder.add(model);
    root.add(holder);
    const color = pickupColor(kind);
    const beam = new THREE.Mesh(beamGeo, beamMat(color));
    const ring = new THREE.Mesh(ringGeo, beamMat(color));
    ring.position.y = 0.03;
    root.add(beam, ring);
    this.scene.add(root);
    const p: Pickup = { id: nextPickupId++, kind, root, model: holder, life: persistent ? Infinity : 120, t: Math.random() * 6, persistent };
    this.list.push(p);
    return p;
  }

  remove(p: Pickup): void {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    this.scene.remove(p.root);
  }

  /** Animate, expire, and return the pickup the player is standing on (if any). */
  update(dt: number, player: THREE.Vector3 | null): Pickup | null {
    let hit: Pickup | null = null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      p.life -= dt;
      if (p.life <= 0) { this.remove(p); continue; }
      p.model.rotation.y = p.t * 1.6;
      p.model.position.y = Math.sin(p.t * 2.2) * 0.08;
      if (player && !hit) {
        const dx = player.x - p.root.position.x, dz = player.z - p.root.position.z;
        if (dx * dx + dz * dz < 1.6 && Math.abs(player.y - p.root.position.y) < 1.5) hit = p;
      }
    }
    return hit;
  }

  clear(onlyTemporary = true): void {
    for (const p of [...this.list]) if (!onlyTemporary || !p.persistent) this.remove(p);
  }
}
