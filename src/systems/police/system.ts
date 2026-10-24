import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import { Vehicle, VEHICLE_DEFS } from '../../vehicles/Vehicle';
import type { RoadNode } from '../../world/layout';
import { COMBAT_HOOKS } from '../../scripting/combatHooks';
import { CRIME_LABEL, WantedLevel, searchRadius, witnesses, type CrimeKind } from './wanted';
import type { CombatSystem } from '../combat/system';
import { POLICE_STATION } from '../combat/system';
import type { Enemy } from '../combat/enemies';
import { COMBAT_AUDIO } from '../combat/audio';
import { RICO_OUTFIT } from '../../actors/Player';

// Neon Bay PD: wanted level (0–5 stars on the HUD), witnesses and the suspect
// description, pursuing cruisers with light bars and sirens, officers on foot
// who arrest (low stars) or shoot (3+), roadblocks at 3+, a helicopter with a
// spotlight at 4+, evasion via the search circle, and "BUSTED".

interface PoliceCar {
  v: Vehicle;
  officers: Enemy[];
  crew: number;
  swat: boolean;
  state: 'pursue' | 'stopped' | 'roadblock';
  path: number[];
  pathT: number;
  stuck: number;
  reverseT: number;
  lights: THREE.Mesh[];
}

interface PendingReport { kind: CrimeKind; x: number; z: number; t: number }

interface LifeLike extends GameSystem { disguiseLevel?(): number }

