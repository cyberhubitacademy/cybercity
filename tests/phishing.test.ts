import { describe, expect, it } from 'vitest';
import { EMAILS, WORST_EMAIL_ID, emptyAnswers, gradePhishing, hostOf, isComplete, type PhishingAnswers } from '../src/cyber/challenges/phishing/logic';

function perfect(): PhishingAnswers {
  const a = emptyAnswers();
  for (const e of EMAILS) {
    a.verdicts[e.id] = e.phishing ? 'phishing' : 'legit';
    a.flags[e.id] = [...e.flags];
  }
  a.response = 'report';
  return a;
}

describe('phishing grading', () => {
  it('perfect answers score 100 and pass', () => {
    const a = perfect();
    expect(isComplete(a)).toBe(true);
    const g = gradePhishing(a, 60);
    expect(g.score).toBe(100);
    expect(g.passed).toBe(true);
    expect(g.mistakes).toHaveLength(0);
  });

  it('all wrong answers score low and fail', () => {
    const a = emptyAnswers();
    for (const e of EMAILS) {
      a.verdicts[e.id] = e.phishing ? 'legit' : 'phishing';
      a.flags[e.id] = e.phishing ? [] : ['urgency', 'lookalike'];
    }
    a.response = 'click';
    const g = gradePhishing(a, 60);
    expect(g.score).toBeLessThan(20);
    expect(g.passed).toBe(false);
  });

  it('penalizes false positives on legitimate mail', () => {
    const base = gradePhishing(perfect(), 60).score;
    const a = perfect();
    const legit = EMAILS.find((e) => !e.phishing);
    if (!legit) throw new Error('need a legit email');
    a.verdicts[legit.id] = 'phishing';
    a.flags[legit.id] = ['urgency'];
    const g = gradePhishing(a, 60);
    expect(g.falsePositives).toBe(1);
    expect(g.score).toBeLessThan(base);
  });

  it('rewards evidence: missing flags lowers the score', () => {
    const a = perfect();
    for (const e of EMAILS) if (e.phishing) a.flags[e.id] = [];
    const g = gradePhishing(a, 60);
    expect(g.breakdown.find((b) => b.label.startsWith('Evidence'))?.value).toBe(0);
    expect(g.score).toBeLessThan(70);
  });

  it('worst email is the credential phish and hostOf parses', () => {
    expect(WORST_EMAIL_ID).toBe('bank-alert');
    expect(hostOf('http://203.0.113.77/nbpx/pay.php')).toBe('203.0.113.77');
    expect(hostOf('max@freemail.nb')).toBe('freemail.nb');
  });
});
