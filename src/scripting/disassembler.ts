import { HEADER_SIZE, TAG } from './bytecode';
import { opcodeName } from './opcodes';
import { Operand, Program, verify } from './verifier';

// Human-readable listing of verified bytecode.

export function formatOperand(p: Program, o: Operand): string {
  switch (o.tag) {
    case TAG.INT: return String(o.v);
    case TAG.FLOAT: { const n = o.v as number; return Number.isInteger(n) ? `${n}.0` : String(Math.round(n * 1e6) / 1e6); }
    case TAG.BOOL: return o.v ? 'TRUE' : 'FALSE';
    case TAG.STR: return JSON.stringify(p.strings[o.v as number]);
    case TAG.LVAR: return `L${o.v}${p.localNames[o.v as number] ? `(${p.localNames[o.v as number]})` : ''}`;
    case TAG.GVAR: return `G${o.v}${p.globalNames[o.v as number] ? `(${p.globalNames[o.v as number]})` : ''}`;
    case TAG.LABEL: return `@${p.instructions[o.v as number].pc.toString(16).padStart(4, '0')}`;
    default: return '?';
  }
}

export function disassemble(input: Uint8Array | Program): string {
  const p = input instanceof Uint8Array ? verify(input) : input;
  const out: string[] = [];
  out.push(`; script "${p.name}"  format v${p.version}  code ${p.codeLength} bytes  crc ${p.crc.toString(16).padStart(8, '0')}`);
  out.push(`; ${p.localCount} local(s) [${p.localNames.join(', ')}]  ${p.globalCount} global(s) [${p.globalNames.join(', ')}]  ${p.strings.length} string(s)`);
  const targets = new Set<number>();
  for (const ins of p.instructions) for (const a of ins.args) if (a.tag === TAG.LABEL) targets.add(a.v as number);
  p.instructions.forEach((ins, i) => {
    if (targets.has(i)) out.push(`@${ins.pc.toString(16).padStart(4, '0')}:`);
    const args = ins.args.map((a) => formatOperand(p, a)).join(' ');
    const res = ins.result ? ` -> ${formatOperand(p, ins.result)}` : '';
    const line = p.lines[i] ? `  ; line ${p.lines[i]}` : '';
    out.push(`  ${ins.pc.toString(16).padStart(4, '0')}  ${ins.opcode.toString(16).padStart(4, '0')}: ${opcodeName(ins.opcode)}${args ? ' ' + args : ''}${res}${line}`);
  });
  return out.join('\n');
}

/** Classic 16-bytes-per-row hex dump with absolute file offsets. */
export function hexDump(bytes: Uint8Array, start = 0, end = bytes.length): string {
  const rows: string[] = [];
  for (let off = start; off < end; off += 16) {
    const chunk = bytes.subarray(off, Math.min(off + 16, end));
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    rows.push(`${off.toString(16).padStart(6, '0')}  ${hex.padEnd(47)}  |${ascii}|`);
  }
  return rows.join('\n');
}

/** Per-instruction hex bytes (code offsets are relative to the code section). */
export function instructionBytes(bytes: Uint8Array, p: Program): string[] {
  return p.instructions.map((ins) => {
    const b = bytes.subarray(HEADER_SIZE + ins.pc, HEADER_SIZE + ins.pc + ins.size);
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');
  });
}
