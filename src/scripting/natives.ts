import { COMMANDS, CommandSpec, commandSpec } from './opcodes';
import type { MaybePromise, ScriptHost } from './host';
import { ParamType, Pending, ScriptRuntimeError, ScriptValue, sBool, sFloat, sInt } from './types';
import { CAMERA_PRESETS, MUSIC_MOODS, WEATHER_KINDS, isCameraPreset, isMusicMood, isWeatherKind } from './cinematic';
import type { ScriptInstance, ScriptThread, ScriptVM } from './vm';

// Maps script-visible commands (opcodes) to TypeScript handlers.

export interface NativeContext {
  vm: ScriptVM;
  thread: ScriptThread;
  instance: ScriptInstance;
}

export type NativeHandler = (ctx: NativeContext, args: ScriptValue[]) => ScriptValue | Pending | void;

export interface NativeDef {
  name: string;
  opcode: number;
  params: ParamType[];
  returns?: ParamType;
  async?: boolean;
  handler: NativeHandler;
}

export interface BoundNative {
  spec: CommandSpec;
  handler: NativeHandler;
}

export class NativeRegistry {
  private byOpcode = new Map<number, BoundNative>();

  /**
   * Register a handler. The signature must match the command table exactly,
   * because the compiler and verifier check scripts against that table.
   */
  register(def: NativeDef): void {
    const spec = commandSpec(def.name);
    if (!spec) throw new Error(`native ${def.name} is not in the command table`);
    if (spec.opcode !== def.opcode) throw new Error(`native ${def.name}: opcode ${def.opcode} != table ${spec.opcode}`);
    if (spec.params.join(',') !== def.params.join(',') || spec.returns !== def.returns || !!spec.async !== !!def.async) {
      throw new Error(`native ${def.name}: signature does not match the command table`);
    }
    this.byOpcode.set(spec.opcode, { spec, handler: def.handler });
  }

  /** Shorthand: bind a handler by name using the table's signature. */
  bind(name: string, handler: NativeHandler): void {
    const spec = commandSpec(name);
    if (!spec) throw new Error(`native ${name} is not in the command table`);
    this.register({ name: spec.name, opcode: spec.opcode, params: spec.params, returns: spec.returns, async: spec.async, handler });
  }

  get(opcode: number): BoundNative | undefined {
    return this.byOpcode.get(opcode);
  }

  /** Command names that have no handler yet. */
  unbound(): string[] {
    return COMMANDS.filter((c) => !this.byOpcode.has(c.opcode)).map((c) => c.name);
  }
}

// ---- argument helpers (types were already checked by the VM) ----
const S = (a: ScriptValue[], i: number) => a[i].v as string;
const N = (a: ScriptValue[], i: number) => a[i].v as number;
/** Durations are clamped to 0..60 s so a typo can't freeze a cutscene forever. */
const clampMs = (ms: number) => Math.max(0, Math.min(60000, ms));

/** Convert a host value (or promise) into a Pending that the VM can wait on. */
function toPending<T>(value: MaybePromise<T>, convert: (v: T) => ScriptValue | undefined): Pending {
  const p = new Pending();
  if (value && typeof (value as PromiseLike<T>).then === 'function') {
    (value as PromiseLike<T>).then(
      (v) => p.resolve(convert(v)),
      (e: unknown) => p.reject(e instanceof Error ? e.message : String(e)),
    );
  } else {
    p.resolve(convert(value as T));
  }
  return p;
}

