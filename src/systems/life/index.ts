// LIFE SIM system ('life'): Rico's body & needs (health regen, stamina,
// strength, Focus, lung capacity, hunger, thirst, fatigue, fat/muscle shape),
// food & drink vendors, the two gyms, and the safehouse (bed/sleep+save,
// wardrobe, fridge, TV, stash, mirror). Other systems talk to it through the
// public methods below (`ctx.system<LifeSystem>('life')`).
import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import {
  bodyLabel, bodyShape, consume, defaultLife, hasBoost, lungSeconds, meleeMultiplier, regen, sanitizeLife, sleep as sleepStats,
  spendFocus, speedMultiplier, staminaMultiplier, tick, trainLung, warnings, type LifeState, type Warning, clamp, day,
} from './stats';
import { FOOD, FRIDGE_ITEMS, FRIDGE_PER_DAY, VENDORS, canBuyFood, effectLine, type Vendor } from './food';
import { Stash } from './stash';
import { InteriorManager, INTERIOR_Y, type Interior } from './interiors';
import { HintBox, ensureCss, h, key, money, runMenu, statBar, splash, type MenuRow, modal } from './ui';
import { Culler, facadeNear, findClear, iconSprite, neonSign } from './world';
import * as P from './props';
import { RigPoser } from './rigtools';
import { applyPose, buildStation, EXERCISE_NAMES, exerciseDesc, runWorkout, type Exercise, type PoseState, type Station } from './gym';
import { emitEvent } from './bus';

export type { LifeState } from './stats';
export { Stash } from './stash';

interface SavedLife {
  state: LifeState;
  stash: unknown;
  fridge: { day: number; used: number };
  tvOn?: boolean;
}

/** Optional cooperation with the shops system (wardrobe / mirror). */
interface ShopsLike extends GameSystem {
  openWardrobe?(): Promise<void>;
  openMirror?(): Promise<void>;
}

const WARN_TEXT: Record<Warning, string> = {
  hungry: '🍔 Hungry', starving: '🍔 Starving', thirsty: '💧 Thirsty', dehydrated: '💧 Dehydrated', tired: '😴 Tired', exhausted: '😴 Exhausted',
};

