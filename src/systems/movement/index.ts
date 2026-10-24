// MOVEMENT + WATER system ('movement'): GTA-style locomotion for Rico (crouch,
// vault/climb, landings, tumbles), swimming and diving with breath, the
// underwater world (sea floor, reefs, fish, dolphins, rays, lost hard drives),
// the Dive Shop (scuba gear), skydiving / parachuting / BASE jumping from the
// Palmetto Bank roof, movement HUD and slow stamina / lung training.
//
// Other systems: `ctx.system<MovementSystem>('movement')` — see the public API
// section below (getStats, cameraHint, isCrouched, isSwimming, underwater,
// canUseWeapons, noise, ragdoll, ...). Character poses for everyone are on the
// rig: `player.rig.setPose('aim', 1, { pitch })`.

import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import { Locomotion, type CameraHint, type MoveState } from './Locomotion';
import { Underwater } from './Underwater';
import { Gear } from './Gear';
import { MovementHud } from './Hud';
import { MoveAudio } from './sound';
import { DEFAULT_STATS, WATER_Y, growStats, lungCapacity, staminaMultiplier, terrainHeight, type MoveStats } from './physics';

export { WATER_Y } from './physics';
export type { MoveState, CameraHint } from './Locomotion';
export type { PoseName } from './poses';

interface MoveData {
  v: 1;
  stats: MoveStats;
  scuba: boolean;
  drives: string[];
}

/** Optional cooperation with the life sim (it owns stamina/lung stats when present). */
interface LifeLike extends GameSystem {
  lungStat?(): number;
  staminaStat?(): number;
  trainLung?(seconds: number): void;
}

export interface MovementStats {
  /** 0..100 */
  stamina: number;
  /** 0..100 */
  lung: number;
  /** Breath-hold time in seconds. */
  lungSeconds: number;
  /** Seconds of air left right now. */
  air: number;
  sprintDistance: number;
  swimDistance: number;
  underwaterTime: number;
  hasScuba: boolean;
  drivesFound: number;
  drivesTotal: number;
}

const DIVE_SHOP = { x: 200, z: 40 };
const BANK_PLAZA = { x: 48, z: -98 };
const ROOF_Y = 146.8; // top of the gold crown band
const ROOF_SPAWN = { x: 48, z: -128 };
const JUMP_POINT = { x: 48, z: -117.2 };
const SCUBA_PRICE = 400;
const DRIVE_REWARD = 250;

