// ANIMALS system ('animals'): dogs walked by owners (pettable with E), a stray
// Shiba you can adopt (follows you), alley cats, instanced seagull & pigeon
// flocks that scatter when you run, beach crabs, alligators in the harbor
// (bite if you get too close; observation deck), and the wildlife log that the
// phone camera fills by photographing animals.
import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import { createRig, type Rig } from '../../actors/CharacterModel';
import { isWater } from '../../world/layout';
import { emitEvent } from '../life/bus';
import { ensureCss, money, popEmoji, splash, captureKeys, layer, h, key, modal } from '../life/ui';
import { Culler, findClear, iconSprite, neonSign, box, mat } from '../life/world';
import { Critter, loadAnimal } from './models';
import { Crabs, Flock } from './birds';
import { Gator } from './gator';
import { entries, gatorBites, nameOf, observe, photograph, sanitizeLog, type WildLog } from './wildlife';

interface Walker {
  owner: Rig;
  dog: Critter;
  path: THREE.Vector2[];
  seg: number;
  t: number;
  pos: THREE.Vector3;
  dogPos: THREE.Vector3;
  yaw: number;
  pause: number;
  leash: THREE.Line;
}

interface Pet {
  kind: 'dog' | 'cat' | 'stray';
  c: Critter;
  pos: THREE.Vector3;
  yaw: number;
  home: THREE.Vector3;
  t: number;
  speed: number;
  special: number;
  walker?: Walker;
}

interface Saved { log: WildLog; adopted: boolean; dogName: string }

const _v = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();

