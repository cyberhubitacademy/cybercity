import * as THREE from 'three';
import type { Player, PlayerMotor } from '../../actors/Player';
import type { Input } from '../../game/Input';
import type { CollisionWorld } from '../../world/Collision';
import { WORLD_MIN } from '../../world/layout';
import type { PoseName } from './poses';
import type { RigPoseOptions } from './rigPose';
import {
  FREEFALL_HEIGHT, SWIM_ENTER_DEPTH, SWIM_EXIT_DEPTH, SWIM_ROOT_Y, WATER_Y,
  detectObstacle, fallDamage, landingKind, lungCapacity, staminaMultiplier, stepBreath, stepFreefall,
  stepParachute, terrainHeight, waterImpactDamage, type Breath, type FlightState, type Obstacle,
} from './physics';

// GTA-style on-foot locomotion for Rico, installed as the Player's motor.
// One state machine covers walking/jogging/running/sprinting with turn-in-place,
// crouch-sneak, jumps with variable height, vault/climb/mantle, landings
// (soft, roll, hard, tumble), ragdoll-lite tumbles and get-ups, surface
// swimming, underwater 3D swimming with breath, freefall and parachuting.

export type MoveState =
  | 'ground' | 'air' | 'vault' | 'climb' | 'roll' | 'land' | 'stumble' | 'tumble' | 'getup'
  | 'swim' | 'under' | 'freefall' | 'parachute';

export type MoveSound =
  | 'jump' | 'land' | 'hardland' | 'roll' | 'vault' | 'climb' | 'splash' | 'bigsplash' | 'dive'
  | 'gasp' | 'deploy' | 'cut' | 'whoosh' | 'bump' | 'crouch' | 'stroke';

/** What the movement system provides to the motor (keeps the motor free of game/UI code). */
export interface MotorHooks {
  damage(hp: number, cause: 'fall' | 'drown' | 'impact'): void;
  sound(name: MoveSound, strength?: number): void;
  splash(x: number, z: number, strength: number): void;
  shake(amount: number): void;
  camPitch(): number;
  peds(): readonly THREE.Vector3[];
  scuba(): boolean;
  staminaStat(): number;
  lungStat(): number;
}

export interface CameraHint {
  mode: 'foot' | 'crouch' | 'swim' | 'underwater' | 'freefall' | 'parachute' | 'tumble';
  /** Look-at height above the player's root (on-foot default 1.55). */
  heightOffset: number;
  /** Extra distance added to the player's chosen camera distance. */
  extraDistance: number;
  /** Extra FOV degrees (0 when reduced motion is on). */
  fovBoost: number;
  /** Keep the camera above / below these heights (water surface handling). */
  minY: number;
  maxY: number;
}

export interface Prompt { key: string; text: string }

interface Action {
  kind: 'vault' | 'climb';
  sx: number; sy: number; sz: number;
  fx: number; fz: number; // hands-on-ledge point (climb)
  ex: number; ey: number; ez: number;
  top: number;
  dur: number;
  speedOut: number;
}

const TAU = Math.PI * 2;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const ease = (t: number): number => t * t * (3 - 2 * t);

export class Locomotion implements PlayerMotor {
  state: MoveState = 'ground';
  stateT = 0;
  crouched = false;
  /** World velocity used while airborne, swimming or tumbling. */
  readonly vel = new THREE.Vector3();
  readonly breath: Breath = { air: 24, capacity: 24, drowning: 0 };
  readonly flight: FlightState = { speed: 0, vy: 0, yaw: 0, bank: 0, open: 0 };
  /** 0..1 flare amount while parachuting (visual). */
  flare = 0;
  /** Exercise since the system last collected it (meters / seconds). */
  sprintM = 0;
  swimM = 0;
  underS = 0;
  prompts: Prompt[] = [];
  sprinting = false;
  /** Water depth at the feet (0 on dry land). */
  depth = 0;
  readonly cam: CameraHint = { mode: 'foot', heightOffset: 1.55, extraDistance: 0, fovBoost: 0, minY: 0.4, maxY: Infinity };
  reducedMotion = false;

  private peakY = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private sprintHold = 0;
  private winded = false;
  private regenDelay = 0;
  private landDip = 0;
  private rollSpeed = 0;
  private action: Action | null = null;
  private pose: PoseName = 'none';
  private stroke = 0;
  private drownAcc = 0;
  private pedCheck = 0;
  private bumpCooldown = 0;
  private probeT = 0;
  private probe: Obstacle | null = null;
  private quayLedge: number | null = null;
  private spinP = 0;
  private spinR = 0;
  private lying = 0;
  private lieFrom = 0;
  private strokeSound = 0;
  private lastSplash = 0;

  constructor(private hooks: MotorHooks) {}

  get swimming(): boolean { return this.state === 'swim' || this.state === 'under'; }
  get underwater(): boolean { return this.state === 'under'; }
  get airborne(): boolean { return this.state === 'air' || this.state === 'freefall' || this.state === 'parachute'; }
  /** Busy with a move that can't be interrupted by weapons. */
  get busy(): boolean {
    return this.state !== 'ground' && this.state !== 'air' && this.state !== 'stumble';
  }

  /** 0 (silent) .. 1 (loud) footstep noise for stealth systems. */
  noise(p: Player): number {
    if (this.swimming) return 0.15;
    if (this.state !== 'ground') return this.state === 'land' || this.state === 'tumble' ? 1 : 0.5;
    if (this.crouched) return p.speed < 0.2 ? 0.02 : p.speed < 2 ? 0.12 : 0.25;
    return p.speed < 0.2 ? 0.05 : p.speed < 4 ? 0.4 : 0.8 + (this.sprinting ? 0.2 : 0);
  }

  reset(p: Player): void {
    this.setState('ground');
    this.crouched = false;
    this.vel.set(0, 0, 0);
    this.action = null;
    this.flight.open = 0;
    this.breath.air = this.breath.capacity;
    this.breath.drowning = 0;
    this.peakY = p.position.y;
    this.setPose(p, 'none');
    p.rig.setPose('none');
  }

