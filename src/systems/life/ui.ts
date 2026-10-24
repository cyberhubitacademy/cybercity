// Shared GTA-V style UI kit for the life / phone / shops / activities systems:
// interaction menus (blue banner, white rows, price column), keycaps, help
// hints, big "splash" messages and stat bars. All DOM, no three.
import type { SystemContext } from '../../game/Systems';

const CSS = `
.lf-layer{position:absolute;inset:0;z-index:40;pointer-events:none;font-family:'Oswald',var(--font-ui)}
.lf-layer > *{pointer-events:auto}
.lf-menu{position:absolute;top:56px;left:56px;width:min(430px,92vw);color:#fff;box-shadow:0 10px 40px rgba(0,0,0,.5);animation:lf-in .18s ease-out}
.lf-menu.right{left:auto;right:56px}
@keyframes lf-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.lf-banner{height:96px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;background:var(--lf-c,#2a6cc4)}
.lf-banner::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,.08) 0 18px,transparent 18px 36px),linear-gradient(180deg,rgba(255,255,255,.18),rgba(0,0,0,.25))}
.lf-banner h1{position:relative;margin:0;font:400 40px/1 'Pacifico',var(--font-script);color:#fff;text-shadow:2px 3px 0 rgba(0,0,0,.45);letter-spacing:.5px;text-align:center;padding:0 10px}
.lf-sub{display:flex;justify-content:space-between;background:#000;padding:6px 10px;font:500 14px 'Oswald';letter-spacing:1px;text-transform:uppercase;color:#7fb8ff}
.lf-sub span:last-child{color:#fff}
.lf-rows{background:rgba(0,0,0,.72);max-height:52vh;overflow-y:auto}
.lf-row{display:flex;align-items:center;gap:8px;padding:7px 10px;font:400 17px/1.25 'Oswald';cursor:pointer;user-select:none}
.lf-row .ic{width:24px;text-align:center}
.lf-row .lb{flex:1}
.lf-row .rt{font-weight:500;color:#cfe6c8}
.lf-row.sel{background:#f0f0f0;color:#111}
.lf-row.sel .rt{color:#1b5e20}
.lf-row.dis{opacity:.45}
.lf-row.hdr{cursor:default;font:600 12px 'Oswald';letter-spacing:2px;color:#7fb8ff;text-transform:uppercase;background:rgba(0,0,0,.35)}
.lf-row .opt{display:flex;gap:6px;align-items:center}
.lf-row .opt b{font-weight:500}
.lf-row .tag{font-size:11px;letter-spacing:1px;padding:1px 6px;border:1px solid currentColor;border-radius:2px;text-transform:uppercase;opacity:.8}
.lf-desc{background:rgba(0,0,0,.85);border-top:2px solid var(--lf-c,#2a6cc4);padding:8px 10px;font:400 14px/1.35 'Oswald';color:#ddd;min-height:38px}
.lf-foot{background:rgba(0,0,0,.6);padding:5px 10px;font:400 12px 'Oswald';color:#aaa;display:flex;gap:10px;flex-wrap:wrap}
.lf-key{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;margin:0 2px;font:700 11px/1 'Oswald';color:#111;background:linear-gradient(180deg,#fff,#d9d9d9);border-radius:3px;box-shadow:0 2px 0 #7a7a7a;text-transform:uppercase}
.lf-side{position:absolute;top:56px;right:56px;width:min(300px,40vw);background:rgba(0,0,0,.72);padding:12px 14px;color:#fff;font:400 14px/1.4 'Oswald'}
.lf-side h3{margin:0 0 8px;font:400 22px 'Anton','Oswald';letter-spacing:1px}
.lf-stat{margin:6px 0}
.lf-stat .k{display:flex;justify-content:space-between;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#ccc}
.lf-stat .b{height:8px;background:rgba(255,255,255,.12);margin-top:3px;position:relative;overflow:hidden}
.lf-stat .b i{position:absolute;left:0;top:0;bottom:0;background:var(--c,#4aa4e0)}
.lf-stat .b u{position:absolute;top:0;bottom:0;background:#fff;opacity:.8}
.lf-hint{position:absolute;top:110px;left:22px;max-width:min(400px,38vw);background:rgba(0,0,0,.78);color:#fff;padding:10px 14px;font:400 15px/1.45 'Oswald';border-radius:2px;animation:lf-in .2s;pointer-events:none}
.lf-warns{position:absolute;left:304px;bottom:24px;display:flex;gap:6px;pointer-events:none}
.lf-warn{background:rgba(0,0,0,.72);color:#fff;padding:4px 8px;font:500 12px 'Oswald';letter-spacing:1px;text-transform:uppercase;border-left:3px solid #f0c850;animation:lf-pulse 1.6s infinite}
.lf-warn.bad{border-left-color:#e0453a}
@keyframes lf-pulse{50%{opacity:.6}}
.lf-splash{position:absolute;left:0;right:0;top:30%;text-align:center;pointer-events:none;animation:lf-splash 3.2s ease-out forwards}
.lf-splash .t{font:400 64px/1 'Pricedown','Anton','Oswald',Impact;color:var(--c,#f0c850);-webkit-text-stroke:2px #000;paint-order:stroke fill;text-shadow:3px 4px 0 rgba(0,0,0,.5);letter-spacing:1px;text-transform:uppercase}
.lf-splash .s{margin-top:6px;font:500 22px 'Oswald';color:#fff;text-shadow:2px 2px 0 #000}
.lf-splash .band{display:inline-block;background:linear-gradient(90deg,transparent,rgba(0,0,0,.65) 15%,rgba(0,0,0,.65) 85%,transparent);padding:10px 120px}
@keyframes lf-splash{0%{opacity:0;transform:scale(1.25)}10%{opacity:1;transform:scale(1)}82%{opacity:1}100%{opacity:0}}
.lf-heart{position:absolute;pointer-events:none;font-size:34px;animation:lf-heart 1.2s ease-out forwards;transform:translate(-50%,-50%)}
@keyframes lf-heart{0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}20%{opacity:1;transform:translate(-50%,-80%) scale(1.15)}100%{opacity:0;transform:translate(-50%,-200%) scale(.9)}}
.lf-game{position:absolute;left:50%;bottom:48px;transform:translateX(-50%);width:min(640px,94vw);background:rgba(0,0,0,.78);color:#fff;padding:14px 18px;font:400 15px 'Oswald';box-shadow:0 10px 40px rgba(0,0,0,.5);animation:lf-in .2s}
.lf-game h2{margin:0 0 4px;font:400 28px 'Anton','Oswald';letter-spacing:1px;text-transform:uppercase}
.lf-game .meta{display:flex;justify-content:space-between;color:#ccc;font-size:13px;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px}
.lf-game canvas{display:block;width:100%;background:rgba(255,255,255,.04)}
.lf-game .msg{text-align:center;margin-top:8px;min-height:22px;font:500 18px 'Oswald'}
.lf-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
.lf-panel{background:rgba(0,0,0,.86);color:#fff;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.6);font:400 15px 'Oswald'}
`;

