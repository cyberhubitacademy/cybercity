import * as THREE from 'three';
import type { Outfit } from './Humanoid';
import { createRig, type Rig } from './CharacterModel';
import type { Input } from '../game/Input';
import type { CollisionWorld } from '../world/Collision';
import { SHORE_X, HARBOR_Z, WORLD_MIN } from '../world/layout';

// Rico Vega, on foot. The basic controller below (camera-relative movement,
// sprint with stamina, jumping, step-up, "can't swim" shoreline) is the
// fallback; the movement system (src/systems/movement) installs a `motor`
// that replaces it with the full GTA-style locomotion (crouch, vault/climb,
// swimming/diving, skydiving/parachute, landings, ragdoll-lite tumbles).

export const RICO_OUTFIT: Outfit = {
  shirt: '#1fb5c9', accent: '#ff3d9a', pattern: 'hawaiian',
  pants: '#f1ece2', skin: '#c98b5e', hair: '#2b1a12', shoes: '#ffffff',
  sunglasses: true, hairStyle: 'short', build: 1.05,
};

/** A pluggable on-foot controller (the movement system provides one). */
export interface PlayerMotor {
  update(p: Player, dt: number, input: Input, camYaw: number, world: CollisionWorld): void;
  /** Called when the player is teleported/placed (spawn, hospital, vehicle exit). */
  reset(p: Player): void;
  /** Impact from a car etc. Return true if handled (otherwise the default knock applies). */
  hit?(p: Player, dir: THREE.Vector3, force: number): boolean;
}

/** Hip height the body tilts around (matches both rigs). */
const PIVOT_Y = 0.95;
const _pivot = new THREE.Vector3();

export class Player {
  readonly rig: Rig = createRig(RICO_OUTFIT);
  readonly position = new THREE.Vector3();
  yaw = 0;
  vy = 0;
  onGround = true;
  stamina = 1;
  health = 100;
  maxHealth = 100;
  staminaMult = 1;
  /** Extra speed multiplier from gameplay systems (fitness, injuries, crouching...). */
  speedMult = 1;
  /** Horizontal speed (m/s). */
  speed = 0;
  /** Hidden while driving. */
  active = true;
  /** Set by the camera (first person) to hide the body without disabling the player. */
  hiddenForCamera = false;
  readonly knock = new THREE.Vector3();
  motor: PlayerMotor | null = null;

  // Visuals the motor drives: body tilt around the hips and a vertical offset.
  /** Forward pitch of the whole body (rad, + = lean forward / belly down). */
  tiltPitch = 0;
  /** Side roll of the whole body (rad). */
  tiltRoll = 0;
  /** Vertical offset of the body from the root (crouch, lying down). */
  bodyLift = 0;
  /** Speed / airborne flags handed to the rig's base animation. */
  animSpeed = 0;
  animAirborne = false;

  constructor(scene: THREE.Scene) {
    scene.add(this.rig.root);
  }

  place(x: number, z: number, yaw = this.yaw, y = 0): void {
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.vy = 0;
    this.speed = 0;
    this.onGround = true;
    this.knock.set(0, 0, 0);
    this.tiltPitch = this.tiltRoll = this.bodyLift = 0;
    this.motor?.reset(this);
    this.sync();
  }

  /** Push the player (e.g. clipped by a car). */
  hit(dir: THREE.Vector3, force: number): void {
    if (this.motor?.hit?.(this, dir, force)) return;
    this.knock.addScaledVector(dir, force);
    this.vy = Math.max(this.vy, Math.min(6, force * 0.4));
    this.onGround = false;
  }

  update(dt: number, input: Input, camYaw: number, world: CollisionWorld): void {
    if (!this.active) return;
    if (this.motor) {
      this.motor.update(this, dt, input, camYaw, world);
      this.sync();
      this.rig.animate(dt, this.animSpeed, this.animAirborne);
      return;
    }
    this.basicUpdate(dt, input, camYaw, world);
  }

  private basicUpdate(dt: number, input: Input, camYaw: number, world: CollisionWorld): void {
    const fwd = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const side = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const moving = fwd !== 0 || side !== 0;
    const wantSprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const sprint = moving && wantSprint && this.stamina > 0.02;
    if (sprint) this.stamina = Math.max(0, this.stamina - dt / (7 * this.staminaMult));
    else this.stamina = Math.min(1, this.stamina + dt / 4);

    const target = (moving ? (sprint ? 7.2 : 3.4) : 0) * this.speedMult;
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

    // Shoreline: without the movement system Rico can't swim.
    const onPier = this.position.y > 0.3;
    if (!onPier) {
      if (this.position.x > SHORE_X - 4) this.position.x = SHORE_X - 4;
      if (this.position.z > HARBOR_Z - 1 && this.position.x < SHORE_X) this.position.z = HARBOR_Z - 1;
    }
    this.position.x = Math.max(WORLD_MIN + 8, Math.min(320, this.position.x));
    this.position.z = Math.max(WORLD_MIN + 8, Math.min(290, this.position.z));

    this.sync();
    this.rig.animate(dt, this.speed, !this.onGround && this.position.y - ground > 0.25);
  }

  sync(): void {
    this.rig.root.position.copy(this.position);
    const body = this.rig.body;
    body.rotation.set(this.tiltPitch, this.yaw, this.tiltRoll, 'YXZ');
    if (this.tiltPitch !== 0 || this.tiltRoll !== 0) {
      // Tilt around the hips rather than the feet.
      _pivot.set(0, PIVOT_Y, 0).applyEuler(body.rotation);
      body.position.set(-_pivot.x, PIVOT_Y - _pivot.y + this.bodyLift, -_pivot.z);
    } else {
      body.position.set(0, this.bodyLift, 0);
    }
    this.rig.root.visible = this.active && !this.hiddenForCamera;
  }
}
