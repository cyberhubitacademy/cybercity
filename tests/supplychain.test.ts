import { describe, expect, it } from 'vitest';
import { PACKAGES, freshSupply, perfectSupply, scoreSupply } from '../src/cyber/challenges/supplychain/logic';

describe('poisoned package', () => {
  it('perfect answers score 100', () => {
    expect(scoreSupply(perfectSupply()).score).toBe(100);
  });
  it('empty answers fail', () => {
    expect(scoreSupply(freshSupply()).score).toBeLessThan(65);
  });
  it('has exactly three malicious packages including the typosquat and takeover', () => {
    const bad = PACKAGES.filter((p) => p.answer === 'malicious').map((p) => p.id).sort();
    expect(bad).toEqual(['colorburst', 'httptiny', 'leftpadd']);
  });
  it('marking everything malicious does not pass', () => {
    const p = perfectSupply();
    for (const k of Object.keys(p.verdicts)) p.verdicts[k] = 'malicious';
    expect(scoreSupply(p).score).toBeLessThan(100);
  });
  it('public tweeting is not responsible disclosure', () => {
    const p = perfectSupply();
    p.disclosure = 'tweet';
    expect(scoreSupply(p).score).toBe(80);
  });
});
