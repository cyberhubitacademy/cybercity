import { describe, expect, it } from 'vitest';
import {
  base64Decode, base64Encode, caesar, CAESAR_SHIFT, CIPHERTEXT, CORRECT_HASH_INDEX, evaluateCrypto, FLAG,
  HASH_CANDIDATES, HASH_MESSAGE, hexDecode, INTERCEPTED, letterFrequency, PLAINTEXT, sha256, validateFlag,
  type CryptoAnswers,
} from '../src/cyber/challenges/crypto/logic';

describe('crypto encodings', () => {
  it('base64 round-trips and matches known values', () => {
    expect(base64Encode('Man')).toBe('TWFu');
    expect(base64Encode('Ma')).toBe('TWE=');
    expect(base64Encode('M')).toBe('TQ==');
    expect(base64Decode('aGVsbG8gd29ybGQ=')).toBe('hello world');
    expect(base64Decode(base64Encode(PLAINTEXT))).toBe(PLAINTEXT);
    expect(base64Decode('not base64!')).toBeNull();
  });
  it('hex decodes', () => {
    expect(hexDecode('4e42')).toBe('NB');
    expect(hexDecode('xyz')).toBeNull();
  });
  it('caesar shifts and reverses', () => {
    expect(caesar('ABC xyz', 3)).toBe('DEF abc');
    expect(caesar(caesar(PLAINTEXT, 7), -7)).toBe(PLAINTEXT);
    expect(caesar('Z', 1)).toBe('A');
  });
  it('the intercepted blob peels back to the plaintext', () => {
    const inner = base64Decode(INTERCEPTED);
    expect(inner).toBe(CIPHERTEXT);
    expect(caesar(inner ?? '', -CAESAR_SHIFT)).toBe(PLAINTEXT);
    expect(PLAINTEXT).toContain(FLAG);
  });
  it('frequency analysis counts letters', () => {
    expect(letterFrequency('aab')[0]).toEqual({ letter: 'A', count: 2 });
  });
});

describe('sha256', () => {
  it('matches FIPS test vectors', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
  it('exactly one candidate matches the message', () => {
    const d = sha256(HASH_MESSAGE);
    expect(HASH_CANDIDATES.filter((h) => h === d)).toHaveLength(1);
    expect(HASH_CANDIDATES[CORRECT_HASH_INDEX]).toBe(d);
  });
});

describe('flag + scoring', () => {
  it('validates the flag case-insensitively', () => {
    expect(validateFlag('nb{flamingo_flies_at_midnight}')).toBe(true);
    expect(validateFlag(' NB{FLAMINGO_FLIES_AT_MIDNIGHT} ')).toBe(true);
    expect(validateFlag(caesar(FLAG, CAESAR_SHIFT))).toBe(false);
  });
  const perfect: CryptoAnswers = {
    outerLayer: 'base64', flag: FLAG, hashIndex: CORRECT_HASH_INDEX,
    matches: { encoding: 'encoding', symmetric: 'symmetric', asymmetric: 'asymmetric', hashing: 'hashing', signature: 'signature' },
    signatureKey: 'flamingo-public', hintPenalty: 0,
  };
  it('perfect answers score 100', () => {
    expect(evaluateCrypto(perfect).score).toBe(100);
  });
  it('empty answers score 0 and list mistakes', () => {
    const ev = evaluateCrypto({ outerLayer: null, flag: '', hashIndex: null, matches: {}, signatureKey: null, hintPenalty: 0 });
    expect(ev.score).toBe(0);
    expect(ev.mistakes.length).toBeGreaterThan(3);
  });
  it('hint penalty reduces score', () => {
    expect(evaluateCrypto({ ...perfect, hintPenalty: 6 }).score).toBe(94);
  });
});
