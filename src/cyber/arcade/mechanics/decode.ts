import type { DecodeMethod } from '../types';

// Educational encodings and classical ciphers used by the Decode mechanic.
// None of these protect real data — that's part of the lesson.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of ASCII text (pure, no btoa so it runs in node tests too). */
export function toBase64(text: string): string {
  const bytes = [...text].map((c) => c.charCodeAt(0) & 0xff);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function fromBase64(s: string): string | null {
  const clean = s.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) return null;
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (clean[i + k] === '=' ? 0 : B64.indexOf(clean[i + k])));
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    out += String.fromCharCode((n >> 16) & 255);
    if (clean[i + 2] !== '=') out += String.fromCharCode((n >> 8) & 255);
    if (clean[i + 3] !== '=') out += String.fromCharCode(n & 255);
  }
  return out;
}

export function toHex(text: string): string {
  return [...text].map((c) => (c.charCodeAt(0) & 0xff).toString(16).padStart(2, '0')).join('');
}

export function fromHex(s: string): string | null {
  const clean = s.replace(/\s+/g, '');
  if (!/^([0-9a-fA-F]{2})*$/.test(clean)) return null;
  let out = '';
  for (let i = 0; i < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

export function caesar(text: string, shift: number): string {
  const k = ((shift % 26) + 26) % 26;
  return text.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + k) % 26) + base);
  });
}

/** Vigenère over letters only; non-letters pass through and don't consume key letters. */
export function vigenere(text: string, keyword: string, decrypt = false): string {
  const key = keyword.toUpperCase().replace(/[^A-Z]/g, '');
  if (!key) return text;
  let j = 0;
  return text.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    const k = key.charCodeAt(j++ % key.length) - 65;
    const s = decrypt ? 26 - k : k;
    return String.fromCharCode(((ch.charCodeAt(0) - base + s) % 26) + base);
  });
}

export function reverse(text: string): string {
  return [...text].reverse().join('');
}

export function encode(method: DecodeMethod, plaintext: string, opts: { shift?: number; keyword?: string }): string {
  switch (method) {
    case 'base64': return toBase64(plaintext);
    case 'hex': return toHex(plaintext);
    case 'reverse': return reverse(plaintext);
    case 'caesar': return caesar(plaintext, opts.shift ?? 3);
    case 'vigenere': return vigenere(plaintext, opts.keyword ?? 'KEY');
  }
}

export const METHOD_LABELS: Record<DecodeMethod, string> = {
  base64: 'Base64 (encoding)',
  hex: 'Hexadecimal (encoding)',
  reverse: 'Reversed text',
  caesar: 'Caesar shift (cipher)',
  vigenere: 'Vigenère (cipher)',
};
