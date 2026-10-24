// Canvas minigames for activities: fishing, basketball, pool (8-ball), mini-golf, bar shots.
import type { SystemContext } from '../../game/Systems';
import { key } from '../life/ui';
import { label, playGame, roundRect } from '../life/minigames';
import {
  biteDelay, fishValue, newReel, reelStep, rollSpecies, rollWeight, strikeWindow, type Species,
} from './fishing';
import { idealPower, shotOutcome, shotPoints, timingQuality, needleAt } from './scoring';
import {
  HOLES, POCKETS, TABLE, aiAim, golfScoreName, isSolid, isStripe, judgeShot, moving, putt, rack, shoot, stepGolf, stepPool,
  type GolfBall, type Group,
} from './physics2d';

// ---------------------------------------------------------------- fishing

export interface FishView {
  phase: 'aim' | 'wait' | 'bite' | 'reel' | 'done';
  cast: number;
  /** Bobber dip 0..1 */
  dip: number;
  tension: number;
}

export interface Catch { species: Species; weight: number; value: number }

export function fishingGame(ctx: SystemContext, view: FishView, luck = 0): Promise<Catch | 'snap' | null> {
  const rnd = Math.random;
  let phase: FishView['phase'] = 'aim';
  let charge = 0, holding = false, wait = 0, biteT = 0, window = 0;
  let sp: Species | null = null;
  const reel = newReel();
  let surge = 0.5, surgeT = 0, endT = 0;
  let result: Catch | 'snap' | null = null;
  const set = (p: FishView['phase']) => { phase = p; view.phase = p; };
  set('aim');
  return playGame<Catch | 'snap'>(ctx, {
    title: 'Fishing · Starlight Pier',
    height: 170,
    help: `${key('Space')} hold to cast · wait · strike when it bites · hold to reel, keep tension in the green`,
    start: (api) => api.msg('Hold Space to charge your cast'),
    key: (code, down, api) => {
      if (code !== 'Space' && code !== 'Mouse' && code !== 'Enter') return;
      if (phase === 'aim') {
        if (down) holding = true;
        else if (holding) {
          holding = false;
          view.cast = charge;
          wait = biteDelay(rnd, charge, ctx.world.hour);
          set('wait');
          api.msg('…waiting for a bite', '#9fd8ff');
          api.sfx('whoosh');
        }
      } else if (phase === 'wait' && down) {
        api.msg('Too early! The fish got spooked. Recast.', '#e0453a');
        api.sfx('bad');
        charge = 0;
        set('aim');
      } else if (phase === 'bite' && down) {
        set('reel');
        holding = true;
        api.msg(`Hooked something! Reel it in!`, '#f0c850');
        api.sfx('good');
      } else if (phase === 'reel') holding = down;
    },
    frame: (dt, g, W, H, api) => {
      // water
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#0d3b66'); gr.addColorStop(1, '#06223d');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) {
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.beginPath();
        for (let x = 0; x <= W; x += 20) g.lineTo(x, 30 + i * 22 + Math.sin(x * 0.03 + api.t * 2 + i) * 3);
        g.stroke();
      }
      api.meta(ctx.world.hour >= 20 || ctx.world.hour < 6 ? 'Night fishing 🌙' : 'Day fishing ☀️', phase === 'reel' && sp ? `${sp.rarity.toUpperCase()}?` : '');
      if (phase === 'aim') {
        if (holding) charge = (Math.sin(api.t * 3) * 0.5 + 0.5);
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(30, H - 34, W - 60, 14);
        g.fillStyle = '#f0c850'; g.fillRect(30, H - 34, (W - 60) * charge, 14);
        label(g, 'CAST POWER', W / 2, H - 48, 13, '#ddd');
      } else if (phase === 'wait' || phase === 'bite') {
        const bx = 120 + view.cast * (W - 240), by = H / 2 + Math.sin(api.t * 2) * 3 + view.dip * 10;
        g.fillStyle = '#e0453a'; g.beginPath(); g.arc(bx, by, 8, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by - 4, 5, Math.PI, 0); g.fill();
        if (phase === 'wait') {
          wait -= dt;
          view.dip = 0;
          if (wait <= 0) {
            sp = rollSpecies(rnd, ctx.world.hour, luck);
            window = strikeWindow(sp);
            biteT = 0;
            set('bite');
            api.msg('<b>!! BITE !!</b> — press Space!', '#f0c850');
            api.sfx('alert');
          }
        } else {
          biteT += dt;
          view.dip = Math.abs(Math.sin(biteT * 18));
          label(g, '!', bx, by - 26, 34, '#f0c850');
          if (biteT > window) { api.msg('Missed the strike. It swam off. Recast.', '#e0453a'); api.sfx('bad'); charge = 0; set('aim'); }
        }
      } else if (phase === 'reel' && sp) {
        surgeT -= dt;
        if (surgeT <= 0) { surgeT = 0.6 + rnd() * 1.2; surge = rnd(); }
        reelStep(reel, dt, holding, sp.fight, surge);
        view.tension = reel.tension;
        view.dip = reel.pull;
        // tension gauge
        const gx = 30, gw = W - 60, gy = 40;
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(gx, gy, gw, 18);
        g.fillStyle = 'rgba(114,204,114,0.4)'; g.fillRect(gx + gw * 0.3, gy, gw * 0.5, 18);
        g.fillStyle = 'rgba(224,69,58,0.5)'; g.fillRect(gx + gw * 0.88, gy, gw * 0.12, 18);
        g.fillStyle = '#fff'; g.fillRect(gx + gw * Math.min(1, reel.tension) - 3, gy - 5, 6, 28);
        label(g, 'LINE TENSION', W / 2, gy - 12, 12, '#ddd');
        // progress
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(gx, H - 40, gw, 12);
        g.fillStyle = '#4aa4e0'; g.fillRect(gx, H - 40, gw * reel.progress, 12);
        label(g, `🐟 ${Math.round(reel.progress * 100)}%`, W / 2, H - 54, 13, '#ddd');
        if (reel.landed && !result) {
          const w = rollWeight(rnd, sp);
          result = { species: sp, weight: w, value: fishValue(sp, w) };
          set('done');
          api.msg(`Caught a <b>${sp.name}</b> — ${w} kg!`, '#72cc72');
          api.sfx('passed');
          endT = 1.4;
        } else if (reel.snapped && !result) {
          result = 'snap';
          set('done');
          api.msg(reel.tension >= 1 ? 'SNAP! The line broke.' : 'It got away…', '#e0453a');
          api.sfx('failed');
          endT = 1.2;
        }
      } else if (phase === 'done') {
        endT -= dt;
        if (endT <= 0 && result) return result;
      }
      return undefined;
    },
  });
}

