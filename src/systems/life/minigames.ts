// Canvas minigame shell + reusable timing games (bottom-center panel, so the
// 3D scene with Rico on the equipment stays visible above it).
import type { SystemContext } from '../../game/Systems';
import { captureKeys, h, key, layer, modal } from './ui';
import {
  accuracy, comboScore, grade, needleAt, newTally, repsQuality, rhythmJudge, tallyHit, timingQuality, type Judge, type RhythmTally,
} from '../activities/scoring';

export interface GameApi {
  msg(html: string, color?: string): void;
  meta(left: string, right: string): void;
  sfx: SystemContext['sfx'];
  /** Seconds since the game started. */
  readonly t: number;
}

export interface GameSpec<R> {
  title: string;
  help: string;
  height?: number;
  /** Full-screen panel instead of bottom strip (pool, golf). */
  big?: boolean;
  start?(api: GameApi): void;
  key?(code: string, down: boolean, api: GameApi): void;
  mouse?(type: 'down' | 'up' | 'move', x: number, y: number, api: GameApi): void;
  /** Return a result to finish. */
  frame(dt: number, g: CanvasRenderingContext2D, w: number, hgt: number, api: GameApi): R | undefined;
}

/** Run a canvas minigame as a modal. Esc aborts (resolves null). */
export function playGame<R>(ctx: SystemContext, spec: GameSpec<R>): Promise<R | null> {
  return modal(ctx, () => new Promise<R | null>((resolve) => {
    const L = layer(ctx);
    const W = spec.big ? 900 : 620, H = spec.height ?? (spec.big ? 520 : 150);
    const canvas = h('canvas', { width: String(W), height: String(H) });
    const msg = h('div', { class: 'msg' });
    const metaL = h('span'), metaR = h('span');
    const panel = h('div', { class: 'lf-game', style: spec.big ? 'bottom:auto;top:50%;transform:translate(-50%,-50%);width:min(940px,96vw)' : '' },
      h('h2', {}, spec.title), h('div', { class: 'meta' }, metaL, metaR), canvas, msg,
      h('div', { class: 'lf-foot', html: `${spec.help} &nbsp; ${key('Esc')} Quit` }));
    L.append(panel);
    const g = canvas.getContext('2d')!;
    let t = 0, done = false, last = performance.now();
    const api: GameApi = {
      msg: (html, color = '#fff') => { msg.innerHTML = html; msg.style.color = color; },
      meta: (l, r) => { metaL.innerHTML = l; metaR.innerHTML = r; },
      sfx: ctx.sfx,
      get t() { return t; },
    };
    const finish = (r: R | null): void => {
      if (done) return;
      done = true;
      release();
      window.removeEventListener('mouseup', onUp);
      setTimeout(() => { L.remove(); resolve(r); }, r === null ? 0 : 450);
    };
    const release = captureKeys(
      (e) => { if (e.code === 'Escape') finish(null); else spec.key?.(e.code, true, api); },
      (e) => spec.key?.(e.code, false, api),
    );
    const pos = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
    };
    canvas.onmousedown = (e) => { const [x, y] = pos(e); spec.mouse?.('down', x, y, api); spec.key?.('Mouse', true, api); };
    const onUp = (e: MouseEvent): void => { if (!done) { const [x, y] = pos(e); spec.mouse?.('up', x, y, api); spec.key?.('Mouse', false, api); } };
    window.addEventListener('mouseup', onUp);
    canvas.onmousemove = (e) => { const [x, y] = pos(e); spec.mouse?.('move', x, y, api); };
    spec.start?.(api);
    const loop = (now: number): void => {
      if (done) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      g.clearRect(0, 0, W, H);
      const r = spec.frame(dt, g, W, H, api);
      if (r !== undefined) { finish(r); return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }));
}

// ---------------------------------------------------------------- drawing helpers

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, hh, r);
}

