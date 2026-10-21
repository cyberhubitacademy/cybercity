import { TAG } from './bytecode';
import { OP } from './opcodes';
import { NativeRegistry } from './natives';
import { Instruction, Operand, Program, verify } from './verifier';
import { formatOperand } from './disassembler';
import {
  INT_MAX, INT_MIN, ParamType, Pending, ScriptHandleError, ScriptRuntimeError, ScriptValue, formatValue, sBool, sFloat, sInt, sStr,
} from './types';

// Cooperative, budgeted interpreter for verified SCMB programs.
//
// Time: the scheduler owns a script clock in milliseconds. The engine advances
// it with update(dtMs) using *game* time: pass 0 while paused, scaled dt in
// slow-motion. WAIT is measured on this clock, never on wall-clock time, and
// nothing ever blocks: a waiting thread is simply skipped until it can resume.

export type ThreadState = 'ready' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
export type InstanceOutcome = 'running' | 'completed' | 'failed' | 'ended' | 'error' | 'cancelled';

type WaitCondition =
  | { kind: 'time' }
  | { kind: 'pending'; pending: Pending; ins: Instruction }
  | { kind: 'break' };

export interface VMOptions {
  /** Max instructions one thread may run per update before yielding (default 500). */
  threadBudget?: number;
  /** Max instructions across all threads per update (default 5000). */
  frameBudget?: number;
  /** Max live threads across the VM (default 32). */
  maxThreads?: number;
  /** Max GOSUB depth per thread (default 16). */
  maxCallDepth?: number;
  /** Seed for RANDOM_INT (deterministic). */
  seed?: number;
}

export class ScriptThread {
  pc = 0;
  state: ThreadState = 'ready';
  wakeAt = 0;
  waitCondition: WaitCondition | null = null;
  error: string | null = null;
  readonly callStack: number[] = [];
  readonly locals: ScriptValue[];
  readonly stats = { instructions: 0, frames: 0 };
  /** Set by the debugger to step over a breakpoint once. */
  skipBreakOnce = false;

  constructor(readonly id: number, readonly instance: ScriptInstance, entry: number, readonly isMain: boolean) {
    this.pc = entry;
    this.locals = Array.from({ length: instance.program.localCount }, () => sInt(0));
  }

  get alive(): boolean {
    return this.state === 'ready' || this.state === 'running' || this.state === 'waiting';
  }
}

export class ScriptInstance {
  outcome: InstanceOutcome = 'running';
  reason = '';
  readonly globals: ScriptValue[];
  readonly threads: ScriptThread[] = [];
  /** Called once when the instance stops for any reason. */
  onFinish?: (instance: ScriptInstance) => void;

  constructor(readonly id: number, readonly program: Program) {
    this.globals = Array.from({ length: program.globalCount }, () => sInt(0));
  }

  get name(): string { return this.program.name; }
  get done(): boolean { return this.outcome !== 'running'; }
}

export interface TraceEvent {
  time: number;
  thread: number;
  pc: number;
  line: number;
  text: string;
}

/** Debug hooks: per-instruction trace, line breakpoints, variable inspection. */
export class ScriptDebugger {
  breakpoints = new Set<number>();
  onTrace?: (e: TraceEvent) => void;
  onBreak?: (thread: ScriptThread, line: number) => void;

  resume(thread: ScriptThread): void {
    if (thread.state === 'waiting' && thread.waitCondition?.kind === 'break') {
      thread.waitCondition = null;
      thread.state = 'ready';
      thread.skipBreakOnce = true;
    }
  }

  inspect(thread: ScriptThread): { locals: Record<string, string>; globals: Record<string, string> } {
    const p = thread.instance.program;
    const locals: Record<string, string> = {};
    thread.locals.forEach((v, i) => { locals[p.localNames[i] ?? `L${i}`] = formatValue(v); });
    const globals: Record<string, string> = {};
    thread.instance.globals.forEach((v, i) => { globals[p.globalNames[i] ?? `G${i}`] = formatValue(v); });
    return { locals, globals };
  }
}

