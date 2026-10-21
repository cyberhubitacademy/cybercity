import { ByteReader, FLAG_DEBUG, FORMAT_VERSION, HEADER_SIZE, LIMITS, MAGIC, TAG, crc32, operandSize, textDecoder } from './bytecode';
import { CommandSpec, ControlOp, OP, commandByOp, controlOp } from './opcodes';
import { ParamType, VerifyError } from './types';

// Decodes and validates an SCMB image. Nothing in the VM touches raw bytes:
// it only runs the decoded, verified instruction list produced here.

export interface Operand {
  tag: number;
  /** INT/FLOAT: number; BOOL: boolean; STR/LVAR/GVAR: index; LABEL: target instruction index. */
  v: number | boolean;
}

export interface Instruction {
  pc: number;
  size: number;
  opcode: number;
  args: Operand[];
  result: Operand | null;
  control?: ControlOp;
  command?: CommandSpec;
}

export interface Program {
  name: string;
  version: number;
  flags: number;
  codeLength: number;
  crc: number;
  strings: string[];
  localCount: number;
  globalCount: number;
  instructions: Instruction[];
  /** Source line per instruction index (0 when no debug section). */
  lines: number[];
  localNames: string[];
  globalNames: string[];
}

const VALUE_TAGS = [TAG.INT, TAG.FLOAT, TAG.BOOL, TAG.STR, TAG.LVAR, TAG.GVAR] as number[];
const VAR_TAGS = [TAG.LVAR, TAG.GVAR] as number[];

function allowedFor(p: ParamType): number[] {
  switch (p) {
    case 'int': return [TAG.INT, ...VAR_TAGS];
    case 'float': return [TAG.FLOAT, TAG.INT, ...VAR_TAGS];
    case 'bool': return [TAG.BOOL, ...VAR_TAGS];
    case 'str': return [TAG.STR, ...VAR_TAGS];
    case 'any': return VALUE_TAGS;
  }
}

function controlAllowed(c: ControlOp, i: number): number[] {
  const kind = c.operands[i];
  if (kind === 'label') return [TAG.LABEL];
  if (c.opcode === OP.WAIT) return [TAG.INT, ...VAR_TAGS];
  if (c.opcode === OP.JUMP_IF_FALSE) return [TAG.BOOL, TAG.INT, ...VAR_TAGS];
  return VALUE_TAGS;
}

