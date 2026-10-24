// PHONE system ('phone', key P): GTA-style smartphone sliding up bottom-right.
// Apps: Map, Messages, Contacts (call = hangout), Camera (photo mode with
// filters + selfie + wildlife detection, saves to IndexedDB), Gallery,
// NeonFeed social, Bank, Stats, Wildlife log, Neon Bay Talk podcast, Settings.
// Keyboard: arrows/WASD navigate, Enter open, Backspace back, Esc/P close.
import * as THREE from 'three';
import type { GameSystem, SystemContext } from '../../game/Systems';
import { CC_OPEN_MAP, emitEvent, onEvent, num, str, type CcEvent } from '../life/bus';
import { captureKeys, ensureCss, esc, h, key, layer, modal, money, popEmoji, splash } from '../life/ui';
import { ambientPost, growLikes, photoPost, postsForEvent, timeAgo, type Post } from './social';
import { deliver, dueTexts, reply, type Thread } from './messages';
import { deletePhoto, listPhotos, savePhoto, type Photo } from './gallery';
import { EPISODES, PODCAST_STATION, podcastLines } from './podcast';
import { PEOPLE, levelName, person, type Rel } from '../activities/relationships';
import type { LifeSystem } from '../life';

interface BankTx { amount: number; reason: string; time: number; hour: number }

interface PhoneData {
  threads: Thread[];
  sent: string[];
  posts: Post[];
  bank: BankTx[];
  followers: number;
}

/** Cooperation with other systems (structural, optional). */
interface ActivitiesLike extends GameSystem {
  rel?(id: string): Rel | undefined;
  addRelationship?(id: string, pts: number): void;
  startHangout?(id: string): { ok: boolean; reason: string };
  hangoutWith?(): string | null;
  endHangout?(): void;
}
interface AnimalsLike extends GameSystem {
  inView?(camera: THREE.Camera): string[];
  logEntries?(): { species: string; name: string; seen: boolean; photographed: boolean; count: number; hint: string }[];
  photographed?(species: string[]): { newSpecies: string[]; reward: number };
}

const FILTERS: { id: string; name: string; css: string }[] = [
  { id: 'none', name: 'Natural', css: 'none' },
  { id: 'vice', name: 'Vice', css: 'saturate(1.6) hue-rotate(-12deg) contrast(1.1)' },
  { id: 'sunset', name: 'Sunset', css: 'sepia(0.35) saturate(1.5) hue-rotate(-20deg) brightness(1.05)' },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.35)' },
  { id: 'vhs', name: 'VHS 86', css: 'contrast(1.25) saturate(1.4) blur(0.6px) hue-rotate(8deg)' },
  { id: 'neon', name: 'Neon', css: 'saturate(2) contrast(1.2) hue-rotate(25deg)' },
];

const APPS = [
  { id: 'map', name: 'Map', icon: '🗺️', color: '#2a6cc4' },
  { id: 'messages', name: 'Messages', icon: '💬', color: '#3dbb5a' },
  { id: 'contacts', name: 'Contacts', icon: '📇', color: '#ff8a3d' },
  { id: 'camera', name: 'Camera', icon: '📷', color: '#3a3f47' },
  { id: 'gallery', name: 'Gallery', icon: '🖼️', color: '#c27cff' },
  { id: 'feed', name: 'NeonFeed', icon: '🌴', color: '#ff2fa0' },
  { id: 'bank', name: 'Bank', icon: '🏦', color: '#1b5e20' },
  { id: 'stats', name: 'Stats', icon: '💪', color: '#e0453a' },
  { id: 'wild', name: 'Wildlife', icon: '🐾', color: '#2e9e5b' },
  { id: 'talk', name: 'Talk 86.1', icon: '📻', color: '#d4af37' },
  { id: 'settings', name: 'Settings', icon: '⚙️', color: '#6a6c72' },
] as const;

type AppId = (typeof APPS)[number]['id'] | 'home' | 'thread' | 'photo' | 'episode';