export class ScriptScheduler {
  /** Script clock in ms (game time). */
  time = 0;
  readonly threads: ScriptThread[] = [];
  private rotate = 0;

  constructor(private vm: ScriptVM) {}

  /**
   * Advance the clock and run threads. `gameTimeMs`, when given, sets the clock
   * directly (engine-owned simulation clock); otherwise dtMs is added.
   */
  update(dtMs: number, gameTimeMs?: number): void {
    this.time = gameTimeMs ?? this.time + Math.max(0, dtMs);
    let frameLeft = this.vm.opts.frameBudget;
    const list = [...this.threads];
    const n = list.length;
    for (let k = 0; k < n && frameLeft > 0; k++) {
      const t = list[(k + this.rotate) % n];
      if (!t.alive) continue;
      if (t.state === 'waiting' && !this.vm.tryWake(t, this.time)) continue;
      if (t.state === 'ready') t.state = 'running';
      if (t.state !== 'running') continue;
      t.stats.frames++;
      frameLeft -= this.vm.runThread(t, Math.min(this.vm.opts.threadBudget, frameLeft));
      if (t.state === 'running') t.state = 'ready'; // budget exhausted: continue next update
    }
    this.rotate = n ? (this.rotate + 1) % n : 0;
    // drop finished threads
    for (let i = this.threads.length - 1; i >= 0; i--) if (!this.threads[i].alive) this.threads.splice(i, 1);
  }
}

export class ScriptVM {
  readonly opts: Required<VMOptions>;
  readonly scheduler: ScriptScheduler;
  readonly instances: ScriptInstance[] = [];
  debugger: ScriptDebugger | null = null;
  /** Called when a thread fails with a runtime error. */
  onError?: (thread: ScriptThread, message: string) => void;
  private nextThreadId = 1;
  private nextInstanceId = 1;
  private rng: number;

  constructor(readonly natives: NativeRegistry, opts: VMOptions = {}) {
    this.opts = { threadBudget: 500, frameBudget: 5000, maxThreads: 32, maxCallDepth: 16, seed: 1985, ...opts };
    this.rng = this.opts.seed >>> 0;
    this.scheduler = new ScriptScheduler(this);
  }