/** Verify an SCMB image. Throws VerifyError on any problem; never reads out of bounds. */
export function verify(bytes: Uint8Array): Program {
  if (!(bytes instanceof Uint8Array)) throw new VerifyError('not a byte array');
  if (bytes.length < HEADER_SIZE) throw new VerifyError(`file too small (${bytes.length} < ${HEADER_SIZE})`, 0);
  const r = new ByteReader(bytes);
  const magic = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8());
  if (magic !== MAGIC) throw new VerifyError(`bad magic '${magic}'`, 0);
  const version = r.u16();
  if (version !== FORMAT_VERSION) throw new VerifyError(`unsupported format version ${version} (this VM reads ${FORMAT_VERSION})`, 4);
  const flags = r.u16();
  if (flags & ~FLAG_DEBUG) throw new VerifyError(`unknown flags 0x${flags.toString(16)}`, 6);
  const codeLength = r.u32();
  const strOffset = r.u32();
  const strCount = r.u32();
  const localCount = r.u16();
  const globalCount = r.u16();
  const crc = r.u32();
  const debugOffset = r.u32();

  if (codeLength === 0) throw new VerifyError('empty code section', 8);
  if (codeLength > LIMITS.maxCodeBytes) throw new VerifyError('code section too large', 8);
  const codeEnd = HEADER_SIZE + codeLength;
  if (codeEnd > bytes.length) throw new VerifyError('code section truncated', 8);
  if (strOffset !== codeEnd) throw new VerifyError(`string table must follow code (offset ${strOffset}, expected ${codeEnd})`, 12);
  if (strCount < 1 || strCount > LIMITS.maxStrings) throw new VerifyError(`bad string count ${strCount}`, 16);
  if (localCount > LIMITS.maxLocals) throw new VerifyError(`too many locals (${localCount})`, 20);
  if (globalCount > LIMITS.maxGlobals) throw new VerifyError(`too many globals (${globalCount})`, 22);
  const code = bytes.subarray(HEADER_SIZE, codeEnd);
  if (crc32(code) !== crc) throw new VerifyError('code checksum mismatch (corrupt bytecode)', 24);

  // string table
  const sr = new ByteReader(bytes, strOffset);
  const strings: string[] = [];
  for (let i = 0; i < strCount; i++) {
    const len = sr.u8();
    const raw = sr.slice(len);
    try { strings.push(textDecoder.decode(raw)); } catch { throw new VerifyError(`string ${i} is not valid UTF-8`, sr.pos - len); }
  }

  // instructions
  const cr = new ByteReader(bytes, HEADER_SIZE, codeEnd);
  const instructions: Instruction[] = [];
  const indexByPc = new Map<number, number>();
  while (cr.remaining > 0) {
    const start = cr.pos - HEADER_SIZE;
    const opcode = cr.u16();
    const argc = cr.u8();
    const iflags = cr.u8();
    const control = controlOp(opcode);
    const command = control ? undefined : commandByOp(opcode);
    if (!control && !command) throw new VerifyError(`unknown opcode 0x${opcode.toString(16).padStart(4, '0')}`, start);
    if (argc > LIMITS.maxArgs) throw new VerifyError(`too many arguments (${argc})`, start);
    if (iflags & ~1) throw new VerifyError(`unknown instruction flags 0x${iflags.toString(16)}`, start);
    const expected = control ? control.operands.length : command!.params.length;
    if (argc !== expected) throw new VerifyError(`${control?.name ?? command!.name} expects ${expected} operand(s), found ${argc}`, start);
    const hasResult = (iflags & 1) === 1;
    if (control && hasResult !== control.result) throw new VerifyError(`${control.name} result operand ${control.result ? 'missing' : 'not allowed'}`, start);
    if (command && hasResult && !command.returns) throw new VerifyError(`${command.name} has no return value`, start);

    const readOperand = (allowed: number[]): Operand => {
      const at = cr.pos - HEADER_SIZE;
      const tag = cr.u8();
      if (operandSize(tag) < 0) throw new VerifyError(`invalid operand tag 0x${tag.toString(16)}`, at);
      if (!allowed.includes(tag)) throw new VerifyError(`operand tag ${tag} not allowed here`, at);
      switch (tag) {
        case TAG.INT: return { tag, v: cr.i32() };
        case TAG.FLOAT: {
          const v = cr.f32();
          if (!Number.isFinite(v)) throw new VerifyError('non-finite float literal', at);
          return { tag, v };
        }
        case TAG.BOOL: {
          const b = cr.u8();
          if (b > 1) throw new VerifyError(`bad bool ${b}`, at);
          return { tag, v: b === 1 };
        }
        case TAG.STR: {
          const i = cr.u16();
          if (i >= strings.length) throw new VerifyError(`string index ${i} out of range`, at);
          return { tag, v: i };
        }
        case TAG.LVAR: {
          const i = cr.u16();
          if (i >= localCount) throw new VerifyError(`local index ${i} out of range`, at);
          return { tag, v: i };
        }
        case TAG.GVAR: {
          const i = cr.u16();
          if (i >= globalCount) throw new VerifyError(`global index ${i} out of range`, at);
          return { tag, v: i };
        }
        default: return { tag, v: cr.u32() }; // LABEL: byte offset, resolved below
      }
    };

    const args: Operand[] = [];
    for (let i = 0; i < argc; i++) {
      args.push(readOperand(control ? controlAllowed(control, i) : allowedFor(command!.params[i])));
    }
    const result = hasResult ? readOperand(VAR_TAGS) : null;
    indexByPc.set(start, instructions.length);
    instructions.push({ pc: start, size: cr.pos - HEADER_SIZE - start, opcode, args, result, control, command });
  }

  // jump targets must land on an instruction boundary
  for (const ins of instructions) {
    for (const a of ins.args) {
      if (a.tag !== TAG.LABEL) continue;
      const idx = indexByPc.get(a.v as number);
      if (idx === undefined) throw new VerifyError(`jump target ${a.v} is not an instruction boundary`, ins.pc);
      a.v = idx;
    }
  }

  // optional debug section
  const lines = new Array<number>(instructions.length).fill(0);
  let localNames: string[] = [];
  let globalNames: string[] = [];
  if (flags & FLAG_DEBUG) {
    if (debugOffset < strOffset || debugOffset >= bytes.length) throw new VerifyError('bad debug section offset', 28);
    const dr = new ByteReader(bytes, debugOffset);
    const n = dr.u32();
    if (n > instructions.length) throw new VerifyError('debug line table too long', debugOffset);
    for (let i = 0; i < n; i++) {
      const pc = dr.u32();
      const line = dr.u32();
      const idx = indexByPc.get(pc);
      if (idx === undefined) throw new VerifyError('debug entry not on an instruction', dr.pos - 8);
      lines[idx] = line;
    }
    const names = (count: number) => {
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        const s = dr.u16();
        if (s >= strings.length) throw new VerifyError('debug name index out of range', dr.pos - 2);
        out.push(strings[s]);
      }
      return out;
    };
    const ln = dr.u16();
    if (ln !== localCount) throw new VerifyError('debug local-name count mismatch', dr.pos - 2);
    localNames = names(ln);
    const gn = dr.u16();
    if (gn !== globalCount) throw new VerifyError('debug global-name count mismatch', dr.pos - 2);
    globalNames = names(gn);
  } else if (debugOffset !== 0) {
    throw new VerifyError('debug offset set without debug flag', 28);
  }

  return { name: strings[0], version, flags, codeLength, crc, strings, localCount, globalCount, instructions, lines, localNames, globalNames };
}
