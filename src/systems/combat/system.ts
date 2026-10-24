import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import type { Ped } from '../../actors/Pedestrians';
import type { Vehicle } from '../../vehicles/Vehicle';
import { isWater, PLACES } from '../../world/layout';
import { COMBAT_HOOKS, DIRECTOR_LINK } from '../../scripting/combatHooks';
import type { CrimeKind } from '../police/wanted';
import { Arsenal, WEAPONS, applyDamage, damageAt, isFirearm, isWeaponId, spreadFor, type ArsenalSave, type HitPart, type WeaponId } from './weapons';
import { Effects } from './effects';
import { CombatHud, type WheelItem } from './hud';
import { Enemy, EnemyManager, type EnemyHost } from './enemies';
import { enemyCap } from './enemyTypes';
import { Pickups, parseItem, type PickupKind } from './pickups';
import { buildWeapon, muzzleOffset } from './models';
import { COMBAT_AUDIO } from './audio';
import { findBones, poseAim, poseBlock, poseCrouch, poseHandsUp, posePunch, poseKick, poseSwing, type BoneSet } from './bones';
import { coneDirection, pedHit, pointRayDistance, rayVehicle, type Shootable, type VehiclePart } from './trace';
import { CombatActivities } from './activities';
import { negotiate } from './negotiate';

// The player's side of combat: weapons, aiming (over-the-shoulder camera,
// shoulder swap, zoom), shooting (hitscan with spread/recoil), melee combos and
// blocking, cover, Focus slow-motion, the weapon wheel, takedowns, disarms,
// human shields, looting, pickups, armor/health, drive-bys, intimidation and
// the kill cam. Enemies live in EnemyManager; police and crime are separate
// systems that cooperate through ctx.system().

interface PoliceApi extends GameSystem {
  reportCrime(kind: CrimeKind, x: number, z: number, opts?: { loud?: number; victimCop?: boolean }): void;
  readonly stars: number;
  clearWanted(): void;
  setWanted(level: number): void;
  wantedCleared(): Promise<void>;
  vehiclesForCombat?(): readonly Vehicle[];
}

interface CombatSave { arsenal: ArsenalSave; armor: number; focus: number; rangeBest: number; arenaWins: number }

interface VehicleDamage { health: number; engine: number; tires: number; wrecked: boolean; smokeT: number }

interface DownedPed { ped: Ped; t: number; dead: boolean }

type MeleeKind = 'punchR' | 'punchL' | 'kick' | 'swing';
type TraceKind = 'none' | 'world' | 'enemy' | 'ped' | 'vehicle' | 'shootable';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _shot = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _hitP = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _fwd = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _pedHit = { t: 0, part: 'body' as HitPart, ped: null as Ped | null };
const _vehHit = { part: 'body' as VehiclePart, tire: -1 };

/** Police station where busted players are released. */
export const POLICE_STATION = { x: 14, z: 16 };

export class CombatSystem implements GameSystem {
  readonly id = 'combat';
  ctx!: SystemContext;
  readonly arsenal = new Arsenal();
  armor = 0;
  focus = 1;
  focusActive = false;
  hud: CombatHud | null = null;
  effects!: Effects;
  enemies!: EnemyManager;
  pickups!: Pickups;
  activities!: CombatActivities;
  readonly shootables = new Set<Shootable>();
  readonly noise = { x: 0, z: 0, r: 0, t: -99 };
  /** Game-time clock (scaled). */
  time = 0;
  private realLast = performance.now();
  private realDt = 0.016;

  // aiming / camera
  aiming = false;
  firing = false;
  private aimBlend = 0;
  private shoulder = 1;
  readonly aimDir = new THREE.Vector3(0, 0, 1);
  readonly aimOrigin = new THREE.Vector3();
  private readonly camOffset = new THREE.Vector3();
  private lastPos = new THREE.Vector3();
  private lastPosValid = false;
  private hostileAim = false;
  private scoped = false;

  // weapon wheel
  private qDown = -1;
  private wheelOpen = false;
  private wheelVec = new THREE.Vector2();
  private wheelSel = 0;
  private wheelItems: WheelItem[] = [];

  // melee
  private meleeT = 0;
  private meleeDur = 0;
  private meleeKind: MeleeKind | null = null;
  private meleeDone = false;
  private combo = 0;
  private comboWindow = 0;
  blocking = false;

  // cover
  inCover = false;
  private coverNormal = new THREE.Vector3();
  private coverPoint = new THREE.Vector3();
  private coverLow = true;
  private coverVehicle: Vehicle | null = null;

  // player state
  private lastDamage = -99;
  private hurt = 0;
  private dying = false;
  private wasDead = false;
  private playerBones: BoneSet | null = null;
  private bonesRoot: THREE.Object3D | null = null;
  private weaponMesh: THREE.Group | null = null;
  private weaponKey = '';
  private shield: Enemy | null = null;
  /** Game time of the last crime the player committed. */
  lastCrimeT = -99;
  private coverPosed = false;
  private dieAt = 0;

  // peds / vehicles
  private pedHealth = new WeakMap<Ped, number>();
  private downed: DownedPed[] = [];
  private intimidate: { ped: Ped; t: number; dropped: boolean } | null = null;
  private robbedPeds = new WeakSet<Ped>();
  private pedBones = new WeakMap<Ped, BoneSet>();
  private vdmg = new Map<Vehicle, VehicleDamage>();

  // kill cam
  private killcam: { at: THREE.Vector3; until: number; yaw: number } | null = null;
  private recentHostiles = 0;
  private slowActive = false;
  private saveT = 0;
  rangeBest = 0;
  arenaWins = 0;

  /** Optional listeners (crime system: store shots, robbery aiming). */
  readonly onShot: ((x: number, z: number, weapon: WeaponId) => void)[] = [];
  readonly onEnemyDown: ((e: Enemy, lethal: boolean) => void)[] = [];

  private get police(): PoliceApi | undefined { return this.ctx.system<PoliceApi>('police'); }

