import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../src/missions/data';
import type { DialogueLine, MissionDef, ObjectiveDef } from '../src/missions/types';
import { CHARACTERS, SCRIPT_LINES } from '../src/story/characters';
import { PLACES } from '../src/world/layout';
import { POSTS, TERMINALS } from '../src/world/spots';
import { parse } from '../src/scripting';
import { run } from './scripting/helpers';

// Season 2 ("Black Lotus"): data integrity, dialogue resolution and full script runs.

const S2 = MISSIONS.filter((m) => m.id.startsWith('s2-'));
const sources = import.meta.glob<string>('../missions/s2-*.scm', { query: '?raw', import: 'default', eager: true });
const scriptFor = (id: string): string => {
  const key = Object.keys(sources).find((k) => k.endsWith(`/${id}.scm`));
  if (!key) throw new Error(`no script for ${id}`);
  return sources[key];
};

const CHALLENGE_IDS = new Set([
  'phishing-1', 'traffic-1', 'firewall-1', 'password-1', 'social-1', 'malware-1', 'forensics-1', 'crypto-1', 'incident-1', 'detection-1', 'soc-1',
  'web-1', 'cloud-1', 'ai-1', 'grid-1', 'supplychain-1',
]);
const TERMINAL_IDS = new Set(TERMINALS.map((t) => t.id));
const POSTED = new Set(POSTS.map((p) => p.npc));
const SPEAKERS = new Set([...Object.keys(CHARACTERS), 'narrator']);
const MOODS = new Set(['calm', 'tension', 'action', 'chase', 'sorrow', 'hope', 'triumph', 'villain', 'stealth', 'epic', 'none']);
const PRESETS = new Set(['establish', 'orbit', 'closeup', 'over_shoulder', 'flyover', 'skyline']);
const WEATHER = new Set(['clear', 'rain', 'storm']);
const SFX = new Set(['alert', 'crash', 'horn', 'whoosh', 'beep', 'good', 'bad']);

/** Mirror of MissionDirector.linesFor: how a SHOW_DIALOGUE id becomes lines. */
function resolve(def: MissionDef, id: string): DialogueLine[] {
  const key = id.split('.')[1] ?? id;
  const [who, what] = key.split('_');
  if (what === 'brief' || key === 'alarm' || key === 'intro_call') return def.briefing;
  if (what === 'done' || what === 'debrief' || key === 'ending' || what === 'target') return def.completion;
  const talk = def.objectives.find((o): o is Extract<ObjectiveDef, { type: 'talk' }> => o.type === 'talk' && o.npc === who);
  if (talk) return talk.lines;
  return SCRIPT_LINES[key] ?? [];
}

/** Every string argument of every call to `cmd` in a script. */
function args(src: string, cmd: string): string[][] {
  const out: string[][] = [];
  for (const line of src.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.toUpperCase().startsWith(cmd + ' ') && t.toUpperCase() !== cmd) continue;
    out.push([...t.matchAll(/"([^"]*)"/g)].map((m) => m[1]));
  }
  return out;
}

function allLines(def: MissionDef): DialogueLine[] {
  return [...def.briefing, ...def.completion, ...def.objectives.flatMap((o) => (o.type === 'talk' ? o.lines : []))];
}

