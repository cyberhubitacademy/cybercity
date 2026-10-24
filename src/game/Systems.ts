import type * as THREE from 'three';
import type { WorldSim } from './WorldSim';
import type { Input } from './Input';
import type { UI } from '../ui/UI';
import type { AudioEngine, SfxId } from '../audio/AudioEngine';
import type { PlayerProfile, Settings } from '../progression/types';
import type { Interactions } from './Interactions';
import type { WorldMarkers } from './WorldMarkers';
import type { NotifyKind } from '../ui/types';

// Plug-in gameplay systems (movement, water, vehicles+, life sim, combat,
// police...). Each lives in its own folder and talks to the game only
// through this context, so systems can be built and tested independently.

export interface SystemContext {
  readonly world: WorldSim;
  readonly input: Input;
  readonly ui: UI;
  readonly audio: AudioEngine;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly interactions: Interactions;
  readonly markers: WorldMarkers;
  /** Root element for a system's own HUD widgets (absolute-positioned children). */
  readonly hudRoot: HTMLElement;
  profile(): PlayerProfile;
  settings(): Settings;
  notify(text: string, kind?: NotifyKind): void;
  sfx(name: SfxId): void;
  /** Add (or with a negative amount, spend) credits. Returns false if not enough. */
  addMoney(amount: number): boolean;
  /** Run a blocking screen (frees the mouse, pauses the world). */
  modal<T>(fn: () => Promise<T>): Promise<T>;
  /** True while a dialogue, challenge, menu or cutscene is open. */
  isBusy(): boolean;
  save(): void;
  /** Per-system persistent data stored in the save file (JSON-safe values only). */
  getData<T>(systemId: string, fallback: T): T;
  setData(systemId: string, value: unknown): void;
  /** Other systems by id (for cooperation, e.g. combat asks police for wanted level). */
  system<T extends GameSystem>(id: string): T | undefined;
}

export interface GameSystem {
  readonly id: string;
  /** Called once after the world exists (and again after loading a save). */
  init?(ctx: SystemContext): void;
  /** Every frame while playing and nothing modal is open. dt is scaled game time. */
  update(dt: number, ctx: SystemContext): void;
  /** Every frame even while busy (e.g. to keep HUD widgets hidden/visible). */
  always?(dt: number, ctx: SystemContext): void;
  /** Movement speed multiplier this system wants applied to the player (1 = none). */
  speedMultiplier?(): number;
  dispose?(): void;
}

export class SystemRegistry {
  private systems: GameSystem[] = [];

  add(s: GameSystem): void {
    if (this.systems.some((x) => x.id === s.id)) throw new Error(`duplicate system ${s.id}`);
    this.systems.push(s);
  }

  get<T extends GameSystem>(id: string): T | undefined {
    return this.systems.find((s) => s.id === id) as T | undefined;
  }

  list(): readonly GameSystem[] {
    return this.systems;
  }

  init(ctx: SystemContext): void {
    for (const s of this.systems) {
      try {
        s.init?.(ctx);
      } catch (err) {
        console.error(`[system ${s.id}] init failed`, err);
      }
    }
  }

  update(dt: number, ctx: SystemContext, busy: boolean): void {
    for (const s of this.systems) {
      try {
        if (!busy) s.update(dt, ctx);
        s.always?.(dt, ctx);
      } catch (err) {
        console.error(`[system ${s.id}] update failed`, err);
      }
    }
  }

  speedMultiplier(): number {
    let m = 1;
    for (const s of this.systems) m *= s.speedMultiplier?.() ?? 1;
    return m;
  }
}
