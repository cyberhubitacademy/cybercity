import { Atom, Cond, Expr, Stmt, parse } from './parser';
import { OP, commandSpec, CommandSpec } from './opcodes';
import { ByteWriter, FLAG_DEBUG, FORMAT_VERSION, HEADER_SIZE, LIMITS, MAGIC, TAG, crc32, operandSize, textEncoder } from './bytecode';
import { CompileErrors, INT_MAX, INT_MIN, ParamType, ScriptError } from './types';

// AST -> IR (flat instruction list with symbolic labels) -> SCMB bytecode.

export type IrOperand =
  | { tag: 'INT'; v: number }
  | { tag: 'FLOAT'; v: number }
  | { tag: 'BOOL'; v: boolean }
  | { tag: 'STR'; v: string }
  | { tag: 'LVAR'; idx: number }
  | { tag: 'GVAR'; idx: number }
  | { tag: 'LABEL'; name: string };

export interface IrIns {
  opcode: number;
  args: IrOperand[];
  result: IrOperand | null;
  line: number;
  col: number;
}
export type IrItem = { k: 'label'; name: string; line: number; col: number } | { k: 'ins'; ins: IrIns };

export interface CompileResult {
  name: string;
  bytes: Uint8Array;
  ir: IrItem[];
}

export interface CompileOptions {
  file?: string;
  /** Include the pc->line debug section (default true). */
  debug?: boolean;
}

const BIN_OPS: Record<string, number> = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '%': OP.MOD };
const CMP_OPS: Record<string, number> = { '==': OP.CMP_EQ, '!=': OP.CMP_NE, '<': OP.CMP_LT, '<=': OP.CMP_LE, '>': OP.CMP_GT, '>=': OP.CMP_GE };
const COND_TEMP = '$cond';

class Compiler {
  errors: ScriptError[] = [];
  ir: IrItem[] = [];
  locals = new Map<string, number>();
  globals = new Map<string, number>();
  labels = new Map<string, { line: number; col: number }>();
  labelUses: { name: string; line: number; col: number }[] = [];
  name = '';
  private gen = 0;
  private sawEnd = false;

  constructor(private file: string) {}

  err(msg: string, p: { line: number; col: number }): void {
    this.errors.push(new ScriptError(msg, p.line, p.col, this.file));
  }

  private emit(opcode: number, args: IrOperand[], result: IrOperand | null, p: { line: number; col: number }): void {
    if (args.length > LIMITS.maxArgs) this.err(`too many arguments (max ${LIMITS.maxArgs})`, p);
    this.ir.push({ k: 'ins', ins: { opcode, args, result, line: p.line, col: p.col } });
  }
  private label(name: string, p: { line: number; col: number }): void {
    if (this.labels.has(name)) this.err(`duplicate label '${name}'`, p);
    this.labels.set(name, p);
    this.ir.push({ k: 'label', name, line: p.line, col: p.col });
  }
  private fresh(): string { return `$L${this.gen++}`; }
  private labelRef(name: string, p: { line: number; col: number }): IrOperand {
    this.labelUses.push({ name, line: p.line, col: p.col });
    return { tag: 'LABEL', name };
  }

  private declare(scope: 'local' | 'global', name: string, p: { line: number; col: number }): IrOperand | null {
    const mine = scope === 'local' ? this.locals : this.globals;
    const other = scope === 'local' ? this.globals : this.locals;
    if (mine.has(name)) { this.err(`variable '${name}' already declared`, p); return this.varRef(name, p); }
    if (other.has(name)) { this.err(`'${name}' is already declared as ${scope === 'local' ? 'GLOBAL' : 'LOCAL'}`, p); return null; }
    const limit = scope === 'local' ? LIMITS.maxLocals : LIMITS.maxGlobals;
    if (mine.size >= limit) { this.err(`too many ${scope} variables (max ${limit})`, p); return null; }
    mine.set(name, mine.size);
    return this.varRef(name, p);
  }

  private varRef(name: string, p: { line: number; col: number }, autoDeclare = false): IrOperand | null {
    const l = this.locals.get(name);
    if (l !== undefined) return { tag: 'LVAR', idx: l };
    const g = this.globals.get(name);
    if (g !== undefined) return { tag: 'GVAR', idx: g };
    if (autoDeclare) return this.declare('local', name, p);
    this.err(`undeclared variable '${name}'`, p);
    return null;
  }

