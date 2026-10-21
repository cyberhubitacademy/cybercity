import { VerifyError } from './types';

// SCMB binary format constants and bounded byte reader/writer.
// All multi-byte values are little-endian. See docs/bytecode_format.md.

export const MAGIC = 'SCMB';
export const FORMAT_VERSION = 1;
export const HEADER_SIZE = 32;
export const FLAG_DEBUG = 0x0001;

export const LIMITS = {
  maxArgs: 8,
  maxStringBytes: 255,
  maxStrings: 65535,
  maxLocals: 256,
  maxGlobals: 512,
  maxCodeBytes: 1 << 20,
} as const;

/** Operand type tags (u8). */
export const TAG = {
  INT: 0x01, // i32
  FLOAT: 0x02, // f32
  BOOL: 0x03, // u8 (0|1)
  STR: 0x04, // u16 string-table index
  LVAR: 0x05, // u16 local slot
  GVAR: 0x06, // u16 global slot
  LABEL: 0x07, // u32 absolute code offset
} as const;
export type Tag = (typeof TAG)[keyof typeof TAG];

export const TAG_NAMES: Record<number, string> = { 1: 'INT', 2: 'FLOAT', 3: 'BOOL', 4: 'STR', 5: 'LVAR', 6: 'GVAR', 7: 'LABEL' };

export function operandSize(tag: number): number {
  switch (tag) {
    case TAG.INT: case TAG.FLOAT: case TAG.LABEL: return 4;
    case TAG.BOOL: return 1;
    case TAG.STR: case TAG.LVAR: case TAG.GVAR: return 2;
    default: return -1;
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Standard CRC-32 (IEEE 802.3, reflected, init/xorout 0xFFFFFFFF). */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Growable little-endian writer. */
export class ByteWriter {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private ensure(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const nb = new Uint8Array(size);
    nb.set(this.buf);
    this.buf = nb;
    this.view = new DataView(nb.buffer);
  }
  u8(v: number): void { this.ensure(1); this.view.setUint8(this.length, v); this.length += 1; }
  u16(v: number): void { this.ensure(2); this.view.setUint16(this.length, v, true); this.length += 2; }
  u32(v: number): void { this.ensure(4); this.view.setUint32(this.length, v >>> 0, true); this.length += 4; }
  i32(v: number): void { this.ensure(4); this.view.setInt32(this.length, v, true); this.length += 4; }
  f32(v: number): void { this.ensure(4); this.view.setFloat32(this.length, v, true); this.length += 4; }
  bytes(b: Uint8Array): void { this.ensure(b.length); this.buf.set(b, this.length); this.length += b.length; }
  patchU32(at: number, v: number): void { this.view.setUint32(at, v >>> 0, true); }
  finish(): Uint8Array { return this.buf.slice(0, this.length); }
}

/** Bounds-checked reader: every read validates the remaining length first. */
export class ByteReader {
  private view: DataView;
  pos: number;
  constructor(readonly bytes: Uint8Array, start = 0, readonly end = bytes.length) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = start;
  }
  private need(n: number): void {
    if (this.pos < 0 || this.pos + n > this.end) throw new VerifyError(`truncated: need ${n} byte(s)`, this.pos);
  }
  u8(): number { this.need(1); return this.view.getUint8(this.pos++); }
  u16(): number { this.need(2); const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  u32(): number { this.need(4); const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  i32(): number { this.need(4); const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  f32(): number { this.need(4); const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  slice(n: number): Uint8Array { this.need(n); const s = this.bytes.subarray(this.pos, this.pos + n); this.pos += n; return s; }
  get remaining(): number { return this.end - this.pos; }
}

export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder('utf-8', { fatal: true });