  /** Deterministic PRNG (mulberry32) in [0, 1). */
  random(): number {
    this.rng = (this.rng + 0x6d2b79f5) >>> 0;
    let t = this.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get time(): number { return this.scheduler.time; }

  /** Verify (if needed) and start a program. Its main thread runs on the next update. */
  start(code: Uint8Array | Program, onFinish?: (i: ScriptInstance) => void): ScriptInstance {
    const program = code instanceof Uint8Array ? verify(code) : code;
    const inst = new ScriptInstance(this.nextInstanceId++, program);
    inst.onFinish = onFinish;
    this.instances.push(inst);
    this.spawnThread(inst, 0, true);
    return inst;
  }

  update(dtMs: number, gameTimeMs?: number): void {
    this.scheduler.update(dtMs, gameTimeMs);
  }

  cancel(inst: ScriptInstance, reason = 'cancelled'): void {
    this.finish(inst, 'cancelled', reason);
  }

  private spawnThread(inst: ScriptInstance, entry: number, isMain: boolean): ScriptThread {
    const live = this.scheduler.threads.filter((t) => t.alive).length;
    if (live >= this.opts.maxThreads) throw new ScriptRuntimeError(`thread limit reached (${this.opts.maxThreads})`);
    const t = new ScriptThread(this.nextThreadId++, inst, entry, isMain);
    inst.threads.push(t);
    this.scheduler.threads.push(t);
    return t;
  }

  private finish(inst: ScriptInstance, outcome: InstanceOutcome, reason = '', except?: ScriptThread): void {
    if (inst.done) return;
    inst.outcome = outcome;
    inst.reason = reason;
    for (const t of inst.threads) {
      if (t !== except && t.alive) { t.state = 'cancelled'; t.waitCondition = null; }
    }
    const idx = this.instances.indexOf(inst);
    if (idx >= 0) this.instances.splice(idx, 1);
    inst.onFinish?.(inst);
  }

  /** Check whether a waiting thread can resume; performs pending result write-back. */
  tryWake(t: ScriptThread, now: number): boolean {
    const w = t.waitCondition;
    if (!w) { t.state = 'ready'; return true; }
    if (w.kind === 'time') {
      if (now < t.wakeAt) return false;
    } else if (w.kind === 'pending') {
      if (w.pending.state === 'pending') return false;
      if (w.pending.state === 'rejected') {
        this.fail(t, `${w.ins.command?.name ?? 'native'} failed: ${w.pending.error}`);
        return false;
      }
      try {
        if (w.ins.result) {
          const v = w.pending.value;
          if (!v) throw new ScriptRuntimeError(`${w.ins.command?.name} resolved without a value`);
          this.checkReturn(w.ins, v);
          this.write(t, w.ins.result, v);
        }
      } catch (e) {
        this.fail(t, e instanceof Error ? e.message : String(e));
        return false;
      }
      t.pc++;
    } else {
      return false; // paused at a breakpoint until the debugger resumes it
    }
    t.waitCondition = null;
    t.state = 'ready';
    return true;
  }

  private fail(t: ScriptThread, message: string): void {
    const p = t.instance.program;
    const line = p.lines[t.pc] ?? 0;
    const full = `${p.name}${line ? `:${line}` : ''} [thread ${t.id}]: ${message}`;
    t.state = 'failed';
    t.error = full;
    t.waitCondition = null;
    this.onError?.(t, full);
    if (t.isMain) this.finish(t.instance, 'error', full, t);
  }

  // ---------- value access ----------

  private read(t: ScriptThread, o: Operand): ScriptValue {
    const p = t.instance.program;
    switch (o.tag) {
      case TAG.INT: return sInt(o.v as number);
      case TAG.FLOAT: return { t: 'float', v: o.v as number };
      case TAG.BOOL: return sBool(o.v as boolean);
      case TAG.STR: return sStr(p.strings[o.v as number]);
      case TAG.LVAR: return t.locals[o.v as number];
      case TAG.GVAR: return t.instance.globals[o.v as number];
      default: throw new ScriptRuntimeError('label used as a value');
    }
  }

  private write(t: ScriptThread, o: Operand, v: ScriptValue): void {
    if (o.tag === TAG.LVAR) t.locals[o.v as number] = v;
    else if (o.tag === TAG.GVAR) t.instance.globals[o.v as number] = v;
    else throw new ScriptRuntimeError('result operand is not a variable');
  }

  private coerce(v: ScriptValue, want: ParamType, name: string, i: number): ScriptValue {
    if (want === 'any' || v.t === want) return v;
    if (want === 'float' && v.t === 'int') return sFloat(v.v);
    throw new ScriptRuntimeError(`${name} argument ${i + 1}: expected ${want}, got ${v.t} ${formatValue(v)}`);
  }

  private checkReturn(ins: Instruction, v: ScriptValue): void {
    const want = ins.command?.returns;
    if (want && want !== 'any' && v.t !== want && !(want === 'float' && v.t === 'int')) {
      throw new ScriptRuntimeError(`${ins.command?.name} returned ${v.t}, expected ${want}`);
    }
  }

  private num(v: ScriptValue, op: string): number {
    if (v.t === 'int' || v.t === 'float') return v.v;
    throw new ScriptRuntimeError(`${op}: expected a number, got ${v.t} ${formatValue(v)}`);
  }

  private arith(op: number, a: ScriptValue, b: ScriptValue): ScriptValue {
    if (op === OP.ADD && (a.t === 'str' || b.t === 'str')) {
      const s = (x: ScriptValue) => (x.t === 'str' ? x.v : formatValue(x));
      return sStr(s(a) + s(b));
    }
    const name = op === OP.ADD ? 'ADD' : op === OP.SUB ? 'SUB' : op === OP.MUL ? 'MUL' : op === OP.DIV ? 'DIV' : 'MOD';
    const x = this.num(a, name), y = this.num(b, name);
    if ((op === OP.DIV || op === OP.MOD) && y === 0) throw new ScriptRuntimeError(`${name}: division by zero`);
    if (a.t === 'int' && b.t === 'int') {
      // explicit two's-complement int32 wrap-around
      switch (op) {
        case OP.ADD: return sInt((x + y) | 0);
        case OP.SUB: return sInt((x - y) | 0);
        case OP.MUL: return sInt(Math.imul(x, y));
        case OP.DIV: return sInt(Math.trunc(x / y) | 0);
        default: return sInt((x % y) | 0);
      }
    }
    switch (op) {
      case OP.ADD: return sFloat(x + y);
      case OP.SUB: return sFloat(x - y);
      case OP.MUL: return sFloat(x * y);
      case OP.DIV: return sFloat(x / y);
      default: return sFloat(x % y);
    }
  }

  private compare(op: number, a: ScriptValue, b: ScriptValue): boolean {
    const numeric = (a.t === 'int' || a.t === 'float') && (b.t === 'int' || b.t === 'float');
    if (op === OP.CMP_EQ || op === OP.CMP_NE) {
      let eq: boolean;
      if (numeric) eq = a.v === b.v;
      else if (a.t === b.t) eq = a.v === b.v;
      else throw new ScriptRuntimeError(`cannot compare ${a.t} with ${b.t}`);
      return op === OP.CMP_EQ ? eq : !eq;
    }
    if (!numeric) throw new ScriptRuntimeError(`ordering comparison needs numbers, got ${a.t} and ${b.t}`);
    const x = a.v as number, y = b.v as number;
    switch (op) {
      case OP.CMP_LT: return x < y;
      case OP.CMP_LE: return x <= y;
      case OP.CMP_GT: return x > y;
      default: return x >= y;
    }
  }

  private truthy(v: ScriptValue): boolean {
    if (v.t === 'bool') return v.v;
    if (v.t === 'int') return v.v !== 0;
    throw new ScriptRuntimeError(`condition must be bool, got ${v.t}`);
  }

  // ---------- interpreter ----------

  /** Run up to `budget` instructions. Returns the number executed. */
  runThread(t: ScriptThread, budget: number): number {
    const p = t.instance.program;
    let used = 0;
    const dbg = this.debugger;
    while (used < budget && t.state === 'running') {
      const ins = p.instructions[t.pc];
      if (!ins) { this.fail(t, `program counter ${t.pc} out of range`); break; }
      const line = p.lines[t.pc] ?? 0;
      if (dbg) {
        if (line && dbg.breakpoints.has(line) && !t.skipBreakOnce) {
          t.state = 'waiting';
          t.waitCondition = { kind: 'break' };
          dbg.onBreak?.(t, line);
          break;
        }
        t.skipBreakOnce = false;
        if (dbg.onTrace) {
          const args = ins.args.map((a) => formatOperand(p, a)).join(' ');
          const name = ins.control?.name ?? ins.command?.name ?? '?';
          dbg.onTrace({ time: this.time, thread: t.id, pc: ins.pc, line, text: `${name}${args ? ' ' + args : ''}${ins.result ? ' -> ' + formatOperand(p, ins.result) : ''}` });
        }
      }
      used++;
      t.stats.instructions++;
      try {
        this.step(t, ins);
      } catch (e) {
        if (e instanceof ScriptRuntimeError || e instanceof ScriptHandleError) this.fail(t, e.message);
        else this.fail(t, `native error: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
    return used;
  }

  private step(t: ScriptThread, ins: Instruction): void {
    const a = ins.args;
    switch (ins.opcode) {
      case OP.NOP: t.pc++; return;
      case OP.WAIT: {
        const ms = this.read(t, a[0]);
        if (ms.t !== 'int') throw new ScriptRuntimeError(`WAIT needs an int, got ${ms.t}`);
        t.pc++;
        t.wakeAt = this.time + Math.max(0, ms.v);
        t.state = 'waiting';
        t.waitCondition = { kind: 'time' };
        return;
      }
      case OP.GOTO: t.pc = a[0].v as number; return;
      case OP.JUMP_IF_FALSE:
        t.pc = this.truthy(this.read(t, a[0])) ? t.pc + 1 : (a[1].v as number);
        return;
      case OP.SET: this.write(t, ins.result!, this.read(t, a[0])); t.pc++; return;
      case OP.ADD: case OP.SUB: case OP.MUL: case OP.DIV: case OP.MOD:
        this.write(t, ins.result!, this.arith(ins.opcode, this.read(t, a[0]), this.read(t, a[1])));
        t.pc++;
        return;
      case OP.CMP_EQ: case OP.CMP_NE: case OP.CMP_LT: case OP.CMP_LE: case OP.CMP_GT: case OP.CMP_GE:
        this.write(t, ins.result!, sBool(this.compare(ins.opcode, this.read(t, a[0]), this.read(t, a[1]))));
        t.pc++;
        return;
      case OP.NOT: this.write(t, ins.result!, sBool(!this.truthy(this.read(t, a[0])))); t.pc++; return;
      case OP.GOSUB:
        if (t.callStack.length >= this.opts.maxCallDepth) throw new ScriptRuntimeError(`call stack overflow (max ${this.opts.maxCallDepth})`);
        t.callStack.push(t.pc + 1);
        t.pc = a[0].v as number;
        return;
      case OP.RETURN: {
        const back = t.callStack.pop();
        if (back === undefined) throw new ScriptRuntimeError('RETURN with empty call stack');
        t.pc = back;
        return;
      }
      case OP.START_THREAD:
        this.spawnThread(t.instance, a[0].v as number, false);
        t.pc++;
        return;
      case OP.END_THREAD:
        t.state = 'completed';
        if (t.isMain) this.finish(t.instance, 'ended', 'main thread ended', t);
        return;
      case OP.END_SCRIPT:
        t.state = 'completed';
        this.finish(t.instance, 'ended', 'SCRIPT_END reached', t);
        return;
      default:
        this.native(t, ins);
    }
  }

  private native(t: ScriptThread, ins: Instruction): void {
    const bound = this.natives.get(ins.opcode);
    const spec = ins.command;
    if (!spec) throw new ScriptRuntimeError(`opcode ${ins.opcode} is not a command`);
    if (!bound) throw new ScriptRuntimeError(`native ${spec.name} has no handler`);
    const args = ins.args.map((o, i) => this.coerce(this.read(t, o), spec.params[i], spec.name, i));
    for (const v of args) {
      if (v.t === 'int' && (v.v < INT_MIN || v.v > INT_MAX)) throw new ScriptRuntimeError('int argument out of range');
    }
    const out = bound.handler({ vm: this, thread: t, instance: t.instance }, args);
    if (out instanceof Pending) {
      if (!spec.async) throw new ScriptRuntimeError(`${spec.name} returned a pending result but is not async`);
      t.state = 'waiting';
      t.waitCondition = { kind: 'pending', pending: out, ins };
      return; // pc advances when the pending result is written back
    }
    if (spec.async) throw new ScriptRuntimeError(`${spec.name} is async but returned synchronously`);
    if (spec.returns && ins.result) {
      if (!out) throw new ScriptRuntimeError(`${spec.name} returned no value`);
      this.checkReturn(ins, out);
      this.write(t, ins.result, out);
    }
    t.pc++;
    if (spec.terminates) {
      t.state = 'completed';
      const reason = spec.terminates === 'fail' ? String(args[0]?.v ?? '') : '';
      this.finish(t.instance, spec.terminates === 'complete' ? 'completed' : 'failed', reason, t);
    }
  }
}
