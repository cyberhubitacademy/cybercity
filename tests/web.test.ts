import { describe, expect, it } from 'vitest';
import { FINDINGS, freshWeb, perfectWeb, replay, scoreWeb } from '../src/cyber/challenges/web/logic';
import { pairwiseOrder, setFraction } from '../src/cyber/challenges/web/s2score';

describe('web app defender', () => {
  it('perfect answers score 100', () => {
    expect(scoreWeb(perfectWeb()).score).toBe(100);
  });
  it('empty answers fail', () => {
    expect(scoreWeb(freshWeb()).score).toBeLessThan(65);
  });
  it('flagging the secure reset endpoint costs points', () => {
    const p = perfectWeb();
    p.verdict.reset = 'vulnerable';
    expect(scoreWeb(p).score).toBeLessThan(100);
  });
  it('weak patches leave the replayed attack unblocked', () => {
    const sqli = FINDINGS.find((f) => f.id === 'sqli')!;
    expect(replay(sqli, ['waf']).blocked).toBe(false);
    expect(replay(sqli, ['param']).blocked).toBe(true);
    const headers = FINDINGS.find((f) => f.id === 'headers')!;
    expect(replay(headers, ['hsts', 'csp', 'nosniff', 'cors']).blocked).toBe(false);
  });
  it('is deterministic', () => {
    expect(scoreWeb(perfectWeb())).toEqual(scoreWeb(perfectWeb()));
  });
  it('shared helpers', () => {
    expect(setFraction(['a', 'x'], ['a', 'b'])).toBe(0);
    expect(setFraction(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(pairwiseOrder(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    expect(pairwiseOrder(['c', 'b', 'a'], ['a', 'b', 'c'])).toBe(0);
  });
});