/** Bind every command in the table to a ScriptHost implementation. */
export function bindGameNatives(reg: NativeRegistry, host: ScriptHost): NativeRegistry {
  const b = (name: string, h: NativeHandler) => reg.bind(name, h);
  // core
  b('PRINT_MESSAGE', (_c, a) => host.printMessage(S(a, 0), N(a, 1)));
  b('PRINT_HELP', (_c, a) => host.printHelp(S(a, 0)));
  b('SET_OBJECTIVE', (_c, a) => host.setObjective(S(a, 0)));
  b('CLEAR_OBJECTIVE', () => host.clearObjective());
  b('MISSION_COMPLETE', () => host.missionComplete());
  b('MISSION_FAILED', (_c, a) => host.missionFailed(S(a, 0)));
  b('SET_TIMER', (_c, a) => host.setTimer(N(a, 0)));
  b('CLEAR_TIMER', () => host.clearTimer());
  b('IS_TIMER_EXPIRED', () => sBool(host.isTimerExpired()));
  b('RANDOM_INT', (c, a) => {
    const lo = Math.min(N(a, 0), N(a, 1)), hi = Math.max(N(a, 0), N(a, 1));
    return sInt(lo + Math.floor(c.vm.random() * (hi - lo + 1)));
  });
  b('GET_GAME_HOUR', () => sFloat(host.gameHour()));
  b('DEBUG_LOG', (_c, a) => host.log(String(a[0].v)));
  // player / world
  b('IS_PLAYER_DEAD', () => sBool(host.isPlayerDead()));
  b('IS_PLAYER_AT', (_c, a) => sBool(host.isPlayerAt(S(a, 0), N(a, 1))));
  b('IS_PLAYER_IN_ANY_VEHICLE', () => sBool(host.isPlayerInAnyVehicle()));
  b('IS_PLAYER_NEAR_HANDLE', (_c, a) => sBool(host.isPlayerNearHandle(N(a, 0), N(a, 1))));
  b('GET_PLAYER_X', () => sFloat(host.playerX()));
  b('GET_PLAYER_Z', () => sFloat(host.playerZ()));
  b('ADD_MONEY', (_c, a) => host.addMoney(N(a, 0)));
  b('SET_WAYPOINT', (_c, a) => host.setWaypoint(S(a, 0)));
  b('CLEAR_WAYPOINT', () => host.clearWaypoint());
  b('ADD_BLIP', (_c, a) => sInt(host.addBlip(S(a, 0), S(a, 1))));
  b('ADD_BLIP_FOR_HANDLE', (_c, a) => sInt(host.addBlipForHandle(N(a, 0), S(a, 1))));
  b('REMOVE_BLIP', (_c, a) => host.removeBlip(N(a, 0)));
  b('ADD_CHECKPOINT', (_c, a) => sInt(host.addCheckpoint(N(a, 0), N(a, 1), N(a, 2))));
  b('IS_PLAYER_IN_CHECKPOINT', (_c, a) => sBool(host.isPlayerInCheckpoint(N(a, 0))));
  b('REMOVE_CHECKPOINT', (_c, a) => host.removeCheckpoint(N(a, 0)));
  b('FADE_OUT', (_c, a) => toPending(host.fadeOut(N(a, 0)), () => undefined));
  b('FADE_IN', (_c, a) => toPending(host.fadeIn(N(a, 0)), () => undefined));
  b('TELEPORT_PLAYER', (_c, a) => host.teleportPlayer(N(a, 0), N(a, 1)));
  // entities
  b('SPAWN_CAR', (_c, a) => sInt(host.spawnCar(S(a, 0), N(a, 1), N(a, 2), N(a, 3))));
  b('SPAWN_ACTOR', (_c, a) => sInt(host.spawnActor(S(a, 0), N(a, 1), N(a, 2), N(a, 3))));
  b('DESTROY_ENTITY', (_c, a) => host.destroyEntity(N(a, 0)));
  b('DOES_ENTITY_EXIST', (_c, a) => sBool(host.doesEntityExist(N(a, 0))));
  b('SET_VEHICLE_ROUTE', (_c, a) => host.setVehicleRoute(N(a, 0), S(a, 1)));
  b('GET_DISTANCE_TO', (_c, a) => sFloat(host.distanceTo(N(a, 0))));
  // story / cyber
  b('SHOW_DIALOGUE', (_c, a) => toPending(host.showDialogue(S(a, 0)), () => undefined));
  b('WAIT_FOR_TALK', (_c, a) => toPending(host.waitForTalk(S(a, 0)), () => undefined));
  b('START_CHALLENGE', (_c, a) => toPending(host.startChallenge(S(a, 0), S(a, 1)), (v) => sBool(!!v)));
  b('SHOW_BRIEFING', (_c, a) => toPending(host.showBriefing(S(a, 0)), (v) => sBool(!!v)));
  b('CHASE_START', (_c, a) => toPending(host.chaseStart(N(a, 0), N(a, 1), N(a, 2), N(a, 3)), (v) => sBool(!!v)));
  b('COLLECT_START', (_c, a) => toPending(host.collectStart(S(a, 0), N(a, 1)), (v) => sBool(!!v)));
  b('UNLOCK_NOTE', (_c, a) => host.unlockNote(S(a, 0)));
  // cinematics / music / atmosphere
  b('CINEMATIC_START', () => host.cinematicStart());
  b('CINEMATIC_END', () => host.cinematicEnd());
  b('CAMERA_SHOT', (_c, a) => {
    const preset = S(a, 0);
    if (!isCameraPreset(preset)) throw new ScriptRuntimeError(`unknown camera preset "${preset}" (use ${CAMERA_PRESETS.join(', ')})`);
    return toPending(host.cameraShot(preset, S(a, 1), clampMs(N(a, 2))), () => undefined);
  });
  b('CAMERA_FOLLOW', (_c, a) => toPending(host.cameraFollow(N(a, 0), clampMs(N(a, 1))), () => undefined));
  b('SHOW_TITLE', (_c, a) => toPending(host.showTitle(S(a, 0), S(a, 1), clampMs(N(a, 2))), () => undefined));
  b('MUSIC_CUE', (_c, a) => {
    const mood = S(a, 0);
    if (!isMusicMood(mood)) throw new ScriptRuntimeError(`unknown music mood "${mood}" (use ${MUSIC_MOODS.join(', ')})`);
    host.musicCue(mood);
  });
  b('SLOW_MOTION', (_c, a) => host.slowMotion(Math.max(0.1, Math.min(1, N(a, 0))), clampMs(N(a, 1))));
  b('SCREEN_SHAKE', (_c, a) => host.screenShake(Math.max(0, Math.min(1, N(a, 0)))));
  b('SET_HOUR', (_c, a) => host.setHour(((N(a, 0) % 24) + 24) % 24));
  b('SET_WEATHER', (_c, a) => {
    const kind = S(a, 0);
    if (!isWeatherKind(kind)) throw new ScriptRuntimeError(`unknown weather "${kind}" (use ${WEATHER_KINDS.join(', ')})`);
    host.setWeather(kind);
  });
  b('PLAY_SFX', (_c, a) => host.playSfx(S(a, 0)));
  return reg;
}
