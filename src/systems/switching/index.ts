// CHARACTER SWITCHING system ('switching'): GTA V-style switching between the
// two playable Sunset Shield operatives, Rico Vega (blue team) and Maya Torres
// (red team; see characters.ts).
//  - Hold Left Alt: the character wheel (time slows, mouse / arrows pick, release
//    to switch). F5 / F6 switch straight to Rico / Maya.
//  - The switch: the camera shoots up ~250 m above the city, greys out, pans to
//    above the other character and drops down in three steps onto their back.
//    Space / Enter skips. While it plays the game counts as busy (`cinematic()`).
//  - Each character keeps their own position, health, armor, wallet, shop look and
//    weapon loadout. The active one lives in the profile / shops / combat as usual;
//    the other is stored in setData('switching') and swapped in on a switch.
//  - The character you leave stays in the world as an idle NPC (a merged one-draw-call
//    copy in their outfit colours, shown within ~150 m); left alone for a while they
//    move on to a hang-out. Each character's full player rig (separate parts, for
//    shops) is kept off-scene while they're not played.
// Other systems: `ctx.system<SwitchingSystem>('switching')?.current()` -> 'rico' | 'maya'.
import type { GameSystem, SystemContext } from '../../game/Systems';
import { createRig, type Rig } from '../../actors/CharacterModel';
import { RICO_OUTFIT } from '../../actors/Player';
import type { Outfit } from '../../actors/Humanoid';
import { DEFAULT_LOOK, type Look } from '../shops/catalog';
import type { ArsenalSave } from '../combat/weapons';
import { PLAYABLE, otherChar, type CharId, type CharSpot, type PlayableDef } from './characters';
import {
  STAY_MS, SWITCH_SWAP_AT, SWITCH_TOTAL, lifeTick, sanitizeSave, switchBlockReason, switchFrame, wheelPick,
  type CharState, type SwitchFrame, type SwitchPlan, type SwitchSave,
} from './logic';
import { SwitchWheel } from './wheel';

export { PLAYABLE, type CharId } from './characters';

// Cooperation with other systems (all optional: the game runs without them).
interface ShopsLike extends GameSystem { look(): Look; setLook(look: Look): void }
interface CombatLike extends GameSystem {
  armor: number;
  readonly arsenal: { save(): ArsenalSave; load(d: ArsenalSave | null | undefined): void };
  persist(): void;
}
interface PoliceLike extends GameSystem { readonly stars: number }
interface MovementLike extends GameSystem { readonly state: string; isSwimming(): boolean }
interface LifeLike extends GameSystem { inside?(): string | null }

/** The left-behind character is shown within this range (hysteresis: appears at SPAWN, goes at DESPAWN). */
const NPC_DESPAWN = 150;
const NPC_SPAWN = 140;
/** Game-time scale while the wheel is open. */
const WHEEL_SLOWMO = 0.35;
const AIR_STATES = new Set(['air', 'vault', 'climb', 'tumble', 'freefall', 'parachute']);

interface Transition {
  plan: SwitchPlan;
  t: number;
  target: CharId;
  dest: { x: number; y: number; z: number; yaw: number };
  swapped: boolean;
  lastDrop: number;
}

interface Npc {
  id: CharId;
  rig: Rig;
  spawned: boolean;
  yaw: number;
  waveCd: number;
}

/** Accessories off (hats, glasses, masks, beard, tattoos) so another Appearance can take the rig over. */
function bareLook(l: Look): Look {
  return { ...l, hat: null, glasses: null, mask: null, beard: 'none', tattoos: {} };
}

export class SwitchingSystem implements GameSystem {
  readonly id = 'switching';
  private ctx: SystemContext | null = null;
  private data: SwitchSave = sanitizeSave(null);
  /** Character the player's body currently is. */
  private playing: CharId = 'rico';
  private rigs: Partial<Record<CharId, Rig>> = {};
  /** Merged NPC copies of each character (one draw call), keyed by the outfit they were built from. */
  private npcRigs = new Map<CharId, { key: string; rig: Rig }>();
  private npc: Npc | null = null;
  private hud: SwitchWheel | null = null;
  private canvas: HTMLElement | null = null;
  private greyShown = -1;

  // wheel
  private wheelOpen = false;
  private altWas = false;
  private wheelCancel = false;
  private wx = 0;
  private wy = 0;
  private sel: CharId = 'rico';

