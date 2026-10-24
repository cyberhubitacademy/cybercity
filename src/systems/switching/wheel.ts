import { CHAR_IDS, PLAYABLE, type CharId } from './characters';

// GTA-style character wheel HUD: a dark translucent disc with a portrait per
// character (stylised initials in their colour), the one you're on marked
// "current", the hovered one lit up, and the hovered character's bio below.
// Plus the full-screen tint/vignette used during the sky-cam switch.

const CSS = `
.sw-wheel{position:absolute;left:50%;top:50%;width:420px;height:420px;margin:-210px 0 0 -210px;border-radius:50%;
  background:radial-gradient(circle,rgba(0,0,0,.25) 0 32%,rgba(0,0,0,.72) 33% 66%,rgba(0,0,0,0) 67%);
  opacity:0;transform:scale(.86);transition:opacity .14s ease-out,transform .18s cubic-bezier(.2,1.4,.4,1);pointer-events:none}
.sw-wheel.on{opacity:1;transform:scale(1)}
.sw-wheel::before{content:'';position:absolute;inset:69px;border-radius:50%;border:2px solid rgba(255,255,255,.12)}
.sw-slot{position:absolute;top:50%;width:112px;height:112px;margin-top:-56px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font:400 40px Anton,Oswald,Impact,sans-serif;letter-spacing:1px;color:#fff;border:4px solid var(--c);
  background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--c) 70%,#fff 10%),color-mix(in srgb,var(--c) 35%,#000) 75%);
  filter:grayscale(.75) brightness(.7);transition:transform .12s,filter .12s,box-shadow .12s;text-shadow:0 2px 6px rgba(0,0,0,.6)}
.sw-slot.l{left:22px}.sw-slot.r{right:22px}
.sw-slot.sel{filter:none;transform:scale(1.14);box-shadow:0 0 0 4px rgba(255,255,255,.9),0 0 28px var(--c)}
.sw-slot .tag{position:absolute;bottom:-26px;left:50%;transform:translateX(-50%);white-space:nowrap;font:600 13px Oswald,sans-serif;letter-spacing:1px;text-transform:uppercase}
.sw-slot .cur{position:absolute;top:-22px;left:50%;transform:translateX(-50%);font:600 11px Oswald,sans-serif;letter-spacing:2px;color:#ffd23f;white-space:nowrap}
.sw-mid{position:absolute;left:50%;top:50%;width:150px;transform:translate(-50%,-50%);text-align:center;color:#fff}
.sw-mid b{display:block;font:400 22px Anton,Oswald,sans-serif;letter-spacing:1px}
.sw-mid i{display:block;font:500 11px Oswald,sans-serif;letter-spacing:1px;opacity:.8;font-style:normal;text-transform:uppercase}
.sw-bio{position:absolute;left:50%;top:calc(50% + 225px);width:360px;transform:translateX(-50%);text-align:center;
  font:400 14px Oswald,sans-serif;color:#eee;background:rgba(0,0,0,.6);padding:8px 12px;border-radius:3px;opacity:0;transition:opacity .14s}
.sw-wheel.on~.sw-bio{opacity:1}
.sw-hint{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);font:500 13px Oswald,sans-serif;letter-spacing:1px;color:#fff;
  background:rgba(0,0,0,.55);padding:5px 12px;border-radius:3px;opacity:0;transition:opacity .2s}
.sw-hint.on{opacity:.85}
.sw-tint{position:absolute;inset:0;pointer-events:none;opacity:0;
  background:radial-gradient(ellipse at center,rgba(40,80,140,.10) 40%,rgba(5,10,30,.55) 100%)}
`;

export class SwitchWheel {
  private wrap: HTMLDivElement;
  private wheel: HTMLDivElement;
  private slots = new Map<CharId, HTMLDivElement>();
  private curTags = new Map<CharId, HTMLSpanElement>();
  private midName: HTMLElement;
  private midRole: HTMLElement;
  private bio: HTMLDivElement;
  private hint: HTMLDivElement;
  private tint: HTMLDivElement;
  private shown = false;
  private sel: CharId | null = null;
  private cur: CharId | null = null;
  private tintVal = -1;
  private hintOn = false;

  constructor(root: HTMLElement) {
    if (!document.getElementById('sw-style')) {
      const st = document.createElement('style');
      st.id = 'sw-style';
      st.textContent = CSS;
      document.head.append(st);
    }
    this.wrap = document.createElement('div');
    this.wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:7';
    this.tint = document.createElement('div');
    this.tint.className = 'sw-tint';
    this.wheel = document.createElement('div');
    this.wheel.className = 'sw-wheel';
    CHAR_IDS.forEach((id, i) => {
      const d = PLAYABLE[id];
      const s = document.createElement('div');
      s.className = `sw-slot ${i === 0 ? 'l' : 'r'}`;
      s.style.setProperty('--c', d.color);
      s.textContent = d.initials;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = d.name;
      const cur = document.createElement('span');
      cur.className = 'cur';
      cur.textContent = 'CURRENT';
      s.append(tag, cur);
      this.slots.set(id, s);
      this.curTags.set(id, cur);
      this.wheel.append(s);
    });
    const mid = document.createElement('div');
    mid.className = 'sw-mid';
    this.midName = document.createElement('b');
    this.midRole = document.createElement('i');
    mid.append(this.midName, this.midRole);
    this.wheel.append(mid);
    this.bio = document.createElement('div');
    this.bio.className = 'sw-bio';
    this.hint = document.createElement('div');
    this.hint.className = 'sw-hint';
    this.hint.textContent = 'SPACE / ENTER  skip';
    this.wrap.append(this.tint, this.wheel, this.bio, this.hint);
    root.append(this.wrap);
  }

  /** Show/hide the wheel; `current` is the character being played, `sel` the hovered slot. */
  set(open: boolean, current: CharId, sel: CharId): void {
    if (open !== this.shown) {
      this.shown = open;
      this.wheel.classList.toggle('on', open);
    }
    if (current !== this.cur) {
      this.cur = current;
      for (const [id, t] of this.curTags) t.style.display = id === current ? '' : 'none';
    }
    if (sel !== this.sel) {
      this.sel = sel;
      for (const [id, s] of this.slots) s.classList.toggle('sel', id === sel);
      const d = PLAYABLE[sel];
      this.midName.textContent = d.name.split(' ')[0].toUpperCase();
      this.midRole.textContent = d.role;
      this.bio.textContent = d.bio;
    }
  }

  /** Full-screen blue vignette strength during the switch (0 hides it). */
  setTint(v: number, skipHint: boolean): void {
    if (skipHint !== this.hintOn) {
      this.hintOn = skipHint;
      this.hint.classList.toggle('on', skipHint);
    }
    const q = Math.round(v * 50) / 50;
    if (q === this.tintVal) return;
    this.tintVal = q;
    this.tint.style.opacity = String(q);
  }

  dispose(): void {
    this.wrap.remove();
  }
}
