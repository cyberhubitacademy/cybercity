// ACTIVITIES system ('activities'): fishing on Starlight Pier + fish market,
// beach basketball, 8-ball at the Tiki Bytes beach bar, Neon Putt mini-golf,
// rental beach loungers, bar drinks (tipsy wobble), Club Afterglow nightclub
// (dance rhythm game, DJ, dancers), shooting-range hook for combat,
// relationships + hangouts + gifts + following companions (bonusHints()).
import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import { createRig, type Rig } from '../../actors/CharacterModel';
import type { LifeSystem } from '../life';
import { INTERIOR_Y, type Interior } from '../life/interiors';
import { emitEvent, onEvent, str, type CcEvent } from '../life/bus';
import { HintBox, ensureCss, key, money, runMenu, splash, statBar, type MenuRow } from '../life/ui';
import { Culler, facadeNear, findClear, iconSprite } from '../life/world';
import { doorFrame } from '../life/props';
import { boneWorld } from '../life/rigtools';
import { resultCard, rhythmGame } from '../life/minigames';
import { FOOD, effectLine } from '../life/food';
import { HOOP_SPOTS, barGame, basketballGame, fishingGame, golfGame, poolGame, type FishView, type HoopView } from './games';
import { SPECIES, fishValue } from './fishing';
import { grade } from './scoring';
import {
  GIFTS, PEOPLE, accepts, addPoints, canDate, decay, giftReaction, hangoutPoints, hintsFrom, levelName, levelOf, newRel, person, type Person, type Rel,
} from './relationships';
import * as V from './venues';

interface SavedActs {
  rel: Record<string, Rel>;
  fish: { id: string; kg: number }[];
  best: Record<string, number>;
  hangoutDay: Record<string, number>;
}

export type RangeHandler = (ctx: SystemContext) => void | Promise<void>;

class Companion {
  rig: Rig;
  pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  hours = 0;
  done = new Set<string>();
  constructor(readonly p: Person, scene: THREE.Scene, x: number, z: number) {
    this.rig = createRig({ ...p.outfit, shoes: '#ffffff', hairStyle: p.female ? 'long' : 'short' }, { female: p.female, seed: p.id.length * 7 });
    this.pos.set(x, 0, z);
    scene.add(this.rig.root);
  }
  dispose(): void {
    this.rig.root.removeFromParent();
  }
}

