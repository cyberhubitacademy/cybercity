import type { Prompt } from './Locomotion';

// GTA-style movement HUD: breath bar above the radar while underwater, a
// stealth pill while crouched, and keycap prompts (vault, climb, parachute...).

const CSS = `
.mv-hud { position:absolute; inset:0; pointer-events:none; font-family:'Oswald', var(--font-ui), sans-serif; }
.mv-hud.hidden { display:none; }
.mv-breath { position:absolute; left:22px; bottom:206px; width:270px; opacity:0; transition:opacity .35s; }
.mv-breath.show { opacity:1; }
.mv-breath .lbl { font:600 11px 'Oswald',sans-serif; letter-spacing:2px; color:#cfefff; text-shadow:1px 1px 0 #000; margin-bottom:2px; display:flex; justify-content:space-between; }
.mv-breath .bar { height:7px; background:rgba(0,0,0,.6); overflow:hidden; }
.mv-breath .bar > div { height:100%; width:100%; background:linear-gradient(90deg,#2f8fe0,#7fd6ff); transition:width .12s linear; }
.mv-breath.low .bar > div { background:#e0453a; animation:mv-blink .5s infinite; }
.mv-stealth { position:absolute; left:302px; bottom:24px; display:flex; align-items:center; gap:7px; padding:5px 10px 5px 8px;
  background:rgba(0,0,0,.72); color:#fff; font:600 12px 'Oswald',sans-serif; letter-spacing:2px; opacity:0; transform:translateY(6px);
  transition:opacity .2s, transform .2s; }
.mv-stealth.show { opacity:1; transform:none; }
.mv-stealth svg { width:20px; height:14px; }
.mv-stealth .noise { width:34px; height:5px; background:rgba(255,255,255,.18); overflow:hidden; }
.mv-stealth .noise > div { height:100%; background:#f0c850; transition:width .15s; }
.mv-prompts { position:absolute; left:50%; bottom:108px; transform:translateX(-50%); display:flex; gap:8px; }
.mv-prompt { display:flex; align-items:center; gap:7px; background:rgba(0,0,0,.72); color:#fff; padding:5px 11px 5px 6px;
  font:400 15px 'Oswald',sans-serif; letter-spacing:.4px; animation:mv-pop .18s ease-out; }
.mv-prompt kbd { min-width:22px; padding:1px 6px; background:#f4f4f4; color:#111; border-radius:3px; font:700 12px 'Oswald',sans-serif;
  text-align:center; box-shadow:0 2px 0 #888; }
.mv-alt { position:absolute; right:24px; top:50%; transform:translateY(-50%); text-align:right; color:#fff; opacity:0; transition:opacity .3s;
  text-shadow:2px 2px 0 #000; }
.mv-alt.show { opacity:1; }
.mv-alt .v { font:400 40px/1 'Anton','Oswald',sans-serif; }
.mv-alt .k { font:600 12px 'Oswald',sans-serif; letter-spacing:2px; color:#d6d6d6; }
@keyframes mv-blink { 50% { opacity:.35; } }
@keyframes mv-pop { from { opacity:0; transform:translateY(6px) scale(.96); } to { opacity:1; transform:none; } }
`;

export interface HudState {
  visible: boolean;
  breath: number | null; // 0..1 or null when not underwater
  scuba: boolean;
  crouched: boolean;
  noise: number;
  prompts: readonly Prompt[];
  altitude: number | null;
}

export class MovementHud {
  private root = document.createElement('div');
  private breath = document.createElement('div');
  private breathFill = document.createElement('div');
  private breathVal = document.createElement('span');
  private stealth = document.createElement('div');
  private noiseFill = document.createElement('div');
  private prompts = document.createElement('div');
  private alt = document.createElement('div');
  private altV = document.createElement('div');
  private lastPrompts = '';

  constructor(parent: HTMLElement) {
    if (!document.getElementById('mv-hud-css')) {
      const st = document.createElement('style');
      st.id = 'mv-hud-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    this.root.className = 'mv-hud';
    this.breath.className = 'mv-breath';
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    const name = document.createElement('span');
    name.textContent = 'AIR';
    lbl.append(name, this.breathVal);
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.append(this.breathFill);
    this.breath.append(lbl, bar);

    this.stealth.className = 'mv-stealth';
    this.stealth.innerHTML = '<svg viewBox="0 0 20 14"><path d="M1 7 Q10 -2 19 7 Q10 16 1 7Z" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="10" cy="7" r="2.6" fill="#fff"/></svg><span>STEALTH</span>';
    const noise = document.createElement('div');
    noise.className = 'noise';
    noise.append(this.noiseFill);
    this.stealth.append(noise);

    this.prompts.className = 'mv-prompts';
    this.alt.className = 'mv-alt';
    const k = document.createElement('div');
    k.className = 'k';
    k.textContent = 'ALTITUDE';
    this.altV.className = 'v';
    this.alt.append(this.altV, k);
    this.root.append(this.breath, this.stealth, this.prompts, this.alt);
    parent.append(this.root);
  }

  update(s: HudState): void {
    this.root.classList.toggle('hidden', !s.visible);
    if (!s.visible) return;
    const showBreath = s.breath !== null;
    this.breath.classList.toggle('show', showBreath);
    if (s.breath !== null) {
      this.breathFill.style.width = `${Math.round((s.scuba ? 1 : s.breath) * 100)}%`;
      this.breathVal.textContent = s.scuba ? 'SCUBA' : `${Math.round(s.breath * 100)}%`;
      this.breath.classList.toggle('low', !s.scuba && s.breath < 0.25);
    }
    this.stealth.classList.toggle('show', s.crouched);
    this.noiseFill.style.width = `${Math.round(Math.min(1, s.noise) * 100)}%`;
    const key = s.prompts.map((p) => p.key + p.text).join('|');
    if (key !== this.lastPrompts) {
      this.lastPrompts = key;
      this.prompts.replaceChildren(...s.prompts.slice(0, 4).map((p) => {
        const el = document.createElement('div');
        el.className = 'mv-prompt';
        const kb = document.createElement('kbd');
        kb.textContent = p.key;
        const t = document.createElement('span');
        t.textContent = p.text;
        el.append(kb, t);
        return el;
      }));
    }
    this.alt.classList.toggle('show', s.altitude !== null);
    if (s.altitude !== null) this.altV.textContent = `${Math.max(0, Math.round(s.altitude))} m`;
  }

  dispose(): void {
    this.root.remove();
  }
}
