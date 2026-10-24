import * as THREE from 'three';
import type { SystemContext } from '../../game/Systems';
import type { CombatSystem } from './system';
import { FIREARMS, UPGRADES, WEAPONS, WEAPON_IDS, isFirearm, type UpgradeId, type WeaponId } from './weapons';
import { weaponIcon } from './hud';
import type { Shootable } from './trace';
import type { Enemy } from './enemies';
import { COMBAT_AUDIO } from './audio';

// Ammu-Bay gun shop, the Ammu-Bay shooting range minigame and the Industrial
// Zone fight club (cage fights with rising difficulty and bets).

export const AMMU_BAY = { x: 14, z: -118 };
export const RANGE = { x: -62, z: 192 };
export const FIGHT_CLUB = { x: -215, z: 196 };

const ARMOR_PRICE = 250;

export function neonSign(text: string, color: string, sub = ''): THREE.Group {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(10,8,20,0.92)';
    g.fillRect(0, 0, 512, 160);
    g.strokeStyle = color; g.lineWidth = 8; g.strokeRect(8, 8, 496, 144);
    g.font = '700 72px Anton, Oswald, Impact, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color;
    g.fillText(text, 256, sub ? 66 : 82);
    if (sub) { g.font = '600 30px Oswald, sans-serif'; g.shadowBlur = 8; g.fillStyle = '#ffffff'; g.fillText(sub, 256, 126); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.12), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  board.position.y = 3.6;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.1, 8), new THREE.MeshStandardMaterial({ color: '#333' }));
  pole.position.y = 1.55;
  grp.add(board, pole);
  return grp;
}

interface RangeTarget extends Shootable { mesh: THREE.Group; up: number; hitT: number; live: boolean; t: number }

const targetGeo = new THREE.BoxGeometry(0.62, 1.2, 0.05);
const targetMat = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.8 });
const ringMat = new THREE.MeshBasicMaterial({ color: '#e0453a' });
const ringGeo = new THREE.RingGeometry(0.1, 0.2, 20);
const legGeo = new THREE.BoxGeometry(0.06, 0.8, 0.06);

export class CombatActivities {
  private ctx!: SystemContext;
  private built = false;
  private range: { targets: RangeTarget[]; time: number; score: number; hits: number; shots: number; spawnT: number; dir: THREE.Vector3; spots: THREE.Vector3[]; rental: boolean; shotsBefore: number } | null = null;
  private fight: { tier: number; bet: number; enemies: Enemy[]; t: number } | null = null;
  private ringGroup: THREE.Group | null = null;
  private timerEl: HTMLElement | null = null;

