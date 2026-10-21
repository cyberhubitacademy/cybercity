import { describe, expect, it } from 'vitest';
import { NativeRegistry, ScriptDebugger, ScriptVM, bindGameNatives, compile, MockHost } from '../../src/scripting';
import { local, run, setup, tick, wrap } from './helpers';

describe('WAIT and the game clock', () => {
  it('suspends for the requested game time without blocking other work', () => {
    const r = setup(wrap('LOCAL n = 0\nWAIT 1000\nSET n = 1\nWAIT 0\nSET n = 2\nMISSION_COMPLETE'));
    r.vm.update(16);
    expect(local(r, 'n').v).toBe(0);
    r.vm.update(500);
    expect(local(r, 'n').v).toBe(0);
    r.vm.update(0); // paused game: no time passes
    expect(local(r, 'n').v).toBe(0);
    r.vm.update(500); // t = 1016 >= 1016
    expect(local(r, 'n').v).toBe(1);
    r.vm.update(16); // WAIT 0 resumes on the next update
    expect(local(r, 'n').v).toBe(2);
    expect(r.inst.outcome).toBe('completed');
  });

  it('can be driven by an engine-owned absolute clock', () => {
    const r = setup(wrap('WAIT 300\nMISSION_COMPLETE'));
    r.vm.update(0, 5000);
    r.vm.update(0, 5200);
    expect(r.inst.done).toBe(false);
    r.vm.update(0, 5300);
    expect(r.inst.outcome).toBe('completed');
  });
});

describe('async natives', () => {
  it('waits on pending results and writes them back', async () => {
    const r = setup(wrap('LOCAL ok = FALSE\nWAIT_FOR_TALK "max"\nSTART_CHALLENGE "phishing-1" "cafe-terminal" -> ok\nIF ok\n  MISSION_COMPLETE\nEND_IF\nMISSION_FAILED "no"'), { manualAsync: true });
    r.vm.update(16);
    expect(r.host.pendingCount).toBe(1);
    for (let i = 0; i < 5; i++) r.vm.update(16); // still waiting, game keeps running
    expect(r.inst.done).toBe(false);
    expect(r.host.resolveNext()).toBe('talk max');
    await tick();
    r.vm.update(16);
    expect(r.host.resolveNext(true)).toBe('challenge phishing-1');
    await tick();
    r.vm.update(16);
    expect(r.inst.outcome).toBe('completed');
  });

  it('a rejected async native fails the thread', async () => {
    const host = new MockHost();
    host.showDialogue = () => Promise.reject(new Error('ui closed'));
    const vm = new ScriptVM(bindGameNatives(new NativeRegistry(), host));
    const inst = vm.start(compile(wrap('SHOW_DIALOGUE "x"\nMISSION_COMPLETE')).bytes);
    vm.update(16);
    await tick();
    vm.update(16);
    expect(inst.outcome).toBe('error');
    expect(inst.reason).toMatch(/SHOW_DIALOGUE failed: ui closed/);
  });

  it('an async native that answers synchronously is a host bug and fails the thread', () => {
    const reg = bindGameNatives(new NativeRegistry(), new MockHost());
    reg.bind('SHOW_DIALOGUE', () => undefined);
    const vm = new ScriptVM(reg);
    const inst = vm.start(compile(wrap('SHOW_DIALOGUE "x"\nMISSION_COMPLETE')).bytes);
    vm.update(16);
    expect(inst.reason).toMatch(/async but returned synchronously/);
  });
});

