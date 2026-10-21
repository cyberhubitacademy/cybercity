import * as THREE from 'three';
import { Humanoid, Outfit } from './Humanoid';
import type { Input } from '../game/Input';
import type { CollisionWorld } from '../world/Collision';
import { SHORE_X, HARBOR_Z, WORLD_MIN } from '../world/layout';

// Rico Vega, on foot: camera-relative movement, sprint with stamina, jumping,
// step-up onto curbs/pier, and the "can't swim" shoreline rule.

export const RICO_OUTFIT: Outfit = {
  shirt: '#1fb5c9', accent: '#ff3d9a', pattern: 'hawaiian',
  pants: '#f1ece2', skin: '#c98b5e', hair: '#2b1a12', shoes: '#ffffff',
  sunglasses: true, hairStyle: 'short', build: 1.05,
};

export class Player {
  readonly rig = new Humanoid(RICO_OUTFIT);
  readonly position = new THREE.Vector3();
  yaw = 0;
  private vy = 0;
  private onGround = true;
  stamina = 1;
  health = 100;
  maxHealth = 100;
  staminaMult = 1;
  speed = 0;
  /** Hidden while driving. */
  active = true;
  private knock = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    scene.add(this.rig.root);
  }

  place(x: number, z: number, yaw = this.yaw): void {
    this.position.set(x, 0, z);
    this.yaw = yaw;
    this.vy = 0;
    this.knock.set(0, 0, 0);
    this.sync();
  }

  /** Push the player (e.g. clipped by a car). */
  hit(dir: THREE.Vector3, force: number): void {
    this.knock.addScaledVector(dir, force);
    this.vy = Math.max(this.vy, Math.min(6, force * 0.4));
    this.onGround = false;
  }

  update(dt: number, input: Input, camYaw: number, world: CollisionWorld): void {
    if (!this.active) return;
    const fwd = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const side = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const moving = fwd !== 0 || side !== 0;
    const wantSprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const sprint = moving && wantSprint && this.stamina > 0.02;
    if (sprint) this.stamina = Math.max(0, this.stamina - dt / (7 * this.staminaMult));
    else this.stamina = Math.min(1, this.stamina + dt / 4);

    const target = moving ? (sprint ? 7.2 : 3.4) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * (moving ? 8 : 10));

    if (moving) {
      // camera looks along -dir(yaw)
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      // right vector = (-fz, fx)
      let mx = fx * fwd - fz * side;
      let mz = fz * fwd + fx * side;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len; mz /= len;
      const desiredYaw = Math.atan2(mx, mz);
      let d = desiredYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }
    const vx = Math.sin(this.yaw) * this.speed + this.knock.x;
    const vz = Math.cos(this.yaw) * this.speed + this.knock.z;
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 4));

    this.position.x += vx * dt;
    this.position.z += vz * dt;

    // jump + gravity
    if (this.onGround && input.wasPressed('Space') && input.enabled) {
      this.vy = 5.2;
      this.onGround = false;
    }
    this.vy -= 18 * dt;
    this.position.y += this.vy * dt;

    world.resolveCircle(this.position, 0.38, this.position.y, 1.75);
    const ground = world.groundHeight(this.position.x, this.position.z, this.position.y);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.vy = 0;
      this.onGround = true;
    } else if (this.position.y - ground > 0.05) {
      this.onGround = this.vy <= 0 && this.position.y - ground < 0.08;
    }

    // Shoreline: Rico can't swim. Gently push back onto the beach (pier excepted).
    const onPier = this.position.y > 0.3;
    if (!onPier) {
      if (this.position.x > SHORE_X - 4) this.position.x = SHORE_X - 4;
      if (this.position.z > HARBOR_Z - 1 && this.position.x < SHORE_X) this.position.z = HARBOR_Z - 1;
    }
    this.position.x = Math.max(WORLD_MIN + 8, Math.min(320, this.position.x));
    this.position.z = Math.max(WORLD_MIN + 8, Math.min(290, this.position.z));

    this.rig.animate(dt, this.speed, !this.onGround && this.position.y - ground > 0.25);
    this.sync();
  }

  sync(): void {
    this.rig.root.position.copy(this.position);
    this.rig.body.rotation.y = this.yaw;
    this.rig.root.visible = this.active;
  }
}
