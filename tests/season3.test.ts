import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../src/missions/data';
import type { DialogueLine, MissionDef, ObjectiveDef } from '../src/missions/types';
import { CHARACTERS, SCRIPT_LINES } from '../src/story/characters';
import { PLACES } from '../src/world/layout';
import { POSTS, TERMINALS } from '../src/world/spots';
import { COMMANDS, parse } from '../src/scripting';
import { isWeaponId } from '../src/systems/combat/weapons';
import { ENEMY_TYPES } from '../src/systems/combat/enemyTypes';
import { STORES } from '../src/systems/crime/system';
import { NEGOTIATIONS } from '../src/systems/combat/negotiate';
import { run } from './scripting/helpers';

// Season 3 ("Physical Threats"): data integrity, new natives, and every script
// running to MISSION_COMPLETE against the MockHost (including retry paths).

const S3 = MISSIONS.filter((m) => m.id.startsWith('s3-'));
const sources = import.meta.glob<string>('../missions/s3-*.scm', { query: '?raw', import: 'default', eager: true });
const scriptFor = (id: string): string => {
  const key = Object.keys(sources).find((k) => k.endsWith(`/${id}.scm`));
  if (!key) throw new Error(`no script for ${id}`);
  return sources[key];
};
const POSTED = new Set(POSTS.map((p) => p.npc));
const TERMINAL_IDS = new Set(TERMINALS.map((t) => t.id));
const SPEAKERS = new Set([...Object.keys(CHARACTERS), 'narrator']);

function resolve(def: MissionDef, id: string): DialogueLine[] {
  const key = id.split('.')[1] ?? id;
  const [who, what] = key.split('_');
  if (what === 'brief' || key === 'alarm' || key === 'intro_call') return def.briefing;
  if (what === 'done' || what === 'debrief' || key === 'ending' || what === 'target') return def.completion;
  const talk = def.objectives.find((o): o is Extract<ObjectiveDef, { type: 'talk' }> => o.type === 'talk' && o.npc === who);
  if (talk) return talk.lines;
  return SCRIPT_LINES[key] ?? [];
}

function args(src: string, cmd: string): string[][] {
  const out: string[][] = [];
  for (const line of src.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.toUpperCase().startsWith(cmd + ' ') && t.toUpperCase() !== cmd) continue;
    out.push([...t.matchAll(/"([^"]*)"/g)].map((m) => m[1]));
  }
  return out;
}

describe('Season 3 natives', () => {
  it('live in their own stable opcode range', () => {
    const s3 = COMMANDS.filter((c) => c.opcode >= 0x0600 && c.opcode < 0x0700).map((c) => c.name);
    expect(s3).toEqual(['GIVE_WEAPON', 'SPAWN_ENEMY', 'SPAWN_ENEMY_GROUP', 'WAIT_ENEMIES_CLEARED', 'SET_ENEMY_TARGET', 'IS_ENEMY_DEAD', 'SET_WANTED', 'CLEAR_WANTED', 'WAIT_WANTED_CLEARED', 'SPAWN_PICKUP', 'ARREST_TARGET', 'START_ROBBERY', 'WAIT_VEHICLE_DISABLED', 'NEGOTIATE']);
    expect(new Set(COMMANDS.map((c) => c.opcode)).size).toBe(COMMANDS.length);
  });

  it('run against the mock host', () => {
    const r = run(`SCRIPT_START t
LOCAL e = 0
LOCAL g = 0
LOCAL ok = FALSE
GIVE_WEAPON "taser" 6
SPAWN_ENEMY "lotus" 10.0 20.0 0.0 -> e
SPAWN_ENEMY_GROUP "gang" "docks" 3 -> g
SET_ENEMY_TARGET g
WAIT_ENEMIES_CLEARED g
WHILE NOT IS_ENEMY_DEAD e
    WAIT 100
END_WHILE
SET_WANTED 3
WAIT_WANTED_CLEARED
CLEAR_WANTED
SPAWN_PICKUP "armor" 1.0 2.0
ARREST_TARGET e -> ok
START_ROBBERY "beach" -> ok
NEGOTIATE "bank" -> ok
MISSION_COMPLETE
SCRIPT_END`);
    expect(r.inst.outcome, r.inst.reason).toBe('completed');
    const c = r.host.calls.join('\n');
    for (const k of ['GIVE_WEAPON taser 6', 'SPAWN_ENEMY lotus', 'SPAWN_ENEMY_GROUP gang docks 3', 'WAIT_ENEMIES_CLEARED', 'SET_WANTED 3', 'WAIT_WANTED_CLEARED', 'ARREST_TARGET', 'START_ROBBERY beach', 'NEGOTIATE bank']) expect(c).toContain(k);
    expect(r.host.weapons).toEqual(['taser']);
  });

  it('enemy handles are checked', () => {
    const r = run('SCRIPT_START t\nSET_ENEMY_TARGET 999\nMISSION_COMPLETE\nSCRIPT_END');
    expect(r.inst.outcome).toBe('error');
  });
});

