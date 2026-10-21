import { describe, expect, it } from 'vitest';
import { SCENARIOS, emptySocialAnswers, gradeSocial, isSocialComplete, needsFollowUp } from '../src/cyber/challenges/social/logic';

function best() {
  const a = emptySocialAnswers();
  for (const s of SCENARIOS) {
    const top = s.options.reduce((m, o) => (o.points > m.points ? o : m));
    a.choices[s.id] = top.id;
    if (s.followUp && s.followUp.when.includes(top.id)) {
      a.followUps[s.id] = s.followUp.options.reduce((m, o) => (o.points > m.points ? o : m)).id;
    }
  }
  return a;
}

describe('social engineering grading', () => {
  it('best decisions score 100 and pass', () => {
    const a = best();
    expect(isSocialComplete(a)).toBe(true);
    const g = gradeSocial(a, 60);
    expect(g.score).toBe(100);
    expect(g.passed).toBe(true);
    expect(g.breakdown.reduce((s, b) => s + b.max, 0)).toBe(100);
  });

  it('unsafe decisions score low and fail', () => {
    const a = emptySocialAnswers();
    for (const s of SCENARIOS) a.choices[s.id] = s.options.reduce((m, o) => (o.points < m.points ? o : m)).id;
    expect(isSocialComplete(a)).toBe(true);
    const g = gradeSocial(a, 60);
    expect(g.score).toBe(0);
    expect(g.passed).toBe(false);
    expect(g.mistakes.length).toBe(SCENARIOS.length);
  });

  it('follow-up is required only after verify-style choices and wrong follow-ups cost points', () => {
    const a = best();
    const s = SCENARIOS.find((x) => x.id === 'ceo-wire');
    if (!s) throw new Error('missing scenario');
    expect(needsFollowUp(s, a)).toBe(true);
    a.followUps[s.id] = 'callerid';
    expect(gradeSocial(a, 60).score).toBeLessThan(100);
    delete a.followUps[s.id];
    expect(isSocialComplete(a)).toBe(false);
  });
});