let cssDone = false;
export function ensureCss(): void {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.id = 'lf-css';
  s.textContent = CSS;
  document.head.append(s);
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k !== null && k !== undefined) e.append(k);
  return e;
}

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
export const key = (k: string): string => `<span class="lf-key">${esc(k)}</span>`;
export const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** Container above the HUD for modal screens. */
export function layer(ctx: SystemContext): HTMLElement {
  ensureCss();
  const root = ctx.hudRoot.parentElement ?? document.body;
  const el = h('div', { class: 'lf-layer' });
  root.append(el);
  return el;
}

/**
 * Capture-phase key listener that swallows keys so the game's Input never sees
 * them (prevents e.g. Esc closing a menu and then opening the pause menu).
 */
interface KeyEntry { down: (e: KeyboardEvent) => void; up?: (e: KeyboardEvent) => void }
const keyStack: KeyEntry[] = [];
let keyHooked = false;
export function captureKeys(down: (e: KeyboardEvent) => void, up?: (e: KeyboardEvent) => void): () => void {
  if (!keyHooked) {
    keyHooked = true;
    window.addEventListener('keydown', (e) => {
      const top = keyStack[keyStack.length - 1];
      if (!top) return;
      e.stopImmediatePropagation();
      if (e.code !== 'F5' && e.code !== 'F12' && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      if (!e.repeat || e.code.startsWith('Arrow')) top.down(e);
    }, true);
    // keyups are observed but not swallowed, so the game's held-key state stays correct
    window.addEventListener('keyup', (e) => { keyStack[keyStack.length - 1]?.up?.(e); }, true);
  }
  const entry: KeyEntry = { down, up };
  keyStack.push(entry);
  return () => {
    const i = keyStack.lastIndexOf(entry);
    if (i >= 0) keyStack.splice(i, 1);
  };
}

// ---------------------------------------------------------------- menus

export interface MenuRow {
  id: string;
  label: string;
  right?: string;
  icon?: string;
  desc?: string;
  tag?: string;
  disabled?: boolean;
  header?: boolean;
  /** Left/right cycles these values. */
  options?: string[];
  optionIndex?: number;
  onChange?: (i: number) => void;
  onSelect?: () => void | 'close' | 'back' | Promise<void | 'close' | 'back'>;
  onFocus?: () => void;
}

export interface MenuDef {
  title: string;
  subtitle?: string;
  color?: string;
  rows: () => MenuRow[];
  /** Right-hand side panel (HTML) refreshed with the menu. */
  side?: () => string;
  right?: boolean;
  onBack?: () => void;
}

export interface MenuApi {
  push(def: MenuDef): void;
  pop(): void;
  close(): void;
  refresh(): void;
}

let depth = 0;
/** ctx.modal that nests safely (inner screens don't unpause the world early). */
export async function modal<T>(ctx: SystemContext, fn: () => Promise<T>): Promise<T> {
  if (depth > 0) return fn();
  depth++;
  try {
    return await ctx.modal(fn);
  } finally {
    depth--;
  }
}
export const inModal = (): boolean => depth > 0;

/** Run a GTA-style menu stack as a blocking modal. */
export function runMenu(ctx: SystemContext, root: MenuDef | ((api: MenuApi) => MenuDef)): Promise<void> {
  return modal(ctx, () => new Promise<void>((resolve) => {
    const L = layer(ctx);
    const stack: { def: MenuDef; sel: number }[] = [];
    let busy = false;
    const box = h('div', { class: 'lf-menu' });
    const side = h('div', { class: 'lf-side' });
    L.append(box);
    const close = (): void => {
      for (let i = stack.length - 1; i >= 0; i--) stack[i].def.onBack?.();
      stack.length = 0;
      release();
      L.remove();
      resolve();
    };
    const api: MenuApi = {
      push: (def) => { stack.push({ def, sel: firstSelectable(def.rows(), 0) }); render(true); },
      pop: () => {
        const top = stack.pop();
        top?.def.onBack?.();
        if (!stack.length) close(); else render(true);
      },
      close,
      refresh: () => render(false),
    };
    const release = captureKeys((e) => {
      if (busy || !stack.length) return;
      const top = stack[stack.length - 1];
      const rows = top.def.rows();
      if (e.code === 'ArrowDown' || e.code === 'KeyS') move(1, rows);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') move(-1, rows);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') cycle(-1, rows);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') cycle(1, rows);
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') void activate(rows[top.sel]);
      else if (e.code === 'Escape' || e.code === 'Backspace' || e.code === 'KeyP') { ctx.sfx('click'); api.pop(); }
    });
    const move = (d: number, rows: MenuRow[]): void => {
      const top = stack[stack.length - 1];
      let i = top.sel;
      for (let n = 0; n < rows.length; n++) {
        i = (i + d + rows.length) % rows.length;
        if (!rows[i].header) break;
      }
      top.sel = i;
      ctx.sfx('click');
      rows[i]?.onFocus?.();
      render(false);
    };
    const cycle = (d: number, rows: MenuRow[]): void => {
      const top = stack[stack.length - 1];
      const r = rows[top.sel];
      if (!r?.options?.length || r.disabled) return;
      const i = ((r.optionIndex ?? 0) + d + r.options.length) % r.options.length;
      r.onChange?.(i);
      ctx.sfx('click');
      render(false);
    };
    const activate = async (r: MenuRow | undefined): Promise<void> => {
      if (!r || r.header) return;
      if (r.disabled) { ctx.sfx('bad'); return; }
      if (r.options?.length && !r.onSelect) { cycle(1, [r]); return; }
      busy = true;
      try {
        const res = await r.onSelect?.();
        if (res === 'close') { close(); return; }
        if (res === 'back') { api.pop(); return; }
      } finally {
        busy = false;
      }
      if (stack.length) render(false);
    };
    const render = (fresh: boolean): void => {
      const top = stack[stack.length - 1];
      if (!top) return;
      const d = top.def;
      const rows = d.rows();
      if (top.sel >= rows.length) top.sel = firstSelectable(rows, 0);
      box.classList.toggle('right', !!d.right);
      box.style.setProperty('--lf-c', d.color ?? '#2a6cc4');
      const sel = rows[top.sel];
      const list = h('div', { class: 'lf-rows' });
      rows.forEach((r, i) => {
        const row = h('div', { class: `lf-row${i === top.sel ? ' sel' : ''}${r.disabled ? ' dis' : ''}${r.header ? ' hdr' : ''}` });
        if (r.icon) row.append(h('span', { class: 'ic' }, r.icon));
        row.append(h('span', { class: 'lb' }, r.label));
        if (r.tag) row.append(h('span', { class: 'tag' }, r.tag));
        if (r.options?.length) {
          row.append(h('span', { class: 'opt', html: `‹ <b>${esc(r.options[r.optionIndex ?? 0])}</b> ›` }));
        }
        if (r.right) row.append(h('span', { class: 'rt' }, r.right));
        if (!r.header) {
          row.onmouseenter = () => { if (top.sel !== i) { top.sel = i; r.onFocus?.(); render(false); } };
          row.onclick = () => { if (!busy) void activate(r); };
        }
        list.append(row);
      });
      const pos = rows.filter((r) => !r.header).indexOf(sel);
      const count = rows.filter((r) => !r.header).length;
      const scrollTop = box.querySelector('.lf-rows')?.scrollTop ?? 0;
      box.replaceChildren(
        h('div', { class: 'lf-banner' }, h('h1', {}, d.title)),
        h('div', { class: 'lf-sub' }, h('span', {}, d.subtitle ?? ''), h('span', {}, count ? `${pos + 1}/${count}` : '')),
        list,
        h('div', { class: 'lf-desc' }, sel?.desc ?? ''),
        h('div', { class: 'lf-foot', html: `${key('↑')}${key('↓')} Select &nbsp; ${key('Enter')} Confirm &nbsp; ${key('←')}${key('→')} Change &nbsp; ${key('Esc')} Back` }),
      );
      if (!fresh) list.scrollTop = scrollTop;
      const selEl = list.children[top.sel] as HTMLElement | undefined;
      if (selEl) {
        const lt = selEl.offsetTop, lb = lt + selEl.offsetHeight;
        if (lt < list.scrollTop) list.scrollTop = lt;
        else if (lb > list.scrollTop + list.clientHeight) list.scrollTop = lb - list.clientHeight;
      }
      if (d.side) {
        side.innerHTML = d.side();
        if (!side.isConnected) L.append(side);
        side.style.display = d.right ? 'none' : '';
      } else side.remove();
      if (fresh) sel?.onFocus?.();
    };
    ctx.sfx('open');
    api.push(typeof root === 'function' ? root(api) : root);
  }));
}