export class LifeSystem implements GameSystem {
  readonly id = 'life';
  state: LifeState = defaultLife();
  readonly stash = new Stash(60);
  private ctx: SystemContext | null = null;
  private built = false;
  interiors: InteriorManager | null = null;
  private fridgeUse = { day: 0, used: 0 };
  private warnEl: HTMLElement | null = null;
  private warnKey = '';
  private hint: HintBox | null = null;
  private poser: RigPoser | null = null;
  private shapeKey = '';
  private baseStamina = 1;
  private lastStaminaWritten = -1;
  private lastHealth = -1;
  private regenDelay = 0;
  private saveT = 0;
  private pose: PoseState | null = null;
  private stations: Station[] = [];
  private culler = new Culler();
  private icons: THREE.Sprite[] = [];
  private tv: { screen: THREE.Mesh; tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; on: boolean; t: number } | null = null;
  private lastPos = new THREE.Vector3();
  safehouse: Interior | null = null;
  gym: Interior | null = null;
  /** Doors (for map blips). */
  readonly places: { id: string; name: string; x: number; z: number; kind: string }[] = [];

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    ensureCss();
    const saved = ctx.getData<SavedLife | null>('life', null);
    this.state = sanitizeLife(saved?.state);
    this.stash.load(saved?.stash);
    this.fridgeUse = saved?.fridge ?? { day: 0, used: 0 };
    this.stash.onChange = () => this.persist();
    if (!this.built) {
      this.built = true;
      this.hint = new HintBox(ctx);
      this.interiors = new InteriorManager(ctx.scene);
      try { this.buildWorld(ctx); } catch (err) { console.error('[life] world build failed', err); }
    } else {
      this.interiors?.leaveNow();
    }
    if (saved?.tvOn && this.tv) this.tv.on = true;
    this.poser = new RigPoser(ctx.world.player.rig);
    this.shapeKey = '';
    this.lastStaminaWritten = -1;
    this.lastHealth = ctx.world.player.health;
    this.lastPos.copy(ctx.world.player.position);
  }

  // ---------------------------------------------------------------- public API (other systems)

  /** 0..100 skill stats. */
  strength(): number { return this.state.strength; }
  staminaStat(): number { return this.state.stamina; }
  lungStat(): number { return this.state.lung; }
  /** Focus meter 0..1 (combat slow-mo fuel). */
  focus(): number { return this.state.focus / 100; }
  /** Spend focus (percent points); false when empty. */
  spendFocus(amount: number): boolean { return spendFocus(this.state, amount); }
  /** Seconds Rico can hold his breath. */
  lungCapacity(): number { return lungSeconds(this.state); }
  /** Movement system reports time spent underwater/swimming to train lungs & stamina. */
  trainLung(seconds: number): void { trainLung(this.state, seconds); }
  meleeMultiplier(): number { return meleeMultiplier(this.state); }
  staminaMultiplier(): number { return staminaMultiplier(this.state); }
  speedMultiplier(): number { return this.pose ? 0 : speedMultiplier(this.state); }
  warnings(): Warning[] { return warnings(this.state); }
  bodyShape(): { width: number; bulk: number; label: string } { return { ...bodyShape(this.state), label: bodyLabel(this.state) }; }
  hasBoost(id: 'energy' | 'protein' | 'coffee' | 'tipsy'): boolean { return hasBoost(this.state, id); }
  /** Interior id the player is in ('safehouse' | 'ironbay' | 'afterglow' | ...), or null. */
  inside(): string | null { return this.interiors?.inside() ?? null; }
  /** Eat/drink an item by id from the food table (free). Returns false if unknown. */
  consume(itemId: string, place = ''): boolean {
    const f = FOOD[itemId];
    if (!f || !this.ctx) return false;
    const hp = consume(this.state, f);
    const p = this.ctx.world.player;
    p.health = Math.min(p.maxHealth, p.health + hp);
    emitEvent({ type: 'meal', item: f.name, place });
    this.persist();
    return true;
  }
  /** Add fatigue / hunger deltas from other activities (e.g. swimming). */
  exert(amount: number): void {
    this.state.fatigue = clamp(this.state.fatigue + amount);
    this.state.thirst = clamp(this.state.thirst - amount * 0.6);
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, ctx: SystemContext): void {
    const w = ctx.world, p = w.player;
    const hours = (dt * w.timeScale) / 60;
    const moved = p.active ? Math.hypot(p.position.x - this.lastPos.x, p.position.z - this.lastPos.z) : 0;
    this.lastPos.copy(p.position);
    tick(this.state, { hours, sprinting: p.active && p.speed > 5.2, meters: moved < 5 ? moved : 0 });
    if (p.health > 0 && this.lastHealth > 0 && p.health < this.lastHealth - 0.01) this.regenDelay = 6;
    if (this.regenDelay > 0) this.regenDelay -= dt;
    else if (p.health > 0) {
      const r = regen(this.state);
      const cap = p.maxHealth * r.cap;
      if (p.health < cap) p.health = Math.min(cap, p.health + r.perSec * dt);
    }
    this.lastHealth = p.health;
    // stamina multiplier: multiply whatever base the game set (skills), don't fight it
    if (Math.abs(p.staminaMult - this.lastStaminaWritten) > 1e-6) this.baseStamina = p.staminaMult;
    p.staminaMult = this.baseStamina * staminaMultiplier(this.state);
    this.lastStaminaWritten = p.staminaMult;
    this.interiors?.check();
    this.culler.update(p.position.x, p.position.z);
    this.saveT += dt;
    if (this.saveT > 4) { this.saveT = 0; this.persist(); }
    this.updateHint(ctx);
  }

  always(dt: number, ctx: SystemContext): void {
    const busy = ctx.isBusy();
    if (this.pose) applyPose(ctx, this.pose, dt);
    this.applyShape(ctx);
    this.updateWarnings(ctx, busy);
    this.hint?.visible(!busy);
    const t = ctx.world.time;
    for (const s of this.icons) s.position.y = s.userData.y + Math.sin(t * 2 + s.userData.y) * 0.15;
    if (this.tv?.on && this.interiors?.inside() === 'safehouse') this.drawTv(dt);
  }

  private persist(): void {
    if (!this.ctx) return;
    const d: SavedLife = { state: this.state, stash: this.stash.list(), fridge: this.fridgeUse, tvOn: this.tv?.on };
    this.ctx.setData('life', d);
  }

  private applyShape(ctx: SystemContext): void {
    const s = bodyShape(this.state);
    const k = `${s.width.toFixed(3)}|${s.bulk.toFixed(3)}`;
    const root = ctx.world.player.rig.root;
    if (k === this.shapeKey && Math.abs(root.scale.x - s.width) < 1e-4) return;
    this.shapeKey = k;
    root.scale.set(s.width, 1, s.width);
    const pz = this.poser;
    if (pz?.hasBones) {
      pz.thicken('UpperArmL', s.bulk);
      pz.thicken('UpperArmR', s.bulk);
      pz.thicken('Torso', 1 + (s.bulk - 1) * 0.35, 'Neck');
      pz.thicken('UpperLegL', 1 + (s.bulk - 1) * 0.4);
      pz.thicken('UpperLegR', 1 + (s.bulk - 1) * 0.4);
    }
  }

  private updateWarnings(ctx: SystemContext, busy: boolean): void {
    const ws = warnings(this.state);
    const boosts = this.state.boosts.map((b) => b.id);
    const k = busy ? 'busy' : `${ws.join(',')}|${boosts.join(',')}`;
    if (k === this.warnKey) return;
    this.warnKey = k;
    if (!this.warnEl) { this.warnEl = h('div', { class: 'lf-warns' }); ctx.hudRoot.append(this.warnEl); }
    this.warnEl.style.display = busy ? 'none' : '';
    const bad = new Set<Warning>(['starving', 'dehydrated', 'exhausted']);
    const BOOST: Record<string, string> = { energy: '⚡ Energized', protein: '💪 Gains ×2', coffee: '☕ Caffeinated', tipsy: '🍹 Tipsy' };
    this.warnEl.innerHTML = ws.map((w) => `<div class="lf-warn${bad.has(w) ? ' bad' : ''}">${WARN_TEXT[w]}</div>`).join('')
      + boosts.map((b) => `<div class="lf-warn" style="border-left-color:#72cc72;animation:none">${BOOST[b] ?? b}</div>`).join('');
    if (ws.includes('starving') || ws.includes('dehydrated')) ctx.notify('Rico needs food and water — stamina is suffering. Find a [y]food truck[/y] or vending machine.', 'warn');
    else if (ws.includes('exhausted')) ctx.notify('Rico is exhausted. [y]Sleep[/y] at the safehouse or drink an espresso.', 'warn');
  }

  private updateHint(ctx: SystemContext): void {
    if (this.interiors?.inside() === 'safehouse') this.hint?.set(`<b style="color:#f0c850">RICO'S APARTMENT</b><br>Sleep to save · fridge · wardrobe · stash. ${key('P')} phone`);
    else if (this.interiors?.inside() === 'ironbay') this.hint?.set(`<b style="color:#f0c850">IRON BAY GYM</b><br>Walk up to any machine and press ${key('E')} to train.`);
    else this.hint?.set(null);
    void ctx;
  }

  // ---------------------------------------------------------------- world

  private buildWorld(ctx: SystemContext): void {
    const scene = ctx.scene, col = ctx.world.city.collision;
    // ---- food vendors
    for (const v of VENDORS) {
      let { x, z } = v;
      let obj: THREE.Group | null = null;
      if (v.kind === 'truck') { ({ x, z } = findClear(col, x, z, 3, 7)); obj = P.tacoTruck(v.name, v.color); obj.rotation.y = Math.PI; col.add({ x0: x - 1.2, x1: x + 1.2, z0: z - 2.7, z1: z + 4.1, y0: 0, y1: 3 }); }
      else if (v.kind === 'stand' && v.id === 'coco') { ({ x, z } = findClear(col, x, z, 3, 2)); obj = P.coconutStand(v.color); col.add({ x0: x - 1.1, x1: x + 1.1, z0: z - 0.5, z1: z + 0.5, y0: 0, y1: 1.1 }); }
      else if (v.kind === 'stand') { ({ x, z } = findClear(col, x, z, 4.5, 4)); obj = P.burgerStand(v.name, v.color); col.add({ x0: x - 1.7, x1: x + 1.7, z0: z - 1.1, z1: z + 1.1, y0: 0, y1: 1.15 }); }
      else if (v.kind === 'vending') { ({ x, z } = findClear(col, x, z, 1.2, 1.2, 10)); obj = P.vendingMachine(v.color); col.add({ x0: x - 0.48, x1: x + 0.48, z0: z - 0.38, z1: z + 0.38, y0: 0, y1: 1.9 }); }
      if (obj) { obj.position.set(x, 0, z); scene.add(obj); this.culler.add(obj, x, z, 160); }
      // customer spot in front
      const ix = v.kind === 'truck' ? x - 2.0 : x, iz = v.kind === 'truck' ? z + 0.3 : v.kind === 'vending' ? z + 1.0 : z + 1.8;
      const vend: Vendor = { ...v, x: ix, z: iz };
      ctx.interactions.set({
        id: `life-food-${v.id}`, x: ix, z: iz, radius: v.kind === 'vending' ? 1.8 : 3.2, priority: 1,
        title: v.kind === 'vending' ? 'Use vending machine' : `Order at ${v.name}`, desc: v.tagline,
        enabled: () => !ctx.world.vehicle,
        action: () => void this.openVendor(vend),
      });
      if (v.kind !== 'vending') this.addIcon(ctx, v.kind === 'cafe' ? '☕' : v.id === 'coco' ? '🥥' : v.id === 'taco' ? '🌮' : '🍔', v.color, ix, iz, 4.2);
      this.places.push({ id: v.id, name: v.name, x: ix, z: iz, kind: 'food' });
    }
    this.buildSafehouse(ctx);
    this.buildMuscleBeach(ctx);
    this.buildIronBay(ctx);
  }

  private addIcon(ctx: SystemContext, emoji: string, color: string, x: number, z: number, y: number, yBase = 0): void {
    const s = iconSprite(emoji, color, 1.3);
    s.position.set(x, yBase + y, z);
    s.userData.y = yBase + y;
    ctx.scene.add(s);
    this.icons.push(s);
    this.culler.add(s, x, z, 70);
  }

  /** Street door at a facade near (x, z). Returns the door spot + outward yaw. */
  private streetDoor(ctx: SystemContext, x: number, z: number, name: string, color: string): { x: number; z: number; yaw: number } {
    const f = facadeNear(ctx.world.city.collision, x, z, 14);
    const door = f ? { x: f.wx + f.nx * 0.2, z: f.wz + f.nz * 0.2, yaw: f.yaw } : { x, z, yaw: 0 };
    const frame = P.doorFrame(name, color);
    frame.position.set(door.x, 0, door.z);
    frame.rotation.y = door.yaw;
    ctx.scene.add(frame);
    this.culler.add(frame, door.x, door.z, 180);
    const spot = { x: door.x + Math.sin(door.yaw) * 1.3, z: door.z + Math.cos(door.yaw) * 1.3, yaw: door.yaw };
    return spot;
  }

  private buildSafehouse(ctx: SystemContext): void {
    const im = this.interiors!;
    const door = this.streetDoor(ctx, -138, -3.6, "Rico's", '#19e6ff');
    this.addIcon(ctx, '🏠', '#19e6ff', door.x, door.z, 4.8);
    this.places.push({ id: 'safehouse', name: "Rico's Apartment", x: door.x, z: door.z, kind: 'home' });
    const room = im.add(ctx, {
      id: 'safehouse', name: "Rico's Apartment", cx: 300, cz: 200, w: 14, d: 10, h: 3.4,
      floor: '#c9a27a', wall: '#ffd6e0', spawn: { x: 0, z: 3.6, yaw: Math.PI }, door,
      light: { color: '#ffe2c4', intensity: 26 },
    });
    this.safehouse = room;
    const g = room.group;
    const put = (o: THREE.Object3D, x: number, z: number, yaw = 0) => { o.position.set(x, 0, z); o.rotation.y = yaw; g.add(o); return o; };
    put(P.rug(4, 3, '#19c3d6'), 0, -1.2);
    put(P.bed(), -5, -3.2, 0); room.solid(ctx, -5, -3.2, 2.0, 2.3, 0.7);
    put(P.wardrobe(), 6.6, -3.6, -Math.PI / 2); room.solid(ctx, 6.6, -3.6, 0.7, 1.8, 2.3);
    put(P.fridge(), 6.5, 2.6, -Math.PI / 2); room.solid(ctx, 6.5, 2.6, 0.75, 0.85, 1.9);
    put(P.counter(3), 6.6, 0.4, -Math.PI / 2); room.solid(ctx, 6.6, 0.4, 0.65, 3, 0.95);
    put(P.couch('#7b2cff'), 0, 0.6, Math.PI); room.solid(ctx, 0, 0.6, 2.4, 0.9, 0.6);
    const tv = P.tvUnit();
    put(tv.group, 0, -4.6, 0); room.solid(ctx, 0, -4.6, 2, 0.5, 0.5);
    put(P.safeBox(), -6.4, 3.4, Math.PI / 2); room.solid(ctx, -6.4, 3.4, 0.7, 0.8, 0.9);
    put(P.mirror(), -6.95, -0.2, Math.PI / 2);
    put(P.plant(), -6.4, 1.6); put(P.plant(), 3.2, -4.4);
    const win = P.fakeWindow(3.2, 1.6);
    win.position.set(-2.6, 1.9, -4.98);
    g.add(win);
    const vice = neonSign('Neon Bay', '#ff2fa0', 2.6, 0.7);
    vice.position.set(-5, 2.4, -4.95);
    g.add(vice);
    // TV canvas
    const c = document.createElement('canvas');
    c.width = 256; c.height = 150;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tv = { screen: tv.screen, tex, g: c.getContext('2d')!, on: false, t: 0 };
    const X = (x: number) => room.wx(x), Z = (z: number) => room.wz(z);
    const inside = () => im.inside() === 'safehouse';
    const I = (id: string, x: number, z: number, title: string, desc: string, action: () => void, r = 1.7) =>
      ctx.interactions.set({ id: `life-safe-${id}`, x: X(x), z: Z(z), radius: r, priority: 2, title, desc, enabled: inside, action });
    I('bed', -3.6, -2.2, 'Sleep', 'Sleep 8 hours · restores energy & health · saves the game', () => void this.sleep());
    I('wardrobe', 5.6, -3.6, 'Wardrobe', 'Change into clothes you own', () => void this.wardrobe());
    I('fridge', 5.6, 2.6, 'Open fridge', `Free snacks (${FRIDGE_PER_DAY} a day)`, () => void this.openFridge());
    I('tv', 0, -0.7, 'Watch TV', 'Turn the TV on / off', () => this.toggleTv());
    I('stash', -5.6, 3.4, 'Stash', 'Store items safely', () => void this.openStash());
    I('mirror', -6.1, -0.2, 'Mirror', 'Check yourself out', () => void this.mirror());
    void INTERIOR_Y;
  }

  private buildMuscleBeach(ctx: SystemContext): void {
    const col = ctx.world.city.collision;
    const c = findClear(col, 205, -150, 16, 12, 20);
    const base = new THREE.Group();
    // rubber floor + low wall + sign
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 13), new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(c.x, 0.03, c.z);
    floor.receiveShadow = true;
    base.add(floor);
    const sign = neonSign('Muscle Beach', '#ff8a3d', 7, 1.6);
    sign.position.set(c.x, 4.2, c.z - 6.6);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    pole.position.set(c.x, 3.3, c.z - 6.6);
    base.add(sign, pole);
    for (const sx of [-3.5, 3.5]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
      p.position.set(c.x + sx, 1.7, c.z - 6.6);
      base.add(p);
    }
    ctx.scene.add(base);
    this.culler.add(base, c.x, c.z, 220);
    this.addIcon(ctx, '🏋️', '#ff8a3d', c.x, c.z - 6.6, 6);
    this.places.push({ id: 'musclebeach', name: 'Muscle Beach Gym', x: c.x, z: c.z, kind: 'gym' });
    const layout: [Exercise, number, number, number][] = [
      ['bench', -6, -1.5, 0], ['squat', -2.5, -3, 0], ['deadlift', 1.5, -3, 0],
      ['pulldown', 5.5, -2.5, 0], ['bag', 6, 3, 0], ['treadmill', -5.5, 3.5, Math.PI], ['treadmill', -3.5, 3.5, Math.PI],
    ];
    layout.forEach(([ex, x, z, yaw], i) => this.addStation(ctx, { id: `mb-${i}`, gym: 'Muscle Beach', exercise: ex, x: c.x + x, z: c.z + z, y: 0, yaw }, false));
  }

  private buildIronBay(ctx: SystemContext): void {
    const im = this.interiors!;
    const door = this.streetDoor(ctx, -135, -70.5, 'Iron Bay Gym', '#ff2fa0');
    this.addIcon(ctx, '🏋️', '#ff2fa0', door.x, door.z, 4.8);
    this.places.push({ id: 'ironbay', name: 'Iron Bay Gym', x: door.x, z: door.z, kind: 'gym' });
    const room = im.add(ctx, {
      id: 'ironbay', name: 'Iron Bay Gym', cx: 300, cz: 240, w: 20, d: 14, h: 4.6,
      floor: '#3a3a42', wall: '#d9d9e0', spawn: { x: 0, z: 5.6, yaw: Math.PI }, door,
      light: { color: '#f4f8ff', intensity: 45 },
    });
    this.gym = room;
    const g = room.group;
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(20, 0.5), new THREE.MeshBasicMaterial({ color: '#ff2fa0', toneMapped: false }));
    stripe.position.set(0, 2.6, -6.98);
    g.add(stripe);
    const s1 = neonSign('IRON BAY', '#ff2fa0', 5, 1.3);
    s1.position.set(0, 3.5, -6.95);
    g.add(s1);
    for (let i = 0; i < 4; i++) {
      const m = P.mirror();
      m.position.set(-7.5 + i * 5, 0, -6.95);
      m.scale.set(2.5, 1, 1);
      g.add(m);
    }
    const layout: [Exercise, number, number, number][] = [
      ['bench', -7, -2.5, 0], ['bench', -4, -2.5, 0], ['squat', 0, -4, 0], ['deadlift', 4, -4, 0],
      ['pulldown', 8, -3.5, 0], ['bag', 7.5, 3, 0], ['treadmill', -8, 3.5, Math.PI], ['treadmill', -6.4, 3.5, Math.PI], ['treadmill', -4.8, 3.5, Math.PI],
    ];
    layout.forEach(([ex, x, z, yaw], i) => this.addStation(ctx, { id: `ib-${i}`, gym: 'Iron Bay Gym', exercise: ex, x: room.wx(x), z: room.wz(z), y: INTERIOR_Y, yaw }, true, g, room));
    // protein bar counter
    const ctr = P.counter(2.4);
    ctr.position.set(2, 0, 5.8);
    g.add(ctr);
    room.solid(ctx, 2, 5.8, 2.4, 0.65, 0.95);
    ctx.interactions.set({
      id: 'life-food-ironbay', x: room.wx(2), z: room.wz(4.9), radius: 1.8, priority: 2, title: 'Protein bar', desc: 'Shakes and fuel',
      enabled: () => im.inside() === 'ironbay',
      action: () => void this.openVendor({ id: 'ironbar', name: 'Iron Bay Fuel Bar', tagline: 'Shakes · water · energy', color: '#ff2fa0', x: 0, z: 0, kind: 'stand', items: ['protein', 'water', 'energy', 'smoothie', 'salad'] }),
    });
  }

  private addStation(ctx: SystemContext, st: Station, interior: boolean, parent?: THREE.Group, room?: Interior): void {
    const grp = buildStation(st);
    if (interior && parent) {
      // station group lives in world coords; keep it in the room group for visibility toggling
      grp.position.set(st.x - parent.position.x, 0, st.z - parent.position.z);
      parent.add(grp);
    } else {
      ctx.scene.add(grp);
      this.culler.add(grp, st.x, st.z, 160);
    }
    this.stations.push(st);
    const fp: Record<Exercise, [number, number]> = { bench: [0.6, 1.6], squat: [2.0, 1.2], deadlift: [2.0, 1.2], pulldown: [0.6, 1.4], bag: [0.5, 0.5], treadmill: [0.9, 1.9] };
    const [fw, fd] = fp[st.exercise];
    const solid = st.exercise !== 'squat' && st.exercise !== 'deadlift';
    if (solid) {
      const cx = st.exercise === 'bench' ? st.x - Math.sin(st.yaw) * 0.55 : st.exercise === 'bag' ? st.x : st.x;
      const cz = st.exercise === 'bench' ? st.z - Math.cos(st.yaw) * 0.55 : st.z;
      if (room) ctx.world.city.collision.add({ x0: cx - fw / 2, x1: cx + fw / 2, z0: cz - fd / 2, z1: cz + fd / 2, y0: INTERIOR_Y, y1: INTERIOR_Y + 0.5 });
      else ctx.world.city.collision.add({ x0: cx - fw / 2, x1: cx + fw / 2, z0: cz - fd / 2, z1: cz + fd / 2, y0: 0, y1: 0.5 });
    }
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    const ix = st.x + fx * 1.2, iz = st.z + fz * 1.2;
    const im = this.interiors!;
    ctx.interactions.set({
      id: `life-gym-${st.id}`, x: ix, z: iz, radius: 1.6, priority: 2,
      title: `${EXERCISE_NAMES[st.exercise]}`, desc: `${st.gym} · ${exerciseDesc(st.exercise)}`,
      enabled: () => !ctx.world.vehicle && (interior ? im.inside() === 'ironbay' : !im.inside()),
      action: () => void this.workout(st),
    });
  }

  private async workout(st: Station): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.pose) return;
    if (this.state.fatigue > 95) { ctx.notify('Too exhausted to train. Get some sleep first.', 'warn'); return; }
    const yawBefore = ctx.world.player.yaw;
    await runWorkout(ctx, this.state, st, (p) => { this.pose = p; }, () => this.persist());
    const p = ctx.world.player;
    p.place(st.x + Math.sin(st.yaw) * 1.3, st.z + Math.cos(st.yaw) * 1.3, yawBefore);
    p.position.y = st.y;
    p.sync();
  }

  // ---------------------------------------------------------------- food

  async openVendor(v: Vendor): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const rows = (): MenuRow[] => [
      { id: 'h', label: 'Menu', header: true },
      ...v.items.map((id): MenuRow => {
        const f = FOOD[id];
        const can = ctx.profile().credits >= f.price;
        return {
          id, icon: f.icon, label: f.name, right: f.price ? money(f.price) : 'FREE', disabled: !can,
          desc: `${f.desc}  <span style="color:#72cc72">${effectLine(f)}</span>`,
          onSelect: () => this.buyFood(id, v.name),
        };
      }),
    ];
    await runMenu(ctx, { title: v.name, subtitle: v.tagline, color: v.color, rows, side: () => this.needsPanel() });
  }

  private buyFood(id: string, place: string): void {
    const ctx = this.ctx!;
    const r = canBuyFood(id, ctx.profile().credits);
    if (!r.ok) { ctx.notify(r.reason, 'warn'); ctx.sfx('bad'); return; }
    if (r.item.price) {
      ctx.addMoney(-r.item.price);
      emitEvent({ type: 'money', amount: -r.item.price, reason: `${place}: ${r.item.name}` });
      emitEvent({ type: 'purchase', item: r.item.name, price: r.item.price, shop: place });
    }
    this.consume(id, place);
    ctx.sfx('cash');
    ctx.notify(`${r.item.icon} ${r.item.name}${r.item.price ? `  -${money(r.item.price)}` : ''}`, 'money');
  }

  /** Needs panel (side of menus + phone stats). */
  needsPanel(): string {
    const s = this.state;
    const p = this.ctx?.world.player;
    return `<h3>RICO</h3>${statBar('Health', p ? (p.health / p.maxHealth) * 100 : 100, '#58b947')}${statBar('Food', s.hunger, '#ff8a3d')}${statBar('Drink', s.thirst, '#4aa4e0')}${statBar('Energy', 100 - s.fatigue, '#f0c850')}`;
  }

  private async openFridge(): Promise<void> {
    const ctx = this.ctx!;
    const today = day(this.state);
    if (this.fridgeUse.day !== today) this.fridgeUse = { day: today, used: 0 };
    ctx.sfx('door');
    const rows = (): MenuRow[] => [
      { id: 'h', label: `Fridge · ${FRIDGE_PER_DAY - this.fridgeUse.used} left today`, header: true },
      ...FRIDGE_ITEMS.map((id): MenuRow => {
        const f = FOOD[id];
        return {
          id, icon: f.icon, label: f.name, right: 'FREE', disabled: this.fridgeUse.used >= FRIDGE_PER_DAY, desc: `${f.desc}  <span style="color:#72cc72">${effectLine(f)}</span>`,
          onSelect: () => { this.fridgeUse.used++; this.consume(id, 'home'); ctx.sfx('pickup'); ctx.notify(`${f.icon} ${f.name}`, 'good'); },
        };
      }),
    ];
    await runMenu(ctx, { title: 'Fridge', subtitle: 'Rico\'s kitchen', color: '#19c3d6', rows, side: () => this.needsPanel() });
  }

  // ---------------------------------------------------------------- safehouse actions

  async sleep(): Promise<void> {
    const ctx = this.ctx!;
    await modal(ctx, async () => {
      await ctx.ui.fade(true);
      const hours = 8;
      ctx.world.hour = (ctx.world.hour + hours) % 24;
      this.state.clock += hours;
      sleepStats(this.state, hours);
      const p = ctx.world.player;
      p.health = p.maxHealth;
      this.lastHealth = p.health;
      this.persist();
      ctx.save();
      await new Promise((r) => setTimeout(r, 700));
      await ctx.ui.fade(false);
    });
    emitEvent({ type: 'sleep', hours: 8 });
    splash(ctx, 'Rested', 'Game saved · energy and health restored', '#72cc72');
    ctx.sfx('good');
  }

  private async wardrobe(): Promise<void> {
    const ctx = this.ctx!;
    const shops = ctx.system<ShopsLike>('shops');
    if (shops?.openWardrobe) await shops.openWardrobe();
    else ctx.notify('Wardrobe unavailable.', 'warn');
  }

  private async mirror(): Promise<void> {
    const ctx = this.ctx!;
    const shops = ctx.system<ShopsLike>('shops');
    if (shops?.openMirror) { await shops.openMirror(); return; }
    await runMenu(ctx, { title: 'Mirror', subtitle: bodyLabel(this.state), rows: () => [{ id: 'ok', label: 'Looking good, Rico.', onSelect: () => 'close' }], side: () => this.bodyPanel() });
  }

  bodyPanel(): string {
    const s = this.state;
    return `<h3>${bodyLabel(s).toUpperCase()}</h3>${statBar('Strength', s.strength, '#e0453a')}${statBar('Stamina', s.stamina, '#4aa4e0')}${statBar('Lung Capacity', s.lung, '#3dffb0')}${statBar('Muscle', s.muscle, '#f0c850')}${statBar('Body Fat', s.fat, '#ff8a3d')}`;
  }

  private toggleTv(): void {
    if (!this.tv) return;
    this.tv.on = !this.tv.on;
    const m = this.tv.screen.material as THREE.MeshBasicMaterial;
    m.map = this.tv.on ? this.tv.tex : null;
    m.color.set(this.tv.on ? '#ffffff' : '#05050a');
    m.needsUpdate = true;
    this.ctx?.sfx('beep');
    this.persist();
  }

  private drawTv(dt: number): void {
    const tv = this.tv!;
    tv.t += dt;
    const m = tv.screen.material as THREE.MeshBasicMaterial;
    if (m.map !== tv.tex) { m.map = tv.tex; m.color.set('#ffffff'); m.needsUpdate = true; }
    const g = tv.g, t = tv.t;
    const ch = Math.floor(t / 8) % 3;
    if (ch === 0) {
      const gr = g.createLinearGradient(0, 0, 0, 150);
      gr.addColorStop(0, '#2b1055'); gr.addColorStop(1, '#ff6f91');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 150);
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(128, 95 + Math.sin(t) * 4, 30, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.fillRect(0, 118, 256, 32);
      g.fillStyle = '#fff'; g.font = '600 14px Oswald, sans-serif';
      const tick = 'NEON BAY NEWS · Hackers strike again downtown · Sunset Shield on the case · Surf\'s up at Neon Beach · ';
      g.fillText(tick, 256 - ((t * 60) % 900), 139);
      g.fillStyle = '#e0453a'; g.fillRect(0, 118, 46, 32);
      g.fillStyle = '#fff'; g.fillText('LIVE', 6, 139);
    } else if (ch === 1) {
      g.fillStyle = '#0b0a24'; g.fillRect(0, 0, 256, 150);
      for (let i = 0; i < 12; i++) {
        g.fillStyle = `hsl(${(i * 30 + t * 80) % 360},90%,60%)`;
        g.fillRect(i * 22, 150 - (40 + Math.abs(Math.sin(t * 3 + i)) * 90), 18, 150);
      }
      g.fillStyle = '#fff'; g.font = '700 18px Oswald'; g.fillText('MTV-ish · RETRO WAVE', 10, 22);
    } else {
      g.fillStyle = '#6fc3ff'; g.fillRect(0, 0, 256, 150);
      g.fillStyle = '#2e9e5b'; g.fillRect(0, 100, 256, 50);
      const x = (t * 50) % 300 - 30;
      g.fillStyle = '#ff6fb5'; g.beginPath(); g.ellipse(x, 80, 20, 12, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(x + 10, 50, 4, 30); g.beginPath(); g.arc(x + 12, 48, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = '700 16px Oswald'; g.fillText('WILD NEON BAY', 10, 20);
    }
    tv.tex.needsUpdate = true;
  }

  private async openStash(): Promise<void> {
    const ctx = this.ctx!;
    const rows = (): MenuRow[] => {
      const items = this.stash.list();
      const out: MenuRow[] = [{ id: 'h', label: `Stored ${this.stash.total()} / ${this.stash.capacity} · value ${money(this.stash.value())}`, header: true }];
      if (!items.length) out.push({ id: 'none', label: 'Empty. Stolen goods and valuables you store end up here.', disabled: true });
      for (const it of items) out.push({ id: it.id, label: it.name, right: `×${it.qty}`, desc: `${it.kind ?? 'item'}${it.value ? ` · street value ${money(it.value)} each` : ''}` });
      return out;
    };
    ctx.sfx('door');
    await runMenu(ctx, { title: 'Stash', subtitle: 'Wall safe', color: '#3a3f47', rows });
  }
}

export default function create(): GameSystem {
  return new LifeSystem();
}