  hit(p: Player, dir: THREE.Vector3, force: number): boolean {
    if (this.swimming || this.state === 'freefall' || this.state === 'parachute') {
      this.vel.addScaledVector(dir, force * 0.3);
      return true;
    }
    if (this.state === 'tumble' || this.state === 'getup') {
      if (this.state === 'tumble' && this.stateT > 0.5) this.vel.addScaledVector(dir, Math.min(4, force * 0.3));
      return true;
    }
    if (force > 7) this.startTumble(p, dir.x, dir.z, force, Math.min(6.5, force * 0.45));
    else {
      p.knock.addScaledVector(dir, force * 0.7);
      this.startStumble(p);
    }
    return true;
  }

  /** Knock Rico over (explosions, melee, vehicle hits from other systems). */
  ragdoll(p: Player, dirX: number, dirZ: number, force: number): void {
    const l = Math.hypot(dirX, dirZ) || 1;
    this.startTumble(p, dirX / l, dirZ / l, force, Math.min(6.5, force * 0.45));
  }

  /** Throw Rico into the air (BASE jump board, launch pads). */
  launch(p: Player, vx: number, vz: number, vy: number): void {
    this.vel.set(vx, 0, vz);
    p.vy = vy;
    p.yaw = Math.atan2(vx, vz);
    this.peakY = p.position.y;
    this.crouched = false;
    this.setState('air');
  }

  setCrouch(on: boolean): void {
    if (this.state === 'ground') this.crouched = on;
  }

  // ------------------------------------------------------------------ frame

  update(p: Player, rawDt: number, input: Input, camYaw: number, world: CollisionWorld): void {
    const dt = Math.min(rawDt, 0.05);
    this.stateT += dt;
    this.bumpCooldown -= dt;
    this.prompts.length = 0;
    this.breath.capacity = lungCapacity(this.hooks.lungStat());
    if (this.breath.air > this.breath.capacity) this.breath.air = this.breath.capacity;

    const en = input.enabled;
    const fwd = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const side = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const ctl: Controls = {
      fwd, side, moving: fwd !== 0 || side !== 0,
      sprint: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
      space: en && input.wasPressed('Space'), spaceHeld: input.isDown('Space'),
      c: en && input.wasPressed('KeyC'), cHeld: input.isDown('KeyC'),
      mx: 0, mz: 0, camYaw,
    };
    if (ctl.moving) {
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      let mx = fx * fwd - fz * side, mz = fz * fwd + fx * side;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len; mz /= len;
      ctl.mx = mx; ctl.mz = mz;
    }
    if (ctl.space) this.jumpBuffer = 0.15;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    switch (this.state) {
      case 'ground': this.ground(p, dt, ctl, world); break;
      case 'air': this.air(p, dt, ctl, world); break;
      case 'vault':
      case 'climb': this.doAction(p, dt, world); break;
      case 'roll': this.roll(p, dt, world); break;
      case 'land': this.hardLand(p, dt); break;
      case 'stumble': this.stumble(p, dt, ctl, world); break;
      case 'tumble': this.tumble(p, dt, world); break;
      case 'getup': this.getup(p, dt); break;
      case 'swim': this.swim(p, dt, ctl, world); break;
      case 'under': this.under(p, dt, ctl, world); break;
      case 'freefall': this.freefall(p, dt, ctl, world); break;
      case 'parachute': this.parachute(p, dt, ctl, world); break;
    }

    // Breath (underwater drains, surface refills).
    const dmg = stepBreath(this.breath, dt, this.state === 'under', this.state === 'under' && ctl.sprint, this.hooks.scuba());
    if (dmg > 0) {
      this.drownAcc += dmg;
      if (this.drownAcc >= 4) { this.hooks.damage(Math.floor(this.drownAcc), 'drown'); this.drownAcc -= Math.floor(this.drownAcc); }
    } else this.drownAcc = 0;

    p.position.x = clamp(p.position.x, WORLD_MIN + 8, 328);
    p.position.z = clamp(p.position.z, WORLD_MIN + 8, 298);
    this.updateCamera(p);
  }

  // ------------------------------------------------------------------ helpers

  private setState(s: MoveState): void {
    this.state = s;
    this.stateT = 0;
  }

  private setPose(p: Player, name: PoseName, weight = 1, opts?: RigPoseOptions): void {
    if (name !== this.pose) {
      if (this.pose !== 'none') p.rig.setPose(this.pose, 0);
      this.pose = name;
    }
    if (name !== 'none') p.rig.setPose(name, weight, opts);
  }

  /** Ground under (x, z) for feet at maxY: highest box top or the natural terrain (beach/sea floor). */
  groundAt(world: CollisionWorld, x: number, z: number, maxY: number): number {
    const g = world.groundHeight(x, z, maxY);
    const t = terrainHeight(x, z);
    return g > 0 ? Math.max(g, t) : t;
  }

  private probeObstacle(p: Player, world: CollisionWorld, dx: number, dz: number, reach: number): Obstacle | null {
    return detectObstacle(world.near(p.position.x, p.position.z, reach + 3), p.position.x, p.position.y, p.position.z, dx, dz, reach);
  }

  private turnToward(p: Player, mx: number, mz: number, rate: number, dt: number): number {
    const d = wrap(Math.atan2(mx, mz) - p.yaw);
    p.yaw = wrap(p.yaw + d * Math.min(1, dt * rate));
    return d;
  }

  private ease(p: Player, pitch: number, roll: number, lift: number, rate: number, dt: number): void {
    const k = Math.min(1, dt * rate);
    p.tiltPitch += (pitch - p.tiltPitch) * k;
    p.tiltRoll += (roll - p.tiltRoll) * k;
    p.bodyLift += (lift - p.bodyLift) * k;
  }

  private sprintStaminaDrain(p: Player, dt: number, per: number): void {
    p.stamina = Math.max(0, p.stamina - dt / (per * p.staminaMult * staminaMultiplier(this.hooks.staminaStat())));
    if (p.stamina <= 0) this.winded = true;
    this.regenDelay = 0.8;
  }

