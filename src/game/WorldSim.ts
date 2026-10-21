import * as THREE from 'three';
import { CityBuilder } from '../world/City';
import { Props } from '../world/Props';
import { Environment, Quality } from '../world/Environment';
import { Player } from '../actors/Player';
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
    this.player = new Player(this.scene);
    this.rig = new CameraRig(camera, this.city.collision);
    this.peds = new Pedestrians(this.scene, this.city.blocks, this.city.collision, quality === 'low' ? 18 : 30);
    this.traffic = new Traffic(this.scene, this.city.collision, quality === 'low' ? 14 : 22);
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

  enterVehicle(v: Vehicle): void {
    this.vehicle = v;
    v.driver = 'player';
    v.speedMult = this.carSpeedMult;
    this.player.active = false;
    this.player.sync();
    this.events.onEnterVehicle?.(v);
  }

  exitVehicle(): void {
    const v = this.vehicle;
    if (!v) return;
    v.driver = null;
    v.controls = { throttle: 0, steer: 0, handbrake: true };
    const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)); // driver's left
    const exit = v.position.clone().addScaledVector(side, v.def.width / 2 + 0.9);
    if (v.def.kind === 'boat') {
      // step off onto the nearest pier/shore point
      exit.set(Math.min(exit.x, 236), 0, Math.min(exit.z, 210));
    }
    this.player.place(exit.x, exit.z, v.yaw);
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
    this.hour = (this.hour + (dt * this.timeScale) / 60) % 24;

    const v = this.vehicle;
    if (v) {
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

    const threats = all.map((c) => ({ pos: c.position, vel: c.velocity }));
    this.peds.update(dt, focus, threats);

    // seated driver shown inside convertibles/bikes/boats
    if (v) this.player.rig.animate(dt, 0, false, true);

    this.rig.update(
      dt, focus,
      controlsEnabled ? input.mouseDX : 0, controlsEnabled ? input.mouseDY : 0, controlsEnabled ? input.wheel : 0,
      v ? { yaw: v.yaw, speed: Math.abs(v.speed) } : null,
    );
    this.env.update(this.hour, focus, this.time);

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
