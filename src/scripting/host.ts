import { ScriptHandleError } from './types';

// The engine-facing side of the native API. The game implements ScriptHost;
// scripts only ever see integer handles and strings, never engine objects.
// Methods that take a handle must throw ScriptHandleError for unknown handles.
// Async methods may return a plain value (resolves immediately) or a Promise.

export type MaybePromise<T> = T | PromiseLike<T>;

export interface ScriptHost {
  // ---- core ----
  printMessage(text: string, ms: number): void;
  printHelp(text: string): void;
  setObjective(text: string): void;
  clearObjective(): void;
  missionComplete(): void;
  missionFailed(reason: string): void;
  setTimer(seconds: number): void;
  clearTimer(): void;
  isTimerExpired(): boolean;
  gameHour(): number;
  log(text: string): void;
  // ---- player / world ----
  isPlayerDead(): boolean;
  isPlayerAt(place: string, radius: number): boolean;
  isPlayerInAnyVehicle(): boolean;
  isPlayerNearHandle(handle: number, radius: number): boolean;
  playerX(): number;
  playerZ(): number;
  addMoney(amount: number): void;
  setWaypoint(place: string): void;
  clearWaypoint(): void;
  addBlip(place: string, color: string): number;
  addBlipForHandle(handle: number, color: string): number;
  removeBlip(blip: number): void;
  addCheckpoint(x: number, z: number, radius: number): number;
  isPlayerInCheckpoint(checkpoint: number): boolean;
  removeCheckpoint(checkpoint: number): void;
  fadeOut(ms: number): MaybePromise<void>;
  fadeIn(ms: number): MaybePromise<void>;
  teleportPlayer(x: number, z: number): void;
  // ---- entities ----
  spawnCar(model: string, x: number, z: number, heading: number): number;
  spawnActor(model: string, x: number, z: number, heading: number): number;
  destroyEntity(handle: number): void;
  doesEntityExist(handle: number): boolean;
  setVehicleRoute(vehicle: number, route: string): void;
  distanceTo(handle: number): number;
  // ---- story / cyber ----
  showDialogue(id: string): MaybePromise<void>;
  waitForTalk(npc: string): MaybePromise<void>;
  startChallenge(challengeId: string, terminalId: string): MaybePromise<boolean>;
  showBriefing(missionId: string): MaybePromise<boolean>;
  chaseStart(vehicle: number, tagSeconds: number, radius: number, timeLimit: number): MaybePromise<boolean>;
  collectStart(itemSet: string, timeLimit: number): MaybePromise<boolean>;
  unlockNote(text: string): void;
}

export interface MockOptions {
  /** Results returned by successive START_CHALLENGE calls (default: always pass). */
  challengeResults?: boolean[];
  chaseResults?: boolean[];
  collectResults?: boolean[];
  /** IS_PLAYER_AT turns true after this many polls of the same place (simulated travel). */
  travelPolls?: number;
  /** IS_PLAYER_IN_ANY_VEHICLE turns true after this many polls. */
  vehiclePolls?: number;
  /** When set, async story calls stay pending until resolved manually via `resolveNext`. */
  manualAsync?: boolean;
}

/** In-memory host for tests and the CLI trace: records every call. */
export class MockHost implements ScriptHost {
  calls: string[] = [];
  objective: string | null = null;
  money = 0;
  outcome: 'running' | 'complete' | 'failed' = 'running';
  failReason = '';
  dead = false;
  private nextHandle = 100;
  private entities = new Map<number, { kind: string; model: string; x: number; z: number }>();
  private blips = new Set<number>();
  private polls = new Map<string, number>();
  private vehiclePollCount = 0;
  private challengeQueue: boolean[];
  private chaseQueue: boolean[];
  private collectQueue: boolean[];
  private pending: { label: string; resolve: (v: boolean) => void }[] = [];
  x = 196;
  z = -24;

  constructor(private opts: MockOptions = {}) {
    this.challengeQueue = [...(opts.challengeResults ?? [])];
    this.chaseQueue = [...(opts.chaseResults ?? [])];
    this.collectQueue = [...(opts.collectResults ?? [])];
  }

  private rec(s: string): void { this.calls.push(s); }
  private handle(h: number): { kind: string; model: string; x: number; z: number } {
    const e = this.entities.get(h);
    if (!e) throw new ScriptHandleError(h);
    return e;
  }
  private later<T extends boolean | void>(label: string, value: T): MaybePromise<T> {
    if (!this.opts.manualAsync) return value;
    return new Promise<T>((res) => this.pending.push({ label, resolve: (v) => res((typeof value === 'boolean' ? v : undefined) as T) }));
  }
  /** Resolve the oldest manual async call. Returns its label. */
  resolveNext(value = true): string | undefined {
    const p = this.pending.shift();
    p?.resolve(value);
    return p?.label;
  }
  get pendingCount(): number { return this.pending.length; }

