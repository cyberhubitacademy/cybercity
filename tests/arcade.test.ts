import { describe, expect, it } from 'vitest';
import { ARCADE_CATEGORIES, ARCADE_ENTRIES, ARCADE_NAMES_RAW, getEntry } from '../src/cyber/arcade/catalog';
import { allBanks, bankItemCount, getBank } from '../src/cyber/arcade/banks';
import { generateRound, perfectAnswers, roundHints, scoreRound, wrongAnswers } from '../src/cyber/arcade/mechanics/logic';
import { categoryCard } from '../src/cyber/arcade/cards';
import { caesar, fromBase64, fromHex, toBase64, toHex, vigenere } from '../src/cyber/arcade/mechanics/decode';
import { slugify } from '../src/cyber/arcade/rng';

const UNIQUE_NAMES = 1189;
const RAW_NAMES = 1250;

describe('arcade catalog', () => {
  it('has all 31 categories in order', () => {
    expect(ARCADE_CATEGORIES).toHaveLength(31);
    expect(ARCADE_CATEGORIES[0].title).toBe('Cyber Detective & Investigation Games');
    expect(ARCADE_CATEGORIES[30].title).toBe('Bonus: 50 additional creative names');
  });

  it('includes every listed name exactly once as an entry', () => {
    expect(ARCADE_NAMES_RAW).toHaveLength(RAW_NAMES);
    const unique = new Set(ARCADE_NAMES_RAW);
    expect(unique.size).toBe(UNIQUE_NAMES);
    expect(ARCADE_ENTRIES).toHaveLength(UNIQUE_NAMES);
    expect(new Set(ARCADE_ENTRIES.map((e) => e.id)).size).toBe(UNIQUE_NAMES);
    const names = new Set(ARCADE_ENTRIES.map((e) => e.name));
    for (const n of unique) expect(names.has(n)).toBe(true);
  });

  it('contains specific names from many categories', () => {
    const names = new Set(ARCADE_ENTRIES.map((e) => e.name));
    for (const n of ['Phish or Finish', 'Vigenère Vault', 'The Last Encryption Key', 'Prompt Injection Puzzle', 'Smart Contract Detective', 'Ultimate Defender', 'SentinelLab', 'Operation Phish Trap', 'The Final Patch', 'Detection Engineer', 'SOC Analyst Simulator', 'Mission: Lock Down the System', 'Bait or Legit?']) {
      expect(names.has(n), n).toBe(true);
    }
  });

  it('keeps names shared by several categories as one entry', () => {
    const e = getEntry(slugify('Phishing Detective'));
    expect(e?.categoryIds).toEqual(['investigation', 'phishing']);
    expect(getEntry(slugify('Capture the Flag'))?.categoryIds).toEqual(['pentest', 'competition']);
  });

  it('every category has a concept card', () => {
    for (const c of ARCADE_CATEGORIES) {
      const card = categoryCard(c.id);
      expect(card.id.startsWith(`arcade-${c.id}-`)).toBe(true);
      expect(card.definition.length).toBeGreaterThan(10);
    }
  });
});

describe('arcade banks', () => {
  it('every bank has at least 10 items and every item explains itself', () => {
    const banks = allBanks();
    expect(banks).toHaveLength(31);
    for (const b of banks) {
      expect(bankItemCount(b), b.id).toBeGreaterThanOrEqual(10);
      for (const it of b.classify) expect(it.why.length, b.id).toBeGreaterThan(5);
      for (const it of b.configs) expect(it.why.length, b.id).toBeGreaterThan(5);
      for (const it of b.quiz) {
        expect(it.why.length).toBeGreaterThan(5);
        expect(it.correct).toBeLessThan(it.options.length);
      }
      for (const it of b.triage) expect(it.why.length).toBeGreaterThan(5);
      for (const it of b.order) expect(it.why.length).toBeGreaterThan(5);
      for (const s of b.spot) {
        expect(s.flags.length).toBeGreaterThan(0);
        for (const [, why] of [...s.flags, ...s.decoys]) expect(why.length).toBeGreaterThan(3);
      }
    }
  });
});

