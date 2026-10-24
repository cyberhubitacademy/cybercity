import { describe, expect, it } from 'vitest';
import { freshAi, perfectAi, scoreAi } from '../src/cyber/challenges/ai/logic';

describe('deepfake & prompt injection', () => {
  it('perfect answers score 100', () => {
    expect(scoreAi(perfectAi()).score).toBe(100);
  });
  it('empty answers fail', () => {
    expect(scoreAi(freshAi()).score).toBeLessThan(65);
  });
  it('trusting a deepfake detector is not a safe procedure', () => {
    const p = perfectAi();
    p.procedure = 'detector';
    expect(scoreAi(p).score).toBe(80);
  });
  it('choosing a trap guardrail reduces the guardrail score', () => {
    const p = perfectAi();
    p.mitigations = [...p.mitigations, 'admin'];
    expect(scoreAi(p).score).toBeLessThan(100);
  });
  it('missing provenance is "unverified", not "fake"', () => {
    const p = perfectAi();
    p.images.img1 = 'declared';
    expect(scoreAi(p).score).toBe(95);
  });
});