// ---------------------------------------------------------------- basketball

export interface HoopView {
  spot: number;
  /** Active shot: 0..1 flight progress and outcome. */
  shot: { t: number; outcome: string } | null;
  charging: number;
}

export const HOOP_SPOTS = [
  { name: 'Layup', dist: 1.6, ang: 0.6 }, { name: 'Free throw', dist: 4.6, ang: 0 }, { name: 'Elbow', dist: 5, ang: -0.8 },
  { name: 'Corner three', dist: 6.8, ang: 1.25 }, { name: 'Top of the key three', dist: 7.2, ang: 0 },
];

export function basketballGame(ctx: SystemContext, view: HoopView, skill: number): Promise<{ points: number; made: number; shots: number } | null> {
  const SHOTS = 10;
  let shots = 0, made = 0, points = 0, charge = 0, holding = false, flight = -1, outcome = '', streak = 0;
  view.spot = 1;
  return playGame<{ points: number; made: number; shots: number }>(ctx, {
    title: 'Beach Court Shootout',
    help: `${key('A')}${key('D')} change spot · hold ${key('Space')} and release at the ideal power`,
    key: (code, down, api) => {
      if (flight >= 0) return;
      if (down && (code === 'KeyA' || code === 'ArrowLeft')) { view.spot = Math.max(0, view.spot - 1); api.sfx('click'); }
      if (down && (code === 'KeyD' || code === 'ArrowRight')) { view.spot = Math.min(HOOP_SPOTS.length - 1, view.spot + 1); api.sfx('click'); }
      if (code === 'Space' || code === 'Mouse') {
        if (down) { holding = true; charge = 0; }
        else if (holding) {
          holding = false;
          const s = HOOP_SPOTS[view.spot];
          outcome = shotOutcome(charge, idealPower(s.dist), skill);
          flight = 0;
          view.shot = { t: 0, outcome };
          shots++;
          api.sfx('whoosh');
        }
      }
    },
    frame: (dt, g, W, H, api) => {
      const s = HOOP_SPOTS[view.spot];
      api.meta(`Shot ${Math.min(shots + (flight >= 0 ? 0 : 1), SHOTS)}/${SHOTS} · ${s.name}`, `${points} pts · ${made} made`);
      if (holding) charge = Math.min(1, charge + dt * 0.8);
      view.charging = holding ? charge : 0;
      const ideal = idealPower(s.dist);
      const bx = 30, bw = W - 60, by = 50;
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(bx, by, bw, 26);
      g.fillStyle = 'rgba(114,204,114,0.45)'; g.fillRect(bx + (ideal - 0.06) * bw, by, 0.12 * bw, 26);
      g.fillStyle = 'rgba(240,200,80,0.7)'; g.fillRect(bx + (ideal - 0.03) * bw, by, 0.06 * bw, 26);
      g.fillStyle = '#ff8a3d'; g.fillRect(bx, by + 6, bw * charge, 14);
      label(g, 'POWER', W / 2, by - 12, 13, '#ddd');
      HOOP_SPOTS.forEach((sp, i) => label(g, sp.name, bx + (i + 0.5) * (bw / HOOP_SPOTS.length), H - 26, 13, i === view.spot ? '#f0c850' : 'rgba(255,255,255,0.45)'));
      if (flight >= 0) {
        flight += dt / 1.1;
        if (view.shot) view.shot.t = Math.min(1, flight);
        if (flight >= 1) {
          flight = -1;
          view.shot = null;
          const pts = shotPoints(s.dist, outcome);
          if (pts) { made++; streak++; points += pts + (streak >= 3 ? 1 : 0); api.msg(outcome === 'swish' ? `SWISH! +${pts}${streak >= 3 ? ' 🔥 streak bonus' : ''}` : `Bank shot! +${pts}`, '#72cc72'); api.sfx('good'); }
          else { streak = 0; api.msg(outcome === 'rim' ? 'Rimmed out!' : 'Brick.', '#e0453a'); api.sfx('bad'); }
          charge = 0;
          if (shots >= SHOTS) return { points, made, shots };
        }
      }
      return undefined;
    },
  });
}

