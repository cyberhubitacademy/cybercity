import * as THREE from 'three';
import { Humanoid, Outfit } from './Humanoid';
import { Block } from '../world/layout';
import type { CollisionWorld } from '../world/Collision';

// Ambient pedestrians walk loops around block sidewalks. A fixed pool is
// recycled around the player (GTA-style population density), they dive out
// of the way of fast cars, and can be talked to for tips and banter.

const SHIRTS = ['#ff9fc8', '#19c3d6', '#ffd23f', '#ffffff', '#7b2cff', '#ff8a3d', '#3dffb0', '#c8b6ff', '#ff4d6d', '#a0e7ff'];
const PANTS = ['#2b3a55', '#f1ece2', '#1b1b22', '#6b4a3a', '#8fb3c9', '#ffffff', '#3d3d4d'];
const SKINS = ['#f1c7a3', '#d9a27a', '#b07a52', '#8a5a3c', '#5e3b26', '#ffd9bf'];
const HAIRS = ['#1b120d', '#4a2c1a', '#d9b26b', '#8a3a1e', '#2b2b2b', '#e8e0d0', '#ff7cc6'];
const STYLES: Outfit['hairStyle'][] = ['short', 'long', 'bun', 'bald', 'curly'];
const PATTERNS: Outfit['pattern'][] = ['plain', 'plain', 'hawaiian', 'plain', 'suit'];

interface Ped {
  rig: Humanoid;
  pos: THREE.Vector3;
  yaw: number;
  block: Block;
  corner: number;
  dir: 1 | -1;
  speed: number;
  idle: number;
  dodge: number;
  dodgeDir: THREE.Vector3;
  line: number;
}

export class Pedestrians {
  readonly peds: Ped[] = [];
  private rnd = Math.random;

  constructor(private scene: THREE.Scene, private blocks: Block[], private world: CollisionWorld, private poolSize = 30) {}

  private outfit(): Outfit {
    const p = <T,>(a: T[]) => a[Math.floor(this.rnd() * a.length)];
    return {
      shirt: p(SHIRTS), pants: p(PANTS), skin: p(SKINS), hair: p(HAIRS),
      pattern: p(PATTERNS), accent: p(SHIRTS), hairStyle: p(STYLES),
      sunglasses: this.rnd() < 0.35, build: 0.92 + this.rnd() * 0.2,
      shoes: p(['#ffffff', '#1b1b22', '#ff2fa0', '#8a5a3c']),
    };
  }

  private corners(b: Block): THREE.Vector3[] {
    const i = 2;
    return [
      new THREE.Vector3(b.x0 + i, 0.18, b.z0 + i),
      new THREE.Vector3(b.x1 - i, 0.18, b.z0 + i),
      new THREE.Vector3(b.x1 - i, 0.18, b.z1 - i),
      new THREE.Vector3(b.x0 + i, 0.18, b.z1 - i),
    ];
  }

  spawnAround(center: THREE.Vector3): void {
    while (this.peds.length < this.poolSize) {
      const rig = new Humanoid(this.outfit());
      this.scene.add(rig.root);
      const ped: Ped = {
        rig, pos: new THREE.Vector3(), yaw: 0, block: this.blocks[0], corner: 0, dir: 1,
        speed: 1.2 + this.rnd() * 0.7, idle: 0, dodge: 0, dodgeDir: new THREE.Vector3(), line: Math.floor(this.rnd() * 1000),
      };
      this.peds.push(ped);
      this.respawn(ped, center, 10, 110);
    }
  }

  private respawn(p: Ped, center: THREE.Vector3, minD: number, maxD: number): void {
    for (let tries = 0; tries < 30; tries++) {
      const b = this.blocks[Math.floor(this.rnd() * this.blocks.length)];
      const cs = this.corners(b);
      const k = Math.floor(this.rnd() * 4);
      const pos = cs[k].clone().lerp(cs[(k + 1) % 4], this.rnd());
      const d = pos.distanceTo(center);
      if (d < minD || d > maxD) continue;
      p.block = b;
      p.corner = k;
      p.dir = this.rnd() < 0.5 ? 1 : -1;
      if (p.dir === -1) p.corner = (k + 1) % 4;
      p.pos.copy(pos);
      return;
    }
  }

  /** Nearest pedestrian within range (for talking). */
  nearest(pos: THREE.Vector3, range: number): Ped | null {
    let best: Ped | null = null, bd = range;
    for (const p of this.peds) {
      const d = p.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** Face the player and pause, used when talking. */
  greet(p: Ped, toward: THREE.Vector3): void {
    p.idle = 4;
    p.yaw = Math.atan2(toward.x - p.pos.x, toward.z - p.pos.z);
  }

  update(dt: number, center: THREE.Vector3, threats: { pos: THREE.Vector3; vel: THREE.Vector3 }[]): void {
    for (const p of this.peds) {
      if (p.pos.distanceTo(center) > 140) {
        this.respawn(p, center, 70, 130);
      }
      // dodge fast cars heading at us
      if (p.dodge <= 0) {
        for (const t of threats) {
          const speed = t.vel.length();
          if (speed < 6) continue;
          const rel = p.pos.clone().sub(t.pos);
          const dist = rel.length();
          if (dist > 14) continue;
          const toward = -rel.dot(t.vel) / (dist * speed);
          if (toward < -0.7) {
            const side = new THREE.Vector3(-t.vel.z, 0, t.vel.x).normalize();
            if (side.dot(rel) < 0) side.negate();
            p.dodge = 0.7;
            p.dodgeDir.copy(side);
            break;
          }
        }
      }
      let moveSpeed = 0;
      if (p.dodge > 0) {
        p.dodge -= dt;
        p.pos.addScaledVector(p.dodgeDir, 6 * dt);
        p.yaw = Math.atan2(p.dodgeDir.x, p.dodgeDir.z);
        moveSpeed = 6;
      } else if (p.idle > 0) {
        p.idle -= dt;
      } else {
        const cs = this.corners(p.block);
        const target = cs[(p.corner + (p.dir === 1 ? 1 : 3)) % 4];
        const to = target.clone().sub(p.pos);
        to.y = 0;
        const d = to.length();
        if (d < 0.6) {
          p.corner = (p.corner + (p.dir === 1 ? 1 : 3)) % 4;
          if (this.rnd() < 0.25) p.idle = 1 + this.rnd() * 4;
        } else {
          to.normalize();
          const desired = Math.atan2(to.x, to.z);
          let diff = desired - p.yaw;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          p.yaw += diff * Math.min(1, dt * 6);
          p.pos.addScaledVector(to, p.speed * dt);
          moveSpeed = p.speed;
        }
      }
      this.world.resolveCircle(p.pos, 0.35, p.pos.y, 1.7);
      p.pos.y = this.world.groundHeight(p.pos.x, p.pos.z, p.pos.y);
      const far = p.pos.distanceTo(center) > 90;
      p.rig.root.visible = !far;
      if (!far) p.rig.animate(dt, moveSpeed);
      p.rig.root.position.copy(p.pos);
      p.rig.body.rotation.y = p.yaw;
    }
  }

  positions(): THREE.Vector3[] {
    return this.peds.map((p) => p.pos);
  }
}

export type { Ped };
