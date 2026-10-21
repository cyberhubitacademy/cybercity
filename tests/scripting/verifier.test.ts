import { describe, expect, it } from 'vitest';
import { HEADER_SIZE, VerifyError, compile, crc32, verify } from '../../src/scripting';
import { wrap } from './helpers';

const base = () => compile(wrap('LOCAL a = 1\nloop:\nWAIT 10\nIF a == 1\n  GOTO loop\nEND_IF\nPRINT_HELP "hi"'), { debug: false }).bytes;

/** Patch code bytes and recompute the CRC so a specific check is exercised. */
function patchCode(bytes: Uint8Array, offsetInCode: number, values: number[]): Uint8Array {
  const b = bytes.slice();
  values.forEach((v, i) => { b[HEADER_SIZE + offsetInCode + i] = v; });
  const codeLen = new DataView(b.buffer).getUint32(8, true);
  new DataView(b.buffer).setUint32(24, crc32(b.subarray(HEADER_SIZE, HEADER_SIZE + codeLen)), true);
  return b;
}

const expectVerify = (b: Uint8Array, msg: RegExp) => {
  expect(() => verify(b)).toThrow(VerifyError);
  expect(() => verify(b)).toThrow(msg);
};

describe('verifier', () => {
  it('accepts compiled output', () => {
    expect(verify(base()).instructions.length).toBeGreaterThan(3);
  });

  it('rejects bad magic, small files and version mismatches', () => {
    const b = base();
    const m = b.slice(); m[0] = 0x58;
    expectVerify(m, /bad magic/);
    expectVerify(b.subarray(0, 10), /too small/);
    const v = b.slice(); v[4] = 2;
    expectVerify(v, /unsupported format version 2/);
  });

  it('detects CRC mismatch (corrupt code)', () => {
    const b = base().slice();
    b[HEADER_SIZE + 6] ^= 0xff;
    expectVerify(b, /checksum mismatch/);
  });

  it('rejects truncated bytecode at every cut point without crashing', () => {
    const b = base();
    for (let n = 0; n < b.length - 1; n++) {
      expect(() => verify(b.subarray(0, n))).toThrow(VerifyError);
    }
  });

  it('rejects unknown opcodes and bad operand tags', () => {
    expectVerify(patchCode(base(), 0, [0xee, 0xee]), /unknown opcode 0xeeee/);
    // first instruction is SET <INT 1> -> L0; change the INT tag to 0x09
    expectVerify(patchCode(base(), 4, [0x09]), /invalid operand tag/);
    // LABEL tag where a value is expected
    expectVerify(patchCode(base(), 4, [0x07]), /not allowed here/);
  });

  it('rejects jump targets that are not instruction boundaries', () => {
    const b = base();
    const p = verify(b);
    const jif = p.instructions.find((i) => i.args.some((a) => a.tag === 7))!;
    // label operand payload is the last 4 bytes of the instruction
    const at = jif.pc + jif.size - 4;
    expectVerify(patchCode(b, at, [0x01, 0x00, 0x00, 0x00]), /not an instruction boundary/);
    expectVerify(patchCode(b, at, [0xff, 0xff, 0x00, 0x00]), /not an instruction boundary/);
  });

  it('rejects out-of-range variable and string indices', () => {
    const b = base();
    const p = verify(b);
    const print = p.instructions[p.instructions.length - 2];
    expectVerify(patchCode(b, print.pc + 5, [0x63, 0x00]), /string index 99 out of range/);
    // SET result operand LVAR index 0 -> 7
    const set = p.instructions[0];
    expectVerify(patchCode(b, set.pc + set.size - 2, [0x07, 0x00]), /local index 7 out of range/);
  });

  it('rejects wrong argument counts for an opcode', () => {
    const b = base();
    expectVerify(patchCode(b, 2, [0x03]), /expects 1 operand/);
  });
});