// ---------------------------------------------------------------- pool

export function poolGame(ctx: SystemContext, opponent: string, aiSkill = 0.55): Promise<{ win: boolean } | null> {
  const balls = rack();
  const cue = balls[0];
  let turn: 0 | 1 = 0; // 0 = Rico
  const groups: [Group, Group] = [null, null];
  let aim = 0, power = 0, charging = false, rolling = false, firstHit: number | null = null, potted: number[] = [], aiT = 0;
  let mouse: [number, number] | null = null;
  let over: { win: boolean } | null = null, endT = 0;
  const S = 300; // px per meter
  const ox = 70, oy = 70;
  const remaining = (g: Group) => balls.filter((b) => !b.pocketed && (g === 'solids' ? isSolid(b.id) : g === 'stripes' ? isStripe(b.id) : b.id !== 0 && b.id !== 8)).length;
  const fire = (angle: number, pw: number) => {
    shoot(cue, angle, pw);
    rolling = true; firstHit = null; potted = [];
    ctx.sfx('click');
  };
  const COLORS = ['#ffffff', '#ffd23f', '#2a6cc4', '#e0453a', '#7b2cff', '#ff8a3d', '#2e9e5b', '#8b1a1a', '#111111'];
  return playGame<{ win: boolean }>(ctx, {
    title: `8-Ball vs ${opponent}`,
    big: true,
    height: 520,
    help: `${key('Mouse')} aim · hold click / ${key('Space')} for power · ${key('A')}${key('D')} fine aim`,
    mouse: (type, x, y) => {
      if (type === 'move') mouse = [x, y];
      if (turn !== 0 || rolling) return;
      if (type === 'down') { charging = true; power = 0; }
      if (type === 'up' && charging) { charging = false; fire(aim, power); }
    },
    key: (code, down) => {
      if (turn !== 0 || rolling) return;
      if (code === 'KeyA' || code === 'ArrowLeft') { if (down) { aim -= 0.02; mouse = null; } }
      if (code === 'KeyD' || code === 'ArrowRight') { if (down) { aim += 0.02; mouse = null; } }
      if (code === 'Space') {
        if (down) { charging = true; power = 0; } else if (charging) { charging = false; fire(aim, power); }
      }
    },
    frame: (dt, g, W, _H, api) => {
      // table
      g.fillStyle = '#4a2c17'; roundRect(g, ox - 30, oy - 30, TABLE.w * S + 60, TABLE.h * S + 60, 18); g.fill();
      g.fillStyle = '#0f6b4f'; g.fillRect(ox, oy, TABLE.w * S, TABLE.h * S);
      g.fillStyle = '#000';
      for (const [px, py] of POCKETS) { g.beginPath(); g.arc(ox + px * S, oy + py * S, TABLE.pocketR * S, 0, Math.PI * 2); g.fill(); }
      // physics
      if (rolling) {
        const before = new Set(balls.filter((b) => b.pocketed).map((b) => b.id));
        // first contact detection
        const pre = balls.map((b) => [b.vx, b.vy]);
        const p = stepPool(balls, dt);
        if (firstHit === null) {
          balls.forEach((b, i) => { if (b.id !== 0 && !b.pocketed && (b.vx !== pre[i][0] || b.vy !== pre[i][1]) && Math.hypot(b.x - cue.x, b.y - cue.y) < b.r * 2.3) firstHit = b.id; });
        }
        for (const id of p) if (!before.has(id)) { potted.push(id); api.sfx(id === 0 ? 'bad' : 'pickup'); }
        if (!moving(balls)) {
          rolling = false;
          const me = turn;
          const res = judgeShot(groups[me], potted, firstHit, remaining(groups[me]));
          if (res.assigned) { groups[me] = res.assigned; groups[me ? 0 : 1] = res.assigned === 'solids' ? 'stripes' : 'solids'; api.msg(`${me === 0 ? 'You are' : `${opponent} is`} ${res.assigned}`, '#f0c850'); }
          if (cue.pocketed) { cue.pocketed = false; cue.x = TABLE.w * 0.25; cue.y = TABLE.h / 2; cue.vx = cue.vy = 0; }
          if (res.over) {
            const win = (res.over === 'win') === (me === 0);
            over = { win };
            endT = 1.6;
            api.msg(win ? '🎱 YOU WIN!' : `${opponent} wins.`, win ? '#72cc72' : '#e0453a');
            api.sfx(win ? 'passed' : 'failed');
          } else if (!res.continueTurn) {
            turn = me ? 0 : 1;
            if (res.foul) api.msg(`Foul by ${me === 0 ? 'you' : opponent}!`, '#e0453a');
            aiT = 1.0;
          } else api.msg(me === 0 ? 'Nice pot — shoot again.' : `${opponent} keeps the table.`, '#72cc72');
        }
      } else if (!over && turn === 1) {
        aiT -= dt;
        if (aiT <= 0) { const a = aiAim(balls, groups[1], Math.random, aiSkill); aim = a.angle; fire(a.angle, a.power); }
      }
      if (over) { endT -= dt; if (endT <= 0) return over; }
      // aim from mouse
      if (turn === 0 && !rolling && mouse) aim = Math.atan2(mouse[1] - (oy + cue.y * S), mouse[0] - (ox + cue.x * S));
      if (charging) power = Math.min(1, power + dt * 0.7);
      // balls
      for (const b of balls) {
        if (b.pocketed) continue;
        const x = ox + b.x * S, y = oy + b.y * S, r = b.r * S;
        g.fillStyle = b.id === 0 ? '#fff' : COLORS[b.id > 8 ? b.id - 8 : b.id];
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        if (b.id > 8) { g.fillStyle = '#fff'; g.fillRect(x - r, y - r * 0.35, r * 2, r * 0.7); g.fillStyle = COLORS[b.id - 8]; g.beginPath(); g.arc(x, y, r * 0.45, 0, Math.PI * 2); g.fill(); }
        if (b.id) { g.fillStyle = b.id === 8 ? '#fff' : '#111'; g.font = `700 ${Math.round(r)}px Oswald`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(b.id), x, y + 1); }
      }
      // cue stick + guide
      if (!rolling && !over) {
        const cx = ox + cue.x * S, cy = oy + cue.y * S;
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(aim) * 260, cy + Math.sin(aim) * 260); g.stroke(); g.setLineDash([]);
        const back = 14 + power * 60;
        g.strokeStyle = '#d9b56a'; g.lineWidth = 6;
        g.beginPath(); g.moveTo(cx - Math.cos(aim) * back, cy - Math.sin(aim) * back); g.lineTo(cx - Math.cos(aim) * (back + 250), cy - Math.sin(aim) * (back + 250)); g.stroke();
        g.lineWidth = 1;
      }
      // HUD
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(ox, oy + TABLE.h * S + 44, 300, 12);
      g.fillStyle = '#ff8a3d'; g.fillRect(ox, oy + TABLE.h * S + 44, 300 * power, 12);
      label(g, turn === 0 ? 'YOUR SHOT' : `${opponent.toUpperCase()}'S SHOT`, W - 180, oy + TABLE.h * S + 50, 18, turn === 0 ? '#f0c850' : '#9fd8ff');
      api.meta(`You: ${groups[0] ?? 'open'} (${remaining(groups[0])} left)`, `${opponent}: ${groups[1] ?? 'open'} (${remaining(groups[1])} left)`);
      return undefined;
    },
  });
}

