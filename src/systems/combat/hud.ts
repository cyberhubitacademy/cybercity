import { WEAPONS, type WeaponId } from './weapons';

// GTA V-style combat HUD: weapon + ammo (top-right under the money), dynamic
// crosshair with hit markers, damage direction arcs, armor and Focus bars
// under the radar, red hurt vignette, scope overlay and the weapon wheel.

const CSS = `
.cbt-hud { position:absolute; inset:0; pointer-events:none; font-family:'Oswald',sans-serif; }
.cbt-hide { display:none !important; }
.cbt-weapon { position:absolute; right:24px; top:150px; display:flex; align-items:center; gap:10px; background:rgba(0,0,0,.55); padding:6px 12px 6px 8px; border-radius:2px; transition:opacity .25s; }
.cbt-weapon svg { width:86px; height:34px; fill:#fff; filter:drop-shadow(1px 1px 0 #000); }
.cbt-weapon .ammo { font:400 30px/1 'Anton','Oswald',Impact,sans-serif; color:#fff; letter-spacing:1px; text-shadow:2px 2px 0 #000; min-width:84px; text-align:right; }
.cbt-weapon .ammo small { font:500 15px 'Oswald',sans-serif; color:#cfcfcf; margin-left:4px; }
.cbt-weapon .name { position:absolute; right:12px; top:-17px; font:600 11px 'Oswald',sans-serif; letter-spacing:2px; color:#f0c850; text-transform:uppercase; text-shadow:1px 1px 0 #000; }
.cbt-weapon .reload { position:absolute; left:0; bottom:0; height:3px; background:#f0c850; width:0; }
.cbt-weapon.low .ammo { color:#e0453a; }
.cbt-cross { position:absolute; left:50%; top:50%; width:0; height:0; }
.cbt-cross i { position:absolute; background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.6); }
.cbt-cross i.h { width:12px; height:3px; top:-1.5px; } .cbt-cross i.v { width:3px; height:12px; left:-1.5px; }
.cbt-cross .dot { position:absolute; width:5px; height:5px; left:-2.5px; top:-2.5px; border-radius:50%; background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.85); }
.cbt-cross.hostile i, .cbt-cross.hostile .dot { background:#e0453a; }
.cbt-cross.melee i { display:none; }
.cbt-hit { position:absolute; left:50%; top:50%; width:26px; height:26px; margin:-13px 0 0 -13px; opacity:0; }
.cbt-hit::before, .cbt-hit::after { content:''; position:absolute; left:12px; top:-2px; width:2px; height:30px; background:#fff; box-shadow:0 0 2px #000; }
.cbt-hit::before { transform:rotate(45deg); } .cbt-hit::after { transform:rotate(-45deg); }
.cbt-hit.kill::before, .cbt-hit.kill::after { background:#e0453a; }
.cbt-hit.show { animation:cbt-hit .28s ease-out; }
@keyframes cbt-hit { 0% { opacity:1; transform:scale(1.4); } 100% { opacity:0; transform:scale(.9); } }
.cbt-dmg { position:absolute; left:50%; top:50%; width:220px; height:220px; margin:-110px 0 0 -110px; border-radius:50%; border:6px solid transparent; border-top-color:rgba(224,40,30,.85); opacity:0; transition:opacity .9s; filter:blur(1px); }
.cbt-dmg.on { opacity:1; transition:none; }
.cbt-vig { position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(170,0,0,.75) 100%); opacity:0; transition:opacity .25s; }
.cbt-vig.low { animation:cbt-pulse 1.1s infinite; }
@keyframes cbt-pulse { 50% { filter:brightness(1.5); } }
.cbt-focus-tint { position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(25,230,255,0) 40%, rgba(25,120,160,.35) 100%); opacity:0; transition:opacity .2s; mix-blend-mode:screen; }
.cbt-scope { position:absolute; inset:0; background:radial-gradient(circle at center, rgba(0,0,0,0) 0, rgba(0,0,0,0) 33vmin, #000 33.4vmin); }
.cbt-scope::before { content:''; position:absolute; left:50%; top:calc(50% - 33vmin); width:1px; height:66vmin; background:rgba(0,0,0,.8); }
.cbt-scope::after { content:''; position:absolute; top:50%; left:calc(50% - 33vmin); height:1px; width:66vmin; background:rgba(0,0,0,.8); }
.cbt-bars { position:absolute; left:22px; bottom:11px; width:270px; display:grid; grid-template-columns:2fr 2fr; gap:3px; }
.cbt-bar { height:6px; background:rgba(0,0,0,.55); position:relative; overflow:hidden; }
.cbt-bar > div { height:100%; width:0; transition:width .25s; }
.cbt-bar.armor > div { background:#4aa4e0; }
.cbt-bar.focus > div { background:#19e6ff; box-shadow:0 0 6px #19e6ff; }
.cbt-bar.focus.on > div { background:#ffd23f; }
.cbt-status { position:absolute; left:50%; top:calc(50% + 46px); transform:translateX(-50%); font:600 13px 'Oswald',sans-serif; letter-spacing:3px; color:#fff; text-shadow:1px 1px 0 #000, 0 0 6px #000; text-transform:uppercase; }
.cbt-note { position:absolute; right:24px; top:126px; font:600 12px 'Oswald',sans-serif; letter-spacing:1.5px; color:#fff; background:rgba(0,0,0,.55); padding:3px 8px; text-transform:uppercase; }
.cbt-note.search { color:#ffd23f; }
.cbt-wheel { position:absolute; left:50%; top:50%; width:440px; height:440px; margin:-220px 0 0 -220px; border-radius:50%; background:radial-gradient(circle, rgba(0,0,0,.25) 0, rgba(0,0,0,.25) 30%, rgba(0,0,0,.72) 31%, rgba(0,0,0,.72) 100%); animation:cbt-wheel-in .14s ease-out; }
@keyframes cbt-wheel-in { from { transform:scale(.85); opacity:0; } }
.cbt-wheel .seg { position:absolute; left:50%; top:50%; width:120px; height:74px; margin:-37px 0 0 -60px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#bbb; border-radius:6px; transition:transform .08s, background .08s; }
.cbt-wheel .seg svg { width:84px; height:30px; fill:#bbb; }
.cbt-wheel .seg .l { font:600 12px 'Oswald',sans-serif; letter-spacing:1px; text-transform:uppercase; }
.cbt-wheel .seg .a { font:500 11px 'Oswald',sans-serif; color:#888; }
.cbt-wheel .seg.sel { background:rgba(255,255,255,.14); color:#fff; transform:scale(1.12); }
.cbt-wheel .seg.sel svg { fill:#fff; }
.cbt-wheel .seg.empty { opacity:.35; }
.cbt-wheel .center { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); text-align:center; color:#fff; font:400 20px 'Anton','Oswald',sans-serif; letter-spacing:1px; width:120px; }
.cbt-wheel .center small { display:block; font:500 11px 'Oswald',sans-serif; color:#f0c850; letter-spacing:2px; }
.cbt-big { position:absolute; left:0; right:0; top:38%; text-align:center; font:400 96px/1 'Anton','Oswald',Impact,sans-serif; letter-spacing:4px; color:#e0453a; -webkit-text-stroke:3px #000; paint-order:stroke fill; text-shadow:0 6px 24px rgba(0,0,0,.6); animation:cbt-big .5s ease-out; }
.cbt-big.blue { color:#5aa9e6; }
.cbt-big small { display:block; font:500 22px 'Oswald',sans-serif; letter-spacing:2px; color:#fff; -webkit-text-stroke:0; margin-top:10px; }
@keyframes cbt-big { from { transform:scale(1.5); opacity:0; } }
.cc-threat.cbt-searching span.on { animation:cbt-star-blink .5s steps(2) infinite; }
@keyframes cbt-star-blink { 50% { opacity:.15; } }
`;