  private trans: Transition | null = null;
  private readonly frame: SwitchFrame = { pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 }, grey: 0, drop: -1, done: false };
  private lastReal = performance.now();
  private tick = 0;
  private noticeAt = 0;

  // ---------------------------------------------------------------- setup

  init(ctx: SystemContext): void {
    const first = !this.ctx;
    this.ctx = ctx;
    if (first) {
      this.hud = new SwitchWheel(ctx.hudRoot);
      this.canvas = document.getElementById('game-canvas');
      window.addEventListener('keydown', this.onKey, true);
      window.addEventListener('keyup', this.onKey, true);
      window.addEventListener('mousemove', this.onMouse, { capture: true });
      window.addEventListener('blur', this.onBlur);
    }
    this.abortTransition();
    this.closeWheel();
    const p = ctx.world.player;
    // The player's original rig is Rico's (Player.ts creates it).
    if (!this.rigs.rico && this.playing === 'rico') this.rigs.rico = p.rig;

    this.data = sanitizeSave(ctx.getData('switching', null));
    // Loading a save made as the other character: become them (no transition).
    if (this.data.active !== this.playing) {
      this.hideNpc();
      this.swapBody(this.data.active, ctx.system<ShopsLike>('shops')?.look() ?? null);
      this.playing = this.data.active;
    }
    // Whoever isn't played: stored state, or their first-time defaults.
    const other = otherChar(this.playing);
    if (!this.data.chars[other]) this.data.chars[other] = this.initialState(PLAYABLE[other], Date.now());
    this.showNpc(other);
    this.sel = this.playing;
    this.persist();
  }

  // ---------------------------------------------------------------- public API

  /** Character being played. */
  current(): CharId { return this.playing; }
  /** Definition (name, bio, colours...) of the character being played. */
  currentDef(): PlayableDef { return PLAYABLE[this.playing]; }
  isSwitching(): boolean { return !!this.trans; }
  /** Start a switch (same rules as the wheel). Returns false (with a notification) if not allowed. */
  switchTo(id: CharId): boolean { return this.request(id); }

  timeScale(): number { return this.wheelOpen ? WHEEL_SLOWMO : 1; }
  cinematic(): boolean { return !!this.trans; }

  // ---------------------------------------------------------------- input

  /** Keep the browser away from Alt (menu bar focus) and F5 / F6 (reload / address bar) while playing. */
  private onKey = (e: KeyboardEvent): void => {
    if (!this.ctx?.input.captureWanted) return; // menus / modals: leave the browser's keys alone
    if (e.code === 'AltLeft' || e.code === 'AltRight' || e.code === 'F5' || e.code === 'F6') e.preventDefault();
  };

  /** While the wheel is open the mouse picks a slot instead of turning the camera. */
  private onMouse = (e: MouseEvent): void => {
    if (!this.wheelOpen) return;
    this.wx += e.movementX;
    this.wy += e.movementY;
    const len = Math.hypot(this.wx, this.wy);
    if (len > 120) { this.wx *= 120 / len; this.wy *= 120 / len; }
    e.stopImmediatePropagation();
  };

  /** Alt-Tab away: never treat the lost key-up as "release to switch". */
  private onBlur = (): void => { if (this.wheelOpen) this.wheelCancel = true; };

  // ---------------------------------------------------------------- frame

  update(dt: number, ctx: SystemContext): void {
    const input = ctx.input;
    if (input.wasPressed('F5')) this.request('rico');
    else if (input.wasPressed('F6')) this.request('maya');

    const alt = input.isDown('AltLeft') || input.isDown('AltRight');
    if (alt && !this.altWas && !this.wheelOpen && !this.trans) {
      const why = this.blockReason();
      if (why) this.notice(why);
      else this.openWheel();
    } else if (this.wheelOpen && !alt) {
      const pick = this.sel;
      const cancel = this.wheelCancel;
      this.closeWheel();
      if (!cancel && pick !== this.playing) this.request(pick);
    }
    this.altWas = alt;
    if (this.wheelOpen) {
      if (input.wasPressed('ArrowLeft')) { this.sel = 'rico'; this.wx = this.wy = 0; }
      else if (input.wasPressed('ArrowRight')) { this.sel = 'maya'; this.wx = this.wy = 0; }
      else this.sel = wheelPick(this.wx, this.wy, this.sel);
      const why = this.blockReason();
      if (why) { this.closeWheel(); this.notice(why); }
    }

    // the left-behind character lives their life (once a second)
    this.tick += dt;
    if (this.tick > 1) {
      this.tick = 0;
      const n = this.npc, st = n ? this.data.chars[n.id] : null;
      if (n && st && lifeTick(st, Date.now(), PLAYABLE[n.id].spots, n.spawned, Math.random())) {
        st.y = this.spotY(PLAYABLE[n.id].spots.find((s) => s.id === st.spot) ?? null, st.x, st.z);
        this.persist();
      }
    }
  }

  always(dt: number, ctx: SystemContext): void {
    const now = performance.now();
    const real = Math.min(0.25, (now - this.lastReal) / 1000); // real time: the wheel slows game time
    this.lastReal = now;
    const busy = ctx.isBusy();
    if (this.wheelOpen && busy && !this.trans) this.closeWheel();
    if (this.trans) this.stepTransition(real, ctx);
    this.hud?.set(this.wheelOpen, this.playing, this.sel);
    if (!busy || this.trans) this.updateNpc(dt, ctx);
  }

  // ---------------------------------------------------------------- rules

  private blockReason(): string | null {
    const ctx = this.ctx;
    if (!ctx) return 'Not now.';
    const w = ctx.world, p = w.player;
    const move = ctx.system<MovementLike>('movement');
    const state = move?.state ?? 'ground';
    return switchBlockReason({
      transitioning: !!this.trans,
      busy: ctx.isBusy(),
      dead: p.health <= 0,
      mission: ctx.missionActive?.() ?? false,
      wanted: ctx.system<PoliceLike>('police')?.stars ?? 0,
      swimming: move ? move.isSwimming() : false,
      airborne: move ? AIR_STATES.has(state) : !p.onGround,
      inVehicle: !!w.vehicle,
      occupied: w.entry.busy || !p.active,
      indoors: !!ctx.system<LifeLike>('life')?.inside?.(),
    });
  }

  private notice(text: string): void {
    const now = performance.now();
    if (now - this.noticeAt < 1500) return;
    this.noticeAt = now;
    this.ctx?.notify(text, 'warn');
    this.ctx?.sfx('bad');
  }

  // ---------------------------------------------------------------- wheel

  private openWheel(): void {
    this.wheelOpen = true;
    this.wheelCancel = false;
    this.wx = this.wy = 0;
    this.sel = this.playing;
    this.ctx?.sfx('open');
  }

  private closeWheel(): void {
    this.wheelOpen = false;
    this.wheelCancel = false;
  }

  // ---------------------------------------------------------------- switch

  private request(target: CharId): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (target === this.playing) {
      this.notice(`You're already playing [y]${PLAYABLE[target].name}[/y].`);
      return false;
    }
    const why = this.blockReason();
    if (why) { this.notice(why); return false; }
    const st = this.data.chars[target] ?? this.initialState(PLAYABLE[target], Date.now());
    this.data.chars[target] = st;
    const w = ctx.world, p = w.player, cam = ctx.camera;
    const dest = { x: st.x, y: st.y, z: st.z, yaw: st.yaw };
    // final over-the-shoulder pose, matching the on-foot CameraRig
    const yaw = dest.yaw + Math.PI, pitch = 0.22, lookY = dest.y + 1.55;
    const dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
    const dist = Math.max(1.2, w.city.collision.raycast(dest.x, lookY, dest.z, dx, dy, dz, w.rig.distance) - 0.4);
    this.trans = {
      plan: {
        start: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        startLook: { x: p.position.x, y: p.position.y + 1.4, z: p.position.z },
        from: { x: p.position.x, y: p.position.y, z: p.position.z },
        to: { x: dest.x, y: dest.y, z: dest.z },
        end: { x: dest.x + dx * dist, y: Math.max(0.4, lookY + dy * dist), z: dest.z + dz * dist },
        endLook: { x: dest.x, y: lookY, z: dest.z },
      },
      t: 0, target, dest, swapped: false, lastDrop: -1,
    };
    this.closeWheel();
    ctx.ui.prompt(null);
    ctx.sfx('whoosh');
    return true;
  }

  private stepTransition(real: number, ctx: SystemContext): void {
    const tr = this.trans;
    if (!tr) return;
    const input = ctx.input;
    if (tr.t > 0.15 && (input.wasPressed('Space') || input.wasPressed('Enter') || input.wasPressed('NumpadEnter'))) tr.t = SWITCH_TOTAL;
    else tr.t += real;
    if (!tr.swapped && tr.t >= SWITCH_SWAP_AT) this.performSwitch(tr);
    const f = switchFrame(tr.plan, tr.t, this.frame);
    const cam = ctx.camera;
    if (f.done) {
      this.finishTransition();
      return;
    }
    cam.position.set(f.pos.x, f.pos.y, f.pos.z);
    cam.lookAt(f.look.x, f.look.y, f.look.z);
    if (f.drop >= 0 && f.drop !== tr.lastDrop) {
      tr.lastDrop = f.drop;
      ctx.sfx('whoosh');
    }
    this.setGrey(f.grey);
  }

  private finishTransition(): void {
    const ctx = this.ctx, tr = this.trans;
    this.trans = null;
    this.setGrey(0);
    if (!ctx || !tr) return;
    if (!tr.swapped) this.performSwitch(tr);
    const w = ctx.world, p = w.player;
    w.rig.snapTo(p.position, p.yaw + Math.PI);
    w.rig.pitch = 0.22;
    const d = PLAYABLE[this.playing];
    ctx.notify(`Now playing [y]${d.name}[/y] · ${d.role}`, 'info');
  }

  /** New game / load mid-switch: drop the transition, keep whoever we already are. */
  private abortTransition(): void {
    if (!this.trans) return;
    this.trans = null;
    this.setGrey(0);
  }

  private setGrey(g: number): void {
    const q = Math.round(g * 20) / 20;
    if (q === this.greyShown) return;
    this.greyShown = q;
    if (this.canvas) this.canvas.style.filter = q > 0 ? `grayscale(${q}) contrast(${1 + q * 0.12}) brightness(${1 - q * 0.08})` : '';
    this.hud?.setTint(q * 0.9, !!this.trans);
  }

  /** The actual switch (camera is high above the city): stash the leaving character, become the target. */
  private performSwitch(tr: Transition): void {
    tr.swapped = true;
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const w = ctx.world, p = w.player, prof = ctx.profile();
      const combat = ctx.system<CombatLike>('combat');
      const shops = ctx.system<ShopsLike>('shops');
      const leaving = this.playing, target = tr.target;
      const def = PLAYABLE[target];
      const now = Date.now();
      const leaveLook = shops ? shops.look() : null;
      const leave: CharState = {
        x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw,
        health: p.health, armor: combat?.armor ?? 0, credits: prof.credits,
        look: leaveLook ? { ...leaveLook, tattoos: { ...leaveLook.tattoos } } : null,
        arsenal: combat ? combat.arsenal.save() : null,
        leftAt: now, movedAt: now, spot: null,
      };
      const st = this.data.chars[target] ?? this.initialState(def, now);
      // separate wallets, like GTA
      prof.credits = st.credits;
      // a while away heals them up
      const hp = now - st.leftAt > STAY_MS ? p.maxHealth : st.health;
      p.health = Math.max(1, Math.min(p.maxHealth, hp));
      prof.health = p.health;
      if (combat) {
        combat.arsenal.load(st.arsenal);
        combat.armor = st.armor;
        combat.persist();
      }
      // bodies: the target's NPC body becomes the player, the player's body is left behind
      this.hideNpc();
      this.swapBody(target, st.look ?? def.look ?? DEFAULT_LOOK);
      p.place(tr.dest.x, tr.dest.z, tr.dest.yaw, tr.dest.y);
      w.rig.snapTo(p.position, tr.dest.yaw + Math.PI);
      this.playing = target;
      this.data.active = target;
      this.data.chars[target] = null;
      this.data.chars[leaving] = leave;
      this.showNpc(leaving);
      this.persist();
      ctx.save();
    } catch (err) {
      console.error('[switching] switch failed', err);
    }
  }

  /**
   * Put `id`'s (separate-parts) rig on the player and dress it in `look`. Shops owns the player's
   * Appearance; accessories are stripped first so a later Appearance on the outgoing rig (when
   * that character is played again) doesn't stack a second hat/mask on it.
   */
  private swapBody(id: CharId, look: Look | null): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = ctx.world.player;
    const shops = ctx.system<ShopsLike>('shops');
    const next = this.rigFor(id);
    if (shops) shops.setLook(bareLook(shops.look()));
    p.setRig(next);
    next.body.rotation.set(0, p.yaw, 0);
    if (shops) {
      shops.init?.(ctx); // re-binds the shops Appearance to the new body
      if (look) shops.setLook(look);
    }
  }

  private rigFor(id: CharId): Rig {
    let r = this.rigs[id];
    if (!r) {
      const d = PLAYABLE[id];
      r = createRig(d.outfit ?? RICO_OUTFIT, { female: d.female, seed: d.modelSeed, separateParts: true });
      this.rigs[id] = r;
    }
    return r;
  }

  private initialState(d: PlayableDef, now: number): CharState {
    const s = d.start;
    return {
      x: s.x, y: this.spotY(s, s.x, s.z), z: s.z, yaw: s.yaw, health: 100, armor: 0, credits: d.startCredits,
      look: d.look, arsenal: null, leftAt: now, movedAt: now, spot: s.id,
    };
  }

  /** Standing height at a hang-out (roof spots stand on the building below). */
  private spotY(s: CharSpot | null, x: number, z: number): number {
    const col = this.ctx?.world.city.collision;
    if (!col) return 0;
    try { return Math.max(0, col.groundHeight(x, z, s?.roof ? 500 : 2)); } catch { return 0; }
  }

  // ---------------------------------------------------------------- left-behind NPC

  /**
   * The left-behind character as a cheap merged NPC copy (one draw call): base outfit recoloured
   * with their shop look's colours (no hats/tattoos). Rebuilt only when those colours change.
   */
  private showNpc(id: CharId): void {
    this.hideNpc();
    const d = PLAYABLE[id];
    const st = this.data.chars[id];
    const look = st?.look ?? d.look;
    const base = d.outfit ?? RICO_OUTFIT;
    const outfit: Outfit = look
      ? { ...base, shirt: look.shirt, accent: look.accent, pants: look.pants, shoes: look.shoes, hair: look.hair, pattern: look.pattern === 'hawaiian' ? 'hawaiian' : 'plain' }
      : base;
    const key = JSON.stringify(outfit);
    let cached = this.npcRigs.get(id);
    if (!cached || cached.key !== key) {
      cached?.rig.root.removeFromParent();
      cached = { key, rig: createRig(outfit, { female: d.female, seed: d.modelSeed }) };
      this.npcRigs.set(id, cached);
    }
    this.npc = { id, rig: cached.rig, spawned: false, yaw: st?.yaw ?? 0, waveCd: 0 };
  }

  private hideNpc(): void {
    const n = this.npc;
    if (!n) return;
    n.rig.root.removeFromParent();
    this.npc = null;
  }

  private updateNpc(dt: number, ctx: SystemContext): void {
    const n = this.npc;
    const st = n ? this.data.chars[n.id] : null;
    if (!n || !st) return;
    const me = ctx.world.player.position;
    const d = Math.hypot(st.x - me.x, st.z - me.z);
    const want = n.spawned ? d < NPC_DESPAWN : d < NPC_SPAWN;
    if (want !== n.spawned) {
      n.spawned = want;
      if (want) { ctx.scene.add(n.rig.root); n.yaw = st.yaw; } else n.rig.root.removeFromParent();
    }
    if (!n.spawned) return;
    const rig = n.rig;
    rig.root.position.set(st.x, st.y, st.z);
    rig.root.quaternion.identity();
    // idle; turn to face the player when they walk up, wave now and then
    let yaw = st.yaw;
    if (d < 7) yaw = Math.atan2(me.x - st.x, me.z - st.z);
    let diff = yaw - n.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    n.yaw += diff * Math.min(1, dt * 3);
    rig.body.rotation.set(0, n.yaw, 0);
    n.waveCd -= dt;
    if (d < 5 && n.waveCd <= 0) { n.waveCd = 25; rig.wave(ctx.world.time); }
    rig.root.visible = true;
    rig.animate(dt, 0);
  }

  private persist(): void {
    this.ctx?.setData('switching', this.data);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    window.removeEventListener('mousemove', this.onMouse, { capture: true });
    window.removeEventListener('blur', this.onBlur);
    this.hud?.dispose();
    this.setGrey(0);
  }
}

export default function create(): GameSystem {
  return new SwitchingSystem();
}
