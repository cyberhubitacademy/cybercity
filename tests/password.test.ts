import { describe, expect, it } from 'vitest';
import {
  ALGORITHMS,
  CONTROLS,
  COMPROMISE_EVENT_ID,
  SAMPLE_PASSWORDS,
  STATEMENTS,
  buildLoginLog,
  correctRanking,
  detectStuffingSuccess,
  emptyPasswordAnswers,
  estimateStrength,
  gradePassword,
  rankingAccuracy,
  saltedToyHash,
  toyHash,
  type PasswordAnswers,
} from '../src/cyber/challenges/password/logic';

function perfect(): PasswordAnswers {
  const a = emptyPasswordAnswers();
  a.ranking = correctRanking();
  a.flagged = [COMPROMISE_EVENT_ID];
  a.attackType = 'stuffing';
  a.controls = CONTROLS.filter((c) => c.good).map((c) => c.id);
  for (const s of STATEMENTS) a.statements[s.id] = s.answer;
  a.algorithm = ALGORITHMS.find((x) => x.good)?.id ?? null;
  return a;
}

describe('password strength estimator', () => {
  it('orders samples sensibly', () => {
    const bits = (v: string) => estimateStrength(v).bits;
    expect(bits('password1')).toBeLessThan(bits('Summer1985!'));
    expect(bits('Summer1985!')).toBeLessThan(bits('coral-sunset-falcon-radio'));
    expect(bits('coral-sunset-falcon-radio')).toBeLessThan(bits('k7#Qm9!vRz2&Lp4X'));
    expect(estimateStrength('Summer1985!').label).toBe('Weak');
    expect(estimateStrength('k7#Qm9!vRz2&Lp4X').label).toBe('Excellent');
  });

  it('sees through leetspeak', () => {
    expect(estimateStrength('P@ssw0rd').bits).toBeLessThan(estimateStrength('Xq#9vLm2').bits);
  });

  it('correct ranking runs weakest to strongest', () => {
    const r = correctRanking();
    expect(r[0]).toBe('p-common');
    expect(r[r.length - 1]).toBe('p-manager');
    expect(rankingAccuracy(r, r)).toBe(1);
    expect(rankingAccuracy([...r].reverse(), r)).toBe(0);
    expect(r).toHaveLength(SAMPLE_PASSWORDS.length);
  });
});

describe('credential stuffing detection', () => {
  it('finds exactly the compromising success', () => {
    expect(detectStuffingSuccess(buildLoginLog())).toEqual([COMPROMISE_EVENT_ID]);
  });
});

describe('toy hash', () => {
  it('is deterministic and salt-sensitive', () => {
    expect(toyHash('abc')).toBe(toyHash('abc'));
    expect(toyHash('abc')).toHaveLength(16);
    expect(saltedToyHash('a91f', 'pw')).not.toBe(saltedToyHash('7c2e', 'pw'));
  });
});

describe('password grading', () => {
  it('perfect answers score 100', () => {
    const g = gradePassword(perfect(), 60);
    expect(g.score).toBe(100);
    expect(g.passed).toBe(true);
  });

  it('all wrong answers fail', () => {
    const a = emptyPasswordAnswers();
    a.ranking = [...correctRanking()].reverse();
    a.flagged = buildLoginLog()
      .filter((e) => e.sourceIp.startsWith('192.0.2.'))
      .map((e) => e.id);
    a.attackType = 'ddos';
    a.controls = CONTROLS.filter((c) => !c.good).map((c) => c.id);
    for (const s of STATEMENTS) a.statements[s.id] = s.answer === 'hash' ? 'encrypt' : 'hash';
    a.algorithm = 'md5';
    const g = gradePassword(a, 60);
    expect(g.score).toBe(0);
    expect(g.passed).toBe(false);
  });

  it('penalizes flagging legitimate logins and bad controls', () => {
    const a = perfect();
    a.flagged = [COMPROMISE_EVENT_ID, 'e01'];
    a.controls = [...a.controls, 'expire'];
    const g = gradePassword(a, 60);
    expect(g.falseFlags).toBe(1);
    expect(g.score).toBeLessThan(100);
  });
});