const ICON: Record<WeaponId, string> = {
  fists: 'M38 10h18l6 6v12l-6 6H40l-6-6V16zM34 18h-6v8h6z',
  bat: 'M6 22l70-8 16 2v6l-16 2-70-2z',
  knife: 'M10 18h22v8H10zM32 20l50-6-8 10-42 2z',
  taser: 'M14 12h52v12H40l-4 14H24l2-14H14zM66 14h10v8H66z',
  pistol: 'M12 10h60v10H44l-4 16H26l4-16H12zM72 12h8v6h-8z',
  smg: 'M8 12h64v10H50l-2 16h-8l2-16H32l-4 10h-8l2-10H8zM72 14h14v5H72z',
  shotgun: 'M2 16l22-4h70v8H36l-8 4H8l-6-2zM40 20h22v5H40z',
  rifle: 'M2 16l18-4h56v8H58l-4 14h-8l2-14H36l-4 8h-8l2-8H8zM76 14h20v4H76zM30 6h20v6H30z',
  sniper: 'M2 18l20-6h66v6H40l-6 6H10zM30 4h26v8H30zM88 13h10v3H88z',
};

export function weaponIcon(id: WeaponId): string {
  return `<svg viewBox="0 0 100 40"><path d="${ICON[id]}"/></svg>`;
}

