// Pure, DOM-free logic for "The Flamingo's Cipher".
// Base64 and Caesar are used here as teaching tools only: Base64 is an encoding
// (no key, anyone can reverse it) and Caesar is a toy cipher broken in seconds.

import { clampScore, type ScoreLine } from '../../types';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function base64Encode(text: string): string {
  const bytes = utf8Bytes(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

/** Returns null when the input is not valid Base64 (or not valid UTF-8 text). */
export function base64Decode(input: string): string | null {
  const s = input.replace(/\s+/g, '');
  if (s.length === 0 || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (s[i + k] === '=' ? 0 : B64.indexOf(s[i + k])));
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    bytes.push((n >> 16) & 255);
    if (s[i + 2] !== '=') bytes.push((n >> 8) & 255);
    if (s[i + 3] !== '=') bytes.push(n & 255);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

export function hexDecode(input: string): string | null {
  const s = input.replace(/\s+/g, '');
  if (s.length === 0 || s.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(s)) return null;
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Shift A-Z / a-z forward by `shift` (negative shifts go backwards). Other chars unchanged. */
export function caesar(text: string, shift: number): string {
  const k = ((shift % 26) + 26) % 26;
  return text.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + k) % 26) + base);
  });
}

export function reverseText(text: string): string {
  return Array.from(text).reverse().join('');
}

/** Letters sorted by frequency (most common first), case-insensitive. */
export function letterFrequency(text: string): { letter: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const ch of text.toUpperCase()) {
    if (ch >= 'A' && ch <= 'Z') counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([letter, count]) => ({ letter, count }))
    .sort((a, b) => b.count - a.count || a.letter.localeCompare(b.letter));
}

