import { el } from '../cyber/types';
import { Minimap } from './Minimap';
import { keycap, rich } from './markup';
import type { HudState, MinimapState, NotifyKind, PromptView } from './types';

// GTA V-style HUD:
//   top-left     help box (interaction prompt + tips, with keycaps)
//   top-right    money, clock, threat stars, level
//   bottom-left  rectangular radar with health / stamina / XP bars and the feed above it
//   bottom-mid   objective text with colored keywords
//   bottom-right timers, tracker lock, speed
// Every setter diffs against the last value so calling update() each frame
// only touches the DOM when something changed.

export type HudArea = 'minimap' | 'objective' | 'money' | 'prompt' | 'none';

function fmtMoney(n: number): string {
  return '$' + Math.max(0, Math.floor(n)).toLocaleString('en-US');
}

export class Hud {
  readonly root: HTMLElement;
  readonly minimap = new Minimap();
  private clock = el('div', { class: 'cc-clock' });
  private money = el('div', { class: 'cc-money' });
  private threat = el('div', { class: 'cc-threat' });
  private level = el('div', { class: 'cc-level' });
  private healthBar = el('div', { class: 'cc-bar health' }, el('div'));
  private staminaBar = el('div', { class: 'cc-bar stamina' }, el('div'));
  private xpBar = el('div', { class: 'cc-bar xp' }, el('div'));
  private radar = el('div', { class: 'cc-radar' });
  private feed = el('div', { class: 'cc-feed' });
  private help = el('div', { class: 'cc-help' });
  private promptBox = el('div', { class: 'cc-prompt' });
  private objWrap = el('div', { class: 'cc-objective-wrap' });
  private missionTitle = el('div', { class: 'cc-mission-title' });
  private objective = el('div', { class: 'cc-objective' });
  private br = el('div', { class: 'cc-br' });
  private timer = el('div', { class: 'cc-gbar cc-timer' });
  private chase = el('div', { class: 'cc-gbar cc-chase' });
  private chaseFill = el('div');
  private chaseDist = el('span', { class: 'v' });
  private vehicle = el('div', { class: 'cc-vehicle' });
  private speed = el('div', { class: 'cc-speed' });
  private vname = el('div', { class: 'cc-vname' });
  private radio = el('div', { class: 'cc-radio' });
  private district = el('div', { class: 'cc-district' });
  private subtitleBox = el('div', { class: 'cc-subtitle' });
  private zone = el('div', { class: 'cc-zone' });
  private last = new Map<string, string>();
  private lastMoney = -1;
  private radioTimer = 0;
  private districtTimer = 0;
  private lastRadio: string | null = null;
  private lastSpeed = 0;