export class ActivitiesSystem implements GameSystem {
  readonly id = 'activities';
  private ctx: SystemContext | null = null;
  private data: SavedActs = { rel: {}, fish: [], best: {}, hangoutDay: {} };
  private built = false;
  private clubBuilt = false;
  private culler = new Culler();
  private range: RangeHandler | null = null;
  private companion: Companion | null = null;
  private hint: HintBox | null = null;
  private unsub: (() => void) | null = null;
  private fishView: FishView | null = null;
  private rod: { rod: THREE.Group; tip: THREE.Object3D; line: THREE.Line; bobber: THREE.Mesh } | null = null;
  private fishSpot = { x: 304, z: -104, y: 0.45, yaw: Math.PI / 2 };
  private court: { origin: THREE.Vector3; yaw: number; hoop: THREE.Vector3; ball: THREE.Mesh } | null = null;
  private hoopView: HoopView | null = null;
  private golfBlades: THREE.Object3D | null = null;
  private lounging: { x: number; z: number; yaw: number; t: number } | null = null;
  private club: (V.ClubParts & { room: Interior; dancers: Rig[]; dj: Rig; t: number; beat: number }) | null = null;
  private dancing: { beat: number; hits: number } | null = null;
  private skye: Rig | null = null;
  private skyeSpot = { x: 212, z: -36 };
  private wobbleT = 0;
  private canvas: HTMLCanvasElement | null = null;
  readonly places: { id: string; name: string; x: number; z: number; kind: string }[] = [];

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    ensureCss();
    const d = ctx.getData<Partial<SavedActs> | null>('activities', null);
    this.data = { rel: { ...(d?.rel ?? {}) }, fish: Array.isArray(d?.fish) ? d!.fish : [], best: { ...(d?.best ?? {}) }, hangoutDay: { ...(d?.hangoutDay ?? {}) } };
    for (const p of PEOPLE) if (!this.data.rel[p.id]) this.data.rel[p.id] = newRel(!p.companion);
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.built) {
      this.built = true;
      this.hint = new HintBox(ctx);
      try { this.buildWorld(ctx); } catch (err) { console.error('[activities] build failed', err); }
    }
    this.endHangout(true);
    this.unsub?.();
    this.unsub = onEvent((e) => this.onGameEvent(e));
  }

  // ---------------------------------------------------------------- public API

  /** Combat builder: register the shooting-range minigame (opened at the Neon Bay Gun Club door). */
  registerRange(fn: RangeHandler): void { this.range = fn; }
  /** Extra challenge hints from a companion following Rico (0..2). Integrator: add to effects().bonusHints. */
  bonusHints(): number { return this.companion ? hintsFrom(this.data.rel[this.companion.p.id]) : 0; }
  rel(id: string): Rel | undefined { return this.data.rel[id]; }
  relationships(): { person: Person; rel: Rel; level: string }[] {
    return PEOPLE.map((p) => ({ person: p, rel: this.data.rel[p.id], level: levelName(this.data.rel[p.id]) }));
  }
  addRelationship(id: string, pts: number): void {
    const r = this.data.rel[id];
    if (!r || !this.ctx) return;
    const up = addPoints(r, pts, this.today());
    if (up) this.levelUp(id);
    this.persist();
  }
  hangoutWith(): string | null { return this.companion?.p.id ?? null; }
  /** Fish Rico is carrying (sell at the Pier Fish Market). */
  fishBag(): readonly { id: string; kg: number }[] { return this.data.fish; }

  private today(): number {
    const life = this.ctx?.system<LifeSystem>('life');
    return life ? Math.floor(life.state.clock / 24) : 0;
  }

  private persist(): void {
    this.ctx?.setData('activities', this.data);
  }

  private levelUp(id: string): void {
    const p = person(id), r = this.data.rel[id];
    if (!p || !r || !this.ctx) return;
    const lvl = levelName(r);
    splash(this.ctx, lvl, `${p.name} · relationship up`, p.color);
    emitEvent({ type: 'relationship', with: id, level: lvl });
  }

  private onGameEvent(e: CcEvent): void {
    const c = this.companion;
    if (!c || !this.ctx) return;
    const near = c.pos.distanceTo(this.ctx.world.player.position) < 25;
    if (!near) return;
    let act = '';
    if (e.type === 'activity') act = str(e, 'name');
    else if (e.type === 'meal') act = str(e, 'place').includes('Café') ? 'cafe' : 'food';
    else if (e.type === 'fish') act = 'fishing';
    else if (e.type === 'workout') act = 'gym';
    else if (e.type === 'photo') act = 'photo';
    if (!act || c.done.has(act)) return;
    c.done.add(act);
    const pts = hangoutPoints(c.p, act, typeof e.score === 'number' ? Math.min(1, e.score / 100) : 0.6);
    this.addRelationship(c.p.id, pts);
    this.data.rel[c.p.id].hangouts++;
    this.ctx.notify(`${c.p.emoji} ${c.p.name.split(' ')[0]} enjoyed that! [y]+${pts}[/y] ♥`, 'good');
    emitEvent({ type: 'hangout', with: c.p.id, activity: act });
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, ctx: SystemContext): void {
    if (!this.clubBuilt) this.tryBuildClub(ctx);
    const p = ctx.world.player.position;
    this.culler.update(p.x, p.z);
    if (this.golfBlades) this.golfBlades.rotation.z += dt * 1.5;
    this.updateCompanion(dt, ctx);
    this.updateLounging(dt, ctx);
    if (this.skye) {
      const d = Math.hypot(p.x - this.skyeSpot.x, p.z - this.skyeSpot.z);
      this.skye.root.visible = d < 90;
      if (d < 60) { this.skye.body.rotation.y = Math.atan2(p.x - this.skyeSpot.x, p.z - this.skyeSpot.z); this.skye.animate(dt, 0); }
    }
    // daily relationship decay
    const today = this.today();
    for (const r of Object.values(this.data.rel)) if (r.met) decay(r, today);
  }

  always(dt: number, ctx: SystemContext): void {
    const busy = ctx.isBusy();
    this.hint?.visible(!busy || !!this.dancing);
    this.animateClub(dt, ctx);
    this.animateFishing(dt, ctx);
    this.animateHoops(dt, ctx);
    // tipsy wobble
    const life = ctx.system<LifeSystem>('life');
    const tipsy = life?.hasBoost('tipsy') ?? false;
    if (this.canvas) {
      if (tipsy) {
        this.wobbleT += dt;
        this.canvas.style.transform = `rotate(${Math.sin(this.wobbleT * 0.9) * 0.8}deg) scale(1.03) translateX(${Math.sin(this.wobbleT * 0.6) * 6}px)`;
      } else if (this.wobbleT) {
        this.wobbleT = 0;
        this.canvas.style.transform = '';
      }
    }
  }

  // ---------------------------------------------------------------- world

  private buildWorld(ctx: SystemContext): void {
    const scene = ctx.scene, col = ctx.world.city.collision;
    // ---- fishing spot on the pier end + rod
    const fs = this.fishSpot;
    ctx.interactions.set({ id: 'act-fish', x: fs.x, z: fs.z, radius: 3, priority: 1, title: 'Go fishing', desc: 'Starlight Pier · cast, strike, reel', enabled: () => !ctx.world.vehicle, action: () => void this.goFishing() });
    this.icon(ctx, '🎣', '#19e6ff', fs.x, fs.z, 4);
    this.places.push({ id: 'fishing', name: 'Fishing (Starlight Pier)', x: fs.x, z: fs.z, kind: 'activity' });
    const rod = V.fishingRod();
    rod.rod.visible = false;
    scene.add(rod.rod);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
    line.frustumCulled = false;
    line.visible = false;
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: '#e0453a', emissive: '#e0453a', emissiveIntensity: 0.4 }));
    bob.visible = false;
    scene.add(line, bob);
    this.rod = { ...rod, line, bobber: bob };
    // ---- fish market
    const fm = findClear(col, 226, -136, 3.5, 2, 10);
    const stall = V.fishStall();
    stall.position.set(fm.x, 0, fm.z);
    stall.rotation.y = Math.PI;
    scene.add(stall);
    this.culler.add(stall, fm.x, fm.z, 160);
    col.add({ x0: fm.x - 1.5, x1: fm.x + 1.5, z0: fm.z - 0.6, z1: fm.z + 0.6, y0: 0, y1: 1.1 });
    ctx.interactions.set({ id: 'act-fishmarket', x: fm.x, z: fm.z - 1.6, radius: 2.6, priority: 1, title: 'Pier Fish Market', desc: 'Sell your catch', enabled: () => !ctx.world.vehicle, action: () => void this.fishMarket() });
    this.icon(ctx, '🐟', '#19e6ff', fm.x, fm.z, 4.4);
    // ---- basketball court
    const cc = findClear(col, 205, 15, 13, 13, 22);
    const court = V.basketballCourt();
    court.group.position.set(cc.x, 0, cc.z);
    scene.add(court.group);
    this.culler.add(court.group, cc.x, cc.z, 200);
    col.add({ x0: cc.x - 0.15, x1: cc.x + 0.15, z0: cc.z - 7.55, z1: cc.z - 7.25, y0: 0, y1: 3.2 });
    const ball = V.basketball();
    ball.visible = false;
    scene.add(ball);
    this.court = { origin: new THREE.Vector3(cc.x, 0, cc.z), yaw: 0, hoop: court.hoop.clone().add(new THREE.Vector3(cc.x, 0, cc.z)), ball };
    ctx.interactions.set({ id: 'act-hoops', x: cc.x, z: cc.z - 1, radius: 4, priority: 1, title: 'Shoot hoops', desc: 'Beach Court Shootout · 10 shots', enabled: () => !ctx.world.vehicle, action: () => void this.hoops() });
    this.icon(ctx, '🏀', '#ff8a3d', cc.x, cc.z - 1, 5.2);
    this.places.push({ id: 'hoops', name: 'Beach Court', x: cc.x, z: cc.z, kind: 'activity' });
    // ---- mini golf
    const gc = findClear(col, 204, 176, 14, 10, 20);
    const golf = V.miniGolf();
    golf.position.set(gc.x, 0, gc.z);
    scene.add(golf);
    this.culler.add(golf, gc.x, gc.z, 180);
    golf.traverse((o) => { if (o.name === 'blades') this.golfBlades = o; });
    ctx.interactions.set({ id: 'act-golf', x: gc.x, z: gc.z - 3, radius: 3.5, priority: 1, title: 'Play Neon Putt', desc: '3-hole mini-golf · $10', enabled: () => !ctx.world.vehicle, action: () => void this.golf() });
    this.icon(ctx, '⛳', '#3dffb0', gc.x, gc.z - 3, 4.6);
    this.places.push({ id: 'golf', name: 'Neon Putt Mini-Golf', x: gc.x, z: gc.z, kind: 'activity' });
    // ---- Tiki Bytes beach bar: pool table + bar counter (bar building ~185..193 x 114..126)
    const pt = findClear(col, 199, 115, 4, 3, 8);
    const table = V.poolTable();
    table.position.set(pt.x, 0, pt.z);
    scene.add(table);
    this.culler.add(table, pt.x, pt.z, 140);
    col.add({ x0: pt.x - 1.35, x1: pt.x + 1.35, z0: pt.z - 0.72, z1: pt.z + 0.72, y0: 0, y1: 0.9, solidForCars: false });
    ctx.interactions.set({ id: 'act-pool', x: pt.x, z: pt.z + 1.4, radius: 2.4, priority: 1, title: 'Play 8-ball', desc: 'Tiki Bytes pool table · $20 a rack', enabled: () => !ctx.world.vehicle, action: () => void this.pool() });
    this.icon(ctx, '🎱', '#ff2fa0', pt.x, pt.z, 4);
    ctx.interactions.set({ id: 'act-tikibar', x: 194.6, z: 119, radius: 2.2, priority: 1, title: 'Tiki Bytes bar', desc: 'Drinks & bar games', enabled: () => !ctx.world.vehicle, action: () => void this.bar('Tiki Bytes') });
    this.places.push({ id: 'tiki', name: 'Tiki Bytes Beach Bar', x: 194.6, z: 119, kind: 'bar' });
    // ---- rental loungers
    for (let i = 0; i < 6; i++) {
      const lx = 224, lz = -86 + i * 2.6;
      const l = V.lounger(['#ff2fa0', '#19e6ff', '#ffd23f'][i % 3]);
      l.position.set(lx, 0, lz);
      l.rotation.y = Math.PI / 2;
      scene.add(l);
      this.culler.add(l, lx, lz, 120);
      ctx.interactions.set({ id: `act-lounge-${i}`, x: lx, z: lz, radius: 1.4, priority: 1, title: 'Relax on lounger', desc: 'Soak up the sun · recover energy', enabled: () => !ctx.world.vehicle && !this.lounging, action: () => this.startLounging(lx, lz, Math.PI / 2) });
    }
    this.places.push({ id: 'loungers', name: 'Beach Loungers', x: 224, z: -80, kind: 'activity' });
    // ---- shooting range door (hook for combat)
    const rf = facadeNear(col, -200, 96.5, 14);
    const rd = rf ? { x: rf.wx + rf.nx * 0.2, z: rf.wz + rf.nz * 0.2, yaw: rf.yaw } : { x: -200, z: 96.5, yaw: 0 };
    const frame = doorFrame('Gun Club', '#e0453a', 2.4);
    frame.position.set(rd.x, 0, rd.z);
    frame.rotation.y = rd.yaw;
    scene.add(frame);
    this.culler.add(frame, rd.x, rd.z, 180);
    const rx = rd.x + Math.sin(rd.yaw) * 1.4, rz = rd.z + Math.cos(rd.yaw) * 1.4;
    ctx.interactions.set({
      id: 'act-range', x: rx, z: rz, radius: 2.4, priority: 1, title: 'Neon Bay Gun Club', desc: 'Shooting range',
      enabled: () => !ctx.world.vehicle,
      action: () => { if (this.range) void this.range(ctx); else ctx.notify('Neon Bay Gun Club: "Closed for renovation — back soon!"', 'info'); },
    });
    this.icon(ctx, '🎯', '#e0453a', rx, rz, 4.6);
    this.places.push({ id: 'range', name: 'Neon Bay Gun Club', x: rx, z: rz, kind: 'activity' });
    // ---- Skye at the lifeguard tower
    try {
      const sp = PEOPLE.find((x) => x.id === 'skye')!;
      this.skye = createRig({ ...sp.outfit, shoes: '#f4f1ea', hairStyle: 'long' }, { female: true, seed: 1 });
      this.skye.root.position.set(this.skyeSpot.x, 0, this.skyeSpot.z);
      scene.add(this.skye.root);
      ctx.interactions.set({ id: 'act-skye', x: this.skyeSpot.x, z: this.skyeSpot.z, radius: 2.4, priority: 2, title: 'Talk to Skye (lifeguard)', desc: 'Neon Beach lifeguard', enabled: () => !ctx.world.vehicle && this.companion?.p.id !== 'skye', action: () => void this.talkTo('skye') });
    } catch (err) { console.warn('[activities] skye', err); }
    // companion interaction (chat / gift / date / end)
    ctx.interactions.set({
      id: 'act-companion', x: 0, z: 0, radius: 2.2, priority: 3, title: 'Talk', desc: 'Chat, give a gift, or end the hangout',
      enabled: () => !!this.companion && !ctx.world.vehicle,
      action: () => { if (this.companion) void this.talkTo(this.companion.p.id); },
    });
  }

  private icon(ctx: SystemContext, emoji: string, color: string, x: number, z: number, y: number): void {
    const s = iconSprite(emoji, color, 1.3);
    s.position.set(x, y, z);
    ctx.scene.add(s);
    this.culler.add(s, x, z, 70);
  }

  private tryBuildClub(ctx: SystemContext): void {
    const life = ctx.system<LifeSystem>('life');
    const im = life?.interiors;
    if (!im) return;
    this.clubBuilt = true;
    try {
      const f = facadeNear(ctx.world.city.collision, 156.5, 108, 14);
      const door0 = f ? { x: f.wx + f.nx * 0.2, z: f.wz + f.nz * 0.2, yaw: f.yaw } : { x: 156.5, z: 108, yaw: Math.PI / 2 };
      const frame = doorFrame('Club Afterglow', '#ff2fa0', 2.8);
      frame.position.set(door0.x, 0, door0.z);
      frame.rotation.y = door0.yaw;
      ctx.scene.add(frame);
      this.culler.add(frame, door0.x, door0.z, 200);
      const door = { x: door0.x + Math.sin(door0.yaw) * 1.4, z: door0.z + Math.cos(door0.yaw) * 1.4, yaw: door0.yaw };
      this.icon(ctx, '🪩', '#ff2fa0', door.x, door.z, 5);
      this.places.push({ id: 'afterglow', name: 'Club Afterglow', x: door.x, z: door.z, kind: 'club' });
      const w = 24, d = 18, h = 6;
      const room = im.add(ctx, {
        id: 'afterglow', name: 'Club Afterglow', cx: 300, cz: 272, w, d, h, floor: '#120a1e', wall: '#1a0f2e',
        spawn: { x: 0, z: d / 2 - 1.5, yaw: Math.PI }, door, light: { color: '#c27cff', intensity: 30 },
      });
      const parts = V.clubInterior(room.group, w, d, h);
      room.solid(ctx, 0, -d / 2 + 1.6, 4, 1.2, 1.1);
      room.solid(ctx, w / 2 - 1.2, 2, 1, 7, 1.1);
      const dancers: Rig[] = [];
      const cols = ['#ff2fa0', '#19e6ff', '#ffd23f', '#3dffb0', '#c27cff', '#ff8a3d', '#f4f4f4'];
      for (let i = 0; i < 7; i++) {
        const r = createRig({ shirt: cols[i], pants: '#1c1c1c', skin: ['#c98b5e', '#8d5a3b', '#e3b48a', '#5a3a25'][i % 4], hair: ['#111', '#e2c27a', '#7b2cff', '#3a2a1a'][i % 4], shoes: '#fff' }, { female: i % 2 === 0, seed: i * 3 });
        const a = (i / 7) * Math.PI * 2;
        r.root.position.set(Math.cos(a) * 3, 0, -1 + Math.sin(a) * 2.6);
        r.body.rotation.y = a + Math.PI;
        room.group.add(r.root);
        dancers.push(r);
      }
      const ruby = PEOPLE.find((x) => x.id === 'ruby')!;
      const dj = createRig({ ...ruby.outfit, shoes: '#ff2fa0', hairStyle: 'long' }, { female: true, seed: 3 });
      dj.root.position.set(0, 0, -d / 2 + 0.7);
      room.group.add(dj.root);
      this.club = { ...parts, room, dancers, dj, t: 0, beat: 0 };
      const inClub = () => im.inside() === 'afterglow';
      ctx.interactions.set({ id: 'act-dance', x: room.wx(0), z: room.wz(-1), radius: 4.5, priority: 1, title: 'Dance', desc: 'Hit the floor · rhythm game', enabled: inClub, action: () => void this.dance() });
      ctx.interactions.set({ id: 'act-clubbar', x: room.wx(w / 2 - 2.3), z: room.wz(2), radius: 2.2, priority: 2, title: 'Afterglow bar', desc: 'Drinks & bar games', enabled: inClub, action: () => void this.bar('Afterglow') });
      ctx.interactions.set({ id: 'act-ruby', x: room.wx(0), z: room.wz(-d / 2 + 2.6), radius: 1.8, priority: 3, title: 'Talk to DJ Ruby', desc: 'Resident DJ', enabled: inClub, action: () => void this.talkTo('ruby') });
      void INTERIOR_Y;
    } catch (err) {
      console.error('[activities] club build failed', err);
    }
  }

  private animateClub(dt: number, ctx: SystemContext): void {
    const c = this.club;
    if (!c || !c.room.group.visible) return;
    c.t += dt;
    const bpm = 124, beatLen = 60 / bpm;
    const b = Math.floor(c.t / beatLen);
    const pulse = 1 - (c.t % beatLen) / beatLen;
    const col = new THREE.Color();
    const n = 8;
    for (let i = 0; i < n * n; i++) {
      const a = Math.floor(i / n), bb = i % n;
      const hue = ((a + bb + b) % 6) / 6;
      const on = (a + bb + b) % 3 === 0;
      col.setHSL(hue * 0.4 + 0.75, 1, on ? 0.35 + pulse * 0.3 : 0.08);
      c.tiles.setColorAt(i, col);
    }
    if (c.tiles.instanceColor) c.tiles.instanceColor.needsUpdate = true;
    c.lasers.forEach((l, i) => { l.rotation.z = Math.sin(c.t * 0.8 + i) * 0.6; l.rotation.x = Math.cos(c.t * 0.6 + i * 2) * 0.4; });
    c.ball.rotation.y += dt * 0.8;
    for (let i = 0; i < c.dancers.length; i++) {
      const r = c.dancers[i];
      if ((b + i) % 8 === 0 && b !== c.beat) r.wave(0);
      r.body.rotation.y += Math.sin(c.t * 2 + i) * dt * 0.8;
      r.root.position.y = Math.abs(Math.sin(c.t * Math.PI * (bpm / 60))) * 0.06;
      r.animate(dt, 0);
    }
    if (b !== c.beat && b % 4 === 0) c.dj.wave(0);
    c.dj.animate(dt, 0);
    c.beat = b;
    if (this.dancing) {
      const rig = ctx.world.player.rig;
      rig.root.position.y = ctx.world.player.position.y + Math.abs(Math.sin(c.t * Math.PI * (bpm / 60))) * 0.08;
      rig.body.rotation.y += Math.sin(c.t * 1.5) * dt;
      rig.animate(dt, 0);
    }
  }

  // ---------------------------------------------------------------- fishing

  private async goFishing(): Promise<void> {
    const ctx = this.ctx!;
    const fs = this.fishSpot;
    const p = ctx.world.player;
    p.place(fs.x, fs.z, fs.yaw);
    p.position.y = fs.y;
    p.sync();
    const view: FishView = { phase: 'aim', cast: 0.5, dip: 0, tension: 0 };
    this.fishView = view;
    // camera over the shoulder, looking out to sea
    const cam = ctx.camera;
    cam.position.set(fs.x - 3.2, fs.y + 2.6, fs.z + 2.4);
    cam.lookAt(fs.x + 8, 0, fs.z - 1);
    let res: Awaited<ReturnType<typeof fishingGame>> = null;
    try {
      const luck = this.companion ? 0.3 : 0;
      res = await fishingGame(ctx, view, luck);
    } finally {
      this.fishView = null;
      if (this.rod) { this.rod.rod.visible = false; this.rod.line.visible = false; this.rod.bobber.visible = false; }
    }
    if (!res || res === 'snap') return;
    if (res.species.id === 'boot') { ctx.notify('You fished out… an old boot. 🥾', 'info'); return; }
    this.data.fish.push({ id: res.species.id, kg: res.weight });
    const best = this.data.best[`fish-${res.species.id}`] ?? 0;
    if (res.weight > best) this.data.best[`fish-${res.species.id}`] = res.weight;
    this.persist();
    emitEvent({ type: 'fish', species: res.species.name, rarity: res.species.rarity, weight: res.weight });
    emitEvent({ type: 'activity', name: 'fishing', score: Math.round(res.weight) });
    const animals = ctx.system<GameSystem & { observe?(species: string): void }>('animals');
    animals?.observe?.(`fish-${res.species.id}`);
    await resultCard(ctx, res.species.rarity === 'legendary' ? 'LEGENDARY!' : res.species.rarity === 'rare' ? 'Rare Catch!' : 'Fish On!',
      `<div style="font:500 24px Oswald;color:${res.species.color}">${res.species.name}</div><div>${res.weight} kg · ${res.species.rarity.toUpperCase()} · worth ~${money(res.value)}</div>${res.weight > best && best ? '<div style="color:#f0c850">New personal best!</div>' : ''}<div class="cx-muted" style="margin-top:6px">Sell it at the Pier Fish Market. Bag: ${this.data.fish.length} fish</div>`,
      res.species.rarity === 'legendary' ? '#ff2fa0' : '#72cc72');
  }

  private animateFishing(dt: number, ctx: SystemContext): void {
    const v = this.fishView, r = this.rod;
    if (!v || !r) return;
    const rig = ctx.world.player.rig;
    rig.animate(dt, 0);
    rig.root.position.copy(ctx.world.player.position);
    rig.root.updateMatrixWorld(true);
    const hand = boneWorld(rig, 'PalmR', new THREE.Vector3());
    r.rod.visible = true;
    r.rod.position.copy(hand);
    const fs = this.fishSpot;
    const pitch = v.phase === 'reel' ? -0.5 - v.tension * 0.5 : v.phase === 'aim' ? 0.2 : -0.75;
    r.rod.rotation.set(0, 0, 0);
    r.rod.rotation.order = 'YXZ';
    r.rod.rotation.y = fs.yaw;
    r.rod.rotation.x = Math.PI / 2 + pitch;
    r.rod.updateMatrixWorld(true);
    const tip = r.tip.getWorldPosition(new THREE.Vector3());
    const show = v.phase !== 'aim';
    const dist = 6 + v.cast * 14;
    const bx = fs.x + Math.sin(fs.yaw) * dist, bz = fs.z + Math.cos(fs.yaw) * dist;
    const by = -0.3 + Math.sin(performance.now() / 400) * 0.03 - v.dip * 0.12;
    r.bobber.visible = show;
    r.bobber.position.set(bx, by, bz);
    r.line.visible = show;
    const pos = r.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, tip.x, tip.y, tip.z);
    pos.setXYZ(1, bx, by + 0.05, bz);
    pos.needsUpdate = true;
  }

  private async fishMarket(): Promise<void> {
    const ctx = this.ctx!;
    const rows = (): MenuRow[] => {
      const total = this.data.fish.reduce((a, f) => { const s = SPECIES.find((x) => x.id === f.id); return a + (s ? fishValue(s, f.kg) : 0); }, 0);
      const out: MenuRow[] = [{ id: 'h', label: `Your catch · ${this.data.fish.length} fish`, header: true }];
      if (this.data.fish.length) out.push({ id: 'all', icon: '💰', label: 'Sell everything', right: money(total), onSelect: () => this.sellFish(-1) });
      this.data.fish.forEach((f, i) => {
        const s = SPECIES.find((x) => x.id === f.id);
        if (s) out.push({ id: `f${i}`, icon: '🐟', label: `${s.name} (${f.kg} kg)`, right: money(fishValue(s, f.kg)), tag: s.rarity, onSelect: () => this.sellFish(i) });
      });
      if (!this.data.fish.length) out.push({ id: 'none', label: 'Nothing to sell. Go fish at the end of the pier!', disabled: true });
      out.push({ id: 'h2', label: 'Prices per kg', header: true });
      for (const s of SPECIES.filter((x) => x.price > 0)) out.push({ id: `p-${s.id}`, label: s.name, right: `${money(s.price)}/kg`, tag: s.rarity, disabled: true, desc: `Bites best: ${s.time}. ${s.weight[0]}–${s.weight[1]} kg.` });
      return out;
    };
    await runMenu(ctx, { title: 'Fish Market', subtitle: 'Starlight Pier', color: '#19e6ff', rows });
  }

  private sellFish(i: number): void {
    const ctx = this.ctx!;
    const list = i < 0 ? this.data.fish : [this.data.fish[i]];
    let total = 0;
    for (const f of list) { const s = SPECIES.find((x) => x.id === f.id); if (s) total += fishValue(s, f.kg); }
    this.data.fish = i < 0 ? [] : this.data.fish.filter((_, k) => k !== i);
    if (total > 0) {
      ctx.addMoney(total);
      emitEvent({ type: 'money', amount: total, reason: 'Pier Fish Market' });
      ctx.sfx('cash');
      ctx.notify(`Sold fish for ${money(total)}`, 'money');
    }
    this.persist();
  }

  // ---------------------------------------------------------------- basketball

  private async hoops(): Promise<void> {
    const ctx = this.ctx!, c = this.court!;
    const view: HoopView = { spot: 1, shot: null, charging: 0 };
    this.hoopView = view;
    const life = ctx.system<LifeSystem>('life');
    let res: Awaited<ReturnType<typeof basketballGame>> = null;
    try {
      res = await basketballGame(ctx, view, (life?.strength() ?? 20) / 200 + (this.companion ? 0.1 : 0));
    } finally {
      this.hoopView = null;
      c.ball.visible = false;
    }
    if (!res) return;
    const best = this.data.best.hoops ?? 0;
    if (res.points > best) this.data.best.hoops = res.points;
    this.persist();
    const prize = res.points * 5;
    if (prize) { ctx.addMoney(prize); emitEvent({ type: 'money', amount: prize, reason: 'Beach Court Shootout' }); }
    emitEvent({ type: 'activity', name: 'basketball', score: res.points * 5, win: res.points >= 15 });
    life?.exert(4);
    await resultCard(ctx, res.points > best ? 'New Record!' : 'Shootout Over', `<div>${res.made}/${res.shots} made · <b>${res.points} points</b></div><div>Best: ${Math.max(best, res.points)} · Prize ${money(prize)}</div>`, '#ff8a3d');
  }

  private animateHoops(dt: number, ctx: SystemContext): void {
    const v = this.hoopView, c = this.court;
    if (!v || !c) return;
    const s = HOOP_SPOTS[v.spot];
    const hoopFloor = new THREE.Vector3(c.hoop.x, 0, c.hoop.z);
    const sx = hoopFloor.x + Math.sin(s.ang) * s.dist, sz = hoopFloor.z + Math.cos(s.ang) * s.dist;
    const yaw = Math.atan2(hoopFloor.x - sx, hoopFloor.z - sz);
    const p = ctx.world.player;
    p.position.set(sx, 0, sz);
    p.yaw = yaw;
    p.rig.root.position.copy(p.position);
    p.rig.body.rotation.y = yaw;
    const air = !!v.shot && v.shot.t < 0.25;
    p.rig.animate(dt, 0, air);
    if (air) p.rig.root.position.y = Math.sin((v.shot!.t / 0.25) * Math.PI) * 0.4;
    // camera behind the shooter
    const back = yaw + Math.PI;
    ctx.camera.position.set(sx + Math.sin(back) * 4 + Math.sin(back + Math.PI / 2) * 1.2, 2.6, sz + Math.cos(back) * 4 + Math.cos(back + Math.PI / 2) * 1.2);
    ctx.camera.lookAt(hoopFloor.x, 2.2, hoopFloor.z);
    // ball
    const ball = c.ball;
    ball.visible = true;
    const hand = new THREE.Vector3(sx, 1.9 + v.charging * 0.2, sz);
    if (!v.shot) { ball.position.copy(hand); return; }
    const t = v.shot.t, o = v.shot.outcome;
    const target = c.hoop.clone();
    if (o === 'rim') target.x += 0.25;
    if (o === 'miss') { target.x += 0.6; target.z += 0.4; }
    if (t < 0.75) {
      const k = t / 0.75;
      ball.position.lerpVectors(hand, target, k);
      ball.position.y += Math.sin(k * Math.PI) * (1.2 + s.dist * 0.18);
    } else {
      const k = (t - 0.75) / 0.25;
      ball.position.copy(target);
      if (o === 'swish' || o === 'bank') ball.position.y -= k * 2.9;
      else { ball.position.x += k * 1.5; ball.position.y -= k * k * 2.9; ball.position.z += k * 1.2; }
    }
    ball.rotation.x += dt * 8;
  }

  // ---------------------------------------------------------------- golf & pool & bar & dance

  private async golf(): Promise<void> {
    const ctx = this.ctx!;
    if (!ctx.addMoney(-10)) { ctx.notify('Neon Putt costs $10.', 'warn'); return; }
    emitEvent({ type: 'money', amount: -10, reason: 'Neon Putt Mini-Golf' });
    const res = await golfGame(ctx);
    if (!res) return;
    const diff = res.strokes - res.par;
    const best = this.data.best.golf ?? 99;
    if (res.strokes < best) this.data.best.golf = res.strokes;
    this.persist();
    const prize = diff <= -2 ? 100 : diff <= 0 ? 40 : 0;
    if (prize) { ctx.addMoney(prize); emitEvent({ type: 'money', amount: prize, reason: 'Neon Putt prize' }); }
    emitEvent({ type: 'activity', name: 'golf', score: Math.max(0, 100 - diff * 10), win: diff <= 0 });
    await resultCard(ctx, diff < 0 ? 'Under Par!' : diff === 0 ? 'Even Par' : 'Round Complete', `<div>${res.strokes} strokes (par ${res.par}) · ${diff > 0 ? '+' : ''}${diff}</div><div>Best: ${Math.min(best, res.strokes)}${prize ? ` · Prize ${money(prize)}` : ''}</div>`, '#3dffb0');
  }

  private async pool(): Promise<void> {
    const ctx = this.ctx!;
    if (!ctx.addMoney(-20)) { ctx.notify('A rack costs $20.', 'warn'); return; }
    emitEvent({ type: 'money', amount: -20, reason: 'Tiki Bytes pool table' });
    const opp = this.companion ? this.companion.p.name.split(' ')[0] : ['Harbor Hank', 'Tony Turbo', 'Gina'][Math.floor(Math.random() * 3)];
    const res = await poolGame(ctx, opp, this.companion ? 0.45 : 0.6);
    if (!res) return;
    if (res.win) { ctx.addMoney(50); emitEvent({ type: 'money', amount: 50, reason: `Won 8-ball vs ${opp}` }); }
    emitEvent({ type: 'activity', name: 'pool', score: res.win ? 100 : 40, win: res.win });
    await resultCard(ctx, res.win ? 'You Win!' : 'Defeated', res.win ? `You beat ${opp}. +${money(50)}` : `${opp} sank the 8. Rematch?`, res.win ? '#72cc72' : '#e0453a');
  }

  private async bar(name: string): Promise<void> {
    const ctx = this.ctx!;
    const life = ctx.system<LifeSystem>('life');
    const drinks = ['beer', 'mojito', 'virgin', 'coconut', 'water'];
    const rows = (): MenuRow[] => [
      { id: 'h', label: 'Drinks', header: true },
      ...drinks.map((id): MenuRow => {
        const f = FOOD[id];
        return {
          id, icon: f.icon, label: f.name, right: money(f.price), disabled: ctx.profile().credits < f.price, desc: `${f.desc} <span style="color:#72cc72">${effectLine(f)}</span>`,
          onSelect: () => {
            if (!ctx.addMoney(-f.price)) return;
            emitEvent({ type: 'money', amount: -f.price, reason: `${name}: ${f.name}` });
            life?.consume(id, name);
            ctx.sfx('cash');
            ctx.notify(`${f.icon} ${f.name}`, 'money');
          },
        };
      }),
      { id: 'h2', label: 'Games', header: true },
      {
        id: 'slide', icon: '🥃', label: 'Bar Slide challenge', right: money(10), desc: 'Slide 3 drinks down the bar onto the mark. Win $40 for a near-perfect run.',
        onSelect: async () => {
          if (!ctx.addMoney(-10)) { ctx.notify('Not enough cash.', 'warn'); return; }
          emitEvent({ type: 'money', amount: -10, reason: `${name}: Bar Slide` });
          const r = await barGame(ctx, life?.hasBoost('tipsy') ? 1 : 0);
          if (!r) return;
          const win = r.quality > 0.7;
          if (win) { ctx.addMoney(40); emitEvent({ type: 'money', amount: 40, reason: 'Bar Slide prize' }); }
          emitEvent({ type: 'activity', name: 'bar', score: Math.round(r.quality * 100), win });
          ctx.notify(win ? 'Bartender is impressed! +$40' : 'The bartender sighs and grabs a mop.', win ? 'money' : 'info');
        },
      },
    ];
    await runMenu(ctx, { title: name, subtitle: 'Bar', color: '#ff8a3d', rows, side: () => life?.needsPanel() ?? '' });
  }

  private async dance(): Promise<void> {
    const ctx = this.ctx!;
    this.dancing = { beat: 0, hits: 0 };
    const c = this.club;
    const p = ctx.world.player;
    if (c) { p.place(c.room.wx(0), c.room.wz(-1), Math.PI); p.position.y = INTERIOR_Y; p.sync(); }
    ctx.camera.position.set(p.position.x + 3.5, p.position.y + 2.4, p.position.z + 4.5);
    ctx.camera.lookAt(p.position.x, p.position.y + 1.1, p.position.z);
    let res: Awaited<ReturnType<typeof rhythmGame>> = null;
    try {
      res = await rhythmGame(ctx, {
        title: 'Dance-Off · Club Afterglow', bpm: 124, duration: 28,
        lanes: [
          { code: ['ArrowLeft', 'KeyA'], label: '←', color: '#ff2fa0' }, { code: ['ArrowDown', 'KeyS'], label: '↓', color: '#19e6ff' },
          { code: ['ArrowUp', 'KeyW'], label: '↑', color: '#3dffb0' }, { code: ['ArrowRight', 'KeyD'], label: '→', color: '#ffd23f' },
        ],
        pattern: (n) => (n % 16 === 15 ? -1 : [0, 1, 2, 3, 1, 2, 0, 3, 2, 2, 1, 0, 3, 1, 0, 2][n % 16]),
        height: 260,
        onHit: (_l, j) => { if (j === 'perfect' || j === 'great') { p.rig.wave(0); this.dancing!.hits++; } },
      });
    } finally {
      this.dancing = null;
    }
    if (!res) return;
    const g = grade(res.accuracy);
    emitEvent({ type: 'activity', name: 'club', score: Math.round(res.accuracy * 100), win: g === 'S' || g === 'A' });
    const life = ctx.system<LifeSystem>('life');
    life?.exert(5);
    if (g === 'S' || g === 'A') this.addRelationship('ruby', 3);
    await resultCard(ctx, `Grade ${g}`, `<div>Score ${res.tally.score} · Max combo ×${res.tally.maxCombo}</div><div>Perfect ${res.tally.perfect} · Great ${res.tally.great} · Good ${res.tally.good} · Miss ${res.tally.miss}</div>${g === 'S' ? '<div style="color:#ff2fa0">The crowd goes wild! DJ Ruby gives you a nod.</div>' : ''}`, '#ff2fa0');
  }

  // ---------------------------------------------------------------- lounging

  private startLounging(x: number, z: number, yaw: number): void {
    const ctx = this.ctx!;
    this.lounging = { x, z, yaw, t: 0 };
    ctx.notify(`Relaxing in the sun… Press ${'~E~'} or move to get up.`, 'info');
  }

  private updateLounging(dt: number, ctx: SystemContext): void {
    const l = this.lounging;
    if (!l) return;
    const i = ctx.input;
    const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    if (l.t > 0.5 && (moveKeys.some((k) => i.isDown(k)) || i.wasPressed('KeyE'))) {
      this.lounging = null;
      const p = ctx.world.player;
      p.rig.body.rotation.x = 0;
      p.rig.body.rotation.order = 'XYZ';
      p.place(l.x - 1.2, l.z, p.yaw);
      if (l.t > 20) emitEvent({ type: 'activity', name: 'beach', score: Math.min(100, Math.round(l.t)) });
      this.hint?.set(null);
      return;
    }
    l.t += dt;
    const life = ctx.system<LifeSystem>('life');
    if (life) life.state.fatigue = Math.max(0, life.state.fatigue - dt * 0.35);
    const p = ctx.world.player;
    p.position.set(l.x, 0.42, l.z);
    p.yaw = l.yaw;
    p.rig.body.rotation.order = 'YXZ';
    p.rig.body.rotation.set(-1.05, l.yaw, 0);
    p.rig.root.position.set(l.x - Math.sin(l.yaw) * 0.55, 0.42, l.z - Math.cos(l.yaw) * 0.55);
    this.hint?.set(`<b style="color:#f0c850">LOUNGING</b><br>Energy recovering… ${life ? Math.round(100 - life.state.fatigue) : ''}%<br>${key('E')} / move to get up`);
  }

  // ---------------------------------------------------------------- relationships & companions

  /** Phone call: invite someone to hang out. */
  startHangout(id: string): { ok: boolean; reason: string } {
    const ctx = this.ctx!;
    const p = person(id), r = this.data.rel[id];
    if (!p || !r) return { ok: false, reason: 'Unknown contact.' };
    if (this.companion?.p.id === id) return { ok: false, reason: `${p.name.split(' ')[0]} is already with you.` };
    if (ctx.world.vehicle) return { ok: false, reason: 'Pull over first — meet up on foot.' };
    const today = this.today();
    const res = accepts(p, r, ctx.world.hour, this.data.hangoutDay[id] === today);
    if (!res.ok) return res;
    this.endHangout(true);
    const pl = ctx.world.player;
    const bx = pl.position.x - Math.sin(pl.yaw) * 14, bz = pl.position.z - Math.cos(pl.yaw) * 14;
    const c = new Companion(p, ctx.scene, bx, bz);
    c.pos.y = pl.position.y;
    this.companion = c;
    this.data.hangoutDay[id] = today;
    this.addRelationship(id, 2);
    this.persist();
    this.hint?.set(`<b style="color:${p.color}">HANGING OUT WITH ${p.name.toUpperCase()}</b><br>Likes: ${p.fav.join(', ')}. Do activities together to grow closer. ${key('E')} near them to talk.`);
    setTimeout(() => this.hint?.set(null), 9000);
    return { ok: true, reason: '' };
  }

  endHangout(silent = false): void {
    const c = this.companion;
    if (!c) return;
    this.companion = null;
    c.dispose();
    if (!silent && this.ctx) {
      this.ctx.notify(`${c.p.emoji} ${c.p.name.split(' ')[0]}: "That was fun. See you around, Rico!"`, 'info');
      const phone = this.ctx.system<GameSystem & { text?(from: string, t: string): void }>('phone');
      setTimeout(() => phone?.text?.(c.p.id, ['Had a great time today! 😊', 'Thanks for hanging out!', 'Let\'s do that again soon 🌴'][Math.floor(Math.random() * 3)]), 4000);
    }
  }

  private updateCompanion(dt: number, ctx: SystemContext): void {
    const c = this.companion;
    if (!c) return;
    const pl = ctx.world.player;
    c.hours += (dt * ctx.world.timeScale) / 60;
    if (c.hours > 3) { this.endHangout(); return; }
    const inCar = !!ctx.world.vehicle;
    c.rig.root.visible = !inCar;
    const target = inCar ? ctx.world.vehicle!.position : pl.position;
    // teleport with the player (interiors, long drives)
    if (Math.abs(target.y - c.pos.y) > 3 || c.pos.distanceTo(target) > 45) {
      c.pos.set(target.x - Math.sin(pl.yaw) * 2, target.y, target.z - Math.cos(pl.yaw) * 2);
    }
    if (inCar) { c.pos.copy(target); return; }
    const side = Math.sin(pl.yaw + Math.PI / 2), sideZ = Math.cos(pl.yaw + Math.PI / 2);
    const tx = target.x - Math.sin(pl.yaw) * 1.6 + side * 1.0, tz = target.z - Math.cos(pl.yaw) * 1.6 + sideZ * 1.0;
    const dx = tx - c.pos.x, dz = tz - c.pos.z;
    const d = Math.hypot(dx, dz);
    const want = d > 6 ? 6.5 : d > 1.2 ? Math.min(3.4, d * 1.6) : 0;
    c.speed += (want - c.speed) * Math.min(1, dt * 5);
    if (d > 0.05 && c.speed > 0.05) {
      c.pos.x += (dx / d) * c.speed * dt;
      c.pos.z += (dz / d) * c.speed * dt;
      const yaw = Math.atan2(dx, dz);
      let dy = yaw - c.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.yaw += dy * Math.min(1, dt * 8);
    } else {
      const face = Math.atan2(pl.position.x - c.pos.x, pl.position.z - c.pos.z);
      let dy = face - c.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.yaw += dy * Math.min(1, dt * 3);
    }
    ctx.world.city.collision.resolveCircle(c.pos, 0.35, c.pos.y, 1.7);
    const g = ctx.world.city.collision.groundHeight(c.pos.x, c.pos.z, c.pos.y + 0.5);
    c.pos.y += (Math.max(g, pl.position.y > 50 ? pl.position.y : g) - c.pos.y) * Math.min(1, dt * 10);
    c.rig.root.position.copy(c.pos);
    c.rig.body.rotation.y = c.yaw;
    c.rig.animate(dt, c.speed);
    // keep the talk prompt on the companion
    ctx.interactions.set({
      id: 'act-companion', x: c.pos.x, z: c.pos.z, radius: 2.2, priority: 3, title: `Talk to ${c.p.name.split(' ')[0]}`, desc: 'Chat, give a gift, or end the hangout',
      enabled: () => !!this.companion && !ctx.world.vehicle,
      action: () => { if (this.companion) void this.talkTo(this.companion.p.id); },
    });
  }

  /** Chat menu with a person (meet / chat / gift / date / hangout end). */
  async talkTo(id: string): Promise<void> {
    const ctx = this.ctx!;
    const p = person(id), r = this.data.rel[id];
    if (!p || !r) return;
    if (!r.met) {
      r.met = true;
      addPoints(r, 18, this.today());
      this.persist();
      ctx.sfx('good');
      const intro = id === 'skye'
        ? 'Hey! You\'re the Sunset Shield guy, right? I\'m Skye — I keep people from drowning around here. Text me sometime, I\'ll show you the best waves.'
        : 'Nice moves out there. I\'m Ruby — I run the decks at Afterglow. Here\'s my number. Don\'t be a stranger.';
      splash(ctx, `Met ${p.name}`, 'New contact in your phone', p.color);
      ctx.ui.subtitle(p.name, intro);
      setTimeout(() => ctx.ui.subtitle(null, null), 6000);
      return;
    }
    const chatLines: Record<string, string[]> = {
      skye: ['The ocean\'s glassy today. Perfect for a swim.', 'Rule one at Neon Beach: never turn your back on the waves.', 'You ever try surfing? I could teach you.'],
      ruby: ['This next track? Wrote it at 4 AM on a rooftop.', 'Neon Bay sounds better at night.', 'You should hear the B-side of this set.'],
      max: ['Back in my day, firewalls were actual walls. Kidding.', 'Proud of you, kid. Don\'t let it go to your head.'],
      carla: ['Want to hear the gossip from the café? Everyone\'s talking about you.', 'You look tired. Have you eaten today?'],
    };
    const lines = chatLines[id] ?? ['Good to see you, Rico!', 'Neon Bay is never boring with you around.', 'What\'s next?'];
    const lv = levelOf(r.points);
    const rows = (): MenuRow[] => {
      const out: MenuRow[] = [
        { id: 'chat', icon: '💬', label: 'Chat', desc: 'Small talk (+1 ♥ once a day)', onSelect: () => {
          const line = lines[Math.floor(Math.random() * lines.length)];
          ctx.ui.subtitle(p.name, line);
          setTimeout(() => ctx.ui.subtitle(null, null), 4500);
          const key2 = `chat-${id}`;
          if (this.data.hangoutDay[key2] !== this.today()) { this.data.hangoutDay[key2] = this.today(); this.addRelationship(id, 1); }
          return 'close';
        } },
        { id: 'h', label: 'Give a gift', header: true },
        ...GIFTS.map((g): MenuRow => ({
          id: `g-${g.id}`, icon: g.icon, label: g.name, right: money(g.price), disabled: ctx.profile().credits < g.price,
          desc: p.loves.includes(g.id) ? 'They would LOVE this.' : p.likes.includes(g.id) ? 'They\'d like this.' : 'Hmm, not sure about this one.',
          onSelect: () => {
            if (!ctx.addMoney(-g.price)) return;
            emitEvent({ type: 'money', amount: -g.price, reason: `Gift for ${p.name}: ${g.name}` });
            const react = giftReaction(p, g.id);
            r.gifts++;
            this.addRelationship(id, react.points);
            ctx.sfx(react.kind === 'meh' ? 'click' : 'good');
            ctx.notify(`${p.emoji} ${p.name.split(' ')[0]}: ${react.kind === 'love' ? '"Oh my gosh, I LOVE it!"' : react.kind === 'like' ? '"Aw, thank you!"' : '"…Thanks, I guess?"'} [y]+${react.points}♥[/y]`, 'good');
          },
        })),
      ];
      if (canDate(p, r)) out.push({ id: 'date', icon: '💖', label: `Ask ${p.name.split(' ')[0]} to be your partner`, onSelect: () => {
        r.partner = true;
        this.addRelationship(id, 10);
        splash(ctx, 'It\'s official', `${p.name} ❤ Rico`, '#ff2fa0');
        emitEvent({ type: 'relationship', with: id, level: 'Partner' });
        this.persist();
        return 'close';
      } });
      if (this.companion?.p.id === id) out.push({ id: 'end', icon: '👋', label: 'End hangout', onSelect: () => { this.endHangout(); return 'close'; } });
      return out;
    };
    await runMenu(ctx, {
      title: p.name, subtitle: levelName(r), color: p.color, rows,
      side: () => `<h3>${p.emoji} ${p.name.toUpperCase()}</h3><div style="margin-bottom:6px">${p.bio}</div>${statBar(levelName(r), r.points, p.color, `${Math.round(r.points)} / 100`)}<div class="cx-muted" style="font-size:13px">Next: ${lv.next !== null ? `${lv.next}` : 'max'} · Hangouts ${r.hangouts} · Gifts ${r.gifts}<br>Loves: ${p.fav.join(', ')}${this.companion?.p.id === id ? `<br>Assist: +${this.bonusHints()} hint(s) in challenges` : ''}</div>`,
    });
  }
}

export default function create(): GameSystem {
  return new ActivitiesSystem();
}