export class AnimalsSystem implements GameSystem {
  readonly id = 'animals';
  private ctx: SystemContext | null = null;
  private data: Saved = { log: {}, adopted: false, dogName: 'Chip' };
  private built = false;
  private walkers: Walker[] = [];
  private pets: Pet[] = [];
  private stray: Pet | null = null;
  private flocks: Flock[] = [];
  private crabs: Crabs | null = null;
  private gators: Gator[] = [];
  private culler = new Culler();
  private petCheck = 0;
  private lastPlayer = new THREE.Vector3();
  private playerSpeed = 0;
  private biteCd = 0;
  private sightCd = 0;
  private deck = { x: -175, z: 205 };

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    ensureCss();
    const d = ctx.getData<Partial<Saved> | null>('animals', null);
    this.data = { log: sanitizeLog(d?.log), adopted: !!d?.adopted, dogName: typeof d?.dogName === 'string' ? d.dogName : 'Chip' };
    if (!this.built) {
      this.built = true;
      try { this.build(ctx); } catch (err) { console.error('[animals] build failed', err); }
    }
    this.lastPlayer.copy(ctx.world.player.position);
    if (this.stray && this.data.adopted) this.stray.pos.copy(ctx.world.player.position).add(new THREE.Vector3(1.5, 0, 1.5));
  }

  // ---------------------------------------------------------------- public API

  /** Species names visible to a camera (phone photo mode). */
  inView(camera: THREE.Camera): string[] {
    const ctx = this.ctx;
    if (!ctx) return [];
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    const cam = camera.position;
    const found = new Set<string>();
    const test = (id: string, p: THREE.Vector3) => {
      if (found.has(id)) return;
      const d = p.distanceTo(cam);
      if (d > 40 || !_frustum.containsPoint(p)) return;
      const dir = _v.subVectors(p, cam).normalize();
      const hit = ctx.world.city.collision.raycast(cam.x, cam.y, cam.z, dir.x, dir.y, dir.z, d);
      if (hit < d - 0.5) return;
      found.add(id);
    };
    for (const p of this.pets) test(p.kind === 'stray' ? 'stray' : p.kind, _v.copy(p.pos).setY(p.pos.y + 0.3).clone());
    const pts: THREE.Vector3[] = [];
    for (const f of this.flocks) {
      pts.length = 0;
      f.anyNear(cam, 40, pts);
      for (const p of pts) test(f.species, p);
    }
    if (this.crabs) { pts.length = 0; this.crabs.anyNear(cam, 30, pts); for (const p of pts) test('crab', p); }
    for (const g of this.gators) test('alligator', g.root.position.clone().setY(Math.max(-0.1, g.root.position.y + 0.3)));
    return [...found].map(nameOf);
  }

  /** Phone camera reports a photo of these species (display names or ids). */
  photographed(species: string[]): { newSpecies: string[]; reward: number } {
    const ids = species.map((s) => entries(this.data.log).find((e) => e.name === s || e.species === s)?.species ?? s);
    const r = photograph(this.data.log, ids);
    if (r.reward && this.ctx) {
      this.ctx.addMoney(r.reward);
      emitEvent({ type: 'money', amount: r.reward, reason: 'Wildlife photo bounty' });
    }
    this.persist();
    return { newSpecies: r.newSpecies.map(nameOf), reward: r.reward };
  }

  /** Log a sighting (fishing calls this with 'fish-<id>'). */
  observe(species: string): void {
    if (observe(this.data.log, species) && this.ctx) this.ctx.notify(`🐾 Wildlife log: [y]${nameOf(species)}[/y] added`, 'xp');
    this.persist();
  }

  logEntries(): ReturnType<typeof entries> { return entries(this.data.log); }
  adoptedDog(): { name: string; position: THREE.Vector3 } | null {
    return this.data.adopted && this.stray ? { name: this.data.dogName, position: this.stray.pos } : null;
  }

  private persist(): void {
    this.ctx?.setData('animals', this.data);
  }

  // ---------------------------------------------------------------- build

  private build(ctx: SystemContext): void {
    const q = ctx.settings().quality;
    const lowQ = q === 'low';
    const scene = ctx.scene;
    // birds
    const gullHomes = [new THREE.Vector3(214, 0, -60), new THREE.Vector3(222, 0, 30), new THREE.Vector3(210, 0, 140), new THREE.Vector3(226, 0, -190)];
    const gulls = new Flock('seagull', lowQ ? gullHomes.slice(0, 2) : gullHomes, lowQ ? 5 : 8);
    const pigeonHomes = [new THREE.Vector3(48, 0, -84), new THREE.Vector3(-38, 0, -30), new THREE.Vector3(128, 0, -46), new THREE.Vector3(10, 0, -160)];
    const pigeons = new Flock('pigeon', lowQ ? pigeonHomes.slice(0, 2) : pigeonHomes, lowQ ? 5 : 9);
    this.flocks.push(gulls, pigeons);
    scene.add(gulls.group, pigeons.group);
    // crabs along the waterline (avoid the pier)
    this.crabs = new Crabs(lowQ ? 10 : 22, [224, 234], [-220, 200], [-134, -106]);
    scene.add(this.crabs.group);
    // alligators
    const swimPaths = [
      [[-235, 224], [-200, 234], [-170, 226], [-205, 218]],
      [[-150, 222], [-120, 236], [-95, 226], [-125, 217]],
      [[-60, 230], [-20, 240], [10, 228], [-30, 220]],
    ];
    for (const p of swimPaths.slice(0, lowQ ? 2 : 3)) {
      const g = new Gator(false, p.map(([x, z]) => new THREE.Vector3(x, -0.48, z)));
      scene.add(g.root);
      this.gators.push(g);
    }
    for (const [x, z, yaw] of [[-232, 210.3, 0.4], [-118, 210.3, -0.3]] as const) {
      const g = new Gator(true, [new THREE.Vector3(x, 0.02, z)]);
      g.yaw = yaw;
      scene.add(g.root);
      this.gators.push(g);
    }
    this.buildDeck(ctx);
    // dogs + cats (async model load, procedural fallback)
    void Promise.all([loadAnimal('dog'), loadAnimal('cat')]).then(([dog, cat]) => {
      try { this.spawnPets(ctx, dog, cat); } catch (err) { console.error('[animals] pets', err); }
    });
  }

  private buildDeck(ctx: SystemContext): void {
    const c = findClear(ctx.world.city.collision, this.deck.x, this.deck.z, 6, 4, 12);
    this.deck = c;
    const g = new THREE.Group();
    const wood = mat('#8a6a48', 0.85);
    g.add(box(6, 0.2, 4, wood, 0, 0.6, 0));
    for (const [x, z] of [[-2.8, -1.8], [2.8, -1.8], [-2.8, 1.8], [2.8, 1.8]]) g.add(box(0.2, 0.6, 0.2, wood, x, 0.3, z));
    g.add(box(6, 0.1, 0.1, wood, 0, 1.6, 1.95), box(0.1, 1, 0.1, wood, -2.95, 1.1, 1.95), box(0.1, 1, 0.1, wood, 2.95, 1.1, 1.95));
    const bino = new THREE.Group();
    bino.add(box(0.1, 1.2, 0.1, mat('#555', 0.4, 0.6), 0, 1.3, 0));
    const scope = box(0.4, 0.22, 0.5, mat('#2a6cc4', 0.4, 0.4), 0, 2.0, 0.1);
    bino.add(scope);
    bino.position.set(0, 0, 1.4);
    g.add(bino);
    const s = neonSign('Gator Point', '#9be15d', 3.6, 0.9);
    s.position.set(0, 3.2, -1.8);
    g.add(s, box(0.15, 2.6, 0.15, wood, -1.6, 2.0, -1.9), box(0.15, 2.6, 0.15, wood, 1.6, 2.0, -1.9));
    g.position.set(c.x, 0, c.z);
    ctx.scene.add(g);
    this.culler.add(g, c.x, c.z, 200);
    ctx.world.city.collision.add({ x0: c.x - 3, x1: c.x + 3, z0: c.z - 2, z1: c.z + 2, y0: 0, y1: 0.7 });
    const icon = iconSprite('🐊', '#9be15d', 1.3);
    icon.position.set(c.x, 5, c.z);
    ctx.scene.add(icon);
    this.culler.add(icon, c.x, c.z, 80);
    ctx.interactions.set({
      id: 'animals-deck', x: c.x, z: c.z + 1.2, radius: 3.2, priority: 1, title: 'Gator Point binoculars', desc: 'Observe the harbor alligators',
      enabled: () => !ctx.world.vehicle, action: () => void this.binoculars(),
    });
  }

  private spawnPets(ctx: SystemContext, dog: Awaited<ReturnType<typeof loadAnimal>>, cat: Awaited<ReturnType<typeof loadAnimal>>): void {
    const lowQ = ctx.settings().quality === 'low';
    const scene = ctx.scene;
    const paths: [number, number][][] = [
      [[177, -70], [177, 40]],
      [[-155, -70.5], [-89, -70.5], [-89, -3.8], [-155, -3.8]],
      [[13, -155], [82, -155], [82, -88.8], [13, -88.8]],
      [[177, 60], [177, 160]],
    ];
    const tints = [undefined, '#2b2420', '#f4f1ea', '#b0723a'];
    const ownerCols = ['#ff7f6b', '#19c3d6', '#ffd23f', '#9be15d'];
    paths.slice(0, lowQ ? 2 : 4).forEach((pp, i) => {
      const owner = createRig({ shirt: ownerCols[i], pants: '#3b5c8f', skin: ['#c98b5e', '#8d5a3b', '#e3b48a', '#5a3a25'][i], hair: '#2b1a12', shoes: '#fff' }, { female: i % 2 === 1, seed: 20 + i });
      scene.add(owner.root);
      const c = new Critter(dog, 'dog', tints[i]);
      scene.add(c.root);
      const leash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#e0453a' }));
      leash.frustumCulled = false;
      scene.add(leash);
      const path = pp.map(([x, z]) => new THREE.Vector2(x, z));
      const w: Walker = { owner, dog: c, path, seg: 0, t: Math.random(), pos: new THREE.Vector3(path[0].x, 0, path[0].y), dogPos: new THREE.Vector3(path[0].x + 1, 0, path[0].y), yaw: 0, pause: 0, leash };
      this.walkers.push(w);
      this.pets.push({ kind: 'dog', c, pos: w.dogPos, yaw: 0, home: w.pos, t: 0, speed: 0, special: 0, walker: w });
    });
    const catSpots: [number, number][] = [[-126, -8], [-148, -64], [-30, -46], [-96, -76], [-60, -8]];
    for (const [x, z] of catSpots.slice(0, lowQ ? 2 : 5)) {
      const c = new Critter(cat, 'cat');
      const p = findClear(ctx.world.city.collision, x, z, 0.6, 0.6, 8);
      c.root.position.set(p.x, 0, p.z);
      scene.add(c.root);
      this.pets.push({ kind: 'cat', c, pos: c.root.position, yaw: Math.random() * 6, home: new THREE.Vector3(p.x, 0, p.z), t: Math.random() * 5, speed: 0, special: 0 });
    }
    // the stray (taco truck)
    const sc = new Critter(dog, 'dog', '#c99a62');
    const home = new THREE.Vector3(190, 0, -104);
    sc.root.position.copy(this.data.adopted ? ctx.world.player.position : home);
    scene.add(sc.root);
    this.stray = { kind: 'stray', c: sc, pos: sc.root.position, yaw: 0, home, t: 0, speed: 0, special: 0 };
    this.pets.push(this.stray);
    ctx.interactions.set({
      id: 'animals-adopt', x: home.x, z: home.z, radius: 2.6, priority: 2, title: 'Adopt the stray dog', desc: 'Give this good boy a home',
      enabled: () => !this.data.adopted && !!this.stray && this.stray.pos.distanceTo(ctx.world.player.position) < 2.6,
      action: () => this.adopt(),
    });
  }

  private adopt(): void {
    const ctx = this.ctx!;
    this.data.adopted = true;
    this.persist();
    observe(this.data.log, 'stray');
    splash(ctx, 'New Best Friend', `${this.data.dogName} the Shiba follows you now`, '#ff8a3d');
    ctx.sfx('levelup');
    emitEvent({ type: 'animal', action: 'adopt', species: 'dog' });
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, ctx: SystemContext): void {
    const pl = ctx.world.player;
    const focus = ctx.world.focus;
    const moved = focus.distanceTo(this.lastPlayer);
    this.playerSpeed = dt > 0 ? (moved < 20 ? moved / dt : 0) : 0;
    this.lastPlayer.copy(focus);
    const time = ctx.world.time;
    this.culler.update(focus.x, focus.z);
    // birds & crabs
    const threats = [{ pos: focus, speed: this.playerSpeed }];
    for (const c of ctx.world.traffic.cars) {
      if (Math.abs(c.position.x - focus.x) < 60 && Math.abs(c.position.z - focus.z) < 60) threats.push({ pos: c.position, speed: c.velocity.length() });
    }
    for (const f of this.flocks) {
      const near = Math.hypot(f.center.x - focus.x, f.center.z - focus.z) < 260;
      f.group.visible = near;
      if (near) f.update(dt, threats, time);
    }
    if (this.crabs) {
      const near = focus.x > 150;
      this.crabs.group.visible = near;
      if (near) this.crabs.update(dt, focus, this.playerSpeed);
    }
    // gators
    this.biteCd = Math.max(0, this.biteCd - dt);
    for (const g of this.gators) {
      const d = g.root.position.distanceTo(_v.set(pl.position.x, g.root.position.y, pl.position.z));
      const near = d < 160;
      g.root.visible = near;
      if (!near) continue;
      g.update(dt);
      if (!ctx.world.vehicle && pl.active && this.biteCd <= 0 && g.cooldown <= 0) {
        const inWater = isWater(pl.position.x, pl.position.z) && pl.position.y < 0.2;
        if (gatorBites(d, inWater, g.basking)) {
          g.bite(pl.position.x, pl.position.z);
          this.biteCd = 2.5;
          const dir = _v.set(pl.position.x - g.root.position.x, 0, pl.position.z - g.root.position.z).normalize().clone();
          pl.hit(dir, 7);
          ctx.world.events.onPlayerHit?.(22);
          ctx.world.rig.addShake(0.8);
          ctx.notify('🐊 [r]GATOR BITE![/r] Get away from the water!', 'warn');
          emitEvent({ type: 'animal', action: 'bitten', species: 'alligator' });
        } else if (d < 9 && this.sightCd <= 0) {
          this.sightCd = 20;
          this.observe('alligator');
          ctx.notify('🐊 Careful — an alligator is very close!', 'warn');
        }
      }
    }
    this.sightCd = Math.max(0, this.sightCd - dt);
    this.updateWalkers(dt, ctx);
    this.updatePets(dt, ctx);
    this.petCheck -= dt;
    if (this.petCheck <= 0) { this.petCheck = 0.2; this.updatePetPrompt(ctx); }
  }

  private updateWalkers(dt: number, ctx: SystemContext): void {
    const f = ctx.world.focus;
    for (const w of this.walkers) {
      const near = Math.hypot(w.pos.x - f.x, w.pos.z - f.z) < 120;
      w.owner.root.visible = near;
      w.dog.root.visible = near;
      w.leash.visible = near;
      if (w.pause > 0) w.pause -= dt;
      const a = w.path[w.seg], b = w.path[(w.seg + 1) % w.path.length];
      const segLen = a.distanceTo(b) || 1;
      const speed = w.pause > 0 ? 0 : 1.25;
      w.t += (speed * dt) / segLen;
      if (w.t >= 1) { w.t = 0; w.seg = (w.seg + 1) % w.path.length; if (Math.random() < 0.3) w.pause = 3; }
      const x = a.x + (b.x - a.x) * w.t, z = a.y + (b.y - a.y) * w.t;
      w.yaw = Math.atan2(b.x - a.x, b.y - a.y);
      w.pos.set(x, 0, z);
      if (!near) continue;
      w.owner.root.position.copy(w.pos);
      w.owner.body.rotation.y = w.yaw;
      w.owner.animate(dt, speed);
      // dog trots ahead-right on the leash
      const tx = x + Math.sin(w.yaw) * 1.4 + Math.cos(w.yaw) * 0.7, tz = z + Math.cos(w.yaw) * 1.4 - Math.sin(w.yaw) * 0.7;
      const dx = tx - w.dogPos.x, dz = tz - w.dogPos.z, dd = Math.hypot(dx, dz);
      const pet = this.pets.find((p) => p.walker === w)!;
      const ds = pet.special > 0 ? 0 : Math.min(3, dd * 2.2);
      if (dd > 0.05 && ds > 0) { w.dogPos.x += (dx / dd) * ds * dt; w.dogPos.z += (dz / dd) * ds * dt; pet.yaw = Math.atan2(dx, dz); }
      w.dog.root.position.copy(w.dogPos);
      w.dog.body.rotation.y = pet.yaw;
      pet.special = Math.max(0, pet.special - dt);
      w.dog.update(dt, ds, pet.special > 0 ? (w.dog.has('Idle_2') ? 'Idle_2' : 'Idle') : undefined);
      const pos = w.leash.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, x + Math.cos(w.yaw) * 0.25, 0.95, z - Math.sin(w.yaw) * 0.25);
      pos.setXYZ(1, w.dogPos.x, 0.45, w.dogPos.z);
      pos.needsUpdate = true;
    }
  }

  private updatePets(dt: number, ctx: SystemContext): void {
    const pl = ctx.world.player, f = ctx.world.focus;
    for (const p of this.pets) {
      if (p.walker) continue;
      const near = Math.hypot(p.pos.x - f.x, p.pos.z - f.z) < 90;
      p.c.root.visible = near || (p === this.stray && this.data.adopted);
      if (!p.c.root.visible) continue;
      p.t += dt;
      p.special = Math.max(0, p.special - dt);
      let tx = p.home.x, tz = p.home.z, want = 0;
      if (p === this.stray && this.data.adopted) {
        // follow Rico (hide while he drives; teleport with him)
        if (ctx.world.vehicle) { p.c.root.visible = false; p.pos.copy(ctx.world.vehicle.position); continue; }
        if (p.pos.distanceTo(pl.position) > 30 || Math.abs(p.pos.y - pl.position.y) > 3) p.pos.set(pl.position.x - Math.sin(pl.yaw) * 1.5, pl.position.y, pl.position.z - Math.cos(pl.yaw) * 1.5);
        tx = pl.position.x - Math.sin(pl.yaw) * 1.2 - Math.cos(pl.yaw) * 0.8;
        tz = pl.position.z - Math.cos(pl.yaw) * 1.2 + Math.sin(pl.yaw) * 0.8;
        const d = Math.hypot(tx - p.pos.x, tz - p.pos.z);
        want = d > 4 ? 7 : d > 0.6 ? Math.min(3.5, d * 2) : 0;
      } else {
        // wander near home; cats bolt from running players
        const dpl = Math.hypot(pl.position.x - p.pos.x, pl.position.z - p.pos.z);
        if (p.kind === 'cat' && dpl < 4 && this.playerSpeed > 4.5) {
          tx = p.pos.x + (p.pos.x - pl.position.x) * 2; tz = p.pos.z + (p.pos.z - pl.position.z) * 2; want = 4.5;
        } else {
          if (Math.floor(p.t / 6) % 3 === 2) { tx = p.home.x + Math.sin(p.t * 0.2) * 3; tz = p.home.z + Math.cos(p.t * 0.2) * 3; want = 0.8; }
          if (Math.hypot(tx - p.pos.x, tz - p.pos.z) < 0.4) want = 0;
        }
      }
      if (p.special > 0) want = 0;
      p.speed += (want - p.speed) * Math.min(1, dt * 5);
      const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.05 && p.speed > 0.05) {
        p.pos.x += (dx / d) * p.speed * dt; p.pos.z += (dz / d) * p.speed * dt;
        let dy = Math.atan2(dx, dz) - p.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        p.yaw += dy * Math.min(1, dt * 8);
      }
      ctx.world.city.collision.resolveCircle(p.pos, 0.25, p.pos.y, 0.6);
      if (p === this.stray && this.data.adopted) {
        const g = ctx.world.city.collision.groundHeight(p.pos.x, p.pos.z, pl.position.y + 0.5);
        p.pos.y += (Math.max(g, pl.position.y > 50 ? pl.position.y : g) - p.pos.y) * Math.min(1, dt * 10);
      }
      p.c.root.position.copy(p.pos);
      p.c.body.rotation.y = p.yaw;
      p.c.update(dt, p.speed, p.special > 0 ? (p.c.has('Idle_2') ? 'Idle_2' : p.c.has('Idle_Eating') ? 'Idle_Eating' : 'Idle') : undefined);
    }
  }

  private updatePetPrompt(ctx: SystemContext): void {
    const pl = ctx.world.player.position;
    let best: Pet | null = null, bd = 2.2;
    for (const p of this.pets) {
      if (!p.c.root.visible) continue;
      const d = Math.hypot(p.pos.x - pl.x, p.pos.z - pl.z);
      if (d < bd && Math.abs(p.pos.y - pl.y) < 2) { bd = d; best = p; }
    }
    if (best && !ctx.world.vehicle) {
      const p = best;
      const name = p === this.stray && this.data.adopted ? this.data.dogName : p.kind === 'cat' ? 'the cat' : 'the dog';
      ctx.interactions.set({ id: 'animals-pet', x: p.pos.x, z: p.pos.z, radius: 2.4, priority: 1, title: `Pet ${name}`, desc: p.kind === 'cat' ? 'Purr…' : 'Who\'s a good dog?', action: () => this.pet(p) });
    } else ctx.interactions.remove('animals-pet');
  }

  private pet(p: Pet): void {
    const ctx = this.ctx!;
    p.special = 1.8;
    if (p.walker) p.walker.pause = 2.5;
    const sp = p.kind === 'stray' ? 'stray' : p.kind;
    observe(this.data.log, sp);
    this.persist();
    // heart pop over the animal
    _v.copy(p.pos).setY(p.pos.y + 0.9).project(ctx.camera);
    const sx = (_v.x * 0.5 + 0.5) * window.innerWidth, sy = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    popEmoji(ctx, sx, sy, '❤️');
    setTimeout(() => popEmoji(ctx, sx + 18, sy - 10, '💕'), 180);
    ctx.sfx('good');
    const life = ctx.system<GameSystem & { exert?(n: number): void }>('life');
    life?.exert?.(-1.5);
    emitEvent({ type: 'animal', action: 'pet', species: p.kind === 'cat' ? 'cat' : 'dog' });
    if (p.walker && Math.random() < 0.5) ctx.ui.subtitle('Dog owner', ['Aww, she likes you!', 'He\'s friendly, don\'t worry!', 'Say hi to Biscuit!'][Math.floor(Math.random() * 3)]);
  }

  // ---------------------------------------------------------------- binoculars

  private async binoculars(): Promise<void> {
    const ctx = this.ctx!;
    const deck = new THREE.Vector3(this.deck.x, 2.0, this.deck.z + 1.4);
    const fov0 = ctx.camera.fov;
    let target = this.gators[0];
    for (const g of this.gators) if (g.root.position.distanceTo(deck) < target.root.position.distanceTo(deck)) target = g;
    await modal(ctx, () => new Promise<void>((resolve) => {
      const L = layer(ctx);
      const vignette = h('div', { style: 'position:absolute;inset:0;pointer-events:none', html: '<svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100"><defs><mask id="bino"><rect width="100" height="100" fill="white"/><ellipse cx="38" cy="50" rx="17" ry="30" fill="black"/><ellipse cx="62" cy="50" rx="17" ry="30" fill="black"/></mask></defs><rect width="100" height="100" fill="black" mask="url(#bino)"/></svg>' });
      const info = h('div', { class: 'lf-panel', style: 'position:absolute;left:50%;bottom:40px;transform:translateX(-50%);text-align:center', html: `<b style="color:#9be15d">AMERICAN ALLIGATOR</b><br>Up to 4.5 m · cold-blooded · basks to warm up<br>${key('Esc')} put down binoculars` });
      L.append(vignette, info);
      let t = 0, done = false;
      const fin = () => { if (done) return; done = true; release(); L.remove(); resolve(); };
      const release = captureKeys(() => { if (t > 0.6) fin(); });
      const tick = () => {
        if (done) return;
        t += 1 / 60;
        const tp = target.root.position;
        ctx.camera.position.copy(deck);
        ctx.camera.lookAt(tp.x, tp.y + 0.2, tp.z);
        ctx.camera.fov = 18;
        ctx.camera.updateProjectionMatrix();
        target.update(1 / 60);
        if (t > 8) fin();
        else requestAnimationFrame(tick);
      };
      tick();
    }));
    ctx.camera.fov = fov0;
    ctx.camera.updateProjectionMatrix();
    const first = !this.data.log.alligator?.seen;
    this.observe('alligator');
    if (first) { ctx.addMoney(50); emitEvent({ type: 'money', amount: 50, reason: 'Gator Point observation' }); ctx.notify(`Observation logged! +${money(50)}`, 'money'); }
    emitEvent({ type: 'animal', action: 'observe', species: 'alligator' });
  }
}

export default function create(): GameSystem {
  return new AnimalsSystem();
}
