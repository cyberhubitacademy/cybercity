import { PLACES } from '../world/layout';
import { POSTS, TERMINALS } from '../world/spots';
import type {
  CollectItem, MissionDef, MissionEvent, MissionSaveState, MissionStatus, MissionUpdate, ObjectiveDef,
} from './types';

// Pure mission state machine. The game feeds it world events (reached a place,
// talked to someone, passed a challenge...) and turns its answers into markers,
// dialogue and rewards. Rewards are handed out through `completed` exactly once.

export function emptyMissionState(): MissionSaveState {
  return { completed: [], active: null, objectiveIndex: 0, collected: [], started: [] };
}

export interface ActiveMission {
  def: MissionDef;
  index: number;
  objective: ObjectiveDef;
  /** True when replaying an already-completed mission (no rewards). */
  replay: boolean;
}

export class MissionManager {
  private defs: MissionDef[];
  private byId: Map<string, MissionDef>;
  private state: MissionSaveState;
  private replaying = false;

  constructor(defs: MissionDef[], saved?: MissionSaveState | null) {
    this.defs = defs;
    this.byId = new Map(defs.map((d) => [d.id, d]));
    this.state = saved ? sanitize(saved, this.byId) : emptyMissionState();
    this.autoStart();
  }

  serialize(): MissionSaveState {
    const s = this.state;
    // A replay in progress is not persisted: on reload the mission is simply completed.
    if (this.replaying) return { ...s, active: null, objectiveIndex: 0, collected: [], completed: [...s.completed], started: [...s.started] };
    return { completed: [...s.completed], active: s.active, objectiveIndex: s.objectiveIndex, collected: [...s.collected], started: [...s.started] };
  }

  get(id: string): MissionDef | undefined {
    return this.byId.get(id);
  }

  status(id: string): MissionStatus {
    if (this.state.active === id) return 'active';
    if (this.state.completed.includes(id)) return 'completed';
    const def = this.byId.get(id);
    if (!def) return 'locked';
    return def.prerequisites.every((p) => this.state.completed.includes(p)) ? 'available' : 'locked';
  }

  list(): { def: MissionDef; status: MissionStatus }[] {
    return this.defs.map((def) => ({ def, status: this.status(def.id) }));
  }

  available(): MissionDef[] {
    return this.defs.filter((d) => this.status(d.id) === 'available');
  }

  /** Available missions offered by a given NPC. */
  offeredBy(npc: string): MissionDef[] {
    return this.available().filter((d) => d.giver === npc);
  }

  isCompleted(id: string): boolean {
    return this.state.completed.includes(id);
  }

  completedCount(): number {
    return this.state.completed.length;
  }

  active(): ActiveMission | null {
    const id = this.state.active;
    if (!id) return null;
    const def = this.byId.get(id);
    if (!def) return null;
    const objective = def.objectives[this.state.objectiveIndex];
    if (!objective) return null;
    return { def, index: this.state.objectiveIndex, objective, replay: this.replaying };
  }

  /** Items still to find for the active collect objective. */
  remainingItems(): CollectItem[] {
    const a = this.active();
    if (!a || a.objective.type !== 'collect') return [];
    return a.objective.items.filter((i) => !this.state.collected.includes(i.id));
  }

  collectedCount(): number {
    return this.state.collected.length;
  }

  accept(id: string): boolean {
    if (this.state.active) return false;
    if (this.status(id) !== 'available') return false;
    this.begin(id, false);
    return true;
  }

  /** Replay a completed mission for practice. Never grants rewards again. */
  replay(id: string): boolean {
    if (this.state.active) return false;
    if (!this.state.completed.includes(id)) return false;
    this.begin(id, true);
    return true;
  }

  abandon(): void {
    this.state.active = null;
    this.state.objectiveIndex = 0;
    this.state.collected = [];
    this.replaying = false;
  }

  /** Finish the active mission now (used when an SCM script calls MISSION_COMPLETE). */
  completeActive(): MissionUpdate {
    const a = this.active();
    if (!a) return { advanced: false };
    this.state.objectiveIndex = a.def.objectives.length - 1;
    return this.advance();
  }

  /** Fail the active mission (used when an SCM script calls MISSION_FAILED). */
  failActive(reason: string): MissionUpdate {
    const a = this.active();
    if (!a) return { advanced: false };
    return this.fail(a.def, reason);
  }