  constructor() {
    this.root = el('div', { class: 'cc-hud cc-passive hidden-hud' });
    const tr = el('div', { class: 'cc-tr' }, this.money, this.clock, this.threat, this.level);
    this.radar.append(
      el('div', { class: 'cc-radar-map' }, this.minimap.canvas),
      el('div', { class: 'cc-radar-bars' }, this.healthBar, this.staminaBar, this.xpBar),
      this.zone,
    );
    const tl = el('div', { class: 'cc-tl' }, this.promptBox, this.help);
    this.chase.append(el('span', { class: 'k' }, 'TRACKER'), el('div', { class: 'cc-bar' }, this.chaseFill), this.chaseDist);
    this.vehicle.append(this.speed, this.vname);
    this.br.append(this.vehicle, this.chase, this.timer);
    this.objWrap.append(this.missionTitle, this.objective);
    this.root.append(tl, tr, this.feed, this.radar, this.objWrap, this.br, this.radio, this.district, this.subtitleBox);
    for (const n of [this.timer, this.chase, this.vehicle, this.promptBox, this.objWrap, this.subtitleBox]) n.style.display = 'none';
    this.setThreat(0);
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
        this.money.classList.remove('bump');
        void this.money.offsetWidth;
        this.money.classList.add('bump');
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
    this.set('lvl', `${s.level}|${s.xp}|${s.xpNext}`, () => { this.level.textContent = `LEVEL ${s.level}  ·  ${s.xp}/${s.xpNext} XP`; });

    this.set('obj', `${s.missionTitle}|${s.objective}`, () => {
      this.show(this.objWrap, !!s.objective);
      this.missionTitle.textContent = s.missionTitle ?? '';
      this.missionTitle.style.display = s.missionTitle ? '' : 'none';
      this.objective.innerHTML = '';
      if (s.objective) rich(this.objective, s.objective);
      this.objective.classList.remove('flash');
      void this.objective.offsetWidth;
      this.objective.classList.add('flash');
    });

    const tVal = s.timer === null ? '' : Math.max(0, Math.ceil(s.timer)).toString();
    this.set('timer', tVal, () => {
      this.show(this.timer, s.timer !== null);
      if (s.timer !== null) {
        const secs = Math.max(0, Math.ceil(s.timer));
        this.timer.innerHTML = '';
        this.timer.append(el('span', { class: 'k' }, 'TIME'), el('span', { class: 'v' }, `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`));
        this.timer.classList.toggle('urgent', secs <= 10);
      }
    });

    this.set('chase', s.chase ? `${s.chase.progress.toFixed(2)}|${Math.round(s.chase.distance)}` : '', () => {
      this.show(this.chase, !!s.chase);
      if (s.chase) {
        this.chaseFill.style.width = `${Math.max(0, Math.min(1, s.chase.progress)) * 100}%`;
        this.chaseDist.textContent = `${Math.round(s.chase.distance)}m`;
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

  /** GTA-style wanted stars, used as the city "Threat Level" (0..5). */
  setThreat(level: number): void {
    const n = Math.max(0, Math.min(5, Math.round(level)));
    this.set('threat', String(n), () => {
      this.threat.innerHTML = '';
      this.threat.classList.toggle('active', n > 0);
      this.threat.title = `Threat level ${n}/5`;
      for (let i = 4; i >= 0; i--) this.threat.append(el('span', { class: i < n ? 'on' : '' }, '★'));
    });
  }

  /** Pulse a ring around one HUD area (used by the tutorial). */
  highlight(area: HudArea): void {
    for (const [a, node] of [['minimap', this.radar], ['objective', this.objWrap], ['money', this.money], ['prompt', this.promptBox]] as const) {
      node.classList.toggle('cc-spot', a === area);
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
      const line = el('div', { class: 't' }, 'Press ', keycap(p.key), ' ');
      rich(line, p.title);
      this.promptBox.append(line);
      if (p.desc) this.promptBox.append(rich(el('div', { class: 'd' }), p.desc));
    });
  }

  /**
   * Tips and warnings go to the GTA help box (top-left); rewards (good / xp / money)
   * go to the feed above the radar. Text supports [y]..[/y] colors and ~KEY~ keycaps.
   */
  notify(text: string, kind: NotifyKind = 'info'): void {
    const toFeed = kind === 'good' || kind === 'xp' || kind === 'money';
    const host = toFeed ? this.feed : this.help;
    const n = rich(el('div', { class: `${toFeed ? 'cc-feed-item' : 'cc-help-item'} ${kind}` }), text);
    host.append(n);
    while (host.children.length > (toFeed ? 4 : 2)) host.firstElementChild?.remove();
    const life = (toFeed ? 4200 : 5200) + Math.min(5000, text.length * 40);
    window.setTimeout(() => {
      n.classList.add('out');
      window.setTimeout(() => n.remove(), 450);
    }, life);
  }

  districtBanner(name: string): void {
    this.district.textContent = name;
    this.district.classList.remove('show');
    void this.district.offsetWidth;
    this.district.classList.add('show');
    window.clearTimeout(this.districtTimer);
    this.districtTimer = window.setTimeout(() => this.district.classList.remove('show'), 3600);
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