// ---------- SHA-256 (FIPS 180-4), real implementation ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(text: string): string {
  const msg = utf8Bytes(text);
  const bitLen = msg.length * 8;
  const total = Math.ceil((msg.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(total - 4, bitLen >>> 0);

  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < total; off += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}

/** Number of hex positions that differ between two equal-length digests. */
export function hexDiffCount(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++;
  return n + Math.abs(a.length - b.length);
}

// ---------- Scenario data ----------
export const PLAINTEXT =
  'MEET AT NEON PIER BOATHOUSE AT MIDNIGHT. BRING THE PAYROLL DRIVE. FLAG NB{FLAMINGO_FLIES_AT_MIDNIGHT}';
export const CAESAR_SHIFT = 7;
export const CIPHERTEXT = caesar(PLAINTEXT, CAESAR_SHIFT);
export const INTERCEPTED = base64Encode(CIPHERTEXT);
export const FLAG = 'NB{FLAMINGO_FLIES_AT_MIDNIGHT}';

export function validateFlag(input: string): boolean {
  return input.trim().toUpperCase().replace(/\s+/g, '') === FLAG;
}

export const HASH_MESSAGE = 'MEET AT NEON PIER BOATHOUSE AT MIDNIGHT';
/** Three candidate digests; exactly one is SHA-256(HASH_MESSAGE). */
export const HASH_CANDIDATES: string[] = [
  sha256(HASH_MESSAGE.replace('NEON', 'NE0N')),
  sha256(HASH_MESSAGE),
  sha256(HASH_MESSAGE + ' '),
];
export const CORRECT_HASH_INDEX = 1;

export type OuterLayer = 'base64' | 'aes' | 'sha256' | 'caesar';
export const OUTER_LAYER_OPTIONS: { id: OuterLayer; label: string; explain: string }[] = [
  { id: 'base64', label: 'Base64 encoding', explain: 'Only A–Z, a–z, 0–9, + and / with = padding, length a multiple of 4 — classic Base64. It is an encoding: no key, fully reversible by anyone.' },
  { id: 'aes', label: 'AES encryption', explain: 'AES ciphertext is raw random-looking bytes; it cannot be reversed without the key. Base64-decoding this gave readable letters, so it was not AES.' },
  { id: 'sha256', label: 'SHA-256 hash', explain: 'A SHA-256 digest is always exactly 64 hex characters and cannot be "decoded" at all. This blob was longer and decodable.' },
  { id: 'caesar', label: 'Caesar cipher', explain: 'Caesar only shifts letters; it would never produce digits, "+", "/" or "=" padding. Caesar was the inner layer.' },
];

export type ConceptId = 'encoding' | 'symmetric' | 'asymmetric' | 'hashing' | 'signature';
export const MATCH_CONCEPTS: { id: ConceptId; label: string }[] = [
  { id: 'encoding', label: 'Encoding' },
  { id: 'symmetric', label: 'Symmetric encryption' },
  { id: 'asymmetric', label: 'Asymmetric encryption' },
  { id: 'hashing', label: 'Hashing' },
  { id: 'signature', label: 'Digital signature' },
];
export const MATCH_DESCRIPTIONS: { id: ConceptId; text: string }[] = [
  { id: 'hashing', text: 'One-way, fixed-length fingerprint that cannot be reversed — e.g. SHA-256' },
  { id: 'signature', text: "Created with the sender's private key, verified with their public key — proves origin and integrity" },
  { id: 'encoding', text: 'Reversible format change with no key at all — e.g. Base64' },
  { id: 'asymmetric', text: 'Key pair: encrypt with the public key, only the private key decrypts — e.g. RSA / ECC' },
  { id: 'symmetric', text: 'One shared secret key both encrypts and decrypts — e.g. AES' },
];

export type SignatureKey = 'flamingo-public' | 'flamingo-private' | 'rico-private' | 'no-key';
export const SIGNATURE_OPTIONS: { id: SignatureKey; label: string }[] = [
  { id: 'flamingo-private', label: "The Flamingo's private key" },
  { id: 'flamingo-public', label: "The Flamingo's public key" },
  { id: 'rico-private', label: "Rico's own private key" },
  { id: 'no-key', label: 'No key needed — just Base64-decode the signature' },
];

export interface CryptoAnswers {
  outerLayer: OuterLayer | null;
  flag: string;
  hashIndex: number | null;
  matches: Partial<Record<ConceptId, ConceptId>>;
  signatureKey: SignatureKey | null;
  hintPenalty: number;
}

export interface CryptoEvaluation {
  score: number;
  breakdown: ScoreLine[];
  mistakes: string[];
  notes: { ok: boolean; text: string }[];
}

export function evaluateCrypto(a: CryptoAnswers): CryptoEvaluation {
  const notes: { ok: boolean; text: string }[] = [];
  const mistakes: string[] = [];

  const layerOk = a.outerLayer === 'base64';
  const layerOpt = OUTER_LAYER_OPTIONS.find((o) => o.id === a.outerLayer);
  notes.push({
    ok: layerOk,
    text: layerOk
      ? `Outer layer: Base64. ${OUTER_LAYER_OPTIONS[0].explain}`
      : `Outer layer: you chose "${layerOpt?.label ?? 'nothing'}". ${layerOpt?.explain ?? ''} The answer was Base64 encoding.`,
  });
  if (!layerOk) mistakes.push('Confused Base64 encoding with encryption or hashing.');

  const flagOk = validateFlag(a.flag);
  notes.push({
    ok: flagOk,
    text: flagOk
      ? `Flag ${FLAG} recovered. A shift of ${CAESAR_SHIFT} broke it — only 25 possible keys, so brute force takes seconds. Never use Caesar for real secrets.`
      : `Flag not recovered. After Base64-decoding, shift the letters back by ${CAESAR_SHIFT} (L→E) to read the plaintext.`,
  });
  if (!flagOk) mistakes.push('Did not break the Caesar layer (try frequency analysis: most common letter ≈ E or T).');

  const hashOk = a.hashIndex === CORRECT_HASH_INDEX;
  notes.push({
    ok: hashOk,
    text: hashOk
      ? 'Integrity check passed: only the untouched message produces that digest. Changing one character (NEON→NE0N) or adding a space changes the hash completely — the avalanche effect.'
      : 'Wrong digest. Hash the exact message in the calculator: the decoys came from "NE0N" (zero) and a trailing space. One tiny change = a totally different hash.',
  });
  if (!hashOk) mistakes.push('Picked a hash that did not match the exact message (avalanche effect).');

  let matchCorrect = 0;
  for (const c of MATCH_CONCEPTS) {
    if (a.matches[c.id] === c.id) matchCorrect++;
    else mistakes.push(`Mismatched "${c.label}".`);
  }
  notes.push({
    ok: matchCorrect === MATCH_CONCEPTS.length,
    text: `Concept matching: ${matchCorrect}/${MATCH_CONCEPTS.length}. Encoding has no key; symmetric uses one shared key (AES); asymmetric uses a key pair (RSA/ECC); hashing is one-way (SHA-256); signatures are made with a private key and checked with the public key.`,
  });

  const sigOk = a.signatureKey === 'flamingo-public';
  notes.push({
    ok: sigOk,
    text: sigOk
      ? "Correct: anyone verifies a signature with the signer's PUBLIC key. Only the signer's private key could have produced it."
      : "Signatures are verified with the signer's public key. The private key never leaves the signer — that's what makes the signature trustworthy.",
  });
  if (!sigOk) mistakes.push('Mixed up which key verifies a digital signature (signer\'s public key).');

  const breakdown: ScoreLine[] = [
    { label: 'Identified the encoding layer', value: layerOk ? 15 : 0, max: 15 },
    { label: 'Broke the cipher & submitted flag', value: flagOk ? 30 : 0, max: 30 },
    { label: 'Integrity (hash) check', value: hashOk ? 15 : 0, max: 15 },
    { label: 'Concept matching', value: matchCorrect * 5, max: 25 },
    { label: 'Signature verification', value: sigOk ? 15 : 0, max: 15 },
  ];
  if (a.hintPenalty > 0) breakdown.push({ label: 'Paid hints', value: -a.hintPenalty, max: 0 });
  const raw = breakdown.reduce((s, b) => s + b.value, 0);
  return { score: clampScore(raw), breakdown, mistakes, notes };
}
