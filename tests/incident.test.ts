import { describe, expect, it } from 'vitest';
import { IDEAL_SEQUENCE, orderCredit, perfectInput, scoreIncident } from '../src/cyber/challenges/incident/logic';

describe('incident scoring', () => {
  it('perfect response scores 100', () => {
    const s = scoreIncident(perfectInput());
    expect(s.score).toBe(100);
    expect(s.passed).toBe(true);
    expect(s.mistakes).toEqual([]);
  });

  it('treats evidence capture and isolation as interchangeable', () => {
    const swapped = [...IDEAL_SEQUENCE];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(orderCredit(swapped)).toBe(1);
  });

  it('gives partial credit for partially ordered playbooks', () => {
    const reversed = [...IDEAL_SEQUENCE].reverse();
    const c = orderCredit(reversed);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(0.2);
    expect(orderCredit([])).toBe(0);
  });

  it('penalizes distractor cards', () => {
    const input = perfectInput();
    const withRansom = { ...input, playbook: [...input.playbook, 'pay', 'breaker'] };
    const s = scoreIncident(withRansom);
    expect(s.distractorsUsed).toEqual(['pay', 'breaker']);
    expect(s.score).toBe(100 - 24);
  });

  it('wrong report and triage fail', () => {
    const s = scoreIncident({ alertOrder: [], falsePositives: ['al-encrypt'], playbook: ['wipe', 'pay'], rootCause: 'zero-day', impacted: ['WEB'], comms: 'silence' });
    expect(s.passed).toBe(false);
  });
});
