import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import type { Vehicle, VehicleKind } from '../../vehicles/Vehicle';
import { COMBAT_HOOKS } from '../../scripting/combatHooks';
import { Robbery } from './robbery';
import { CREW, GETAWAYS, crewById, escapeStars, getawayById, guardCount, heistPayout, validPlan, vaultTime, type HeistPlan, type HeistStage } from './heist';
import type { CombatSystem } from '../combat/system';
import type { PoliceSystem } from '../police/system';
import { CombatActor, emptyPose } from '../combat/actor';
import { neonSign } from '../combat/activities';
import type { Shootable } from '../combat/trace';
import type { Enemy } from '../combat/enemies';
import { COMBAT_AUDIO } from '../combat/audio';

// Crime: store robberies, the docks chop shop, a fence for stolen goods,
// container looting (crowbar QTE), a safehouse cash stash, criminal
// reputation, and "The Neon Bay Score" heist planned at the hideout.

export interface StoreDef { id: string; name: string; x: number; z: number; yaw: number; cash: number }

export const STORES: StoreDef[] = [
  { id: 'beach', name: 'Neon 24/7 — Ocean Drive', x: 174, z: 62, yaw: -Math.PI / 2, cash: 900 },
  { id: 'oldtown', name: 'Bodega Flamingo — Old Town', x: -89, z: 40, yaw: Math.PI / 2, cash: 700 },
  { id: 'harbor', name: 'Harbor Quick Stop', x: 81, z: 130, yaw: Math.PI / 2, cash: 800 },
];
export const CHOP_SHOP = { x: 24, z: 196 };
export const FENCE = { x: -50, z: -48 };
export const HIDEOUT = { x: -89, z: 150 };
export const HEIST_TARGET = { x: 99, z: -140 };
export const CONTAINERS = [{ x: 100, z: 194 }, { x: 110, z: 194 }, { x: 130, z: 194 }, { x: 140, z: 194 }, { x: 150, z: 194 }];

const CHOP_VALUE: Partial<Record<VehicleKind, number>> = { sedan: 900, taxi: 700, cabrio: 1500, stinger: 2600, bike: 800, van: 1100, pickup: 1000, police: 2200, shield: 1800 };
const LOOT = [
  { id: 'phones', name: 'Crate of phones', value: 420 },
  { id: 'jewelry', name: 'Jewelry case', value: 900 },
  { id: 'sneakers', name: 'Designer sneakers', value: 300 },
  { id: 'chips', name: 'Server CPUs', value: 1200 },
  { id: 'watches', name: 'Knock-off watches', value: 160 },
];

interface LootItem { id: string; name: string; value: number }
interface CrimeSave { rep: number; stash: number; loot: LootItem[]; heistDone: boolean; plan?: HeistPlan }

interface Store {
  def: StoreDef;
  robbery: Robbery;
  clerk: CombatActor;
  clerkDead: boolean;
  bag: THREE.Mesh;
  shootable: Shootable;
  shotsFrame: boolean;
  waiters: ((ok: boolean) => void)[];
}

interface HeistRun {
  plan: HeistPlan;
  stage: HeistStage;
  guards: Enemy[];
  detected: boolean;
  progress: number;
  car: Vehicle | null;
  markerId: string | null;
}

const _v = new THREE.Vector3();
const bagMat = new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.8 });
const counterMat = new THREE.MeshStandardMaterial({ color: '#e8e1d4', roughness: 0.6 });

export class CrimeSystem implements GameSystem {
  readonly id = 'crime';
  ctx!: SystemContext;
  rep = 0;
  stash = 0;
  loot: LootItem[] = [];
  heistDone = false;
  plan: HeistPlan = { approach: 'stealth', hacker: 'byte', gunman: 'brick', driver: 'lil', getaway: 'sedan' };
  readonly stores: Store[] = [];
  private built = false;
  private heist: HeistRun | null = null;
  private chopT = 0;
  private chopCooldown = 0;
  private containerCooldown = new Map<number, number>();
  private hintedStore = new Set<string>();
  private hud: HTMLElement | null = null;

