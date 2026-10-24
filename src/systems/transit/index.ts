import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import { createRig, type Rig } from '../../actors/CharacterModel';
import { Vehicle, VEHICLE_DEFS } from '../../vehicles/Vehicle';
import { PLACES, ROADS_X, ROADS_Z } from '../../world/layout';
import { MENU_CLOSE, money, openMenu } from '../garage/ui';
import { neonSign } from '../garage/buildings';
import { TRAM_FARE, TRAM_ROUTE, TRAM_STOPS, TramController, pointAt, routeLength, taxiFare } from './logic';

// Public transport: the Neon Line open-air trolley along Ocean Drive and the
// z=5 avenue (board at a stop, sit, cinematic camera, get off at any stop),
// plus taxi stands for paid fast travel riding in a cab's back seat.

interface TaxiStand { id: string; name: string; x: number; z: number }

export const TAXI_STANDS: TaxiStand[] = [
  { id: 'beach', name: 'Ocean Drive Beach', x: 175, z: -30 },
  { id: 'hq', name: 'Sunset Shield HQ', x: 157, z: -22 },
  { id: 'cafe', name: 'Coral Café', x: 157, z: 30 },
  { id: 'bazaar', name: 'Byte Bazaar', x: -3.5, z: -50 },
  { id: 'campus', name: 'Bayview University', x: -110, z: -172.5 },
  { id: 'hospital', name: 'Neon Bay General', x: -195, z: 12.5 },
  { id: 'docks', name: 'Harbor Docks', x: 60, z: 167.5 },
];

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

type Ride =
  | { kind: 'tram'; exitAtNext: boolean; boardedAt: number; t: number }
  | { kind: 'taxi'; taxi: Vehicle; driver: Rig; dest: { x: number; z: number; name: string }; t: number; arriving: boolean };

/** Nearest road center line to a point: returns a curbside lane spot + heading. */
export function curbSpot(x: number, z: number): { x: number; z: number; yaw: number } {
  let best = { d: Infinity, x, z, yaw: 0 };
  for (const rx of ROADS_X) {
    const d = Math.abs(x - rx);
    if (d < best.d) { const s = Math.sign(x - rx) || 1; best = { d, x: rx + s * 4.6, z, yaw: s > 0 ? Math.PI : 0 }; }
  }
  for (const rz of ROADS_Z) {
    const d = Math.abs(z - rz);
    if (d < best.d) { const s = Math.sign(z - rz) || 1; best = { d, x, z: rz + s * 4.6, yaw: s > 0 ? Math.PI / 2 : -Math.PI / 2 }; }
  }
  return { x: best.x, z: best.z, yaw: best.yaw };
}