describe('decode helpers', () => {
  it('round-trips encodings and ciphers', () => {
    expect(toBase64('NB{HELLO}')).toBe('TkJ7SEVMTE99');
    expect(fromBase64('TkJ7SEVMTE99')).toBe('NB{HELLO}');
    expect(fromHex(toHex('NB{X}'))).toBe('NB{X}');
    expect(caesar('HELLO', 3)).toBe('KHOOR');
    expect(caesar(caesar('NB{TIDE}', 11), -11)).toBe('NB{TIDE}');
    expect(vigenere(vigenere('NB{SHIELD}', 'NEON'), 'NEON', true)).toBe('NB{SHIELD}');
    expect(fromBase64('not base64!')).toBeNull();
  });
});

describe('arcade rounds', () => {
  it('every entry generates a valid, deterministic, scorable round', () => {
    const counts: Record<string, number> = {};
    for (const e of ARCADE_ENTRIES) {
      counts[e.mechanic] = (counts[e.mechanic] ?? 0) + 1;
      const input = { mechanic: e.mechanic, bankId: e.bank, seed: e.seed, difficulty: e.difficulty };
      const r = generateRound(input);
      const again = generateRound(input);
      expect(JSON.stringify(again)).toBe(JSON.stringify(r));
      const size = r.kind === 'spot' ? r.chips.length : r.kind === 'order' ? r.steps.length : r.kind === 'match' ? r.terms.length
        : r.kind === 'triage' ? r.alerts.length : r.items.length;
      expect(size, e.name).toBeGreaterThanOrEqual(5);
      expect(size, e.name).toBeLessThanOrEqual(8);
      expect(scoreRound(r, perfectAnswers(r)).score, e.name).toBe(100);
      expect(scoreRound(r, {}).score, e.name).toBeLessThan(60);
      expect(scoreRound(r, wrongAnswers(r)).score, e.name).toBeLessThan(60);
      expect(roundHints(r, getBank(e.bank))).toHaveLength(3);
    }
    // all eight mechanics are actually used
    expect(Object.keys(counts).sort()).toEqual(['classify', 'configure', 'decode', 'match', 'order', 'quiz-scenario', 'spot', 'triage']);
  });

  it('different seeds in the same bank give different rounds', () => {
    const a = generateRound({ mechanic: 'classify', bankId: 'phishing', seed: 1, difficulty: 2 });
    const b = generateRound({ mechanic: 'classify', bankId: 'phishing', seed: 2, difficulty: 2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('decode rounds are solvable with the stated method', () => {
    const r = generateRound({ mechanic: 'decode', bankId: 'crypto', seed: 42, difficulty: 3 });
    if (r.kind !== 'decode') throw new Error('expected decode');
    for (const it of r.items) {
      const back = it.method === 'base64' ? fromBase64(it.cipher)
        : it.method === 'hex' ? fromHex(it.cipher)
          : it.method === 'reverse' ? [...it.cipher].reverse().join('')
            : it.method === 'caesar' ? caesar(it.cipher, -(it.shift ?? 0))
              : vigenere(it.cipher, it.keyword ?? '', true);
      expect(back).toBe(it.plaintext);
    }
  });

  it('partial triage answers earn partial credit', () => {
    const r = generateRound({ mechanic: 'triage', bankId: 'soc', seed: 7, difficulty: 1 });
    if (r.kind !== 'triage') throw new Error('expected triage');
    const a = perfectAnswers(r);
    const first = r.alerts[0];
    a[first.key] = String(first.priority === 4 ? 3 : first.priority + 1);
    const s = scoreRound(r, a).score;
    expect(s).toBeLessThan(100);
    expect(s).toBeGreaterThan(80);
  });
});
