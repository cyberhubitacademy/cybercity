import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import type { Rig } from '../../actors/CharacterModel';
import { Vehicle, VEHICLE_DEFS, type Look, type VehicleKind } from '../../vehicles/Vehicle';
import { FINISHES, type Finish } from '../../vehicles/materials';
import { FX_CAPS, Particles, SkidMarks, type FxQuality } from '../../vehicles/fx';
import { UPGRADE_MAX, repairCost } from '../../vehicles/physics';
import {
  DEALER_CATALOG, GARAGE_CAPACITY, LEVEL_NAMES, PRICES, UPGRADE_LABELS, buyUpgrade, buyVehicle, catalogEntry, defaultLook, emptySave,
  isWaterOrAir, pruneTrunks, registerVehicle, resprayPrice, sanitizeSave, sellValue, trunkAdd, trunkRemove, upgradePrice,
  type GarageSave, type LevelKey, type OwnedVehicle, type TrunkItem,
} from './logic';
import {
  BOAT_DELIVERY, HELIPAD, NEON_CUSTOMS, OCEAN_MOTORS, PARKING_BAYS, SAFEHOUSE,
  buildHelipad, buildNeonCustoms, buildOceanMotors, buildSafehouse,
} from './buildings';
import { MENU_CLOSE, ensureStyles, money, openMenu, pickColor, type MenuItem } from './ui';

// VEHICLES+ core ("garage" system): extra vehicle spawns (water craft, bikes,
// helicopter), helipad elevator, vehicle FX (skid marks, dust, spray, smoke,
// exhaust, nitro), real headlights (L), nitro (N), the K interaction menu
// (doors, hood, trunk storage), Neon Customs, Ocean Motors, the safehouse
// garage with saved personal vehicles, and passenger seating.

export interface QuickAction {
  id: string;
  label: string;
  available: () => boolean;
  run: () => void;
}

export interface TrunkHandle {
  readonly key: string;
  list(): TrunkItem[];
  add(id: string, name: string, qty?: number): void;
  remove(id: string, qty?: number): number;
  cash(): number;
  addCash(n: number): void;
}

const PALETTE = [
  '#ff2fa0', '#ff4d6d', '#ff8a3d', '#ffd23f', '#3dffb0', '#19e6ff', '#2f6bff', '#7b2cff',
  '#b14dff', '#ffffff', '#c8c8d0', '#3a3a4a', '#111114', '#9ff0e0', '#ffb3c7', '#c94f3d',
];

interface ExtraSpawn { key: string; kind: VehicleKind; x: number; z: number; yaw: number; y?: number }

/** Parked VEHICLES+ spawns (water craft on the beach, bikes in Old Town / campus, heli on the HQ roof). */
export const EXTRA_SPAWNS: ExtraSpawn[] = [
  { key: 'jetski-a', kind: 'jetski', x: 245, z: -60, yaw: Math.PI / 2 },
  { key: 'jetski-b', kind: 'jetski', x: 250, z: 30, yaw: Math.PI / 2 },
  { key: 'airboat-a', kind: 'airboat', x: 247, z: 4, yaw: Math.PI / 2 },
  { key: 'kayak-a', kind: 'kayak', x: 242.5, z: -36, yaw: Math.PI / 2 },
  { key: 'kayak-b', kind: 'kayak', x: 243, z: 44, yaw: Math.PI / 2 },
  { key: 'bicycle-oldtown', kind: 'bicycle', x: -118, z: -0.6, yaw: Math.PI / 2 },
  { key: 'bicycle-campus', kind: 'bicycle', x: -128, z: -170.6, yaw: Math.PI / 2 },
  { key: 'bicycle-beach', kind: 'bicycle', x: 178, z: 10, yaw: 0 },
  { key: 'dirtbike-beach', kind: 'dirtbike', x: 205, z: -12, yaw: 0 },
  { key: 'dirtbike-industrial', kind: 'dirtbike', x: -248, z: 184, yaw: Math.PI / 2 },
  { key: 'police-downtown', kind: 'police', x: 84.6, z: -50, yaw: 0 },
  { key: 'pickup-harbor', kind: 'pickup', x: 32, z: 190, yaw: Math.PI },
  { key: 'heli-hq', kind: 'heli', x: HELIPAD.x, z: HELIPAD.z, yaw: Math.PI / 2, y: HELIPAD.y },
];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

class VehiclesPlus implements GameSystem {
  readonly id = 'garage';
  private ctx!: SystemContext;
  private built = false;
  private save: GarageSave = emptySave();
  private owned = new Map<string, Vehicle>();
  private extras = new Map<string, Vehicle>();
  private skids: SkidMarks | null = null;
  private smoke: Particles | null = null;
  private glow: Particles | null = null;
  private marks = new Map<Vehicle, { pts: Float32Array; on: boolean[] }>();
  private lights: THREE.SpotLight[] = [];
  private lightCones: THREE.Mesh[] = [];
  private updaters: ((t: number, dt: number) => void)[] = [];
  private quick: QuickAction[] = [];
  private takeHandlers: ((item: TrunkItem, qty: number) => boolean)[] = [];
  private passengers: { rig: Rig; vehicle: Vehicle }[] = [];
  private lastVehicle: Vehicle | null = null;
  private riderTilted = false;
  private airExit: { v: Vehicle; t: number } | null = null;
  private latchCustoms = false;
  private latchStore = false;
  private orbit: { v: Vehicle; t: number } | null = null;
  private time = 0;
  private syncT = 0;
  private hud: { root: HTMLElement; health: HTMLElement; healthBar: HTMLElement; nitro: HTMLElement; nitroBar: HTMLElement; info: HTMLElement; hint: HTMLElement } | null = null;
  private heliHintShown = false;
  private legBones: { l: THREE.Object3D | null; r: THREE.Object3D | null; lk: THREE.Object3D | null; rk: THREE.Object3D | null } | null = null;

