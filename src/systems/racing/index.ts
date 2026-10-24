import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import { Vehicle, VEHICLE_DEFS, type VehicleKind } from '../../vehicles/Vehicle';
import { RAMPS } from '../../vehicles/ramps';
import type { GarageSystem } from '../garage';
import { MENU_CLOSE, bigMessage, ensureStyles, money, openMenu } from '../garage/ui';
import {
  RACES, advance, driftCash, driftRate, formatTime, newProgress, ordinal, passedCount, rank, rubberBand, stuntJumpCash,
  totalCheckpoints, trackDistance, trackTable, wheelieCash, type Progress, type RaceDef,
} from './logic';

// Racing & stunts: street / circuit / oval races with glowing checkpoint rings,
// AI opponents (racing line + rubber band), countdown, position/lap HUD and
// prizes; five stunt ramps with unique stunt jump bonuses; drift, wheelie and
// air-time score popups.

interface Racer {
  id: string;
  v: Vehicle | null; // null = the player
  prog: Progress;
}

interface ActiveRace {
  def: RaceDef;
  table: { cum: number[]; lap: number };
  racers: Racer[];
  ai: Vehicle[];
  vehicle: Vehicle;
  state: 'countdown' | 'racing' | 'done';
  t: number;
  countdown: number;
  lastBeep: number;
  awayT: number;
  position: number;
  cleanupAt: number;
}

interface RacingSave { best: Record<string, number>; wins: Record<string, number>; stunts: string[] }

const OPPONENT_POOL: Record<string, VehicleKind[]> = {
  car: ['stinger', 'cabrio', 'shield', 'stinger'],
  bike: ['bike', 'dirtbike', 'bike'],
  slow: ['sedan', 'pickup', 'van', 'sedan'],
};

