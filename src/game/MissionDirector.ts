import { NativeRegistry, ScriptVM, bindGameNatives, ScriptHandleError } from '../scripting';
import type { ScriptHost, ScriptInstance } from '../scripting';
import { missionProgram, MISSION_IDS } from '../scripting/missionSources';
import type { MissionDef, ObjectiveDef, DialogueLine } from '../missions/types';
import { CHARACTERS, SCRIPT_LINES } from '../story/characters';
import { PLACES, isWater } from '../world/layout';
import { POSTS, TERMINALS } from '../world/spots';
import type { Vehicle, VehicleKind } from '../vehicles/Vehicle';
import type { WorldSim } from './WorldSim';

// Runs story missions from their compiled SCM scripts (missions/*.scm).
// Implements the ScriptHost the VM calls into, translating natives into real
// game actions: objectives, blips, talks, terminals, chases and timers.
// The Game feeds player actions back in (talked to X, finished challenge Y).

export interface DirectorCallbacks {
  dialogue(lines: DialogueLine[]): Promise<void>;
  notify(text: string, kind: 'info' | 'good' | 'warn'): void;
  fade(toBlack: boolean): Promise<void>;
  playChallenge(challengeId: string): Promise<boolean | null>;
  onComplete(def: MissionDef): void;
  onFailed(def: MissionDef, reason: string): void;
  onObjective(): void;
  addMoney(amount: number): void;
  isPlayerDead(): boolean;
}

const COLORS: Record<string, string> = { pink: '#ff2fa0', cyan: '#19e6ff', yellow: '#ffd23f', red: '#ff4d6d', purple: '#b14dff' };

/** Road-graph loop the Pink Tide van drives (node id = xIndex * 6 + zIndex). */
const ROUTES: Record<string, number[]> = {
  pinktide_loop: [14, 20, 19, 25, 26, 27, 21, 15],
};

export interface Blip { x: number; z: number; color: string; handle?: number }

export class MissionDirector implements ScriptHost {
  private vm: ScriptVM;
  private inst: ScriptInstance | null = null;
  private def: MissionDef | null = null;
  objective: string | null = null;
  waypoint: { x: number; z: number } | null = null;
  readonly blips = new Map<number, Blip>();
  private checkpoints = new Map<number, { x: number; z: number; r: number }>();
  private entities = new Map<number, Vehicle>();
  private nextId = 1;
  timer: number | null = null;
  private pendingTalk: { npc: string; resolve: () => void } | null = null;
  pendingChallenge: { challenge: string; terminal: string; resolve: (v: boolean) => void } | null = null;
  chase: { van: Vehicle; progress: number; tagSeconds: number; radius: number; resolve: (v: boolean) => void } | null = null;
  collect: { items: { id: string; x: number; z: number; label: string }[]; found: Set<string>; resolve: (v: boolean) => void } | null = null;
  /** Dialogue ids already covered by the briefing shown at acceptance. */
  private skipBrief = false;

  constructor(private world: WorldSim, private cb: DirectorCallbacks) {
    this.vm = new ScriptVM(bindGameNatives(new NativeRegistry(), this));
    this.vm.onError = (_t, msg) => console.warn('[SCM]', msg);
  }

  has(id: string): boolean {
    return MISSION_IDS.includes(id);
  }

  get running(): boolean {
    return this.inst !== null;
  }

  get missionId(): string | null {
    return this.def?.id ?? null;
  }

  /** Start a mission's script. Returns false if it can't run (caller falls back to data flow). */
  start(def: MissionDef, briefingShown: boolean): boolean {
    if (!this.has(def.id)) return false;
    try {
      this.stop();
      this.def = def;
      this.skipBrief = briefingShown;
      this.inst = this.vm.start(missionProgram(def.id), (i) => this.onFinish(i));
      return true;
    } catch (err) {
      console.error('[SCM] failed to start', def.id, err);
      this.def = null;
      this.inst = null;
      return false;
    }
  }