  // ------------------------------------------------------------------ lifecycle

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    if (!this.built) {
      this.built = true;
      try { this.buildOnce(); } catch (err) { console.error('[garage] build failed', err); }
    }
    this.save = sanitizeSave(ctx.getData('garage', null));
    this.spawnExtras();
    this.respawnOwned();
    this.registerInteractions();
  }

  private buildOnce(): void {
    const ctx = this.ctx;
    const col = ctx.world.city.collision;
    const customs = buildNeonCustoms(ctx.scene, col);
    const dealer = buildOceanMotors(ctx.scene, col);
    buildSafehouse(ctx.scene, col);
    const pad = buildHelipad(ctx.scene);
    this.updaters.push((t) => customs.update(t), (t, dt) => dealer.update(t, dt), (t) => pad.update(t));
    const q = (ctx.settings().quality as FxQuality) ?? 'high';
    const caps = FX_CAPS[q] ?? FX_CAPS.high;
    this.skids = new SkidMarks(caps.skids);
    this.smoke = new Particles(caps.particles, false);
    this.glow = new Particles(caps.glow, true);
    ctx.scene.add(this.skids.mesh, this.smoke.points, this.glow.points);
    // two real headlight beams, only ever used on the player's vehicle
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight('#fff1d0', 0, 70, 0.42, 0.55, 1.1);
      s.castShadow = false;
      ctx.scene.add(s, s.target);
      this.lights.push(s);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.6, 14, 18, 1, true).translate(0, -7, 0).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      cone.visible = false;
      ctx.scene.add(cone);
      this.lightCones.push(cone);
    }
    ctx.markers.addCheckpoint('garage-customs-bay', NEON_CUSTOMS.bayX, NEON_CUSTOMS.bayZ, 3.2, '#ff2fa0');
    ctx.markers.addCheckpoint('garage-safehouse-bay', SAFEHOUSE.storeX, SAFEHOUSE.storeZ, 2.6, '#19e6ff');
    this.buildHud();
  }

  private persist(): void {
    pruneTrunks(this.save);
    this.ctx.setData('garage', JSON.parse(JSON.stringify(this.save)));
  }

  // ------------------------------------------------------------------ spawning

  private spawnExtras(): void {
    const w = this.ctx.world;
    for (const s of EXTRA_SPAWNS) {
      const cur = this.extras.get(s.key);
      if (cur && (w.vehicles.includes(cur) || w.vehicle === cur)) continue;
      try {
        const v = w.spawnVehicle(s.kind, s.x, s.z, s.yaw);
        if (s.y !== undefined) v.place(s.x, s.z, s.yaw, s.y);
        this.hook(v);
        this.extras.set(s.key, v);
      } catch (err) {
        console.warn('[garage] spawn failed', s.key, err);
      }
    }
  }

  private respawnOwned(): void {
    const w = this.ctx.world;
    for (const [, v] of this.owned) if (w.vehicle !== v) w.removeVehicle(v);
    this.owned.clear();
    for (const o of this.save.owned) if (!o.stored) this.spawnOwned(o);
  }

  private deliverySpot(kind: VehicleKind): { x: number; z: number; yaw: number; y?: number } {
    const w = this.ctx.world;
    const free = (x: number, z: number, r: number) => !w.vehicles.some((v) => Math.hypot(v.position.x - x, v.position.z - z) < r);
    if (kind === 'heli') {
      if (free(HELIPAD.x, HELIPAD.z, 5)) return { x: HELIPAD.x, z: HELIPAD.z, yaw: Math.PI / 2, y: HELIPAD.y };
      return { x: HELIPAD.x + 12, z: HELIPAD.z, yaw: Math.PI / 2, y: HELIPAD.y };
    }
    if (isWaterOrAir(kind)) {
      for (let i = 0; i < 8; i++) {
        const z = BOAT_DELIVERY.z - i * 8;
        if (free(BOAT_DELIVERY.x, z, 5)) return { x: BOAT_DELIVERY.x, z, yaw: BOAT_DELIVERY.yaw };
      }
      return BOAT_DELIVERY;
    }
    for (const b of PARKING_BAYS) if (free(b.x, b.z, 2.4)) return b;
    return { x: SAFEHOUSE.doorX, z: SAFEHOUSE.doorZ - 2, yaw: -Math.PI / 2 };
  }

  private spawnOwned(o: OwnedVehicle): Vehicle | null {
    try {
      const spot = this.deliverySpot(o.kind);
      const v = this.ctx.world.spawnVehicle(o.kind, spot.x, spot.z, spot.yaw, o.look.color);
      if (spot.y !== undefined) v.place(spot.x, spot.z, spot.yaw, spot.y);
      v.tag = o.id;
      v.applyLook(o.look);
      v.setUpgrades(o.upgrades);
      v.health = Math.max(1, o.health * v.maxHealth);
      this.hook(v);
      this.owned.set(o.id, v);
      return v;
    } catch (err) {
      console.warn('[garage] owned spawn failed', o.id, err);
      return null;
    }
  }

  /** FX hooks for a vehicle we manage. */
  private hook(v: Vehicle): void {
    v.onDamage = (amt, x, z) => this.sparks(x, v.position.y + 0.6, z, Math.min(18, 3 + amt * 0.2));
  }

  private ownedRecord(v: Vehicle | null): OwnedVehicle | undefined {
    return v?.tag ? this.save.owned.find((o) => o.id === v.tag) : undefined;
  }

  // ------------------------------------------------------------------ interactions

  private registerInteractions(): void {
    const ctx = this.ctx, w = ctx.world;
    ctx.interactions.set({
      id: 'garage-elev-up', x: HELIPAD.lobbyX, z: HELIPAD.lobbyZ, radius: 2.4, priority: 2,
      title: 'Take elevator to helipad', desc: 'Sunset Shield rooftop · helicopter',
      enabled: () => !w.vehicle && w.player.position.y < 3,
      action: () => void this.elevator(true),
    });
    ctx.interactions.set({
      id: 'garage-elev-down', x: HELIPAD.liftX, z: HELIPAD.liftZ, radius: 2.6, priority: 2,
      title: 'Take elevator to lobby', desc: 'Back down to the HQ lobby',
      enabled: () => !w.vehicle && w.player.position.y > 30,
      action: () => void this.elevator(false),
    });
    ctx.interactions.set({
      id: 'garage-dealer', x: OCEAN_MOTORS.x0 + 11, z: (OCEAN_MOTORS.z0 + OCEAN_MOTORS.z1) / 2, radius: 4, priority: 1,
      title: 'Browse Ocean Motors', desc: 'Buy cars, bikes, boats and a helicopter',
      enabled: () => !w.vehicle,
      action: () => void this.openDealer(),
    });
    ctx.interactions.set({
      id: 'garage-safehouse', x: SAFEHOUSE.doorX, z: SAFEHOUSE.doorZ, radius: 3.4, priority: 1,
      title: 'Safehouse Garage', desc: 'Take out or return your personal vehicles',
      enabled: () => !w.vehicle,
      action: () => void this.openSafehouse(),
    });
    ctx.interactions.set({
      id: 'garage-customs', x: NEON_CUSTOMS.x0 - 1, z: NEON_CUSTOMS.bayZ, radius: 5, priority: 0,
      title: 'Neon Customs', desc: 'Drive a car into the pink ring to customize it',
      enabled: () => !w.vehicle,
      action: () => ctx.notify('[y]Neon Customs[/y]: drive a car or bike onto the pink turntable to repaint, tune and repair it.', 'info'),
    });
  }

  private async elevator(up: boolean): Promise<void> {
    const ctx = this.ctx, w = ctx.world;
    ctx.sfx('door');
    await ctx.ui.fade(true);
    if (up) {
      w.player.place(HELIPAD.liftX, HELIPAD.liftZ - 1.2, Math.PI);
      w.player.position.y = HELIPAD.y;
      w.player.sync();
      ctx.notify('Helipad. The [y]Skylark[/y] is fueled: W/S collective, A/D yaw, arrow keys pitch & roll.', 'info');
    } else {
      w.player.place(HELIPAD.lobbyX + 1.5, HELIPAD.lobbyZ, Math.PI / 2);
    }
    w.rig.snapTo(w.player.position);
    await ctx.ui.fade(false);
  }

  // ------------------------------------------------------------------ public API

  /** Trunk storage of a vehicle (by Vehicle, Vehicle.id, or personal vehicle id). */
  trunk(vehicle: Vehicle | number | string): TrunkHandle {
    const key = typeof vehicle === 'string' ? vehicle : typeof vehicle === 'number' ? this.keyForId(vehicle) : this.trunkKey(vehicle);
    const save = () => this.persist();
    const s = this.save;
    return {
      key,
      list: () => (s.trunks[key] ?? []).map((i) => ({ ...i })),
      add: (id, name, qty = 1) => { trunkAdd(s, key, { id, name }, qty); save(); },
      remove: (id, qty = 1) => { const n = trunkRemove(s, key, id, qty); if (n) save(); return n; },
      cash: () => s.cash[key] ?? 0,
      addCash: (n) => { s.cash[key] = Math.max(0, (s.cash[key] ?? 0) + Math.floor(n)); if (!s.cash[key]) delete s.cash[key]; save(); },
    };
  }

  /** Other systems: accept items taken out of a trunk (return true if taken). */
  addTrunkTakeHandler(fn: (item: TrunkItem, qty: number) => boolean): void {
    this.takeHandlers.push(fn);
  }

  /** A context action run directly by K when available (e.g. "Start race"). */
  registerQuickAction(a: QuickAction): void {
    this.removeQuickAction(a.id);
    this.quick.push(a);
  }

  removeQuickAction(id: string): void {
    this.quick = this.quick.filter((q) => q.id !== id);
  }

  /** Seat a companion rig in the passenger seat of `vehicle` (default: the player's). */
  seatPassenger(rig: Rig, vehicle?: Vehicle): boolean {
    const v = vehicle ?? this.ctx.world.vehicle;
    if (!v || !v.def.passengerSeat) return false;
    this.unseatPassenger(rig);
    if (rig.root.parent !== this.ctx.scene) this.ctx.scene.add(rig.root);
    this.passengers.push({ rig, vehicle: v });
    rig.root.visible = true;
    return true;
  }

  /** Take a seated companion out (stands beside the passenger door). */
  unseatPassenger(rig: Rig): void {
    const i = this.passengers.findIndex((p) => p.rig === rig);
    if (i < 0) return;
    const v = this.passengers[i].vehicle;
    this.passengers.splice(i, 1);
    rig.root.quaternion.identity();
    const off = v.def.width / 2 + 0.9;
    rig.root.position.set(v.position.x - Math.cos(v.yaw) * off, Math.max(0, v.position.y), v.position.z + Math.sin(v.yaw) * off);
    rig.body.rotation.y = v.yaw;
  }

  passengerOf(v: Vehicle): Rig | null {
    return this.passengers.find((p) => p.vehicle === v)?.rig ?? null;
  }

  /** Personal vehicles (read-only copy). */
  ownedVehicles(): OwnedVehicle[] {
    return this.save.owned.map((o) => ({ ...o, look: { ...o.look }, upgrades: { ...o.upgrades } }));
  }

  /** Minimap blips the integrator can merge into the map. */
  blips(): { x: number; z: number; kind: 'shop' | 'place' | 'vehicle'; color: string; label: string }[] {
    const out: { x: number; z: number; kind: 'shop' | 'place' | 'vehicle'; color: string; label: string }[] = [
      { x: NEON_CUSTOMS.bayX, z: NEON_CUSTOMS.bayZ, kind: 'shop', color: '#ff2fa0', label: 'Neon Customs' },
      { x: OCEAN_MOTORS.x0 + 11, z: (OCEAN_MOTORS.z0 + OCEAN_MOTORS.z1) / 2, kind: 'shop', color: '#19e6ff', label: 'Ocean Motors' },
      { x: SAFEHOUSE.doorX, z: SAFEHOUSE.doorZ, kind: 'place', color: '#3dffb0', label: 'Safehouse Garage' },
      { x: HELIPAD.lobbyX, z: HELIPAD.lobbyZ, kind: 'place', color: '#ffd23f', label: 'Helipad elevator' },
    ];
    for (const [, v] of this.owned) if (v !== this.ctx.world.vehicle) out.push({ x: v.position.x, z: v.position.z, kind: 'vehicle', color: '#3dffb0', label: `Your ${v.def.name}` });
    return out;
  }

  private trunkKey(v: Vehicle): string {
    return v.tag ?? `veh-${v.id}`;
  }

  private keyForId(id: number): string {
    const v = [...this.ctx.world.vehicles, ...this.ctx.world.traffic.cars].find((x) => x.id === id);
    return v ? this.trunkKey(v) : `veh-${id}`;
  }

  // ------------------------------------------------------------------ frame

  update(dt: number, ctx: SystemContext): void {
    this.time += dt;
    const w = ctx.world;
    const v = w.vehicle;
    if (this.lastVehicle && this.lastVehicle !== v) this.onExited(this.lastVehicle);
    if (v && v !== this.lastVehicle) this.onEntered(v);
    this.lastVehicle = v;
    const inp = ctx.input;
    if (v) {
      v.nitroActive = inp.isDown('KeyN') && v.upgrades.nitro;
      if (inp.wasPressed('KeyN') && !v.upgrades.nitro) ctx.notify('No nitro installed. Fit a kit at [y]Neon Customs[/y] on Ocean Drive.', 'info');
      v.leanBack = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
      if (v.medium === 'air') {
        v.flight = {
          lift: inp.axis(['KeyS'], ['KeyW']),
          yaw: inp.axis(['KeyD'], ['KeyA']),
          pitch: inp.axis(['ArrowDown'], ['ArrowUp']),
          roll: inp.axis(['ArrowLeft'], ['ArrowRight']),
        };
        if (!this.heliHintShown) {
          this.heliHintShown = true;
          ctx.notify('Helicopter: ~W~/~S~ climb/descend, ~A~/~D~ yaw, arrow keys pitch & roll. Land on any roof. Exit midair to skydive.', 'info');
        }
      }
      if (inp.wasPressed('KeyL') && v.medium !== 'water' && !v.def.pedal) {
        v.lightsOn = !v.lightsOn;
        ctx.sfx('click');
      }
      if (inp.wasPressed('KeyK')) this.onK(v);
      this.zones(v);
    } else {
      if (inp.wasPressed('KeyK')) {
        const near = w.nearestVehicle(4.5);
        const qa = this.quick.find((q) => q.available());
        if (qa) qa.run();
        else if (near) void this.vehicleMenu(near, false);
      }
      this.latchCustoms = false;
      this.latchStore = false;
    }
    if (this.airExit) {
      const a = this.airExit;
      a.t += dt;
      if (w.player.active && !w.vehicle) {
        if (a.v.position.y > 3 && w.player.position.y < a.v.position.y - 2) {
          w.player.position.y = a.v.position.y - 0.8;
          w.player.sync();
        }
        this.airExit = null;
      } else if (a.t > 6 || w.vehicle) this.airExit = null;
    }
    this.nudgeUnattended();
    this.updateFx(dt);
    this.updateLights();
    this.syncT += dt;
    if (this.syncT > 3) {
      this.syncT = 0;
      this.syncOwned();
    }
    for (const u of this.updaters) u(this.time, dt);
  }

  always(dt: number, ctx: SystemContext): void {
    // rider & passengers are placed every frame (also while the world is paused)
    this.updateRider(dt);
    this.updatePassengers(dt);
    if (this.orbit) {
      const o = this.orbit;
      o.t += dt * 0.35;
      const v = o.v;
      const r = Math.min(5.6, 3.2 + v.def.length * 0.45);
      ctx.camera.position.set(v.position.x + Math.cos(o.t) * r, v.position.y + 1.9, v.position.z + Math.sin(o.t) * r);
      ctx.camera.lookAt(v.position.x, v.position.y + 0.8, v.position.z);
    }
    this.updateHud();
  }

  private onEntered(v: Vehicle): void {
    v.dentable = true;
    const seatedPassenger = this.passengers.find((p) => p.vehicle === v);
    if (seatedPassenger) v.setPanel('doorR', false);
  }

  private onExited(v: Vehicle): void {
    v.nitroActive = false;
    v.leanBack = false;
    v.lightsOn = false;
    const w = this.ctx.world;
    // keep altitude when bailing out of a helicopter (skydive): applied once the
    // core exit sequence has put Rico back on foot
    if (v.medium === 'air' && v.position.y > 3) this.airExit = { v, t: 0 };
    // reset the rider pose we applied
    const rig = w.player.rig;
    rig.root.quaternion.identity();
    this.riderTilted = false;
    w.player.sync();
    this.syncOwned();
  }

  private onK(v: Vehicle): void {
    const qa = this.quick.find((q) => q.available());
    if (qa) { qa.run(); return; }
    void this.vehicleMenu(v, true);
  }

  /** Drive-in zones: Neon Customs turntable, safehouse door. */
  private zones(v: Vehicle): void {
    const dC = Math.hypot(v.position.x - NEON_CUSTOMS.bayX, v.position.z - NEON_CUSTOMS.bayZ);
    if (dC > 7) this.latchCustoms = false;
    if (!this.latchCustoms && dC < 3.4 && Math.abs(v.speed) < 6 && v.medium !== 'air') {
      this.latchCustoms = true;
      void this.openCustoms(v);
    }
    const dS = Math.hypot(v.position.x - SAFEHOUSE.storeX, v.position.z - SAFEHOUSE.storeZ);
    if (dS > 6) this.latchStore = false;
    if (!this.latchStore && dS < 2.8 && Math.abs(v.speed) < 4) {
      this.latchStore = true;
      void this.storePrompt(v);
    }
  }

  /** Parked/unattended aircraft and mid-air cars must keep simulating until they land. */
  private nudgeUnattended(): void {
    const w = this.ctx.world;
    for (const v of w.vehicles) {
      if (v === w.vehicle || w.traffic.isAi(v)) continue;
      const floating = v.airborne || (v.medium === 'air' && v.spool > 0.02);
      if (floating && v.velocity.lengthSq() <= 0.011) v.velocity.y -= 0.2;
    }
  }

  private syncOwned(): void {
    let changed = false;
    for (const o of this.save.owned) {
      const v = this.owned.get(o.id);
      if (!v) continue;
      if (!this.ctx.world.vehicles.includes(v) && this.ctx.world.vehicle !== v) {
        // vehicle was removed by someone else (e.g. destroyed): back to the garage, needing repair
        this.owned.delete(o.id);
        o.stored = true;
        o.health = 0.25;
        changed = true;
        continue;
      }
      const h = Math.round((v.health / v.maxHealth) * 100) / 100;
      if (h !== o.health) { o.health = h; changed = true; }
    }
    if (changed) this.persist();
  }

  // ------------------------------------------------------------------ rider pose

  /**
   * The core seats the player rig (VehicleEntry). For the VEHICLES+ open craft we
   * refine it: use our seat points and tilt the rider with the body (bike lean,
   * wheelies, boat rocking). Runs after the world update, so it wins.
   */
  private updateRider(dt: number): void {
    const w = this.ctx.world;
    const v = w.vehicle;
    const rig = w.player.rig;
    const custom = !!v && (v.def.twoWheel || v.def.kind === 'kayak' || v.def.kind === 'airboat' || v.def.kind === 'jetski');
    if (!v || !custom) {
      if (this.riderTilted) { rig.root.quaternion.identity(); this.riderTilted = false; }
      return;
    }
    if (v.def.kind !== 'bike') {
      v.seatWorld(_a);
      rig.root.position.copy(_a);
    }
    // tilt = bodyWorld * yaw^-1 (rig.body keeps the yaw)
    v.body.getWorldQuaternion(_q);
    _q2.setFromAxisAngle(_up, -v.yaw);
    rig.root.quaternion.copy(_q).multiply(_q2);
    rig.body.rotation.y = v.yaw;
    this.riderTilted = true;
    if (v.def.kind === 'bicycle') this.pedal(rig, v, dt);
  }

  /** Bicycle: swing the thighs with the crank so Rico pedals. */
  private pedal(rig: Rig, v: Vehicle, _dt: number): void {
    if (!this.legBones) {
      const find = (re: RegExp): THREE.Object3D | null => {
        let hit: THREE.Object3D | null = null;
        rig.root.traverse((o) => { if (!hit && (o as THREE.Bone).isBone && re.test(o.name)) hit = o; });
        return hit;
      };
      this.legBones = {
        l: find(/(upper.?leg|thigh|upleg).*(l|left)\b|^(l|left).*(upper.?leg|thigh|upleg)/i),
        r: find(/(upper.?leg|thigh|upleg).*(r|right)\b|^(r|right).*(upper.?leg|thigh|upleg)/i),
        lk: find(/(lower.?leg|shin|calf|^leg).*(l|left)\b|^(l|left).*(lower.?leg|shin|calf)/i),
        rk: find(/(lower.?leg|shin|calf|^leg).*(r|right)\b|^(r|right).*(lower.?leg|shin|calf)/i),
      };
    }
    const b = this.legBones;
    const ph = Math.sin(this.time * Math.min(9, Math.abs(v.speed) * 1.4));
    const amt = Math.min(1, Math.abs(v.speed) / 3) * 0.45;
    if (b.l) b.l.rotation.x += ph * amt;
    if (b.r) b.r.rotation.x -= ph * amt;
    if (b.lk) b.lk.rotation.x += Math.max(0, -ph) * amt;
    if (b.rk) b.rk.rotation.x += Math.max(0, ph) * amt;
  }

  private updatePassengers(dt: number): void {
    for (let i = this.passengers.length - 1; i >= 0; i--) {
      const p = this.passengers[i];
      const w = this.ctx.world;
      if (!w.vehicles.includes(p.vehicle) && !w.traffic.cars.includes(p.vehicle)) { this.passengers.splice(i, 1); continue; }
      p.vehicle.seatWorld(_a, true);
      p.rig.root.position.copy(_a);
      p.vehicle.body.getWorldQuaternion(_q);
      p.rig.root.quaternion.copy(_q);
      p.rig.body.rotation.y = 0;
      p.rig.animate(dt, 0, false, true);
    }
  }

  // ------------------------------------------------------------------ effects

  private updateFx(dt: number): void {
    if (!this.skids || !this.smoke || !this.glow) return;
    const w = this.ctx.world;
    const focus = w.focus;
    const pv = w.vehicle;
    this.skids.update(this.time);
    const list = [...w.vehicles, ...w.traffic.cars];
    let budget = 10;
    for (const v of list) {
      const dx = v.position.x - focus.x, dz = v.position.z - focus.z;
      if (dx * dx + dz * dz > 75 * 75) { this.marks.delete(v); continue; }
      const isPlayer = v === pv;
      if (!isPlayer && budget-- <= 0) continue;
      this.vehicleFx(v, dt, isPlayer || w.traffic.isRacer(v));
    }
    for (const v of this.marks.keys()) if (!list.includes(v)) this.marks.delete(v);
    this.smoke.update(dt);
    this.glow.update(dt);
    const h = this.ctx.camera instanceof THREE.PerspectiveCamera ? window.innerHeight / (2 * Math.tan((this.ctx.camera.fov * Math.PI) / 360)) : 600;
    this.smoke.setViewportHeight(h);
    this.glow.setViewportHeight(h);
  }

  private vehicleFx(v: Vehicle, dt: number, detailed: boolean): void {
    const sm = this.smoke!, gl = this.glow!;
    const d = v.def, L = d.length, W = d.width;
    const spd = Math.abs(v.speed);
    const R = Math.random;
    const chance = (rate: number) => R() < rate * dt;
    const m = v.medium;
    // --- skid marks & tire smoke (land, on ground)
    if (m === 'land' && !v.airborne && detailed) {
      const sliding = v.slip > 2.6 || (v.braking && spd > 9) || (v.controls.handbrake && spd > 4);
      const rec = this.marks.get(v) ?? { pts: new Float32Array(8), on: [false, false, false, false] };
      this.marks.set(v, rec);
      const wheels = d.twoWheel ? [[0, -(L / 2 - 0.35)], [0, L / 2 - 0.35]] : [[W / 2 - 0.25, -(L / 2 - 0.85)], [-(W / 2 - 0.25), -(L / 2 - 0.85)], [W / 2 - 0.25, L / 2 - 0.85], [-(W / 2 - 0.25), L / 2 - 0.85]];
      for (let i = 0; i < wheels.length; i++) {
        const front = d.twoWheel ? i === 1 : i >= 2;
        const active = sliding && !v.onSand && (!front || (v.braking && v.slip < 2.6)) && !(d.twoWheel && front && v.wheelie > 0.15);
        const x = v.position.x + Math.sin(v.yaw) * wheels[i][1] + Math.cos(v.yaw) * wheels[i][0];
        const z = v.position.z + Math.cos(v.yaw) * wheels[i][1] - Math.sin(v.yaw) * wheels[i][0];
        if (active && rec.on[i]) this.skids!.add(rec.pts[i * 2], rec.pts[i * 2 + 1], x, z, v.position.y, this.time);
        rec.pts[i * 2] = x; rec.pts[i * 2 + 1] = z;
        rec.on[i] = active;
        if (active && !front && v.slip > 4.5 && chance(18)) sm.emit(x, v.position.y + 0.3, z, (R() - 0.5) * 1.5, 0.6 + R(), (R() - 0.5) * 1.5, 1.6, 0.9, 0.86, 0.86, 0.9, 0.45, 1.6, 1.2, 0.3);
        // dust on sand
        if (v.onSand && spd > 3 && !front && chance(d.offroad && d.offroad > 1 ? 22 : 12)) sm.emit(x, v.position.y + 0.2, z, -v.velocity.x * 0.15 + (R() - 0.5), 0.8 + R() * 1.2, -v.velocity.z * 0.15 + (R() - 0.5), 1.4, 0.7, 0.86, 0.74, 0.55, 0.5, 1.4, 1.5, -0.4);
      }
    } else if (m === 'land' && v.onSand && !v.airborne && spd > 3 && chance(8)) {
      sm.emit(v.position.x, v.position.y + 0.2, v.position.z, (R() - 0.5), 0.8, (R() - 0.5), 1.2, 0.7, 0.86, 0.74, 0.55, 0.45, 1.3, 1.5, -0.3);
    } else this.marks.delete(v);
    // --- water spray / wake
    if ((m === 'water' || m === 'amphibious') && v.inWater && spd > 2.5) {
      const rate = Math.min(40, spd * 1.6);
      for (let k = 0; k < 2; k++) {
        if (!chance(rate)) continue;
        const side = k === 0 ? 1 : -1;
        v.localToWorld(side * (W / 2 + 0.1), 0.1, L * 0.15, _a);
        sm.emit(_a.x, -0.25, _a.z, Math.cos(v.yaw) * side * 2.2 + (R() - 0.5), 1.4 + R() * 1.6, -Math.sin(v.yaw) * side * 2.2 + (R() - 0.5), 0.9, 0.6, 0.95, 0.98, 1, 0.65, 1.5, 0.8, -6);
      }
      if (chance(rate * 0.7)) {
        v.localToWorld(0, 0.2, -L / 2, _a);
        sm.emit(_a.x, -0.2, _a.z, -v.velocity.x * 0.2 + (R() - 0.5), d.kind === 'jetski' ? 3 + R() * 2 : 1 + R(), -v.velocity.z * 0.2 + (R() - 0.5), 1.0, 0.7, 0.95, 0.98, 1, 0.6, 1.8, 0.6, -7);
      }
    }
    // --- exhaust & nitro (player's ride)
    const engine = !d.pedal && v.engineOn && !v.dead && v.driver !== null;
    if (detailed && engine && m === 'land') {
      v.localToWorld(d.twoWheel ? 0.14 : W / 2 - 0.45, 0.32, -L / 2 - 0.05, _a);
      v.localToWorld(d.twoWheel ? 0.14 : W / 2 - 0.45, 0.32, -L / 2 - 1.2, _b);
      _c.subVectors(_b, _a);
      if (chance(4 + Math.max(0, v.controls.throttle) * 16)) sm.emit(_a.x, _a.y, _a.z, _c.x * 0.6 + (R() - 0.5) * 0.3, 0.3 + R() * 0.3, _c.z * 0.6 + (R() - 0.5) * 0.3, 0.9, 0.18, 0.62, 0.62, 0.68, 0.22, 0.9, 1.2, 0.6);
      if (v.nitroActive && v.nitro > 0) {
        for (let k = 0; k < 3; k++) {
          const hot = R() < 0.5;
          gl.emit(_a.x, _a.y, _a.z, _c.x * (3 + R() * 3) + v.velocity.x * 0.8, (R() - 0.3) * 0.5, _c.z * (3 + R() * 3) + v.velocity.z * 0.8, 0.22 + R() * 0.12, 0.45 + R() * 0.3, hot ? 0.4 : 1, hot ? 0.7 : 0.3, 1, 0.9, -0.8, 2, 0);
        }
        if (!d.twoWheel) {
          v.localToWorld(-(W / 2 - 0.45), 0.32, -L / 2 - 0.05, _b);
          gl.emit(_b.x, _b.y, _b.z, _c.x * 4 + v.velocity.x * 0.8, 0, _c.z * 4 + v.velocity.z * 0.8, 0.25, 0.5, 0.4, 0.7, 1, 0.9, -0.8, 2, 0);
        }
      }
    }
    // --- damage smoke / fire from the engine bay
    const hs = v.healthState;
    if (hs === 'smoking' || hs === 'critical' || hs === 'dead') {
      v.localToWorld(0, Math.min(1.3, v.height * 0.7), m === 'air' ? -0.5 : L / 2 - 0.9, _a);
      const dark = hs === 'smoking' ? 0.55 : 0.12;
      if (chance(hs === 'smoking' ? 8 : 16)) sm.emit(_a.x + (R() - 0.5) * 0.4, _a.y, _a.z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.6, 1.4 + R(), (R() - 0.5) * 0.6, 2.4, 0.7, dark, dark, dark + 0.02, 0.55, 1.8, 0.6, 0.5);
      if (hs !== 'smoking' && chance(14)) gl.emit(_a.x + (R() - 0.5) * 0.3, _a.y, _a.z + (R() - 0.5) * 0.3, 0, 1.2 + R(), 0, 0.35, 0.5, 1, 0.45, 0.1, 0.8, -0.6, 0.5, 1);
    }
    // --- helicopter downwash
    if (m === 'air' && v.spool > 0.4) {
      const ground = v.position.x > 238 || v.position.z > 212 ? -0.3 : 0;
      const alt = v.position.y - ground;
      if (alt < 16 && v.position.y < 30 && chance(30 * v.spool)) {
        const a = R() * Math.PI * 2, r = 2 + R() * 2;
        const water = ground < 0;
        sm.emit(v.position.x + Math.cos(a) * r, ground + 0.2, v.position.z + Math.sin(a) * r, Math.cos(a) * 7, 0.4 + R(), Math.sin(a) * 7, 1.1, 0.8, water ? 0.95 : 0.85, water ? 0.98 : 0.76, water ? 1 : 0.6, 0.4, 1.6, 1.1, 0);
      }
    }
  }

  private sparks(x: number, y: number, z: number, n: number): void {
    if (!this.glow) return;
    const R = Math.random;
    for (let i = 0; i < n; i++) this.glow.emit(x, y, z, (R() - 0.5) * 9, R() * 5, (R() - 0.5) * 9, 0.35 + R() * 0.3, 0.16, 1, 0.75, 0.3, 1, -0.1, 0.5, -16);
  }

  /** Dust burst (landings) — used by the stunt system too. */
  dustBurst(x: number, y: number, z: number, strength: number): void {
    if (!this.smoke) return;
    const R = Math.random;
    const n = Math.min(26, Math.round(strength * 2));
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      this.smoke.emit(x, y + 0.2, z, Math.cos(a) * (3 + R() * 3), 0.5 + R(), Math.sin(a) * (3 + R() * 3), 1.3, 0.8, 0.85, 0.78, 0.66, 0.5, 1.5, 1.6, -0.2);
    }
  }

  private updateLights(): void {
    const v = this.ctx.world.vehicle;
    const on = !!v && v.lightsOn && v.medium !== 'water';
    const night = this.ctx.world.env.night ?? 0;
    for (let i = 0; i < this.lights.length; i++) {
      const s = this.lights[i];
      const cone = this.lightCones[i];
      if (!on || !v) { s.intensity = 0; cone.visible = false; continue; }
      const side = v.def.twoWheel || v.medium === 'air' ? 0 : (i === 0 ? 1 : -1) * (v.def.width / 2 - 0.4);
      const y = v.medium === 'air' ? 0.75 : Math.min(0.9, v.height * 0.45);
      const zf = v.medium === 'air' ? 2 : v.def.length / 2;
      v.localToWorld(side, y, zf, _a);
      v.localToWorld(side * 1.6, v.medium === 'air' ? -12 : -0.6, zf + 24, _b);
      s.position.copy(_a);
      s.target.position.copy(_b);
      s.target.updateMatrixWorld();
      s.intensity = (v.def.twoWheel || v.medium === 'air') && i === 1 ? 0 : 140 + night * 260;
      cone.visible = !(v.def.twoWheel && i === 1) && night > 0.3;
      cone.position.copy(_a);
      cone.lookAt(_b);
    }
  }

  // ------------------------------------------------------------------ HUD

  private buildHud(): void {
    ensureStyles();
    const root = document.createElement('div');
    root.style.cssText = 'position:absolute;right:28px;bottom:150px;width:210px;font-family:Oswald,Rajdhani,sans-serif;color:#fff;pointer-events:none;display:none;text-shadow:0 1px 2px #000';
    const row = (label: string, color: string) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-top:5px';
      const l = document.createElement('div');
      l.style.cssText = 'font-size:12px;letter-spacing:1px;opacity:.85';
      l.textContent = label;
      const track = document.createElement('div');
      track.style.cssText = 'height:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18)';
      const bar = document.createElement('div');
      bar.style.cssText = `height:100%;width:100%;background:${color};box-shadow:0 0 8px ${color};transition:width .15s`;
      track.append(bar);
      wrap.append(l, track);
      return { wrap, bar };
    };
    const h = row('VEHICLE', '#3dff9a');
    const n = row('NITRO', '#19e6ff');
    const info = document.createElement('div');
    info.style.cssText = 'font-size:13px;margin-top:5px;color:#ffd23f';
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;left:50%;bottom:96px;transform:translateX(-50%);background:rgba(0,0,0,.72);padding:6px 14px;border-left:3px solid #ff2fa0;font-family:Oswald,Rajdhani,sans-serif;font-size:17px;color:#fff;display:none;white-space:nowrap';
    root.append(h.wrap, n.wrap, info);
    this.ctx.hudRoot.append(root, hint);
    this.hud = { root, health: h.wrap, healthBar: h.bar, nitro: n.wrap, nitroBar: n.bar, info, hint };
  }

  private updateHud(): void {
    const hud = this.hud;
    if (!hud) return;
    const ctx = this.ctx;
    const busy = ctx.isBusy();
    const v = ctx.world.vehicle;
    hud.root.style.display = v && !busy ? '' : 'none';
    const qa = busy ? undefined : this.quick.find((q) => q.available());
    hud.hint.style.display = qa ? '' : 'none';
    if (qa) hud.hint.innerHTML = `<span class="vp-chip">K</span> ${qa.label}`;
    if (!v || busy) return;
    const r = v.health / v.maxHealth;
    hud.healthBar.style.width = `${Math.max(0, r * 100).toFixed(0)}%`;
    hud.healthBar.style.background = r > 0.5 ? '#3dff9a' : r > 0.25 ? '#ffd23f' : '#ff4d6d';
    hud.nitro.style.display = v.upgrades.nitro ? '' : 'none';
    hud.nitroBar.style.width = `${(v.nitro * 100).toFixed(0)}%`;
    const bits: string[] = [];
    if (v.dead) bits.push('ENGINE DEAD');
    else if (!v.engineOn) bits.push('ENGINE OFF');
    if (v.lightsOn) bits.push('LIGHTS');
    if (v.medium === 'air') bits.push(`ALT ${Math.round(v.position.y)} m`);
    hud.info.textContent = bits.join(' · ');
  }

  // ------------------------------------------------------------------ K menu

  private async vehicleMenu(v: Vehicle, inside: boolean): Promise<void> {
    const ctx = this.ctx;
    const car = v.medium === 'land' && !v.def.twoWheel && v.def.kind !== 'bicycle';
    await ctx.modal(() => openMenu(ctx.hudRoot, {
      title: 'Interaction',
      subtitle: v.def.name,
      accent: ['#19e6ff', '#7b2cff'],
      items: () => {
        const it: MenuItem[] = [];
        for (const q of this.quick) if (q.available()) it.push({ label: q.label, right: '▶', action: () => { q.run(); return MENU_CLOSE; } });
        if (car) {
          it.push({ label: 'Driver door', right: v.isPanelOpen('doorL') ? 'Open' : 'Closed', action: () => { v.setPanel('doorL', !v.isPanelOpen('doorL')); ctx.sfx('door'); } });
          it.push({ label: 'Passenger door', right: v.isPanelOpen('doorR') ? 'Open' : 'Closed', action: () => { v.setPanel('doorR', !v.isPanelOpen('doorR')); ctx.sfx('door'); } });
          it.push({
            label: 'Hood', right: `${v.isPanelOpen('hood') ? 'Open' : 'Closed'} · Engine ${Math.round((v.health / v.maxHealth) * 100)}%`,
            desc: `Engine condition: ${v.healthState.toUpperCase()}. ${v.dead ? 'The engine is dead — repair at Neon Customs or use a repair kit.' : ''}`,
            action: () => {
              const open = !v.isPanelOpen('hood');
              v.setPanel('hood', open);
              ctx.sfx('door');
              if (open) ctx.notify(`Engine health [y]${Math.round((v.health / v.maxHealth) * 100)}%[/y] (${v.healthState}).`, v.health / v.maxHealth < 0.35 ? 'warn' : 'info');
            },
          });
          it.push({ label: 'Trunk', right: `${(this.save.trunks[this.trunkKey(v)] ?? []).reduce((n, i) => n + i.qty, 0)} items`, desc: 'Store items and cash in this vehicle.', action: () => this.trunkMenu(v) });
        } else {
          it.push({ label: 'Storage compartment', right: `${(this.save.trunks[this.trunkKey(v)] ?? []).reduce((n, i) => n + i.qty, 0)} items`, action: () => this.trunkMenu(v) });
          it.push({ label: 'Condition', right: `${Math.round((v.health / v.maxHealth) * 100)}%`, desc: `State: ${v.healthState}` });
        }
        if (v.medium !== 'water' && !v.def.pedal) it.push({ label: 'Headlights (L)', right: v.lightsOn ? 'On' : 'Off', disabled: !inside, action: () => { v.lightsOn = !v.lightsOn; ctx.sfx('click'); } });
        if (!v.def.pedal) it.push({ label: 'Engine', right: v.dead ? 'Dead' : v.engineOn ? 'Running' : 'Off', disabled: v.dead, action: () => { v.engineOn = !v.engineOn; ctx.sfx('click'); } });
        it.push({ label: 'Nitro (N)', right: v.upgrades.nitro ? `${Math.round(v.nitro * 100)}%` : 'Not installed', disabled: true, desc: v.upgrades.nitro ? 'Hold N to boost. Refills over time.' : 'Install a nitro kit at Neon Customs.' });
        const o = this.ownedRecord(v);
        it.push({ label: 'Ownership', right: o ? 'Personal vehicle' : 'Not registered', disabled: true });
        return it;
      },
    }));
  }

  private trunkMenu(v: Vehicle): Promise<void> {
    const ctx = this.ctx;
    const key = this.trunkKey(v);
    const car = v.medium === 'land' && !v.def.twoWheel;
    if (car) v.setPanel('trunk', true);
    ctx.sfx('open');
    const th = this.trunk(key);
    return openMenu(ctx.hudRoot, {
      title: 'Trunk',
      subtitle: v.def.name,
      accent: ['#ffd23f', '#ff8a3d'],
      onClose: () => { if (car) v.setPanel('trunk', false); },
      footer: () => `Cash stored: <b>${money(th.cash())}</b> · Wallet: ${money(ctx.profile().credits)}`,
      items: () => {
        const it: MenuItem[] = [];
        for (const item of th.list()) {
          if (item.id === 'repair-kit') {
            it.push({ label: `Use ${item.name}`, right: `x${item.qty}`, desc: 'Repairs the vehicle fully.', action: () => { th.remove('repair-kit', 1); v.repair(); this.syncOwned(); ctx.sfx('good'); ctx.notify('Vehicle repaired.', 'good'); } });
            continue;
          }
          it.push({
            label: `Take ${item.name}`, right: `x${item.qty}`,
            action: () => {
              const ok = this.takeHandlers.some((h) => { try { return h(item, item.qty); } catch { return false; } });
              if (ok) { th.remove(item.id, item.qty); ctx.sfx('pickup'); }
              else ctx.notify('You have nowhere to carry that.', 'warn');
            },
          });
        }
        if (!th.list().length) it.push({ label: 'Empty', disabled: true });
        for (const amt of [100, 1000]) {
          it.push({ label: `Stash ${money(amt)}`, disabled: ctx.profile().credits < amt, action: () => { if (ctx.addMoney(-amt)) { th.addCash(amt); ctx.sfx('cash'); } } });
        }
        const c = th.cash();
        it.push({ label: 'Take all cash', right: money(c), disabled: c <= 0, action: () => { const n = th.cash(); th.addCash(-n); ctx.addMoney(n); ctx.sfx('cash'); } });
        return it;
      },
    });
  }

  // ------------------------------------------------------------------ Neon Customs

  private async openCustoms(v: Vehicle): Promise<void> {
    const ctx = this.ctx;
    if (v.medium !== 'land') {
      ctx.notify('Neon Customs works on cars and bikes only.', 'warn');
      return;
    }
    v.velocity.set(0, 0, 0);
    v.speed = 0;
    v.place(NEON_CUSTOMS.bayX, NEON_CUSTOMS.bayZ, -Math.PI / 2);
    const committed: Look = v.look ? { ...v.look } : defaultLook(v.color);
    let pendingFinish: Finish = committed.finish;
    const preview = (l: Partial<Look>) => v.applyLook({ ...committed, ...l });
    const restore = () => v.applyLook(committed);
    const value = catalogEntry(v.def.kind)?.price ?? v.def.value ?? 4000;
    const persistLook = () => {
      const o = this.ownedRecord(v);
      if (o) { o.look = { ...committed }; o.upgrades = { ...v.upgrades }; o.health = v.health / v.maxHealth; this.persist(); }
    };
    const pay = (cost: number): boolean => {
      if (cost <= 0) return true;
      if (!ctx.addMoney(-cost)) { ctx.sfx('bad'); ctx.notify(`Not enough cash (${money(cost)}).`, 'warn'); return false; }
      ctx.sfx('cash');
      return true;
    };
    const stats = () => {
      const s = v.stats;
      return `Top speed <b>${Math.round(s.maxSpeed * 3.6)} km/h</b> · Accel <b>${s.accel.toFixed(1)}</b> · Brakes <b>${s.brake.toFixed(0)}</b> · Armor <b>${Math.round(s.armor * 100)}%</b> · Health <b>${Math.round((v.health / v.maxHealth) * 100)}%</b>`;
    };
    const levelMenu = (key: LevelKey) => openMenu(ctx.hudRoot, {
      title: UPGRADE_LABELS[key], subtitle: 'Neon Customs', footer: stats,
      items: () => LEVEL_NAMES[key].map((name, lvl) => ({
        label: name,
        right: v.upgrades[key] === lvl ? 'Installed' : lvl === 0 ? 'Free' : money(upgradePrice(key, lvl)),
        disabled: v.upgrades[key] === lvl || lvl > UPGRADE_MAX[key],
        action: () => {
          const r = buyUpgrade(v.upgrades, key, lvl, ctx.profile().credits);
          if (!r.ok || !r.value) { ctx.notify(r.reason ?? 'Cannot buy', 'warn'); return; }
          if (!pay(r.cost)) return;
          v.setUpgrades(r.value);
          persistLook();
          ctx.notify(`${UPGRADE_LABELS[key]}: [y]${name}[/y] installed.`, 'good');
        },
      })),
    });
    const colorMenu = (title: string, apply: (c: string) => Partial<Look>, price: () => number, current: () => string | null, stockLabel?: string) => openMenu(ctx.hudRoot, {
      title, subtitle: 'Neon Customs', footer: stats,
      onClose: restore,
      items: () => {
        const it: MenuItem[] = [];
        if (title === 'Respray') {
          it.push({ label: 'Finish', right: `◀ ${pendingFinish} ▶`, desc: 'Metallic, matte, pearlescent or chrome. Select to cycle.', action: () => { pendingFinish = FINISHES[(FINISHES.indexOf(pendingFinish) + 1) % FINISHES.length]; preview({ finish: pendingFinish }); } });
        }
        if (stockLabel) it.push({ label: stockLabel, right: current() === null ? 'Installed' : money(price()), disabled: current() === null, hover: () => preview(apply('')), action: () => { if (!pay(price())) return; Object.assign(committed, apply('')); restore(); persistLook(); } });
        for (const c of PALETTE) {
          it.push({
            label: c.toUpperCase(), swatch: c, right: current() === c && (title !== 'Respray' || committed.finish === pendingFinish) ? 'Current' : money(price()),
            hover: () => preview(apply(c)),
            action: () => { if (!pay(price())) return; Object.assign(committed, apply(c)); restore(); persistLook(); ctx.notify('Looking fresh.', 'good'); },
          });
        }
        it.push({
          label: 'Custom color…', right: money(price()), desc: 'Pick any color with the color picker.',
          action: async () => {
            const picked = await pickColor(current() ?? '#ff2fa0', (cc) => preview(apply(cc)));
            if (!picked) { restore(); return; }
            if (!pay(price())) { restore(); return; }
            Object.assign(committed, apply(picked));
            restore();
            persistLook();
          },
        });
        return it;
      },
    });
    this.orbit = { v, t: Math.random() * 6 };
    try {
      await ctx.modal(() => openMenu(ctx.hudRoot, {
        title: 'Neon Customs',
        subtitle: v.def.name,
        accent: ['#ff2fa0', '#ffd23f'],
        footer: stats,
        items: () => {
          const rc = repairCost(v.health, v.maxHealth, value);
          const owned = this.ownedRecord(v);
          return [
            { label: 'Repair', right: rc ? money(rc) : 'Full health', disabled: !rc, desc: 'Fix the engine, body and dents.', action: () => { if (!pay(rc)) return; v.repair(); persistLook(); ctx.notify('Repaired. Good as new.', 'good'); } },
            { label: 'Respray', right: `${committed.finish}`, swatch: committed.color, desc: 'Palette or custom color; metallic, matte, pearlescent, chrome.', action: () => colorMenu('Respray', (c) => ({ color: c || committed.color, finish: pendingFinish }), () => resprayPrice(pendingFinish), () => committed.color) },
            { label: 'Wheels', right: committed.wheel ? 'Custom' : 'Stock', swatch: committed.wheel ?? '#d9dde6', desc: 'Rim color.', action: () => colorMenu('Wheels', (c) => ({ wheel: c || null }), () => PRICES.wheels, () => committed.wheel, 'Stock chrome') },
            {
              label: 'Windows', right: ['Stock', 'Light smoke', 'Dark smoke', 'Limo'][committed.tint], desc: 'Window tint.',
              action: () => openMenu(ctx.hudRoot, {
                title: 'Windows', subtitle: 'Neon Customs', onClose: restore,
                items: () => ['Stock', 'Light smoke', 'Dark smoke', 'Limo'].map((n, t) => ({
                  label: n, right: committed.tint === t ? 'Installed' : money(PRICES.tint[t]), disabled: committed.tint === t,
                  hover: () => preview({ tint: t }),
                  action: () => { if (!pay(PRICES.tint[t])) return; committed.tint = t; restore(); persistLook(); },
                })),
              }),
            },
            { label: 'Engine', right: LEVEL_NAMES.engine[v.upgrades.engine], action: () => levelMenu('engine') },
            { label: 'Brakes', right: LEVEL_NAMES.brakes[v.upgrades.brakes], action: () => levelMenu('brakes') },
            { label: 'Suspension', right: LEVEL_NAMES.suspension[v.upgrades.suspension], action: () => levelMenu('suspension') },
            { label: 'Armor', right: LEVEL_NAMES.armor[v.upgrades.armor], action: () => levelMenu('armor') },
            ...(['turbo', 'nitro'] as const).map((k) => ({
              label: UPGRADE_LABELS[k], right: v.upgrades[k] ? 'Installed' : money(upgradePrice(k)), disabled: v.upgrades[k],
              desc: k === 'turbo' ? 'More top speed and acceleration.' : 'Hold N for a burst of speed. Refills over time.',
              action: () => {
                const r = buyUpgrade(v.upgrades, k, 1, ctx.profile().credits);
                if (!r.ok || !r.value) { ctx.notify(r.reason ?? 'Cannot buy', 'warn'); return; }
                if (!pay(r.cost)) return;
                v.setUpgrades(r.value);
                if (k === 'nitro') v.nitro = 1;
                persistLook();
                ctx.notify(`${UPGRADE_LABELS[k]} installed.`, 'good');
              },
            })),
            {
              label: 'Repair kit (trunk)', right: money(PRICES.repairKit), desc: 'Stored in this vehicle. Use it from the trunk (K) for a roadside repair.',
              action: () => { if (!pay(PRICES.repairKit)) return; this.trunk(this.trunkKey(v)).add('repair-kit', 'Repair Kit', 1); ctx.notify('Repair kit stored in the trunk.', 'good'); },
            },
            {
              label: owned ? 'Personal vehicle' : 'Register as personal vehicle', right: owned ? '✓' : money(PRICES.register), disabled: !!owned,
              desc: 'Registered vehicles are saved, and can be stored at the safehouse garage next to Sunset Shield HQ.',
              action: () => {
                const landCount = this.save.owned.filter((o) => !isWaterOrAir(o.kind)).length;
                if (landCount >= GARAGE_CAPACITY) { ctx.notify('Your garage is full.', 'warn'); return; }
                if (!pay(PRICES.register)) return;
                const oldKey = this.trunkKey(v);
                const o = registerVehicle(this.save, v.def.kind, committed.color, v.upgrades);
                o.look = { ...committed };
                v.tag = o.id;
                if (this.save.trunks[oldKey]) { this.save.trunks[o.id] = this.save.trunks[oldKey]; delete this.save.trunks[oldKey]; }
                if (this.save.cash[oldKey]) { this.save.cash[o.id] = this.save.cash[oldKey]; delete this.save.cash[oldKey]; }
                this.owned.set(o.id, v);
                this.hook(v);
                this.persist();
                ctx.notify(`${v.def.name} registered to Rico Vega.`, 'good');
              },
            },
            { label: 'Leave', right: '', action: () => MENU_CLOSE },
          ];
        },
      }));
    } finally {
      this.orbit = null;
      restore();
      ctx.world.rig.snapTo(v.position, -Math.PI / 2 + Math.PI);
    }
  }

  // ------------------------------------------------------------------ Ocean Motors

  private async openDealer(): Promise<void> {
    const ctx = this.ctx;
    const cats = [...new Set(DEALER_CATALOG.map((c) => c.category))];
    await ctx.modal(() => openMenu(ctx.hudRoot, {
      title: 'Ocean Motors',
      subtitle: 'Neon Bay premium autos',
      accent: ['#19e6ff', '#2f6bff'],
      footer: () => `Wallet: <b>${money(ctx.profile().credits)}</b> · Garage: ${this.save.owned.filter((o) => !isWaterOrAir(o.kind)).length}/${GARAGE_CAPACITY}`,
      items: () => cats.map((cat) => ({
        label: cat,
        right: '▶',
        action: () => openMenu(ctx.hudRoot, {
          title: cat, subtitle: 'Ocean Motors', accent: ['#19e6ff', '#2f6bff'],
          footer: () => `Wallet: <b>${money(ctx.profile().credits)}</b>`,
          items: () => DEALER_CATALOG.filter((c) => c.category === cat).map((c) => {
            const has = this.save.owned.some((o) => o.kind === c.kind);
            const def = VEHICLE_DEFS[c.kind];
            return {
              label: c.name,
              right: `${has ? 'Owned · ' : ''}${money(c.price)}`,
              desc: `${c.blurb} Top speed ${Math.round(def.maxSpeed * 3.6)} km/h.`,
              action: () => openMenu(ctx.hudRoot, {
                title: c.name, subtitle: `Choose a color · ${money(c.price)}`, accent: ['#19e6ff', '#2f6bff'],
                items: () => def.colors.concat(PALETTE.slice(0, 6)).filter((x, i, a) => a.indexOf(x) === i).map((col) => ({
                  label: `Buy in ${col.toUpperCase()}`, swatch: col, right: money(c.price),
                  disabled: ctx.profile().credits < c.price,
                  action: () => {
                    const r = buyVehicle(this.save, c.kind, ctx.profile().credits, col);
                    if (!r.ok || !r.value) { ctx.sfx('bad'); ctx.notify(r.reason ?? 'Cannot buy', 'warn'); return; }
                    if (!ctx.addMoney(-r.cost)) { this.save.owned.pop(); ctx.notify('Not enough cash.', 'warn'); return; }
                    ctx.sfx('cash');
                    const v = this.spawnOwned(r.value);
                    this.persist();
                    ctx.save();
                    const where = c.kind === 'heli' ? 'the Sunset Shield HQ helipad (elevator in the lobby)' : isWaterOrAir(c.kind) ? 'the Neon Beach jetty' : 'the safehouse garage next to Sunset Shield HQ';
                    ctx.notify(`Purchased the [y]${c.name}[/y]! Delivered to ${where}.`, 'money');
                    if (!v) ctx.notify('Delivery delayed — check the safehouse garage.', 'info');
                    return MENU_CLOSE;
                  },
                })),
              }),
            };
          }),
        }),
      })),
    }));
  }

  // ------------------------------------------------------------------ safehouse

  private async storePrompt(v: Vehicle): Promise<void> {
    const ctx = this.ctx;
    const o = this.ownedRecord(v);
    if (!o) {
      ctx.notify('Only registered personal vehicles fit in the safehouse. Register this one at [y]Neon Customs[/y].', 'info');
      return;
    }
    await ctx.modal(() => openMenu(ctx.hudRoot, {
      title: 'Safehouse', subtitle: v.def.name, accent: ['#3dffb0', '#19c3d6'],
      items: () => [
        { label: `Store ${v.def.name}`, desc: 'Park it inside. Health and upgrades are saved.', action: () => { this.storeVehicle(v, o); return MENU_CLOSE; } },
        { label: 'Keep driving', action: () => MENU_CLOSE },
      ],
    }));
  }

  private storeVehicle(v: Vehicle, o: OwnedVehicle): void {
    const w = this.ctx.world;
    o.health = v.health / v.maxHealth;
    o.upgrades = { ...v.upgrades };
    if (v.look) o.look = { ...v.look };
    o.stored = true;
    if (w.vehicle === v) w.exitVehicle();
    for (const p of [...this.passengers]) if (p.vehicle === v) this.unseatPassenger(p.rig);
    w.removeVehicle(v);
    this.owned.delete(o.id);
    this.persist();
    w.player.place(SAFEHOUSE.doorX, SAFEHOUSE.doorZ - 1, Math.PI);
    this.ctx.sfx('door');
    this.ctx.notify(`${v.def.name} stored in the safehouse garage.`, 'good');
  }

  private async openSafehouse(): Promise<void> {
    const ctx = this.ctx;
    await ctx.modal(() => openMenu(ctx.hudRoot, {
      title: 'Safehouse', subtitle: 'Personal vehicles', accent: ['#3dffb0', '#19c3d6'],
      footer: () => `Garage ${this.save.owned.filter((o) => !isWaterOrAir(o.kind)).length}/${GARAGE_CAPACITY} · Buy more at Ocean Motors`,
      items: () => {
        if (!this.save.owned.length) return [{ label: 'No personal vehicles yet', desc: 'Buy one at Ocean Motors or register a car at Neon Customs.', disabled: true }];
        return this.save.owned.map((o) => {
          const name = VEHICLE_DEFS[o.kind]?.name ?? o.kind;
          const live = this.owned.get(o.id);
          return {
            label: name, swatch: o.look.color,
            right: o.stored ? `Stored · ${Math.round(o.health * 100)}%` : 'Out',
            action: () => openMenu(ctx.hudRoot, {
              title: name, subtitle: o.stored ? 'In the garage' : 'Parked outside / in use', accent: ['#3dffb0', '#19c3d6'],
              items: () => [
                {
                  label: 'Take it out', disabled: !o.stored,
                  action: () => {
                    o.stored = false;
                    const v = this.spawnOwned(o);
                    this.persist();
                    if (v) ctx.notify(`Your ${name} is ${isWaterOrAir(o.kind) ? (o.kind === 'heli' ? 'on the HQ helipad' : 'at the Neon Beach jetty') : 'waiting outside'}.`, 'good');
                    return MENU_CLOSE;
                  },
                },
                {
                  label: 'Return to garage', disabled: o.stored || !live || ctx.world.vehicle === live,
                  desc: 'Have the valet bring it back.',
                  action: () => { if (live) this.storeVehicle(live, o); return MENU_CLOSE; },
                },
                {
                  label: 'Sell', right: money(sellValue(o)), disabled: ctx.world.vehicle === live,
                  action: () => {
                    if (live) { ctx.world.removeVehicle(live); this.owned.delete(o.id); }
                    this.save.owned = this.save.owned.filter((x) => x !== o);
                    ctx.addMoney(sellValue(o));
                    ctx.sfx('cash');
                    this.persist();
                    return MENU_CLOSE;
                  },
                },
              ],
            }),
          };
        });
      },
    }));
  }
}

export type GarageSystem = VehiclesPlus;

export default function create(): GameSystem {
  return new VehiclesPlus();
}