const CSS = `
.ph-wrap{position:absolute;right:36px;bottom:0;width:300px;height:590px;transform:translateY(105%);transition:transform .28s cubic-bezier(.2,.9,.25,1);pointer-events:auto}
.ph-wrap.up{transform:translateY(-24px)}
.ph{position:absolute;inset:0;border-radius:34px;background:#0b0b10;border:3px solid #2b2b34;box-shadow:0 20px 60px rgba(0,0,0,.6),inset 0 0 0 2px #444;padding:14px 10px}
.ph-screen{position:absolute;inset:14px 10px;border-radius:24px;overflow:hidden;background:linear-gradient(160deg,#2b1055,#7b2cff 45%,#ff2fa0 80%,#ff8a3d);color:#fff;font-family:'Oswald',var(--font-ui);display:flex;flex-direction:column}
.ph-status{display:flex;justify-content:space-between;padding:6px 14px 4px;font:500 12px 'Oswald';background:rgba(0,0,0,.25)}
.ph-title{padding:8px 14px;font:400 22px 'Anton','Oswald';letter-spacing:1px;background:rgba(0,0,0,.45);display:flex;justify-content:space-between;align-items:center}
.ph-title small{font:400 12px 'Oswald';opacity:.75}
.ph-body{flex:1;overflow-y:auto;padding:10px;scrollbar-width:thin}
.ph-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px 6px;padding:14px 8px}
.ph-app{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;border-radius:12px;padding:6px 0}
.ph-app .ic{width:54px;height:54px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 4px 10px rgba(0,0,0,.35);position:relative}
.ph-app .ic b{position:absolute;top:-6px;right:-6px;background:#e0453a;border-radius:10px;font:700 11px 'Oswald';padding:1px 6px}
.ph-app span{font:500 12px 'Oswald';text-shadow:0 1px 2px #000}
.ph-app.sel{background:rgba(255,255,255,.22)}
.ph-list{display:flex;flex-direction:column;gap:6px}
.ph-item{background:rgba(0,0,0,.5);border-radius:10px;padding:8px 10px;cursor:pointer;font:400 14px/1.3 'Oswald';border:2px solid transparent}
.ph-item.sel{border-color:#fff;background:rgba(0,0,0,.7)}
.ph-item .t{display:flex;justify-content:space-between;font-weight:600}
.ph-item .s{opacity:.8;font-size:13px}
.ph-bubble{max-width:80%;padding:7px 10px;border-radius:14px;margin:4px 0;font:400 14px/1.3 'Oswald'}
.ph-bubble.in{background:rgba(0,0,0,.55);align-self:flex-start;border-bottom-left-radius:4px}
.ph-bubble.out{background:#2a6cc4;align-self:flex-end;border-bottom-right-radius:4px}
.ph-thread{display:flex;flex-direction:column}
.ph-foot{padding:6px 10px;font:400 11px 'Oswald';background:rgba(0,0,0,.55);display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.ph-ring{display:inline-flex;flex-direction:column;align-items:center;width:31%;font:500 11px 'Oswald';letter-spacing:1px}
.ph-photo{width:100%;border-radius:8px;display:block}
.ph-thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.ph-thumbs img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;border:2px solid transparent;cursor:pointer}
.ph-thumbs img.sel{border-color:#fff}
.ph-badge{position:absolute;right:30px;bottom:200px;background:rgba(0,0,0,.78);color:#fff;padding:6px 10px;font:500 14px 'Oswald';border-left:3px solid #3dbb5a;pointer-events:none;animation:lf-in .2s}
.cam-hud{position:absolute;inset:0;pointer-events:none;font-family:'Oswald'}
.cam-hud .corner{position:absolute;width:60px;height:60px;border:3px solid rgba(255,255,255,.85)}
.cam-hud .bar{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;padding:8px 14px;font:400 14px 'Oswald';white-space:nowrap}
.cam-hud .flt{position:absolute;left:50%;top:22px;transform:translateX(-50%);font:400 26px 'Anton';color:#fff;text-shadow:2px 2px 0 #000;letter-spacing:2px;text-transform:uppercase}
.cam-hud .flash{position:absolute;inset:0;background:#fff;opacity:0;transition:opacity .35s}
.cam-hud .shot{position:absolute;right:30px;bottom:80px;width:240px;background:rgba(0,0,0,.75);padding:6px;color:#fff;font:400 13px 'Oswald';animation:lf-in .2s}
.cam-hud .tags{position:absolute;left:30px;top:70px;display:flex;flex-direction:column;gap:4px}
.cam-hud .tags div{background:rgba(0,0,0,.6);padding:3px 8px;font:500 13px 'Oswald';border-left:3px solid #9be15d}
`;

export class PhoneSystem implements GameSystem {
  readonly id = 'phone';
  private ctx: SystemContext | null = null;
  data: PhoneData = { threads: [], sent: [], posts: [], bank: [], followers: 120 };
  private lastCredits = NaN;
  private pendingMoney = 0;
  private checkT = 0;
  private ambientT = 60;
  private badge: HTMLElement | null = null;
  private unsub: (() => void) | null = null;
  private rnd = Math.random;
  private photoMode: PhotoMode | null = null;
  private open = false;

  init(ctx: SystemContext): void {
    this.ctx = ctx;
    ensureCss();
    if (!document.getElementById('ph-css')) {
      const s = document.createElement('style');
      s.id = 'ph-css';
      s.textContent = CSS;
      document.head.append(s);
    }
    const d = ctx.getData<Partial<PhoneData> | null>('phone', null);
    this.data = {
      threads: Array.isArray(d?.threads) ? d!.threads : [],
      sent: Array.isArray(d?.sent) ? d!.sent : [],
      posts: Array.isArray(d?.posts) ? d!.posts : [],
      bank: Array.isArray(d?.bank) ? d!.bank : [],
      followers: typeof d?.followers === 'number' ? d.followers : 120,
    };
    if (!this.data.posts.length) for (let i = 0; i < 4; i++) this.addPosts([ambientPost(this.rnd, Date.now() - i * 600_000)]);
    this.lastCredits = ctx.profile().credits;
    this.unsub?.();
    this.unsub = onEvent((e) => this.onGameEvent(e));
  }

  /** NeonFeed/radio integration: scripted talk-show lines with timing. */
  podcastLines(): ReturnType<typeof podcastLines> { return podcastLines(); }
  podcastStation(): typeof PODCAST_STATION { return PODCAST_STATION; }
  isOpen(): boolean { return this.open; }