  stop(): void {
    if (this.inst) {
      const inst = this.inst;
      this.inst = null;
      this.vm.cancel(inst);
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.objective = null;
    this.waypoint = null;
    this.blips.clear();
    this.checkpoints.clear();
    this.timer = null;
    this.pendingTalk = null;
    this.pendingChallenge = null;
    if (this.chase) {
      const van = this.chase.van;
      this.chase = null;
      setTimeout(() => this.world.removeVehicle(van), 3000);
    }
    this.collect = null;
    for (const v of this.entities.values()) this.world.removeVehicle(v);
    this.entities.clear();
    this.cb.onObjective();
  }

  private onFinish(i: ScriptInstance): void {
    const def = this.def;
    if (this.inst !== i && this.inst !== null) return;
    this.inst = null;
    this.def = null;
    this.cleanup();
    if (!def) return;
    if (i.outcome === 'completed') this.cb.onComplete(def);
    else if (i.outcome === 'failed') this.cb.onFailed(def, i.reason ?? 'Mission failed.');
    else if (i.outcome === 'error') this.cb.onFailed(def, 'The mission script hit an error. Try again from the mission giver.');
  }

  /** Advance scripts using game time (0 while paused). */
  update(dt: number): void {
    if (!this.inst) return;
    if (this.timer !== null) this.timer = Math.max(0, this.timer - dt);
    if (this.chase) {
      const c = this.chase;
      const d = c.van.position.distanceTo(this.world.focus);
      if (this.world.vehicle && d < c.radius) c.progress += dt / c.tagSeconds;
      if (c.progress >= 1) this.endChase(true);
      else if (d > 260 || this.timer === 0) this.endChase(false);
    }
    if (this.collect && this.timer === 0) {
      const col = this.collect;
      this.collect = null;
      this.timer = null;
      col.resolve(false);
    }
    this.vm.update(dt * 1000);
  }

  private endChase(ok: boolean): void {
    const c = this.chase;
    if (!c) return;
    this.chase = null;
    this.timer = null;
    c.resolve(ok);
  }

  // ---- hooks from the Game ----

  /** Player pressed E on an NPC. Returns true if the script was waiting for it. */
  talked(npc: string): boolean {
    if (this.pendingTalk?.npc !== npc) return false;
    const p = this.pendingTalk;
    this.pendingTalk = null;
    p.resolve();
    return true;
  }

  isWaitingForTalk(npc: string): boolean {
    return this.pendingTalk?.npc === npc;
  }

  /** Player used a terminal. Returns true if the script handled it. */
  async usedTerminal(id: string): Promise<boolean> {
    const p = this.pendingChallenge;
    if (!p || p.terminal !== id) return false;
    const passed = await this.cb.playChallenge(p.challenge);
    if (passed === null) return true; // exited: still waiting
    if (this.pendingChallenge === p) {
      this.pendingChallenge = null;
      p.resolve(passed);
    }
    return true;
  }

  /** Player scanned a collect item. */
  collected(itemId: string): void {
    const c = this.collect;
    if (!c) return;
    c.found.add(itemId);
    if (c.items.every((i) => c.found.has(i.id))) {
      this.collect = null;
      this.timer = null;
      c.resolve(true);
    }
  }

  /** Where the HUD/3D marker should point. */
  target(): { x: number; z: number } | null {
    if (this.pendingChallenge) {
      const t = TERMINALS.find((x) => x.id === this.pendingChallenge?.terminal);
      if (t) return t;
    }
    if (this.pendingTalk) {
      const post = POSTS.find((p) => p.npc === this.pendingTalk?.npc);
      if (post) return post;
    }
    if (this.waypoint) return this.waypoint;
    for (const b of this.blips.values()) if (b.handle === undefined) return b;
    return null;
  }

  blipList(): Blip[] {
    const out: Blip[] = [];
    for (const b of this.blips.values()) {
      if (b.handle !== undefined) {
        const v = this.entities.get(b.handle);
        if (v) out.push({ x: v.position.x, z: v.position.z, color: b.color, handle: b.handle });
      } else out.push(b);
    }
    return out;
  }

  // ---- dialogue id resolution ----

  private linesFor(id: string): DialogueLine[] {
    const def = this.def;
    if (!def) return [];
    const key = id.split('.')[1] ?? id;
    const [who, what] = key.split('_');
    if (what === 'brief' || key === 'alarm' || key === 'intro_call') {
      if (this.skipBrief) return [];
      return def.briefing;
    }
    if (what === 'done' || what === 'debrief' || key === 'ending' || what === 'target') return def.completion;
    const talk = def.objectives.find((o): o is Extract<ObjectiveDef, { type: 'talk' }> => o.type === 'talk' && o.npc === who);
    if (talk) return talk.lines;
    if (SCRIPT_LINES[key]) return SCRIPT_LINES[key];
    const c = CHARACTERS[who];
    return c ? [{ speaker: who, text: c.greeting[0] }] : [];
  }

  // ---- ScriptHost ----

  printMessage(text: string): void { this.cb.notify(text, 'info'); }
  printHelp(text: string): void { this.cb.notify(text, 'warn'); }
  setObjective(text: string): void { this.objective = text; this.cb.onObjective(); }
  clearObjective(): void { this.objective = null; this.cb.onObjective(); }
  missionComplete(): void { /* the VM reports the outcome through onFinish */ }
  missionFailed(): void { /* the VM reports the outcome through onFinish */ }
  setTimer(seconds: number): void { this.timer = seconds; }
  clearTimer(): void { this.timer = null; }
  isTimerExpired(): boolean { return this.timer === 0; }
  gameHour(): number { return this.world.hour; }
  log(text: string): void { console.info('[SCM]', text); }
  isPlayerDead(): boolean { return this.cb.isPlayerDead(); }
  isPlayerAt(place: string, radius: number): boolean {
    const p = PLACES[place];
    if (!p) return false;
    const f = this.world.focus;
    return Math.hypot(p.x - f.x, p.z - f.z) <= radius;
  }
  isPlayerInAnyVehicle(): boolean { return this.world.vehicle !== null; }
  isPlayerNearHandle(handle: number, radius: number): boolean { return this.distanceTo(handle) <= radius; }
  playerX(): number { return this.world.focus.x; }
  playerZ(): number { return this.world.focus.z; }
  addMoney(amount: number): void { this.cb.addMoney(amount); }
  setWaypoint(place: string): void {
    const p = PLACES[place];
    this.waypoint = p ? { x: p.x, z: p.z } : null;
    this.cb.onObjective();
  }
  clearWaypoint(): void { this.waypoint = null; this.cb.onObjective(); }
  addBlip(place: string, color: string): number {
    const p = PLACES[place];
    const id = this.nextId++;
    if (p) this.blips.set(id, { x: p.x, z: p.z, color: COLORS[color] ?? '#ffd23f' });
    this.cb.onObjective();
    return id;
  }
  addBlipForHandle(handle: number, color: string): number {
    if (!this.entities.has(handle)) throw new ScriptHandleError(handle);
    const id = this.nextId++;
    this.blips.set(id, { x: 0, z: 0, color: COLORS[color] ?? '#ff4d6d', handle });
    return id;
  }
  removeBlip(blip: number): void { this.blips.delete(blip); this.cb.onObjective(); }
  addCheckpoint(x: number, z: number, radius: number): number {
    const id = this.nextId++;
    this.checkpoints.set(id, { x, z, r: radius });
    this.blips.set(id, { x, z, color: '#19e6ff' });
    return id;
  }
  isPlayerInCheckpoint(checkpoint: number): boolean {
    const c = this.checkpoints.get(checkpoint);
    if (!c) throw new ScriptHandleError(checkpoint, 'checkpoint');
    const f = this.world.focus;
    return Math.hypot(c.x - f.x, c.z - f.z) <= c.r;
  }
  removeCheckpoint(checkpoint: number): void { this.checkpoints.delete(checkpoint); this.blips.delete(checkpoint); }
  fadeOut(): Promise<void> { return this.cb.fade(true); }
  fadeIn(): Promise<void> { return this.cb.fade(false); }
  teleportPlayer(x: number, z: number): void {
    if (this.world.vehicle) this.world.exitVehicle();
    this.world.player.place(x, z);
  }
  spawnCar(model: string, x: number, z: number, heading: number): number {
    const kinds: VehicleKind[] = ['stinger', 'cabrio', 'shield', 'sedan', 'taxi', 'van', 'bike', 'boat'];
    const kind = (kinds.includes(model as VehicleKind) ? model : 'sedan') as VehicleKind;
    if (kind !== 'boat' && isWater(x, z)) throw new Error(`cannot spawn ${model} in the water`);
    const v = this.world.spawnVehicle(kind, x, z, heading);
    const id = this.nextId++;
    this.entities.set(id, v);
    return id;
  }
  spawnActor(): number {
    // Ambient extras are not tracked as script entities yet; return a valid inert handle.
    return this.nextId++;
  }
  destroyEntity(handle: number): void {
    const v = this.entities.get(handle);
    if (!v) return;
    this.entities.delete(handle);
    setTimeout(() => this.world.removeVehicle(v), 2500);
  }
  doesEntityExist(handle: number): boolean { return this.entities.has(handle); }
  setVehicleRoute(vehicle: number, route: string): void {
    const v = this.entities.get(vehicle);
    if (!v) throw new ScriptHandleError(vehicle);
    // Start on the nearest road lane so scripted cars never drive out of a plaza.
    const nodes = this.world.traffic.nodes;
    let best = nodes[0], bd = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - v.position.x, n.z - v.position.z);
      if (d < bd) { bd = d; best = n; }
    }
    v.place(best.x + 3.4, best.z, Math.PI);
    this.world.traffic.adopt(v, ROUTES[route], 18);
  }
  distanceTo(handle: number): number {
    const v = this.entities.get(handle);
    if (!v) throw new ScriptHandleError(handle);
    return v.position.distanceTo(this.world.focus);
  }
  showDialogue(id: string): Promise<void> {
    const lines = this.linesFor(id);
    return lines.length ? this.cb.dialogue(lines) : Promise.resolve();
  }
  waitForTalk(npc: string): Promise<void> {
    this.cb.onObjective();
    return new Promise((resolve) => {
      this.pendingTalk = { npc, resolve };
      this.cb.onObjective();
    });
  }
  startChallenge(challengeId: string, terminalId: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingChallenge = { challenge: challengeId, terminal: terminalId, resolve };
      this.cb.onObjective();
    });
  }
  showBriefing(): boolean { return true; }
  chaseStart(vehicle: number, tagSeconds: number, radius: number, timeLimit: number): Promise<boolean> {
    const v = this.entities.get(vehicle);
    if (!v) return Promise.reject(new ScriptHandleError(vehicle));
    this.timer = timeLimit;
    return new Promise((resolve) => {
      this.chase = { van: v, progress: 0, tagSeconds, radius, resolve };
    });
  }
  collectStart(itemSet: string, timeLimit: number): Promise<boolean> {
    const def = this.def;
    const obj = def?.objectives.find((o): o is Extract<ObjectiveDef, { type: 'collect' }> => o.type === 'collect');
    if (!obj) return Promise.reject(new Error(`unknown item set ${itemSet}`));
    this.timer = timeLimit;
    return new Promise((resolve) => {
      this.collect = { items: obj.items, found: new Set(), resolve };
      this.cb.onObjective();
    });
  }
  unlockNote(text: string): void { this.cb.notify(text, 'good'); }
}