const red = new THREE.MeshStandardMaterial({ color: '#ff2030', emissive: '#ff2030', emissiveIntensity: 0.2 });
const blue = new THREE.MeshStandardMaterial({ color: '#2050ff', emissive: '#2050ff', emissiveIntensity: 0.2 });
const lightGeo = new THREE.BoxGeometry(0.42, 0.14, 0.24);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class PoliceSystem implements GameSystem {
  readonly id = 'police';
  ctx!: SystemContext;
  readonly wanted = new WantedLevel();
  readonly cars: PoliceCar[] = [];
  private pending: PendingReport[] = [];
  private spawnT = 0;
  private seenT = 0;
  private seen = false;
  private bustT = 0;
  private openCarryT = 0;
  private warnedCarry = false;
  private roadblockT = 10;
  private roadblocks: PoliceCar[] = [];
  private heli: { root: THREE.Group; rotor: THREE.Mesh; beam: THREE.Mesh; disc: THREE.Mesh; spot: THREE.Vector3; a: number } | null = null;
  private flash = 0;
  private glow = new THREE.PointLight('#ff2030', 0, 22, 2);
  /** Vehicle id -> last game time it was seen as AI traffic (carjack detection). */
  private trafficSeen = new Map<number, number>();
  private clock = 0;
  private hijackHooked = false;
  private lastVehicle: Vehicle | null = null;
  readonly stolen = new WeakSet<Vehicle>();
  private abandoned = new WeakSet<Vehicle>();
  private patched = false;
  private busting = false;
  private clearWaiters: (() => void)[] = [];
  private starsEl: HTMLElement | null = null;
  private lockedLevel = -1;

  private get combat(): CombatSystem | undefined { return this.ctx.system<CombatSystem>('combat'); }
  get stars(): number { return this.wanted.stars; }

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    if (!this.patched) {
      this.patched = true;
      ctx.scene.add(this.glow);
      // HUD stars: the Game sets its own threat level every frame; show the higher one.
      const ui = ctx.ui as unknown as { setThreat(n: number): void; __policePatched?: boolean };
      if (!ui.__policePatched) {
        ui.__policePatched = true;
        const orig = ui.setThreat.bind(ctx.ui);
        ui.setThreat = (n: number) => orig(Math.max(n, this.wanted.stars));
      }
      this.wanted.onChange = (from, to) => this.onStarsChanged(from, to);
      COMBAT_HOOKS.setWanted = (n) => this.setWanted(n);
      COMBAT_HOOKS.clearWanted = () => this.clearWanted();
      COMBAT_HOOKS.wantedCleared = () => this.wantedCleared();
    }
    this.clearWanted();
  }

  // ------------------------------------------------------------------ API

  reportCrime(kind: CrimeKind, x: number, z: number, opts: { loud?: number; victimCop?: boolean } = {}): void {
    const w = this.ctx.world;
    const at = { x, z };
    // police see or hear it directly
    let copWitness = !!opts.victimCop;
    const hear = opts.loud ? opts.loud * 1.1 : 0;
    for (const c of this.cars) if (c.v.position.distanceTo(_v.set(x, 0, z)) < Math.max(45, hear)) copWitness = true;
    for (const e of this.officers()) if (Math.hypot(e.pos.x - x, e.pos.z - z) < Math.max(40, hear)) copWitness = true;
    if (copWitness) { this.commit(kind, x, z); return; }
    // civilians who saw it (with a clear line of sight) call it in after a moment
    const col = w.city.collision;
    const radius = kind === 'shots' ? Math.min(60, (opts.loud ?? 40) * 0.6) : 26;
    const peds = w.peds.peds.filter((p) => p.rig.root.visible && !this.combat?.isDowned(p)).map((p) => p.pos);
    const n = witnesses(peds, at, radius, (o) => {
      const dx = x - o.x, dz = z - o.z, len = Math.hypot(dx, dz);
      if (len < 2) return true;
      return col.raycast(o.x, 1.6, o.z, dx / len, 0, dz / len, len) >= len - 0.5;
    });
    if (n > 0 && !this.pending.some((p) => p.kind === kind && Math.hypot(p.x - x, p.z - z) < 10)) {
      this.pending.push({ kind, x, z, t: this.wanted.stars > 0 ? 0.5 : 2.2 });
    }
  }

  private commit(kind: CrimeKind, x: number, z: number): void {
    const before = this.wanted.stars;
    if (this.lockedLevel >= 0) return;
    this.describeSuspect();
    this.wanted.report(kind, { x, z }, true);
    if (this.wanted.stars > before) this.ctx.notify(`[r]${CRIME_LABEL[kind]}[/r] reported to Neon Bay PD.`, 'warn');
  }

  setWanted(level: number): void {
    this.lockedLevel = -1;
    const n = Math.max(0, Math.min(5, Math.round(level)));
    if (n === 0) { this.clearWanted(); return; }
    this.describeSuspect();
    const f = this.ctx.world.focus;
    this.wanted.lastSeen.x = f.x; this.wanted.lastSeen.z = f.z;
    this.wanted.evade = 0; this.wanted.hidden = 0; this.wanted.searching = false;
    this.wanted.setStars(n);
  }

  clearWanted(): void {
    this.wanted.clear();
    this.pending.length = 0;
    this.removeAllUnits();
    for (const f of this.clearWaiters.splice(0)) f();
  }

  wantedCleared(): Promise<void> {
    if (this.wanted.stars === 0) return Promise.resolve();
    return new Promise((res) => this.clearWaiters.push(res));
  }

  /** Called by the garage's pay-n-spray (vehicles system) to wipe the vehicle description. */
  onRepaint(): void {
    this.wanted.suspect.vehicleId = null;
    this.wanted.suspect.vehicleColor = null;
    if (this.wanted.stars > 0 && !this.seen) {
      this.clearWanted();
      this.ctx.notify('Fresh paint. The cops are looking for a different car now.', 'good');
    }
  }

  vehiclesForCombat(): readonly Vehicle[] {
    return this.carList;
  }
  private carList: Vehicle[] = [];

  isStolen(v: Vehicle): boolean { return this.stolen.has(v); }

  blips(): { x: number; z: number; color: string; kind: 'target'; label?: string }[] {
    const out: { x: number; z: number; color: string; kind: 'target'; label?: string }[] = [];
    for (const c of this.cars) out.push({ x: c.v.position.x, z: c.v.position.z, color: this.flash % 1 < 0.5 ? '#ff2030' : '#2050ff', kind: 'target' });
    return out;
  }

  /** Search circle for the minimap while the police lost sight of you. */
  searchArea(): { x: number; z: number; r: number } | null {
    return this.wanted.stars > 0 && this.wanted.searching ? { x: this.wanted.lastSeen.x, z: this.wanted.lastSeen.z, r: searchRadius(this.wanted.stars) } : null;
  }

  // ------------------------------------------------------------------ frame

  update(dt: number, ctx: SystemContext): void {
    const w = ctx.world;
    this.flash += dt * 2.2;
    this.clock += dt;
    // carjacking: chain onto the world hook (the Game may set its own handler; keep it)
    if (!this.hijackHooked || !(w.events.onHijack as { __police?: boolean } | undefined)?.__police) {
      this.hijackHooked = true;
      const prev = w.events.onHijack;
      const hook = Object.assign((veh: Vehicle) => {
        prev?.(veh);
        if (!this.stolen.has(veh)) { this.stolen.add(veh); this.reportCrime('carjack', veh.position.x, veh.position.z); }
      }, { __police: true });
      w.events.onHijack = hook;
    }
    this.detectVehicleTheft();
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) { this.pending.splice(i, 1); this.commit(p.kind, p.x, p.z); }
    }
    this.updateRecognition();
    this.seenT -= dt;
    if (this.seenT <= 0) { this.seenT = 0.25; this.seen = this.computeSeen(); }
    const cleared = this.wanted.update(dt, this.seen, w.focus);
    if (cleared) {
      ctx.notify('You lost the cops.', 'good');
      ctx.sfx('good');
    }
    this.updateOpenCarry(dt);
    if (this.wanted.stars > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 3; this.manageUnits(); }
      this.updateRoadblocks(dt);
    }
    this.updateCars(dt);
    this.updateOfficers();
    this.updateHeli(dt);
    this.updateBust(dt);
    // lights + siren
    const on = this.flash % 1 < 0.5;
    red.emissiveIntensity = on ? 4 : 0.2;
    blue.emissiveIntensity = on ? 0.2 : 4;
    let nearest = Infinity, nc: PoliceCar | null = null;
    for (const c of this.cars) { const d = c.v.position.distanceTo(w.focus); if (d < nearest) { nearest = d; nc = c; } }
    if (nc && nearest < 60) {
      this.glow.position.copy(nc.v.position).setY(2.2);
      this.glow.color.set(on ? '#ff2030' : '#2050ff');
      this.glow.intensity = 5;
    } else this.glow.intensity = 0;
    COMBAT_AUDIO.setSiren(this.cars.some((c) => c.state === 'pursue') && nearest < 160 ? Math.max(0.05, 1 - nearest / 160) : 0);
  }

  always(_dt: number, ctx: SystemContext): void {
    const combat = this.combat;
    if (!this.starsEl) this.starsEl = ctx.hudRoot.parentElement?.querySelector('.cc-threat') ?? null;
    this.starsEl?.classList.toggle('cbt-searching', this.wanted.searching && this.wanted.stars > 0);
    if (!combat?.hud) return;
    if (ctx.isBusy() || this.wanted.stars === 0) { combat.hud.setNote(null); return; }
    if (this.wanted.searching) {
      const d = Math.hypot(ctx.world.focus.x - this.wanted.lastSeen.x, ctx.world.focus.z - this.wanted.lastSeen.z);
      const r = searchRadius(this.wanted.stars);
      combat.hud.setNote(d > r ? `Out of the search area • ${Math.round(this.wanted.evadeProgress * 100)}%` : `Search area • leave ${Math.round(r - d)} m`, true);
    } else combat.hud.setNote('Police have eyes on you', false);
  }

  // ------------------------------------------------------------------ detection

  private describeSuspect(): void {
    const w = this.ctx.world;
    const s = this.wanted.suspect;
    s.shirt = RICO_OUTFIT.shirt;
    s.weapon = this.combat?.arsenal.active ?? null;
    if (w.vehicle) { s.vehicleId = w.vehicle.id; s.vehicleColor = w.vehicle.color; s.vehicleKind = w.vehicle.def.kind; }
    this.wanted.recognition = 1;
  }

  private updateRecognition(): void {
    if (this.wanted.stars === 0) return;
    const w = this.ctx.world;
    const s = this.wanted.suspect;
    let r = 1;
    if (s.vehicleId !== null) {
      if (!w.vehicle) r *= 0.75; // they're looking for the car
      else if (w.vehicle.id !== s.vehicleId) r *= 0.45; // switched cars
    } else if (w.vehicle) r *= 0.85;
    const disguise = this.ctx.system<LifeLike>('life')?.disguiseLevel?.() ?? 0;
    r *= 1 - Math.max(0, Math.min(0.6, disguise));
    this.wanted.recognition = r;
  }

  private computeSeen(): boolean {
    if (this.wanted.stars === 0) return false;
    const w = this.ctx.world;
    const f = w.focus;
    const col = w.city.collision;
    const rec = this.wanted.recognition;
    for (const e of this.officers()) if (e.canSee && e.dist < 20 + 25 * rec) return true;
    for (const c of this.cars) {
      const d = c.v.position.distanceTo(f);
      if (d > 18 + 32 * rec) continue;
      _v.copy(f).sub(c.v.position).setY(0);
      const len = _v.length();
      _v.divideScalar(len || 1);
      if (col.raycast(c.v.position.x, 1.4, c.v.position.z, _v.x, 0, _v.z, len) >= len - 1) return true;
    }
    if (this.heli && Math.hypot(this.heli.spot.x - f.x, this.heli.spot.z - f.z) < 10) return true;
    return false;
  }

  private detectVehicleTheft(): void {
    const w = this.ctx.world;
    const v = w.vehicle;
    if (v && v !== this.lastVehicle) {
      const seen = this.trafficSeen.get(v.id);
      if (seen !== undefined && this.clock - seen < 15) {
        if (!this.stolen.has(v)) this.reportCrime('carjack', v.position.x, v.position.z);
        this.stolen.add(v);
      } else if (this.abandoned.has(v)) {
        this.stolen.add(v);
        this.reportCrime('vehicleTheft', v.position.x, v.position.z, { victimCop: true });
      }
    }
    this.lastVehicle = v;
    for (const c of w.traffic.cars) if (w.traffic.isAi(c)) this.trafficSeen.set(c.id, this.clock);
    if (this.trafficSeen.size > 200) for (const [id, t] of this.trafficSeen) if (this.clock - t > 30) this.trafficSeen.delete(id);
  }

  private updateOpenCarry(dt: number): void {
    const combat = this.combat;
    const w = this.ctx.world;
    if (!combat || w.vehicle || this.wanted.stars > 0 || !combat.arsenal.openCarry()) { this.openCarryT = 0; return; }
    let cop = false;
    for (const e of this.officers()) if (e.canSee && e.dist < 25) cop = true;
    for (const c of this.cars) if (c.v.position.distanceTo(w.player.position) < 22) cop = true;
    if (!cop) { this.openCarryT = Math.max(0, this.openCarryT - dt); return; }
    this.openCarryT += dt;
    if (!this.warnedCarry && this.openCarryT > 0.5) { this.warnedCarry = true; this.ctx.notify('NBPD: "Put that weapon away, now!" (X holsters)', 'warn'); }
    if (this.openCarryT > 4) { this.openCarryT = 0; this.commit('openCarry', w.player.position.x, w.player.position.z); }
  }

  private officers(): Enemy[] {
    const c = this.combat;
    if (!c?.enemies) return [];
    return c.enemies.list.filter((e) => e.type.faction === 'police' && !e.neutralized);
  }

  // ------------------------------------------------------------------ units

  private onStarsChanged(from: number, to: number): void {
    if (to > from) {
      this.spawnT = Math.min(this.spawnT, 0.5);
      this.ctx.sfx('alert');
    }
    if (to === 0) {
      this.removeAllUnits();
      for (const f of this.clearWaiters.splice(0)) f();
    }
  }

  private maxCars(): number {
    const q = this.ctx.settings().quality;
    const cap = q === 'low' ? 3 : q === 'medium' ? 4 : q === 'high' ? 5 : 6;
    return Math.min(cap, [0, 1, 2, 3, 4, 5][this.wanted.stars]);
  }

  private manageUnits(): void {
    const w = this.ctx.world;
    // recycle cars that fell far behind
    for (const c of [...this.cars]) {
      if (c.state !== 'roadblock' && c.v.position.distanceTo(w.focus) > 280) this.removeCar(c);
    }
    const pursuing = this.cars.filter((c) => c.state !== 'roadblock').length;
    if (pursuing < this.maxCars()) this.spawnCar();
  }

  private nodeNear(x: number, z: number): RoadNode {
    const nodes = this.ctx.world.traffic.nodes;
    let best = nodes[0], bd = Infinity;
    for (const n of nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  private spawnCar(): void {
    const w = this.ctx.world;
    const f = w.focus;
    const nodes = w.traffic.nodes;
    const cands = nodes.filter((n) => { const d = Math.hypot(n.x - f.x, n.z - f.z); return d > 75 && d < 150; });
    if (!cands.length) return;
    const n = cands[Math.floor(Math.random() * cands.length)];
    const yaw = Math.atan2(f.x - n.x, f.z - n.z);
    const v = new Vehicle(VEHICLE_DEFS.police);
    v.place(n.x + (Math.random() - 0.5) * 4, n.z + (Math.random() - 0.5) * 4, yaw);
    v.driver = 'ai';
    this.ctx.scene.add(v.root);
    const lights = this.addLightBar(v);
    const swat = this.wanted.stars >= 4 && this.cars.filter((c) => c.swat).length < 2;
    this.cars.push({ v, officers: [], crew: 2, swat, state: 'pursue', path: [], pathT: 0, stuck: 0, reverseT: 0, lights });
    this.refreshCarList();
  }

  private addLightBar(v: Vehicle): THREE.Mesh[] {
    const h = v.def.kind === 'police' ? 1.58 : 1.6;
    const l = new THREE.Mesh(lightGeo, red);
    const r = new THREE.Mesh(lightGeo, blue);
    l.position.set(0.3, h, -0.2);
    r.position.set(-0.3, h, -0.2);
    v.root.add(l, r);
    return [l, r];
  }

  private refreshCarList(): void {
    this.carList = [...this.cars, ...this.roadblocks].map((c) => c.v);
  }

  private removeCar(c: PoliceCar): void {
    for (const e of c.officers) this.combat?.enemies.remove(e);
    c.officers.length = 0;
    this.ctx.scene.remove(c.v.root);
    let i = this.cars.indexOf(c);
    if (i >= 0) this.cars.splice(i, 1);
    i = this.roadblocks.indexOf(c);
    if (i >= 0) this.roadblocks.splice(i, 1);
    this.refreshCarList();
  }

  private removeAllUnits(): void {
    for (const c of [...this.cars, ...this.roadblocks]) this.removeCar(c);
    this.combat?.enemies.clear((e) => e.type.faction === 'police' && !e.neutralized);
    if (this.heli) { this.ctx.scene.remove(this.heli.root, this.heli.beam, this.heli.disc); this.heli = null; }
    COMBAT_AUDIO.setSiren(0);
    this.glow.intensity = 0;
  }

  private deploy(c: PoliceCar): void {
    const combat = this.combat;
    if (!combat) return;
    const v = c.v;
    for (let i = 0; i < c.crew; i++) {
      const side = i === 0 ? 1 : -1;
      const x = v.position.x + Math.cos(v.yaw) * side * (v.def.width / 2 + 0.7);
      const z = v.position.z - Math.sin(v.yaw) * side * (v.def.width / 2 + 0.7);
      const e = combat.spawnEnemy(c.swat ? 'swat' : 'officer', x, z, v.yaw);
      if (!e) continue;
      e.alertTo(this.ctx.world.focus.x, this.ctx.world.focus.z);
      c.officers.push(e);
    }
    c.crew = 0;
  }

  private bfs(from: number, to: number): number[] {
    const nodes = this.ctx.world.traffic.nodes;
    const prev = new Map<number, number>([[from, -1]]);
    const q = [from];
    while (q.length) {
      const id = q.shift() as number;
      if (id === to) break;
      for (const l of nodes[id].links) if (!prev.has(l)) { prev.set(l, id); q.push(l); }
    }
    const path: number[] = [];
    for (let id = to; id !== -1 && id !== undefined; id = prev.get(id) as number) path.unshift(id);
    return path;
  }

  private updateCars(dt: number): void {
    const w = this.ctx.world;
    const f = w.focus;
    const col = w.city.collision;
    const pv = w.vehicle;
    for (const c of [...this.cars]) {
      const v = c.v;
      if (c.state === 'roadblock') { v.controls = { throttle: 0, steer: 0, handbrake: true }; v.update(dt, col); continue; }
      const dist = v.position.distanceTo(f);
      // officers out of the car: wait, or pick them back up if the player drove away
      if (c.state === 'stopped') {
        v.controls = { throttle: 0, steer: 0, handbrake: true };
        v.update(dt, col);
        const alive = c.officers.filter((e) => !e.neutralized);
        if (!alive.length && c.officers.length) {
          // everyone down: the cruiser is up for grabs
          this.abandon(c);
          continue;
        }
        if (pv && dist > 45) {
          for (const e of c.officers) this.combat?.enemies.remove(e);
          c.crew = alive.length;
          c.officers = [];
          c.state = 'pursue';
        }
        continue;
      }
      // navigation: road graph when far, direct when close
      let tx = f.x, tz = f.z;
      if (pv) { tx += pv.velocity.x * 0.6; tz += pv.velocity.z * 0.6; }
      if (dist > 50) {
        c.pathT -= dt;
        if (c.pathT <= 0 || !c.path.length) {
          c.pathT = 1.5;
          c.path = this.bfs(this.nodeNear(v.position.x, v.position.z).id, this.nodeNear(f.x, f.z).id);
        }
        const nodes = w.traffic.nodes;
        while (c.path.length > 1 && Math.hypot(nodes[c.path[0]].x - v.position.x, nodes[c.path[0]].z - v.position.z) < 14) c.path.shift();
        if (c.path.length > 1 || (c.path.length === 1 && dist > 90)) { tx = nodes[c.path[0]].x; tz = nodes[c.path[0]].z; }
      }
      const desired = Math.atan2(tx - v.position.x, tz - v.position.z);
      let diff = desired - v.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      let steer = THREE.MathUtils.clamp(diff * 2.4, -1, 1);
      // avoid walls straight ahead
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      const ahead = col.raycast(v.position.x + fx * 2.4, 0.8, v.position.z + fz * 2.4, fx, 0, fz, 9);
      if (ahead < 7) {
        const l = col.raycast(v.position.x, 0.8, v.position.z, Math.sin(v.yaw + 0.7), 0, Math.cos(v.yaw + 0.7), 12);
        const r = col.raycast(v.position.x, 0.8, v.position.z, Math.sin(v.yaw - 0.7), 0, Math.cos(v.yaw - 0.7), 12);
        steer = l > r ? 1 : -1;
      }
      const onFoot = !pv;
      let target = Math.min(36, 20 + this.wanted.stars * 4);
      if (onFoot && dist < 30) target = Math.max(0, (dist - 9) * 1.1);
      if (!onFoot && dist < 18) target = Math.abs(pv?.speed ?? 0) + 4; // ram / box in
      if (Math.abs(diff) > 1.2) target = Math.min(target, 9);
      const spd = v.speed;
      let throttle = spd < target - 0.5 ? 1 : spd > target + 1.5 ? -0.7 : 0.15;
      if (c.reverseT > 0) { c.reverseT -= dt; throttle = -0.8; steer = -steer; }
      else if (Math.abs(spd) < 0.6 && target > 3) {
        c.stuck += dt;
        if (c.stuck > 1.6) { c.stuck = 0; c.reverseT = 1.1; }
      } else c.stuck = 0;
      v.controls = { throttle, steer, handbrake: false };
      v.update(dt, col);
      // bump into other vehicles
      this.separate(v);
      if (onFoot && dist < 13 && Math.abs(v.speed) < 2.5) {
        c.state = 'stopped';
        this.deploy(c);
      }
    }
  }

  private separate(v: Vehicle): void {
    const w = this.ctx.world;
    const push = (o: Vehicle) => {
      if (o === v) return;
      const dx = o.position.x - v.position.x, dz = o.position.z - v.position.z;
      const d = Math.hypot(dx, dz);
      const r = 2.3 + Math.max(o.def.width, o.def.length * 0.5) * 0.5;
      if (d === 0 || d > r) return;
      const nx = dx / d, nz = dz / d, k = (r - d) / 2;
      v.position.x -= nx * k; v.position.z -= nz * k;
      o.position.x += nx * k; o.position.z += nz * k;
      const rel = (o.velocity.x - v.velocity.x) * nx + (o.velocity.z - v.velocity.z) * nz;
      if (rel < 0) {
        v.velocity.x += nx * rel * 0.6; v.velocity.z += nz * rel * 0.6;
        o.velocity.x -= nx * rel * 0.6; o.velocity.z -= nz * rel * 0.6;
        if (o === w.vehicle && -rel > 4) w.rig.addShake(Math.min(0.8, -rel / 20));
      }
      v.sync(0); o.sync(0);
    };
    if (w.vehicle) push(w.vehicle);
    for (const o of w.traffic.cars) if (o.position.distanceToSquared(v.position) < 64) push(o);
    for (const c of this.cars) if (c.v !== v && c.v.position.distanceToSquared(v.position) < 64) push(c.v);
  }

  private abandon(c: PoliceCar): void {
    const i = this.cars.indexOf(c);
    if (i >= 0) this.cars.splice(i, 1);
    c.v.driver = null;
    c.v.controls = { throttle: 0, steer: 0, handbrake: true };
    for (const l of c.lights) l.removeFromParent();
    this.ctx.world.vehicles.push(c.v);
    this.abandoned.add(c.v);
    this.refreshCarList();
  }

  private updateOfficers(): void {
    const combat = this.combat;
    if (!combat) return;
    const stars = this.wanted.stars;
    const armed = combat.aiming || combat.firing;
    for (const e of this.officers()) {
      // 1 star (or 2 while you aren't armed): run you down and cuff you; 3+: shoot
      e.arrestMode = stars <= 1 || (stars === 2 && !armed && combat.arsenal.def.cls === 'melee');
      if (stars === 0) e.brain.set('flee');
    }
  }

  private updateBust(dt: number): void {
    const combat = this.combat;
    const w = this.ctx.world;
    if (!combat || this.wanted.stars === 0 || this.busting) { this.bustT = 0; return; }
    let close = false;
    for (const e of this.officers()) {
      if (!e.arrestMode) continue;
      if (!w.vehicle && e.dist < 1.6 && w.player.speed < 3.5) close = true;
      if (w.vehicle && e.dist < 3.2 && Math.abs(w.vehicle.speed) < 1.2) close = true;
    }
    for (const c of this.cars) if (w.vehicle && Math.abs(w.vehicle.speed) < 0.8 && c.v.position.distanceTo(w.vehicle.position) < 5.5) close = true;
    this.bustT = close ? this.bustT + dt : Math.max(0, this.bustT - dt * 2);
    if (this.bustT > (w.vehicle ? 3 : 1.3)) void this.bust();
  }

  private async bust(): Promise<void> {
    const ctx = this.ctx;
    const combat = this.combat;
    const w = ctx.world;
    this.busting = true;
    const fine = Math.min(ctx.profile().credits, 150 + this.wanted.stars * 150);
    combat?.hud?.banner('BUSTED', '', true, 2200);
    ctx.sfx('failed');
    await new Promise((r) => setTimeout(r, 1500));
    const lost = combat?.confiscate() ?? [];
    await ctx.modal(() => new Promise<void>((resolve) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;inset:0;background:rgba(5,10,25,.88);display:flex;align-items:center;justify-content:center;pointer-events:auto;z-index:40;font-family:Oswald,sans-serif;color:#fff;text-align:center';
      wrap.innerHTML = `<div><div style="font:400 90px Anton,Oswald,Impact,sans-serif;color:#5aa9e6;letter-spacing:4px;-webkit-text-stroke:3px #000">BUSTED</div>
        <div style="font-size:20px;margin-top:8px">Neon Bay PD, Central Precinct</div>
        <div style="font-size:16px;color:#ccc;margin-top:14px">Fine paid: <b style="color:#72cc72">$${fine}</b>${lost.length ? ` • Weapons confiscated: ${lost.length}` : ''}</div>
        <div style="font-size:13px;color:#888;margin-top:18px">Press any key or click to continue</div></div>`;
      (ctx.hudRoot.parentElement ?? document.body).append(wrap);
      const done = () => { window.removeEventListener('keydown', done, true); wrap.remove(); resolve(); };
      setTimeout(() => { window.addEventListener('keydown', done, true); wrap.addEventListener('click', done); }, 700);
    }));
    ctx.addMoney(-fine);
    if (w.vehicle) w.exitVehicle();
    w.player.place(POLICE_STATION.x, POLICE_STATION.z, 0);
    w.rig.snapTo(w.player.position);
    this.clearWanted();
    this.busting = false;
    ctx.save();
  }

  // ------------------------------------------------------------------ roadblocks + helicopter

  private updateRoadblocks(dt: number): void {
    const w = this.ctx.world;
    for (const rb of [...this.roadblocks]) if (rb.v.position.distanceTo(w.focus) > 170) this.removeCar(rb);
    if (this.wanted.stars < 3 || !w.vehicle || Math.abs(w.vehicle.speed) < 8) return;
    this.roadblockT -= dt;
    if (this.roadblockT > 0 || this.roadblocks.length >= 4) return;
    this.roadblockT = 28;
    const v = w.vehicle;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    // a node ahead of the player
    let best: RoadNode | null = null, bs = -Infinity;
    for (const n of w.traffic.nodes) {
      const dx = n.x - v.position.x, dz = n.z - v.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 90 || d > 180) continue;
      const s = (dx * fx + dz * fz) / d;
      if (s > bs) { bs = s; best = n; }
    }
    if (!best || bs < 0.7) return;
    const across = Math.abs(fx) > Math.abs(fz) ? 0 : Math.PI / 2; // park across the road
    for (const off of [-3.2, 3.2]) {
      const car = new Vehicle(VEHICLE_DEFS.police);
      const ox = Math.abs(fx) > Math.abs(fz) ? 0 : off, oz = Math.abs(fx) > Math.abs(fz) ? off : 0;
      car.place(best.x + ox, best.z + oz, across);
      car.driver = 'ai';
      this.ctx.scene.add(car.root);
      const rb: PoliceCar = { v: car, officers: [], crew: 1, swat: this.wanted.stars >= 4, state: 'roadblock', path: [], pathT: 0, stuck: 0, reverseT: 0, lights: this.addLightBar(car) };
      this.deploy(rb);
      this.roadblocks.push(rb);
    }
    this.refreshCarList();
    this.ctx.notify('Roadblock ahead!', 'warn');
  }

  private updateHeli(dt: number): void {
    const w = this.ctx.world;
    if (this.wanted.stars < 4) {
      if (this.heli) { this.ctx.scene.remove(this.heli.root, this.heli.beam, this.heli.disc); this.heli = null; }
      return;
    }
    if (!this.heli) {
      const root = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: '#1b2238', metalness: 0.4, roughness: 0.5 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.6, 4, 10).rotateX(Math.PI / 2), bodyMat);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 4).translate(0, 0.3, -3.4), bodyMat);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: '#222' }));
      rotor.position.y = 1.3;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.3, 3), new THREE.MeshStandardMaterial({ color: '#f4f6fb' }));
      root.add(body, tail, rotor, stripe);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 1, 24, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: '#fff8d0', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(6, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff8d0', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.ctx.scene.add(root, beam, disc);
      this.heli = { root, rotor, beam, disc, spot: new THREE.Vector3(w.focus.x + 30, 0, w.focus.z), a: 0 };
      this.ctx.notify('Police helicopter overhead. Get under cover!', 'warn');
    }
    const h = this.heli;
    h.a += dt * 0.35;
    const lk = this.wanted.searching ? this.wanted.lastSeen : w.focus;
    _v.set(lk.x + Math.cos(h.a) * 30, 40, lk.z + Math.sin(h.a) * 30);
    h.root.position.lerp(_v, Math.min(1, dt * 0.6));
    h.root.rotation.y = h.a + Math.PI;
    h.rotor.rotation.y += dt * 30;
    // the spotlight sweeps toward the player (or the search area)
    const sweep = this.wanted.searching ? 18 : 0;
    _v2.set(lk.x + Math.sin(h.a * 3.1) * sweep, 0.05, lk.z + Math.cos(h.a * 2.3) * sweep);
    h.spot.lerp(_v2, Math.min(1, dt * (this.seen ? 2.5 : 0.8)));
    h.disc.position.copy(h.spot);
    const top = h.root.position;
    const dy = top.y - h.spot.y;
    h.beam.position.copy(top);
    h.beam.scale.set(1, dy, 1);
    _v.copy(h.spot).sub(top).normalize();
    h.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _v);
  }

  dispose(): void {
    this.removeAllUnits();
    this.ctx?.scene.remove(this.glow);
  }
}
