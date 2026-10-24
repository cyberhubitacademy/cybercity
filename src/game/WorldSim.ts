import * as THREE from 'three';
import { CityBuilder } from '../world/City';
import { Props } from '../world/Props';
import { Environment, Quality } from '../world/Environment';
import { Player } from '../actors/Player';
import { createRig, type Rig } from '../actors/CharacterModel';
import { VehicleEntry } from './VehicleEntry';
import { Shoreline } from '../world/Shoreline';

/** Daylight-only clock: the day loops between these hours (no sunset or night). */
export const DAY_START = 8;
export const DAY_END = 16.5;

/** Clamp any requested hour into bright daylight. */
export function daylight(h: number): number {
  const x = ((h % 24) + 24) % 24;
  return x >= DAY_START && x <= DAY_END ? x : x > DAY_END && x < 20 ? DAY_END - 0.5 : 11;
}
import { Pedestrians } from '../actors/Pedestrians';
import { Vehicle, VEHICLE_DEFS, VehicleKind, headMat, tailMat } from '../vehicles/Vehicle';
import { Traffic, separateVehicles } from '../vehicles/Traffic';
import { CameraRig } from './CameraRig';
import { Input } from './Input';
import { PARKED } from '../world/spots';
import { PLACES, districtAt, DISTRICTS, DistrictId } from '../world/layout';

// The simulated open world: city, lighting, player on foot or in a vehicle,
// parked vehicles, traffic and pedestrians. Gameplay layers (missions, UI,
// scripts) sit on top and talk to it through this class.

export interface WorldEvents {
  onEnterVehicle?: (v: Vehicle) => void;
  onExitVehicle?: (v: Vehicle) => void;
  onCrash?: (strength: number) => void;
  onPlayerHit?: (damage: number) => void;
  onDistrict?: (id: DistrictId) => void;
  onHijack?: (v: Vehicle) => void;
}

export class WorldSim {
  readonly scene = new THREE.Scene();
  readonly city = new CityBuilder();
  readonly props: Props;
  readonly env: Environment;
  readonly player: Player;
  readonly peds: Pedestrians;
  readonly traffic: Traffic;
  readonly rig: CameraRig;
  readonly shoreline: Shoreline;
  readonly vehicles: Vehicle[] = [];
  vehicle: Vehicle | null = null;
  hour = 9.5;
  /** Game minutes per real second (12-minute day). */
  timeScale = 2;
  time = 0;
  private district: DistrictId | null = null;
  carSpeedMult = 1;
  events: WorldEvents = {};

  constructor(renderer: THREE.WebGLRenderer, readonly camera: THREE.PerspectiveCamera, quality: Quality) {
    this.city.build();
    this.props = new Props(this.city);
    this.props.build();
    this.scene.add(this.city.group);
    this.env = new Environment(this.scene, renderer, quality);
    this.shoreline = new Shoreline(this.scene);
    this.player = new Player(this.scene);
    this.rig = new CameraRig(camera, this.city.collision);
    this.peds = new Pedestrians(this.scene, this.city.blocks, this.city.collision, quality === 'low' ? 18 : quality === 'medium' ? 30 : 44);
    this.traffic = new Traffic(this.scene, this.city.collision, quality === 'low' ? 14 : quality === 'medium' ? 22 : 30);
    for (const p of PARKED) this.spawnVehicle(p.kind as VehicleKind, p.x, p.z, p.yaw);
    const s = PLACES.spawn;
    this.player.place(s.x, s.z, -Math.PI / 2);
    this.rig.snapTo(this.player.position, Math.PI / 2);
    this.peds.spawnAround(this.player.position);
    this.traffic.spawnAround(this.player.position);
  }

  spawnVehicle(kind: VehicleKind, x: number, z: number, yaw: number, color?: string): Vehicle {
    const v = new Vehicle(VEHICLE_DEFS[kind], color);
    v.place(x, z, yaw);
    v.onImpact = (s) => { if (this.vehicle === v) this.events.onCrash?.(s); };
    this.scene.add(v.root);
    this.vehicles.push(v);
    return v;
  }

  removeVehicle(v: Vehicle): void {
    if (this.vehicle === v) this.exitVehicle();
    this.scene.remove(v.root);
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
    this.traffic.release(v);
  }