function signTexture(lines: string[], color: string, w = 512, h = 192): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(10,8,30,0.92)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 8;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.textAlign = 'center';
    g.font = `bold ${Math.round(h * 0.36)}px Bungee, Impact, sans-serif`;
    g.fillText(lines[0], w / 2, h * 0.5);
    if (lines[1]) {
      g.font = `600 ${Math.round(h * 0.17)}px Oswald, sans-serif`;
      g.fillStyle = '#ffffff';
      g.fillText(lines[1], w / 2, h * 0.8);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MovementSystem implements GameSystem {
  readonly id = 'movement';
  motor: Locomotion | null = null;
  /** True while the camera is underwater (audio can muffle on this). */
  underwater = false;
  /**
   * While true, this system repositions the camera itself for swim /
   * underwater / freefall / parachute shots (after CameraRig.update). Set to
   * false once CameraRig consumes `cameraHint()` directly.
   */
  cameraOverride = true;
  private ctx: SystemContext | null = null;
  private data: MoveData = { v: 1, stats: { ...DEFAULT_STATS }, scuba: false, drives: [] };
  private world: Underwater | null = null;
  private gear: Gear | null = null;
  private hud: MovementHud | null = null;
  private audio = new MoveAudio();
  private built = false;
  private saveT = 0;
  private dirty = false;
  private camTarget = new THREE.Vector3();
  private camMode: CameraHint['mode'] = 'foot';
  private camDir = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private head = new THREE.Vector3();
  private windLevel = 0;
  private fov = 60;

  // ---------------------------------------------------------------- lifecycle

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    const raw = ctx.getData<Partial<MoveData> | null>('movement', null);
    this.data = {
      v: 1,
      stats: { ...DEFAULT_STATS, ...(raw?.stats ?? {}) },
      scuba: !!raw?.scuba,
      drives: Array.isArray(raw?.drives) ? raw.drives.filter((d): d is string => typeof d === 'string') : [],
    };
    if (!this.built) {
      this.built = true;
      this.build(ctx);
    }
    this.world?.setFound(this.data.drives);
    this.refreshShopPrompt();
    if (this.motor) this.motor.breath.air = lungCapacity(this.lungStat());
  }

  private build(ctx: SystemContext): void {
    const w = ctx.world;
    const p = w.player;
    const motor = new Locomotion({
      damage: (hp, cause) => this.damage(hp, cause),
      sound: (n, s) => this.audio.play(n, s),
      splash: (x, z, s) => this.world?.splash(x, z, s),
      shake: (a) => w.rig.addShake(a),
      camPitch: () => w.rig.pitch,
      peds: () => w.peds.positions(),
      scuba: () => this.data.scuba,
      staminaStat: () => (this.life()?.staminaStat ? 0 : this.data.stats.stamina),
      lungStat: () => this.lungStat(),
    });
    this.motor = motor;
    p.motor = motor;
    motor.reset(p);
    try {
      this.world = new Underwater(ctx.scene, ctx.settings().quality);
    } catch (err) {
      console.error('[movement] underwater world failed', err);
    }
    try { this.gear = new Gear(ctx.scene, p); } catch (err) { console.error('[movement] gear failed', err); }
    this.hud = new MovementHud(ctx.hudRoot);
    this.buildProps(ctx);
    this.registerInteractions(ctx);
  }

  private life(): LifeLike | undefined {
    return this.ctx?.system<LifeLike>('life');
  }

  private lungStat(): number {
    const l = this.life();
    return l?.lungStat ? l.lungStat() : this.data.stats.lung;
  }

  private damage(hp: number, cause: 'fall' | 'drown' | 'impact'): void {
    const ctx = this.ctx;
    if (!ctx || hp <= 0) return;
    const w = ctx.world, p = w.player;
    if (cause === 'drown') {
      p.health = Math.max(0, p.health - hp);
      w.rig.addShake(0.1);
      if (p.health <= 0) w.events.onPlayerHit?.(0);
      return;
    }
    w.events.onPlayerHit?.(hp);
  }

  // ---------------------------------------------------------------- world props

  private buildProps(ctx: SystemContext): void {
    const col = ctx.world.city.collision;
    const g = new THREE.Group();
    g.name = 'movement-props';
    ctx.scene.add(g);

    // Dive Shop hut on the beach.
    {
      const { x, z } = DIVE_SHOP;
      const wood = new THREE.MeshStandardMaterial({ color: '#2fb5a8', roughness: 0.6 });
      const white = new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.7 });
      const counter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 3.2), white);
      counter.position.set(x + 1.6, 0.55, z);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 3.8), wood);
      roof.position.set(x + 2.1, 2.7, z);
      for (const dz of [-1.7, 1.7]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6), wood);
        post.position.set(x + 1.1, 1.3, z + dz);
        g.add(post);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 3.6), wood);
      back.position.set(x + 3.3, 1.3, z);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.1), new THREE.MeshBasicMaterial({ map: signTexture(['DIVE SHOP', 'SCUBA GEAR · TOURS'], '#19e6ff'), toneMapped: false }));
      sign.position.set(x + 1.0, 3.35, z);
      sign.rotation.y = -Math.PI / 2;
      const tankMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.35, metalness: 0.5 });
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 12), tankMat);
        t.position.set(x + 2.9, 0.35, z - 1.2 + i * 0.7);
        g.add(t);
      }
      for (const m of [counter, roof, back]) { m.castShadow = true; m.receiveShadow = true; }
      g.add(counter, roof, back, sign);
      col.add({ x0: x + 1.0, x1: x + 3.4, z0: z - 1.8, z1: z + 1.8, y0: 0, y1: 2.6, solidForCars: false });
    }

    // Palmetto Bank: express elevator door on the plaza, roof booth, crown collider, jump board.
    {
      const doorMat = new THREE.MeshBasicMaterial({ map: signTexture(['ROOF', 'EXPRESS ELEVATOR · BASE JUMP'], '#ffd23f'), toneMapped: false });
      const door = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.1), doorMat);
      door.position.set(BANK_PLAZA.x, 3.4, -109.6);
      g.add(door);
      // Crown band (decorative box at y 146..146.8 in City.ts) becomes walkable.
      col.add({ x0: 33.6, x1: 62.4, z0: -144.4, z1: -117.6, y0: 146, y1: ROOF_Y });
      col.add({ x0: 47.5, x1: 48.5, z0: -131.5, z1: -130.5, y0: 146, y1: 160 }); // antenna mast
      const booth = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 2.4), new THREE.MeshStandardMaterial({ color: '#d8c79a', roughness: 0.5, metalness: 0.3 }));
      booth.position.set(ROOF_SPAWN.x - 4, ROOF_Y + 1.3, ROOF_SPAWN.z - 3);
      booth.castShadow = true;
      g.add(booth);
      col.add({ x0: ROOF_SPAWN.x - 5.5, x1: ROOF_SPAWN.x - 2.5, z0: ROOF_SPAWN.z - 4.2, z1: ROOF_SPAWN.z - 1.8, y0: ROOF_Y, y1: ROOF_Y + 2.6 });
      const boothSign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), doorMat);
      boothSign.position.set(ROOF_SPAWN.x - 4, ROOF_Y + 3.1, ROOF_SPAWN.z - 1.75);
      g.add(boothSign);
      // Jump board sticking out over the south edge.
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 3.2), new THREE.MeshStandardMaterial({ color: '#ff2fa0', roughness: 0.4, emissive: '#ff2fa0', emissiveIntensity: 0.4 }));
      board.position.set(JUMP_POINT.x, ROOF_Y + 0.07, -117.6 + 1.2);
      board.castShadow = true;
      g.add(board);
      col.add({ x0: JUMP_POINT.x - 0.7, x1: JUMP_POINT.x + 0.7, z0: -117.6, z1: -115.2, y0: ROOF_Y - 0.1, y1: ROOF_Y + 0.15 });
    }
  }

  private registerInteractions(ctx: SystemContext): void {
    const it = ctx.interactions;
    const w = ctx.world;
    const onFoot = (): boolean => !w.vehicle && w.player.active;
    this.registerInteractionsShopOnly(ctx);
    it.set({
      id: 'movement:elevator-up', x: BANK_PLAZA.x, z: BANK_PLAZA.z, radius: 3, priority: 1,
      title: 'Express elevator to the roof',
      desc: 'Palmetto Bank Tower, 146 m. BASE jump with a parachute.',
      enabled: () => onFoot() && w.player.position.y < 20,
      action: () => this.toRoof(),
    });
    it.set({
      id: 'movement:elevator-down', x: ROOF_SPAWN.x - 4, z: ROOF_SPAWN.z - 0.6, radius: 2.4, priority: 1,
      title: 'Elevator down', desc: 'Back to the plaza.',
      enabled: () => onFoot() && w.player.position.y > 140,
      action: () => this.toPlaza(),
    });
    it.set({
      id: 'movement:basejump', x: JUMP_POINT.x, z: JUMP_POINT.z, radius: 2.2, priority: 2,
      title: 'BASE jump', desc: 'Leap off the tower. Space opens the parachute.',
      enabled: () => onFoot() && w.player.position.y > 140 && this.motor?.state === 'ground',
      action: () => this.baseJump(),
    });
  }

  private refreshShopPrompt(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.interactions.remove('movement:diveshop');
    this.registerInteractionsShopOnly(ctx);
  }

  private registerInteractionsShopOnly(ctx: SystemContext): void {
    const w = ctx.world;
    ctx.interactions.set({
      id: 'movement:diveshop', x: DIVE_SHOP.x, z: DIVE_SHOP.z, radius: 3.2, priority: 1,
      title: 'Dive Shop',
      desc: this.data.scuba ? 'Scuba gear owned: unlimited air, faster swimming.' : `Buy scuba gear ($${SCUBA_PRICE}): unlimited air underwater.`,
      enabled: () => !w.vehicle && w.player.active && w.player.position.y < 5,
      action: () => this.buyScuba(),
    });
  }

  private buyScuba(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.data.scuba) {
      ctx.notify('You already own [y]scuba gear[/y]. Dive with ~C~ in deep water, breathe forever.', 'info');
      return;
    }
    if (!ctx.addMoney(-SCUBA_PRICE)) {
      ctx.sfx('bad');
      ctx.notify(`Scuba gear costs [y]$${SCUBA_PRICE}[/y]. Come back with more cash.`, 'warn');
      return;
    }
    this.data.scuba = true;
    this.dirty = true;
    ctx.sfx('cash');
    ctx.notify(`[y]Scuba gear[/y] bought: unlimited air and faster swimming underwater. Lost hard drives lie on the sea floor...`, 'money');
    this.saveNow();
    this.refreshShopPrompt();
  }

  private toRoof(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = ctx.world;
    ctx.sfx('door');
    w.player.place(ROOF_SPAWN.x, ROOF_SPAWN.z, 0, ROOF_Y);
    w.rig.snapTo(w.player.position, Math.PI);
    ctx.notify('Palmetto Bank roof, [y]146 m[/y]. Walk off the pink board (or press ~E~ there) and open your parachute with ~SPACE~.', 'info');
  }

  private toPlaza(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.sfx('door');
    ctx.world.player.place(BANK_PLAZA.x, BANK_PLAZA.z + 1.5, 0, 0);
    ctx.world.rig.snapTo(ctx.world.player.position, Math.PI);
  }

  private baseJump(): void {
    const ctx = this.ctx, m = this.motor;
    if (!ctx || !m) return;
    const p = ctx.world.player;
    p.place(JUMP_POINT.x, -115.6, 0, ROOF_Y + 0.15);
    m.launch(p, 0, 8.5, 4.2);
    this.audio.play('jump');
  }

  private saveNow(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setData('movement', { v: 1, stats: { ...this.data.stats }, scuba: this.data.scuba, drives: [...this.data.drives] });
    this.dirty = false;
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, ctx: SystemContext): void {
    const m = this.motor;
    if (!m) return;
    const w = ctx.world, p = w.player;
    const s = ctx.settings();
    m.reducedMotion = s.reducedMotion;
    this.audio.setVolume(Math.max(0, Math.min(1, s.master * s.sfx)) * 0.9);
    if (p.motor !== m) p.motor = m; // reinstall if someone swapped the player
    if (!p.active && (m.state !== 'ground' || p.tiltPitch !== 0 || p.bodyLift !== 0)) {
      // Got into a vehicle mid-move (e.g. climbed into a boat from the water): sit up straight.
      m.reset(p);
      p.tiltPitch = p.tiltRoll = p.bodyLift = 0;
      p.sync();
    }

    // Training.
    if (m.sprintM + m.swimM + m.underS > 0) {
      const life = this.life();
      const st = this.data.stats;
      const before = { stamina: Math.floor(st.stamina / 5), lung: Math.floor(st.lung / 5) };
      growStats(st, m.sprintM, m.swimM, m.underS);
      if (life?.trainLung && m.underS > 0) life.trainLung(m.underS);
      if (!life?.lungStat) {
        if (Math.floor(st.stamina / 5) > before.stamina) ctx.notify(`[y]Stamina[/y] increased (${Math.floor(st.stamina)}/100)`, 'xp');
        if (Math.floor(st.lung / 5) > before.lung) ctx.notify(`[y]Lung capacity[/y] increased (${Math.floor(st.lung)}/100)`, 'xp');
      }
      m.sprintM = m.swimM = m.underS = 0;
      this.dirty = true;
    }
    this.saveT += dt;
    if (this.dirty && this.saveT > 5) { this.saveT = 0; this.saveNow(); }

    // Underwater world + pickups.
    const diving = m.state === 'under' && p.active;
    this.head.set(p.position.x + Math.sin(p.yaw) * 0.4, p.position.y + 1.05, p.position.z + Math.cos(p.yaw) * 0.4);
    if (diving) this.checkDrives(ctx);
    this.applyCamera(dt, ctx);
    if (this.world) {
      this.world.update(dt, w.time, ctx.camera, w.env, ctx.scene.fog instanceof THREE.Fog ? ctx.scene.fog : null,
        m.swimming, diving ? this.head : null, this.data.scuba);
      this.underwater = this.world.underwater;
    } else this.underwater = ctx.camera.position.y < WATER_Y;
    this.audio.setUnderwater(this.underwater);
    const wantWind = m.state === 'freefall' ? Math.min(1, -m.flight.vy / 45) : m.state === 'parachute' ? 0.25 : 0;
    this.windLevel += (wantWind - this.windLevel) * Math.min(1, dt * 3);
    this.audio.setWind(this.windLevel);
    this.gear?.update(dt, m, this.data.scuba);
  }

  always(_dt: number, ctx: SystemContext): void {
    const m = this.motor;
    if (!this.hud || !m) return;
    const w = ctx.world, p = w.player;
    const visible = !ctx.isBusy() && !w.vehicle && p.active;
    if (!visible) { this.hud.update({ visible: false, breath: null, scuba: false, crouched: false, noise: 0, prompts: [], altitude: null }); return; }
    const alt = m.state === 'freefall' || m.state === 'parachute'
      ? p.position.y - Math.max(terrainHeight(p.position.x, p.position.z), w.city.collision.groundHeight(p.position.x, p.position.z, p.position.y), WATER_Y)
      : null;
    this.hud.update({
      visible: true,
      breath: m.state === 'under' ? m.breath.air / m.breath.capacity : null,
      scuba: this.data.scuba,
      crouched: m.crouched && m.state === 'ground',
      noise: m.noise(p),
      prompts: m.prompts,
      altitude: alt,
    });
  }

  private checkDrives(ctx: SystemContext): void {
    const wd = this.world;
    if (!wd) return;
    const h = this.head;
    for (const d of wd.drives) {
      if (d.found) continue;
      const dx = d.x - h.x, dy = d.y - (h.y - 0.6), dz = d.z - h.z;
      if (dx * dx + dy * dy + dz * dz > 2.6) continue;
      d.found = true;
      d.mesh.visible = false;
      this.data.drives.push(d.id);
      const n = this.data.drives.length, total = wd.drives.length;
      ctx.addMoney(DRIVE_REWARD);
      ctx.sfx('pickup');
      ctx.notify(`Lost hard drive recovered [y](${n}/${total})[/y]. Data broker pays [y]$${DRIVE_REWARD}[/y].`, 'money');
      if (n === total) {
        ctx.addMoney(2000);
        ctx.sfx('levelup');
        ctx.notify('All lost hard drives recovered! Bonus [y]$2000[/y].', 'money');
      }
      wd.emitBubbles(d.x, d.y + 0.2, d.z, 20, 0.5);
      this.saveNow();
    }
  }

  /** Fallback camera for water / sky shots until CameraRig reads cameraHint() itself. */
  private applyCamera(dt: number, ctx: SystemContext): void {
    const m = this.motor;
    if (!m) return;
    const w = ctx.world, p = w.player;
    const rig = w.rig as unknown as { firstPerson?: boolean; yaw: number; pitch: number; distance: number };
    const hint = m.cam;
    const special = hint.mode === 'swim' || hint.mode === 'underwater' || hint.mode === 'freefall' || hint.mode === 'parachute' || hint.mode === 'tumble';
    if (!this.cameraOverride || rig.firstPerson || w.vehicle || !p.active || !special || ctx.isBusy()) {
      this.camMode = 'foot';
      this.fov = ctx.camera.fov;
      return;
    }
    const target = this.camPos.set(p.position.x, p.position.y + hint.heightOffset, p.position.z);
    if (this.camMode === 'foot') this.camTarget.copy(target);
    this.camMode = hint.mode;
    if (this.camTarget.distanceToSquared(target) > 400) this.camTarget.copy(target);
    this.camTarget.lerp(target, 1 - Math.exp(-dt * 9));
    const t = this.camTarget;
    const dir = this.camDir.set(Math.sin(rig.yaw) * Math.cos(rig.pitch), Math.sin(rig.pitch), Math.cos(rig.yaw) * Math.cos(rig.pitch));
    const dist = rig.distance + hint.extraDistance;
    const hit = w.city.collision.raycast(t.x, t.y, t.z, dir.x, dir.y, dir.z, dist);
    const d = Math.max(1.2, hit - 0.4);
    const cam = ctx.camera;
    cam.position.set(t.x + dir.x * d, t.y + dir.y * d, t.z + dir.z * d);
    if (cam.position.y < hint.minY) cam.position.y = hint.minY;
    if (cam.position.y > hint.maxY) cam.position.y = hint.maxY;
    cam.lookAt(t);
    this.fov += (60 + hint.fovBoost - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.hud?.dispose();
    this.world?.dispose();
    if (this.ctx && this.motor && this.ctx.world.player.motor === this.motor) this.ctx.world.player.motor = null;
  }

  // ---------------------------------------------------------------- public API (other systems)

  get state(): MoveState { return this.motor?.state ?? 'ground'; }
  /** Camera wishes for the current movement mode (CameraRig can apply these). */
  cameraHint(): CameraHint | null { return this.motor?.cam ?? null; }
  isCrouched(): boolean { return !!this.motor && this.motor.crouched && this.motor.state === 'ground'; }
  setCrouch(on: boolean): void { this.motor?.setCrouch(on); }
  isSwimming(): boolean { return !!this.motor?.swimming; }
  /** Rico's body is underwater (diving). `underwater` is the camera. */
  isDiving(): boolean { return this.motor?.state === 'under'; }
  isAirborne(): boolean { return !!this.motor?.airborne; }
  /** False while swimming, climbing, tumbling, skydiving... (combat should holster). */
  canUseWeapons(): boolean {
    const s = this.state;
    return s === 'ground' || s === 'air' || s === 'stumble';
  }
  /** 0 (silent) .. 1 (loud) movement noise for stealth / police hearing. */
  noise(): number { return this.motor && this.ctx ? this.motor.noise(this.ctx.world.player) : 0.4; }
  /** Knock Rico over (explosions, melee hits). */
  ragdoll(dirX: number, dirZ: number, force: number): void {
    if (this.motor && this.ctx) this.motor.ragdoll(this.ctx.world.player, dirX, dirZ, force);
  }
  hasScuba(): boolean { return this.data.scuba; }
  /** Grant scuba gear (rewards, shops). */
  giveScuba(): void { this.data.scuba = true; this.saveNow(); this.refreshShopPrompt(); }
  getStats(): MovementStats {
    const st = this.data.stats;
    const life = this.life();
    const stamina = life?.staminaStat ? life.staminaStat() : st.stamina;
    const lung = this.lungStat();
    return {
      stamina, lung, lungSeconds: lungCapacity(lung), air: this.motor?.breath.air ?? lungCapacity(lung),
      sprintDistance: st.sprintDist, swimDistance: st.swimDist, underwaterTime: st.underwaterTime,
      hasScuba: this.data.scuba, drivesFound: this.data.drives.length, drivesTotal: this.world?.drives.length ?? 10,
    };
  }
  /** Sprint endurance multiplier from movement training (1..2; life sim applies its own when present). */
  staminaMultiplier(): number { return this.life()?.staminaStat ? 1 : staminaMultiplier(this.data.stats.stamina); }
}

export default function create(): GameSystem {
  return new MovementSystem();
}