  private temp(p: { line: number; col: number }): IrOperand {
    if (!this.locals.has(COND_TEMP)) this.locals.set(COND_TEMP, this.locals.size);
    return this.varRef(COND_TEMP, p) as IrOperand;
  }

  /** Compile an atom to an operand, checking literal types against an expected parameter type. */
  private operand(a: Atom, want: ParamType | 'value'): IrOperand | null {
    const bad = (got: string) => { this.err(`expected ${want} argument, got ${got}`, a); return null; };
    switch (a.k) {
      case 'var': return this.varRef(a.name, a);
      case 'int':
        if (!Number.isInteger(a.v) || a.v < INT_MIN || a.v > INT_MAX) { this.err(`integer ${a.v} out of 32-bit range`, a); return null; }
        if (want === 'float') return { tag: 'FLOAT', v: a.v };
        if (want === 'int' || want === 'any' || want === 'value') return { tag: 'INT', v: a.v };
        return bad('int');
      case 'float':
        if (want === 'float' || want === 'any' || want === 'value') return { tag: 'FLOAT', v: a.v };
        return bad('float');
      case 'bool':
        if (want === 'bool' || want === 'any' || want === 'value') return { tag: 'BOOL', v: a.v };
        return bad('bool');
      case 'str':
        if (textEncoder.encode(a.v).length > LIMITS.maxStringBytes) { this.err(`string longer than ${LIMITS.maxStringBytes} bytes`, a); return null; }
        if (want === 'str' || want === 'any' || want === 'value') return { tag: 'STR', v: a.v };
        return bad('string');
    }
  }

  private command(spec: CommandSpec, args: Atom[], p: { line: number; col: number }): IrOperand[] | null {
    if (args.length !== spec.params.length) {
      this.err(`${spec.name} expects ${spec.params.length} argument(s) (${spec.params.join(', ') || 'none'}), got ${args.length}`, p);
      return null;
    }
    const ops: IrOperand[] = [];
    let ok = true;
    args.forEach((a, i) => {
      const o = this.operand(a, spec.params[i]);
      if (o) ops.push(o); else ok = false;
    });
    return ok ? ops : null;
  }

  /** Evaluate a condition and jump to `falseLabel` when it is false. */
  private condJump(c: Cond, falseLabel: string): void {
    const jump = (v: IrOperand) => this.emit(OP.JUMP_IF_FALSE, [v, this.labelRef(falseLabel, c)], null, c);
    if (c.k === 'cmd') {
      const spec = commandSpec(c.name);
      if (!spec) {
        // An UPPER_SNAKE variable used as a condition.
        if (c.args.length === 0 && (this.locals.has(c.name) || this.globals.has(c.name))) {
          return this.condJump({ k: 'atom', neg: c.neg, a: { k: 'var', name: c.name, line: c.line, col: c.col }, line: c.line, col: c.col }, falseLabel);
        }
        this.err(`unknown command '${c.name}'`, c);
        return;
      }
      if (spec.returns !== 'bool') { this.err(`${spec.name} does not return a boolean and cannot be used as a condition`, c); return; }
      const ops = this.command(spec, c.args, c);
      if (!ops) return;
      const t = this.temp(c);
      this.emit(spec.opcode, ops, t, c);
      if (c.neg) this.emit(OP.NOT, [t], t, c);
      jump(t);
      return;
    }
    if (c.k === 'cmp') {
      const l = this.operand(c.l, 'value'), r = this.operand(c.r, 'value');
      if (!l || !r) return;
      const t = this.temp(c);
      this.emit(CMP_OPS[c.op], [l, r], t, c);
      if (c.neg) this.emit(OP.NOT, [t], t, c);
      jump(t);
      return;
    }
    const v = this.operand(c.a, 'value');
    if (!v) return;
    if (v.tag === 'INT' || v.tag === 'FLOAT' || v.tag === 'STR') { this.err('condition must be a boolean', c); return; }
    if (c.neg) {
      const t = this.temp(c);
      this.emit(OP.NOT, [v], t, c);
      jump(t);
    } else {
      jump(v);
    }
  }