  private regen(p: Player, dt: number): void {
    this.regenDelay -= dt;
    if (this.regenDelay <= 0) p.stamina = Math.min(1, p.stamina + dt / 4);
    if (p.stamina > 0.25) this.winded = false;
  }

  // ------------------------------------------------------------------ on foot

  private ground(p: Player, dt: number, c: Controls, world: CollisionWorld): void {
    const pos = p.position;
    const g0 = this.groundAt(world, pos.x, pos.z, pos.y);
    this.depth = Math.max(0, WATER_Y - g0);
    if (this.depth > SWIM_ENTER_DEPTH) { this.enterSwim(p, false); return; }

    if (c.c) { this.crouched = !this.crouched; this.hooks.sound('crouch'); }
    if (this.crouched && this.depth > 0.6) this.crouched = false;

    // Target speed: walk-up ramp to jog, run, then sprint after holding Shift.
    let target = 0;
    this.sprinting = false;
    if (c.moving) {
      if (this.crouched) target = c.sprint ? 2.7 : 1.45;
      else if (c.sprint && !this.winded && this.depth < 0.8) {
        this.sprintHold += dt;
        target = this.sprintHold > 0.7 ? 7.6 : 5.8;
        this.sprinting = true;
      } else target = 3.5;
    }
    if (!this.sprinting) this.sprintHold = Math.max(0, this.sprintHold - dt * 2);
    if (this.sprinting) this.sprintStaminaDrain(p, dt, this.sprintHold > 0.7 ? 7 : 11);
    else this.regen(p, dt);
    const wade = this.depth > 0.25 ? Math.max(0.42, 1 - (this.depth - 0.25) * 0.6) : 1;
    target *= p.speedMult * wade;

    // Turning: pivot in place from standstill, skid on sharp turns at a sprint.
    let turningInPlace = false;
    if (c.moving) {
      const d = wrap(Math.atan2(c.mx, c.mz) - p.yaw);
      if (p.speed < 1.2 && Math.abs(d) > 1.9) {
        p.yaw = wrap(p.yaw + Math.sign(d) * Math.min(Math.abs(d), 13 * dt));
        target *= 0.15;
        turningInPlace = true;
      } else if (p.speed > 5 && Math.abs(d) > 2.4) {
        p.speed *= Math.max(0, 1 - dt * 7);
        p.yaw = wrap(p.yaw + d * Math.min(1, dt * 5));
      } else {
        const rate = Math.max(6, 14 - p.speed);
        p.yaw = wrap(p.yaw + d * Math.min(1, dt * rate));
        target *= Math.max(0.4, Math.cos(Math.min(Math.abs(d), 1.4)));
      }
    }
    const acc = target > p.speed ? (p.speed < 3.5 ? 9 : 5.5) : 14;
    p.speed += clamp(target - p.speed, -acc * dt, acc * dt);
    if (this.landDip > 0) { this.landDip -= dt; p.speed *= 1 - dt * 2; }

    const vx = Math.sin(p.yaw) * p.speed + p.knock.x;
    const vz = Math.cos(p.yaw) * p.speed + p.knock.z;
    p.knock.multiplyScalar(Math.max(0, 1 - dt * 4));
    pos.x += vx * dt;
    pos.z += vz * dt;
    world.resolveCircle(pos, 0.38, pos.y, this.crouched ? 1.25 : 1.75);
    if (this.sprinting) this.sprintM += p.speed * dt;

    const g = this.groundAt(world, pos.x, pos.z, pos.y);
    if (pos.y - g > 0.45) {
      // Walked off a ledge.
      this.vel.set(vx, 0, vz);
      p.vy = 0;
      this.peakY = pos.y;
      this.coyote = 0.12;
      this.setState('air');
      return;
    }
    pos.y = g;
    p.vy = 0;
    p.onGround = true;

    // Bumping into pedestrians while running.
    this.pedCheck -= dt;
    if (p.speed > 3.2 && this.pedCheck <= 0 && this.bumpCooldown <= 0) {
      this.pedCheck = 0.08;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      for (const q of this.hooks.peds()) {
        const dx = q.x - pos.x, dz = q.z - pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.6 || Math.abs(q.y - pos.y) > 1) continue;
        const d = Math.sqrt(d2) || 1;
        if ((dx * fx + dz * fz) / d < 0.2) continue;
        p.knock.set((-dx / d) * 2.2, 0, (-dz / d) * 2.2);
        this.hooks.sound('bump');
        this.startStumble(p);
        return;
      }
    }

    // Space: vault / climb if something is in front, otherwise jump.
    const fdx = c.moving ? c.mx : Math.sin(p.yaw), fdz = c.moving ? c.mz : Math.cos(p.yaw);
    this.probeT -= dt;
    if (this.probeT <= 0) {
      this.probeT = 0.15;
      this.probe = this.probeObstacle(p, world, Math.sin(p.yaw), Math.cos(p.yaw), 1.1);
    }
    if (this.probe && this.probe.dist < 1.1) this.prompts.push({ key: 'SPACE', text: this.probe.kind === 'vault' ? 'Vault' : 'Climb' });
    if (this.jumpBuffer > 0) {
      const reach = c.moving ? 0.7 + p.speed * 0.12 : 0.8;
      const obs = this.probeObstacle(p, world, fdx, fdz, reach);
      this.jumpBuffer = 0;
      if (obs) { this.startAction(p, obs, fdx, fdz); return; }
      if (this.crouched) { this.crouched = false; return; }
      p.vy = 5.4 + Math.min(p.speed, 7.6) * 0.07;
      this.vel.set(vx, 0, vz);
      this.peakY = pos.y;
      this.hooks.sound('jump');
      this.setState('air');
      p.onGround = false;
      return;
    }