  printMessage(text: string, ms: number): void { this.rec(`PRINT_MESSAGE ${text} ${ms}`); }
  printHelp(text: string): void { this.rec(`PRINT_HELP ${text}`); }
  setObjective(text: string): void { this.objective = text; this.rec(`SET_OBJECTIVE ${text}`); }
  clearObjective(): void { this.objective = null; this.rec('CLEAR_OBJECTIVE'); }
  missionComplete(): void { this.outcome = 'complete'; this.rec('MISSION_COMPLETE'); }
  missionFailed(reason: string): void { this.outcome = 'failed'; this.failReason = reason; this.rec(`MISSION_FAILED ${reason}`); }
  setTimer(seconds: number): void { this.rec(`SET_TIMER ${seconds}`); }
  clearTimer(): void { this.rec('CLEAR_TIMER'); }
  isTimerExpired(): boolean { return false; }
  gameHour(): number { return 18.5; }
  log(text: string): void { this.rec(`LOG ${text}`); }
  isPlayerDead(): boolean { return this.dead; }
  isPlayerAt(place: string, radius: number): boolean {
    void radius;
    const n = (this.polls.get(place) ?? 0) + 1;
    this.polls.set(place, n);
    return n > (this.opts.travelPolls ?? 2);
  }
  isPlayerInAnyVehicle(): boolean { return ++this.vehiclePollCount > (this.opts.vehiclePolls ?? 1); }
  isPlayerNearHandle(handle: number, radius: number): boolean {
    const e = this.handle(handle);
    return Math.hypot(e.x - this.x, e.z - this.z) <= radius;
  }
  playerX(): number { return this.x; }
  playerZ(): number { return this.z; }
  addMoney(amount: number): void { this.money += amount; this.rec(`ADD_MONEY ${amount}`); }
  setWaypoint(place: string): void { this.rec(`SET_WAYPOINT ${place}`); }
  clearWaypoint(): void { this.rec('CLEAR_WAYPOINT'); }
  addBlip(place: string, color: string): number { const h = this.nextHandle++; this.blips.add(h); this.rec(`ADD_BLIP ${place} ${color} -> ${h}`); return h; }
  addBlipForHandle(handle: number, color: string): number { this.handle(handle); const h = this.nextHandle++; this.blips.add(h); this.rec(`ADD_BLIP_FOR_HANDLE ${handle} ${color} -> ${h}`); return h; }
  removeBlip(blip: number): void { if (!this.blips.delete(blip)) throw new ScriptHandleError(blip, 'blip'); this.rec(`REMOVE_BLIP ${blip}`); }
  addCheckpoint(x: number, z: number, radius: number): number { const h = this.nextHandle++; this.entities.set(h, { kind: 'checkpoint', model: '', x, z }); this.rec(`ADD_CHECKPOINT ${x} ${z} ${radius} -> ${h}`); return h; }
  isPlayerInCheckpoint(checkpoint: number): boolean { this.handle(checkpoint); return true; }
  removeCheckpoint(checkpoint: number): void { this.handle(checkpoint); this.entities.delete(checkpoint); this.rec(`REMOVE_CHECKPOINT ${checkpoint}`); }
  fadeOut(ms: number): MaybePromise<void> { this.rec(`FADE_OUT ${ms}`); return this.later('fade', undefined); }
  fadeIn(ms: number): MaybePromise<void> { this.rec(`FADE_IN ${ms}`); return this.later('fade', undefined); }
  teleportPlayer(x: number, z: number): void { this.x = x; this.z = z; this.rec(`TELEPORT_PLAYER ${x} ${z}`); }
  spawnCar(model: string, x: number, z: number, heading: number): number {
    const h = this.nextHandle++;
    this.entities.set(h, { kind: 'vehicle', model, x, z });
    this.rec(`SPAWN_CAR ${model} ${x} ${z} ${heading} -> ${h}`);
    return h;
  }
  spawnActor(model: string, x: number, z: number, heading: number): number {
    const h = this.nextHandle++;
    this.entities.set(h, { kind: 'actor', model, x, z });
    this.rec(`SPAWN_ACTOR ${model} ${x} ${z} ${heading} -> ${h}`);
    return h;
  }
  destroyEntity(handle: number): void { this.handle(handle); this.entities.delete(handle); this.rec(`DESTROY_ENTITY ${handle}`); }
  doesEntityExist(handle: number): boolean { return this.entities.has(handle); }
  setVehicleRoute(vehicle: number, route: string): void { this.handle(vehicle); this.rec(`SET_VEHICLE_ROUTE ${vehicle} ${route}`); }
  distanceTo(handle: number): number { const e = this.handle(handle); return Math.hypot(e.x - this.x, e.z - this.z); }
  showDialogue(id: string): MaybePromise<void> { this.rec(`SHOW_DIALOGUE ${id}`); return this.later(`dialogue ${id}`, undefined); }
  waitForTalk(npc: string): MaybePromise<void> { this.rec(`WAIT_FOR_TALK ${npc}`); return this.later(`talk ${npc}`, undefined); }
  startChallenge(challengeId: string, terminalId: string): MaybePromise<boolean> {
    const r = this.challengeQueue.length ? this.challengeQueue.shift()! : true;
    this.rec(`START_CHALLENGE ${challengeId} ${terminalId} -> ${r ? 'PASS' : 'FAIL'}`);
    return this.later(`challenge ${challengeId}`, r);
  }
  showBriefing(missionId: string): MaybePromise<boolean> { this.rec(`SHOW_BRIEFING ${missionId}`); return this.later(`briefing ${missionId}`, true); }
  chaseStart(vehicle: number, tagSeconds: number, radius: number, timeLimit: number): MaybePromise<boolean> {
    this.handle(vehicle);
    const r = this.chaseQueue.length ? this.chaseQueue.shift()! : true;
    this.rec(`CHASE_START ${vehicle} ${tagSeconds} ${radius} ${timeLimit} -> ${r ? 'SUCCESS' : 'ESCAPED'}`);
    return this.later('chase', r);
  }
  collectStart(itemSet: string, timeLimit: number): MaybePromise<boolean> {
    const r = this.collectQueue.length ? this.collectQueue.shift()! : true;
    this.rec(`COLLECT_START ${itemSet} ${timeLimit} -> ${r ? 'SUCCESS' : 'TIMEOUT'}`);
    return this.later('collect', r);
  }
  unlockNote(text: string): void { this.rec(`UNLOCK_NOTE ${text}`); }
}