  private exprInto(e: Expr, target: IrOperand, p: { line: number; col: number }): void {
    if (e.k === 'atom') {
      const v = this.operand(e.a, 'value');
      if (v) this.emit(OP.SET, [v], target, p);
      return;
    }
    const l = this.operand(e.l, 'value'), r = this.operand(e.r, 'value');
    if (l && r) this.emit(BIN_OPS[e.op], [l, r], target, p);
  }

  stmts(list: Stmt[]): void {
    for (const s of list) this.stmt(s);
  }

  stmt(s: Stmt): void {
    if (s.k !== 'start' && !this.name) {
      this.err('script must begin with SCRIPT_START', s);
      this.name = '<unnamed>';
    }
    switch (s.k) {
      case 'start':
        if (this.name) this.err('duplicate SCRIPT_START', s);
        this.name = s.name;
        return;
      case 'end':
        this.sawEnd = true;
        this.emit(OP.END_SCRIPT, [], null, s);
        return;
      case 'label': this.label(s.name, s); return;
      case 'jump': {
        const op = s.op === 'GOTO' ? OP.GOTO : s.op === 'GOSUB' ? OP.GOSUB : OP.START_THREAD;
        this.emit(op, [this.labelRef(s.label, s)], null, s);
        return;
      }
      case 'return': this.emit(OP.RETURN, [], null, s); return;
      case 'endThread': this.emit(OP.END_THREAD, [], null, s); return;
      case 'wait': {
        const v = this.operand(s.arg, 'int');
        if (v) this.emit(OP.WAIT, [v], null, s);
        return;
      }
      case 'decl': {
        const ref = this.declare(s.scope, s.name, s);
        if (ref && s.init) this.exprInto(s.init, ref, s);
        return;
      }
      case 'set': {
        const ref = this.varRef(s.target, s);
        if (ref) this.exprInto(s.expr, ref, s);
        return;
      }
      case 'if': {
        const elseL = this.fresh(), endL = this.fresh();
        this.condJump(s.cond, s.else ? elseL : endL);
        this.stmts(s.then);
        if (s.else) {
          this.emit(OP.GOTO, [this.labelRef(endL, s)], null, s);
          this.label(elseL, s);
          this.stmts(s.else);
        }
        this.label(endL, s);
        return;
      }
      case 'while': {
        const top = this.fresh(), endL = this.fresh();
        this.label(top, s);
        this.condJump(s.cond, endL);
        this.stmts(s.body);
        this.emit(OP.GOTO, [this.labelRef(top, s)], null, s);
        this.label(endL, s);
        return;
      }
      case 'cmd': {
        const spec = commandSpec(s.name);
        if (!spec) { this.err(`unknown command '${s.name}'`, s); return; }
        if (s.prefix !== null && s.prefix !== spec.opcode) {
          this.err(`opcode prefix ${s.prefix.toString(16).padStart(4, '0')} does not match ${spec.name} (${spec.opcode.toString(16).padStart(4, '0')})`, s);
        }
        const ops = this.command(spec, s.args, s);
        let result: IrOperand | null = null;
        if (s.result) {
          if (!spec.returns) this.err(`${spec.name} does not return a value`, s);
          else result = this.varRef(s.result, s, true);
        }
        if (ops) this.emit(spec.opcode, ops, result, s);
        return;
      }
    }
  }

  finishChecks(lastLine: number): void {
    if (!this.name) this.err('missing SCRIPT_START', { line: 1, col: 1 });
    if (!this.sawEnd) this.err('missing SCRIPT_END', { line: lastLine, col: 1 });
    for (const u of this.labelUses) if (!this.labels.has(u.name)) this.err(`undefined label '${u.name}'`, u);
  }
}

function insSize(ins: IrIns): number {
  let n = 4; // u16 opcode, u8 argc, u8 flags
  for (const a of ins.args) n += 1 + operandSize(TAG[a.tag]);
  if (ins.result) n += 1 + operandSize(TAG[ins.result.tag]);
  return n;
}