// ---------------------------------------------------------------- mini golf

export function golfGame(ctx: SystemContext): Promise<{ strokes: number; par: number } | null> {
  let hi = 0, strokes = 0, total = 0, aim = 0, power = 0, charging = false, rolling = false, t = 0, next = -1;
  let mouse: [number, number] | null = null;
  const par = HOLES.reduce((a, h) => a + h.par, 0);
  let ball: GolfBall = { x: HOLES[0].start[0], y: HOLES[0].start[1], vx: 0, vy: 0, sunk: false };
  const S = 95, ox = 25, oy = 40;
  return playGame<{ strokes: number; par: number }>(ctx, {
    title: 'Neon Putt Mini-Golf',
    big: true,
    height: 520,
    help: `${key('Mouse')} aim · hold click / ${key('Space')} for power · ${key('A')}${key('D')} fine aim`,
    mouse: (type, x, y) => {
      if (type === 'move') mouse = [x, y];
      if (rolling || next >= 0) return;
      if (type === 'down') { charging = true; power = 0; }
      if (type === 'up' && charging) { charging = false; putt(ball, aim, power); strokes++; rolling = true; ctx.sfx('click'); }
    },
    key: (code, down) => {
      if (rolling || next >= 0) return;
      if ((code === 'KeyA' || code === 'ArrowLeft') && down) { aim -= 0.04; mouse = null; }
      if ((code === 'KeyD' || code === 'ArrowRight') && down) { aim += 0.04; mouse = null; }
      if (code === 'Space') { if (down) { charging = true; power = 0; } else if (charging) { charging = false; putt(ball, aim, power); strokes++; rolling = true; ctx.sfx('click'); } }
    },
    frame: (dt, g, W, _H, api) => {
      t += dt;
      const hole = HOLES[hi];
      api.meta(`Hole ${hi + 1}/${HOLES.length}: ${hole.name} · Par ${hole.par}`, `Strokes ${strokes} · Total ${total + strokes}`);
      // course
      g.fillStyle = '#1b4d2e'; roundRect(g, ox - 12, oy - 12, hole.w * S + 24, hole.h * S + 24, 14); g.fill();
      g.fillStyle = '#2fae5f'; g.fillRect(ox, oy, hole.w * S, hole.h * S);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let x = 0; x < hole.w; x += 0.5) g.fillRect(ox + x * S, oy, S * 0.25, hole.h * S);
      for (const s of hole.sand ?? []) { g.fillStyle = '#e8d29a'; g.fillRect(ox + s.x0 * S, oy + s.y0 * S, (s.x1 - s.x0) * S, (s.y1 - s.y0) * S); }
      for (const w of hole.walls) { g.fillStyle = '#ff2fa0'; g.fillRect(ox + w.x0 * S, oy + w.y0 * S, (w.x1 - w.x0) * S, (w.y1 - w.y0) * S); }
      if (hole.spinner) {
        const a = t * hole.spinner.speed, sp = hole.spinner;
        g.strokeStyle = '#ffd23f'; g.lineWidth = 10;
        g.beginPath(); g.moveTo(ox + (sp.x - Math.cos(a) * sp.len) * S, oy + (sp.y - Math.sin(a) * sp.len) * S); g.lineTo(ox + (sp.x + Math.cos(a) * sp.len) * S, oy + (sp.y + Math.sin(a) * sp.len) * S); g.stroke();
        g.lineWidth = 1;
        g.fillStyle = '#7b2cff'; g.beginPath(); g.arc(ox + sp.x * S, oy + sp.y * S, 12, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#111'; g.beginPath(); g.arc(ox + hole.cup[0] * S, oy + hole.cup[1] * S, 0.11 * S, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(ox + hole.cup[0] * S, oy + hole.cup[1] * S); g.lineTo(ox + hole.cup[0] * S, oy + hole.cup[1] * S - 50); g.stroke();
      g.fillStyle = '#e0453a'; g.beginPath(); g.moveTo(ox + hole.cup[0] * S, oy + hole.cup[1] * S - 50); g.lineTo(ox + hole.cup[0] * S + 24, oy + hole.cup[1] * S - 42); g.lineTo(ox + hole.cup[0] * S, oy + hole.cup[1] * S - 34); g.fill();
      // ball
      if (rolling) {
        const r = stepGolf(ball, hole, dt, t);
        if (r === 'sunk') {
          rolling = false;
          api.msg(`${golfScoreName(strokes, hole.par)} (${strokes})`, strokes <= hole.par ? '#72cc72' : '#f0c850');
          api.sfx(strokes === 1 ? 'levelup' : strokes <= hole.par ? 'good' : 'click');
          next = 1.5;
        } else if (r === 'stopped') rolling = false;
        if (!rolling && strokes >= 8 && !ball.sunk) { api.msg('Max strokes — picking it up.', '#e0453a'); next = 1.2; strokes = 9; }
      }
      if (next >= 0) {
        next -= dt;
        if (next < 0) {
          total += strokes; strokes = 0; hi++;
          if (hi >= HOLES.length) return { strokes: total, par };
          const h2 = HOLES[hi];
          ball = { x: h2.start[0], y: h2.start[1], vx: 0, vy: 0, sunk: false };
          api.msg('');
        }
      }
      if (!ball.sunk) { g.fillStyle = '#fff'; g.beginPath(); g.arc(ox + ball.x * S, oy + ball.y * S, 0.05 * S + 1, 0, Math.PI * 2); g.fill(); }
      if (!rolling && next < 0) {
        if (mouse) aim = Math.atan2(mouse[1] - (oy + ball.y * S), mouse[0] - (ox + ball.x * S));
        if (charging) power = Math.min(1, power + dt * 0.75);
        const bx = ox + ball.x * S, by = oy + ball.y * S;
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(aim) * (40 + power * 160), by + Math.sin(aim) * (40 + power * 160)); g.stroke(); g.setLineDash([]);
      }
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(ox, 470, 300, 12);
      g.fillStyle = '#ff8a3d'; g.fillRect(ox, 470, 300 * power, 12);
      label(g, 'PUTT POWER', ox + 360, 476, 14, '#ddd', 'left');
      void W;
      return undefined;
    },
  });
}

