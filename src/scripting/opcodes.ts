import type { ParamType } from './types';

// Instruction set. Opcodes are stable u16 values: changing one is a bytecode
// format break and requires a version bump (see docs/bytecode_format.md).
//   0x0000-0x00FF  VM control flow, variables and arithmetic
//   0x0100-0x01FF  core mission commands
//   0x0200-0x02FF  player / world queries and actions
//   0x0300-0x03FF  entities (vehicles, actors)
//   0x0400-0x04FF  story & cyber-challenge commands (async)
//   0x0500-0x05FF  cinematics, music and atmosphere
//   0x0600-0x06FF  combat, police and crime (Season 3)

/** Operand kinds a control opcode accepts in each position. */
export type OperandKind = 'value' | 'label' | 'var';

export interface ControlOp {
  opcode: number;
  name: string;
  operands: OperandKind[];
  /** True when the instruction writes a result variable. */
  result: boolean;
}

export const OP = {
  NOP: 0x0000,
  WAIT: 0x0002,
  GOTO: 0x0003,
  JUMP_IF_FALSE: 0x0004,
  SET: 0x0005,
  ADD: 0x0006,
  SUB: 0x0007,
  MUL: 0x0008,
  DIV: 0x0009,
  MOD: 0x000a,
  CMP_EQ: 0x0010,
  CMP_NE: 0x0011,
  CMP_LT: 0x0012,
  CMP_LE: 0x0013,
  CMP_GT: 0x0014,
  CMP_GE: 0x0015,
  NOT: 0x0016,
  GOSUB: 0x0020,
  RETURN: 0x0021,
  START_THREAD: 0x0022,
  END_THREAD: 0x0023,
  END_SCRIPT: 0x0024,
} as const;

export const CONTROL_OPS: ControlOp[] = [
  { opcode: OP.NOP, name: 'NOP', operands: [], result: false },
  { opcode: OP.WAIT, name: 'WAIT', operands: ['value'], result: false },
  { opcode: OP.GOTO, name: 'GOTO', operands: ['label'], result: false },
  { opcode: OP.JUMP_IF_FALSE, name: 'JUMP_IF_FALSE', operands: ['value', 'label'], result: false },
  { opcode: OP.SET, name: 'SET', operands: ['value'], result: true },
  { opcode: OP.ADD, name: 'ADD', operands: ['value', 'value'], result: true },
  { opcode: OP.SUB, name: 'SUB', operands: ['value', 'value'], result: true },
  { opcode: OP.MUL, name: 'MUL', operands: ['value', 'value'], result: true },
  { opcode: OP.DIV, name: 'DIV', operands: ['value', 'value'], result: true },
  { opcode: OP.MOD, name: 'MOD', operands: ['value', 'value'], result: true },
  { opcode: OP.CMP_EQ, name: 'CMP_EQ', operands: ['value', 'value'], result: true },
  { opcode: OP.CMP_NE, name: 'CMP_NE', operands: ['value', 'value'], result: true },
  { opcode: OP.CMP_LT, name: 'CMP_LT', operands: ['value', 'value'], result: true },
  { opcode: OP.CMP_LE, name: 'CMP_LE', operands: ['value', 'value'], result: true },
  { opcode: OP.CMP_GT, name: 'CMP_GT', operands: ['value', 'value'], result: true },
  { opcode: OP.CMP_GE, name: 'CMP_GE', operands: ['value', 'value'], result: true },
  { opcode: OP.NOT, name: 'NOT', operands: ['value'], result: true },
  { opcode: OP.GOSUB, name: 'GOSUB', operands: ['label'], result: false },
  { opcode: OP.RETURN, name: 'RETURN', operands: [], result: false },
  { opcode: OP.START_THREAD, name: 'START_THREAD', operands: ['label'], result: false },
  { opcode: OP.END_THREAD, name: 'END_THREAD', operands: [], result: false },
  { opcode: OP.END_SCRIPT, name: 'END_SCRIPT', operands: [], result: false },
];

/** A script-visible engine command. Handlers are bound separately (natives.ts). */
export interface CommandSpec {
  opcode: number;
  name: string;
  params: ParamType[];
  returns?: ParamType;
  /** Async commands suspend the thread until the host resolves them. */
  async?: boolean;
  /** Ends the whole mission instance after running. */
  terminates?: 'complete' | 'fail';
  doc: string;
}