/** Assemble IR into an SCMB image. */
export function assemble(name: string, ir: IrItem[], localNames: string[], globalNames: string[], debug: boolean): Uint8Array {
  // Every program ends with END_SCRIPT so no label can point past the last instruction.
  const last = [...ir].reverse().find((x) => x.k === 'ins');
  const tail = ir[ir.length - 1];
  if (!last || last.k !== 'ins' || last.ins.opcode !== OP.END_SCRIPT || tail.k === 'label') {
    ir = [...ir, { k: 'ins', ins: { opcode: OP.END_SCRIPT, args: [], result: null, line: tail && 'line' in tail ? tail.line : 0, col: 0 } }];
  }
  // pass 1: offsets
  const labelAt = new Map<string, number>();
  let pc = 0;
  for (const it of ir) {
    if (it.k === 'label') labelAt.set(it.name, pc);
    else pc += insSize(it.ins);
  }
  const codeLength = pc;
  if (codeLength > LIMITS.maxCodeBytes) throw new CompileErrors([new ScriptError('program too large', 0, 0)]);

  const strings: string[] = [name];
  const strIndex = new Map<string, number>([[name, 0]]);
  const str = (s: string) => {
    let i = strIndex.get(s);
    if (i === undefined) { i = strings.length; strings.push(s); strIndex.set(s, i); }
    return i;
  };

  const code = new ByteWriter();
  const lines: [number, number][] = [];
  const writeOperand = (o: IrOperand) => {
    code.u8(TAG[o.tag]);
    switch (o.tag) {
      case 'INT': code.i32(o.v); break;
      case 'FLOAT': code.f32(o.v); break;
      case 'BOOL': code.u8(o.v ? 1 : 0); break;
      case 'STR': code.u16(str(o.v)); break;
      case 'LVAR': case 'GVAR': code.u16(o.idx); break;
      case 'LABEL': code.u32(labelAt.get(o.name) ?? 0); break;
    }
  };
  for (const it of ir) {
    if (it.k !== 'ins') continue;
    const ins = it.ins;
    lines.push([code.length, ins.line]);
    code.u16(ins.opcode);
    code.u8(ins.args.length);
    code.u8(ins.result ? 1 : 0);
    for (const a of ins.args) writeOperand(a);
    if (ins.result) writeOperand(ins.result);
  }
  const codeBytes = code.finish();
  // Debug names live in the string table, so intern them before it is written.
  if (debug) for (const n of [...localNames, ...globalNames]) str(n);

  const out = new ByteWriter();
  for (const ch of MAGIC) out.u8(ch.charCodeAt(0));
  out.u16(FORMAT_VERSION);
  out.u16(debug ? FLAG_DEBUG : 0);
  out.u32(codeLength);
  out.u32(0); // string table offset (patched)
  out.u32(strings.length);
  out.u16(localNames.length);
  out.u16(globalNames.length);
  out.u32(crc32(codeBytes));
  out.u32(0); // debug offset (patched)
  if (out.length !== HEADER_SIZE) throw new Error('header size mismatch');
  out.bytes(codeBytes);
  out.patchU32(12, out.length);
  for (const s of strings) {
    const b = textEncoder.encode(s);
    out.u8(b.length);
    out.bytes(b);
  }
  if (debug) {
    out.patchU32(28, out.length);
    out.u32(lines.length);
    for (const [p, l] of lines) { out.u32(p); out.u32(l); }
    out.u16(localNames.length);
    for (const n of localNames) out.u16(str(n));
    out.u16(globalNames.length);
    for (const n of globalNames) out.u16(str(n));
  }
  return out.finish();
}

/** Compile source text to an SCMB image. Throws CompileErrors with every error found. */
export function compile(src: string, opts: CompileOptions = {}): CompileResult {
  const file = opts.file ?? '<script>';
  const { ast, errors } = parse(src, file);
  const c = new Compiler(file);
  c.errors.push(...errors);
  c.stmts(ast);
  c.finishChecks(src.split('\n').length);
  if (c.errors.length) {
    c.errors.sort((a, b) => a.line - b.line || a.col - b.col);
    throw new CompileErrors(c.errors);
  }
  const byIdx = (m: Map<string, number>) => [...m.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
  const bytes = assemble(c.name, c.ir, byIdx(c.locals), byIdx(c.globals), opts.debug ?? true);
  return { name: c.name, bytes, ir: c.ir };
}