  private persist(): void {
    this.ctx?.setData('phone', this.data);
  }

  private onGameEvent(e: CcEvent): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (e.type === 'money') {
      const amount = num(e, 'amount');
      this.pendingMoney += amount;
      this.logTx(amount, str(e, 'reason', amount >= 0 ? 'Deposit' : 'Payment'));
      return;
    }
    if (e.type === 'mission-complete') this.data.followers += 40;
    if (e.type === 'race-won' || e.type === 'stunt') this.data.followers += 15;
    const posts = postsForEvent(e, this.rnd, Date.now(), 2);
    if (posts.length && (e.type !== 'meal' || this.rnd() < 0.3) && (e.type !== 'purchase' || this.rnd() < 0.5)) this.addPosts(posts);
  }

  private addPosts(posts: Post[]): void {
    this.data.posts.unshift(...posts);
    if (this.data.posts.length > 60) this.data.posts.length = 60;
    this.persist();
  }

  private logTx(amount: number, reason: string): void {
    if (!this.ctx || Math.abs(amount) < 0.5) return;
    this.data.bank.unshift({ amount: Math.round(amount), reason, time: Date.now(), hour: this.ctx.world.hour });
    if (this.data.bank.length > 80) this.data.bank.length = 80;
  }

  update(dt: number, ctx: SystemContext): void {
    if (ctx.input.wasPressed('KeyP') && !this.open) { void this.openPhone(); return; }
    // reconcile unexplained balance changes (mission payouts, shard bonuses, other systems)
    const c = ctx.profile().credits;
    if (Number.isNaN(this.lastCredits)) this.lastCredits = c;
    const unexplained = c - this.lastCredits - this.pendingMoney;
    if (Math.abs(unexplained) >= 1) this.logTx(unexplained, unexplained > 0 ? 'Payment received' : 'Purchase');
    this.lastCredits = c;
    this.pendingMoney = 0;
    for (const p of this.data.posts) growLikes(p, dt);
    this.ambientT -= dt;
    if (this.ambientT <= 0) { this.ambientT = 90 + this.rnd() * 120; this.addPosts([ambientPost(this.rnd, Date.now())]); }
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 3; this.checkTexts(ctx); }
  }

  always(_dt: number, ctx: SystemContext): void {
    this.photoMode?.frame(_dt);
    const unread = this.data.threads.reduce((a, t) => a + t.unread, 0);
    const show = unread > 0 && !ctx.isBusy();
    if (show && !this.badge) { this.badge = h('div', { class: 'ph-badge' }); ctx.hudRoot.append(this.badge); }
    if (this.badge) {
      this.badge.style.display = show ? '' : 'none';
      if (show) this.badge.innerHTML = `📱 ${unread} new message${unread > 1 ? 's' : ''} &nbsp;${key('P')}`;
    }
  }

  private checkTexts(ctx: SystemContext): void {
    const acts = ctx.system<ActivitiesLike>('activities');
    const life = ctx.system<LifeSystem>('life');
    const rel: Record<string, number> = {};
    for (const p of PEOPLE) { const r = acts?.rel?.(p.id); rel[p.id] = r?.met ? r.points : 0; }
    const st = life?.state;
    const due = dueTexts(this.data.sent, {
      completed: ctx.profile().missions.completed, day: 0, hour: ctx.world.hour, rel,
      stats: { fat: st?.fat ?? 30, muscle: st?.muscle ?? 25, strength: st?.strength ?? 20 },
    });
    const t = due[0];
    if (!t) return;
    this.data.sent.push(t.id);
    deliver(this.data.threads, t.from, t.text, t.replies, Date.now());
    this.persist();
    const name = person(t.from)?.name ?? t.from;
    ctx.sfx('beep');
    ctx.notify(`📱 [y]${name.split(' ')[0]}[/y]: ${t.text.length > 60 ? `${t.text.slice(0, 58)}…` : t.text}`, 'info');
  }

  /** Other systems can text Rico (e.g. a companion or a crime contact). */
  text(from: string, text: string, replies: [string, string, number][] = []): void {
    deliver(this.data.threads, from, text, replies, Date.now());
    this.persist();
    this.ctx?.sfx('beep');
    this.ctx?.notify(`📱 [y]${person(from)?.name.split(' ')[0] ?? from}[/y]: ${text}`, 'info');
  }

  // ---------------------------------------------------------------- phone UI

  async openPhone(startApp: AppId = 'home'): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.open) return;
    this.open = true;
    let next: (() => Promise<void>) | null = null;
    try {
      await modal(ctx, () => new Promise<void>((resolve) => {
        const L = layer(ctx);
        L.style.pointerEvents = 'none';
        const wrap = h('div', { class: 'ph-wrap' });
        const screen = h('div', { class: 'ph-screen' });
        wrap.append(h('div', { class: 'ph' }, screen));
        L.append(wrap);
        requestAnimationFrame(() => wrap.classList.add('up'));
        ctx.sfx('open');
        const stack: { app: AppId; sel: number; arg?: string }[] = [{ app: startApp, sel: 0 }];
        let photos: Photo[] = [];
        let closing = false;
        const close = (then?: () => Promise<void>) => {
          if (closing) return;
          closing = true;
          next = then ?? null;
          wrap.classList.remove('up');
          release();
          setTimeout(() => { L.remove(); resolve(); }, 220);
        };
        const top = () => stack[stack.length - 1];
        const push = (app: AppId, arg?: string) => { stack.push({ app, sel: 0, arg }); ctx.sfx('click'); render(); };
        const back = () => { if (stack.length > 1) { stack.pop(); ctx.sfx('click'); render(); } else close(); };

        // each screen returns its selectable item count + an activate(i) handler + optional key hook
        let count = 0;
        let activate: (i: number) => void = () => undefined;
        let extraKey: ((code: string) => boolean) | null = null;
        let cols = 1;

        const status = () => {
          const hr = Math.floor(ctx.world.hour), mn = Math.floor((ctx.world.hour % 1) * 60);
          return h('div', { class: 'ph-status' }, h('span', {}, `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}`), h('span', {}, 'NEON 5G ▮▮▮ 🔋'));
        };
        const title = (t: string, sub = '') => h('div', { class: 'ph-title', html: `<span>${esc(t)}</span><small>${esc(sub)}</small>` });
        const foot = (html: string) => h('div', { class: 'ph-foot', html });

        const render = (): void => {
          const s = top();
          screen.replaceChildren(status());
          extraKey = null;
          cols = 1;
          const body = h('div', { class: 'ph-body' });
          const list = h('div', { class: 'ph-list' });
          const item = (i: number, t: string, sub: string, right = '', onClick?: () => void) => {
            const el = h('div', { class: `ph-item${s.sel === i ? ' sel' : ''}`, html: `<div class="t"><span>${t}</span><span>${right}</span></div>${sub ? `<div class="s">${sub}</div>` : ''}` });
            el.onclick = () => { s.sel = i; (onClick ?? (() => activate(i)))(); };
            list.append(el);
            return el;
          };
          switch (s.app) {
            case 'home': {
              const unread = this.data.threads.reduce((a, t) => a + t.unread, 0);
              const grid = h('div', { class: 'ph-grid' });
              APPS.forEach((a, i) => {
                const badge = a.id === 'messages' && unread ? `<b>${unread}</b>` : '';
                const el = h('div', { class: `ph-app${s.sel === i ? ' sel' : ''}`, html: `<div class="ic" style="background:${a.color}">${a.icon}${badge}</div><span>${a.name}</span>` });
                el.onclick = () => { s.sel = i; activate(i); };
                grid.append(el);
              });
              screen.append(h('div', { style: 'text-align:center;padding:10px 0 0;font:400 44px Anton,Oswald;text-shadow:0 2px 8px rgba(0,0,0,.5)' }, `${String(Math.floor(ctx.world.hour)).padStart(2, '0')}:${String(Math.floor((ctx.world.hour % 1) * 60)).padStart(2, '0')}`),
                h('div', { style: 'text-align:center;font:500 13px Oswald;letter-spacing:2px;opacity:.85' }, 'iFRUIT · NEON BAY'), grid);
              count = APPS.length; cols = 3;
              activate = (i) => openApp(APPS[i].id);
              screen.append(foot(`${key('↑↓←→')} ${key('Enter')} open ${key('Esc')} close`));
              return;
            }
            case 'messages': {
              screen.append(title('Messages', `${this.data.threads.length} chats`));
              const ts = [...this.data.threads].sort((a, b) => (b.msgs[b.msgs.length - 1]?.time ?? 0) - (a.msgs[a.msgs.length - 1]?.time ?? 0));
              if (!ts.length) list.append(h('div', { class: 'ph-item' }, 'No messages yet.'));
              ts.forEach((t, i) => {
                const p = person(t.with);
                const last = t.msgs[t.msgs.length - 1];
                item(i, `${p?.emoji ?? '👤'} ${esc(p?.name ?? t.with)}`, esc((last?.text ?? '').slice(0, 60)), t.unread ? `<b style="color:#3dbb5a">●</b>` : '');
              });
              count = ts.length;
              activate = (i) => push('thread', ts[i]?.with);
              break;
            }
            case 'thread': {
              const t = this.data.threads.find((x) => x.with === s.arg);
              const p = person(s.arg ?? '');
              const pr = p ? ctx.system<ActivitiesLike>('activities')?.rel?.(p.id) : undefined;
              screen.append(title(p?.name ?? s.arg ?? '', pr ? levelName(pr) : ''));
              if (t) {
                t.unread = 0;
                const th = h('div', { class: 'ph-thread' });
                for (const m of t.msgs.slice(-14)) th.append(h('div', { class: `ph-bubble ${m.out ? 'out' : 'in'}` }, m.text));
                body.append(th);
                t.replies.forEach((r, i) => item(i, `↩ ${esc(r[0])}`, '', key(String(i + 1))));
                count = t.replies.length;
                activate = (i) => {
                  const res = reply(t, i, Date.now());
                  if (res) {
                    ctx.system<ActivitiesLike>('activities')?.addRelationship?.(t.with, res.points);
                    ctx.sfx('type');
                    this.persist();
                    render();
                  }
                };
                extraKey = (code) => { const n = Number(code.replace('Digit', '')) - 1; if (n >= 0 && n < t.replies.length) { activate(n); return true; } return false; };
              }
              body.append(list);
              screen.append(body, foot(`${key('Enter')} reply ${key('⌫')} back`));
              requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
              return;
            }
            case 'contacts': {
              const acts = ctx.system<ActivitiesLike>('activities');
              const known = PEOPLE.filter((p) => acts?.rel?.(p.id)?.met ?? !p.companion);
              const hw = acts?.hangoutWith?.() ?? null;
              screen.append(title('Contacts', hw ? `With ${person(hw)?.name.split(' ')[0]}` : 'Call to hang out'));
              if (hw) item(0, '👋 End hangout', `Say goodbye to ${person(hw)?.name}`);
              known.forEach((p, i) => {
                const r = acts?.rel?.(p.id);
                item(i + (hw ? 1 : 0), `${p.emoji} ${esc(p.name)}`, `${r ? levelName(r) : 'Friend'} · likes ${p.fav.join(', ')}`, r ? `${Math.round(r.points)}♥` : '');
              });
              count = known.length + (hw ? 1 : 0);
              activate = (i) => {
                if (hw && i === 0) { acts?.endHangout?.(); render(); return; }
                const p = known[i - (hw ? 1 : 0)];
                if (!p) return;
                const res = acts?.startHangout?.(p.id) ?? { ok: false, reason: 'No signal.' };
                ctx.sfx(res.ok ? 'good' : 'bad');
                if (res.ok) { ctx.notify(`📞 ${p.name.split(' ')[0]} is on the way to meet you!`, 'good'); close(); }
                else ctx.notify(`📞 ${res.reason}`, 'warn');
              };
              break;
            }
            case 'gallery': {
              screen.append(title('Gallery', `${photos.length} photos`));
              const grid = h('div', { class: 'ph-thumbs' });
              photos.forEach((p, i) => {
                const img = h('img', { src: p.dataUrl, class: s.sel === i ? 'sel' : '' });
                img.onclick = () => { s.sel = i; activate(i); };
                grid.append(img);
              });
              if (!photos.length) grid.append(h('div', { class: 'ph-item', style: 'grid-column:span 3' }, 'No photos yet — open the Camera app.'));
              body.append(grid);
              count = photos.length; cols = 3;
              activate = (i) => photos[i] && push('photo', photos[i].id);
              screen.append(body, foot(`${key('Enter')} view ${key('⌫')} back`));
              return;
            }
            case 'photo': {
              const p = photos.find((x) => x.id === s.arg);
              screen.append(title('Photo', p ? new Date(p.time).toLocaleTimeString() : ''));
              if (p) {
                body.append(h('img', { class: 'ph-photo', src: p.dataUrl }));
                if (p.animals.length) body.append(h('div', { class: 'ph-item', style: 'margin-top:6px' }, `🐾 ${p.animals.join(', ')}`));
                item(0, p.shared ? '✓ Shared on NeonFeed' : '🌴 Share to NeonFeed', '');
                item(1, '🗑️ Delete', '');
                count = 2;
                activate = (i) => {
                  if (i === 0 && !p.shared) {
                    p.shared = true;
                    void savePhoto(p);
                    const caption = p.animals.length ? `Spotted: ${p.animals.join(', ')} 📸 #WildNeonBay` : ['Neon Bay vibes 🌴', 'Living my best life ✌️', 'Golden hour on Ocean Drive 🌅', 'Just a guy and his shirt 🌺'][Math.floor(this.rnd() * 4)];
                    this.addPosts([photoPost(p.id, caption, p.animals, this.data.followers, this.rnd, Date.now())]);
                    this.data.followers += 3 + p.animals.length * 5;
                    emitEvent({ type: 'photo', animals: p.animals, shared: true });
                    ctx.sfx('good');
                    ctx.notify('Posted to NeonFeed! Watch the likes roll in.', 'good');
                    render();
                  } else if (i === 1) {
                    void deletePhoto(p.id).then(async () => { photos = await listPhotos(); back(); });
                  }
                };
              }
              body.append(list);
              screen.append(body, foot(`${key('Enter')} select ${key('⌫')} back`));
              return;
            }
            case 'feed': {
              screen.append(title('NeonFeed', `${this.data.followers} followers`));
              const posts = this.data.posts.slice(0, 30);
              posts.forEach((p, i) => {
                const el = item(i, `<span style="color:${p.color}">${esc(p.author)}</span> <small style="opacity:.6">${esc(p.handle)} · ${timeAgo(Date.now(), p.time)}</small>`,
                  `${esc(p.text)}${p.photo ? '<br><i style="opacity:.7">📷 photo</i>' : ''}<div style="margin-top:4px;opacity:.9">${p.liked ? '💖' : '🤍'} ${Math.floor(p.likes)}</div>`);
                if (p.photo) {
                  void listPhotos().then((all) => {
                    const ph = all.find((x) => x.id === p.photo);
                    if (ph) el.querySelector('i')?.replaceWith(h('img', { class: 'ph-photo', src: ph.dataUrl, style: 'margin-top:4px' }));
                  });
                }
              });
              count = posts.length;
              activate = (i) => {
                const p = posts[i];
                if (!p || p.liked) return;
                p.liked = true;
                p.likes += 1;
                p.targetLikes += 1;
                const r = (list.children[i] as HTMLElement | undefined)?.getBoundingClientRect();
                if (r) popEmoji(ctx, r.right - 30, r.top + 20, '💖');
                ctx.sfx('click');
                render();
              };
              break;
            }
            case 'bank': {
              screen.append(title('Maze Bank', 'Checking'));
              body.append(h('div', { style: "text-align:center;padding:8px 0 12px" },
                h('div', { style: 'font:500 12px Oswald;letter-spacing:2px;opacity:.8' }, 'BALANCE'),
                h('div', { style: "font:400 40px Anton,Oswald;color:#72cc72;-webkit-text-stroke:1px #000" }, money(ctx.profile().credits))));
              const txs = this.data.bank.slice(0, 40);
              if (!txs.length) list.append(h('div', { class: 'ph-item' }, 'No transactions yet.'));
              txs.forEach((t, i) => item(i, esc(t.reason), new Date(t.time).toLocaleString(), `<span style="color:${t.amount >= 0 ? '#72cc72' : '#ff6b6b'}">${t.amount >= 0 ? '+' : '-'}${money(Math.abs(t.amount))}</span>`));
              count = txs.length;
              activate = () => undefined;
              break;
            }
            case 'stats': {
              const life = ctx.system<LifeSystem>('life');
              screen.append(title('Stats', life ? life.bodyShape().label : ''));
              if (life) {
                const st = life.state, pl = ctx.world.player;
                const ring = (label: string, v: number, c: string) => {
                  const r = 24, C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, v / 100));
                  return `<div class="ph-ring"><svg width="62" height="62" viewBox="0 0 62 62"><circle cx="31" cy="31" r="${r}" stroke="rgba(0,0,0,.45)" stroke-width="7" fill="none"/><circle cx="31" cy="31" r="${r}" stroke="${c}" stroke-width="7" fill="none" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 31 31)" stroke-linecap="round"/><text x="31" y="36" text-anchor="middle" fill="#fff" font-family="Oswald" font-size="14">${Math.round(v)}</text></svg>${label}</div>`;
                };
                body.innerHTML = `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 0">${ring('HEALTH', (pl.health / pl.maxHealth) * 100, '#58b947')}${ring('FOOD', st.hunger, '#ff8a3d')}${ring('DRINK', st.thirst, '#4aa4e0')}${ring('ENERGY', 100 - st.fatigue, '#f0c850')}${ring('FOCUS', st.focus, '#c27cff')}${ring('SHAPE', 100 - Math.abs(st.fat - 22) * 1.4, '#3dffb0')}</div>`
                  + `<div style="background:rgba(0,0,0,.5);border-radius:10px;padding:8px 10px;margin-top:8px">${life.bodyPanel()}</div>`
                  + `<div style="background:rgba(0,0,0,.5);border-radius:10px;padding:8px 10px;margin-top:8px;font-size:13px">Breath hold ${Math.round(life.lungCapacity())}s · Melee ×${life.meleeMultiplier().toFixed(2)} · Sprint ×${life.staminaMultiplier().toFixed(2)}${st.boosts.length ? `<br>Boosts: ${st.boosts.map((b) => b.id).join(', ')}` : ''}</div>`;
              }
              count = 0;
              activate = () => undefined;
              screen.append(body, foot(`${key('⌫')} back`));
              return;
            }
            case 'wild': {
              const an = ctx.system<AnimalsLike>('animals');
              const entries = an?.logEntries?.() ?? [];
              const seen = entries.filter((e) => e.seen).length;
              screen.append(title('Wildlife', `${seen}/${entries.length} species`));
              entries.forEach((e, i) => item(i, `${e.seen ? '🐾' : '❔'} ${e.seen ? esc(e.name) : '???'}`, e.seen ? `${e.photographed ? '📸 Photographed' : 'Seen — photograph it for a bonus'} · ×${e.count}` : esc(e.hint), e.photographed ? '✓' : ''));
              count = entries.length;
              activate = () => undefined;
              break;
            }
            case 'talk': {
              screen.append(title(PODCAST_STATION.name, PODCAST_STATION.tagline));
              EPISODES.forEach((e, i) => item(i, esc(e.title), `${esc(e.show)} · ${e.hosts.join(' & ')}`, '›'));
              count = EPISODES.length;
              activate = (i) => push('episode', EPISODES[i].id);
              break;
            }
            case 'episode': {
              const e = EPISODES.find((x) => x.id === s.arg);
              screen.append(title(e?.show ?? '', e?.title ?? ''));
              if (e) for (const l of e.lines) body.append(h('div', { class: 'ph-bubble in', style: 'max-width:100%' }, h('b', { style: 'color:#f0c850' }, `${l.speaker}: `), l.text));
              count = 0;
              activate = () => undefined;
              screen.append(body, foot(`${key('⌫')} back`));
              return;
            }
            default:
              break;
          }
          body.append(list);
          screen.append(body, foot(`${key('↑↓')} ${key('Enter')} select ${key('⌫')} back`));
          (list.children[s.sel] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
        };

        const openApp = (id: string) => {
          if (id === 'map') { close(async () => this.openMap()); return; }
          if (id === 'settings') { close(async () => this.openSettings()); return; }
          if (id === 'camera') { close(async () => this.camera()); return; }
          if (id === 'gallery') { void listPhotos().then((p) => { photos = p; push('gallery'); }); return; }
          push(id as AppId);
        };

        const release = captureKeys((e) => {
          const s = top();
          if (extraKey?.(e.code)) return;
          if (e.code === 'Escape' || e.code === 'KeyP') { close(); return; }
          if (e.code === 'Backspace') { back(); return; }
          if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { if (count) activate(s.sel); return; }
          const d = e.code === 'ArrowDown' || e.code === 'KeyS' ? cols : e.code === 'ArrowUp' || e.code === 'KeyW' ? -cols
            : e.code === 'ArrowRight' || e.code === 'KeyD' ? (cols > 1 ? 1 : 0) : e.code === 'ArrowLeft' || e.code === 'KeyA' ? (cols > 1 ? -1 : 0) : 0;
          if (d && count) {
            s.sel = Math.max(0, Math.min(count - 1, s.sel + d));
            ctx.sfx('click');
            render();
          }
        });
        if (startApp === 'gallery') void listPhotos().then((p) => { photos = p; render(); });
        render();
      }));
    } finally {
      this.open = false;
      this.persist();
    }
    if (next) await (next as () => Promise<void>)();
  }

  private async openMap(): Promise<void> {
    // Integrator hook: if someone handles 'cc:open-map' (calls preventDefault), we're done;
    // otherwise synthesize the game's own M key.
    const ev = new CustomEvent(CC_OPEN_MAP, { cancelable: true });
    window.dispatchEvent(ev);
    if (!ev.defaultPrevented) synthKey('KeyM');
  }

  private async openSettings(): Promise<void> {
    synthKey('Escape');
  }

  // ---------------------------------------------------------------- camera / photo mode

  private async camera(): Promise<void> {
    const ctx = this.ctx!;
    const pm = new PhotoMode(ctx, this);
    this.photoMode = pm;
    try {
      const openGallery = await modal(ctx, () => pm.run());
      if (openGallery) await this.openPhone('gallery');
    } finally {
      this.photoMode = null;
    }
  }
}

function synthKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
  setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), 60);
}

class PhotoMode {
  private yaw: number;
  private pitch = 0.15;
  private dist = 3.2;
  private height = 1.5;
  private filter = 1;
  private selfie = false;
  private drag = false;
  private canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  private hud: HTMLElement | null = null;
  private keys = new Set<string>();
  private waveT = 0;
  private wantShot = false;
  private busyShot = false;
  private lastAnimals: string[] = [];

  constructor(private ctx: SystemContext, private phone: PhoneSystem) {
    this.yaw = ctx.world.rig.yaw;
  }

  run(): Promise<boolean> {
    const ctx = this.ctx;
    return new Promise<boolean>((resolve) => {
      const L = layer(ctx);
      L.style.pointerEvents = 'auto';
      const hud = h('div', { class: 'cam-hud' });
      this.hud = hud;
      for (const [t, l, b, r, br] of [['18px', '18px', '', '', '3px 0 0 3px'], ['18px', '', '', '18px', '3px 3px 0 0'], ['', '18px', '18px', '', '0 0 3px 3px'], ['', '', '18px', '18px', '0 3px 3px 0']]) {
        const c = h('div', { class: 'corner' });
        c.style.cssText += `${t ? `top:${t};` : ''}${l ? `left:${l};` : ''}${b ? `bottom:${b};` : ''}${r ? `right:${r};` : ''}border-width:${br}`;
        hud.append(c);
      }
      hud.append(h('div', { class: 'flt' }), h('div', { class: 'tags' }), h('div', { class: 'bar', html: `${key('Mouse')} drag / ${key('WASD')} orbit · ${key('Wheel')} zoom · ${key('Q')}${key('E')} height · ${key('F')} filter · ${key('Tab')} selfie · ${key('Space')} shoot · ${key('G')} gallery · ${key('Esc')} exit` }), h('div', { class: 'flash' }));
      L.append(hud);
      this.applyFilter();
      const done = (gallery: boolean) => {
        release();
        L.remove();
        window.removeEventListener('mousemove', mm);
        window.removeEventListener('mouseup', mu);
        L.removeEventListener('mousedown', md);
        L.removeEventListener('wheel', wh);
        if (this.canvas) this.canvas.style.filter = '';
        resolve(gallery);
      };
      const release = captureKeys((e) => {
        if (e.code === 'Escape' || e.code === 'KeyP') { done(false); return; }
        if (e.code === 'KeyG') { done(true); return; }
        if (e.code === 'KeyF') { this.filter = (this.filter + 1) % FILTERS.length; this.applyFilter(); ctx.sfx('click'); return; }
        if (e.code === 'Tab') { this.selfie = !this.selfie; if (this.selfie) { this.yaw = ctx.world.player.yaw; this.dist = 1.6; } ctx.sfx('click'); return; }
        if (e.code === 'Space' || e.code === 'Enter') { this.wantShot = true; return; }
        this.keys.add(e.code);
      }, (e) => this.keys.delete(e.code));
      const md = (e: MouseEvent) => { this.drag = true; if (e.button === 2) this.wantShot = true; };
      const mu = () => { this.drag = false; };
      const mm = (e: MouseEvent) => { if (this.drag) { this.yaw -= e.movementX * 0.006; this.pitch = Math.max(-0.5, Math.min(1.2, this.pitch + e.movementY * 0.005)); } };
      const wh = (e: WheelEvent) => { this.dist = Math.max(1.2, Math.min(14, this.dist * (e.deltaY > 0 ? 1.1 : 0.9))); };
      L.addEventListener('mousedown', md);
      window.addEventListener('mouseup', mu);
      window.addEventListener('mousemove', mm);
      L.addEventListener('wheel', wh, { passive: true });
    });
  }