function firstSelectable(rows: MenuRow[], from: number): number {
  for (let i = from; i < rows.length; i++) if (!rows[i].header) return i;
  return 0;
}

// ---------------------------------------------------------------- HUD bits

export function statBar(label: string, value: number, color: string, extra = '', gain = 0): string {
  const v = Math.max(0, Math.min(100, value));
  const g = Math.max(0, Math.min(100 - v, gain));
  return `<div class="lf-stat" style="--c:${color}"><div class="k"><span>${esc(label)}</span><span>${extra || Math.round(v)}</span></div><div class="b"><i style="width:${v}%"></i>${g > 0 ? `<u style="left:${v}%;width:${g}%"></u>` : ''}</div></div>`;
}

/** GTA "big message" splash (e.g. NEW PERSONAL BEST). Non-blocking. */
export function splash(ctx: SystemContext, title: string, sub = '', color = '#f0c850'): void {
  ensureCss();
  const el = h('div', { class: 'lf-splash', style: `--c:${color}` }, h('div', { class: 'band' }, h('div', { class: 't' }, title), sub ? h('div', { class: 's' }, sub) : null));
  (ctx.hudRoot.parentElement ?? document.body).append(el);
  setTimeout(() => el.remove(), 3300);
}

/** Floating heart/emoji at a screen point (pets, likes). */
export function popEmoji(ctx: SystemContext, sx: number, sy: number, emoji = '❤️'): void {
  ensureCss();
  const el = h('div', { class: 'lf-heart', style: `left:${sx}px;top:${sy}px` }, emoji);
  ctx.hudRoot.append(el);
  setTimeout(() => el.remove(), 1300);
}

/** A persistent help box (top-left, under the interaction prompt). Returns setter. */
export class HintBox {
  private el: HTMLElement | null = null;
  private text = '';
  constructor(private ctx: SystemContext) {}
  set(html: string | null): void {
    if (!html) { this.el?.remove(); this.el = null; this.text = ''; return; }
    if (html === this.text && this.el) return;
    this.text = html;
    ensureCss();
    if (!this.el) { this.el = h('div', { class: 'lf-hint' }); this.ctx.hudRoot.append(this.el); }
    this.el.innerHTML = html;
  }
  visible(v: boolean): void { if (this.el) this.el.style.display = v ? '' : 'none'; }
}

export const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