class Racing implements GameSystem {
  readonly id = 'racing';
  private ctx!: SystemContext;
  private built = false;
  private race: ActiveRace | null = null;
  private data: RacingSave = { best: {}, wins: {}, stunts: [] };
  private ring!: THREE.Mesh;
  private ghost!: THREE.Mesh;
  private ringMat!: THREE.MeshBasicMaterial;
  private hud: { root: HTMLElement; pos: HTMLElement; lap: HTMLElement; cp: HTMLElement; time: HTMLElement; count: HTMLElement; score: HTMLElement } | null = null;
  // stunts
  private watched: Vehicle | null = null;
  private launch: { ramp: string | null; x: number; z: number; t: number } | null = null;
  private drift = { score: 0, idle: 0, active: false, health: 0 };
  private wheelieT = 0;
  private scoreHide = 0;
  private rampCooldown = new Map<string, number>();
  private time = 0;
  private quickFor = '';

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    const raw = ctx.getData<Partial<RacingSave> | null>('racing', null);
    this.data = {
      best: { ...(raw?.best ?? {}) },
      wins: { ...(raw?.wins ?? {}) },
      stunts: Array.isArray(raw?.stunts) ? raw!.stunts.filter((s) => typeof s === 'string') : [],
    };
    if (!this.built) {
      this.built = true;
      try { this.build(); } catch (err) { console.error('[racing] build failed', err); }
    }
    if (this.race) this.endRace(false, 'Race cancelled.');
    this.register();
  }

  private persist(): void {
    this.ctx.setData('racing', JSON.parse(JSON.stringify(this.data)));
  }

  private garage(): GarageSystem | undefined {
    return this.ctx.system<GarageSystem>('garage');
  }

  // ------------------------------------------------------------------ build

  private build(): void {
    const ctx = this.ctx;
    ensureStyles();
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.4, 10, 48), this.ringMat);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(6, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.ring.add(inner);
    this.ghost = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.22, 8, 36), new THREE.MeshBasicMaterial({ color: '#19e6ff', transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false }));
    this.ring.visible = this.ghost.visible = false;
    ctx.scene.add(this.ring, this.ghost);
    for (const r of RACES) ctx.markers.addCheckpoint(`racing-start-${r.id}`, r.start.x, r.start.z, 4.2, '#ffd23f');
    this.buildRamps();
    this.buildHud();
  }

  private buildRamps(): void {
    const body = new THREE.MeshStandardMaterial({ color: '#2b2440', roughness: 0.75, metalness: 0.2 });
    const top = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.5, emissive: '#ffd23f', emissiveIntensity: 0.25 });
    const stripe = new THREE.MeshStandardMaterial({ color: '#ff2fa0', emissive: '#ff2fa0', emissiveIntensity: 2.2 });
    for (const r of RAMPS) {
      const g = new THREE.Group();
      const shape = new THREE.Shape();
      shape.moveTo(-r.length / 2, 0);
      shape.lineTo(r.length / 2, 0);
      shape.lineTo(r.length / 2, r.height);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: r.width, bevelEnabled: false });
      geo.translate(0, 0, -r.width / 2);
      geo.rotateY(-Math.PI / 2); // profile x → +z (travel direction)
      const mesh = new THREE.Mesh(geo, [body, top]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      // chevrons on the deck
      const slope = Math.atan2(r.height, r.length);
      const deckLen = Math.hypot(r.length, r.height);
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.7) / 5;
        const s = new THREE.Mesh(new THREE.BoxGeometry(r.width * 0.8, 0.04, 0.35), stripe);
        s.position.set(0, r.height * t + 0.03, -r.length / 2 + r.length * t);
        s.rotation.x = -slope;
        g.add(s);
      }
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, deckLen), stripe);
        rail.position.set(sx * (r.width / 2 - 0.06), r.height / 2 + 0.06, 0);
        rail.rotation.x = -slope;
        g.add(rail);
      }
      g.position.set(r.x, 0, r.z);
      g.rotation.y = r.yaw;
      this.ctx.scene.add(g);
    }
  }

  private buildHud(): void {
    const root = document.createElement('div');
    root.style.cssText = 'position:absolute;right:28px;top:120px;text-align:right;font-family:Oswald,Rajdhani,sans-serif;color:#fff;pointer-events:none;display:none;text-shadow:0 2px 4px #000';
    const line = (size: number) => {
      const e = document.createElement('div');
      e.style.cssText = `font-size:${size}px;line-height:1.1;background:linear-gradient(90deg,transparent,rgba(0,0,0,.65));padding:2px 10px;margin-top:3px`;
      root.append(e);
      return e;
    };
    const pos = line(40), lap = line(22), cp = line(18), time = line(22);
    const count = document.createElement('div');
    count.style.cssText = 'position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font-family:Anton,Bungee,Impact,sans-serif;font-size:120px;color:#ffd23f;text-shadow:0 0 30px #ff2fa0,0 4px 0 #000;pointer-events:none;display:none';
    const score = document.createElement('div');
    score.style.cssText = 'position:absolute;left:50%;bottom:150px;transform:translateX(-50%);font-family:Anton,Bungee,Impact,sans-serif;font-size:34px;letter-spacing:2px;color:#19e6ff;text-shadow:0 0 14px #19e6ff,0 3px 0 #000;pointer-events:none;display:none;white-space:nowrap';
    this.ctx.hudRoot.append(root, count, score);
    this.hud = { root, pos, lap, cp, time, count, score };
  }

  private register(): void {
    const ctx = this.ctx;
    for (const r of RACES) {
      ctx.interactions.set({
        id: `racing-start-${r.id}`, x: r.start.x, z: r.start.z, radius: 4.5, priority: 0,
        title: `${r.name}`, desc: 'Drive a car or bike into the marker and press K to race',
        enabled: () => !ctx.world.vehicle && !this.race,
        action: () => ctx.notify(`[y]${r.name}[/y]: bring a car or motorbike into the yellow marker and press ~K~.`, 'info'),
      });
    }
  }

  /** The race whose start marker the player's vehicle is in (if racing is possible). */
  private raceHere(): RaceDef | null {
    if (this.race) return null;
    const v = this.ctx.world.vehicle;
    if (!v || v.medium !== 'land') return null;
    for (const r of RACES) if (Math.hypot(v.position.x - r.start.x, v.position.z - r.start.z) < 7) return r;
    return null;
  }

  /** Map blips: race starts and the next checkpoint. */
  blips(): { x: number; z: number; kind: 'target' | 'place'; color: string; label: string }[] {
    if (this.race) {
      const p = this.race.racers[0].prog;
      const c = this.race.def.checkpoints[p.cp];
      return c ? [{ x: c.x, z: c.z, kind: 'target', color: '#ffd23f', label: 'Checkpoint' }] : [];
    }
    return RACES.map((r) => ({ x: r.start.x, z: r.start.z, kind: 'place' as const, color: '#ffd23f', label: `Race: ${r.name}` }));
  }

  // ------------------------------------------------------------------ race flow

  private async offer(r: RaceDef): Promise<void> {
    const ctx = this.ctx;
    const best = this.data.best[r.id];
    let go = false;
    await ctx.modal(() => openMenu(ctx.hudRoot, {
      title: r.name,
      subtitle: `${r.type === 'circuit' ? 'Circuit' : r.type === 'oval' ? 'Oval' : 'Street race'} · ${r.laps} lap${r.laps > 1 ? 's' : ''} · ${r.opponents} rivals`,
      accent: ['#ffd23f', '#ff2fa0'],
      footer: () => `Prizes: 1st ${money(r.reward[0])} · 2nd ${money(r.reward[1])} · 3rd ${money(r.reward[2])}${best ? ` · Best ${formatTime(best)}` : ''}`,
      items: () => [
        { label: 'Start race', right: `Entry ${money(r.entry)}`, desc: r.desc, disabled: ctx.profile().credits < r.entry, action: () => { go = true; return MENU_CLOSE; } },
        { label: 'Not now', action: () => MENU_CLOSE },
      ],
    }));
    if (go && ctx.world.vehicle && ctx.addMoney(-r.entry)) await this.startRace(r, ctx.world.vehicle);
  }

  private async startRace(def: RaceDef, v: Vehicle): Promise<void> {
    const ctx = this.ctx, w = ctx.world;
    await ctx.ui.fade(true);
    const yaw = def.start.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const slot = (i: number) => {
      const row = Math.floor(i / 2), side = i % 2 === 0 ? 1 : -1;
      return { x: def.start.x + rx * side * 2.8 - fx * row * 8, z: def.start.z + rz * side * 2.8 - fz * row * 8 };
    };
    const s0 = slot(0);
    v.place(s0.x, s0.z, yaw);
    v.repair();
    const pool = v.def.twoWheel ? OPPONENT_POOL.bike : v.def.maxSpeed < 40 ? OPPONENT_POOL.slow : OPPONENT_POOL.car;
    const path = def.checkpoints.map((c) => ({ x: c.x, z: c.z }));
    const ai: Vehicle[] = [];
    const racers: Racer[] = [{ id: 'player', v: null, prog: newProgress() }];
    for (let i = 0; i < def.opponents; i++) {
      const kind = pool[i % pool.length];
      const av = new Vehicle(VEHICLE_DEFS[kind]);
      const s = slot(i + 1);
      av.place(s.x, s.z, yaw);
      ctx.scene.add(av.root);
      w.traffic.addRacer(av, path, def.laps > 1, 0.9 + Math.random() * 0.12);
      av.driver = null; // frozen during the countdown
      ai.push(av);
      racers.push({ id: `ai-${i}`, v: av, prog: newProgress() });
    }
    // clear ambient traffic off the grid
    for (const c of w.traffic.cars) {
      if (ai.includes(c)) continue;
      if (Math.hypot(c.position.x - def.start.x, c.position.z - def.start.z) < 40) c.position.x += 2000; // recycled next frame
    }
    this.race = { def, table: trackTable(def), racers, ai, vehicle: v, state: 'countdown', t: 0, countdown: 3.999, lastBeep: 4, awayT: 0, position: 1, cleanupAt: 0 };
    w.rig.snapTo(v.position, yaw + Math.PI);
    await ctx.ui.fade(false);
  }

  private endRace(finished: boolean, msg?: string): void {
    const race = this.race;
    if (!race) return;
    const ctx = this.ctx;
    for (const v of race.ai) {
      ctx.world.traffic.removeRacer(v);
      ctx.scene.remove(v.root);
    }
    this.ring.visible = this.ghost.visible = false;
    this.race = null;
    if (!finished && msg) {
      bigMessage(ctx.hudRoot, 'Race failed', msg, '#ff4d6d');
      ctx.sfx('failed');
    }
  }

  update(dt: number, ctx: SystemContext): void {
    this.time += dt;
    for (const [k, t] of this.rampCooldown) if (t < this.time) this.rampCooldown.delete(k);
    const race = this.race;
    if (race) this.updateRace(race, dt);
    this.updateStunts(dt);
    // label for the K hint
    const r = this.raceHere();
    const g = this.garage();
    if (g && r && this.quickFor !== r.id) {
      this.quickFor = r.id;
      g.registerQuickAction({ id: 'racing-start', label: `Start race: ${r.name}`, available: () => !!this.raceHere(), run: () => { const rr = this.raceHere(); if (rr) void this.offer(rr); } });
    }
    void ctx;
  }

  always(): void {
    const hud = this.hud;
    if (!hud) return;
    const busy = this.ctx.isBusy();
    hud.root.style.display = this.race && this.race.state !== 'done' && !busy ? '' : 'none';
    if (busy) { hud.count.style.display = 'none'; hud.score.style.display = 'none'; }
  }

  private updateRace(race: ActiveRace, dt: number): void {
    const ctx = this.ctx, w = ctx.world;
    const def = race.def;
    const hud = this.hud!;
    const pv = race.vehicle;
    if (race.state === 'countdown') {
      race.countdown -= dt;
      // hold everyone on the grid
      pv.velocity.set(0, 0, 0);
      pv.speed = 0;
      const n = Math.ceil(race.countdown);
      if (n !== race.lastBeep && n >= 1) { race.lastBeep = n; ctx.sfx('beep'); }
      hud.count.style.display = '';
      hud.count.textContent = n >= 1 ? String(n) : 'GO!';
      if (race.countdown <= 0) {
        race.state = 'racing';
        race.t = 0;
        for (const v of race.ai) v.driver = 'ai';
        ctx.sfx('whoosh');
        setTimeout(() => { if (this.hud) this.hud.count.style.display = 'none'; }, 700);
      }
      this.placeRings(race);
      this.renderHud(race);
      return;
    }
    if (race.state === 'done') {
      if (this.time > race.cleanupAt) this.endRace(true);
      return;
    }
    race.t += dt;
    // abort conditions
    if (w.vehicle !== pv) race.awayT += dt; else race.awayT = 0;
    if (race.awayT > 8) { this.endRace(false, 'You left your vehicle.'); return; }
    if (pv.dead) { this.endRace(false, 'Your vehicle is wrecked.'); return; }
    // progress
    const me = race.racers[0];
    const res = advance(def, me.prog, pv.position.x, pv.position.z, 10, race.t);
    if (res === 'checkpoint') ctx.sfx('beep');
    if (res === 'lap') { ctx.sfx('good'); bigMessage(ctx.hudRoot, `Lap ${me.prog.lap + 1}/${def.laps}`, '', '#19e6ff', 1200); }
    for (const r of race.racers) {
      if (!r.v) continue;
      const out = advance(def, r.prog, r.v.position.x, r.v.position.z, 13, race.t);
      if (out === 'finish') w.traffic.finishRacer(r.v);
    }
    const dist = (r: Racer) => trackDistance(def, race.table, r.prog, r.v ? r.v.position.x : pv.position.x, r.v ? r.v.position.z : pv.position.z);
    const myD = dist(me);
    const order = rank(race.racers.map((r) => ({ id: r.id, distance: dist(r) })));
    race.position = order.indexOf('player') + 1;
    // rubber band AI around the player
    for (const r of race.racers) if (r.v && !r.prog.finished) r.v.speedMult = rubberBand(dist(r) - myD);
    if (res === 'finish') {
      race.state = 'done';
      race.cleanupAt = this.time + 5;
      const pos = race.position;
      const prize = def.reward[pos - 1] ?? 0;
      if (prize) ctx.addMoney(prize);
      const best = this.data.best[def.id];
      const newBest = !best || race.t < best;
      if (newBest) this.data.best[def.id] = Math.round(race.t * 100) / 100;
      if (pos === 1) this.data.wins[def.id] = (this.data.wins[def.id] ?? 0) + 1;
      this.persist();
      ctx.sfx(pos === 1 ? 'passed' : 'good');
      bigMessage(ctx.hudRoot, pos === 1 ? 'Race won!' : `${ordinal(pos)} place`, `${formatTime(race.t)}${newBest ? ' · NEW BEST' : ''}${prize ? ` · +${money(prize)}` : ''}`, pos === 1 ? '#ffd23f' : '#19e6ff', 4200);
      if (prize) ctx.notify(`${def.name}: ${ordinal(pos)} place, won ${money(prize)}.`, 'money');
      this.ring.visible = this.ghost.visible = false;
      return;
    }
    this.placeRings(race);
    this.renderHud(race);
  }

  private placeRings(race: ActiveRace): void {
    const def = race.def;
    const p = race.racers[0].prog;
    const n = def.checkpoints.length;
    const c = def.checkpoints[p.cp];
    const lastLap = p.lap >= def.laps - 1;
    const isFinish = lastLap && p.cp === n - 1;
    const prev = p.cp > 0 ? def.checkpoints[p.cp - 1] : p.lap > 0 ? def.checkpoints[n - 1] : def.start;
    this.ring.visible = true;
    this.ring.position.set(c.x, 5.2, c.z);
    this.ring.rotation.set(0, Math.atan2(c.x - prev.x, c.z - prev.z), 0);
    const pulse = 0.75 + Math.sin(this.time * 6) * 0.2;
    this.ringMat.color.set(isFinish ? (Math.sin(this.time * 8) > 0 ? '#ffffff' : '#ff2fa0') : '#ffd23f');
    this.ringMat.opacity = pulse;
    this.ring.scale.setScalar(1 + Math.sin(this.time * 4) * 0.04);
    const ni = p.cp + 1 < n ? p.cp + 1 : lastLap ? -1 : 0;
    this.ghost.visible = ni >= 0;
    if (ni >= 0) {
      const nc = def.checkpoints[ni];
      this.ghost.position.set(nc.x, 4.2, nc.z);
      this.ghost.rotation.set(0, Math.atan2(nc.x - c.x, nc.z - c.z), 0);
    }
  }

  private renderHud(race: ActiveRace): void {
    const hud = this.hud!;
    const def = race.def, p = race.racers[0].prog;
    hud.pos.innerHTML = `<span style="font-size:18px;opacity:.8">POS </span>${race.position}<span style="font-size:22px">/${race.racers.length}</span>`;
    hud.lap.textContent = def.laps > 1 ? `LAP ${Math.min(def.laps, p.lap + 1)}/${def.laps}` : def.type === 'street' ? 'SPRINT' : '';
    hud.cp.textContent = `CHECKPOINT ${passedCount(def, p)}/${totalCheckpoints(def)}`;
    hud.time.textContent = formatTime(race.t);
  }

  // ------------------------------------------------------------------ stunts

  private updateStunts(dt: number): void {
    const ctx = this.ctx;
    const v = ctx.world.vehicle;
    if (v !== this.watched) {
      if (this.watched) { this.watched.onLaunch = undefined; this.watched.onLand = undefined; }
      this.watched = v;
      this.launch = null;
      this.endDrift(false);
      if (v) {
        v.onLaunch = (ramp) => { this.launch = { ramp, x: v.position.x, z: v.position.z, t: this.time }; };
        v.onLand = (impact, air) => this.landed(v, impact, air);
      }
    }
    if (this.scoreHide > 0) {
      this.scoreHide -= dt;
      if (this.scoreHide <= 0 && this.hud) this.hud.score.style.display = 'none';
    }
    if (!v || v.medium !== 'land') return;
    // drift
    const rate = v.airborne ? 0 : driftRate(Math.abs(v.speed), v.slipAngle);
    if (rate > 0) {
      if (!this.drift.active) { this.drift.active = true; this.drift.score = 0; this.drift.health = v.health; }
      this.drift.score += rate * dt;
      this.drift.idle = 0;
      if (v.health < this.drift.health - 5) { this.endDrift(true); return; }
      if (this.drift.score > 150) this.showScore(`DRIFT ${Math.round(this.drift.score).toLocaleString()}`, '#ff2fa0');
    } else if (this.drift.active) {
      this.drift.idle += dt;
      if (this.drift.idle > 0.7) this.endDrift(false);
    }
    // wheelie
    if (v.def.canWheelie) {
      if (v.wheelie > 0.25) {
        this.wheelieT += dt;
        if (this.wheelieT > 0.8) this.showScore(`WHEELIE ${this.wheelieT.toFixed(1)}s`, '#3dffb0');
      } else if (this.wheelieT > 0 && v.wheelie < 0.1) {
        const cash = wheelieCash(this.wheelieT);
        if (cash > 0) { ctx.addMoney(cash); this.showScore(`WHEELIE ${this.wheelieT.toFixed(1)}s  +${money(cash)}`, '#3dffb0', 2); }
        this.wheelieT = 0;
      }
    }
  }

  private endDrift(crashed: boolean): void {
    if (!this.drift.active) return;
    this.drift.active = false;
    const s = Math.round(this.drift.score);
    this.drift.score = 0;
    if (crashed) {
      if (s > 300) this.showScore('DRIFT FAILED', '#ff4d6d', 1.5);
      return;
    }
    const cash = driftCash(s);
    if (cash > 0) {
      this.ctx.addMoney(cash);
      this.showScore(`DRIFT ${s.toLocaleString()}  +${money(cash)}`, '#ff2fa0', 2.2);
      this.ctx.sfx('cash');
    }
  }

  private landed(v: Vehicle, impact: number, air: number): void {
    const ctx = this.ctx;
    const l = this.launch;
    this.launch = null;
    if (impact > 5) this.garage()?.dustBurst(v.position.x, v.position.y, v.position.z, impact);
    if (!l) return;
    const dist = Math.hypot(v.position.x - l.x, v.position.z - l.z);
    if (l.ramp) {
      if ((this.rampCooldown.get(l.ramp) ?? 0) > this.time) return;
      const unique = !this.data.stunts.includes(l.ramp);
      const cash = stuntJumpCash(unique, air, dist);
      if (cash <= 0) {
        this.showScore(`STUNT JUMP FAILED · ${dist.toFixed(0)} m`, '#ff4d6d', 1.8);
        return;
      }
      this.rampCooldown.set(l.ramp, this.time + 8);
      ctx.addMoney(cash);
      ctx.sfx(unique ? 'passed' : 'cash');
      if (unique) {
        this.data.stunts.push(l.ramp);
        this.persist();
        const name = RAMPS.find((r) => r.id === l.ramp)?.name ?? 'Stunt jump';
        bigMessage(ctx.hudRoot, 'Unique stunt jump', `${name} · ${this.data.stunts.length}/${RAMPS.length} · ${dist.toFixed(0)} m · +${money(cash)}`, '#ffd23f', 3200);
      } else {
        this.showScore(`STUNT JUMP ${dist.toFixed(0)} m  +${money(cash)}`, '#ffd23f', 2.4);
      }
    } else if (air > 1.2) {
      this.showScore(`AIR TIME ${air.toFixed(1)}s · ${dist.toFixed(0)} m`, '#19e6ff', 1.8);
    }
  }

  private showScore(text: string, color: string, hold = 0.6): void {
    const hud = this.hud;
    if (!hud) return;
    hud.score.style.display = '';
    hud.score.style.color = color;
    hud.score.style.textShadow = `0 0 14px ${color},0 3px 0 #000`;
    hud.score.textContent = text;
    this.scoreHide = hold;
  }
}

export type RacingSystem = Racing;

export default function create(): GameSystem {
  return new Racing();
}