export interface WheelItem { slot: number; id: WeaponId | null; label: string; ammo: string }

function el(tag: string, cls: string, html = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class CombatHud {
  readonly root = el('div', 'cbt-hud');
  private weapon = el('div', 'cbt-weapon');
  private wIcon = el('div', '');
  private wAmmo = el('div', 'ammo');
  private wName = el('div', 'name');
  private wReload = el('div', 'reload');
  private cross = el('div', 'cbt-cross');
  private cl: HTMLElement[] = [];
  private hit = el('div', 'cbt-hit');
  private dmg: HTMLElement[] = [];
  private dmgNext = 0;
  private vig = el('div', 'cbt-vig');
  private tint = el('div', 'cbt-focus-tint');
  private scope = el('div', 'cbt-scope cbt-hide');
  private armor = el('div', 'cbt-bar armor', '<div></div>');
  private focus = el('div', 'cbt-bar focus', '<div></div>');
  private status = el('div', 'cbt-status');
  private note = el('div', 'cbt-note cbt-hide');
  private wheel: HTMLElement | null = null;
  private wheelSegs: HTMLElement[] = [];
  private wheelCenter: HTMLElement | null = null;
  private big: HTMLElement | null = null;
  private lastWeapon = '';
  private lastAmmo = '';

  constructor(host: HTMLElement) {
    if (!document.getElementById('cbt-css')) {
      const s = document.createElement('style');
      s.id = 'cbt-css';
      s.textContent = CSS;
      document.head.append(s);
    }
    this.weapon.append(this.wName, this.wIcon, this.wAmmo, this.wReload);
    for (const [cls, x, y] of [['h', -16, 0], ['h', 7, 0], ['v', 0, -16], ['v', 0, 7]] as const) {
      const i = el('i', cls);
      i.style.left = `${x}px`;
      i.style.top = `${y}px`;
      this.cl.push(i);
      this.cross.append(i);
    }
    this.cross.append(el('div', 'dot'));
    for (let i = 0; i < 4; i++) { const d = el('div', 'cbt-dmg'); this.dmg.push(d); }
    const bars = el('div', 'cbt-bars');
    bars.append(this.armor, this.focus);
    this.root.append(this.vig, this.tint, this.scope, ...this.dmg, this.cross, this.hit, this.weapon, bars, this.status, this.note);
    host.append(this.root);
  }

  setVisible(on: boolean): void { this.root.classList.toggle('cbt-hide', !on); }

  setWeapon(id: WeaponId, mag: number, reserve: number, reload: number, magSize: number): void {
    if (id !== this.lastWeapon) {
      this.lastWeapon = id;
      this.wIcon.innerHTML = weaponIcon(id);
      this.wName.textContent = WEAPONS[id].name;
    }
    const melee = WEAPONS[id].cls === 'melee';
    const txt = melee ? '' : `${mag}<small>${reserve}</small>`;
    if (txt !== this.lastAmmo) { this.lastAmmo = txt; this.wAmmo.innerHTML = txt; }
    this.weapon.classList.toggle('low', !melee && mag <= Math.max(1, Math.floor(magSize * 0.2)));
    this.wReload.style.width = reload > 0 ? `${Math.round(reload * 100)}%` : '0';
  }

  showWeaponPanel(on: boolean): void { this.weapon.style.opacity = on ? '1' : '0'; }

  setCrosshair(show: boolean, spreadPx: number, hostile: boolean, melee: boolean): void {
    this.cross.style.display = show ? '' : 'none';
    if (!show) return;
    const g = Math.max(3, Math.min(60, spreadPx));
    this.cl[0].style.left = `${-g - 9}px`;
    this.cl[1].style.left = `${g}px`;
    this.cl[2].style.top = `${-g - 9}px`;
    this.cl[3].style.top = `${g}px`;
    this.cross.classList.toggle('hostile', hostile);
    this.cross.classList.toggle('melee', melee);
  }

  hitMarker(kill: boolean): void {
    this.hit.classList.remove('show', 'kill');
    void this.hit.offsetWidth;
    this.hit.classList.add('show');
    if (kill) this.hit.classList.add('kill');
  }

  /** Damage arc pointing to where the hit came from (angle relative to view, 0 = front). */
  damageFrom(angle: number): void {
    const d = this.dmg[this.dmgNext];
    this.dmgNext = (this.dmgNext + 1) % this.dmg.length;
    d.style.transform = `rotate(${angle}rad)`;
    d.classList.add('on');
    setTimeout(() => d.classList.remove('on'), 60);
  }

  setArmor(frac: number): void { (this.armor.firstElementChild as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`; }

  setFocus(frac: number, active: boolean): void {
    (this.focus.firstElementChild as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
    this.focus.classList.toggle('on', active);
    this.tint.style.opacity = active ? '1' : '0';
  }

  setVignette(amount: number, low: boolean): void {
    this.vig.style.opacity = String(Math.max(0, Math.min(1, amount)));
    this.vig.classList.toggle('low', low);
  }

  setScope(on: boolean): void { this.scope.classList.toggle('cbt-hide', !on); }

  setStatus(text: string | null): void {
    if (this.status.textContent !== (text ?? '')) this.status.textContent = text ?? '';
  }

  setNote(text: string | null, search = false): void {
    this.note.classList.toggle('cbt-hide', !text);
    this.note.classList.toggle('search', search);
    if (text && this.note.textContent !== text) this.note.textContent = text;
  }

  openWheel(items: WheelItem[]): void {
    this.closeWheel();
    const w = el('div', 'cbt-wheel');
    this.wheelSegs = [];
    const n = items.length;
    items.forEach((it, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const s = el('div', `seg${it.id ? '' : ' empty'}`, `${it.id ? weaponIcon(it.id) : ''}<div class="l">${it.slot}. ${it.label}</div><div class="a">${it.ammo}</div>`);
      s.style.transform = `translate(${Math.cos(a) * 150}px, ${Math.sin(a) * 150}px)`;
      s.dataset.base = s.style.transform;
      this.wheelSegs.push(s);
      w.append(s);
    });
    this.wheelCenter = el('div', 'center', '<small>WEAPON</small>');
    w.append(this.wheelCenter);
    this.root.append(w);
    this.wheel = w;
  }

  setWheelSelected(i: number, label: string): void {
    this.wheelSegs.forEach((s, k) => {
      s.classList.toggle('sel', k === i);
      s.style.transform = `${s.dataset.base ?? ''}${k === i ? ' scale(1.12)' : ''}`;
    });
    if (this.wheelCenter) this.wheelCenter.innerHTML = `<small>WEAPON</small>${label}`;
  }

  closeWheel(): void {
    this.wheel?.remove();
    this.wheel = null;
    this.wheelSegs = [];
  }

  /** Big GTA banner ("WASTED", "BUSTED", "KNOCKOUT"). */
  banner(text: string, sub = '', blue = false, ms = 2600): void {
    this.big?.remove();
    const b = el('div', `cbt-big${blue ? ' blue' : ''}`, `${text}${sub ? `<small>${sub}</small>` : ''}`);
    this.root.append(b);
    this.big = b;
    setTimeout(() => { if (this.big === b) { b.remove(); this.big = null; } }, ms);
  }

  dispose(): void { this.root.remove(); }
}