  handle(event: MissionEvent): MissionUpdate {
    const a = this.active();
    if (!a) return { advanced: false };
    const o = a.objective;

    if (event.type === 'timeout') {
      if ((o.type === 'collect' && o.timeLimit) || o.type === 'chase') return this.fail(a.def, 'Out of time!');
      return { advanced: false };
    }

    switch (o.type) {
      case 'goto':
        if (event.type === 'reach' && event.place === o.place) return this.advance();
        break;
      case 'talk':
        if (event.type === 'talk' && event.npc === o.npc) return this.advance();
        break;
      case 'challenge':
        if (event.type === 'challenge' && event.id === o.challenge && event.passed) return this.advance();
        break;
      case 'drive':
        if (event.type === 'drive') return this.advance();
        break;
      case 'chase':
        if (event.type === 'chase') return event.success ? this.advance() : this.fail(a.def, 'The van got away.');
        break;
      case 'collect':
        if (event.type === 'collect' && o.items.some((i) => i.id === event.item) && !this.state.collected.includes(event.item)) {
          this.state.collected.push(event.item);
          if (o.items.every((i) => this.state.collected.includes(i.id))) return this.advance();
          return { advanced: false, objective: o };
        }
        break;
    }
    return { advanced: false };
  }

  private begin(id: string, replay: boolean): void {
    this.state.active = id;
    this.state.objectiveIndex = 0;
    this.state.collected = [];
    if (!this.state.started.includes(id)) this.state.started.push(id);
    this.replaying = replay;
  }

  private advance(): MissionUpdate {
    const id = this.state.active;
    const def = id ? this.byId.get(id) : undefined;
    if (!def) return { advanced: false };
    this.state.objectiveIndex++;
    this.state.collected = [];
    if (this.state.objectiveIndex < def.objectives.length) {
      return { advanced: true, objective: def.objectives[this.state.objectiveIndex] };
    }
    // mission finished
    const wasReplay = this.replaying;
    this.state.active = null;
    this.state.objectiveIndex = 0;
    this.replaying = false;
    const update: MissionUpdate = { advanced: true, finished: def };
    if (!wasReplay && !this.state.completed.includes(def.id)) {
      this.state.completed.push(def.id);
      update.completed = def;
    }
    this.autoStart();
    return update;
  }

  private fail(def: MissionDef, reason: string): MissionUpdate {
    this.abandon();
    return { advanced: false, failed: def.failHint ? `${reason} ${def.failHint}` : reason };
  }

  /** Missions with no giver begin automatically when their prerequisites are met. */
  private autoStart(): void {
    if (this.state.active) return;
    for (const d of this.defs) {
      if (d.giver === null && this.status(d.id) === 'available' && !this.state.started.includes(d.id)) {
        this.begin(d.id, false);
        return;
      }
    }
  }
}

function sanitize(saved: MissionSaveState, byId: Map<string, MissionDef>): MissionSaveState {
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const completed = strArr(saved.completed).filter((id) => byId.has(id));
  const active = typeof saved.active === 'string' && byId.has(saved.active) && !completed.includes(saved.active) ? saved.active : null;
  const def = active ? byId.get(active) : undefined;
  const rawIdx = typeof saved.objectiveIndex === 'number' && Number.isFinite(saved.objectiveIndex) ? Math.floor(saved.objectiveIndex) : 0;
  const objectiveIndex = def ? Math.max(0, Math.min(def.objectives.length - 1, rawIdx)) : 0;
  return {
    completed: [...new Set(completed)],
    active,
    objectiveIndex,
    collected: active ? strArr(saved.collected) : [],
    started: [...new Set([...strArr(saved.started), ...completed, ...(active ? [active] : [])])],
  };
}

/** World position for an objective's marker / GPS, or null if it has none. */
export function objectiveTarget(obj: ObjectiveDef): { x: number; z: number } | null {
  switch (obj.type) {
    case 'goto': {
      const p = PLACES[obj.place];
      return p ? { x: p.x, z: p.z } : null;
    }
    case 'talk': {
      const p = POSTS.find((q) => q.npc === obj.npc);
      return p ? { x: p.x, z: p.z } : null;
    }
    case 'challenge': {
      const t = TERMINALS.find((q) => q.id === obj.terminal);
      return t ? { x: t.x, z: t.z } : null;
    }
    case 'chase': {
      const p = PLACES[obj.spawnPlace];
      return p ? { x: p.x, z: p.z } : null;
    }
    case 'collect':
      return obj.items[0] ? { x: obj.items[0].x, z: obj.items[0].z } : null;
    case 'drive':
      return null;
  }
}

/** Where to show the "start mission" marker for a mission giver. */
export function giverPosition(def: MissionDef): { x: number; z: number } | null {
  if (!def.giver) return null;
  const p = POSTS.find((q) => q.npc === def.giver);
  return p ? { x: p.x, z: p.z } : null;
}
