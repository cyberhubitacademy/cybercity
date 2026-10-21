import { describe, expect, it } from 'vitest';
import {
  correctOrder, evaluateForensics, formatLocal, HERRING_IDS, naiveOrder, orderAccuracy, RELEVANT_IDS, toUtcMillis,
  type ForensicsAnswers,
} from '../src/cyber/challenges/forensics/logic';

describe('time normalisation', () => {
  it('converts local UTC-5 and UTC to the same instant', () => {
    expect(toUtcMillis('2026-10-14 09:02:11', -5)).toBe(toUtcMillis('2026-10-14 14:02:11', 0));
    expect(formatLocal(toUtcMillis('2026-10-14 16:10:44', 0))).toBe('11:10:44');
  });
  it('puts the UTC email first and differs from naive sorting', () => {
    const order = correctOrder();
    expect(order).toEqual(['mail-gw', 'file-meta', 'proc', 'vpn', 'auth', 'hash', 'netflow']);
    expect(naiveOrder()).not.toEqual(order);
  });
  it('excludes red herrings from the relevant set', () => {
    expect(HERRING_IDS).toEqual(expect.arrayContaining(['av-update', 'win-update', 'usb']));
    expect(RELEVANT_IDS).not.toContain('usb');
  });
});

describe('forensics scoring', () => {
  it('pairwise order accuracy', () => {
    expect(orderAccuracy(correctOrder())).toBe(1);
    expect(orderAccuracy([...correctOrder()].reverse())).toBe(0);
    expect(orderAccuracy([])).toBe(0);
  });
  const perfect: ForensicsAnswers = {
    handling: 'image-hash', timeline: correctOrder(), vector: 'phishing', account: 'j.morales', exfil: '11:10 local', hintPenalty: 0,
  };
  it('perfect report scores 100', () => {
    expect(evaluateForensics(perfect).score).toBe(100);
  });
  it('herrings and naive timezone order cost points', () => {
    const ev = evaluateForensics({ ...perfect, timeline: [...naiveOrder(), 'usb'], exfil: '16:10 local' });
    expect(ev.score).toBeLessThan(100);
    expect(ev.mistakes.some((m) => m.includes('red herrings'))).toBe(true);
    expect(ev.mistakes.some((m) => m.includes('exfiltration'))).toBe(true);
  });
});