  private get combat(): CombatSystem | undefined { return this.ctx.system<CombatSystem>('combat'); }
  private get police(): PoliceSystem | undefined { return this.ctx.system<PoliceSystem>('police'); }

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    const d = ctx.getData<CrimeSave | null>('crime', null);
    this.rep = d?.rep ?? 0;
    this.stash = d?.stash ?? 0;
    this.loot = Array.isArray(d?.loot) ? d.loot.filter((l) => l && typeof l.value === 'number') : [];
    this.heistDone = !!d?.heistDone;
    if (d?.plan && validPlan(d.plan)) this.plan = d.plan;
    if (this.built) return;
    this.built = true;
    this.buildStores();
    this.buildSpots();
    COMBAT_HOOKS.startRobbery = (store) => this.waitRobbery(store);
    this.combat?.onShot.push((x, z) => {
      for (const s of this.stores) if (Math.hypot(s.def.x - x, s.def.z - z) < 14) s.shotsFrame = true;
    });
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:absolute;left:50%;top:84px;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;font:500 15px Oswald,sans-serif;letter-spacing:1px;padding:6px 14px;pointer-events:none;display:none;text-align:center;min-width:260px';
    ctx.hudRoot.append(this.hud);
  }

  persist(): void {
    this.ctx.setData('crime', { rep: this.rep, stash: this.stash, loot: this.loot, heistDone: this.heistDone, plan: this.plan } satisfies CrimeSave);
  }

  private addRep(n: number): void {
    this.rep = Math.max(0, this.rep + n);
    this.persist();
  }

  // ------------------------------------------------------------------ build

  private buildStores(): void {
    const ctx = this.ctx;
    for (const def of STORES) {
      const fx = Math.sin(def.yaw), fz = Math.cos(def.yaw);
      const clerk = new CombatActor({ shirt: '#ff2fa0', pants: '#2b3a55', skin: '#b07a52', hair: '#1b120d' }, def.id === 'oldtown', 3);
      clerk.root.position.set(def.x, 0, def.z);
      clerk.yawNode.rotation.y = def.yaw;
      ctx.scene.add(clerk.root);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.7), counterMat);
      counter.position.set(def.x + fx * 0.9, 0.5, def.z + fz * 0.9);
      counter.rotation.y = def.yaw;
      ctx.scene.add(counter);
      ctx.world.city.collision.add({ x0: counter.position.x - 0.6, x1: counter.position.x + 0.6, z0: counter.position.z - 0.6, z1: counter.position.z + 0.6, y0: 0, y1: 1.0 });
      const sign = neonSign('24/7', '#19e6ff', def.name.split(' — ')[0].toUpperCase());
      sign.position.set(def.x - fx * 1.2, 0, def.z - fz * 1.2);
      sign.rotation.y = def.yaw;
      ctx.scene.add(sign);
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8).scale(1, 0.8, 1), bagMat);
      bag.position.set(counter.position.x, 1.15, counter.position.z);
      bag.visible = false;
      ctx.scene.add(bag);
      const store: Store = {
        def, robbery: new Robbery(def.cash), clerk, clerkDead: false, bag, shotsFrame: false, waiters: [],
        shootable: {
          pos: clerk.root.position, height: 1.25, radius: 0.32, tag: 'clerk',
          alive: () => !store.clerkDead,
          onHit: (_d, lethal) => {
            store.clerkDead = true;
            clerk.fall();
            store.robbery.fail('The clerk is down.');
            this.combat?.crime(lethal ? 'murder' : 'assault', def.x, def.z);
            setTimeout(() => { store.clerkDead = false; clerk.rise(); }, 90000);
          },
        },
      };
      store.robbery.events = {
        alarm: (stars) => {
          this.police?.reportCrime('robbery', def.x, def.z, { victimCop: true });
          if ((this.police?.stars ?? 0) < stars) this.police?.setWanted(stars);
          ctx.notify('[r]Silent alarm![/r] Police are on the way.', 'warn');
          COMBAT_AUDIO.play('empty');
        },
        done: (cash) => {
          ctx.addMoney(cash);
          ctx.sfx('cash');
          ctx.notify(`Grabbed the bag: [g]$${cash}[/g]. Now lose the cops.`, 'money');
          bag.visible = false;
          this.addRep(5);
          for (const f of store.waiters.splice(0)) f(true);
        },
        failed: (reason) => {
          bag.visible = false;
          ctx.notify(reason, 'warn');
          for (const f of store.waiters.splice(0)) f(false);
        },
      };
      this.combat?.addShootable(store.shootable);
      this.stores.push(store);
    }
  }

  private buildSpots(): void {
    const ctx = this.ctx;
    const place = (g: THREE.Object3D, x: number, z: number, yaw = 0) => { g.position.set(x, 0, z); g.rotation.y = yaw; ctx.scene.add(g); };
    place(neonSign('CHOP SHOP', '#ffd23f', 'NO QUESTIONS ASKED'), CHOP_SHOP.x, CHOP_SHOP.z - 5);
    place(neonSign('FENCE', '#b14dff', 'BUYING ANYTHING'), FENCE.x, FENCE.z - 1.5);
    place(neonSign('HIDEOUT', '#ff2fa0', 'MEMBERS ONLY'), HIDEOUT.x - 1.5, HIDEOUT.z, Math.PI / 2);
    ctx.markers.addCheckpoint('crime-chop', CHOP_SHOP.x, CHOP_SHOP.z, 4, '#ffd23f');
    ctx.interactions.set({ id: 'crime-fence', x: FENCE.x, z: FENCE.z, radius: 3, title: 'Fence', desc: 'Sell stolen goods', action: () => void this.openFence() });
    ctx.interactions.set({ id: 'crime-stash', x: HIDEOUT.x, z: HIDEOUT.z + 2, radius: 2.5, title: 'Safehouse stash', desc: 'Cash in the stash is safe from fines', action: () => void this.openStash() });
    ctx.interactions.set({ id: 'crime-heist', x: HIDEOUT.x, z: HIDEOUT.z - 2, radius: 2.5, title: 'Heist board: The Neon Bay Score', desc: 'Plan the Gold Coast Exchange job', enabled: () => !this.heist, action: () => void this.openHeistBoard() });
    const crateGeo = new THREE.BoxGeometry(2.4, 2.6, 6);
    const crateMats = ['#c94f3d', '#2f5d8a', '#3a7d44', '#d9a441'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.3 }));
    CONTAINERS.forEach((c, i) => {
      const m = new THREE.Mesh(crateGeo, crateMats[i % crateMats.length]);
      m.position.set(c.x, 1.3, c.z + 4);
      m.castShadow = true;
      ctx.scene.add(m);
      ctx.world.city.collision.add({ x0: c.x - 1.2, x1: c.x + 1.2, z0: c.z + 1, z1: c.z + 7, y0: 0, y1: 2.6 });
      ctx.interactions.set({
        id: `crime-container-${i}`, x: c.x, z: c.z, radius: 2.2, title: 'Pry open container', desc: 'Crowbar QTE. Docks security might notice.',
        enabled: () => (this.containerCooldown.get(i) ?? 0) <= performance.now(),
        action: () => void this.lootContainer(i),
      });
    });
  }

  blips(): { x: number; z: number; color: string; kind: 'shop'; label: string }[] {
    const out = STORES.map((s) => ({ x: s.x, z: s.z, color: '#19e6ff', kind: 'shop' as const, label: s.name }));
    out.push({ x: CHOP_SHOP.x, z: CHOP_SHOP.z, color: '#ffd23f', kind: 'shop', label: 'Chop shop' });
    out.push({ x: FENCE.x, z: FENCE.z, color: '#b14dff', kind: 'shop', label: 'Fence' });
    out.push({ x: HIDEOUT.x, z: HIDEOUT.z, color: '#ff2fa0', kind: 'shop', label: 'Hideout' });
    if (this.heist && (this.heist.stage === 'approach' || this.heist.stage === 'infiltrate' || this.heist.stage === 'vault')) out.push({ x: HEIST_TARGET.x, z: HEIST_TARGET.z, color: '#ffd23f', kind: 'shop', label: 'Gold Coast Exchange' });
    return out;
  }

  // ------------------------------------------------------------------ frame

  update(dt: number, ctx: SystemContext): void {
    const w = ctx.world;
    const combat = this.combat;
    for (const s of this.stores) {
      const d = Math.hypot(w.player.position.x - s.def.x, w.player.position.z - s.def.z);
      if (d > 60 && !s.robbery.active) { s.shotsFrame = false; continue; }
      if (s.clerkDead) { s.clerk.update(dt, 0, POSE_IDLE); s.shotsFrame = false; continue; }
      _v.set(s.def.x, 1.3, s.def.z);
      const aiming = !!combat && !w.vehicle && combat.aimingAt(_v, 0.9, 10);
      if (d < 8 && !this.hintedStore.has(s.def.id) && combat && combat.arsenal.def.cls !== 'melee' && !s.robbery.active) {
        this.hintedStore.add(s.def.id);
        ctx.notify(`${s.def.name}: aim a gun at the clerk to rob the register.`, 'info');
      }
      const phase = s.robbery.update(dt, { aiming, dist: w.vehicle ? 99 : d, shots: s.shotsFrame });
      s.shotsFrame = false;
      s.bag.visible = phase === 'grab' || phase === 'filling';
      if (phase === 'filling') s.bag.scale.setScalar(0.4 + s.robbery.fill * 0.8);
      const scared = phase === 'intimidate' || phase === 'filling' || phase === 'grab';
      POSE_TMP.handsUp = scared ? 1 : 0;
      s.clerk.yawNode.rotation.y = scared ? Math.atan2(w.player.position.x - s.def.x, w.player.position.z - s.def.z) : s.def.yaw;
      s.clerk.update(dt, 0, POSE_TMP);
      if (phase === 'filling' && this.hud) this.showHud(`ROBBERY • keep the clerk scared • bag ${Math.round(s.robbery.fill * 100)}%`);
      else if (phase === 'grab') this.showHud('Grab the cash bag from the counter');
    }
    if (!this.stores.some((s) => s.robbery.phase === 'filling' || s.robbery.phase === 'grab') && !this.heist) this.showHud(null);
    this.updateChopShop(dt);
    this.updateHeist(dt);
  }

  private showHud(text: string | null): void {
    if (!this.hud) return;
    this.hud.style.display = text && !this.ctx.isBusy() ? 'block' : 'none';
    if (text && this.hud.textContent !== text) this.hud.textContent = text;
  }

  always(_dt: number, ctx: SystemContext): void {
    if (ctx.isBusy() && this.hud) this.hud.style.display = 'none';
  }

  /** START_ROBBERY: resolves true when the bag is grabbed. */
  waitRobbery(storeId: string): Promise<boolean> {
    const s = this.stores.find((x) => x.def.id === storeId) ?? this.stores[0];
    if (!s) return Promise.resolve(true);
    s.robbery.arm();
    s.clerkDead = false;
    s.clerk.rise();
    return new Promise((res) => s.waiters.push(res));
  }

  // ------------------------------------------------------------------ chop shop / fence / stash / containers

  private updateChopShop(dt: number): void {
    const w = this.ctx.world;
    const v = w.vehicle;
    this.chopCooldown -= dt;
    if (!v || this.chopCooldown > 0) { this.chopT = 0; return; }
    const inZone = Math.hypot(v.position.x - CHOP_SHOP.x, v.position.z - CHOP_SHOP.z) < 5;
    if (!inZone) { this.chopT = 0; return; }
    const stolen = this.police?.isStolen(v) ?? false;
    if (!stolen) {
      if (this.chopT === 0) this.ctx.notify('Chop shop: "That car\'s yours, legit. I only buy hot wheels."', 'info');
      this.chopT = 0.01;
      return;
    }
    if (Math.abs(v.speed) > 1) return;
    this.chopT += dt;
    if (this.chopT > 1.2) {
      this.chopT = 0;
      this.chopCooldown = 30;
      void this.offerChop(v);
    }
  }

  private async offerChop(v: Vehicle): Promise<void> {
    const ctx = this.ctx;
    const base = CHOP_VALUE[v.def.kind] ?? 700;
    const dmg = this.combat?.vehicleDisabledLevel(v) ?? 0;
    const price = Math.round(base * (1 - dmg * 0.6) * (1 + Math.min(0.3, this.rep / 300)));
    const ok = await this.confirm(`Chop shop`, `Sell the ${v.def.name} for $${price}?`);
    if (!ok) return;
    const w = ctx.world;
    w.exitVehicle();
    w.removeVehicle(v);
    ctx.addMoney(price);
    ctx.sfx('cash');
    ctx.notify(`Sold for [g]$${price}[/g]. It'll be parts by morning.`, 'money');
    this.addRep(3);
  }

  private confirm(title: string, text: string): Promise<boolean> {
    const ctx = this.ctx;
    return ctx.modal(() => new Promise<boolean>((resolve) => {
      const wrap = panel(ctx, title, '#ffd23f');
      const body = wrap.querySelector('.body') as HTMLElement;
      body.innerHTML = `<div style="font-size:18px;margin-bottom:12px">${text}</div>`;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px';
      const done = (v: boolean) => { window.removeEventListener('keydown', onKey, true); wrap.remove(); resolve(v); };
      row.append(button('Yes (E)', () => done(true)), button('No (Esc)', () => done(false), '#333'));
      body.append(row);
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
        if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      };
      window.addEventListener('keydown', onKey, true);
    }));
  }

  private async openFence(): Promise<void> {
    const ctx = this.ctx;
    const bonus = 1 + Math.min(0.25, this.rep / 400);
    await ctx.modal(() => new Promise<void>((resolve) => {
      const wrap = panel(ctx, 'The Fence', '#b14dff');
      const body = wrap.querySelector('.body') as HTMLElement;
      const close = () => { window.removeEventListener('keydown', onKey, true); wrap.remove(); this.persist(); resolve(); };
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
      window.addEventListener('keydown', onKey, true);
      const render = () => {
        body.innerHTML = `<div style="color:#aaa;font-size:13px;margin-bottom:10px">Criminal reputation ${this.rep} • price bonus +${Math.round((bonus - 1) * 100)}%</div>`;
        if (!this.loot.length) body.insertAdjacentHTML('beforeend', '<div style="margin-bottom:10px">"Nothing to sell? Come back with something shiny. The docks containers are full of it."</div>');
        for (const l of [...this.loot]) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:#16161e;padding:8px 10px;margin-bottom:6px';
          row.innerHTML = `<span>${l.name}</span>`;
          row.append(button(`Sell $${Math.round(l.value * bonus)}`, () => {
            this.loot.splice(this.loot.indexOf(l), 1);
            ctx.addMoney(Math.round(l.value * bonus));
            ctx.sfx('cash');
            this.addRep(1);
            render();
          }));
          body.append(row);
        }
        body.append(button('Leave (Esc)', close, '#333'));
      };
      render();
    }));
  }

  private async openStash(): Promise<void> {
    const ctx = this.ctx;
    await ctx.modal(() => new Promise<void>((resolve) => {
      const wrap = panel(ctx, 'Safehouse stash', '#ff2fa0');
      const body = wrap.querySelector('.body') as HTMLElement;
      const close = () => { window.removeEventListener('keydown', onKey, true); wrap.remove(); this.persist(); ctx.save(); resolve(); };
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
      window.addEventListener('keydown', onKey, true);
      const render = () => {
        body.innerHTML = `<div style="font-size:18px;margin-bottom:10px">In the stash: <b style="color:#72cc72">$${this.stash}</b> • On you: <b style="color:#72cc72">$${ctx.profile().credits}</b></div><div style="color:#aaa;font-size:13px;margin-bottom:10px">Cash in the stash can't be taken by fines or hospital bills.</div>`;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        for (const amt of [500, 2000]) {
          row.append(button(`Deposit $${amt}`, () => { if (ctx.addMoney(-amt)) { this.stash += amt; ctx.sfx('cash'); render(); } }));
        }
        row.append(button('Deposit all', () => { const c = ctx.profile().credits; if (c > 0 && ctx.addMoney(-c)) { this.stash += c; ctx.sfx('cash'); render(); } }));
        row.append(button('Withdraw all', () => { if (this.stash > 0) { ctx.addMoney(this.stash); this.stash = 0; ctx.sfx('cash'); render(); } }, '#2f5d8a'));
        row.append(button('Close (Esc)', close, '#333'));
        body.append(row);
      };
      render();
    }));
  }

  private async lootContainer(i: number): Promise<void> {
    const ctx = this.ctx;
    this.containerCooldown.set(i, performance.now() + 8 * 60 * 1000);
    const ok = await ctx.modal(() => crowbarQte(ctx));
    const c = CONTAINERS[i];
    if (ok) {
      const item = LOOT[Math.floor(Math.random() * LOOT.length)];
      if (Math.random() < 0.25) {
        const cash = 100 + Math.floor(Math.random() * 300);
        ctx.addMoney(cash);
        ctx.notify(`Cash box inside: [g]$${cash}[/g].`, 'money');
      } else {
        this.loot.push({ ...item });
        ctx.notify(`Looted: [y]${item.name}[/y]. Sell it to the fence at the market.`, 'good');
      }
      this.addRep(2);
      ctx.sfx('pickup');
    } else ctx.notify('The crowbar slipped. Lock is jammed.', 'warn');
    if (!ok || Math.random() < 0.3) {
      this.police?.reportCrime('trespass', c.x, c.z);
      if (Math.random() < 0.5) this.police?.reportCrime('vehicleTheft', c.x, c.z, { victimCop: true });
    }
  }

  // ------------------------------------------------------------------ heist

  private async openHeistBoard(): Promise<void> {
    const ctx = this.ctx;
    const plan = { ...this.plan };
    const start = await ctx.modal(() => new Promise<boolean>((resolve) => {
      const wrap = panel(ctx, 'The Neon Bay Score', '#ff2fa0', 820);
      const body = wrap.querySelector('.body') as HTMLElement;
      const close = (go: boolean) => { window.removeEventListener('keydown', onKey, true); wrap.remove(); resolve(go); };
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
      window.addEventListener('keydown', onKey, true);
      const render = () => {
        const pay = heistPayout(plan, false, this.rep);
        const car = getawayById(plan.getaway);
        body.innerHTML = `<div style="color:#aaa;font-size:13px;margin-bottom:10px">Target: <b style="color:#fff">Gold Coast Exchange</b>, downtown. Vault holds about $60,000 in bearer bonds. ${this.heistDone ? '<span style="color:#72cc72">You already pulled this off once. The vault restocks.</span>' : ''}</div>`;
        const section = (title: string) => { const h = document.createElement('div'); h.style.cssText = 'font:600 12px Oswald;letter-spacing:2px;color:#ff2fa0;margin:10px 0 6px'; h.textContent = title; body.append(h); };
        section('APPROACH');
        const ap = document.createElement('div');
        ap.style.cssText = 'display:flex;gap:6px';
        for (const a of ['stealth', 'loud'] as const) ap.append(button(a === 'stealth' ? 'Stealth: avoid the guards' : 'Loud: guns blazing', () => { plan.approach = a; render(); }, plan.approach === a ? '#ff2fa0' : '#222'));
        body.append(ap);
        for (const role of ['hacker', 'gunman', 'driver'] as const) {
          section(role.toUpperCase());
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
          for (const c of CREW.filter((m) => m.role === role)) {
            const b = button(`${c.name} (${Math.round(c.cut * 100)}% cut)`, () => { plan[role] = c.id; render(); }, plan[role] === c.id ? '#ff2fa0' : '#222');
            b.title = c.blurb;
            row.append(b);
            const tip = document.createElement('span');
            tip.style.cssText = 'font-size:11px;color:#888;align-self:center;margin-right:8px';
            tip.textContent = c.blurb;
            row.append(tip);
          }
          body.append(row);
        }
        section('GETAWAY VEHICLE');
        const gw = document.createElement('div');
        gw.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        for (const g of GETAWAYS) gw.append(button(`${g.name}${g.cost ? ` $${g.cost}` : ''}`, () => { plan.getaway = g.id; render(); }, plan.getaway === g.id ? '#ff2fa0' : '#222'));
        body.append(gw);
        const sum = document.createElement('div');
        sum.style.cssText = 'margin-top:14px;padding:10px;background:#16161e;font-size:14px';
        sum.innerHTML = `Vault time ${Math.round(vaultTime(plan))}s • Guards ${guardCount(plan)} • Expected heat ${escapeStars(plan, false)}★<br>Estimated take <b style="color:#72cc72">$${pay.gross}</b> − crew $${pay.cuts} = <b style="color:#72cc72">$${pay.net}</b>${car?.cost ? ` • car $${car.cost}` : ''}`;
        body.append(sum);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;margin-top:12px';
        row.append(button('Start the heist', () => {
          const cost = car?.cost ?? 0;
          if (cost && !ctx.addMoney(-cost)) { ctx.notify('Not enough cash for that car.', 'warn'); return; }
          close(true);
        }), button('Close (Esc)', () => close(false), '#333'));
        body.append(row);
      };
      render();
    }));
    this.plan = plan;
    this.persist();
    if (start) this.startHeist(plan);
  }

  private startHeist(plan: HeistPlan): void {
    const ctx = this.ctx;
    const car = getawayById(plan.getaway);
    const v = ctx.world.spawnVehicle(car?.kind ?? 'sedan', HIDEOUT.x + 6, HIDEOUT.z, 0);
    this.heist = { plan, stage: 'approach', guards: [], detected: false, progress: 0, car: v, markerId: 'crime-heist-target' };
    ctx.markers.addCheckpoint('crime-heist-target', HEIST_TARGET.x, HEIST_TARGET.z, 3, '#ff2fa0');
    ctx.notify(`The Neon Bay Score is on. ${crewById(plan.driver)?.name ?? 'Your driver'} left the getaway car outside. Head to the Gold Coast Exchange.`, 'good');
    ctx.sfx('alert');
  }

  private updateHeist(dt: number): void {
    const h = this.heist;
    if (!h) return;
    const ctx = this.ctx;
    const w = ctx.world;
    const combat = this.combat;
    const p = w.player;
    if (p.health <= 0) { this.endHeist(false, 'Heist failed: you were taken down.'); return; }
    const dTarget = Math.hypot(p.position.x - HEIST_TARGET.x, p.position.z - HEIST_TARGET.z);
    switch (h.stage) {
      case 'approach':
        this.showHud('HEIST • Go to the Gold Coast Exchange');
        if (dTarget < 60) {
          h.stage = 'infiltrate';
          const n = guardCount(h.plan);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const e = combat?.spawnEnemy('guard', HEIST_TARGET.x + Math.cos(a) * 9, HEIST_TARGET.z + Math.sin(a) * 9, a, { mission: true });
            if (e) { if (h.plan.approach === 'loud') e.alertTo(p.position.x, p.position.z); h.guards.push(e); }
          }
          ctx.notify(h.plan.approach === 'stealth' ? 'Guards on patrol. Stay out of their sight cones: crouch, take them down from behind.' : 'Going loud. Take cover and clear the guards!', 'info');
        }
        break;
      case 'infiltrate':
      case 'vault': {
        if (!h.detected && h.guards.some((g) => g.brain.hostile && !g.neutralized)) {
          h.detected = true;
          if (h.plan.approach === 'stealth') ctx.notify('[r]You\'ve been spotted![/r] The take just got smaller.', 'warn');
        }
        if (h.stage === 'infiltrate') {
          this.showHud(`HEIST • Reach the vault${h.plan.approach === 'stealth' ? (h.detected ? ' • DETECTED' : ' • undetected') : ''}`);
          if (dTarget < 3) { h.stage = 'vault'; h.progress = 0; ctx.notify(h.plan.approach === 'stealth' ? `${crewById(h.plan.hacker)?.name} is cracking the keypad. Stay close.` : 'Drill is running. Hold the vault!', 'info'); }
        } else {
          const t = vaultTime(h.plan);
          if (dTarget < 4) h.progress += dt / t;
          this.showHud(`HEIST • Vault ${Math.round(h.progress * 100)}% • stay within the circle`);
          if (h.progress >= 1) {
            h.stage = 'escape';
            ctx.markers.removeCheckpoint('crime-heist-target');
            ctx.markers.addCheckpoint('crime-heist-home', HIDEOUT.x, HIDEOUT.z, 3, '#ff2fa0');
            this.police?.setWanted(escapeStars(h.plan, h.detected));
            ctx.notify('Got the bonds! Get to the getaway car, lose the cops and bring it home to the hideout.', 'good');
            ctx.sfx('cash');
          }
        }
        break;
      }
      case 'escape': {
        const stars = this.police?.stars ?? 0;
        const dHome = Math.hypot(p.position.x - HIDEOUT.x, p.position.z - HIDEOUT.z);
        this.showHud(stars > 0 ? `HEIST • Lose the cops (${stars}★)` : 'HEIST • Bring the bonds to the hideout');
        if (stars === 0 && dHome < 6) {
          const pay = heistPayout(h.plan, h.detected, this.rep);
          ctx.addMoney(pay.net);
          this.heistDone = true;
          this.addRep(25);
          this.endHeist(true, `Score complete: $${pay.gross} take, crew cut $${pay.cuts}. You keep [g]$${pay.net}[/g].`);
        }
        break;
      }
      default:
        break;
    }
  }

  private endHeist(ok: boolean, msg: string): void {
    const h = this.heist;
    if (!h) return;
    this.heist = null;
    const ctx = this.ctx;
    ctx.markers.removeCheckpoint('crime-heist-target');
    ctx.markers.removeCheckpoint('crime-heist-home');
    for (const g of h.guards) setTimeout(() => this.combat?.enemies.remove(g), 20000);
    ctx.notify(msg, ok ? 'money' : 'warn');
    ctx.sfx(ok ? 'passed' : 'failed');
    this.combat?.hud?.banner(ok ? 'SCORE COMPLETE' : 'HEIST FAILED', '', !ok, 3000);
    this.showHud(null);
    this.persist();
  }
}