class Transit implements GameSystem {
  readonly id = 'transit';
  private ctx!: SystemContext;
  private built = false;
  private tram!: TramController;
  private tramObj!: THREE.Group;
  private tramPos = new THREE.Vector3();
  private tramYaw = 0;
  private tramObstacles = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private waitingAt: number | null = null;
  private ride: Ride | null = null;
  private camShot = 0;
  private camT = 0;
  private hint: HTMLElement | null = null;
  private time = 0;
  private len = routeLength();

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    if (!this.built) {
      this.built = true;
      try { this.build(); } catch (err) { console.error('[transit] build failed', err); }
    }
    if (this.ride) this.endRide(true);
    this.register();
  }

  // ------------------------------------------------------------------ build

  private build(): void {
    const ctx = this.ctx;
    this.tram = new TramController(TRAM_STOPS.map((s) => s.s), 1);
    this.tramObj = this.buildTram();
    ctx.scene.add(this.tramObj);
    this.buildRails();
    for (const s of TRAM_STOPS) this.buildShelter(s.x, s.z, s.name);
    for (const t of TAXI_STANDS) this.buildTaxiSign(t.x, t.z);
    const extra = ctx.world.traffic.extraObstacles;
    for (const o of this.tramObstacles) extra.push(o);
    this.hint = document.createElement('div');
    this.hint.style.cssText = 'position:absolute;left:50%;top:84px;transform:translateX(-50%);background:rgba(0,0,0,.7);padding:7px 16px;border-left:3px solid #19e6ff;font-family:Oswald,Rajdhani,sans-serif;font-size:17px;color:#fff;display:none;white-space:nowrap;pointer-events:none';
    ctx.hudRoot.append(this.hint);
  }

  private buildTram(): THREE.Group {
    const g = new THREE.Group();
    const L = 12, W = 2.6;
    const m = (c: string, r = 0.6, me = 0, em?: string, ei = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me, emissive: em ?? '#000', emissiveIntensity: ei });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const teal = m('#19c3d6', 0.45, 0.2), pink = m('#ff7cc6', 0.5), cream = m('#f6efe2', 0.6), wood = m('#9b6a43', 0.7), dark = m('#25222e', 0.6);
    add(new THREE.BoxGeometry(W, 0.35, L), teal, 0, 0.75, 0); // floor/chassis
    add(new THREE.BoxGeometry(W + 0.02, 0.5, L), pink, 0, 1.15, 0); // side skirt
    add(new THREE.BoxGeometry(W + 0.1, 0.18, L + 0.3), cream, 0, 3.35, 0); // roof
    add(new THREE.BoxGeometry(W - 0.2, 0.25, L - 0.4), teal, 0, 3.55, 0);
    for (const z of [-L / 2 + 0.15, L / 2 - 0.15]) {
      add(new THREE.BoxGeometry(W, 2.0, 0.3), teal, 0, 2.2, z); // end cabs
      add(new THREE.BoxGeometry(W - 0.6, 0.8, 0.05), new THREE.MeshPhysicalMaterial({ color: '#16202e', roughness: 0.05, transparent: true, opacity: 0.85 }), 0, 2.5, z + Math.sign(z) * 0.16);
      for (const x of [-0.85, 0.85]) add(new THREE.SphereGeometry(0.14, 10, 8), m('#ffffff', 0.3, 0, '#fff4d6', 2), x, 1.3, z + Math.sign(z) * 0.18);
      const sign = neonSign('NEON LINE', '#ffd23f', 2.2, 0.45);
      sign.position.set(0, 3.0, z + Math.sign(z) * 0.17);
      if (z < 0) sign.rotation.y = Math.PI;
      g.add(sign);
    }
    for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) for (let z = -L / 2 + 1.5; z <= L / 2 - 1.5; z += 2.25) add(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), m('#dddddd', 0.3, 0.9), x, 2.25, z);
    for (let z = -L / 2 + 1.6; z <= L / 2 - 1.6; z += 1.5) {
      add(new THREE.BoxGeometry(W - 0.5, 0.12, 0.55), wood, 0, 1.35, z); // bench seat
      add(new THREE.BoxGeometry(W - 0.5, 0.5, 0.08), wood, 0, 1.65, z - 0.27);
    }
    for (const z of [-L / 2 + 2.2, L / 2 - 2.2]) add(new THREE.BoxGeometry(W - 0.4, 0.4, 1.8), dark, 0, 0.35, z); // bogies
    const neon = add(new THREE.BoxGeometry(W + 0.14, 0.06, L + 0.32), m('#ff2fa0', 0.4, 0, '#ff2fa0', 2.4), 0, 3.24, 0);
    neon.castShadow = false;
    add(new THREE.BoxGeometry(0.06, 1.2, 0.06), dark, 0, 4.2, 0).rotation.x = 0.5; // trolley pole
    return g;
  }

  private buildRails(): void {
    const mat = new THREE.MeshStandardMaterial({ color: '#9aa0aa', roughness: 0.35, metalness: 0.9 });
    for (let i = 1; i < TRAM_ROUTE.length; i++) {
      const a = TRAM_ROUTE[i - 1], b = TRAM_ROUTE[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      for (const off of [-0.72, 0.72]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, len + 1.5), mat);
        r.position.set((a.x + b.x) / 2 + Math.cos(yaw) * off, 0.03, (a.z + b.z) / 2 - Math.sin(yaw) * off);
        r.rotation.y = yaw;
        r.receiveShadow = true;
        this.ctx.scene.add(r);
      }
    }
  }

  private buildShelter(x: number, z: number, name: string): void {
    const g = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: '#f6f2ff', roughness: 0.4, metalness: 0.5 });
    const roof = new THREE.MeshStandardMaterial({ color: '#19c3d6', roughness: 0.5 });
    const bench = new THREE.MeshStandardMaterial({ color: '#ff7cc6', roughness: 0.6 });
    const box = (w: number, h: number, d: number, mat: THREE.Material, px: number, py: number, pz: number) => {
      const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mm.position.set(px, py, pz);
      mm.castShadow = true;
      g.add(mm);
    };
    box(3.6, 0.12, 1.6, roof, 0, 2.6, 0);
    for (const px of [-1.7, 1.7]) box(0.08, 2.5, 0.08, frame, px, 1.3, -0.7);
    box(3.4, 0.1, 0.5, bench, 0, 0.6, -0.5);
    const sign = neonSign(name.toUpperCase(), '#19e6ff', 3.2, 0.5, 'NEON LINE TRAM');
    sign.position.set(0, 3.05, 0.1);
    g.add(sign);
    g.position.set(x, 0.18, z);
    // face the road
    const toRoad = Math.abs(x - 165) < 12 ? Math.PI / 2 : 0;
    g.rotation.y = toRoad;
    this.ctx.scene.add(g);
  }

  private buildTaxiSign(x: number, z: number): void {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), new THREE.MeshStandardMaterial({ color: '#dddddd', metalness: 0.8, roughness: 0.3 }));
    pole.position.y = 1.4;
    g.add(pole);
    const sign = neonSign('TAXI', '#ffd23f', 1.2, 0.5);
    sign.position.y = 2.9;
    g.add(sign);
    const sign2 = sign.clone();
    sign2.rotation.y = Math.PI / 2;
    g.add(sign2);
    g.position.set(x, 0.18, z);
    this.ctx.scene.add(g);
  }

  private register(): void {
    const ctx = this.ctx, w = ctx.world;
    TRAM_STOPS.forEach((s, i) => {
      ctx.interactions.set({
        id: `transit-stop-${s.id}`, x: s.x, z: s.z, radius: 4, priority: 1,
        title: `Neon Line tram · ${s.name}`,
        desc: `Ride for ${money(TRAM_FARE)}`,
        enabled: () => !w.vehicle && !this.ride,
        action: () => this.requestTram(i),
      });
    });
    for (const t of TAXI_STANDS) {
      ctx.interactions.set({
        id: `transit-taxi-${t.id}`, x: t.x, z: t.z, radius: 3.5, priority: 1,
        title: 'Hail a taxi', desc: 'Fast travel anywhere in Neon Bay',
        enabled: () => !w.vehicle && !this.ride,
        action: () => void this.hailTaxi(t),
      });
    }
  }

  /** Map blips: tram stops and taxi stands. */
  blips(): { x: number; z: number; kind: 'place'; color: string; label: string }[] {
    return [
      ...TRAM_STOPS.map((s) => ({ x: s.x, z: s.z, kind: 'place' as const, color: '#19e6ff', label: `Tram: ${s.name}` })),
      ...TAXI_STANDS.map((t) => ({ x: t.x, z: t.z, kind: 'place' as const, color: '#ffd23f', label: 'Taxi stand' })),
    ];
  }

  /** True while the player rides as a passenger (tram or taxi). */
  get riding(): boolean {
    return !!this.ride;
  }

  // ------------------------------------------------------------------ tram

  private requestTram(i: number): void {
    const ctx = this.ctx;
    if (this.tram.docked && this.tram.at === i) { this.board(); return; }
    this.waitingAt = i;
    ctx.notify(`The tram to [y]${TRAM_STOPS[this.tram.dir > 0 ? TRAM_STOPS.length - 1 : 0].name}[/y] arrives in about ${Math.ceil(this.tram.eta(i))}s. Wait at the stop, or hold ~Space~ to skip the wait.`, 'info');
  }

  private board(): void {
    const ctx = this.ctx, w = ctx.world;
    if (!ctx.addMoney(-TRAM_FARE)) { ctx.notify('You need $5 for the tram.', 'warn'); return; }
    this.waitingAt = null;
    w.player.active = false;
    this.ride = { kind: 'tram', exitAtNext: false, boardedAt: this.tram.at, t: 0 };
    this.camShot = 0;
    this.camT = 0;
    ctx.sfx('door');
    ctx.notify('All aboard the Neon Line. ~E~ gets you off at the next stop, hold ~Space~ to fast-forward.', 'info');
    this.registerRideExit();
  }

  private registerRideExit(): void {
    const ctx = this.ctx;
    ctx.interactions.set({
      id: 'transit-ride', x: 0, z: 0, radius: 1e6, priority: 50,
      title: this.ride?.kind === 'taxi' ? 'Skip the ride' : this.tram.docked ? 'Get off here' : 'Get off at next stop',
      desc: this.ride?.kind === 'taxi' ? 'Arrive at your destination' : `Next: ${TRAM_STOPS[this.tram.docked ? this.tram.at : this.tram.next].name}`,
      enabled: () => !!this.ride,
      action: () => {
        const r = this.ride;
        if (!r) return;
        if (r.kind === 'taxi') { void this.arriveTaxi(); return; }
        if (this.tram.docked && r.t > 1) this.endRide(false);
        else { r.exitAtNext = true; ctx.notify(`Getting off at [y]${TRAM_STOPS[this.tram.next].name}[/y].`, 'info'); }
      },
    });
  }

  private endRide(silent: boolean): void {
    const ctx = this.ctx, w = ctx.world;
    const r = this.ride;
    this.ride = null;
    ctx.interactions.remove('transit-ride');
    if (!r) return;
    const rig = w.player.rig;
    rig.root.quaternion.identity();
    if (r.kind === 'tram') {
      const s = TRAM_STOPS[this.tram.at];
      w.player.place(s.x, s.z, this.tramYaw);
    } else {
      const off = r.taxi.def.width / 2 + 1;
      w.player.place(r.taxi.position.x - Math.cos(r.taxi.yaw) * off, r.taxi.position.z + Math.sin(r.taxi.yaw) * off, r.taxi.yaw);
      // the cab drives off, then disappears
      const taxi = r.taxi, driver = r.driver;
      setTimeout(() => {
        w.traffic.release(taxi);
        ctx.scene.remove(taxi.root, driver.root);
      }, 9000);
    }
    w.player.active = true;
    w.player.sync();
    w.rig.snapTo(w.player.position);
    if (!silent) ctx.sfx('door');
  }

  private updateTram(dt: number): void {
    const ctx = this.ctx;
    const fast = this.ride?.kind === 'tram' && ctx.input.isDown('Space') && !this.tram.docked;
    // waiting at a stop: Space skips the wait too (no one likes a two-minute tram)
    const wait = this.waitingAt !== null ? TRAM_STOPS[this.waitingAt] : null;
    const me = ctx.world.player.position;
    const fastWait = !!wait && !this.ride && !ctx.world.vehicle && ctx.input.isDown('Space') && Math.hypot(me.x - wait.x, me.z - wait.z) < 9;
    const arrived = this.tram.step(dt * (fast ? 6 : fastWait ? 10 : 1));
    const p = pointAt(this.tram.s);
    // smooth heading around the corner: look a few meters ahead/behind
    const a = pointAt(this.tram.s - 4), b = pointAt(this.tram.s + 4);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) + (this.tram.dir < 0 ? Math.PI : 0);
    this.tramPos.set(p.x, 0, p.z);
    this.tramYaw = yaw;
    this.tramObj.position.set(p.x, 0.05, p.z);
    this.tramObj.rotation.y = yaw;
    // obstacles for traffic AI (front, middle, back)
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    this.tramObstacles[0].set(p.x + fx * 5, 0, p.z + fz * 5);
    this.tramObstacles[1].set(p.x, 0, p.z);
    this.tramObstacles[2].set(p.x - fx * 5, 0, p.z - fz * 5);
    void this.len;
    // push the player's car out of the tram (simple capsule)
    const v = ctx.world.vehicle;
    if (v && v.medium === 'land' && v.position.y < 3) {
      for (const o of this.tramObstacles) {
        const dx = v.position.x - o.x, dz = v.position.z - o.z;
        const d = Math.hypot(dx, dz), min = 2.6 + v.def.width / 2;
        if (d > 0.01 && d < min) {
          const nx = dx / d, nz = dz / d;
          v.position.x += nx * (min - d);
          v.position.z += nz * (min - d);
          const vn = v.velocity.x * nx + v.velocity.z * nz;
          if (vn < 0) {
            v.velocity.x -= nx * vn * 1.4; v.velocity.z -= nz * vn * 1.4;
            if (-vn > 4) { v.onImpact?.(-vn / 12); v.damage(-vn * 12); }
          }
        }
      }
    }
    if (arrived !== null) {
      if (this.waitingAt === arrived) {
        const s = TRAM_STOPS[arrived];
        const pp = ctx.world.player.position;
        if (!this.ride && !ctx.world.vehicle && Math.hypot(pp.x - s.x, pp.z - s.z) < 9) this.board();
        else this.waitingAt = null;
      }
      const r = this.ride;
      if (r?.kind === 'tram') {
        ctx.sfx('beep');
        if (r.exitAtNext) this.endRide(false);
        else ctx.notify(`[y]${TRAM_STOPS[arrived].name}[/y]. ~E~ to get off.`, 'info');
      }
    }
    if (this.ride?.kind === 'tram') this.registerRideExit();
  }

  // ------------------------------------------------------------------ taxi

  private async hailTaxi(stand: TaxiStand): Promise<void> {
    const ctx = this.ctx, w = ctx.world;
    const dests = [
      ...Object.values(PLACES).map((p) => ({ name: p.name, x: p.x, z: p.z })),
      ...TAXI_STANDS.filter((t) => t.id !== stand.id).map((t) => ({ name: `${t.name} taxi stand`, x: t.x, z: t.z })),
    ].filter((d) => Math.hypot(d.x - stand.x, d.z - stand.z) > 40);
    let pick: { name: string; x: number; z: number } | null = null;
    await ctx.modal(() => openMenu(ctx.hudRoot, {
      title: 'Bay Cab', subtitle: 'Where to?', accent: ['#ffd23f', '#ff8a3d'],
      footer: () => `Wallet: <b>${money(ctx.profile().credits)}</b>`,
      items: () => dests.map((d) => {
        const fare = taxiFare(Math.hypot(d.x - stand.x, d.z - stand.z));
        return { label: d.name, right: money(fare), disabled: ctx.profile().credits < fare, action: () => { pick = d; return MENU_CLOSE; } };
      }),
    }));
    const dest = pick as { name: string; x: number; z: number } | null;
    if (!dest || w.vehicle || this.ride) return;
    const fare = taxiFare(Math.hypot(dest.x - stand.x, dest.z - stand.z));
    if (!ctx.addMoney(-fare)) { ctx.notify('Not enough cash for the fare.', 'warn'); return; }
    ctx.sfx('cash');
    const spot = curbSpot(stand.x, stand.z);
    const taxi = new Vehicle(VEHICLE_DEFS.taxi);
    taxi.place(spot.x, spot.z, spot.yaw);
    ctx.scene.add(taxi.root);
    w.traffic.adopt(taxi, undefined, 13);
    const driver = createRig({ shirt: '#ffd23f', accent: '#1a1a1a', pattern: 'plain', pants: '#3a3a44', skin: '#8d5a3b', hair: '#1a1a1a', shoes: '#222222', sunglasses: false, hairStyle: 'short', build: 1.1 } as Parameters<typeof createRig>[0], { seed: 7 });
    ctx.scene.add(driver.root);
    w.player.active = false;
    this.ride = { kind: 'taxi', taxi, driver, dest, t: 0, arriving: false };
    this.camShot = 1;
    this.camT = 0;
    ctx.sfx('door');
    ctx.notify(`Taxi to [y]${dest.name}[/y] (${money(fare)}). Sit back — ~E~ or ~Space~ to skip.`, 'info');
    this.registerRideExit();
  }

  private async arriveTaxi(): Promise<void> {
    const r = this.ride;
    if (!r || r.kind !== 'taxi' || r.arriving) return;
    r.arriving = true;
    const ctx = this.ctx;
    await ctx.ui.fade(true);
    const spot = curbSpot(r.dest.x, r.dest.z);
    r.taxi.place(spot.x, spot.z, spot.yaw);
    ctx.world.traffic.adopt(r.taxi, undefined, 13);
    this.placeTaxiRiders(r.taxi, r.driver, 0);
    this.endRide(false);
    await ctx.ui.fade(false);
    ctx.notify(`Arrived at [y]${r.dest.name}[/y]. Thanks for riding Bay Cab.`, 'good');
  }

  private placeTaxiRiders(taxi: Vehicle, driver: Rig, dt: number): void {
    taxi.body.getWorldQuaternion(_q);
    taxi.seatWorld(_v, false);
    driver.root.position.copy(_v);
    driver.root.quaternion.copy(_q);
    driver.body.rotation.y = 0;
    driver.animate(dt, 0, false, true);
  }

  // ------------------------------------------------------------------ frame

  update(dt: number, ctx: SystemContext): void {
    this.time += dt;
    if (!this.tramObj) return;
    this.updateTram(dt);
    const r = this.ride;
    if (r) {
      r.t += dt;
      if (ctx.world.vehicle) { this.endRide(true); return; }
      if (r.kind === 'taxi') {
        if ((r.t > 7 || (r.t > 0.6 && ctx.input.wasPressed('Space'))) && !r.arriving) void this.arriveTaxi();
      }
    }
  }

  always(dt: number, ctx: SystemContext): void {
    const r = this.ride;
    const w = ctx.world;
    if (this.hint) {
      this.hint.style.display = r && !ctx.isBusy() ? '' : 'none';
      if (r?.kind === 'tram') this.hint.innerHTML = `NEON LINE · next stop <b>${TRAM_STOPS[this.tram.docked ? this.tram.at : this.tram.next].name}</b> · <span class="vp-chip">E</span> get off · hold <span class="vp-chip">Space</span> fast-forward`;
      else if (r?.kind === 'taxi') this.hint.innerHTML = `BAY CAB to <b>${r.dest.name}</b> · <span class="vp-chip">Space</span> skip`;
    }
    if (!r) return;
    const rig = w.player.rig;
    let anchor: THREE.Vector3, yaw: number;
    if (r.kind === 'tram') {
      const seatZ = -2.4;
      const fx = Math.sin(this.tramYaw), fz = Math.cos(this.tramYaw);
      _v.set(this.tramPos.x + fx * seatZ + Math.cos(this.tramYaw) * 0.5, 1.0, this.tramPos.z + fz * seatZ - Math.sin(this.tramYaw) * 0.5);
      rig.root.position.copy(_v);
      rig.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.tramYaw);
      anchor = this.tramPos;
      yaw = this.tramYaw;
    } else {
      this.placeTaxiRiders(r.taxi, r.driver, dt);
      r.taxi.seatWorld(_v, true);
      rig.root.position.copy(_v);
      r.taxi.body.getWorldQuaternion(_q);
      rig.root.quaternion.copy(_q);
      anchor = r.taxi.position;
      yaw = r.taxi.yaw;
    }
    rig.body.rotation.y = 0;
    rig.root.visible = true;
    rig.animate(dt, 0, false, true);
    // keep the world focused on the rider
    w.player.position.set(rig.root.position.x, 0, rig.root.position.z);
    // cinematic camera
    this.camT += dt;
    if (this.camT > 7) { this.camT = 0; this.camShot = (this.camShot + 1) % 3; }
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const cam = ctx.camera;
    if (this.camShot === 0) cam.position.set(anchor.x + rx * 9 + fx * 7, 3.2, anchor.z + rz * 9 + fz * 7);
    else if (this.camShot === 1) cam.position.set(anchor.x - fx * 11 - rx * 3, 4.5, anchor.z - fz * 11 - rz * 3);
    else cam.position.set(anchor.x - rx * 7 - fx * 2, 1.8, anchor.z - rz * 7 - fz * 2);
    cam.lookAt(anchor.x + fx * 2, 1.6, anchor.z + fz * 2);
  }
}

export type TransitSystem = Transit;

export default function create(): GameSystem {
  return new Transit();
}