  private applyFilter(): void {
    const f = FILTERS[this.filter];
    if (this.canvas) this.canvas.style.filter = f.css === 'none' ? '' : f.css;
    const el = this.hud?.querySelector('.flt');
    if (el) el.textContent = `${f.name}${this.selfie ? ' · Selfie' : ''}`;
  }

  /** Called every frame (world paused). */
  frame(dt: number): void {
    const ctx = this.ctx, k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) this.yaw += dt * 1.4;
    if (k.has('KeyD') || k.has('ArrowRight')) this.yaw -= dt * 1.4;
    if (k.has('KeyW') || k.has('ArrowUp')) this.dist = Math.max(1.2, this.dist - dt * 4);
    if (k.has('KeyS') || k.has('ArrowDown')) this.dist = Math.min(14, this.dist + dt * 4);
    if (k.has('KeyQ')) this.height = Math.min(6, this.height + dt * 1.5);
    if (k.has('KeyE')) this.height = Math.max(0.3, this.height - dt * 1.5);
    const p = ctx.world.vehicle ? ctx.world.vehicle.position : ctx.world.player.position;
    const rig = ctx.world.player.rig;
    if (this.selfie && !ctx.world.vehicle) {
      this.waveT -= dt;
      if (this.waveT <= 0) { rig.wave(0); this.waveT = 3; }
      rig.body.rotation.y = this.yaw;
    }
    if (!ctx.world.vehicle) rig.animate(dt, 0);
    const cy = Math.cos(this.pitch);
    const tx = p.x, ty = p.y + this.height, tz = p.z;
    ctx.camera.position.set(tx + Math.sin(this.yaw) * cy * this.dist, ty + Math.sin(this.pitch) * this.dist, tz + Math.cos(this.yaw) * cy * this.dist);
    ctx.camera.lookAt(tx, ty - (this.selfie ? 0.15 : 0), tz);
    // live animal tags
    const an = ctx.system<AnimalsLike>('animals');
    const seen = an?.inView?.(ctx.camera) ?? [];
    if (seen.join() !== this.lastAnimals.join()) {
      this.lastAnimals = seen;
      const tags = this.hud?.querySelector('.tags');
      if (tags) tags.innerHTML = seen.map((s) => `<div>🐾 ${esc(s)}</div>`).join('');
    }
    if (this.wantShot && !this.busyShot) {
      this.wantShot = false;
      this.busyShot = true;
      // the frame is rendered right after systems run: read pixels in a microtask after this rAF callback
      queueMicrotask(() => { void this.capture(seen).finally(() => { this.busyShot = false; }); });
    }
  }

  private async capture(animals: string[]): Promise<void> {
    const ctx = this.ctx;
    const src = this.canvas;
    if (!src) return;
    const W = 720, H = Math.round((src.height / src.width) * W);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const f = FILTERS[this.filter];
    g.filter = f.css;
    g.drawImage(src, 0, 0, W, H);
    g.filter = 'none';
    if (f.id === 'vhs') {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      g.fillStyle = '#fff';
      g.font = '600 22px monospace';
      g.fillText('PLAY ▶  JUN 21 1986', 20, H - 24);
    }
    const dataUrl = c.toDataURL('image/jpeg', 0.82);
    const photo: Photo = { id: `ph${Date.now().toString(36)}`, time: Date.now(), dataUrl, filter: f.id, animals };
    await savePhoto(photo);
    const flash = this.hud?.querySelector('.flash') as HTMLElement | null;
    if (flash) { flash.style.transition = 'none'; flash.style.opacity = '0.9'; requestAnimationFrame(() => { flash.style.transition = 'opacity .4s'; flash.style.opacity = '0'; }); }
    ctx.sfx('whoosh');
    let extra = '';
    const an = ctx.system<AnimalsLike>('animals');
    if (animals.length && an?.photographed) {
      const r = an.photographed(animals);
      if (r.newSpecies.length) {
        extra = `<br>🐾 New in log: <b>${r.newSpecies.join(', ')}</b>${r.reward ? ` (+${money(r.reward)})` : ''}`;
        splash(ctx, 'Wildlife Photo', r.newSpecies.join(' · '), '#9be15d');
      }
    }
    emitEvent({ type: 'photo', animals, selfie: this.selfie });
    const old = this.hud?.querySelector('.shot');
    old?.remove();
    const card = h('div', { class: 'shot', html: `<img src="${dataUrl}" style="width:100%;display:block"><div style="padding:4px 2px">Saved to Gallery${extra}<br>${key('G')} open gallery to share</div>` });
    this.hud?.append(card);
    setTimeout(() => card.remove(), 4000);
    void this.phone;
  }
}

export default function create(): GameSystem {
  return new PhoneSystem();
}