  // ------------------------------------------------------------------ setup

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    if (!this.hud) {
      this.hud = new CombatHud(ctx.hudRoot);
      this.effects = new Effects(ctx.scene);
      this.pickups = new Pickups(ctx.scene);
      this.enemies = new EnemyManager(this.enemyHost());
      this.activities = new CombatActivities(this);
      window.addEventListener('mousemove', this.swallowMouse, { capture: true });
      this.registerHooks();
    }
    this.enemies.cap = enemyCap(ctx.settings().quality);
    const data = ctx.getData<CombatSave | null>('combat', null);
    this.arsenal.load(data?.arsenal);
    this.armor = Math.max(0, Math.min(100, data?.armor ?? 0));
    this.focus = Math.max(0, Math.min(1, data?.focus ?? 1));
    this.rangeBest = data?.rangeBest ?? 0;
    this.arenaWins = data?.arenaWins ?? 0;
    this.activities.init(ctx);
    this.lastPosValid = false;
  }

  persist(): void {
    this.ctx.setData('combat', { arsenal: this.arsenal.save(), armor: Math.round(this.armor), focus: this.focus, rangeBest: this.rangeBest, arenaWins: this.arenaWins } satisfies CombatSave);
  }

  private swallowMouse = (e: MouseEvent): void => {
    if (!this.wheelOpen) return;
    this.wheelVec.x += e.movementX;
    this.wheelVec.y += e.movementY;
    if (this.wheelVec.length() > 120) this.wheelVec.setLength(120);
    e.stopImmediatePropagation();
  };

  private enemyHost(): EnemyHost {
    const self = this;
    return {
      get scene() { return self.ctx.scene; },
      get collision() { return self.ctx.world.city.collision; },
      get effects() { return self.effects; },
      noise: this.noise,
      targetPoint: (out) => {
        const w = self.ctx.world;
        if (w.vehicle) return out.copy(w.vehicle.position).setY(w.vehicle.position.y + 1.1);
        const crouch = self.inCover && !self.aiming;
        return out.copy(w.player.position).setY(w.player.position.y + (crouch ? 0.75 : 1.3));
      },
      targetSpeed: () => (self.ctx.world.vehicle ? Math.abs(self.ctx.world.vehicle.speed) : self.ctx.world.player.speed),
      targetInCover: () => self.inCover && (!self.aiming || self.coverLow),
      shotBlocked: (from) => self.shotBlocked(from),
      damagePlayer: (dmg, from, melee) => self.damagePlayer(dmg, from, melee),
      time: () => self.time,
      accuracyScale: () => (self.focusActive ? 0.55 : 1) * (self.ctx.world.vehicle ? 0.6 : 1),
      onKilled: (e, byPlayer, lethal) => self.onEnemyNeutralized(e, byPlayer, lethal),
      holdFire: () => self.shield !== null && self.shield.state === 'shield',
    };
  }

  // ------------------------------------------------------------------ public API

  giveWeapon(id: WeaponId, ammo: number, select = true): void {
    const isNew = this.arsenal.give(id, ammo);
    if (select && (isNew || this.arsenal.current === 'fists')) this.arsenal.select(id);
    if (isNew) this.ctx.notify(`Picked up [y]${WEAPONS[id].name}[/y]. Hold ~Q~ for the weapon wheel.`, 'good');
    this.persist();
  }

  spawnEnemy(type: string, x: number, z: number, heading: number, opts: { mission?: boolean; group?: number } = {}): Enemy | null {
    return this.enemies.spawn(type, x, z, heading, opts);
  }

  spawnPickup(kind: PickupKind, x: number, z: number, persistent = false): void {
    const y = this.ctx.world.city.collision.groundHeight(x, z, 2);
    this.pickups.spawn(kind, x, z, y, persistent);
  }

  addShootable(s: Shootable): void { this.shootables.add(s); }
  removeShootable(s: Shootable): void { this.shootables.delete(s); }

  /** True while the player aims a firearm at a point (within `radius` of the aim ray, up to `range`). */
  aimingAt(p: THREE.Vector3, radius: number, range = 15): boolean {
    if (!(this.aiming || this.firing) || !isFirearm(this.arsenal.active)) return false;
    const w = this.ctx.world.player.position;
    if (w.distanceTo(p) > range) return false;
    return pointRayDistance(p, this.aimOrigin, this.aimDir, range + 10) < radius;
  }

  /** The over-the-shoulder camera offset applied this frame (for the integrator). */
  cameraOffset(): THREE.Vector3 { return this.camOffset; }

  /** Requested game time scale (weapon wheel, Focus, kill cam). */
  timeScale(): number {
    if (this.killcam) return 0.25;
    if (this.wheelOpen) return 0.3;
    if (this.focusActive) return 0.4;
    return 1;
  }

  speedMultiplier(): number {
    if (this.shield) return 0.45;
    if (this.inCover) return 0.55;
    if (this.blocking) return 0.5;
    return 1;
  }

  /** Busted by the police: confiscate firearms, drop armor. */
  confiscate(): WeaponId[] {
    const lost = this.arsenal.confiscate();
    this.armor = 0;
    this.releaseShield(false);
    this.persist();
    return lost;
  }

  /** Hostile enemies and nearby weapon pickups for the minimap. */
  blips(): { x: number; z: number; color: string; kind: 'target' | 'shop'; label?: string }[] {
    const out: { x: number; z: number; color: string; kind: 'target' | 'shop'; label?: string }[] = [];
    for (const e of this.enemies.list) {
      if (e.neutralized || e.type.faction === 'fighter') continue;
      if (e.brain.hostile || e.mission) out.push({ x: e.pos.x, z: e.pos.z, color: e.type.faction === 'police' ? '#5aa9e6' : '#e0453a', kind: 'target' });
    }
    out.push(...this.activities.blips());
    return out;
  }

  /** Report a crime to the police system (if present). */
  crime(kind: CrimeKind, x: number, z: number, opts?: { loud?: number; victimCop?: boolean }): void {
    this.lastCrimeT = this.time;
    this.police?.reportCrime(kind, x, z, opts);
  }

  // ------------------------------------------------------------------ frame

  update(dt: number, ctx: SystemContext): void {
    const now = performance.now();
    this.realDt = Math.min(0.05, (now - this.realLast) / 1000);
    this.realLast = now;
    this.time += dt;
    const w = ctx.world;
    const p = w.player;
    const input = ctx.input;

    // hospital respawn (Game resets health after "wasted")
    // (death usually lands mid-update and the hospital screen opens before the next one, so check `dying` too)
    if ((this.wasDead || this.dying) && p.health > 1) this.onRespawn();
    this.wasDead = p.health <= 0;
    if (this.dying && p.health <= 0 && now - this.dieAt > 7000) {
      // the hospital flow never ran (another screen was open): patch the player up ourselves
      p.health = p.maxHealth * 0.5;
      p.place(PLACES.hospital.x, PLACES.hospital.z, Math.PI);
      w.rig.snapTo(p.position);
      this.onRespawn();
    }

    this.arsenal.update(dt) && COMBAT_AUDIO.play('reload');
    // GTA-style: an emptied magazine reloads by itself
    const st = this.arsenal.state;
    if (isFirearm(this.arsenal.active) && st.mag <= 0 && st.reserve > 0 && !this.arsenal.reloading && this.arsenal.startReload()) COMBAT_AUDIO.play('reload');
    if (this.switchFlash > 0) this.switchFlash -= this.realDt;
    COMBAT_AUDIO.setVolume(ctx.settings().master * ctx.settings().sfx * 0.7);

    const onFoot = !w.vehicle && p.active;
    const controls = !this.dying && input.enabled;

    if (controls) this.handleKeys(dt, onFoot);

    // aim / fire intent
    const def = this.arsenal.def;
    if (this.eatClick && !input.mouseDown(0)) this.eatClick = false;
    const fire = controls && input.mouseDown(0) && !this.wheelOpen && !this.eatClick;
    const firePressed = controls && input.mousePressed(0) && !this.wheelOpen && !this.eatClick;
    const rmb = controls && input.mouseDown(2) && !this.wheelOpen;
    const melee = def.cls === 'melee';
    const canDriveBy = !!w.vehicle && (def.id === 'pistol' || def.id === 'smg' || def.id === 'taser');
    this.blocking = onFoot && melee && rmb && p.stamina > 0.05;
    this.aiming = rmb && !melee && (onFoot ? !isWater(p.position.x, p.position.z) : canDriveBy);
    this.firing = !melee && fire && (onFoot || canDriveBy);
    this.scoped = this.aiming && onFoot && def.id === 'sniper' && this.aimBlend > 0.85;

    // camera-forward aim ray
    ctx.camera.getWorldDirection(_fwd);
    this.aimDir.copy(_fwd);
    // shots leave from the camera the player actually sees: the rig rebuilt it this frame
    // without the over-the-shoulder shift, so re-apply last frame's shift (else bullets miss the crosshair)
    this.aimOrigin.copy(ctx.camera.position).add(this.camOffset);

    if (onFoot) this.updateOnFoot(dt, fire, firePressed);
    else if (w.vehicle && (this.aiming || this.firing) && fire) this.tryShoot(firePressed, true);
    if (w.vehicle && this.inCover) this.inCover = false;
    if (!onFoot) { this.lastPosValid = false; this.releaseShield(false); }

    this.updateVehiclesHitting();
    this.updateCamera(dt, onFoot);
    this.updatePlayerPose(onFoot);
    this.enemies.update(dt, w.focus);
    this.updateShield();
    this.updatePeds(dt);
    this.updateVehicleDamage(dt);
    this.effects.update(dt);
    this.updatePickups(dt, onFoot);
    this.updateInteractions(onFoot);
    this.updateHealth(dt);
    this.updateFocus();
    this.updateTimeScale();
    this.activities.update(dt);
    this.saveT += dt;
    if (this.saveT > 5) { this.saveT = 0; this.persist(); }
  }

  always(_dt: number, ctx: SystemContext): void {
    const hud = this.hud;
    if (!hud) return;
    const busy = ctx.isBusy();
    hud.setVisible(!busy);
    if (busy) {
      if (this.wheelOpen) this.closeWheel(false);
      ctx.interactions.remove('combat-act');
      return;
    }
    const w = ctx.world;
    const s = this.arsenal.state;
    const def = this.arsenal.def;
    hud.setWeapon(this.arsenal.active, s.mag, s.reserve, this.arsenal.reloading ? 1 - this.arsenal.reloadT / def.reloadTime : 0, this.arsenal.magSize(s.id));
    hud.showWeaponPanel(this.arsenal.active !== 'fists' || this.aiming || this.meleeT > 0 || this.wheelOpen || this.switchFlash > 0);
    const showCross = (this.aiming || this.firing || (def.cls === 'melee' && this.meleeT > 0)) && !this.scoped;
    const spread = spreadFor(def, this.aiming, w.player.speed > 0.5, this.arsenal.bloom, this.arsenal.hasUpgrade(def.id, 'scope'));
    const px = (Math.tan(spread) / Math.tan((ctx.camera.fov * Math.PI) / 360)) * (window.innerHeight / 2);
    hud.setCrosshair(showCross || (this.aiming && !this.scoped), px, this.hostileAim, def.cls === 'melee');
    hud.setScope(this.scoped);
    hud.setArmor(this.armor / 100);
    hud.setFocus(this.focus, this.focusActive);
    const low = w.player.health < 25 && w.player.health > 0;
    this.hurt = Math.max(0, this.hurt - _dt * 1.5);
    hud.setVignette(Math.max(this.hurt, low ? 0.45 : 0, this.dying ? 0.9 : 0), low);
    hud.setStatus(this.statusText());
  }

  private statusText(): string | null {
    if (this.shield) return 'Human shield  •  E release';
    if (this.inCover) return this.aiming ? null : 'In cover  •  aim to pop out  •  Q leave';
    if (this.arsenal.reloading) return 'Reloading';
    if (this.focusActive) return 'Focus';
    if (this.blocking) return 'Blocking';
    return null;
  }

  // ------------------------------------------------------------------ input

  private handleKeys(dt: number, onFoot: boolean): void {
    const input = this.ctx.input;
    const p = this.ctx.world.player;
    // weapon wheel (hold Q) / cover (tap Q)
    if (input.wasPressed('KeyQ')) this.qDown = this.time;
    if (this.qDown >= 0) {
      const held = this.realHeld();
      if (input.isDown('KeyQ')) {
        if (!this.wheelOpen && held > 0.2) this.openWheel();
        if (this.wheelOpen) this.updateWheel();
        // left click picks the highlighted weapon right away
        if (this.wheelOpen && input.mousePressed(0)) { this.closeWheel(true); this.eatClick = true; } // also ends the Q hold
      } else {
        if (this.wheelOpen) this.closeWheel(true);
        else if (onFoot) this.toggleCover();
        this.qDown = -1;
        this.qReal = 0;
      }
    }
    for (let i = 1; i <= 5; i++) {
      if (input.wasPressed(`Digit${i}`)) {
        const got = this.arsenal.selectSlot(i);
        if (got) COMBAT_AUDIO.play('reload');
        else this.ctx.notify(`No weapon in slot ${i}. Buy one at [y]Ammu-Bay[/y] downtown.`, 'info');
      }
    }
    // mouse wheel (GTA PC): next / previous weapon, unarmed included
    if (!this.wheelOpen && input.wheel !== 0) this.cycleWeapon(input.wheel > 0 ? 1 : -1);
    if (input.wasPressed('KeyX')) { this.arsenal.holster(); this.switchFlash = 1.6; COMBAT_AUDIO.play('reload'); }
    if (onFoot && input.wasPressed('KeyR')) { if (this.arsenal.startReload()) COMBAT_AUDIO.play('reload'); }
    if (input.wasPressed('KeyB')) this.shoulder = -this.shoulder;
    if (input.wasPressed('KeyZ') && (this.aiming || this.focusActive)) {
      if (this.focusActive) this.focusActive = false;
      else if (this.focus > 0.15) { this.focusActive = true; COMBAT_AUDIO.play('whizz'); }
    }
    if (!this.aiming && this.focusActive && !this.firing) this.focusActive = false;
    void dt; void p;
  }

  private qReal = 0;
  private eatClick = false;
  private switchFlash = 0;

  /** Step through unarmed + every owned weapon in slot order. */
  private cycleWeapon(dir: number): void {
    const a = this.arsenal;
    const list: WeaponId[] = ['fists', ...[...a.owned.keys()].filter((id) => id !== 'fists').sort((x, y) => WEAPONS[x].slot - WEAPONS[y].slot)];
    if (list.length < 2) { this.ctx.notify('No weapons yet. Buy one at [y]Ammu-Bay[/y] downtown.', 'info'); return; }
    const i = Math.max(0, list.indexOf(a.active));
    const next = list[(i + dir + list.length) % list.length];
    if (next === 'fists') { if (!a.holstered) a.holster(); }
    else a.select(next);
    this.switchFlash = 1.6;
    COMBAT_AUDIO.play('reload');
  }

  private realHeld(): number {
    // the wheel slows time; measure the hold in real seconds
    if (this.qDown >= 0) this.qReal += this.realDt;
    return this.qReal;
  }

  private wheelSlots(): WheelItem[] {
    const items: WheelItem[] = [];
    const names = ['Melee', 'Handguns', 'SMG / Shotgun', 'Rifles', 'Sniper'];
    for (let slot = 1; slot <= 5; slot++) {
      const owned = [...this.arsenal.owned.keys()].filter((id) => WEAPONS[id].slot === slot);
      const pick = owned.includes(this.arsenal.current) ? this.arsenal.current : owned[owned.length - 1] ?? null;
      items.push({ slot, id: pick, label: pick ? WEAPONS[pick].name : names[slot - 1], ammo: pick && isFirearm(pick) ? `${this.arsenal.totalAmmo(pick)} rounds` : pick ? '' : 'empty' });
    }
    items.push({ slot: 0, id: null, label: 'Holster', ammo: 'unarmed' });
    return items;
  }

  private openWheel(): void {
    this.wheelOpen = true;
    this.wheelVec.set(0, 0);
    this.wheelItems = this.wheelSlots();
    this.wheelSel = Math.max(0, this.wheelItems.findIndex((i) => i.id === this.arsenal.current));
    this.hud?.openWheel(this.wheelItems);
    this.hud?.setWheelSelected(this.wheelSel, this.wheelItems[this.wheelSel].label);
    COMBAT_AUDIO.play('pickup');
  }

  private updateWheel(): void {
    const v = this.wheelVec;
    if (v.length() > 30) {
      const n = this.wheelItems.length;
      const a = Math.atan2(v.y, v.x) + Math.PI / 2;
      const idx = ((Math.round(a / ((Math.PI * 2) / n)) % n) + n) % n;
      if (idx !== this.wheelSel) {
        this.wheelSel = idx;
        this.hud?.setWheelSelected(idx, this.wheelItems[idx].label);
        COMBAT_AUDIO.play('empty');
      }
    }
    // scroll moves the highlight around the wheel
    const wheel = this.ctx.input.wheel;
    if (wheel !== 0) {
      const n = this.wheelItems.length;
      this.wheelSel = (this.wheelSel + (wheel > 0 ? 1 : -1) + n) % n;
      this.wheelVec.set(0, 0);
      this.hud?.setWheelSelected(this.wheelSel, this.wheelItems[this.wheelSel].label);
      COMBAT_AUDIO.play('empty');
    }
  }

  private closeWheel(apply: boolean): void {
    this.wheelOpen = false;
    this.qReal = 0;
    this.qDown = -1;
    this.hud?.closeWheel();
    if (!apply) return;
    const it = this.wheelItems[this.wheelSel];
    if (!it) return;
    if (it.slot === 0) { if (!this.arsenal.holstered) this.arsenal.holster(); }
    else if (it.id) this.arsenal.select(it.id);
  }

  // ------------------------------------------------------------------ on foot

  private updateOnFoot(dt: number, fire: boolean, firePressed: boolean): void {
    const w = this.ctx.world;
    const p = w.player;
    const def = this.arsenal.def;
    const input = this.ctx.input;
    // strafe while aiming: face the aim direction, move camera-relative
    if ((this.aiming || this.firing) && !this.dying) {
      const aimYaw = Math.atan2(this.aimDir.x, this.aimDir.z);
      if (this.lastPosValid && !this.inCover && p.position.distanceTo(this.lastPos) < 1.5) {
        const f = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
        const s = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
        const fx = Math.sin(aimYaw), fz = Math.cos(aimYaw);
        let mx = fx * f - fz * s, mz = fz * f + fx * s;
        const len = Math.hypot(mx, mz);
        if (len > 0) { mx /= len; mz /= len; }
        const spd = (this.aiming ? 2.7 : 3.2) * p.speedMult * (this.shield ? 0.5 : 1);
        p.position.x = this.lastPos.x + mx * spd * dt;
        p.position.z = this.lastPos.z + mz * spd * dt;
        w.city.collision.resolveCircle(p.position, 0.38, p.position.y, 1.75);
      }
      p.yaw = aimYaw;
      p.sync();
    }
    if (this.inCover) this.updateCover();
    this.lastPos.copy(p.position);
    this.lastPosValid = true;

    if (this.dying) return;
    // melee
    this.comboWindow -= dt;
    if (this.meleeT > 0) this.updateMelee(dt);
    if (def.cls === 'melee') {
      if (firePressed && this.meleeT < 0.1) this.startMelee();
    } else if (fire) this.tryShoot(firePressed, false);
    // hostile target under crosshair (red crosshair)
    this.hostileAim = false;
    if (this.aiming) {
      const h = this.enemies.raycast(this.aimOrigin, this.aimDir, def.range * 1.2);
      this.hostileAim = !!h && !h.e.neutralized && h.e.type.faction !== 'civilian';
      this.updateIntimidation(dt);
    } else this.intimidate = null;
  }

  // ------------------------------------------------------------------ shooting

  private clickedEmpty = false;

  private tryShoot(pressed: boolean, driveBy: boolean): void {
    const a = this.arsenal;
    const def = a.def;
    if (!def.auto && !pressed) return;
    if (driveBy) {
      // no shooting through the windshield
      const v = this.ctx.world.vehicle;
      if (v) {
        const f = v.forward;
        if (f.x * this.aimDir.x + f.z * this.aimDir.z > 0.9) return;
      }
    }
    if (!a.canFire()) {
      if (!a.reloading && a.state.mag <= 0) {
        // empty: reload automatically (held trigger too), click only when out of ammo
        if (a.startReload()) COMBAT_AUDIO.play('reload');
        else if (pressed && !this.clickedEmpty) { COMBAT_AUDIO.play('empty'); this.clickedEmpty = true; }
      }
      return;
    }
    this.clickedEmpty = false;
    if (!a.fire()) return;
    this.shoot(def.id, driveBy);
  }

  private muzzlePosition(out: THREE.Vector3, driveBy: boolean): THREE.Vector3 {
    const w = this.ctx.world;
    if (driveBy && w.vehicle) {
      const v = w.vehicle;
      _right.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
      const side = _right.dot(this.aimDir) > 0 ? 1 : -1;
      return out.copy(v.position).addScaledVector(_right, side * (v.def.width / 2 + 0.3)).setY(v.position.y + 1.25);
    }
    if (this.weaponMesh) return out.copy(this.weaponMesh.position).addScaledVector(this.aimDir, muzzleOffset(this.arsenal.active));
    return out.copy(w.player.position).setY(w.player.position.y + 1.35).addScaledVector(this.aimDir, 0.6);
  }

  private shoot(id: WeaponId, driveBy: boolean): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const def = WEAPONS[id];
    const suppressed = this.arsenal.hasUpgrade(id, 'suppressor');
    const scope = this.arsenal.hasUpgrade(id, 'scope');
    const moving = w.player.speed > 0.5 || !!w.vehicle;
    const spread = spreadFor(def, this.aiming, moving, this.arsenal.bloom, scope) * (this.focusActive ? 0.5 : 1);
    const muzzle = this.muzzlePosition(_hand, driveBy);
    // shots start past the player so nothing behind the shoulder gets hit
    const camToPlayer = _v.copy(w.focus).setY(w.focus.y + 1.3).sub(this.aimOrigin).dot(this.aimDir);
    const minT = Math.max(0.2, camToPlayer - 0.4);
    const range = def.range * (def.cls === 'sniper' ? 1.2 : 1.4);
    let anyHit = false, anyKill = false;
    for (let i = 0; i < def.pellets; i++) {
      coneDirection(this.aimDir, spread, _shot);
      const r = this.trace(this.aimOrigin, _shot, range, minT, muzzle);
      if (r.kind !== 'none') anyHit = r.kind !== 'world' || anyHit;
      anyKill = anyKill || r.kill;
      if (i < 3) this.effects.tracer(muzzle.x, muzzle.y, muzzle.z, _hitP.x, _hitP.y, _hitP.z);
      // suppress enemies near the bullet path
      for (const e of this.enemies.list) {
        if (e.neutralized) continue;
        _v2.copy(e.pos).setY(e.pos.y + 1.2);
        if (pointRayDistance(_v2, this.aimOrigin, _shot, range) < 2.6) e.suppress(0.3);
      }
    }
    if (anyHit) { this.hud?.hitMarker(anyKill); COMBAT_AUDIO.play(anyKill ? 'kill' : 'hit'); }
    if (def.cls !== 'stun') this.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, suppressed ? 0.18 : def.cls === 'shotgun' || def.cls === 'sniper' ? 0.7 : 0.45);
    COMBAT_AUDIO.play('shot', { weapon: id, suppressed });
    // recoil (camera kick) and shake
    const kick = def.recoil * (this.aiming ? 0.6 : 1) * (this.focusActive ? 0.5 : 1) * (scope ? 0.8 : 1);
    w.rig.pitch -= kick;
    w.rig.yaw += (Math.random() - 0.5) * kick * 0.6;
    if (def.cls === 'shotgun' || def.cls === 'sniper') w.rig.addShake(0.12);
    // noise: enemies, pedestrians and police hear it
    const loud = def.loudness * (suppressed ? 0.2 : 1);
    this.makeNoise(w.focus.x, w.focus.z, loud);
    if (loud > 10) this.crime('shots', w.focus.x, w.focus.z, { loud });
    for (const f of this.onShot) f(w.focus.x, w.focus.z, id);
  }

  makeNoise(x: number, z: number, r: number): void {
    this.noise.x = x; this.noise.z = z; this.noise.r = r; this.noise.t = this.time;
    if (r <= 0) return;
    // pedestrians scatter
    for (const p of this.ctx.world.peds.peds) {
      const dx = p.pos.x - x, dz = p.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d > r * 0.7 || this.isDowned(p)) continue;
      p.dodge = 1.4 + Math.random() * 1.2;
      p.dodgeDir.set(dx / (d || 1), 0, dz / (d || 1));
      p.idle = 0;
    }
  }

  private traceResult: { kind: TraceKind; kill: boolean } = { kind: 'none', kill: false };

  /** Hitscan along dir from the camera; applies damage and effects; writes the end point to _hitP. */
  private trace(o: THREE.Vector3, d: THREE.Vector3, maxT: number, minT: number, muzzle: THREE.Vector3): { kind: string; kill: boolean } {
    const w = this.ctx.world;
    const def = this.arsenal.def;
    const res = this.traceResult;
    res.kind = 'none';
    res.kill = false;
    _origin.copy(o).addScaledVector(d, minT);
    const range = maxT - minT;
    let best = w.city.collision.raycast(_origin.x, _origin.y, _origin.z, d.x, d.y, d.z, range);
    let kind: TraceKind = best < range ? 'world' : 'none';
    let enemy: Enemy | null = null, enemyPart: HitPart = 'body';
    const eh = this.enemies.raycast(_origin, d, best);
    if (eh && eh.e !== this.shield) { best = eh.t; kind = 'enemy'; enemy = eh.e; enemyPart = eh.part; }
    let ped: Ped | null = null, pedPart: HitPart = 'body';
    if (pedHit(_origin, d, w.peds.peds, best, (p) => this.isDowned(p), _pedHit)) { best = _pedHit.t; kind = 'ped'; ped = _pedHit.ped; pedPart = _pedHit.part; }
    let veh: Vehicle | null = null, vpart: VehiclePart = 'body', vtire = -1;
    const testV = (v: Vehicle) => {
      if (v === w.vehicle) return;
      if (v.position.distanceToSquared(_origin) > (best + 6) * (best + 6)) return;
      const t = rayVehicle(_origin, d, v, _vehHit);
      if (t < best) { best = t; kind = 'vehicle'; veh = v; vpart = _vehHit.part; vtire = _vehHit.tire; }
    };
    for (const v of w.vehicles) testV(v);
    for (const v of w.traffic.cars) testV(v);
    const pv = this.police?.vehiclesForCombat?.();
    if (pv) for (const v of pv) testV(v);
    let shoot: Shootable | null = null;
    for (const s of this.shootables) {
      if (!s.alive()) continue;
      const ox = _origin.x - s.pos.x, oy = _origin.y - (s.pos.y + s.height), oz = _origin.z - s.pos.z;
      const b = ox * d.x + oy * d.y + oz * d.z;
      const c = ox * ox + oy * oy + oz * oz - s.radius * s.radius;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < best) { best = t; kind = 'shootable'; shoot = s; }
    }
    // the muzzle must see the point too (no shooting around corners)
    _hitP.copy(_origin).addScaledVector(d, Math.min(best, range));
    _v.copy(_hitP).sub(muzzle);
    const ml = _v.length();
    if (ml > 0.5 && kind !== 'none') {
      _v.divideScalar(ml);
      const t = w.city.collision.raycast(muzzle.x, muzzle.y, muzzle.z, _v.x, _v.y, _v.z, ml - 0.3);
      if (t < ml - 0.35) { kind = 'world'; _hitP.copy(muzzle).addScaledVector(_v, t); }
    }
    const dist = minT + best;
    res.kind = kind as TraceKind;
    const lethal = def.lethal;
    switch (kind as TraceKind) {
      case 'world':
        this.effects.burst(_hitP.x, _hitP.y, _hitP.z, def.cls === 'stun' ? 3 : 6, 'spark');
        if (def.cls !== 'stun') this.effects.decal(_hitP.x, _hitP.y, _hitP.z, d.x, d.y, d.z);
        break;
      case 'enemy': {
        const e = enemy as Enemy | null;
        if (!e) break;
        const dmg = damageAt(def, enemyPart, dist) * (this.focusActive ? 1.25 : 1);
        const wasPolice = e.type.faction === 'police';
        const before = e.neutralized;
        if (def.cls === 'stun') e.knockOut(18);
        else e.takeHit(dmg, enemyPart, lethal, this.ctx.world.focus);
        res.kill = !before && e.neutralized;
        this.effects.burst(_hitP.x, _hitP.y, _hitP.z, def.cls === 'stun' ? 4 : 8, def.cls === 'stun' ? 'spark' : 'blood');
        if (def.cls === 'stun') COMBAT_AUDIO.play('taser', { dist: dist * 0.5 });
        this.enemies.alertAround(e.pos.x, e.pos.z, 30, e.type.faction);
        if (wasPolice) this.crime(res.kill && e.state === 'dead' ? 'copMurder' : 'copAssault', e.pos.x, e.pos.z, { victimCop: true });
        else if (!e.mission && e.type.faction !== 'fighter' && res.kill && e.state === 'dead') this.crime('murder', e.pos.x, e.pos.z);
        break;
      }
      case 'ped': {
        const pd = ped as Ped | null;
        if (!pd) break;
        const hp = (this.pedHealth.get(pd) ?? 100) - damageAt(def, pedPart, dist);
        this.pedHealth.set(pd, hp);
        this.effects.burst(_hitP.x, _hitP.y, _hitP.z, 8, def.cls === 'stun' ? 'spark' : 'blood');
        if (def.cls === 'stun') { this.downPed(pd, false); this.crime('assault', pd.pos.x, pd.pos.z); }
        else if (hp <= 0) { this.downPed(pd, true); res.kill = true; this.crime('murder', pd.pos.x, pd.pos.z); }
        else { this.crime('assault', pd.pos.x, pd.pos.z); pd.dodge = 2; pd.dodgeDir.copy(d).setY(0).normalize(); }
        break;
      }
      case 'vehicle': {
        const v = veh as Vehicle | null;
        if (!v) break;
        this.effects.burst(_hitP.x, _hitP.y, _hitP.z, 6, 'spark');
        if (def.cls !== 'stun') this.damageVehicle(v, damageAt(def, 'body', dist), vpart, vtire);
        break;
      }
      case 'shootable': {
        const s = shoot as Shootable | null;
        if (!s) break;
        s.onHit(damageAt(def, 'body', dist), lethal, _hitP);
        this.effects.burst(_hitP.x, _hitP.y, _hitP.z, 6, 'spark');
        res.kill = !s.alive();
        break;
      }
      default:
        break;
    }
    return res;
  }

  // ------------------------------------------------------------------ melee

  private startMelee(): void {
    const p = this.ctx.world.player;
    const id = this.arsenal.active;
    if (p.stamina < 0.04) return;
    this.combo = this.comboWindow > 0 ? (this.combo + 1) % 3 : 0;
    this.comboWindow = 0.9;
    const kind: MeleeKind = id === 'fists' ? (['punchR', 'punchL', 'kick'] as MeleeKind[])[this.combo] : 'swing';
    this.meleeKind = kind;
    this.meleeDur = kind === 'kick' ? 0.55 : kind === 'swing' ? 0.5 : 0.36;
    this.meleeT = this.meleeDur;
    this.meleeDone = false;
    p.stamina = Math.max(0, p.stamina - (kind === 'kick' ? 0.1 : 0.06));
    // snap toward the closest target in front (melee lock-on)
    const t = this.meleeTarget(3.2);
    if (t) p.yaw = Math.atan2(t.x - p.position.x, t.z - p.position.z);
    else if (this.aimDir.lengthSq() > 0) p.yaw = Math.atan2(this.aimDir.x, this.aimDir.z);
    p.sync();
  }

  private meleeTarget(range: number): THREE.Vector3 | null {
    const p = this.ctx.world.player;
    let best: THREE.Vector3 | null = null, bd = range;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const consider = (pos: THREE.Vector3) => {
      const dx = pos.x - p.position.x, dz = pos.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d > bd || d < 0.01) return;
      const camDot = (dx * this.aimDir.x + dz * this.aimDir.z) / d;
      const faceDot = (dx * fx + dz * fz) / d;
      if (Math.max(camDot, faceDot) < 0.3) return;
      bd = d; best = pos;
    };
    for (const e of this.enemies.list) if (!e.neutralized && e.state !== 'shield') consider(e.pos);
    for (const ped of this.ctx.world.peds.peds) if (!this.isDowned(ped) && ped.rig.root.visible) consider(ped.pos);
    for (const s of this.shootables) if (s.alive() && s.tag !== 'range') consider(s.pos);
    return best;
  }

  private updateMelee(dt: number): void {
    this.meleeT -= dt;
    const phase = 1 - this.meleeT / this.meleeDur;
    if (!this.meleeDone && phase > 0.45) {
      this.meleeDone = true;
      this.meleeImpact();
    }
    if (this.meleeT <= 0) { this.meleeT = 0; this.meleeKind = null; }
  }

  private meleeImpact(): void {
    const w = this.ctx.world;
    const p = w.player;
    const def = this.arsenal.def;
    const reach = def.range + (this.meleeKind === 'kick' ? 0.3 : 0);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const mult = (this.meleeKind === 'kick' ? 1.5 : this.combo === 1 ? 1.15 : 1) * (0.6 + p.stamina * 0.4);
    let hitSomething = false;
    const inFront = (pos: THREE.Vector3) => {
      const dx = pos.x - p.position.x, dz = pos.z - p.position.z;
      const d = Math.hypot(dx, dz);
      return d < reach + 0.35 && (dx * fx + dz * fz) / (d || 1) > 0.35;
    };
    for (const e of this.enemies.list) {
      if (e.neutralized || e.state === 'shield' || !inFront(e.pos)) continue;
      let dmg = def.damage * mult;
      // fighters block some hits
      if (e.type.faction === 'fighter' && Math.random() < 0.22) { dmg *= 0.15; e.flinch = 0.4; }
      const behind = Math.sin(e.yaw) * fx + Math.cos(e.yaw) * fz > 0.5;
      if (behind && !e.brain.hostile) dmg *= 3;
      const before = e.neutralized;
      e.takeHit(dmg, 'body', def.id !== 'fists', p.position);
      // push back
      e.pos.x += fx * 0.35; e.pos.z += fz * 0.35;
      hitSomething = true;
      if (!before && e.neutralized) {
        this.hud?.hitMarker(true);
        if (def.id === 'fists') { this.hud?.banner('KNOCKOUT', '', false, 1200); COMBAT_AUDIO.play('ko'); }
      } else this.hud?.hitMarker(false);
      if (e.type.faction === 'police') this.crime('copAssault', e.pos.x, e.pos.z, { victimCop: true });
      break;
    }
    if (!hitSomething) {
      for (const ped of w.peds.peds) {
        if (this.isDowned(ped) || !inFront(ped.pos)) continue;
        const hp = (this.pedHealth.get(ped) ?? 100) - def.damage * mult * 1.4;
        this.pedHealth.set(ped, hp);
        if (hp <= 0) this.downPed(ped, def.id !== 'fists');
        else { ped.dodge = 1.6; ped.dodgeDir.set(fx, 0, fz); }
        this.crime(hp <= 0 && def.id !== 'fists' ? 'murder' : 'assault', ped.pos.x, ped.pos.z);
        hitSomething = true;
        this.hud?.hitMarker(hp <= 0);
        break;
      }
    }
    if (!hitSomething) {
      for (const s of this.shootables) {
        if (!s.alive() || s.tag === 'range' || !inFront(s.pos)) continue;
        s.onHit(def.damage * mult, def.id !== 'fists', s.pos);
        hitSomething = true;
        break;
      }
    }
    if (hitSomething) {
      COMBAT_AUDIO.play('punch');
      w.rig.addShake(0.15);
      this.makeNoise(p.position.x, p.position.z, 12);
    } else COMBAT_AUDIO.play('whizz', { dist: 6 });
  }

  // ------------------------------------------------------------------ cover

  private toggleCover(): void {
    if (this.inCover) { this.inCover = false; return; }
    const w = this.ctx.world;
    const p = w.player.position;
    const col = w.city.collision;
    let bestT = 1.7, bx = 0, bz = 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      const t = col.raycast(p.x, p.y + 0.7, p.z, dx, 0, dz, 1.7);
      if (t < bestT) { bestT = t; bx = dx; bz = dz; }
    }
    this.coverVehicle = null;
    if (bestT >= 1.7) {
      // try a car
      let bv: Vehicle | null = null, bd = 3.2;
      for (const v of [...w.vehicles, ...w.traffic.cars]) {
        const d = v.position.distanceTo(p) - v.def.width * 0.45;
        if (d < bd && Math.abs(v.speed) < 1) { bd = d; bv = v; }
      }
      if (!bv) { this.ctx.notify('No cover here. Get next to a wall or a parked car and tap ~Q~.', 'info'); return; }
      this.coverVehicle = bv;
      _v.copy(bv.position).sub(p).setY(0).normalize();
      bx = _v.x; bz = _v.z;
      bestT = Math.max(0.3, bd);
      this.coverLow = true;
    } else {
      const high = col.raycast(p.x, p.y + 1.55, p.z, bx, 0, bz, 1.9);
      this.coverLow = high >= 1.9;
    }
    this.coverNormal.set(-bx, 0, -bz);
    this.coverPoint.set(p.x + bx * bestT, p.y, p.z + bz * bestT);
    // snap against the cover
    p.x = this.coverPoint.x + this.coverNormal.x * 0.5;
    p.z = this.coverPoint.z + this.coverNormal.z * 0.5;
    w.player.yaw = Math.atan2(-this.coverNormal.x, -this.coverNormal.z);
    w.player.sync();
    this.inCover = true;
    COMBAT_AUDIO.play('punch', { dist: 10 });
  }

  private updateCover(): void {
    const w = this.ctx.world;
    const p = w.player.position;
    const n = this.coverNormal;
    // distance from the cover plane
    const dPlane = (p.x - this.coverPoint.x) * n.x + (p.z - this.coverPoint.z) * n.z;
    if (dPlane > 1.4) { this.inCover = false; return; } // walked away
    if (dPlane > 0.5) { p.x -= n.x * (dPlane - 0.5); p.z -= n.z * (dPlane - 0.5); }
    if (this.coverVehicle) {
      if (this.coverVehicle.position.distanceTo(p) > this.coverVehicle.def.length * 0.65 + 1) this.inCover = false;
      return;
    }
    // end of the wall: stop at the edge
    const t = w.city.collision.raycast(p.x, p.y + 0.7, p.z, -n.x, 0, -n.z, 1.4);
    if (t >= 1.4 && this.lastPosValid) { p.x = this.lastPos.x; p.z = this.lastPos.z; }
    if (!this.aiming) {
      w.player.yaw = Math.atan2(-n.x, -n.z) + Math.PI; // back to the wall, facing out
      w.player.sync();
    }
  }

  private shotBlocked(from: THREE.Vector3): boolean {
    const w = this.ctx.world;
    if (this.shield && this.shield.state === 'shield') {
      // hostage between shooter and player
      _v.copy(this.shield.pos).setY(1.2);
      _v2.copy(w.player.position).setY(1.3).sub(from);
      const len = _v2.length();
      _v2.divideScalar(len || 1);
      if (pointRayDistance(_v, from, _v2, len) < 0.45) return true;
    }
    if (!this.inCover || (this.aiming && !this.coverLow)) return false;
    const n = this.coverNormal;
    // shooter on the far side of the cover (the side the player is not on)
    const side = (from.x - this.coverPoint.x) * n.x + (from.z - this.coverPoint.z) * n.z;
    if (side >= 0) return false;
    if (this.coverVehicle) return !this.aiming || Math.random() < 0.6;
    return !this.aiming || Math.random() < 0.5;
  }

  // ------------------------------------------------------------------ camera + pose

  private updateCamera(dt: number, onFoot: boolean): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const cam = ctx.camera;
    const firstPerson = (w.rig as unknown as { firstPerson?: boolean }).firstPerson === true;
    const target = this.aiming && onFoot ? 1 : 0;
    this.aimBlend += (target - this.aimBlend) * Math.min(1, dt * 12 / Math.max(0.25, this.timeScale()));
    this.camOffset.set(0, 0, 0);
    if (this.killcam) { this.updateKillcam(); return; }
    if (this.aimBlend > 0.001 && onFoot && !this.dying) {
      const b = this.aimBlend;
      cam.getWorldDirection(_fwd);
      _right.crossVectors(_fwd, _up).normalize();
      if (this.scoped || firstPerson) {
        if (this.scoped && !firstPerson) {
          // scope: eye position
          _v.copy(w.player.position).setY(w.player.position.y + 1.62).addScaledVector(_fwd, 0.35).addScaledVector(_right, 0.05);
          this.camOffset.copy(_v).sub(cam.position);
          cam.position.copy(_v);
          w.player.rig.root.visible = false;
        }
      } else {
        const coverPeek = this.inCover && !this.coverLow ? 0.5 : 0;
        const pull = Math.max(0, w.rig.distance - 2.3) * 0.6;
        _offset.copy(_right).multiplyScalar((0.62 + coverPeek) * this.shoulder * b).addScaledVector(_fwd, pull * b).addScaledVector(_up, 0.06 * b);
        _v.copy(cam.position).add(_offset);
        // keep the camera out of walls
        _v2.copy(w.player.position).setY(w.player.position.y + 1.55);
        _dir.copy(_v).sub(_v2);
        const len = _dir.length();
        if (len > 0.01) {
          _dir.divideScalar(len);
          const t = w.city.collision.raycast(_v2.x, _v2.y, _v2.z, _dir.x, _dir.y, _dir.z, len);
          if (t < len) _v.copy(_v2).addScaledVector(_dir, Math.max(0.3, t - 0.25));
        }
        this.camOffset.copy(_v).sub(cam.position);
        cam.position.copy(_v);
      }
      const def = this.arsenal.def;
      let zoom = def.zoom * (this.arsenal.hasUpgrade(def.id, 'scope') ? 0.82 : 1) * (this.focusActive ? 0.92 : 1);
      if (!this.scoped && def.cls === 'sniper') zoom = 0.75;
      const fov = 60 * (1 + (zoom - 1) * b);
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      this.aimDir.copy(_fwd);
      this.aimOrigin.copy(cam.position);
    }
    if (!this.scoped && w.player.active && !w.vehicle && !w.player.rig.root.visible && !this.dying) w.player.rig.root.visible = true;
  }

  private updateKillcam(): void {
    const kc = this.killcam;
    if (!kc) return;
    const cam = this.ctx.camera;
    const left = kc.until - performance.now();
    if (left <= 0) { this.killcam = null; return; }
    kc.yaw += this.realDt * 0.6;
    const r = 3.4;
    cam.position.set(kc.at.x + Math.sin(kc.yaw) * r, kc.at.y + 1.3, kc.at.z + Math.cos(kc.yaw) * r);
    cam.lookAt(kc.at.x, kc.at.y + 0.6, kc.at.z);
  }

  private updatePlayerPose(onFoot: boolean): void {
    const w = this.ctx.world;
    const rig = w.player.rig;
    if (this.bonesRoot !== rig.root) { this.bonesRoot = rig.root; this.playerBones = findBones(rig.root); }
    const b = this.playerBones;
    const def = this.arsenal.def;
    const active = this.arsenal.active;
    // weapon model in the right hand
    const key = `${active}|${this.arsenal.state.upgrades.join(',')}`;
    if (key !== this.weaponKey) {
      this.weaponKey = key;
      this.weaponMesh?.removeFromParent();
      this.weaponMesh = active === 'fists' ? null : buildWeapon(active, this.arsenal.hasUpgrade(active, 'tint'), this.arsenal.hasUpgrade(active, 'suppressor'), this.arsenal.hasUpgrade(active, 'scope'));
      if (this.weaponMesh) this.ctx.scene.add(this.weaponMesh);
    }
    const fwd = _fwd.set(Math.sin(w.player.yaw), 0, Math.cos(w.player.yaw));
    const posing = onFoot && !this.dying;
    const withSetPose = rig as unknown as { setPose?: (name: string, weight: number) => void };
    const aimW = (this.aiming || this.firing) && posing ? 1 : 0;
    if (withSetPose.setPose) withSetPose.setPose('aim', aimW);
    if (b && posing) {
      if (this.inCover && !this.aiming && !this.firing) {
        poseCrouch(b, fwd, this.coverLow ? 1 : 0.35);
        rig.body.position.y = this.coverLow ? -0.42 : -0.15;
        this.coverPosed = true;
      } else if (this.coverPosed) { rig.body.position.y = 0; this.coverPosed = false; }
      if (this.meleeKind && this.meleeT > 0) {
        const ph = 1 - this.meleeT / this.meleeDur;
        if (this.meleeKind === 'kick') poseKick(b, fwd, ph);
        else if (this.meleeKind === 'swing') poseSwing(b, fwd, ph);
        else posePunch(b, fwd, ph, this.meleeKind === 'punchL');
      } else if (this.blocking) poseBlock(b, fwd, 1);
      else if (aimW && !withSetPose.setPose) poseAim(b, this.aimDir, 1, active !== 'pistol' && active !== 'taser');
    } else if (this.coverPosed) { rig.body.position.y = 0; this.coverPosed = false; }
    // weapon transform
    const m = this.weaponMesh;
    if (m) {
      m.visible = rig.root.visible && posing;
      if (m.visible) {
        const hand = b?.handR;
        if (hand) hand.getWorldPosition(m.position);
        else m.position.copy(w.player.position).setY(w.player.position.y + 1.2).addScaledVector(fwd, 0.35);
        if (aimW) _q.setFromUnitVectors(_z, this.aimDir);
        else if (def.cls === 'melee' && this.meleeT > 0) {
          const ph = 1 - this.meleeT / this.meleeDur;
          const a = -0.9 + ph * 2.0;
          _v.copy(_up).multiplyScalar(Math.cos(a)).addScaledVector(fwd, Math.sin(a) + 0.2).normalize();
          _q.setFromUnitVectors(_z, _v);
        } else {
          _v.copy(fwd).multiplyScalar(def.cls === 'melee' ? 0.25 : 0.55).setY(-0.8).normalize();
          _q.setFromUnitVectors(_z, _v);
        }
        m.quaternion.copy(_q);
      }
    }
  }

  // ------------------------------------------------------------------ damage / health

  damagePlayer(dmg: number, from: THREE.Vector3, melee: boolean): void {
    const ctx = this.ctx;
    const w = ctx.world;
    if (ctx.isBusy() || this.dying || w.player.health <= 0) return;
    let d = dmg;
    if (melee && this.blocking) { d *= 0.25; w.player.stamina = Math.max(0, w.player.stamina - 0.12); }
    if (w.vehicle) d *= 0.55;
    const r = applyDamage(w.player.health, this.armor, d);
    w.player.health = r.health;
    this.armor = r.armor;
    this.lastDamage = this.time;
    this.hurt = Math.min(0.85, this.hurt + 0.25 + d / 60);
    w.rig.addShake(melee ? 0.3 : 0.12);
    // damage direction relative to the camera
    const camYaw = w.rig.yaw;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const dx = from.x - w.focus.x, dz = from.z - w.focus.z;
    const right = dx * -fz + dz * fx, front = dx * fx + dz * fz;
    this.hud?.damageFrom(Math.atan2(right, front));
    if (w.player.health <= 0) this.die();
  }

  private die(): void {
    const w = this.ctx.world;
    this.dying = true;
    this.dieAt = performance.now();
    this.inCover = false;
    this.focusActive = false;
    this.releaseShield(false);
    this.hud?.banner('WASTED', '', false, 2400);
    DIRECTOR_LINK.slowMotion?.(0.3, 1500);
    COMBAT_AUDIO.play('ko');
    const body = w.player.rig.body;
    body.rotation.order = 'YXZ';
    let k = 0;
    const fall = setInterval(() => {
      k = Math.min(1, k + 0.08);
      body.rotation.x = -1.45 * k;
      if (k >= 1) clearInterval(fall);
    }, 30);
    setTimeout(() => {
      clearInterval(fall);
      // hand over to the Game's hospital flow (it runs when health is 0)
      w.player.health = 0;
      w.events.onPlayerHit?.(0.01);
      if (w.player.health > 0) this.onRespawn();
    }, 1700);
  }

  private onRespawn(): void {
    const w = this.ctx.world;
    this.dying = false;
    w.player.rig.body.rotation.x = 0;
    w.player.rig.body.position.y = 0;
    this.hurt = 0;
    this.killcam = null;
    this.police?.clearWanted();
    this.enemies.clear((e) => !e.mission && (e.brain.hostile || e.type.faction === 'police'));
    this.lastPosValid = false;
  }

  private updateHealth(dt: number): void {
    const p = this.ctx.world.player;
    // GTA: health only regenerates up to half
    if (!this.dying && p.health > 0 && p.health < p.maxHealth * 0.5 && this.time - this.lastDamage > 6) {
      p.health = Math.min(p.maxHealth * 0.5, p.health + dt * 2.5);
    }
  }

  private updateFocus(): void {
    const dt = this.realDt;
    if (this.focusActive) {
      this.focus = Math.max(0, this.focus - dt / 7);
      if (this.focus <= 0) this.focusActive = false;
    } else this.focus = Math.min(1, this.focus + dt / 40);
  }

  private updateTimeScale(): void {
    const s = this.timeScale();
    if (s < 1) {
      DIRECTOR_LINK.slowMotion?.(s, 150);
      this.slowActive = true;
    } else if (this.slowActive) {
      this.slowActive = false;
      DIRECTOR_LINK.slowMotion?.(1, 0);
    }
  }

  // ------------------------------------------------------------------ enemies

  private onEnemyNeutralized(e: Enemy, byPlayer: boolean, lethal: boolean): void {
    for (const f of this.onEnemyDown) f(e, lethal);
    if (e === this.shield) this.shield = null;
    // drops
    if (lethal && e.type.drops && e.weapon !== 'fists') {
      this.spawnPickup({ type: 'weapon', weapon: e.weapon, ammo: Math.max(6, Math.round(WEAPONS[e.weapon].magSize * (1 + Math.random()))) }, e.pos.x + 0.6, e.pos.z + 0.3);
    }
    if (e.brain.hostile || e.mission) this.recentHostiles++;
    // cinematic kill cam on the last enemy of a fight
    if (byPlayer && this.recentHostiles >= 3 && this.enemies.hostileCount() === 0 && !this.ctx.settings().reducedMotion && e.type.faction !== 'police') {
      this.recentHostiles = 0;
      this.killcam = { at: e.pos.clone(), until: performance.now() + 1400, yaw: Math.atan2(e.pos.x - this.ctx.world.focus.x, e.pos.z - this.ctx.world.focus.z) + 1.2 };
      this.hud?.hitMarker(true);
    }
    if (this.enemies.hostileCount() === 0) setTimeout(() => { if (this.enemies.hostileCount() === 0) this.recentHostiles = 0; }, 8000);
  }

  // ------------------------------------------------------------------ contextual actions (E)

  private updateInteractions(onFoot: boolean): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const p = w.player;
    if (!onFoot || this.dying) { ctx.interactions.remove('combat-act'); return; }
    if (this.shield) {
      ctx.interactions.set({ id: 'combat-act', x: p.position.x, z: p.position.z, radius: 3, priority: 9, title: 'Release the hostage', desc: 'Shove them away (knocks them down)', action: () => this.releaseShield(true) });
      return;
    }
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let best: { e: Enemy; kind: 'shield' | 'takedown' | 'disarm' | 'tie' | 'loot'; d: number } | null = null;
    for (const e of this.enemies.list) {
      const dx = e.pos.x - p.position.x, dz = e.pos.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2) continue;
      let kind: 'shield' | 'takedown' | 'disarm' | 'tie' | 'loot' | null = null;
      const facingAway = Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz > d * 0.3; // enemy looks away from player
      const inFront = (dx * fx + dz * fz) / (d || 1) > 0.2;
      if (e.state === 'down' && d < 2) kind = e.type.faction === 'fighter' ? null : 'tie';
      else if ((e.state === 'dead' || e.state === 'tied' || e.state === 'down') && !e.looted && d < 2) kind = 'loot';
      else if (!e.neutralized && e.type.faction !== 'fighter') {
        if (this.aiming && isFirearm(this.arsenal.active) && d < 1.7 && facingAway) kind = 'shield';
        else if (!e.brain.hostile && facingAway && d < 1.8) kind = 'takedown';
        else if (e.brain.hostile && !e.melee && inFront && d < 1.7 && this.arsenal.def.cls === 'melee') kind = 'disarm';
      }
      if (!kind) continue;
      if (!best || d < best.d) best = { e, kind, d };
    }
    if (!best) { ctx.interactions.remove('combat-act'); return; }
    const e = best.e;
    const titles = {
      shield: ['Grab as human shield', 'Enemies hold fire while you use them as cover'],
      takedown: ['Stealth takedown', this.arsenal.active === 'knife' ? 'Silent and lethal' : 'Choke hold: quiet knockout'],
      disarm: ['Disarm', 'Twist the weapon out of their hands'],
      tie: ['Zip-tie suspect', 'Restrain them for the police (counts as an arrest)'],
      loot: ['Search body', 'Take cash and ammo'],
    } as const;
    const [title, desc] = titles[best.kind];
    const kind = best.kind;
    ctx.interactions.set({ id: 'combat-act', x: e.pos.x, z: e.pos.z, radius: 2.4, priority: 6, title, desc, action: () => this.doAction(e, kind) });
  }

  private doAction(e: Enemy, kind: 'shield' | 'takedown' | 'disarm' | 'tie' | 'loot'): void {
    const p = this.ctx.world.player;
    switch (kind) {
      case 'shield':
        this.shield = e;
        e.brain.set('shield');
        this.ctx.notify('Hostage taken. Their friends won\'t shoot. ~E~ to let go.', 'info');
        break;
      case 'takedown':
        this.meleeKind = 'punchR'; this.meleeDur = this.meleeT = 0.5; this.meleeDone = true;
        if (this.arsenal.active === 'knife') e.die(); else e.knockOut(40);
        COMBAT_AUDIO.play('ko', { dist: 2 });
        this.hud?.banner('TAKEDOWN', '', false, 1000);
        if (e.type.faction === 'police') this.crime('copAssault', e.pos.x, e.pos.z, { victimCop: true });
        break;
      case 'disarm': {
        const w = e.disarm();
        if (w) {
          this.spawnPickup({ type: 'weapon', weapon: w, ammo: WEAPONS[w].magSize * 2 }, p.position.x + Math.sin(p.yaw) * 0.6, p.position.z + Math.cos(p.yaw) * 0.6);
          e.flinch = 1;
          COMBAT_AUDIO.play('punch');
          this.ctx.notify(`Disarmed: [y]${WEAPONS[w].name}[/y] on the ground.`, 'good');
        }
        break;
      }
      case 'tie':
        e.tie();
        COMBAT_AUDIO.play('reload');
        this.ctx.notify('Suspect zip-tied. Physical security teams detain, then hand over to police.', 'good');
        break;
      case 'loot': {
        e.looted = true;
        const [lo, hi] = e.type.cash;
        const cash = Math.round(lo + Math.random() * (hi - lo));
        if (cash > 0) this.ctx.addMoney(cash);
        let ammoTxt = '';
        if (e.weapon !== 'fists' && this.arsenal.has(e.weapon)) {
          const n = this.arsenal.addAmmo(e.weapon, WEAPONS[e.weapon].magSize);
          if (n > 0) ammoTxt = ` and ${n} rounds`;
        } else {
          for (const id of this.arsenal.owned.keys()) if (isFirearm(id) && id !== 'taser') { this.arsenal.addAmmo(id, Math.ceil(WEAPONS[id].magSize / 2)); ammoTxt = ' and some ammo'; break; }
        }
        this.ctx.sfx('cash');
        this.ctx.notify(`Found [g]$${cash}[/g]${ammoTxt}.`, 'money');
        this.persist();
        break;
      }
    }
  }

  private updateShield(): void {
    const e = this.shield;
    if (!e) return;
    if (e.state !== 'shield') { this.shield = null; return; }
    const p = this.ctx.world.player;
    e.yaw = p.yaw;
    e.pos.set(p.position.x + Math.sin(p.yaw) * 0.55, p.position.y, p.position.z + Math.cos(p.yaw) * 0.55);
  }

  releaseShield(shove: boolean): void {
    const e = this.shield;
    if (!e) return;
    this.shield = null;
    if (e.state !== 'shield') return;
    if (shove) { e.knockOut(6); COMBAT_AUDIO.play('punch'); }
    else { e.brain.set('attack'); }
  }

  // ------------------------------------------------------------------ pedestrians

  isDowned(p: Ped): boolean {
    for (const d of this.downed) if (d.ped === p) return true;
    return false;
  }

  downPed(p: Ped, dead: boolean): void {
    if (this.isDowned(p)) return;
    this.downed.push({ ped: p, t: dead ? 40 : 14, dead });
    p.rig.body.rotation.order = 'YXZ';
    p.idle = 999;
    p.dodge = 0;
    if (this.intimidate?.ped === p) this.intimidate = null;
    if (!dead) COMBAT_AUDIO.play('ko', { dist: 4 });
  }

  private updatePeds(dt: number): void {
    for (let i = this.downed.length - 1; i >= 0; i--) {
      const d = this.downed[i];
      const p = d.ped;
      d.t -= dt;
      p.idle = 999;
      p.dodge = 0;
      p.rig.body.rotation.x = Math.max(-1.5, p.rig.body.rotation.x - dt * 6);
      p.rig.root.position.y = p.pos.y + 0.12;
      if (d.t <= 0 || p.pos.distanceTo(this.ctx.world.focus) > 135) {
        p.rig.body.rotation.x = 0;
        p.idle = 0;
        this.pedHealth.delete(p);
        if (d.dead) p.pos.set(99999, 0, 99999); // recycle: respawns elsewhere next frame
        else { p.dodge = 2; p.dodgeDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(); }
        this.downed.splice(i, 1);
      }
    }
    // intimidated pedestrian keeps hands up
    const it = this.intimidate;
    if (it) {
      let b = this.pedBones.get(it.ped);
      if (!b) { b = findBones(it.ped.rig.root); this.pedBones.set(it.ped, b); }
      _v.set(Math.sin(it.ped.yaw), 0, Math.cos(it.ped.yaw));
      poseHandsUp(b, _v, Math.min(1, it.t * 4));
    }
  }

  private updateIntimidation(dt: number): void {
    if (!isFirearm(this.arsenal.active)) return;
    const w = this.ctx.world;
    if (this.intimidate) {
      const it = this.intimidate;
      const p = it.ped;
      const still = this.aimingAt(_v.copy(p.pos).setY(p.pos.y + 1.2), 0.9, 16);
      it.t += dt;
      p.idle = 2;
      p.yaw = Math.atan2(w.player.position.x - p.pos.x, w.player.position.z - p.pos.z);
      if (it.t > 1.6 && !it.dropped && !this.robbedPeds.has(p)) {
        it.dropped = true;
        this.robbedPeds.add(p);
        this.spawnPickup({ type: 'cash', amount: 20 + Math.floor(Math.random() * 110) }, p.pos.x + Math.sin(p.yaw) * 0.6, p.pos.z + Math.cos(p.yaw) * 0.6);
        this.crime('intimidation', p.pos.x, p.pos.z);
      }
      if (!still || it.t > 4) {
        // run for it
        p.idle = 0;
        p.dodge = 3;
        p.dodgeDir.set(p.pos.x - w.player.position.x, 0, p.pos.z - w.player.position.z).normalize();
        this.intimidate = null;
      }
      return;
    }
    for (const p of w.peds.peds) {
      if (this.isDowned(p) || !p.rig.root.visible) continue;
      if (p.pos.distanceTo(w.player.position) > 14) continue;
      if (this.aimingAt(_v.copy(p.pos).setY(p.pos.y + 1.2), 0.6, 14)) {
        this.intimidate = { ped: p, t: 0, dropped: false };
        break;
      }
    }
  }

  // ------------------------------------------------------------------ vehicles

  private updateVehiclesHitting(): void {
    const w = this.ctx.world;
    const v = w.vehicle;
    if (!v) return;
    const spd = Math.abs(v.speed);
    if (spd < 6) return;
    const r = v.def.width * 0.6 + 0.6;
    for (const p of w.peds.peds) {
      if (this.isDowned(p)) continue;
      if (p.pos.distanceTo(v.position) < r) {
        this.downPed(p, spd > 13);
        this.effects.burst(p.pos.x, 1, p.pos.z, 6, 'blood');
        this.crime('pedHit', p.pos.x, p.pos.z);
        COMBAT_AUDIO.play('ko', { dist: 2 });
      }
    }
    for (const e of this.enemies.list) {
      if (e.neutralized || e.pos.distanceTo(v.position) > r) continue;
      e.takeHit(spd * 5, 'body', true, v.position);
      e.pos.addScaledVector(v.forward, 1.5);
      if (e.type.faction === 'police') this.crime('copAssault', e.pos.x, e.pos.z, { victimCop: true });
    }
  }

  damageVehicle(v: Vehicle, dmg: number, part: VehiclePart, tire: number): void {
    let d = this.vdmg.get(v);
    if (!d) { d = { health: 100, engine: 100, tires: 0, wrecked: false, smokeT: 0 }; this.vdmg.set(v, d); }
    if (d.wrecked) return;
    const hook = v as unknown as { applyDamage?: (amount: number, part?: string) => void };
    hook.applyDamage?.(dmg, part);
    if (part === 'tire' && tire >= 0) {
      const bit = 1 << tire;
      if (!(d.tires & bit)) {
        d.tires |= bit;
        COMBAT_AUDIO.play('whizz', { dist: 3 });
        this.effects.puff(v.position.x, 0.4, v.position.z, 3);
      }
    } else if (part === 'engine') d.engine -= dmg * 1.4;
    d.health -= dmg * (part === 'engine' ? 0.8 : 0.5);
    if (d.health <= 0) this.explodeVehicle(v, d);
    this.applyVehicleDamage(v, d);
  }

  /** 0..1 how disabled a vehicle is (popped tires, dead engine). */
  vehicleDisabledLevel(v: Vehicle): number {
    const d = this.vdmg.get(v);
    if (!d) return 0;
    if (d.wrecked || d.engine <= 0) return 1;
    let tires = 0;
    for (let i = 0; i < 4; i++) if (d.tires & (1 << i)) tires++;
    return Math.min(1, tires * 0.3 + (100 - d.engine) / 200);
  }

  private applyVehicleDamage(v: Vehicle, d: VehicleDamage): void {
    let tires = 0;
    for (let i = 0; i < 4; i++) if (d.tires & (1 << i)) tires++;
    let mult = Math.max(0.3, 1 - tires * 0.22);
    if (d.engine <= 0 || d.wrecked) mult = d.wrecked ? 0 : 0.08;
    else if (d.engine < 40) mult *= 0.6;
    v.speedMult = Math.min(v.speedMult, mult);
  }

  private explodeVehicle(v: Vehicle, d: VehicleDamage): void {
    d.wrecked = true;
    d.engine = 0;
    this.effects.explode(v.position.x, v.position.y, v.position.z);
    COMBAT_AUDIO.play('explosion', { dist: v.position.distanceTo(this.ctx.world.focus) * 0.3 });
    this.ctx.world.rig.addShake(0.8);
    this.makeNoise(v.position.x, v.position.z, 120);
    // blast damage
    const w = this.ctx.world;
    const pd = w.focus.distanceTo(v.position);
    if (pd < 7) this.damagePlayer((7 - pd) * 18, v.position, false);
    for (const e of this.enemies.list) {
      const ed = e.pos.distanceTo(v.position);
      if (ed < 7 && !e.neutralized) e.takeHit((7 - ed) * 30, 'body', true, v.position);
    }
    for (const p of w.peds.peds) if (p.pos.distanceTo(v.position) < 6) this.downPed(p, true);
    this.crime('shots', v.position.x, v.position.z, { loud: 150 });
    // char the paint
    v.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && (o as THREE.Mesh).isMesh && m.color && !(m.userData as { charred?: boolean }).charred) {
        const c = m.clone();
        c.color.multiplyScalar(0.12);
        c.userData = { charred: true };
        (o as THREE.Mesh).material = c;
      }
    });
  }

  private updateVehicleDamage(dt: number): void {
    for (const [v, d] of this.vdmg) {
      if (!v.root.parent) { this.vdmg.delete(v); continue; }
      this.applyVehicleDamage(v, d);
      if (d.engine < 40 || d.wrecked) {
        d.smokeT -= dt;
        if (d.smokeT <= 0) {
          d.smokeT = d.wrecked ? 0.08 : 0.25;
          _v.copy(v.forward).multiplyScalar(v.def.length * 0.35).add(v.position);
          this.effects.puff(_v.x, 1.1, _v.z, 1);
          if (d.wrecked && Math.random() < 0.4) this.effects.burst(_v.x, 1, _v.z, 2, 'fire');
        }
      }
    }
  }

  /** Resolves true once the vehicle is disabled and nearly stopped; false if it escapes or time runs out. */
  waitVehicleDisabled(v: Vehicle, timeLimit: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = this.time;
      const tick = setInterval(() => {
        if (!v.root.parent) { clearInterval(tick); resolve(false); return; }
        const lvl = this.vehicleDisabledLevel(v);
        if (lvl >= 0.55) {
          // two flat tires (or a dead engine): it limps to a stop
          const d = this.vdmg.get(v);
          if (d && d.engine > 0) { d.engine = 0; this.applyVehicleDamage(v, d); this.ctx.notify('The van is crippled and rolling to a stop!', 'good'); }
          if (Math.abs(v.speed) < 3) { clearInterval(tick); resolve(true); return; }
        }
        const far = v.position.distanceTo(this.ctx.world.focus) > 260;
        if (far || (timeLimit > 0 && this.time - start > timeLimit)) { clearInterval(tick); resolve(false); }
      }, 250);
    });
  }

  // ------------------------------------------------------------------ pickups

  private updatePickups(dt: number, onFoot: boolean): void {
    const hit = this.pickups.update(dt, onFoot ? this.ctx.world.player.position : null);
    if (!hit) return;
    const k = hit.kind;
    const ctx = this.ctx;
    let ok = true;
    switch (k.type) {
      case 'weapon': {
        const had = this.arsenal.has(k.weapon);
        if (had && isFirearm(k.weapon) && this.arsenal.totalAmmo(k.weapon) >= WEAPONS[k.weapon].reserveMax) { ok = false; break; }
        if (had && !isFirearm(k.weapon)) { ok = false; break; }
        this.giveWeapon(k.weapon, k.ammo, !had);
        if (had) ctx.notify(`+${k.ammo} rounds for the [y]${WEAPONS[k.weapon].name}[/y].`, 'good');
        break;
      }
      case 'ammo': {
        let given = 0;
        for (const id of this.arsenal.owned.keys()) if (isFirearm(id)) given += this.arsenal.addAmmo(id, Math.ceil(k.amount * WEAPONS[id].magSize / 30));
        if (given === 0) { ok = false; break; }
        ctx.notify('Ammo restocked.', 'good');
        break;
      }
      case 'armor':
        if (this.armor >= 100) { ok = false; break; }
        this.armor = Math.min(100, this.armor + 50);
        ctx.notify('Body armor equipped.', 'good');
        break;
      case 'health': {
        const p = ctx.world.player;
        if (p.health >= p.maxHealth) { ok = false; break; }
        p.health = Math.min(p.maxHealth, p.health + 45);
        ctx.notify('Health restored.', 'good');
        break;
      }
      case 'cash':
        ctx.addMoney(k.amount);
        ctx.sfx('cash');
        ctx.notify(`[g]+$${k.amount}[/g]`, 'money');
        break;
    }
    if (ok) {
      COMBAT_AUDIO.play('pickup');
      this.pickups.remove(hit);
      this.persist();
    }
  }

  // ------------------------------------------------------------------ script hooks

  private missionGroups = new Set<number>();

  private registerHooks(): void {
    const H = COMBAT_HOOKS;
    H.giveWeapon = (weapon, ammo) => {
      if (weapon === 'armor') { this.armor = 100; this.persist(); return; }
      if (isWeaponId(weapon)) this.giveWeapon(weapon, ammo);
    };
    H.spawnEnemy = (type, x, z, heading) => this.spawnEnemy(type, x, z, heading, { mission: true })?.id ?? -1;
    H.spawnEnemyGroup = (type, place, count) => {
      const g = this.enemies.newGroup();
      this.missionGroups.add(g);
      const pl = PLACES[place] ?? { x: this.ctx.world.focus.x + 30, z: this.ctx.world.focus.z };
      const n = Math.max(1, Math.min(12, count));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
        const r = 5 + Math.random() * 7;
        this.spawnEnemy(type, pl.x + Math.cos(a) * r, pl.z + Math.sin(a) * r, a + Math.PI, { mission: true, group: g });
      }
      return g;
    };
    H.enemiesCleared = (group) => new Promise<void>((resolve) => {
      const tick = setInterval(() => { if (this.enemies.groupCleared(group)) { clearInterval(tick); resolve(); } }, 300);
    });
    H.setEnemyTarget = (id, isGroup) => {
      const f = this.ctx.world.focus;
      if (isGroup) { for (const e of this.enemies.groups.get(id) ?? []) { e.holdPosition = false; e.alertTo(f.x, f.z); } }
      else { const e = this.enemies.byId(id); if (e) { e.holdPosition = false; e.alertTo(f.x, f.z); } }
    };
    H.isEnemyDead = (id, isGroup) => {
      if (isGroup) return this.enemies.groupCleared(id);
      const e = this.enemies.byId(id);
      return !e || e.neutralized;
    };
    H.enemyPosition = (id) => {
      const e = this.enemies.byId(id);
      return e ? { x: e.pos.x, z: e.pos.z } : null;
    };
    H.spawnPickup = (item, x, z) => this.spawnPickup(parseItem(item), x, z, true);
    H.arrestTarget = (id) => new Promise<boolean>((resolve) => {
      const start = this.time;
      const tick = setInterval(() => {
        const e = this.enemies.byId(id);
        if (!e) { clearInterval(tick); resolve(false); return; }
        const s = e.state;
        if (s === 'down' || s === 'tied' || s === 'surrender') { clearInterval(tick); this.ctx.notify('Suspect detained.', 'good'); resolve(true); return; }
        if (s === 'dead') { clearInterval(tick); resolve(false); return; }
        if (e.dist > 160 || this.time - start > 180) { clearInterval(tick); resolve(false); }
      }, 250);
    });
    H.vehicleDisabled = (v, limit) => this.waitVehicleDisabled(v, limit);
    H.negotiate = (scene) => negotiate(this, scene);
    H.clearMission = () => {
      this.enemies.clear((e) => e.mission);
      this.missionGroups.clear();
      this.pickups.clear(false);
    };
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.swallowMouse, { capture: true });
    this.hud?.dispose();
    this.effects?.dispose();
  }
}