export function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size = 16, color = '#fff', align: CanvasTextAlign = 'center'): void {
  g.font = `600 ${size}px Oswald, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, x, y);
}

// ---------------------------------------------------------------- reps (timing bar)

export interface RepsOpts {
  title: string;
  reps: number;
  /** Needle sweeps per second (difficulty). */
  speed: number;
  /** Zone half-width 0..0.5 of the bar. */
  zone: number;
  /** Hold-to-charge then release in the zone (deadlift / pulldown) instead of a moving needle. */
  hold?: boolean;
  /** Called every frame with lift phase 0..1 (for posing Rico) and effort 0..1. */
  onPose?(phase: number, effort: number): void;
  onRep?(i: number, quality: number): void;
}

export interface RepsResult { quality: number; reps: number; misses: number }

export function repsGame(ctx: SystemContext, o: RepsOpts): Promise<RepsResult | null> {
  const q: number[] = [];
  let misses = 0, lift = 0, liftT = -1, charge = 0, holding = false, center = 0.5, zone = o.zone;
  let flash = 0, flashColor = '#fff';
  const newZone = () => { center = o.hold ? 0.72 + Math.random() * 0.18 : 0.25 + Math.random() * 0.5; zone = o.zone * (1 - q.length / (o.reps * 2.2)); };
  newZone();
  const press = (val: number, api: GameApi) => {
    if (liftT >= 0) return;
    const quality = timingQuality(val, center, zone);
    if (quality < 0) {
      misses++;
      q.push(0);
      flash = 0.5; flashColor = '#e0453a';
      api.msg('MISSED — the bar stalls!', '#e0453a');
      api.sfx('bad');
      liftT = 0.9; // a slow failed rep
    } else {
      q.push(quality);
      flash = 0.5; flashColor = quality > 0.8 ? '#f0c850' : '#72cc72';
      api.msg(quality > 0.85 ? 'PERFECT REP' : quality > 0.55 ? 'GOOD REP' : 'Ugly, but it counts', flashColor);
      api.sfx(quality > 0.85 ? 'good' : 'click');
      liftT = 0;
    }
    o.onRep?.(q.length - 1, quality);
    newZone();
  };
  return playGame<RepsResult>(ctx, {
    title: o.title,
    help: o.hold ? `Hold ${key('Space')} to lift, release in the ${'<b style="color:#72cc72">green</b>'} zone` : `Press ${key('Space')} when the needle is in the ${'<b style="color:#72cc72">green</b>'} zone`,
    start: (api) => api.msg('Get ready…'),
    key: (code, down, api) => {
      if (code !== 'Space' && code !== 'Mouse' && code !== 'Enter') return;
      if (o.hold) {
        if (down && liftT < 0) { holding = true; }
        else if (!down && holding) { holding = false; press(charge, api); charge = 0; }
      } else if (down) press(needleAt(api.t, o.speed), api);
    },
    frame: (dt, g, W, H, api) => {
      api.meta(`Rep ${Math.min(q.length + 1, o.reps)} / ${o.reps}`, `Misses ${misses}/3`);
      // lift animation: 0 -> 1 -> 0 over ~0.9 s
      if (liftT >= 0) {
        liftT += dt;
        lift = Math.sin(Math.min(1, liftT / 0.9) * Math.PI);
        if (liftT > 0.9) { liftT = -1; lift = 0; }
      }
      if (holding) charge = Math.min(1.05, charge + dt * 0.75);
      o.onPose?.(lift, holding ? charge : liftT >= 0 ? 0.5 : 0);
      // bar
      const bx = 30, by = H / 2 - 16, bw = W - 60, bh = 32;
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(bx, by, bw, bh);
      g.fillStyle = 'rgba(114,204,114,0.35)';
      g.fillRect(bx + (center - zone) * bw, by, zone * 2 * bw, bh);
      g.fillStyle = 'rgba(240,200,80,0.6)';
      g.fillRect(bx + (center - zone * 0.3) * bw, by, zone * 0.6 * bw, bh);
      const val = o.hold ? charge : needleAt(api.t, o.speed);
      if (o.hold) {
        g.fillStyle = '#4aa4e0';
        g.fillRect(bx, by + 8, Math.min(1, val) * bw, bh - 16);
      }
      g.fillStyle = '#fff';
      g.fillRect(bx + Math.min(1, val) * bw - 3, by - 8, 6, bh + 16);
      if (flash > 0) {
        flash -= dt;
        g.globalAlpha = flash * 2;
        g.strokeStyle = flashColor;
        g.lineWidth = 4;
        g.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
        g.globalAlpha = 1;
      }
      // rep pips
      for (let i = 0; i < o.reps; i++) {
        const c = i < q.length ? (q[i] > 0.8 ? '#f0c850' : q[i] > 0 ? '#72cc72' : '#e0453a') : 'rgba(255,255,255,0.18)';
        g.fillStyle = c;
        g.fillRect(bx + i * (bw / o.reps) + 2, H - 22, bw / o.reps - 4, 8);
      }
      if ((q.length >= o.reps || misses >= 3) && liftT < 0) return { quality: repsQuality(q), reps: q.filter((x) => x > 0).length, misses };
      return undefined;
    },
  });
}

// ---------------------------------------------------------------- rhythm lanes

export interface RhythmOpts {
  title: string;
  bpm: number;
  /** Seconds of play. */
  duration: number;
  lanes: { code: string[]; label: string; color: string }[];
  /** Note pattern generator: returns lane index for beat n, or -1 for rest. */
  pattern?(beat: number): number;
  onHit?(lane: number, j: Judge): void;
  onBeat?(beat: number): void;
  help?: string;
  height?: number;
}

export interface RhythmResult { tally: RhythmTally; accuracy: number; grade: string }

export function rhythmGame(ctx: SystemContext, o: RhythmOpts): Promise<RhythmResult | null> {
  const beat = 60 / o.bpm;
  const notes: { t: number; lane: number; hit: boolean }[] = [];
  const lead = 2; // seconds of count-in
  for (let n = 0; (n * beat) < o.duration; n++) {
    const lane = o.pattern ? o.pattern(n) : n % o.lanes.length;
    if (lane >= 0) notes.push({ t: lead + n * beat, lane, hit: false });
  }
  const tally = newTally();
  let lastBeat = -1;
  const fx: { lane: number; text: string; color: string; life: number }[] = [];
  const hitLine = 0.82;
  const travel = 1.6; // seconds a note is visible
  return playGame<RhythmResult>(ctx, {
    title: o.title,
    height: o.height ?? 230,
    help: o.help ?? o.lanes.map((l) => key(l.label)).join(' '),
    key: (code, down, api) => {
      if (!down) return;
      const lane = o.lanes.findIndex((l) => l.code.includes(code));
      if (lane < 0) return;
      let best: (typeof notes)[number] | null = null, bd = Infinity;
      for (const n of notes) {
        if (n.hit || n.lane !== lane) continue;
        const d = Math.abs(n.t - api.t);
        if (d < bd) { bd = d; best = n; }
      }
      const j: Judge = best ? rhythmJudge(bd * 1000) : 'miss';
      if (best && j !== 'miss') best.hit = true;
      tallyHit(tally, j);
      fx.push({ lane, text: j.toUpperCase(), color: j === 'perfect' ? '#f0c850' : j === 'great' ? '#72cc72' : j === 'good' ? '#4aa4e0' : '#e0453a', life: 0.6 });
      api.sfx(j === 'miss' ? 'bad' : 'click');
      o.onHit?.(lane, j);
    },
    frame: (dt, g, W, H, api) => {
      const t = api.t;
      const b = Math.floor((t - lead) / beat);
      if (b !== lastBeat && t >= lead) { lastBeat = b; o.onBeat?.(b); }
      api.meta(`Score ${tally.score}`, `Combo ×${tally.combo}`);
      if (t < lead) api.msg(t < lead - 1 ? 'Ready…' : 'GO!', '#f0c850');
      const lw = Math.min(110, (W - 40) / o.lanes.length);
      const x0 = (W - lw * o.lanes.length) / 2;
      o.lanes.forEach((l, i) => {
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)';
        g.fillRect(x0 + i * lw, 0, lw - 4, H);
        label(g, l.label, x0 + i * lw + lw / 2 - 2, H * hitLine + 22, 14, l.color);
      });
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(x0, H * hitLine - 2, lw * o.lanes.length - 4, 4);
      for (const n of notes) {
        if (!n.hit && t - n.t > 0.15) { n.hit = true; tallyHit(tally, 'miss'); fx.push({ lane: n.lane, text: 'MISS', color: '#e0453a', life: 0.5 }); o.onHit?.(n.lane, 'miss'); }
        if (n.hit) continue;
        const y = H * hitLine - ((n.t - t) / travel) * H * hitLine;
        if (y < -20 || y > H) continue;
        const l = o.lanes[n.lane];
        g.fillStyle = l.color;
        roundRect(g, x0 + n.lane * lw + 6, y - 10, lw - 16, 20, 6);
        g.fill();
      }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.life -= dt;
        if (f.life <= 0) { fx.splice(i, 1); continue; }
        g.globalAlpha = Math.min(1, f.life * 2);
        label(g, f.text, x0 + f.lane * lw + lw / 2, H * hitLine - 30 - (0.6 - f.life) * 40, 16, f.color);
        g.globalAlpha = 1;
      }
      const end = lead + o.duration + 0.6;
      if (t > end) {
        const acc = accuracy(tally);
        return { tally, accuracy: acc, grade: grade(acc) };
      }
      return undefined;
    },
  });
}

// ---------------------------------------------------------------- combo keys (punching bag)

export interface ComboOpts {
  title: string;
  rounds: number;
  length: [number, number];
  timeLimit: number;
  onPunch?(hand: 0 | 1, good: boolean): void;
}

const COMBO_KEYS = [
  { code: 'ArrowLeft', label: '←' }, { code: 'ArrowUp', label: '↑' }, { code: 'ArrowRight', label: '→' }, { code: 'ArrowDown', label: '↓' },
];

export function comboGame(ctx: SystemContext, o: ComboOpts): Promise<{ quality: number } | null> {
  let round = 0, seq: number[] = [], idx = 0, roundT = 0, correct = 0, total = 0, wait = 0.8;
  const scores: number[] = [];
  const next = () => {
    const n = o.length[0] + Math.floor(Math.random() * (o.length[1] - o.length[0] + 1));
    seq = Array.from({ length: n }, () => Math.floor(Math.random() * 4));
    idx = 0; roundT = 0; correct = 0; total = n;
  };
  next();
  return playGame<{ quality: number }>(ctx, {
    title: o.title,
    help: `Hit the combo with ${key('←')}${key('↑')}${key('→')}${key('↓')} before time runs out`,
    key: (code, down, api) => {
      if (!down || wait > 0) return;
      const k = COMBO_KEYS.findIndex((c) => c.code === code);
      if (k < 0) return;
      const good = seq[idx] === k;
      if (good) correct++;
      o.onPunch?.((idx % 2) as 0 | 1, good);
      api.sfx(good ? 'click' : 'bad');
      idx++;
      if (idx >= seq.length) {
        const s = comboScore(correct, total, roundT, o.timeLimit);
        scores.push(s);
        api.msg(s > 0.85 ? 'FLAWLESS COMBO' : s > 0.5 ? 'Nice combo' : 'Sloppy…', s > 0.85 ? '#f0c850' : s > 0.5 ? '#72cc72' : '#e0453a');
        round++;
        wait = 0.7;
        next();
      }
    },
    frame: (dt, g, W, H, api) => {
      api.meta(`Round ${Math.min(round + 1, o.rounds)} / ${o.rounds}`, '');
      if (wait > 0) { wait -= dt; if (round >= o.rounds && wait <= 0) return { quality: scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length) }; }
      else {
        roundT += dt;
        if (roundT > o.timeLimit) {
          scores.push(comboScore(correct, total, o.timeLimit, o.timeLimit) * 0.6);
          api.msg('Too slow!', '#e0453a');
          api.sfx('bad');
          round++; wait = 0.7; next();
        }
      }
      if (round >= o.rounds) return wait <= 0 ? { quality: scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length) } : undefined;
      const s = 54, gap = 10;
      const x0 = (W - seq.length * (s + gap)) / 2;
      seq.forEach((k, i) => {
        g.fillStyle = i < idx ? 'rgba(114,204,114,0.35)' : i === idx ? '#f0f0f0' : 'rgba(255,255,255,0.12)';
        roundRect(g, x0 + i * (s + gap), 26, s, s, 8);
        g.fill();
        label(g, COMBO_KEYS[k].label, x0 + i * (s + gap) + s / 2, 26 + s / 2, 30, i === idx ? '#111' : '#fff');
      });
      const left = Math.max(0, 1 - roundT / o.timeLimit);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(30, H - 30, W - 60, 8);
      g.fillStyle = left > 0.3 ? '#4aa4e0' : '#e0453a';
      g.fillRect(30, H - 30, (W - 60) * left, 8);
      return undefined;
    },
  });
}

/** Results card shown after an activity. Resolves on any key/click. */
export function resultCard(ctx: SystemContext, title: string, rowsHtml: string, color = '#f0c850'): Promise<void> {
  return modal(ctx, () => new Promise<void>((resolve) => {
    const L = layer(ctx);
    const card = h('div', { class: 'lf-panel', style: `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:min(420px,92vw);text-align:center;border-top:4px solid ${color};animation:lf-in .2s` });
    card.innerHTML = `<div style="font:400 44px 'Anton','Oswald';color:${color};-webkit-text-stroke:1px #000;letter-spacing:1px;text-transform:uppercase">${title}</div><div style="margin:10px 0 12px;text-align:left">${rowsHtml}</div><div class="lf-foot" style="justify-content:center">${key('Enter')} Continue</div>`;
    L.append(card);
    ctx.sfx('passed');
    let ok = false;
    setTimeout(() => { ok = true; }, 250);
    const close = () => { if (!ok) return; release(); L.remove(); resolve(); };
    const release = captureKeys(() => close());
    card.onclick = close;
  }));
}