const POSE_IDLE = emptyPose();
const POSE_TMP = emptyPose();

function panel(ctx: SystemContext, title: string, color: string, width = 560): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;pointer-events:auto;z-index:40;font-family:Oswald,sans-serif';
  wrap.innerHTML = `<div style="width:min(${width}px,94vw);max-height:88vh;overflow:auto;background:#0d0d12;border-top:4px solid ${color};color:#fff;padding:18px 22px"><div style="font:400 32px Anton,Oswald,sans-serif;letter-spacing:2px;color:${color};margin-bottom:6px">${title.toUpperCase()}</div><div class="body"></div></div>`;
  (ctx.hudRoot.parentElement ?? document.body).append(wrap);
  return wrap;
}

function button(text: string, on: () => void, bg = '#ff2fa0'): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = `background:${bg};color:#fff;border:0;padding:7px 12px;font:600 13px Oswald,sans-serif;letter-spacing:1px;cursor:pointer`;
  b.onclick = on;
  return b;
}

/** Crowbar QTE: press the shown keys in order before the bar runs out. */
function crowbarQte(ctx: SystemContext): Promise<boolean> {
  return new Promise((resolve) => {
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    const seq = Array.from({ length: 5 }, () => keys[Math.floor(Math.random() * 4)]);
    let i = 0;
    const wrap = panel(ctx, 'Crowbar', '#ffd23f', 460);
    const body = wrap.querySelector('.body') as HTMLElement;
    body.innerHTML = '<div style="color:#aaa;font-size:13px;margin-bottom:10px">Press the keys in order to pop the lock.</div><div class="seq" style="display:flex;gap:8px;font:400 34px Anton,sans-serif"></div><div style="height:8px;background:#222;margin-top:14px"><div class="bar" style="height:100%;background:#ffd23f;width:100%"></div></div>';
    const seqEl = body.querySelector('.seq') as HTMLElement;
    const bar = body.querySelector('.bar') as HTMLElement;
    const draw = () => {
      seqEl.innerHTML = seq.map((k, j) => `<span style="padding:4px 12px;background:${j < i ? '#3a7d44' : j === i ? '#ffd23f' : '#222'};color:${j === i ? '#000' : '#fff'}">${k.slice(3)}</span>`).join('');
    };
    draw();
    const total = 4200;
    const t0 = performance.now();
    const timer = setInterval(() => {
      const left = 1 - (performance.now() - t0) / total;
      bar.style.width = `${Math.max(0, left) * 100}%`;
      if (left <= 0) done(false);
    }, 50);
    const done = (ok: boolean) => { clearInterval(timer); window.removeEventListener('keydown', onKey, true); wrap.remove(); resolve(ok); };
    const onKey = (e: KeyboardEvent) => {
      if (!keys.includes(e.code) && e.code !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') { done(false); return; }
      if (e.code === seq[i]) { i++; COMBAT_AUDIO.play('empty'); draw(); if (i >= seq.length) { COMBAT_AUDIO.play('punch'); done(true); } }
      else done(false);
    };
    window.addEventListener('keydown', onKey, true);
  });
}