  /** Closest enterable (non-AI) vehicle within range. */
  nearestVehicle(range = 3.6): Vehicle | null {
    let best: Vehicle | null = null, bd = range;
    for (const v of this.vehicles) {
      if (this.traffic.isAi(v)) continue;
      const d = v.position.distanceTo(this.player.position) - v.def.width * 0.3;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  /** Closest AI traffic car the player can hijack (moving or not). */
  nearestTraffic(range = 4.5): Vehicle | null {
    let best: Vehicle | null = null, bd = range;
    for (const v of this.traffic.cars) {
      if (!this.traffic.isAi(v) || v.def.kind === 'boat') continue;
      const d = v.position.distanceTo(this.player.position) - v.def.width * 0.3;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  private ejected: { rig: Rig; vel: THREE.Vector3; t: number; tumble: number }[] = [];
  /** Animated door / climb-in / carjack sequences. */
  readonly entry = new VehicleEntry();

  /** Walk to the door, open it, climb in, close it, then drive. */
  requestEnter(v: Vehicle): void {
    if (this.entry.busy || this.vehicle) return;
    v.driver = 'player';
    this.entry.start('enter', v, this.player.position, () => this.enterVehicle(v));
  }

  /** Open the door, climb out, close it. */
  requestExit(): void {
    const v = this.vehicle;
    if (!v || this.entry.busy) return;
    if (Math.abs(v.speed) > 6) { this.exitVehicle(); return; } // bail out of a moving car
    const seat = this.entry.toWorld(v, this.entry.seatLocal(v));
    this.vehicle = null; // stop driving input during the animation
    this.player.place(seat.x, seat.z, v.yaw);
    this.player.position.y = seat.y;
    this.player.active = false;
    this.player.rig.root.visible = true;
    this.entry.start('exit', v, seat, () => {
      this.vehicle = v;
      this.exitVehicle(this.entry.toWorld(v, this.entry.doorLocal(v)));
    });
  }

  /**
   * GTA-style carjack: the car stops dead, the driver is pulled out and thrown
   * onto the road (tumbles, then runs away), and the player takes the wheel.
   */
  hijack(v: Vehicle): void {
    this.traffic.release(v);
    v.velocity.multiplyScalar(0.15);
    v.speed *= 0.15;
    if (!this.vehicles.includes(v)) this.vehicles.push(v);
    v.onImpact = (s) => { if (this.vehicle === v) this.events.onCrash?.(s); };
    const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    const rig = createRig({ shirt: '#e8e8f0', pants: '#2b3a55', skin: '#d9a27a', hair: '#2b2b2b' }, { female: Math.random() < 0.4 });
    rig.root.visible = false;
    this.scene.add(rig.root);
    v.driver = 'player';
    this.events.onHijack?.(v);
    // open the door, drag the driver out, throw them, climb in, close the door
    this.entry.start('jack', v, this.player.position, () => this.enterVehicle(v), rig);
    this.pendingThrow = { rig, side };
  }

  private pendingThrow: { rig: Rig; side: THREE.Vector3 } | null = null;

  private updateEjected(dt: number): void {
    // When the jack sequence has pulled the driver to the door, throw them onto the road.
    if (this.pendingThrow && this.pendingThrow.rig.root.visible && !this.ejected.some((e) => e.rig === this.pendingThrow?.rig)) {
      const { rig, side } = this.pendingThrow;
      const v = this.vehicles.find((c) => c.driver === 'player');
      const door = v ? this.entry.toWorld(v, this.entry.doorLocal(v)) : null;
      if (door && rig.root.position.distanceTo(door) < 0.3) {
        this.ejected.push({ rig, vel: side.clone().multiplyScalar(4.5).setY(2.6), t: 0, tumble: 0.9 });
        this.pendingThrow = null;
      }
    }
    for (let i = this.ejected.length - 1; i >= 0; i--) {
      const e = this.ejected[i];
      e.t += dt;
      const p = e.rig.root.position;
      if (e.tumble > 0) {
        // thrown out: fly a little, hit the asphalt, roll
        e.tumble -= dt;
        e.vel.y -= 18 * dt;
        p.addScaledVector(e.vel, dt);
        if (p.y < 0) { p.y = 0; e.vel.y = 0; e.vel.multiplyScalar(0.6); }
        e.rig.body.rotation.x = Math.min(1.4, e.t * 4);
        e.rig.animate(dt, 0, true);
      } else {
        // get up and run away from the player
        e.rig.body.rotation.x *= 0.85;
        const away = p.clone().sub(this.player.position).setY(0).normalize();
        p.addScaledVector(away, 5.5 * dt);
        e.rig.body.rotation.y = Math.atan2(away.x, away.z);
        e.rig.animate(dt, 5.5);
      }
      this.city.collision.resolveCircle(p, 0.35, p.y, 1.7);
      if (e.t > 9) {
        this.scene.remove(e.rig.root);
        this.ejected.splice(i, 1);
      }
    }
  }

  enterVehicle(v: Vehicle): void {
    this.vehicle = v;
    v.driver = 'player';
    v.speedMult = this.carSpeedMult;
    this.player.active = false;
    this.player.sync();
    this.events.onEnterVehicle?.(v);
  }

  exitVehicle(at?: THREE.Vector3): void {
    const v = this.vehicle;
    if (!v) return;
    v.driver = null;
    v.controls = { throttle: 0, steer: 0, handbrake: true };
    const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)); // driver's left
    const exit = v.position.clone().addScaledVector(side, v.def.width / 2 + 0.9);
    const waterCraft = ['boat', 'jetski', 'kayak', 'airboat'].includes(v.def.kind);
    if (waterCraft) {
      // step off onto the nearest pier/shore point
      exit.set(Math.min(exit.x, 236), 0, Math.min(exit.z, 210));
    }
    if (at && !waterCraft) exit.copy(at);
    // bailing out of a helicopter keeps the altitude (skydiving)
    this.player.place(exit.x, exit.z, v.yaw, v.def.kind === 'heli' ? v.position.y : 0);
    this.player.active = true;
    this.vehicle = null;
    this.events.onExitVehicle?.(v);
  }

  get focus(): THREE.Vector3 {
    return this.vehicle ? this.vehicle.position : this.player.position;
  }

  /** Advance the world one frame. `controlsEnabled` false while UI screens are open. */
  update(dt: number, input: Input, controlsEnabled: boolean): void {
    this.time += dt;
    this.hour += (dt * this.timeScale) / 60;
    if (this.hour > DAY_END || this.hour < DAY_START) this.hour = DAY_START;

    const v = this.vehicle;
    if (this.entry.busy) {
      this.entry.update(dt, this.player.rig, this.player.position);
    } else if (v) {
      v.controls.throttle = controlsEnabled ? input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']) : 0;
      v.controls.steer = controlsEnabled ? input.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']) : 0;
      v.controls.handbrake = controlsEnabled && input.isDown('Space');
      v.update(dt, this.city.collision);
    } else if (controlsEnabled) {
      this.player.update(dt, input, this.rig.yaw, this.city.collision);
    } else {
      this.player.rig.animate(dt, 0);
    }

    // parked/idle vehicles coast to a stop
    for (const pv of this.vehicles) {
      if (pv === v || this.traffic.isAi(pv)) continue;
      if (pv.velocity.lengthSq() > 0.01) {
        pv.controls = { throttle: 0, steer: 0, handbrake: true };
        pv.update(dt, this.city.collision);
      }
    }

    const focus = this.focus;
    const obstacles = [this.player.active ? this.player.position : focus, ...this.peds.positions()];
    const all = [...this.vehicles, ...this.traffic.cars];
    this.traffic.update(dt, focus, obstacles, all);
    separateVehicles(all, (a, b, s) => {
      if ((a === v || b === v) && s > 3) this.events.onCrash?.(s / 14);
    });

    // AI cars clipping the player on foot
    if (this.player.active) {
      for (const c of all) {
        if (c === v) continue;
        const d = c.position.distanceTo(this.player.position);
        const spd = c.velocity.length();
        if (d < c.def.width * 0.6 + 0.5 && spd > 4) {
          const dir = this.player.position.clone().sub(c.position).setY(0).normalize();
          this.player.hit(dir, spd * 0.9);
          this.events.onPlayerHit?.(Math.min(60, spd * 2.2));
          c.velocity.multiplyScalar(0.6);
        }
      }
    }

    this.updateEjected(dt);
    const threats = all.map((c) => ({ pos: c.position, vel: c.velocity }));
    this.peds.update(dt, focus, threats);

    // seated driver shown inside convertibles/bikes/boats
    if (v && !this.entry.busy) {
      this.entry.seat(v, this.player.rig, dt);
      this.player.rig.root.visible = !this.rig.firstPerson;
    }

    this.rig.update(
      dt, focus,
      controlsEnabled ? input.mouseDX : 0, controlsEnabled ? input.mouseDY : 0, controlsEnabled ? input.wheel : 0,
      v ? { yaw: v.yaw, speed: Math.abs(v.speed), length: v.def.length, height: v.height } : null,
    );
    if (!this.vehicle) this.player.hiddenForCamera = this.rig.firstPerson;
    this.env.update(this.hour, focus, this.time);
    this.shoreline.update(this.time, this.env.sunDir, focus, Math.min(1, this.env.sun.intensity / 3));

    // night lighting
    const night = this.env.night;
    for (const n of this.city.nightLit) {
      const val = n.day + (n.night - n.day) * night;
      if (n.kind === 'emissive') (n.material as THREE.MeshStandardMaterial).emissiveIntensity = val;
      else (n.material as THREE.MeshBasicMaterial).color.setScalar(val);
    }
    headMat.emissiveIntensity = 0.4 + night * 4;
    tailMat.emissiveIntensity = 0.6 + night * 2;
    for (const a of this.city.animated) a(this.time);
    this.props.update(this.time, night);

    const d = districtAt(focus.x, focus.z);
    if (d !== this.district) {
      this.district = d;
      this.events.onDistrict?.(d);
    }
  }

  get districtName(): string {
    return this.district ? DISTRICTS[this.district].name : '';
  }
}
