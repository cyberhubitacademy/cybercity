import { el } from '../cyber/types';
import { Minimap } from './Minimap';
import type { HudState, MinimapState, NotifyKind, PromptView } from './types';

// In-game HUD. Every setter diffs against the last value so calling
// update() each frame only touches the DOM when something changed.

function fmtMoney(n: number): string {
  return '$' + Math.max(0, Math.floor(n)).toString().padStart(8, '0');
}

export class Hud {
  readonly root: HTMLElement;
  readonly minimap = new Minimap();
  private clock = el('div', { class: 'cc-clock cc-outline-text' });
  private money = el('div', { class: 'cc-money cc-outline-text' });
  private healthBar = el('div', { class: 'cc-bar health' }, el('div'));
  private staminaBar = el('div', { class: 'cc-bar stamina' }, el('div'));
  private xpBar = el('div', { class: 'cc-bar xp' }, el('div'));
  private level = el('div', { class: 'cc-level cc-outline-text' });
  private objWrap = el('div', { class: 'cc-objective-wrap' });
  private missionTitle = el('div', { class: 'cc-mission-title cc-outline-text' });
  private objective = el('div', { class: 'cc-objective' });
  private timer = el('div', { class: 'cc-timer cc-outline-text' });
  private chase = el('div', { class: 'cc-chase' });
  private chaseFill = el('div');
  private chaseDist = el('div', { class: 'dist cc-outline-text' });
  private vehicle = el('div', { class: 'cc-vehicle' });
  private speed = el('div', { class: 'cc-speed cc-outline-text' });
  private vname = el('div', { class: 'cc-vname' });
  private radio = el('div', { class: 'cc-radio cc-outline-text' });
  private notes = el('div', { class: 'cc-notify' });
  private promptBox = el('div', { class: 'cc-prompt' });
  private district = el('div', { class: 'cc-district' });
  private subtitleBox = el('div', { class: 'cc-subtitle' });
  private zone = el('div', { class: 'cc-zone cc-outline-text' });
  private last = new Map<string, string>();
  private lastMoney = -1;
  private radioTimer = 0;
  private districtTimer = 0;
  private lastRadio: string | null = null;
  private lastSpeed = 0;

  constructor() {
    this.root = el('div', { class: 'cc-hud cc-passive hidden-hud' });
    const tr = el('div', { class: 'cc-tr' },
      this.clock,
      this.money,
      el('div', { class: 'cc-bars' }, this.healthBar, this.staminaBar, this.xpBar),
      this.level,
    );
    const mm = el('div', { class: 'cc-minimap' }, this.minimap.canvas, this.zone);
    this.chase.append(el('div', { class: 'lbl cc-outline-text' }, 'TRACKER LOCK'), el('div', { class: 'cc-bar' }, this.chaseFill), this.chaseDist);
    this.objWrap.append(this.missionTitle, this.objective);
    this.vehicle.append(this.speed, this.vname);
    this.root.append(tr, mm, this.objWrap, this.timer, this.chase, this.vehicle, this.radio, this.notes, this.promptBox, this.district, this.subtitleBox);
    for (const n of [this.timer, this.chase, this.vehicle, this.promptBox, this.objWrap, this.subtitleBox]) n.style.display = 'none';
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    apply();
  }

  private show(node: HTMLElement, on: boolean): void {
    const v = on ? '' : 'none';
    if (node.style.display !== v) node.style.display = v;
  }

