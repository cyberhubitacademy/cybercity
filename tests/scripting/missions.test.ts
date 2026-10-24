import { describe, expect, it } from 'vitest';
import { COMMANDS, compile, disassemble, verify } from '../../src/scripting';
import { MISSION_IDS, MISSION_SOURCES, missionProgram } from '../../src/scripting/missionSources';
import { run } from './helpers';

// Mission sources come from the same Vite `?raw` bundle the game uses.
const files = MISSION_IDS.map((id) => `${id}.scm`);
const src = (f: string) => MISSION_SOURCES[f.replace(/\.scm$/, '')];
const challengeMissions = files.filter((f) => /START_CHALLENGE/.test(src(f)));

describe('mission scripts (end to end: compile -> verify -> VM -> MockHost)', () => {
  it('ships all 28 missions', () => {
    expect([...files].sort()).toEqual([
      'm01-welcome.scm', 'm02-phish.scm', 'm03-wire.scm', 'm04-walls.scm', 'm05-chase.scm', 'm06-payload.scm',
      'm07-footprints.scm', 'm08-cipher.scm', 'm09-final.scm',
      's2-01.scm', 's2-02.scm', 's2-03.scm', 's2-04.scm', 's2-05.scm', 's2-06.scm', 's2-07.scm', 's2-08.scm', 's2-side-1.scm', 's2-side-2.scm',
      's3-01.scm', 's3-02.scm', 's3-03.scm', 's3-04.scm', 's3-05.scm', 's3-06.scm',
      'side-password.scm', 'side-social.scm', 'side-wifi.scm',
    ]);
  });

  it.each(files)('%s compiles, verifies, disassembles and reaches MISSION_COMPLETE', (f) => {
    const { bytes } = compile(src(f), { file: f });
    const p = verify(bytes);
    expect(disassemble(p).length).toBeGreaterThan(100);
    const r = run(src(f));
    expect(r.inst.outcome, r.inst.reason).toBe('completed');
    expect(r.host.outcome).toBe('complete');
    expect(r.host.calls.at(-1)).toBe('MISSION_COMPLETE');
  });

  it.each(challengeMissions)('%s retries a failed challenge instead of failing the mission', (f) => {
    const r = run(src(f), { challengeResults: [false, true] });
    expect(r.inst.outcome).toBe('completed');
    const starts = r.host.calls.filter((c) => c.startsWith('START_CHALLENGE'));
    expect(starts).toHaveLength(2);
    expect(starts[0]).toMatch(/FAIL$/);
    expect(r.host.calls.some((c) => c.startsWith('PRINT_HELP'))).toBe(true);
  });

  it('m05 chase: the van escaping fails the mission', () => {
    const r = run(src('m05-chase.scm'), { chaseResults: [false] });
    expect(r.inst.outcome).toBe('failed');
    expect(r.inst.reason).toBe('The van got away.');
    expect(r.host.calls.some((c) => c.startsWith('SPAWN_CAR van'))).toBe(true);
    expect(r.host.calls.some((c) => c.startsWith('SET_VEHICLE_ROUTE'))).toBe(true);
  });

  it('m05 chase: the watchdog thread fails the mission when the player is hospitalized', async () => {
    const { setup, tick } = await import('./helpers');
    const r = setup(src('m05-chase.scm'), { manualAsync: true });
    // resolve the briefing dialogue, then let the chase hang
    for (let i = 0; i < 10; i++) r.vm.update(16);
    r.host.resolveNext();
    await tick();
    for (let i = 0; i < 60; i++) r.vm.update(16);
    expect(r.inst.threads.length).toBe(2); // main + watchdog
    r.host.dead = true;
    for (let i = 0; i < 60; i++) r.vm.update(16);
    expect(r.inst.outcome).toBe('failed');
    expect(r.inst.reason).toBe('You were hospitalized.');
  });

  it('side-wifi: three timeouts fail, fewer retry', () => {
    expect(run(src('side-wifi.scm'), { collectResults: [false, false, false] }).inst.outcome).toBe('failed');
    expect(run(src('side-wifi.scm'), { collectResults: [false, true] }).inst.outcome).toBe('completed');
  });

  it('bundled sources (Vite ?raw) compile through missionSources', () => {
    expect(MISSION_IDS).toHaveLength(28);
    for (const id of MISSION_IDS) expect(missionProgram(id).instructions.length).toBeGreaterThan(5);
  });

  it('every command used by the missions exists in the table', () => {
    const names = new Set(COMMANDS.map((c) => c.name));
    for (const f of files) {
      for (const m of src(f).matchAll(/^\s*(?:[0-9][0-9A-F]{3}:\s*)?([A-Z][A-Z_]+)\b/gm)) {
        const w = m[1];
        if (['SCRIPT_START', 'SCRIPT_END', 'LOCAL', 'GLOBAL', 'SET', 'IF', 'ELSE', 'END_IF', 'WHILE', 'END_WHILE', 'GOTO', 'GOSUB', 'RETURN', 'START_THREAD', 'END_THREAD', 'WAIT'].includes(w)) continue;
        expect(names.has(w), `${f}: ${w}`).toBe(true);
      }
    }
  });
});