describe('Season 2 mission data', () => {
  it('has 8 main missions and 2 side missions with unique ids', () => {
    expect(S2.map((m) => m.id)).toEqual(['s2-01', 's2-02', 's2-03', 's2-04', 's2-05', 's2-06', 's2-07', 's2-08', 's2-side-1', 's2-side-2']);
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
  });

  it('chains after the Season 1 finale with valid prerequisites', () => {
    const ids = new Set(MISSIONS.map((m) => m.id));
    expect(S2[0].prerequisites).toEqual(['m09-final']);
    for (const m of S2) for (const p of m.prerequisites) expect(ids.has(p), `${m.id} -> ${p}`).toBe(true);
    for (let i = 1; i < 8; i++) expect(S2[i].prerequisites).toEqual([S2[i - 1].id]);
  });

  it.each(S2.map((m) => [m.id, m] as const))('%s objectives reference real places, npcs, terminals and challenges', (_id, m) => {
    if (m.giver) expect(POSTED.has(m.giver), `giver ${m.giver}`).toBe(true);
    for (const o of m.objectives) {
      if (o.type === 'goto') expect(PLACES[o.place], o.place).toBeDefined();
      if (o.type === 'talk') expect(POSTED.has(o.npc), o.npc).toBe(true);
      if (o.type === 'challenge') {
        expect(CHALLENGE_IDS.has(o.challenge), o.challenge).toBe(true);
        expect(TERMINAL_IDS.has(o.terminal), o.terminal).toBe(true);
      }
      if (o.type === 'chase') expect(PLACES[o.spawnPlace], o.spawnPlace).toBeDefined();
    }
    expect(m.learning.length).toBeGreaterThanOrEqual(2);
    expect(m.completion.length).toBeGreaterThan(0);
  });

  it('every Season 2 line is short enough to voice and spoken by a known character', () => {
    const lines = [...S2.flatMap(allLines), ...Object.entries(SCRIPT_LINES).filter(([k]) => k.startsWith('s2e')).flatMap(([, v]) => v)];
    for (const c of ['amara', 'kai', 'jules', 'nova', 'lotus']) {
      const ch = CHARACTERS[c];
      expect(ch, c).toBeDefined();
      lines.push(...[...ch.greeting, ...ch.idle].map((text) => ({ speaker: c, text })));
    }
    expect(lines.length).toBeGreaterThan(100);
    for (const l of lines) {
      expect(l.text.length, l.text).toBeLessThan(220);
      expect(SPEAKERS.has(l.speaker), l.speaker).toBe(true);
    }
  });
});

describe('Season 2 scripts', () => {
  it.each(S2.map((m) => [m.id, m] as const))('%s parses and every reference resolves', (id, def) => {
    const src = scriptFor(id);
    expect(parse(src, `${id}.scm`).errors).toEqual([]);
    for (const [d] of args(src, 'SHOW_DIALOGUE')) expect(resolve(def, d).length, `dialogue ${d}`).toBeGreaterThan(0);
    for (const [npc] of args(src, 'WAIT_FOR_TALK')) expect(POSTED.has(npc), npc).toBe(true);
    for (const cmd of ['IS_PLAYER_AT', 'ADD_BLIP', 'SET_WAYPOINT']) for (const [p] of args(src, cmd)) expect(PLACES[p], `${cmd} ${p}`).toBeDefined();
    for (const [c, t] of args(src, 'START_CHALLENGE')) {
      expect(CHALLENGE_IDS.has(c), c).toBe(true);
      expect(TERMINAL_IDS.has(t), t).toBe(true);
    }
    for (const [preset, target] of args(src, 'CAMERA_SHOT')) {
      expect(PRESETS.has(preset), preset).toBe(true);
      expect(target === 'city' || !!PLACES[target] || POSTED.has(target), target).toBe(true);
    }
    for (const [mood] of args(src, 'MUSIC_CUE')) expect(MOODS.has(mood), mood).toBe(true);
    for (const [w] of args(src, 'SET_WEATHER')) expect(WEATHER.has(w), w).toBe(true);
    for (const [s] of args(src, 'PLAY_SFX')) expect(SFX.has(s), s).toBe(true);
    expect(src).toMatch(/MISSION_COMPLETE/);
  });

  it.each(S2.filter((m) => !m.id.includes('side')).map((m) => [m.id] as const))('%s is cinematic: letterbox, title card, music', (id) => {
    const src = scriptFor(id);
    expect(src).toMatch(/CINEMATIC_START/);
    expect(src).toMatch(/CINEMATIC_END/);
    expect(src).toMatch(/SHOW_TITLE/);
    expect(args(src, 'MUSIC_CUE').length).toBeGreaterThanOrEqual(3);
  });

  it.each(S2.map((m) => [m.id] as const))('%s runs to MISSION_COMPLETE against the mock host', (id) => {
    const r = run(scriptFor(id));
    expect(r.inst.outcome, r.inst.reason).toBe('completed');
  });

  it.each(S2.map((m) => [m.id] as const))('%s retries a failed challenge instead of failing', (id) => {
    const r = run(scriptFor(id), { challengeResults: [false, true] });
    expect(r.inst.outcome, r.inst.reason).toBe('completed');
    expect(r.host.calls.some((c) => c.startsWith('PRINT_HELP'))).toBe(true);
  });
});