    // Visuals.
    const dip = this.landDip > 0 ? Math.sin((this.landDip / 0.25) * Math.PI) : 0;
    if (this.crouched) {
      this.setPose(p, 'crouch', 1);
      this.ease(p, 0, 0, -0.36, 10, dt);
    } else if (dip > 0) {
      this.setPose(p, 'crouch', 0.55 * dip, { blend: 20 });
      this.ease(p, 0, 0, -0.18 * dip, 20, dt);
    } else {
      this.setPose(p, 'none');
      // lean into acceleration a touch
      this.ease(p, Math.min(0.12, p.speed * 0.012), 0, 0, 8, dt);
    }
    p.animSpeed = turningInPlace ? 1.2 : p.speed;
    p.animAirborne = false;
    if (this.crouched) this.prompts.push({ key: 'C', text: 'Stand up' });
  }

  private air(p: Player, dt: number, c: Controls, world: CollisionWorld): void {
    const pos = p.position;
    const grav = p.vy > 0 ? (c.spaceHeld ? 17 : 27) : 24;
    p.vy = Math.max(-55, p.vy - grav * dt);
    // Air control steers without killing momentum.
    if (c.moving) {
      const h = Math.max(2.5, Math.hypot(this.vel.x, this.vel.z));
      const k = Math.min(1, dt * 1.6);
      this.vel.x += (c.mx * h - this.vel.x) * k;
      this.vel.z += (c.mz * h - this.vel.z) * k;
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.6) this.turnToward(p, this.vel.x, this.vel.z, 6, dt);
    pos.x += this.vel.x * dt;
    pos.z += this.vel.z * dt;
    pos.y += p.vy * dt;
    this.coyote -= dt;
    p.onGround = false;
    if (this.coyote > 0 && this.jumpBuffer > 0) {
      this.coyote = 0;
      this.jumpBuffer = 0;
      p.vy = 5.4;
      this.hooks.sound('jump');
    }
    const hit = world.resolveCircle(pos, 0.38, pos.y, 1.75);
    if (hit) {
      const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
      if (vn < 0) { this.vel.x -= vn * hit.nx; this.vel.z -= vn * hit.nz; }
    }
    this.peakY = Math.max(this.peakY, pos.y);

    // Mantle: Space near a ledge while airborne.
    if (this.jumpBuffer > 0) {
      const obs = this.probeObstacle(p, world, Math.sin(p.yaw), Math.cos(p.yaw), 0.8);
      if (obs) { this.jumpBuffer = 0; this.startAction(p, obs, Math.sin(p.yaw), Math.cos(p.yaw)); return; }
    }

    const g = this.groundAt(world, pos.x, pos.z, pos.y);
    const deep = g < WATER_Y - SWIM_ENTER_DEPTH;
    const above = pos.y - (deep ? WATER_Y : g);
    if (p.vy < -3 && above > FREEFALL_HEIGHT) { this.enterFreefall(p); return; }
    const diving = deep && (this.peakY - WATER_Y > 2.4) && p.vy < 0;
    if (deep && pos.y <= WATER_Y) { this.enterWater(p, this.peakY - WATER_Y, p.vy, diving || this.pose === 'dive'); return; }
    if (!deep && pos.y <= g) { pos.y = g; this.land(p, this.peakY - g, hs, world); return; }

    if (diving) {
      this.setPose(p, 'dive', 1);
      this.ease(p, 2.4, 0, 0, 2.5, dt);
    } else {
      this.setPose(p, 'none');
      this.ease(p, 0, 0, 0, 8, dt);
    }
    p.speed = hs;
    p.animSpeed = hs;
    p.animAirborne = pos.y - g > 0.25;
  }

  private land(p: Player, height: number, horiz: number, world: CollisionWorld): void {
    p.vy = 0;
    p.onGround = true;
    const kind = landingKind(height, horiz);
    const dmg = fallDamage(height, kind === 'roll');
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    switch (kind) {
      case 'soft':
        p.speed = Math.min(horiz, 7.6) * 0.9;
        this.landDip = height > 0.7 ? 0.25 : 0;
        if (height > 0.7) this.hooks.sound('land', Math.min(1, height / 3));
        this.setState('ground');
        break;
      case 'roll':
        this.rollSpeed = Math.max(horiz, 4);
        p.speed = this.rollSpeed;
        this.hooks.sound('roll');
        this.setState('roll');
        break;
      case 'hard':
        p.speed = 0;
        this.hooks.sound('hardland');
        this.hooks.shake(0.35);
        this.setState('land');
        break;
      case 'tumble':
        this.hooks.sound('hardland');
        this.hooks.shake(0.7);
        this.startTumble(p, fx, fz, Math.max(horiz, 2.5), 2.5);
        break;
    }
    void world;
    if (dmg > 0) this.hooks.damage(dmg, 'fall');
  }

  private startAction(p: Player, obs: Obstacle, dx: number, dz: number): void {
    const pos = p.position;
    const h = obs.height;
    const vault = obs.kind === 'vault';
    const fromWater = this.swimming;
    this.action = {
      kind: obs.kind,
      sx: pos.x, sy: pos.y, sz: pos.z,
      fx: pos.x + dx * Math.max(0, obs.dist - 0.32), fz: pos.z + dz * Math.max(0, obs.dist - 0.32),
      ex: obs.landX, ey: vault ? pos.y : obs.top, ez: obs.landZ,
      top: obs.top,
      dur: vault ? clamp(0.62 + h * 0.2 - p.speed * 0.03, 0.42, 0.85) : (fromWater ? 1.25 : 0.55 + h * 0.32),
      speedOut: vault ? Math.max(p.speed, 3.2) : 0,
    };
    p.yaw = Math.atan2(dx, dz);
    this.crouched = false;
    this.hooks.sound(vault ? 'vault' : 'climb');
    this.setState(obs.kind);
  }

  private doAction(p: Player, dt: number, world: CollisionWorld): void {
    const a = this.action;
    if (!a) { this.setState('ground'); return; }
    const pos = p.position;
    const u = Math.min(1, this.stateT / a.dur);
    if (a.kind === 'vault') {
      const e = ease(u);
      pos.x = a.sx + (a.ex - a.sx) * e;
      pos.z = a.sz + (a.ez - a.sz) * e;
      pos.y = a.sy + (a.top + 0.12 - a.sy) * Math.pow(Math.sin(Math.PI * u), 0.6);
      const b = Math.sin(Math.PI * u);
      this.setPose(p, 'climb', 0.85 * b, { phase: u * Math.PI, blend: 18 });
      this.ease(p, 0.3 * b, 0.55 * b, -0.15 * b, 20, dt);
      p.animSpeed = 2;
      if (u >= 1) {
        const g = this.groundAt(world, pos.x, pos.z, pos.y + 0.1);
        this.action = null;
        if (pos.y - g > 0.3) {
          this.vel.set(Math.sin(p.yaw) * a.speedOut, 0, Math.cos(p.yaw) * a.speedOut);
          p.vy = 0.5;
          this.peakY = pos.y;
          this.setState('air');
        } else {
          pos.y = g;
          p.speed = a.speedOut;
          this.setState('ground');
        }
      }
    } else {
      const split = 0.62;
      if (u < split) {
        const k = u / split;
        const m = Math.min(1, k * 2.5);
        pos.x = a.sx + (a.fx - a.sx) * m;
        pos.z = a.sz + (a.fz - a.sz) * m;
        pos.y = a.sy + (a.top - a.sy) * ease(k);
        this.setPose(p, 'climb', 1, { phase: k * Math.PI * 0.5, blend: 14 });
        this.ease(p, 0.15, 0, -0.1, 10, dt);
      } else {
        const k = (u - split) / (1 - split);
        pos.x = a.fx + (a.ex - a.fx) * ease(k);
        pos.z = a.fz + (a.ez - a.fz) * ease(k);
        pos.y = a.top + 0.04 * Math.sin(Math.PI * k);
        this.setPose(p, 'climb', 1 - k, { phase: Math.PI * 0.5 + k, blend: 14 });
        this.ease(p, 0.3 * (1 - k), 0, -0.3 * (1 - k), 10, dt);
      }
      p.animSpeed = 0;
      if (u >= 1) {
        pos.y = a.top;
        p.speed = 0;
        this.action = null;
        this.setState('ground');
      }
    }
    p.animAirborne = false;
    p.vy = 0;
  }

  private roll(p: Player, dt: number, world: CollisionWorld): void {
    const dur = 0.7;
    const u = Math.min(1, this.stateT / dur);
    const pos = p.position;
    p.speed = this.rollSpeed * (1 - u * 0.35);
    pos.x += Math.sin(p.yaw) * p.speed * dt;
    pos.z += Math.cos(p.yaw) * p.speed * dt;
    world.resolveCircle(pos, 0.38, pos.y, 1.2);
    const g = this.groundAt(world, pos.x, pos.z, pos.y);
    pos.y = Math.max(g, pos.y - 6 * dt);
    p.tiltPitch = u * TAU;
    p.tiltRoll = 0;
    p.bodyLift = -0.5 * Math.sin(Math.PI * u);
    this.setPose(p, 'tuck', Math.sin(Math.PI * Math.min(1, u * 1.2)), { blend: 25 });
    p.animSpeed = 0;
    if (u >= 1) {
      p.tiltPitch = 0;
      p.bodyLift = 0;
      this.setState('ground');
    }
  }

  private hardLand(p: Player, dt: number): void {
    const dur = 0.6;
    const u = Math.min(1, this.stateT / dur);
    const w = 1 - ease(u);
    this.setPose(p, 'crouch', w, { blend: 25, move: 0 });
    p.bodyLift = -0.34 * w;
    p.tiltPitch = 0.25 * w;
    p.speed = 0;
    p.animSpeed = 0;
    void dt;
    if (u >= 1) { p.bodyLift = 0; p.tiltPitch = 0; this.setState('ground'); }
  }

  private startStumble(p: Player): void {
    this.bumpCooldown = 1.2;
    p.speed *= 0.45;
    this.setState('stumble');
  }

  private stumble(p: Player, dt: number, c: Controls, world: CollisionWorld): void {
    const dur = 0.5;
    const u = Math.min(1, this.stateT / dur);
    const pos = p.position;
    p.speed *= Math.max(0, 1 - dt * 3);
    pos.x += (Math.sin(p.yaw) * p.speed + p.knock.x) * dt;
    pos.z += (Math.cos(p.yaw) * p.speed + p.knock.z) * dt;
    p.knock.multiplyScalar(Math.max(0, 1 - dt * 5));
    world.resolveCircle(pos, 0.38, pos.y, 1.75);
    const g = this.groundAt(world, pos.x, pos.z, pos.y);
    if (pos.y - g > 0.45) { this.vel.set(p.knock.x, 0, p.knock.z); this.peakY = pos.y; this.setState('air'); return; }
    pos.y = g;
    const s = Math.sin(Math.PI * u);
    p.tiltRoll = Math.sin(u * Math.PI * 3) * 0.22 * (1 - u);
    p.tiltPitch = 0.3 * s;
    this.setPose(p, 'crouch', 0.4 * s, { blend: 20 });
    p.animSpeed = p.speed;
    void c;
    if (u >= 1) { p.tiltRoll = 0; this.setState('ground'); }
  }

  private startTumble(p: Player, dx: number, dz: number, force: number, up: number): void {
    this.vel.set(dx * force * 0.8, 0, dz * force * 0.8);
    p.vy = up;
    this.spinP = (5 + Math.random() * 4) * (Math.random() < 0.5 ? -1 : 1);
    this.spinR = (Math.random() - 0.5) * 6;
    this.lying = 0;
    this.crouched = false;
    this.action = null;
    this.peakY = p.position.y;
    this.hooks.sound('bump');
    this.setState('tumble');
  }

  private tumble(p: Player, dt: number, world: CollisionWorld): void {
    const pos = p.position;
    p.vy -= 22 * dt;
    pos.x += this.vel.x * dt;
    pos.z += this.vel.z * dt;
    pos.y += p.vy * dt;
    const hit = world.resolveCircle(pos, 0.4, pos.y, 1.0);
    if (hit) {
      const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
      if (vn < 0) { this.vel.x -= 1.4 * vn * hit.nx; this.vel.z -= 1.4 * vn * hit.nz; this.spinP *= -0.6; }
    }
    const g = this.groundAt(world, pos.x, pos.z, pos.y);
    if (g < WATER_Y - SWIM_ENTER_DEPTH && pos.y <= WATER_Y) { this.enterWater(p, this.peakY - WATER_Y, p.vy, false); return; }
    let grounded = false;
    if (pos.y <= g) {
      pos.y = g;
      grounded = true;
      if (p.vy < -4) { p.vy = -p.vy * 0.3; this.spinP *= 0.6; this.spinR *= 0.6; } else p.vy = 0;
      const f = Math.max(0, 1 - dt * 3.5);
      this.vel.x *= f; this.vel.z *= f;
      this.spinP *= Math.max(0, 1 - dt * 3);
      this.spinR *= Math.max(0, 1 - dt * 4);
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    // Spin while flying, settle onto the back or belly on the ground.
    p.tiltPitch = wrap(p.tiltPitch + this.spinP * dt);
    p.tiltRoll = wrap(p.tiltRoll + this.spinR * dt);
    const spin = Math.abs(this.spinP) + Math.abs(this.spinR);
    if (grounded && spin < 2.5) {
      const lieTarget = p.tiltPitch >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const k = Math.min(1, dt * 6);
      p.tiltPitch += (lieTarget - p.tiltPitch) * k;
      p.tiltRoll += (0 - p.tiltRoll) * k;
    }
    const flat = Math.abs(Math.sin(p.tiltPitch)) * Math.abs(Math.cos(p.tiltRoll));
    p.bodyLift += (-0.78 * flat - p.bodyLift) * Math.min(1, dt * 8);
    this.setPose(p, 'fall', grounded && spin < 2.5 ? 0.25 : 1, { move: Math.min(1, spin / 6), blend: 8 });
    p.speed = hs;
    p.animSpeed = 0;
    p.animAirborne = !grounded;
    if (grounded && hs < 0.6 && spin < 1.2 && this.stateT > 0.8) {
      this.lying += dt;
      if (this.lying > 0.7) {
        this.lieFrom = p.tiltPitch;
        this.vel.set(0, 0, 0);
        this.setState('getup');
      }
    }
  }

  private getup(p: Player, dt: number): void {
    const dur = 1.1;
    const u = Math.min(1, this.stateT / dur);
    const e = ease(u);
    p.tiltPitch = this.lieFrom * (1 - e);
    p.tiltRoll *= Math.max(0, 1 - dt * 8);
    p.bodyLift = -0.78 * (1 - e) * (1 - e) - 0.25 * Math.sin(Math.PI * u);
    this.setPose(p, 'tuck', 0.8 * Math.sin(Math.PI * Math.min(1, u * 1.15)), { blend: 15 });
    p.speed = 0;
    p.animSpeed = 0;
    p.animAirborne = false;
    if (u >= 1) { p.tiltPitch = p.tiltRoll = p.bodyLift = 0; this.setState('ground'); }
  }

  // ------------------------------------------------------------------ water

  private enterWater(p: Player, height: number, vy: number, dive: boolean): void {
    const dmg = waterImpactDamage(height);
    const strength = Math.min(1, Math.abs(vy) / 14 + 0.15);
    this.hooks.splash(p.position.x, p.position.z, strength);
    this.hooks.sound(strength > 0.55 ? 'bigsplash' : 'splash', strength);
    if (dmg > 0) this.hooks.damage(dmg, 'impact');
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (dive || vy < -9) {
      // Plunge under, then float back up.
      const k = dive ? 0.45 : 0.3;
      this.vel.set(this.vel.x * 0.4, Math.max(-7, vy * k), this.vel.z * 0.4);
      p.position.y = WATER_Y - 1.3;
      p.tiltPitch = dive ? 2.6 : p.tiltPitch;
      this.setState('under');
    } else {
      this.vel.set(this.vel.x * 0.4, 0, this.vel.z * 0.4);
      p.speed = Math.min(hs * 0.4, 1.5);
      this.setState('swim');
    }
    this.peakY = p.position.y;
  }

  private enterSwim(p: Player, fromUnder: boolean): void {
    this.crouched = false;
    if (!fromUnder) p.speed = Math.min(p.speed, 1.5);
    else {
      p.speed = Math.min(Math.hypot(this.vel.x, this.vel.z), 2.5);
      if (this.breath.air < this.breath.capacity * 0.5) this.hooks.sound('gasp');
      this.hooks.splash(p.position.x, p.position.z, 0.2);
    }
    this.setState('swim');
  }

  private swim(p: Player, dt: number, c: Controls, world: CollisionWorld): void {
    const pos = p.position;
    const scuba = this.hooks.scuba();
    const fast = c.moving && c.sprint && !this.winded;
    if (fast) this.sprintStaminaDrain(p, dt, 9); else this.regen(p, dt);
    const target = c.moving ? (fast ? 2.9 : 1.55) * (scuba ? 1.2 : 1) * p.speedMult : 0;
    if (c.moving) this.turnToward(p, c.mx, c.mz, 4.5, dt);
    p.speed += clamp(target - p.speed, -2.5 * dt, 2.2 * dt);
    const swimW = clamp((p.speed - 0.25) / 0.6, 0, 1);
    const targetY = SWIM_ROOT_Y + (WATER_Y - 1.07 - SWIM_ROOT_Y) * swimW + Math.sin(this.stateT * 1.8) * 0.04;
    pos.y += (targetY - pos.y) * Math.min(1, dt * 3.5);

    const ox = pos.x, oz = pos.z;
    const gOld = terrainHeight(ox, oz);
    pos.x += (Math.sin(p.yaw) * p.speed + this.vel.x) * dt;
    pos.z += (Math.cos(p.yaw) * p.speed + this.vel.z) * dt;
    this.vel.multiplyScalar(Math.max(0, 1 - dt * 1.5));
    world.resolveCircle(pos, 0.42, pos.y, 1.9);
    // Steep terrain ledges (harbor quay) block swimming; climb out with Space.
    this.quayLedge = null;
    const gNew = terrainHeight(pos.x, pos.z);
    if (gNew > WATER_Y - 0.25 && gNew - gOld > 1.2) {
      pos.x = ox; pos.z = oz;
      this.quayLedge = gNew;
    }
    this.swimM += p.speed * dt;

    const g = this.groundAt(world, pos.x, pos.z, pos.y);
    this.depth = Math.max(0, WATER_Y - g);
    if (this.depth < SWIM_EXIT_DEPTH && this.quayLedge === null) {
      pos.y = g;
      this.setState('ground');
      this.setPose(p, 'none');
      return;
    }

    // Climb out onto piers / quays.
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    this.probeT -= dt;
    if (this.probeT <= 0) {
      this.probeT = 0.15;
      this.probe = this.probeObstacle(p, world, fx, fz, 1.0);
      if (!this.probe) this.probe = this.quayProbe(p, fx, fz);
    }
    if (this.probe) this.prompts.push({ key: 'SPACE', text: 'Climb out' });
    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      const obs = this.probeObstacle(p, world, fx, fz, 1.1) ?? this.quayProbe(p, fx, fz);
      if (obs) { this.startAction(p, obs, fx, fz); return; }
    }
    if (c.c) {
      this.vel.set(fx * p.speed * 0.8, -2.4, fz * p.speed * 0.8);
      this.hooks.sound('dive');
      this.hooks.splash(pos.x, pos.z, 0.2);
      this.setState('under');
      return;
    }

    this.stroke += dt * (swimW > 0.5 ? 2.4 + p.speed * 1.5 : 2.2);
    this.strokeSound -= dt;
    if (swimW > 0.5 && this.strokeSound <= 0) {
      this.strokeSound = Math.PI / (2.4 + p.speed * 1.5);
      this.hooks.sound('stroke', p.speed / 3);
      this.lastSplash += 1;
      if (this.lastSplash % 2 === 0) this.hooks.splash(pos.x + fx * 0.6, pos.z + fz * 0.6, 0.05);
    }
    if (swimW > 0.5) this.setPose(p, 'swim', 1, { phase: this.stroke, move: swimW });
    else this.setPose(p, 'tread', 1, { phase: this.stroke, move: 0 });
    this.ease(p, 0.12 + 1.28 * swimW, 0, 0, 4, dt);
    p.animSpeed = 0;
    p.animAirborne = false;
    p.vy = 0;
    this.prompts.push({ key: 'C', text: 'Dive' });
  }

  private quayProbe(p: Player, fx: number, fz: number): Obstacle | null {
    for (const d of [0.6, 1.0]) {
      const x = p.position.x + fx * d, z = p.position.z + fz * d;
      const t = terrainHeight(x, z);
      if (t > WATER_Y - 0.25 && t - p.position.y <= 2.45) {
        return { kind: 'climb', height: t - p.position.y, top: t, dist: d - 0.3, thickness: 2, landX: x + fx * 0.7, landZ: z + fz * 0.7 };
      }
    }
    return null;
  }

  private under(p: Player, dt: number, c: Controls, world: CollisionWorld): void {
    const pos = p.position;
    const scuba = this.hooks.scuba();
    const pitch = this.hooks.camPitch();
    const cy = c.camYaw;
    const lx = -Math.sin(cy) * Math.cos(pitch), ly = -Math.sin(pitch), lz = -Math.cos(cy) * Math.cos(pitch);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    let mx = lx * c.fwd + rx * c.side, my = ly * c.fwd, mz = lz * c.fwd + rz * c.side;
    my += (c.spaceHeld ? 1 : 0) - (c.cHeld ? 1 : 0);
    const len = Math.hypot(mx, my, mz);
    const fast = c.sprint && len > 0 && !this.winded;
    if (fast) this.sprintStaminaDrain(p, dt, 10); else this.regen(p, dt);
    const spd = (fast ? 3.2 : 1.8) * (scuba ? 1.5 : 1) * p.speedMult;
    let tx = 0, ty = scuba ? 0 : 0.35, tz = 0;
    if (len > 0.01) { mx /= len; my /= len; mz /= len; tx = mx * spd; ty = my * spd; tz = mz * spd; }
    const k = Math.min(1, dt * 2.2);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (ty - this.vel.y) * k;
    this.vel.z += (tz - this.vel.z) * k;
    pos.x += this.vel.x * dt;
    pos.y += this.vel.y * dt;
    pos.z += this.vel.z * dt;
    world.resolveCircle(pos, 0.4, pos.y + 0.45, 1.05, false, 0);
    const g = this.groundAt(world, pos.x, pos.z, pos.y + 0.4);
    const minY = g - 0.55;
    if (pos.y < minY) { pos.y = minY; if (this.vel.y < 0) this.vel.y = 0; }
    const sp = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    this.swimM += sp * dt;
    this.underS += dt;

    // Surface when the body reaches the top.
    if (pos.y + 0.95 > WATER_Y - 0.45 && this.vel.y > -0.1 && !c.cHeld && this.stateT > 0.35) {
      this.vel.y = 0;
      this.enterSwim(p, true);
      return;
    }
    if (pos.y + 0.95 > WATER_Y - 0.3) { pos.y = WATER_Y - 1.25; if (this.vel.y > 0) this.vel.y = 0; }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3) this.turnToward(p, this.vel.x, this.vel.z, 4, dt);
    const moving = sp > 0.45;
    const targetPitch = moving ? clamp(Math.PI / 2 + Math.atan2(-this.vel.y, hs), 0.3, 2.9) : 0.35;
    this.ease(p, targetPitch, 0, 0, 3, dt);
    this.stroke += dt * (moving ? 1.6 + sp * 1.1 : 2);
    this.setPose(p, moving ? 'swim' : 'tread', 1, { phase: this.stroke, move: moving ? 1 : 0 });
    p.speed = hs;
    p.animSpeed = 0;
    p.animAirborne = false;
    p.vy = this.vel.y;
    this.prompts.push({ key: 'SPACE', text: 'Up' }, { key: 'C', text: 'Down' });
  }

  // ------------------------------------------------------------------ skydiving

  private enterFreefall(p: Player): void {
    const f = this.flight;
    f.speed = Math.hypot(this.vel.x, this.vel.z);
    f.vy = p.vy;
    f.yaw = p.yaw;
    f.bank = 0;
    f.open = 0;
    this.hooks.sound('whoosh');
    this.setState('freefall');
  }

  private flyMove(p: Player, dt: number, world: CollisionWorld): { g: number; deep: boolean; above: number } {
    const f = this.flight, pos = p.position;
    p.yaw = f.yaw;
    pos.x += Math.sin(f.yaw) * f.speed * dt;
    pos.z += Math.cos(f.yaw) * f.speed * dt;
    pos.y += f.vy * dt;
    const hit = world.resolveCircle(pos, 0.45, pos.y, 1.8);
    if (hit) f.speed *= 0.5;
    this.peakY = Math.max(this.peakY, pos.y);
    const g = this.groundAt(world, pos.x, pos.z, pos.y);
    const deep = g < WATER_Y - SWIM_ENTER_DEPTH;
    return { g, deep, above: pos.y - (deep ? WATER_Y : g) };
  }

  private freefall(p: Player, dt: number, c: Controls, world: CollisionWorld): void {
    const f = this.flight;
    stepFreefall(f, { fwd: c.fwd, turn: -c.side }, dt);
    const { g, deep, above } = this.flyMove(p, dt, world);
    p.vy = f.vy;
    this.vel.set(Math.sin(f.yaw) * f.speed, 0, Math.cos(f.yaw) * f.speed);
    if (deep && p.position.y <= WATER_Y) { this.enterWater(p, this.peakY - WATER_Y, f.vy, true); return; }
    if (!deep && p.position.y <= g) { p.position.y = g; this.land(p, this.peakY - g, f.speed, world); return; }
    if (above > 4) {
      this.prompts.push({ key: 'SPACE', text: 'Deploy parachute' });
      if (this.jumpBuffer > 0) {
        this.jumpBuffer = 0;
        f.open = 0;
        this.flare = 0;
        this.hooks.sound('deploy');
        this.hooks.shake(0.3);
        this.setState('parachute');
        return;
      }
    }
    this.ease(p, 1.3 + c.fwd * 0.35, -f.bank, 0, 3, dt);
    this.setPose(p, 'fall', 1, { move: 0.12 + Math.min(0.3, -f.vy / 150) });
    p.speed = f.speed;
    p.animSpeed = 0;
    p.animAirborne = true;
  }

  private parachute(p: Player, dt: number, c: Controls, world: CollisionWorld): void {
    const f = this.flight;
    const flare = c.spaceHeld && f.open > 0.6;
    this.flare += ((flare ? 1 : 0) - this.flare) * Math.min(1, dt * 5);
    stepParachute(f, { fwd: c.fwd, turn: -c.side, flare }, dt);
    const { g, deep, above } = this.flyMove(p, dt, world);
    p.vy = f.vy;
    this.vel.set(Math.sin(f.yaw) * f.speed, 0, Math.cos(f.yaw) * f.speed);
    if (c.c) {
      this.hooks.sound('cut');
      this.peakY = p.position.y;
      this.setState('freefall');
      return;
    }
    if (deep && p.position.y <= WATER_Y) { this.enterWater(p, 0, f.vy, false); return; }
    if (!deep && p.position.y <= g) {
      p.position.y = g;
      const impact = -f.vy;
      if (impact < 3.4) {
        p.speed = Math.min(f.speed, 5);
        this.landDip = 0.25;
        this.hooks.sound('land', 0.4);
        this.setState('ground');
        this.setPose(p, 'none');
      } else {
        this.land(p, (impact * impact) / 36 + 1, f.speed, world);
      }
      return;
    }
    this.prompts.push({ key: 'SPACE', text: above < 15 ? 'Flare to land' : 'Flare' }, { key: 'A/D', text: 'Steer' }, { key: 'C', text: 'Cut away' });
    this.ease(p, -0.12 * f.open - 0.2 * this.flare, -f.bank, 0, 3, dt);
    this.setPose(p, 'parachute', 1, { move: this.flare });
    p.speed = f.speed;
    p.animSpeed = 0;
    p.animAirborne = true;
  }

  // ------------------------------------------------------------------ camera

  private updateCamera(p: Player): void {
    const cam = this.cam;
    cam.extraDistance = 0;
    cam.fovBoost = 0;
    cam.minY = 0.4;
    cam.maxY = Infinity;
    switch (this.state) {
      case 'swim':
        cam.mode = 'swim'; cam.heightOffset = 1.35; cam.minY = WATER_Y + 0.35;
        break;
      case 'under': {
        cam.mode = 'underwater'; cam.heightOffset = 0.95;
        cam.minY = terrainHeight(p.position.x, p.position.z) + 0.35;
        cam.maxY = WATER_Y - 0.25;
        break;
      }
      case 'freefall':
        cam.mode = 'freefall'; cam.heightOffset = 1.2; cam.extraDistance = 2.5;
        cam.fovBoost = this.reducedMotion ? 0 : Math.min(14, -this.flight.vy * 0.3);
        break;
      case 'parachute':
        cam.mode = 'parachute'; cam.heightOffset = 2.4; cam.extraDistance = 4;
        break;
      case 'tumble':
      case 'getup':
        cam.mode = 'tumble'; cam.heightOffset = 0.9;
        break;
      default:
        cam.mode = this.crouched ? 'crouch' : 'foot';
        cam.heightOffset = this.crouched ? 1.15 : 1.55;
        if (this.depth > 0.2) cam.minY = WATER_Y + 0.35;
    }
  }
}

interface Controls {
  fwd: number;
  side: number;
  moving: boolean;
  sprint: boolean;
  space: boolean;
  spaceHeld: boolean;
  c: boolean;
  cHeld: boolean;
  mx: number;
  mz: number;
  camYaw: number;
}
