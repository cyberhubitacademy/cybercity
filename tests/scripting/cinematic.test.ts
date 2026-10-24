import { describe, expect, it } from 'vitest';
import { compileErrors, run, setup, tick, wrap } from './helpers';
import { COMMANDS, commandSpec } from '../../src/scripting';

describe('cinematic natives', () => {
  it('are in the command table with stable opcodes in the 0x05xx range', () => {
    const names = ['CINEMATIC_START', 'CINEMATIC_END', 'CAMERA_SHOT', 'CAMERA_FOLLOW', 'SHOW_TITLE', 'MUSIC_CUE', 'SLOW_MOTION', 'SCREEN_SHAKE', 'SET_HOUR', 'SET_WEATHER', 'PLAY_SFX'];
    names.forEach((n, i) => expect(commandSpec(n)?.opcode).toBe(0x0500 + i));
    expect(new Set(COMMANDS.map((c) => c.opcode)).size).toBe(COMMANDS.length);
  });

  it('run a full cutscene and record every call in order', () => {
    const r = run(wrap(`
CINEMATIC_START
MUSIC_CUE "tension"
SET_WEATHER "storm"
SET_HOUR 21.5
SHOW_TITLE "GHOST PROTOCOL" "Chapter 10" 2500
CAMERA_SHOT "establish" "hospital" 3000
CAMERA_SHOT "closeup" "max" 2000
SCREEN_SHAKE 0.8
SLOW_MOTION 0.3 1500
PLAY_SFX "alert"
CINEMATIC_END
MUSIC_CUE "none"
MISSION_COMPLETE`));
    expect(r.inst.outcome).toBe('completed');
    expect(r.host.calls).toEqual([
      'CINEMATIC_START',
      'MUSIC_CUE tension',
      'SET_WEATHER storm',
      'SET_HOUR 21.5',
      'SHOW_TITLE GHOST PROTOCOL | Chapter 10 2500',
      'CAMERA_SHOT establish hospital 3000',
      'CAMERA_SHOT closeup max 2000',
      expect.stringMatching(/^SCREEN_SHAKE 0\.8/),
      expect.stringMatching(/^SLOW_MOTION 0\.3\d* 1500$/),
      'PLAY_SFX alert',
      'CINEMATIC_END',
      'MUSIC_CUE none',
      'MISSION_COMPLETE',
    ]);
    expect(r.host.cinematic).toBe(false);
  });

  it('CAMERA_SHOT, SHOW_TITLE and CAMERA_FOLLOW suspend the thread until resolved', async () => {
    const r = setup(wrap(`
LOCAL van = 0
SPAWN_CAR "van" 0.0 0.0 0.0 -> van
SHOW_TITLE "A" "B" 1000
CAMERA_SHOT "orbit" "pier" 1000
CAMERA_FOLLOW van 1000
MISSION_COMPLETE`), { manualAsync: true });
    r.vm.update(16);
    expect(r.host.calls.at(-1)).toBe('SHOW_TITLE A | B 1000');
    r.vm.update(16);
    expect(r.inst.done).toBe(false);
    for (const label of ['title', 'shot orbit', 'follow']) {
      expect(r.host.resolveNext()).toBe(label);
      await tick();
      r.vm.update(16);
    }
    expect(r.inst.outcome).toBe('completed');
  });

  it('unknown preset, mood or weather fails the thread with the source line', () => {
    for (const [cmd, word] of [['CAMERA_SHOT "dolly_zoom" "pier" 1000', 'camera preset'], ['MUSIC_CUE "jazz"', 'music mood'], ['SET_WEATHER "snow"', 'weather']] as const) {
      const r = run(wrap(`WAIT 0\n${cmd}\nMISSION_COMPLETE`));
      expect(r.inst.outcome).toBe('error');
      expect(r.inst.reason).toContain(word);
      expect(r.inst.reason).toMatch(/^t:3 /); // file:line of the offending command
    }
  });

  it('CAMERA_FOLLOW on a stale handle fails only that thread', () => {
    const r = run(wrap('CAMERA_FOLLOW 999 1000\nMISSION_COMPLETE'));
    expect(r.inst.outcome).toBe('error');
    expect(r.inst.reason).toMatch(/handle 999/);
  });

  it('argument types are checked at compile time', () => {
    expect(compileErrors(wrap('SHOW_TITLE "only title"')).length).toBeGreaterThan(0);
    expect(compileErrors(wrap('MUSIC_CUE 3')).length).toBeGreaterThan(0);
    expect(compileErrors(wrap('SLOW_MOTION 0.5 500'))).toEqual([]);
  });

  it('values are clamped to safe ranges', () => {
    const r = run(wrap('SLOW_MOTION 5.0 999999\nSCREEN_SHAKE -2.0\nSET_HOUR 30.0\nMISSION_COMPLETE'));
    expect(r.host.calls).toContain('SLOW_MOTION 1 60000');
    expect(r.host.calls).toContain('SCREEN_SHAKE 0');
    expect(r.host.calls.find((c) => c.startsWith('SET_HOUR'))).toBe('SET_HOUR 6');
  });
});