  update(s: HudState): void {
    this.set('clock', s.clock, () => { this.clock.textContent = s.clock; });
    if (s.money !== this.lastMoney) {
      if (this.lastMoney >= 0 && s.money > this.lastMoney) {
        this.money.classList.add('bump');
        window.setTimeout(() => this.money.classList.remove('bump'), 160);
      }
      this.lastMoney = s.money;
      this.money.textContent = fmtMoney(s.money);
    }
    const hp = Math.max(0, Math.min(1, s.health / Math.max(1, s.maxHealth)));
    this.set('hp', hp.toFixed(3), () => {
      (this.healthBar.firstChild as HTMLElement).style.width = `${hp * 100}%`;
      this.healthBar.classList.toggle('low', hp < 0.25);
    });
    const st = Math.max(0, Math.min(1, s.stamina));
    this.set('st', st.toFixed(2), () => { (this.staminaBar.firstChild as HTMLElement).style.width = `${st * 100}%`; });
    const xp = s.xpNext > 0 ? Math.max(0, Math.min(1, s.xp / s.xpNext)) : 0;
    this.set('xp', xp.toFixed(3), () => { (this.xpBar.firstChild as HTMLElement).style.width = `${xp * 100}%`; });
    this.set('lvl', `${s.level}|${s.xp}|${s.xpNext}`, () => { this.level.textContent = `LVL ${s.level}  ·  ${s.xp}/${s.xpNext} XP`; });

    this.set('obj', `${s.missionTitle}|${s.objective}`, () => {
      this.show(this.objWrap, !!s.objective);
      this.missionTitle.textContent = s.missionTitle ?? '';
      this.missionTitle.style.display = s.missionTitle ? '' : 'none';
      this.objective.textContent = s.objective ?? '';
      this.objective.classList.remove('flash');
      void this.objective.offsetWidth;
      this.objective.classList.add('flash');
    });

    const tVal = s.timer === null ? '' : Math.max(0, Math.ceil(s.timer)).toString();
    this.set('timer', tVal, () => {
      this.show(this.timer, s.timer !== null);
      if (s.timer !== null) {
        const secs = Math.max(0, Math.ceil(s.timer));
        this.timer.textContent = `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;
        this.timer.classList.toggle('urgent', secs <= 10);
      }
    });

    this.set('chase', s.chase ? `${s.chase.progress.toFixed(2)}|${Math.round(s.chase.distance)}` : '', () => {
      this.show(this.chase, !!s.chase);
      if (s.chase) {
        this.chaseFill.style.width = `${Math.max(0, Math.min(1, s.chase.progress)) * 100}%`;
        this.chaseDist.textContent = `${Math.round(s.chase.distance)} m to target`;
      }
    });

    this.lastSpeed = s.vehicle?.speedKmh ?? 0;
    this.set('veh', s.vehicle ? `${Math.round(s.vehicle.speedKmh)}|${s.vehicle.name}` : '', () => {
      this.show(this.vehicle, !!s.vehicle);
      if (s.vehicle) {
        this.speed.innerHTML = '';
        this.speed.append(String(Math.round(s.vehicle.speedKmh)), el('small', {}, 'KM/H'));
        this.vname.textContent = s.vehicle.name;
      }
    });

    if (s.radio !== this.lastRadio) {
      this.lastRadio = s.radio;
      if (s.radio) {
        this.radio.textContent = s.radio;
        this.radio.classList.add('show');
        window.clearTimeout(this.radioTimer);
        this.radioTimer = window.setTimeout(() => this.radio.classList.remove('show'), 2600);
      } else {
        this.radio.classList.remove('show');
      }
    }
  }

  setZone(name: string): void {
    this.set('zone', name, () => { this.zone.textContent = name; });
  }

  drawMinimap(m: MinimapState): void {
    this.minimap.draw(m, this.lastSpeed);
  }

  prompt(p: PromptView | null): void {
    this.set('prompt', p ? `${p.key}|${p.title}|${p.desc ?? ''}` : '', () => {
      this.show(this.promptBox, !!p);
      if (!p) return;
      this.promptBox.innerHTML = '';
      this.promptBox.append(
        el('span', { class: 'cc-key' }, p.key),
        el('div', {}, el('div', { class: 't' }, p.title), p.desc ? el('div', { class: 'd' }, p.desc) : null),
      );
    });
  }

  notify(text: string, kind: NotifyKind = 'info'): void {
    const n = el('div', { class: `cc-note ${kind}` }, text);
    this.notes.append(n);
    while (this.notes.children.length > 4) this.notes.firstElementChild?.remove();
    const life = 3800 + Math.min(4000, text.length * 35);
    window.setTimeout(() => {
      n.classList.add('out');
      window.setTimeout(() => n.remove(), 450);
    }, life);
  }

  districtBanner(name: string): void {
    this.district.textContent = name;
    this.district.classList.add('show');
    window.clearTimeout(this.districtTimer);
    this.districtTimer = window.setTimeout(() => this.district.classList.remove('show'), 3200);
  }

  subtitle(speaker: string | null, text: string | null): void {
    this.set('sub', `${speaker}|${text}`, () => {
      this.show(this.subtitleBox, !!text);
      this.subtitleBox.innerHTML = '';
      if (!text) return;
      if (speaker) this.subtitleBox.append(el('b', {}, `${speaker}: `));
      this.subtitleBox.append(text);
    });
  }
}