describe('Season 3 mission data', () => {
  it('six missions chained after m05-chase', () => {
    expect(S3.map((m) => m.id)).toEqual(['s3-01', 's3-02', 's3-03', 's3-04', 's3-05', 's3-06']);
    expect(S3[0].prerequisites).toEqual(['m05-chase']);
    for (let i = 1; i < 6; i++) expect(S3[i].prerequisites).toEqual([S3[i - 1].id]);
    for (const m of S3) {
      expect(m.giver && POSTED.has(m.giver), `${m.id} giver`).toBe(true);
      expect(['max', 'marisol', 'tito', 'dex', 'amara', 'kai']).toContain(m.giver);
      expect(m.learning.length).toBeGreaterThanOrEqual(3);
      expect(m.completion.length).toBeGreaterThan(0);
    }
  });

  it('teaches the physical-security topics', () => {
    const text = S3.flatMap((m) => [...m.learning, ...m.briefing.map((l) => l.text), ...m.completion.map((l) => l.text)]).join(' ').toLowerCase()
      + Object.entries(SCRIPT_LINES).filter(([k]) => k.startsWith('s3e')).flatMap(([, v]) => v.map((l) => l.text)).join(' ').toLowerCase();
    for (const topic of ['tailgating', 'badge', 'cctv', 'mantrap', 'clean desk', 'shred', 'skimmer', 'authorization letter', 'access log', 'encrypt', 'scope']) {
      expect(text, topic).toContain(topic);
    }
  });

  it('every Season 3 line is voiceable and spoken by a known character', () => {
    const lines = [...S3.flatMap((m) => [...m.briefing, ...m.completion]), ...Object.entries(SCRIPT_LINES).filter(([k]) => k.startsWith('s3e')).flatMap(([, v]) => v)];
    expect(lines.length).toBeGreaterThan(40);
    for (const l of lines) {
      expect(l.text.length, l.text).toBeLessThan(220);
      expect(SPEAKERS.has(l.speaker), l.speaker).toBe(true);
    }
    expect(CHARACTERS.reyes).toBeDefined();
    expect(CHARACTERS.ortiz).toBeDefined();
  });
});

describe('Season 3 scripts', () => {
  it.each(S3.map((m) => [m.id, m] as const))('%s parses and every reference resolves', (id, def) => {
    const src = scriptFor(id);
    expect(parse(src, `${id}.scm`).errors).toEqual([]);
    for (const [d] of args(src, 'SHOW_DIALOGUE')) expect(resolve(def, d).length, `dialogue ${d}`).toBeGreaterThan(0);
    for (const cmd of ['IS_PLAYER_AT', 'ADD_BLIP', 'SET_WAYPOINT']) for (const [p] of args(src, cmd)) expect(PLACES[p], `${cmd} ${p}`).toBeDefined();
    for (const [, p] of args(src, 'SPAWN_ENEMY_GROUP').map((a) => a)) expect(PLACES[p], p).toBeDefined();
    for (const [t] of [...args(src, 'SPAWN_ENEMY'), ...args(src, 'SPAWN_ENEMY_GROUP')]) expect(ENEMY_TYPES[t], t).toBeDefined();
    for (const [w] of args(src, 'GIVE_WEAPON')) expect(isWeaponId(w) || w === 'armor', w).toBe(true);
    for (const [s] of args(src, 'START_ROBBERY')) expect(STORES.some((x) => x.id === s), s).toBe(true);
    for (const [n] of args(src, 'NEGOTIATE')) expect(NEGOTIATIONS[n], n).toBeDefined();
    for (const [, t] of args(src, 'START_CHALLENGE')) expect(TERMINAL_IDS.has(t), t).toBe(true);
    for (const [preset, target] of args(src, 'CAMERA_SHOT')) expect(target === 'city' || !!PLACES[target] || POSTED.has(target), `${preset} ${target}`).toBe(true);
    expect(src).toMatch(/CINEMATIC_START/);
    expect(src).toMatch(/SHOW_TITLE/);
    expect(args(src, 'MUSIC_CUE').length).toBeGreaterThanOrEqual(3);
    expect(src).toMatch(/MISSION_COMPLETE/);
  });

  it.each(S3.map((m) => [m.id] as const))('%s runs to MISSION_COMPLETE against the mock host', (id) => {
    const r = run(scriptFor(id));
    expect(r.inst.outcome, r.inst.reason).toBe('completed');
  });

  it.each(S3.map((m) => [m.id] as const))('%s survives failures: retries instead of failing', (id) => {
    const r = run(scriptFor(id), { challengeResults: [false, true], arrestResults: [false, true], disabledResults: [false, true], robberyResults: [false, true], collectResults: [false, true], negotiateResults: [false] });
    expect(r.inst.outcome, r.inst.reason).toBe('completed');
  });

  it('a hospitalized player fails the mission', () => {
    const src = scriptFor('s3-03');
    const r = run(src, { manualAsync: true }, {}, 50);
    r.host.dead = true;
    for (let i = 0; i < 100; i++) r.vm.update(16);
    expect(r.inst.outcome).toBe('failed');
  });
});