export const COMMANDS: CommandSpec[] = [
  // ---- core ----
  { opcode: 0x0100, name: 'PRINT_MESSAGE', params: ['str', 'int'], doc: 'Big centered message for N milliseconds.' },
  { opcode: 0x0101, name: 'PRINT_HELP', params: ['str'], doc: 'Help box (top-left).' },
  { opcode: 0x0102, name: 'SET_OBJECTIVE', params: ['str'], doc: 'Set the current objective line.' },
  { opcode: 0x0103, name: 'CLEAR_OBJECTIVE', params: [], doc: 'Clear the objective line.' },
  { opcode: 0x0104, name: 'MISSION_COMPLETE', params: [], terminates: 'complete', doc: 'Pass the mission and end every thread of this script.' },
  { opcode: 0x0105, name: 'MISSION_FAILED', params: ['str'], terminates: 'fail', doc: 'Fail the mission with a reason and end every thread.' },
  { opcode: 0x0106, name: 'SET_TIMER', params: ['int'], doc: 'Start the on-screen countdown (seconds).' },
  { opcode: 0x0107, name: 'CLEAR_TIMER', params: [], doc: 'Remove the countdown.' },
  { opcode: 0x0108, name: 'IS_TIMER_EXPIRED', params: [], returns: 'bool', doc: 'True when the countdown reached zero.' },
  { opcode: 0x0109, name: 'RANDOM_INT', params: ['int', 'int'], returns: 'int', doc: 'Deterministic random integer in [min, max].' },
  { opcode: 0x010a, name: 'GET_GAME_HOUR', params: [], returns: 'float', doc: 'In-game hour of day (0..24).' },
  { opcode: 0x010b, name: 'DEBUG_LOG', params: ['any'], doc: 'Write a value to the developer log.' },
  // ---- player / world ----
  { opcode: 0x0200, name: 'IS_PLAYER_DEAD', params: [], returns: 'bool', doc: 'True while the player is hospitalized.' },
  { opcode: 0x0201, name: 'IS_PLAYER_AT', params: ['str', 'float'], returns: 'bool', doc: 'Player within radius (m) of a named place.' },
  { opcode: 0x0202, name: 'IS_PLAYER_IN_ANY_VEHICLE', params: [], returns: 'bool', doc: 'Player is driving something.' },
  { opcode: 0x0203, name: 'IS_PLAYER_NEAR_HANDLE', params: ['int', 'float'], returns: 'bool', doc: 'Player within radius of an entity.' },
  { opcode: 0x0204, name: 'GET_PLAYER_X', params: [], returns: 'float', doc: 'Player world X.' },
  { opcode: 0x0205, name: 'GET_PLAYER_Z', params: [], returns: 'float', doc: 'Player world Z.' },
  { opcode: 0x0206, name: 'ADD_MONEY', params: ['int'], doc: 'Give (or take) credits.' },
  { opcode: 0x0207, name: 'SET_WAYPOINT', params: ['str'], doc: 'GPS waypoint to a named place.' },
  { opcode: 0x0208, name: 'CLEAR_WAYPOINT', params: [], doc: 'Remove the GPS waypoint.' },
  { opcode: 0x0209, name: 'ADD_BLIP', params: ['str', 'str'], returns: 'int', doc: 'Map blip on a place with a color; returns blip handle.' },
  { opcode: 0x020a, name: 'ADD_BLIP_FOR_HANDLE', params: ['int', 'str'], returns: 'int', doc: 'Blip that follows an entity.' },
  { opcode: 0x020b, name: 'REMOVE_BLIP', params: ['int'], doc: 'Remove a blip.' },
  { opcode: 0x020c, name: 'ADD_CHECKPOINT', params: ['float', 'float', 'float'], returns: 'int', doc: 'Glowing checkpoint cylinder at x z radius.' },
  { opcode: 0x020d, name: 'IS_PLAYER_IN_CHECKPOINT', params: ['int'], returns: 'bool', doc: 'Player inside a checkpoint.' },
  { opcode: 0x020e, name: 'REMOVE_CHECKPOINT', params: ['int'], doc: 'Remove a checkpoint.' },
  { opcode: 0x020f, name: 'FADE_OUT', params: ['int'], async: true, doc: 'Fade the screen to black over N ms.' },
  { opcode: 0x0210, name: 'FADE_IN', params: ['int'], async: true, doc: 'Fade back in over N ms.' },
  { opcode: 0x0211, name: 'TELEPORT_PLAYER', params: ['float', 'float'], doc: 'Move the player (on foot) to x z.' },
  // ---- entities ----
  { opcode: 0x0300, name: 'SPAWN_CAR', params: ['str', 'float', 'float', 'float'], returns: 'int', doc: 'Spawn a vehicle model at x z heading(rad).' },
  { opcode: 0x0301, name: 'SPAWN_ACTOR', params: ['str', 'float', 'float', 'float'], returns: 'int', doc: 'Spawn a character at x z heading(rad).' },
  { opcode: 0x0302, name: 'DESTROY_ENTITY', params: ['int'], doc: 'Remove a spawned entity.' },
  { opcode: 0x0303, name: 'DOES_ENTITY_EXIST', params: ['int'], returns: 'bool', doc: 'Handle still refers to a live entity.' },
  { opcode: 0x0304, name: 'SET_VEHICLE_ROUTE', params: ['int', 'str'], doc: 'AI drives the vehicle along a named route.' },
  { opcode: 0x0305, name: 'GET_DISTANCE_TO', params: ['int'], returns: 'float', doc: 'Distance (m) from player to entity.' },
  // ---- story / cyber ----
  { opcode: 0x0400, name: 'SHOW_DIALOGUE', params: ['str'], async: true, doc: 'Play a dialogue by id; waits until closed.' },
  { opcode: 0x0401, name: 'WAIT_FOR_TALK', params: ['str'], async: true, doc: 'Wait until the player talks to an NPC (E).' },
  { opcode: 0x0402, name: 'START_CHALLENGE', params: ['str', 'str'], returns: 'bool', async: true, doc: 'Arm a challenge at a terminal; resolves passed/failed when the player finishes it.' },
  { opcode: 0x0403, name: 'SHOW_BRIEFING', params: ['str'], returns: 'bool', async: true, doc: 'Mission briefing card; resolves accepted.' },
  { opcode: 0x0404, name: 'CHASE_START', params: ['int', 'int', 'float', 'int'], returns: 'bool', async: true, doc: 'Tail a vehicle: tagSeconds within radius before timeLimit (s).' },
  { opcode: 0x0405, name: 'COLLECT_START', params: ['str', 'int'], returns: 'bool', async: true, doc: 'Timed collect of an item set (seconds).' },
  { opcode: 0x0406, name: 'UNLOCK_NOTE', params: ['str'], doc: 'Show an "unlocked" notification.' },
  // ---- cinematics / music / atmosphere ----
  { opcode: 0x0500, name: 'CINEMATIC_START', params: [], doc: 'Letterbox on, HUD hidden, player controls frozen.' },
  { opcode: 0x0501, name: 'CINEMATIC_END', params: [], doc: 'Back to gameplay: letterbox off, HUD and controls restored.' },
  { opcode: 0x0502, name: 'CAMERA_SHOT', params: ['str', 'str', 'int'], async: true, doc: 'Camera shot: preset (establish, orbit, closeup, over_shoulder, flyover, skyline), target (place id, npc id, or "city"), duration ms. Waits until the shot ends.' },
  { opcode: 0x0503, name: 'CAMERA_FOLLOW', params: ['int', 'int'], async: true, doc: 'Cinematic chase camera on a vehicle handle for N ms.' },
  { opcode: 0x0504, name: 'SHOW_TITLE', params: ['str', 'str', 'int'], async: true, doc: 'Mission title card (title, subtitle) for N ms.' },
  { opcode: 0x0505, name: 'MUSIC_CUE', params: ['str'], doc: 'Crossfade the score to a mood: calm, tension, action, chase, sorrow, hope, triumph, villain, stealth, epic, none.' },
  { opcode: 0x0506, name: 'SLOW_MOTION', params: ['float', 'int'], doc: 'Time scale (0.1..1) for N real milliseconds.' },
  { opcode: 0x0507, name: 'SCREEN_SHAKE', params: ['float'], doc: 'Camera shake impulse (0..1).' },
  { opcode: 0x0508, name: 'SET_HOUR', params: ['float'], doc: 'Jump the clock to an hour of day (0..24).' },
  { opcode: 0x0509, name: 'SET_WEATHER', params: ['str'], doc: 'Weather: clear, rain or storm.' },
  { opcode: 0x050a, name: 'PLAY_SFX', params: ['str'], doc: 'Play a sound effect by name.' },
  // ---- combat / police / crime (Season 3) ----
  { opcode: 0x0600, name: 'GIVE_WEAPON', params: ['str', 'int'], doc: 'Give the player a weapon (fists, bat, knife, taser, pistol, smg, shotgun, rifle, sniper, or "armor") with N rounds.' },
  { opcode: 0x0601, name: 'SPAWN_ENEMY', params: ['str', 'float', 'float', 'float'], returns: 'int', doc: 'Spawn an enemy type (lotus, lotus_heavy, lotus_sniper, gang, thug, courier, intruder, guard, hostage_taker) at x z heading; returns an enemy handle.' },
  { opcode: 0x0602, name: 'SPAWN_ENEMY_GROUP', params: ['str', 'str', 'int'], returns: 'int', doc: 'Spawn N enemies of a type around a named place; returns a group handle.' },
  { opcode: 0x0603, name: 'WAIT_ENEMIES_CLEARED', params: ['int'], async: true, doc: 'Wait until every enemy in a group is dead, knocked out, tied up, surrendered or gone.' },
  { opcode: 0x0604, name: 'SET_ENEMY_TARGET', params: ['int'], doc: 'Enemy (or group) handle starts hunting the player immediately.' },
  { opcode: 0x0605, name: 'IS_ENEMY_DEAD', params: ['int'], returns: 'bool', doc: 'Enemy handle is out of the fight (or every member of a group handle is).' },
  { opcode: 0x0606, name: 'SET_WANTED', params: ['int'], doc: 'Set the police wanted level (0..5 stars).' },
  { opcode: 0x0607, name: 'CLEAR_WANTED', params: [], doc: 'Clear the wanted level and call off the police.' },
  { opcode: 0x0608, name: 'WAIT_WANTED_CLEARED', params: [], async: true, doc: 'Wait until the player has lost the police (0 stars).' },
  { opcode: 0x0609, name: 'SPAWN_PICKUP', params: ['str', 'float', 'float'], doc: 'Glowing pickup at x z: a weapon id, "ammo", "armor", "health" or "cash".' },
  { opcode: 0x060a, name: 'ARREST_TARGET', params: ['int'], returns: 'bool', async: true, doc: 'Resolves TRUE when the enemy is knocked out, tased, zip-tied or surrenders; FALSE if killed or escaped.' },
  { opcode: 0x060b, name: 'START_ROBBERY', params: ['str'], returns: 'bool', async: true, doc: 'Arm a store robbery (beach, oldtown, harbor); resolves TRUE when the cash bag is grabbed.' },
  { opcode: 0x060c, name: 'WAIT_VEHICLE_DISABLED', params: ['int', 'int'], returns: 'bool', async: true, doc: 'Vehicle handle, time limit (s): TRUE when its tires/engine are shot out and it stops, FALSE if it escapes.' },
  { opcode: 0x060d, name: 'NEGOTIATE', params: ['str'], returns: 'bool', async: true, doc: 'Hostage negotiation scene (bank); TRUE when the suspects surrender, FALSE when it turns into a firefight.' },
];

const commandByName = new Map(COMMANDS.map((c) => [c.name, c]));
const commandByOpcode = new Map(COMMANDS.map((c) => [c.opcode, c]));
const controlByName = new Map(CONTROL_OPS.map((c) => [c.name, c]));
const controlByOpcode = new Map(CONTROL_OPS.map((c) => [c.opcode, c]));

export const commandSpec = (name: string): CommandSpec | undefined => commandByName.get(name.toUpperCase());
export const commandByOp = (op: number): CommandSpec | undefined => commandByOpcode.get(op);
export const controlOp = (op: number): ControlOp | undefined => controlByOpcode.get(op);
export const controlByNameLookup = (name: string): ControlOp | undefined => controlByName.get(name.toUpperCase());

export function opcodeName(op: number): string {
  return controlByOpcode.get(op)?.name ?? commandByOpcode.get(op)?.name ?? `OP_${op.toString(16).padStart(4, '0')}`;
}