describe('threads, budgets and isolation', () => {
  it('runs multiple concurrent threads with separate locals and shared globals', () => {
    const r = run(wrap('GLOBAL total = 0\nLOCAL mine = 1\nSTART_THREAD worker\nSTART_THREAD worker\nWHILE total < 20\n  WAIT 10\nEND_WHILE\nMISSION_COMPLETE\nworker:\nLOCAL k = 0\nWHILE k < 10\n  SET k = k + 1\n  SET total = total + 1\n  WAIT 5\nEND_WHILE\nEND_THREAD'));
    expect(r.inst.outcome).toBe('completed');
    expect(r.inst.globals[0].v).toBe(20);
    expect(local(r, 'mine').v).toBe(1);
  });

  it('an infinite loop never monopolizes a frame', () => {
    const r = setup(wrap('LOCAL n = 0\nspin:\nSET n = n + 1\nGOTO spin'), {}, { threadBudget: 100, frameBudget: 1000 });
    r.vm.update(16);
    expect(local(r, 'n').v).toBe(50); // 100 instructions = 50 loop iterations, then yield
    r.vm.update(16);
    expect(local(r, 'n').v).toBe(100);
    expect(r.inst.done).toBe(false);
  });

  it('the frame budget is shared fairly across threads', () => {
    const r = setup(wrap('START_THREAD a\nSTART_THREAD a\nSTART_THREAD a\nWAIT 100000\na:\nGOTO a'), {}, { threadBudget: 100, frameBudget: 150 });
    r.vm.update(16);
    r.vm.update(16);
    const counts = r.inst.threads.map((t) => t.stats.instructions);
    expect(counts.reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(300 + 4);
  });

  it('invalid handles fail only the offending thread', () => {
    const r = run(wrap('GLOBAL done = FALSE\nSTART_THREAD bad\nWAIT 100\nSET done = TRUE\nMISSION_COMPLETE\nbad:\nDESTROY_ENTITY 424242\nEND_THREAD'));
    expect(r.inst.outcome).toBe('completed');
    const bad = r.inst.threads[1];
    expect(bad.state).toBe('failed');
    expect(bad.error).toMatch(/invalid entity handle 424242/);
    expect(bad.error).toMatch(/t:\d+ \[thread/);
  });

  it('runtime type errors and division by zero report the source line', () => {
    const r = run(wrap('LOCAL x = 5\nPRINT_HELP x'));
    expect(r.inst.outcome).toBe('error');
    expect(r.inst.reason).toMatch(/t:3 .*PRINT_HELP argument 1: expected str, got int 5/);
    const d = run(wrap('LOCAL z = 0\nSET z = 10 / z'));
    expect(d.inst.reason).toMatch(/division by zero/);
  });

  it('call stack overflow and RETURN underflow are caught', () => {
    expect(run(wrap('r:\nGOSUB r')).inst.reason).toMatch(/call stack overflow/);
    expect(run(wrap('RETURN')).inst.reason).toMatch(/RETURN with empty call stack/);
  });

  it('enforces the thread limit', () => {
    const r = run(wrap('l:\nSTART_THREAD idle\nGOTO l\nidle:\nWAIT 100000'), {}, { maxThreads: 4 });
    expect(r.inst.outcome).toBe('error');
    expect(r.inst.reason).toMatch(/thread limit reached \(4\)/);
  });

  it('MISSION_FAILED ends every thread of the instance', () => {
    const r = run(wrap('START_THREAD w\nWAIT 50\nMISSION_FAILED "boom"\nw:\nWAIT 100000'));
    expect(r.inst.outcome).toBe('failed');
    expect(r.inst.reason).toBe('boom');
    expect(r.inst.threads[1].state).toBe('cancelled');
    expect(r.host.outcome).toBe('failed');
  });

  it('RANDOM_INT is deterministic for a seed and within range', () => {
    const src = wrap('LOCAL a = 0\nRANDOM_INT 1 6 -> a\nMISSION_COMPLETE');
    const x = run(src, {}, { seed: 7 }), y = run(src, {}, { seed: 7 });
    expect(local(x, 'a')).toEqual(local(y, 'a'));
    expect(local(x, 'a').v).toBeGreaterThanOrEqual(1);
    expect(local(x, 'a').v).toBeLessThanOrEqual(6);
  });
});

describe('native registry', () => {
  it('rejects handlers whose signature differs from the command table', () => {
    const reg = new NativeRegistry();
    expect(() => reg.register({ name: 'PRINT_HELP', opcode: 0x0101, params: ['int'], handler: () => undefined })).toThrow(/signature/);
    expect(() => reg.register({ name: 'PRINT_HELP', opcode: 0x0999, params: ['str'], handler: () => undefined })).toThrow(/opcode/);
    expect(() => reg.bind('NOT_A_COMMAND', () => undefined)).toThrow(/not in the command table/);
  });

  it('every command is bound by bindGameNatives', () => {
    expect(bindGameNatives(new NativeRegistry(), new MockHost()).unbound()).toEqual([]);
  });

  it('an unbound native fails the thread instead of crashing', () => {
    const vm = new ScriptVM(new NativeRegistry());
    const inst = vm.start(compile(wrap('PRINT_HELP "x"')).bytes);
    vm.update(16);
    expect(inst.outcome).toBe('error');
    expect(inst.reason).toMatch(/has no handler/);
  });
});

describe('debugger', () => {
  it('traces instructions, stops at breakpoints and inspects variables', () => {
    const r = setup(wrap('LOCAL n = 1\nSET n = 2\nSET n = 3\nMISSION_COMPLETE'));
    const dbg = new ScriptDebugger();
    const lines: number[] = [];
    dbg.onTrace = (e) => lines.push(e.line);
    dbg.breakpoints.add(4);
    r.vm.debugger = dbg;
    r.vm.update(16);
    const t = r.inst.threads[0];
    expect(t.state).toBe('waiting');
    expect(dbg.inspect(t).locals.n).toBe('2');
    dbg.resume(t);
    r.vm.update(16);
    expect(r.inst.outcome).toBe('completed');
    expect(lines).toEqual([2, 3, 4, 5]);
  });
});
