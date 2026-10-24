// GTA-style menu kit for VEHICLES+ screens (garage, customs, dealership,
// interaction menu, races, taxi). Keyboard (arrows/W/S, Enter, Esc/Backspace)
// and mouse. Shared by the garage, racing and transit systems.

export const MENU_CLOSE = Symbol('menu-close');

export interface MenuItem {
  label: string;
  /** Right-aligned value (price, status). */
  right?: string;
  desc?: string;
  disabled?: boolean;
  /** Color swatch shown before the label. */
  swatch?: string;
  /** Selected: may return MENU_CLOSE to close this menu, or a promise (nested menu). */
  action?: () => unknown;
  /** Highlighted (live preview). */
  hover?: () => void;
}

export interface MenuOpts {
  title: string;
  subtitle?: string;
  /** Banner gradient colors. */
  accent?: [string, string];
  items: () => MenuItem[];
  /** Extra line under the list (e.g. stats). */
  footer?: () => string;
  /** Called when the menu closes (back/escape or MENU_CLOSE). */
  onClose?: () => void;
  /** Screen side. */
  side?: 'left' | 'right';
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
  .vp-menu{position:absolute;top:72px;width:430px;max-width:calc(100vw - 32px);pointer-events:auto;font-family:Oswald,Rajdhani,'Segoe UI',sans-serif;color:#fff;user-select:none;z-index:40;filter:drop-shadow(0 10px 30px rgba(0,0,0,.5))}
  .vp-menu.left{left:48px}.vp-menu.right{right:48px}
  .vp-banner{height:86px;display:flex;align-items:center;justify-content:center;font-family:Anton,Bungee,Impact,sans-serif;font-size:38px;letter-spacing:2px;text-transform:uppercase;text-shadow:0 0 12px rgba(255,255,255,.6),0 3px 0 rgba(0,0,0,.35)}
  .vp-sub{background:#000;padding:7px 12px;font-size:15px;letter-spacing:1px;text-transform:uppercase;display:flex;justify-content:space-between;color:#8ff4ff}
  .vp-list{background:rgba(0,0,0,.72);max-height:56vh;overflow-y:auto}
  .vp-item{display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:17px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04)}
  .vp-item .r{margin-left:auto;color:#cfd;opacity:.9;font-size:15px}
  .vp-item.sel{background:#f6f2ff;color:#111}.vp-item.sel .r{color:#222}
  .vp-item.dis{opacity:.38}
  .vp-sw{width:16px;height:16px;border-radius:3px;border:1px solid rgba(255,255,255,.5);flex:none}
  .vp-desc{background:rgba(0,0,0,.82);padding:9px 12px;font-size:14px;color:#ddd;min-height:20px;border-top:2px solid #ff2fa0;font-family:Rajdhani,'Segoe UI',sans-serif}
  .vp-foot{background:rgba(0,0,0,.6);padding:7px 12px;font-size:13px;color:#b9b0d9;font-family:Rajdhani,'Segoe UI',sans-serif}
  .vp-keys{margin-top:6px;font-size:12px;color:#ccc;text-shadow:0 1px 2px #000;font-family:Rajdhani,'Segoe UI',sans-serif}
  .vp-big{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;font-family:Anton,Bungee,Impact,sans-serif;z-index:30;animation:vpPop .35s ease-out}
  .vp-big .t{font-size:58px;letter-spacing:3px;text-transform:uppercase;-webkit-text-stroke:2px rgba(0,0,0,.6);text-shadow:0 0 18px currentColor}
  .vp-big .s{font-family:Oswald,Rajdhani,sans-serif;font-size:24px;color:#fff;text-shadow:0 2px 4px #000}
  @keyframes vpPop{0%{transform:translate(-50%,-50%) scale(1.6);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
  .vp-chip{display:inline-block;padding:1px 7px;border-radius:4px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);font-size:.85em;margin:0 2px}
  `;
  document.head.append(s);
}

const stack: { onKey: (e: KeyboardEvent) => void }[] = [];
let listening = false;
function onWindowKey(e: KeyboardEvent): void {
  const top = stack[stack.length - 1];
  if (top) top.onKey(e);
}

/** Open a menu; resolves when it closes. */
export function openMenu(root: HTMLElement, opts: MenuOpts): Promise<void> {
  injectStyle();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = `vp-menu ${opts.side ?? 'left'}`;
    const [c1, c2] = opts.accent ?? ['#ff2fa0', '#7b2cff'];
    const banner = document.createElement('div');
    banner.className = 'vp-banner';
    banner.style.background = `linear-gradient(120deg, ${c1}, ${c2})`;
    banner.textContent = opts.title;
    const sub = document.createElement('div');
    sub.className = 'vp-sub';
    const list = document.createElement('div');
    list.className = 'vp-list';
    const desc = document.createElement('div');
    desc.className = 'vp-desc';
    const foot = document.createElement('div');
    foot.className = 'vp-foot';
    const keys = document.createElement('div');
    keys.className = 'vp-keys';
    keys.innerHTML = '<span class="vp-chip">↑↓</span> select &nbsp; <span class="vp-chip">Enter</span> choose &nbsp; <span class="vp-chip">Esc</span> back';
    el.append(banner, sub, list, desc, foot, keys);
    root.append(el);
    let sel = 0;
    let items: MenuItem[] = [];
    let busy = false;
    let closed = false;

    const render = (): void => {
      items = opts.items();
      if (sel >= items.length) sel = Math.max(0, items.length - 1);
      list.textContent = '';
      items.forEach((it, i) => {
        const row = document.createElement('div');
        row.className = `vp-item${i === sel ? ' sel' : ''}${it.disabled ? ' dis' : ''}`;
        if (it.swatch) {
          const sw = document.createElement('span');
          sw.className = 'vp-sw';
          sw.style.background = it.swatch;
          row.append(sw);
        }
        const l = document.createElement('span');
        l.textContent = it.label;
        row.append(l);
        if (it.right) {
          const r = document.createElement('span');
          r.className = 'r';
          r.textContent = it.right;
          row.append(r);
        }
        row.onmouseenter = () => { if (sel !== i) { sel = i; refreshSel(); } };
        row.onclick = () => { sel = i; void choose(); };
        list.append(row);
      });
      sub.innerHTML = `<span>${escapeHtml(opts.subtitle ?? '')}</span><span>${items.length ? sel + 1 : 0}/${items.length}</span>`;
      const f = opts.footer?.() ?? '';
      foot.style.display = f ? '' : 'none';
      foot.innerHTML = f;
      refreshSel();
    };
    const refreshSel = (): void => {
      [...list.children].forEach((c, i) => c.classList.toggle('sel', i === sel));
      const it = items[sel];
      desc.textContent = it?.desc ?? '';
      desc.style.display = it?.desc ? '' : 'none';
      (list.children[sel] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
      const s = sub.lastElementChild;
      if (s) s.textContent = `${items.length ? sel + 1 : 0}/${items.length}`;
      it?.hover?.();
    };
    const close = (): void => {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      el.remove();
      opts.onClose?.();
      resolve();
    };
    const choose = async (): Promise<void> => {
      const it = items[sel];
      if (!it || it.disabled || !it.action || busy) return;
      busy = true;
      el.style.visibility = 'hidden';
      try {
        const r = await it.action();
        if (r === MENU_CLOSE) { close(); return; }
      } catch (err) {
        console.error('[menu] action failed', err);
      } finally {
        busy = false;
      }
      if (!closed) {
        el.style.visibility = '';
        render();
      }
    };
    const move = (d: number): void => {
      if (!items.length) return;
      sel = (sel + d + items.length) % items.length;
      refreshSel();
    };
    const entry = {
      onKey: (e: KeyboardEvent): void => {
        if (busy) return;
        const k = e.code;
        if (k === 'ArrowUp' || k === 'KeyW') { move(-1); e.preventDefault(); }
        else if (k === 'ArrowDown' || k === 'KeyS') { move(1); e.preventDefault(); }
        else if (k === 'Enter' || k === 'Space' || k === 'KeyE' || k === 'NumpadEnter') { e.preventDefault(); void choose(); }
        else if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); e.stopPropagation(); close(); }
      },
    };
    stack.push(entry);
    if (!listening) {
      listening = true;
      window.addEventListener('keydown', onWindowKey, true);
    }
    render();
  });
}

/** Native color picker; resolves with the chosen color or null. */
export function pickColor(initial: string, onInput: (c: string) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = initial;
    inp.style.cssText = 'position:fixed;left:50%;top:50%;opacity:0;pointer-events:none';
    document.body.append(inp);
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      inp.remove();
      resolve(v);
    };
    inp.addEventListener('input', () => onInput(inp.value));
    inp.addEventListener('change', () => finish(inp.value));
    inp.addEventListener('blur', () => setTimeout(() => finish(inp.value !== initial ? inp.value : null), 200));
    inp.click();
    // some browsers never fire blur/change if the picker is dismissed: time out
    setTimeout(() => finish(inp.value !== initial ? inp.value : null), 60000);
  });
}

/** Big centered GTA-style message (e.g. STUNT JUMP, RACE WON). */
export function bigMessage(root: HTMLElement, title: string, sub: string, color = '#ffd23f', ms = 2600): void {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'vp-big';
  el.innerHTML = `<div class="t" style="color:${color}">${escapeHtml(title)}</div><div class="s">${escapeHtml(sub)}</div>`;
  root.append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 450);
  }, ms);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function ensureStyles(): void {
  injectStyle();
}