// ---------------------------------------------------------------- bar shots

/** Steady-hands shot glass slide: stop the sliding glass on the mark. 3 rounds. */
export function barGame(ctx: SystemContext, tipsy: number): Promise<{ quality: number } | null> {
  const q: number[] = [];
  let pause = 0.6;
  return playGame<{ quality: number }>(ctx, {
    title: 'Bar Slide',
    help: `Press ${key('Space')} to stop the glass on the gold mark`,
    key: (code, down, api) => {
      if (!down || (code !== 'Space' && code !== 'Mouse') || pause > 0) return;
      const pos = glassPos(api.t, tipsy);
      const qual = timingQuality(pos, 0.78, 0.09);
      q.push(Math.max(0, qual));
      api.msg(qual > 0.8 ? 'Perfect slide! 🍹' : qual > 0 ? 'Close enough.' : 'Smashed on the floor 💥', qual > 0 ? '#72cc72' : '#e0453a');
      api.sfx(qual > 0 ? 'good' : 'crash');
      pause = 0.8;
    },
    frame: (dt, g, W, H, api) => {
      api.meta(`Round ${Math.min(q.length + 1, 3)}/3`, tipsy > 0 ? 'Feeling it…' : '');
      if (pause > 0) { pause -= dt; if (q.length >= 3 && pause <= 0) return { quality: q.reduce((a, b) => a + b, 0) / 3 }; }
      g.fillStyle = '#5a3a22'; g.fillRect(20, H / 2 - 14, W - 40, 28);
      g.fillStyle = '#d4af37'; g.fillRect(20 + (W - 40) * 0.78 - 4, H / 2 - 18, 8, 36);
      const x = 20 + (W - 40) * glassPos(api.t, tipsy);
      g.fillStyle = 'rgba(180,230,255,0.8)'; g.fillRect(x - 9, H / 2 - 30, 18, 24);
      g.fillStyle = '#ff8a3d'; g.fillRect(x - 8, H / 2 - 18, 16, 11);
      return undefined;
    },
  });
}

function glassPos(t: number, tipsy: number): number {
  return Math.max(0, Math.min(1, needleAt(t, 0.55 + tipsy * 0.25) + Math.sin(t * 7) * 0.03 * tipsy));
}