  constructor(private combat: CombatSystem) {}

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    if (this.built) return;
    this.built = true;
    const add = (g: THREE.Object3D, x: number, z: number, yaw = 0) => { g.position.set(x, 0, z); g.rotation.y = yaw; ctx.scene.add(g); };
    add(neonSign('AMMU-BAY', '#ff4d6d', 'GUNS • AMMO • ARMOR'), AMMU_BAY.x + 2.2, AMMU_BAY.z, Math.PI / 2);
    add(neonSign('RANGE', '#ffd23f', 'AMMU-BAY TRAINING'), RANGE.x - 2, RANGE.z - 2);
    add(neonSign('FIGHT CLUB', '#ff8a3d', 'BETS WELCOME'), FIGHT_CLUB.x, FIGHT_CLUB.z - 6.5);
    this.ringGroup = this.buildRing();
    add(this.ringGroup, FIGHT_CLUB.x, FIGHT_CLUB.z);
    ctx.interactions.set({ id: 'combat-ammubay', x: AMMU_BAY.x, z: AMMU_BAY.z, radius: 3.5, title: 'Ammu-Bay', desc: 'Guns, ammo, armor and upgrades', action: () => void this.openShop() });
    ctx.interactions.set({ id: 'combat-range', x: RANGE.x, z: RANGE.z, radius: 3.5, title: 'Shooting range', desc: 'Pop-up targets, 45 seconds. Earn medals.', enabled: () => !this.range && !this.fight, action: () => this.startRange() });
    ctx.interactions.set({ id: 'combat-fight', x: FIGHT_CLUB.x, z: FIGHT_CLUB.z - 4.5, radius: 3.5, title: 'Fight club', desc: 'Bare-knuckle cage fights. Place a bet.', enabled: () => !this.fight && !this.range, action: () => void this.openFightMenu() });
  }

  blips(): { x: number; z: number; color: string; kind: 'shop'; label: string }[] {
    return [
      { x: AMMU_BAY.x, z: AMMU_BAY.z, color: '#ff4d6d', kind: 'shop', label: 'Ammu-Bay' },
      { x: RANGE.x, z: RANGE.z, color: '#ffd23f', kind: 'shop', label: 'Shooting range' },
      { x: FIGHT_CLUB.x, z: FIGHT_CLUB.z, color: '#ff8a3d', kind: 'shop', label: 'Fight club' },
    ];
  }

  private buildRing(): THREE.Group {
    const g = new THREE.Group();
    const post = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: '#c94f3d' });
    const rope = new THREE.MeshStandardMaterial({ color: '#f4f4f4', emissive: '#331111' });
    const s = 3.6;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(s * 2, 0.12, s * 2), new THREE.MeshStandardMaterial({ color: '#2b3a55', roughness: 0.9 }));
    floor.position.y = 0.06;
    floor.receiveShadow = true;
    g.add(floor);
    for (const [x, z] of [[-s, -s], [s, -s], [s, s], [-s, s]]) {
      const p = new THREE.Mesh(post, postMat);
      p.position.set(x, 0.8, z);
      g.add(p);
    }
    for (let i = 0; i < 4; i++) {
      for (const h of [0.6, 1.0, 1.4]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(s * 2, 0.04, 0.04), rope);
        const a = (i * Math.PI) / 2;
        r.position.set(Math.sin(a) * s, h, Math.cos(a) * s);
        r.rotation.y = a + Math.PI / 2;
        g.add(r);
      }
    }
    return g;
  }

  // ------------------------------------------------------------------ shop

  private async openShop(): Promise<void> {
    const ctx = this.ctx;
    const c = this.combat;
    await ctx.modal(() => new Promise<void>((resolve) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;pointer-events:auto;z-index:40;font-family:Oswald,sans-serif';
      const box = document.createElement('div');
      box.style.cssText = 'width:min(900px,96vw);max-height:86vh;overflow:auto;background:#0d0d12;border-top:4px solid #ff4d6d;color:#fff;padding:18px 22px;box-shadow:0 20px 60px rgba(0,0,0,.6)';
      wrap.append(box);
      (ctx.hudRoot.parentElement ?? document.body).append(wrap);
      let tab: 'weapons' | 'ammo' | 'upgrades' | 'armor' = 'weapons';
      let sel: WeaponId = FIREARMS.find((w) => c.arsenal.has(w)) ?? 'pistol';
      const close = () => { window.removeEventListener('keydown', onKey, true); wrap.remove(); c.persist(); ctx.save(); resolve(); };
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
      window.addEventListener('keydown', onKey, true);
      const buy = (price: number, what: () => boolean, label: string) => {
        if (!ctx.addMoney(-price)) { ctx.sfx('bad'); ctx.notify('Not enough cash.', 'warn'); return; }
        if (!what()) { ctx.addMoney(price); ctx.sfx('bad'); return; }
        ctx.sfx('cash');
        COMBAT_AUDIO.play('reload');
        ctx.notify(`Bought [y]${label}[/y] for $${price}.`, 'money');
        render();
      };
      const btn = (text: string, on: () => void, disabled = false) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.disabled = disabled;
        b.style.cssText = `background:${disabled ? '#333' : '#ff4d6d'};color:#fff;border:0;padding:6px 12px;font:600 13px Oswald,sans-serif;letter-spacing:1px;cursor:${disabled ? 'default' : 'pointer'};opacity:${disabled ? 0.5 : 1}`;
        b.onclick = on;
        return b;
      };
      const render = () => {
        box.innerHTML = '';
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px';
        head.innerHTML = `<div><div style="font:400 38px Anton,Oswald,sans-serif;letter-spacing:2px;color:#ff4d6d">AMMU-BAY</div><div style="color:#aaa;font-size:13px">Licensed dealer • Neon Bay since 1981 • Esc to leave</div></div><div style="font:400 30px Anton,sans-serif;color:#72cc72">$${ctx.profile().credits}</div>`;
        box.append(head);
        const tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;gap:6px;margin-bottom:12px';
        for (const t of ['weapons', 'ammo', 'upgrades', 'armor'] as const) {
          const b = btn(t.toUpperCase(), () => { tab = t; render(); });
          b.style.background = tab === t ? '#ff4d6d' : '#222';
          tabs.append(b);
        }
        box.append(tabs);
        const list = document.createElement('div');
        list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px';
        const card = (icon: string, title: string, desc: string, action: HTMLElement) => {
          const d = document.createElement('div');
          d.style.cssText = 'background:#16161e;padding:10px 12px;display:flex;flex-direction:column;gap:6px';
          d.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><div style="width:80px;fill:#fff">${icon}</div><div><div style="font-size:16px">${title}</div><div style="font-size:12px;color:#aaa">${desc}</div></div></div>`;
          d.append(action);
          list.append(d);
        };
        if (tab === 'weapons') {
          for (const id of WEAPON_IDS) {
            if (id === 'fists') continue;
            const d = WEAPONS[id];
            const owned = c.arsenal.has(id);
            card(weaponIcon(id), d.name, `${d.blurb} DMG ${d.damage}${d.pellets > 1 ? `×${d.pellets}` : ''} • ${d.cls === 'melee' ? 'melee' : `${d.magSize} rd mag`}`,
              btn(owned ? 'OWNED' : `BUY $${d.price}`, () => buy(d.price, () => { c.giveWeapon(id, d.magSize * 3); return true; }, d.name), owned));
          }
        } else if (tab === 'ammo') {
          for (const id of WEAPON_IDS) {
            const d = WEAPONS[id];
            if (!isFirearm(id) || !c.arsenal.has(id)) continue;
            const full = c.arsenal.state && (c.arsenal.owned.get(id)?.reserve ?? 0) >= d.reserveMax;
            card(weaponIcon(id), d.name, `${c.arsenal.totalAmmo(id)} rounds carried (max ${d.reserveMax + d.magSize})`,
              btn(full ? 'FULL' : `+${d.magSize} RDS $${d.ammoPrice}`, () => buy(d.ammoPrice, () => c.arsenal.addAmmo(id, d.magSize) > 0, `${d.name} ammo`), full));
          }
          if (!list.children.length) list.innerHTML = '<div style="color:#aaa">Buy a gun first.</div>';
        } else if (tab === 'upgrades') {
          const guns = WEAPON_IDS.filter((id) => isFirearm(id) && id !== 'taser' && c.arsenal.has(id));
          if (!guns.length) list.innerHTML = '<div style="color:#aaa">Buy a gun first.</div>';
          else {
            if (!guns.includes(sel)) sel = guns[0];
            const pick = document.createElement('div');
            pick.style.cssText = 'grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap';
            for (const g of guns) { const b = btn(WEAPONS[g].name, () => { sel = g; render(); }); b.style.background = g === sel ? '#ff4d6d' : '#222'; pick.append(b); }
            list.append(pick);
            for (const u of Object.keys(UPGRADES) as UpgradeId[]) {
              const def = UPGRADES[u];
              const has = c.arsenal.hasUpgrade(sel, u);
              const na = (u === 'suppressor' && sel === 'shotgun') || (u === 'scope' && sel === 'sniper');
              card('', `${def.name} — ${WEAPONS[sel].name}`, def.desc, btn(na ? 'N/A' : has ? 'INSTALLED' : `BUY $${def.price}`, () => buy(def.price, () => c.arsenal.addUpgrade(sel, u), def.name), has || na));
            }
          }
        } else {
          card('', 'Body Armor', `Soaks most bullet damage. Current: ${Math.round(c.armor)}%`, btn(c.armor >= 100 ? 'FULL' : `BUY $${ARMOR_PRICE}`, () => buy(ARMOR_PRICE, () => { c.armor = 100; return true; }, 'Body Armor'), c.armor >= 100));
          card('', 'Concealed carry tip', 'Pistols and the stun gun stay under your shirt. Rifles, SMGs and shotguns drawn in public make police nervous (open carry).', document.createElement('div'));
        }
        box.append(list);
        const foot = document.createElement('div');
        foot.style.cssText = 'margin-top:14px;display:flex;justify-content:flex-end';
        foot.append(btn('LEAVE (ESC)', close));
        box.append(foot);
      };
      render();
    }));
  }

  // ------------------------------------------------------------------ range

  private startRange(): void {
    const ctx = this.ctx;
    const c = this.combat;
    const w = ctx.world;
    if (w.vehicle) return;
    let rental = false;
    if (!FIREARMS.some((id) => c.arsenal.has(id) && c.arsenal.totalAmmo(id) > 0)) {
      c.arsenal.give('pistol', 60);
      rental = true;
      ctx.notify('Range rental: a pistol with 60 rounds. Return it when you\'re done.', 'info');
    }
    const cur = c.arsenal.active;
    if (!isFirearm(cur) || cur === 'taser') {
      const best = FIREARMS.find((id) => c.arsenal.has(id) && c.arsenal.totalAmmo(id) > 0);
      if (best) c.arsenal.select(best);
    }
    // pick the most open direction from the stand
    const col = w.city.collision;
    let bestDir = new THREE.Vector3(1, 0, 0), bestSpots: THREE.Vector3[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const spots: THREE.Vector3[] = [];
      for (let i = 0; i < 24; i++) {
        const ang = a + ((i % 6) / 5 - 0.5) * 1.1;
        const dist = 8 + Math.floor(i / 6) * 6;
        const x = RANGE.x + Math.sin(ang) * dist, z = RANGE.z + Math.cos(ang) * dist;
        const dx = x - RANGE.x, dz = z - RANGE.z, len = Math.hypot(dx, dz);
        const t = col.raycast(RANGE.x, 1.3, RANGE.z, dx / len, 0, dz / len, len);
        if (t < len - 0.5 || col.groundHeight(x, z, 3) > 0.5 || x > 236 || z > 210) continue;
        spots.push(new THREE.Vector3(x, 0, z));
      }
      if (spots.length > bestSpots.length) { bestSpots = spots; bestDir = dir; }
    }
    if (bestSpots.length < 4) { ctx.notify('The range is blocked right now. Try again later.', 'warn'); return; }
    w.player.place(RANGE.x, RANGE.z, Math.atan2(bestDir.x, bestDir.z));
    w.rig.snapTo(w.player.position, Math.atan2(bestDir.x, bestDir.z) + Math.PI);
    w.rig.yaw = Math.atan2(bestDir.x, bestDir.z) + Math.PI;
    this.range = { targets: [], time: 45, score: 0, hits: 0, shots: 0, spawnT: 0.8, dir: bestDir, spots: bestSpots, rental, shotsBefore: 0 };
    this.timerEl = document.createElement('div');
    this.timerEl.style.cssText = 'position:absolute;right:24px;bottom:120px;background:rgba(0,0,0,.6);color:#fff;padding:8px 14px;font:400 24px Anton,Oswald,sans-serif;letter-spacing:1px;pointer-events:none';
    ctx.hudRoot.append(this.timerEl);
    ctx.notify('Shooting range: hit the pop-up targets. Center hits score more. Aim with right mouse.', 'info');
    COMBAT_AUDIO.play('reload');
  }

  private spawnTarget(): void {
    const r = this.range;
    if (!r) return;
    const free = r.spots.filter((s) => !r.targets.some((t) => t.live && t.pos.distanceTo(s) < 1));
    if (!free.length) return;
    const pos = free[Math.floor(Math.random() * free.length)].clone();
    const mesh = new THREE.Group();
    const board = new THREE.Mesh(targetGeo, targetMat);
    board.position.y = 1.1;
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 1.3, 0.03);
    const ring2 = ring.clone();
    ring2.rotation.y = Math.PI;
    ring2.position.z = -0.03;
    const leg = new THREE.Mesh(legGeo, targetMat);
    leg.position.y = 0.4;
    mesh.add(board, ring, ring2, leg);
    mesh.position.copy(pos);
    mesh.rotation.y = Math.atan2(RANGE.x - pos.x, RANGE.z - pos.z);
    mesh.scale.y = 0.01;
    this.ctx.scene.add(mesh);
    const self = this;
    const t: RangeTarget = {
      pos, height: 1.15, radius: 0.42, tag: 'range', mesh, up: 0, hitT: 0, live: true, t: 3.2 + Math.random() * 1.5,
      alive: () => t.live && t.up > 0.6,
      onHit(_d, _l, point) {
        if (!t.live) return;
        t.live = false;
        const center = Math.abs(point.y - (pos.y + 1.3));
        const pts = center < 0.12 ? 150 : center < 0.3 ? 100 : 60;
        if (self.range) { self.range.score += pts; self.range.hits++; }
        self.ctx.notify(`+${pts}`, 'xp');
        COMBAT_AUDIO.play('hit');
      },
    };
    r.targets.push(t);
    this.combat.addShootable(t);
  }

  private endRange(): void {
    const r = this.range;
    if (!r) return;
    const ctx = this.ctx;
    for (const t of r.targets) { this.combat.removeShootable(t); t.mesh.removeFromParent(); }
    this.timerEl?.remove();
    this.timerEl = null;
    this.range = null;
    const medal = r.score >= 2600 ? 'GOLD' : r.score >= 1800 ? 'SILVER' : r.score >= 1000 ? 'BRONZE' : null;
    const prize = medal === 'GOLD' ? 600 : medal === 'SILVER' ? 300 : medal === 'BRONZE' ? 120 : 0;
    const best = this.combat.rangeBest;
    if (r.score > best) this.combat.rangeBest = r.score;
    if (prize && r.score > best) ctx.addMoney(prize);
    this.combat.hud?.banner(medal ? `${medal} MEDAL` : 'RANGE OVER', `Score ${r.score} • ${r.hits} hits${prize && r.score > best ? ` • +$${prize}` : ''} • Best ${Math.max(best, r.score)}`, !medal, 3500);
    ctx.sfx(medal ? 'passed' : 'failed');
    if (r.rental) { this.combat.arsenal.owned.delete('pistol'); if (this.combat.arsenal.current === 'pistol') this.combat.arsenal.current = 'fists'; }
    this.combat.persist();
  }

  // ------------------------------------------------------------------ fight club

  private async openFightMenu(): Promise<void> {
    const ctx = this.ctx;
    const tiers = ['Rookie: "Soft Serve" Sal', 'Contender: Marisa "Riptide" Cruz', 'Bruiser: Big Tuna', 'Champion: "The Crane"', 'Gauntlet: two at once'];
    const unlocked = Math.min(tiers.length, 1 + this.combat.arenaWins);
    const choice = await ctx.modal(() => new Promise<{ tier: number; bet: number } | null>((resolve) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;pointer-events:auto;z-index:40;font-family:Oswald,sans-serif';
      const box = document.createElement('div');
      box.style.cssText = 'width:min(560px,94vw);background:#0d0d12;border-top:4px solid #ff8a3d;color:#fff;padding:18px 22px';
      box.innerHTML = '<div style="font:400 34px Anton,Oswald,sans-serif;color:#ff8a3d;letter-spacing:2px">FIGHT CLUB</div><div style="color:#aaa;font-size:13px;margin-bottom:10px">Fists only. Left mouse punches (combo: jab, cross, kick). Hold right mouse to block. Win to unlock the next fighter. Esc to leave.</div>';
      let bet = 100;
      const betRow = document.createElement('div');
      betRow.style.cssText = 'display:flex;gap:6px;margin:8px 0 12px;align-items:center';
      const renderBet = () => {
        betRow.innerHTML = '<span style="color:#aaa;margin-right:6px">BET</span>';
        for (const b of [0, 50, 100, 250, 500, 1000]) {
          const e = document.createElement('button');
          e.textContent = b ? `$${b}` : 'none';
          e.style.cssText = `background:${b === bet ? '#ff8a3d' : '#222'};color:#fff;border:0;padding:5px 10px;font:600 13px Oswald;cursor:pointer`;
          e.onclick = () => { bet = b; renderBet(); };
          betRow.append(e);
        }
      };
      renderBet();
      box.append(betRow);
      tiers.forEach((name, i) => {
        const e = document.createElement('button');
        const locked = i >= unlocked;
        e.textContent = `${i + 1}. ${name}${locked ? '  (locked)' : `  — pays ${i + 2}x`}`;
        e.disabled = locked;
        e.style.cssText = `display:block;width:100%;text-align:left;margin-bottom:6px;background:${locked ? '#151515' : '#1d1d26'};color:${locked ? '#666' : '#fff'};border:0;padding:10px 12px;font:400 16px Oswald;cursor:${locked ? 'default' : 'pointer'}`;
        e.onclick = () => {
          if (bet > 0 && ctx.profile().credits < bet) { ctx.notify('Not enough cash for that bet.', 'warn'); return; }
          done({ tier: i, bet });
        };
        box.append(e);
      });
      const done = (v: { tier: number; bet: number } | null) => { window.removeEventListener('keydown', onKey, true); wrap.remove(); resolve(v); };
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
      window.addEventListener('keydown', onKey, true);
      wrap.append(box);
      (ctx.hudRoot.parentElement ?? document.body).append(wrap);
    }));
    if (choice) this.startFight(choice.tier, choice.bet);
  }

  private startFight(tier: number, bet: number): void {
    const ctx = this.ctx;
    const c = this.combat;
    const w = ctx.world;
    if (bet > 0 && !ctx.addMoney(-bet)) return;
    if (!c.arsenal.holstered) c.arsenal.holster();
    w.player.place(FIGHT_CLUB.x, FIGHT_CLUB.z - 2, 0);
    w.rig.snapTo(w.player.position, Math.PI);
    w.rig.yaw = Math.PI;
    w.player.health = Math.max(w.player.health, w.player.maxHealth);
    const n = tier === 4 ? 2 : 1;
    const enemies: Enemy[] = [];
    for (let i = 0; i < n; i++) {
      const e = c.spawnEnemy('fighter', FIGHT_CLUB.x + (i ? 1.5 : 0), FIGHT_CLUB.z + 2, Math.PI, { mission: true });
      if (!e) continue;
      const k = tier === 4 ? 3 : tier;
      e.health = 70 + k * 40;
      e.brain.tune.noticeTime = 0.05;
      e.fireCd = 1.2;
      e.alertTo(w.player.position.x, w.player.position.z);
      enemies.push(e);
    }
    this.fight = { tier, bet, enemies, t: 0 };
    c.hud?.banner('FIGHT!', tiers()[tier] ?? '', false, 1500);
    ctx.sfx('alert');
  }

  private endFight(won: boolean): void {
    const f = this.fight;
    if (!f) return;
    this.fight = null;
    const ctx = this.ctx;
    const c = this.combat;
    for (const e of f.enemies) setTimeout(() => c.enemies.remove(e), won ? 6000 : 500);
    if (won) {
      const pay = f.bet * (f.tier + 2);
      if (pay) ctx.addMoney(pay);
      if (f.tier >= c.arenaWins) c.arenaWins = Math.min(5, f.tier + 1);
      c.hud?.banner('WINNER', pay ? `+$${pay}` : 'Next fighter unlocked', false, 3000);
      ctx.sfx('passed');
    } else {
      c.hud?.banner('KNOCKED OUT', f.bet ? `Lost $${f.bet}` : 'Shake it off', true, 3000);
      ctx.world.player.health = Math.max(ctx.world.player.health, 40);
      ctx.sfx('failed');
    }
    c.persist();
  }

  update(dt: number): void {
    const r = this.range;
    const ctx = this.ctx;
    if (r) {
      r.time -= dt;
      r.spawnT -= dt;
      if (r.spawnT <= 0) { r.spawnT = 0.7 + Math.random() * 0.6; if (r.targets.filter((t) => t.live).length < 3) this.spawnTarget(); }
      for (const t of r.targets) {
        t.t -= dt;
        if (t.live && t.t <= 0) t.live = false;
        t.up += ((t.live ? 1 : 0) - t.up) * Math.min(1, dt * 10);
        t.mesh.scale.y = Math.max(0.01, t.up);
        if (!t.live && t.up < 0.03 && t.mesh.parent) { t.mesh.removeFromParent(); this.combat.removeShootable(t); }
      }
      r.targets = r.targets.filter((t) => t.mesh.parent || t.live);
      if (this.timerEl) this.timerEl.textContent = `RANGE  ${Math.max(0, Math.ceil(r.time))}s   SCORE ${r.score}`;
      const away = ctx.world.player.position.distanceTo(new THREE.Vector3(RANGE.x, ctx.world.player.position.y, RANGE.z)) > 8;
      if (r.time <= 0 || away || ctx.world.vehicle) this.endRange();
    }
    const f = this.fight;
    if (f) {
      f.t += dt;
      const p = ctx.world.player;
      const out = Math.abs(p.position.x - FIGHT_CLUB.x) > 7 || Math.abs(p.position.z - FIGHT_CLUB.z) > 7;
      if (f.enemies.every((e) => e.neutralized)) this.endFight(true);
      else if (p.health < 18 || out || ctx.world.vehicle) this.endFight(false);
      else if (this.combat.arsenal.active !== 'fists') this.combat.arsenal.holstered = true;
    }
  }

  get busy(): boolean { return !!this.range || !!this.fight; }
}

function tiers(): string[] {
  return ['"Soft Serve" Sal', 'Marisa "Riptide" Cruz', 'Big Tuna', '"The Crane"', 'The Gauntlet'];
}
