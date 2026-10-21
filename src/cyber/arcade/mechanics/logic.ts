import { clampScore } from '../../types';
import type {
  Answers, Bank, DecodeMethod, MechanicId, Round, RoundItemResult, RoundScore,
} from '../types';
import { getBank, relatedBanks } from '../banks';
import { seededRandom, shuffle } from '../rng';
import { encode, METHOD_LABELS } from './decode';

// Pure round generation + scoring for every arcade mechanic.
// Rounds are deterministic for a (mechanic, bank, seed, difficulty) tuple.

export interface GenInput {
  mechanic: MechanicId;
  bankId: string;
  seed: number;
  difficulty: 1 | 2 | 3;
}

export function roundSize(difficulty: 1 | 2 | 3): number {
  return difficulty === 1 ? 5 : difficulty === 2 ? 6 : 7;
}

/** Take n items: mostly from the main bank, topped up from related banks. */
function draw<T>(main: T[], related: T[], n: number, rnd: () => number): T[] {
  const own = shuffle(main, rnd);
  const ownTake = Math.min(own.length, Math.max(Math.ceil(n * 0.6), n - related.length));
  const picked = own.slice(0, ownTake);
  const rest = shuffle(related, rnd);
  for (const r of rest) {
    if (picked.length >= n) break;
    if (!picked.includes(r)) picked.push(r);
  }
  for (const o of own.slice(ownTake)) {
    if (picked.length >= n) break;
    picked.push(o);
  }
  return shuffle(picked, rnd);
}

function pool<K extends keyof Bank>(bank: Bank, key: K): { main: Bank[K]; related: Bank[K] } {
  const rel = relatedBanks(bank.id);
  const related = rel.flatMap((b) => b[key] as unknown as unknown[]) as unknown as Bank[K];
  return { main: bank[key], related };
}

export function generateRound(input: GenInput): Round {
  const bank = getBank(input.bankId);
  const rnd = seededRandom(input.seed ^ (input.difficulty * 0x9e3779b1));
  const n = roundSize(input.difficulty);
  switch (input.mechanic) {
    case 'classify': {
      const p = pool(bank, 'classify');
      const items = draw(p.main, p.related, n, rnd);
      return { kind: 'classify', items: items.map((it, i) => ({ key: `c${i}`, ...it })) };
    }
    case 'spot': {
      const all = bank.spot.length ? bank.spot : relatedBanks(bank.id).flatMap((b) => b.spot);
      const art = all[Math.floor(rnd() * all.length)];
      const chips = shuffle(
        [
          ...art.flags.map(([text, why]) => ({ text, why, isFlag: true })),
          ...art.decoys.map(([text, why]) => ({ text, why, isFlag: false })),
        ],
        rnd,
      ).map((c, i) => ({ key: `s${i}`, ...c }));
      return { kind: 'spot', artifact: { title: art.title, fields: art.fields }, chips };
    }
    case 'order': {
      const sets = bank.order.length ? bank.order : relatedBanks(bank.id).flatMap((b) => b.order);
      const set = sets[Math.floor(rnd() * sets.length)];
      const steps = set.steps.map((text, i) => ({ key: `o${i}`, text }));
      let shuffled = shuffle(steps, rnd);
      if (shuffled.every((s, i) => s.key === steps[i].key)) shuffled = [...shuffled.slice(1), shuffled[0]];
      return { kind: 'order', title: set.title, steps: shuffled, correct: steps.map((s) => s.key), why: set.why };
    }
    case 'match': {
      const p = pool(bank, 'pairs');
      const pairs = draw(p.main, p.related, n, rnd);
      const terms = pairs.map((pr, i) => ({ key: `t${i}`, term: pr.term, answer: `d${i}` }));
      const definitions = shuffle(pairs.map((pr, i) => ({ key: `d${i}`, text: pr.definition })), rnd);
      const whyByTerm: Record<string, string> = {};
      pairs.forEach((pr, i) => { whyByTerm[`t${i}`] = `${pr.term}: ${pr.definition}.`; });
      return { kind: 'match', terms, definitions, whyByTerm };
    }
    case 'configure': {
      const p = pool(bank, 'configs');
      const items = draw(p.main, p.related, n, rnd);
      const extras = shuffle(p.related, rnd);
      return {
        kind: 'configure',
        items: items.map((it, i) => {
          const opts = [it.secure, it.insecure];
          if (input.difficulty === 3) {
            const decoy = extras.find((e) => e.insecure !== it.insecure && e.secure !== it.secure);
            if (decoy) opts.push(decoy.insecure);
          }
          return { key: `g${i}`, setting: it.setting, options: shuffle(opts, rnd), secure: it.secure, why: it.why };
        }),
      };
    }
    case 'decode': {
      const words = [...new Set([...bank.words, ...relatedBanks(bank.id).slice(0, 3).flatMap((b) => b.words)])];
      const methods: DecodeMethod[] = input.difficulty === 1
        ? ['base64', 'reverse', 'hex']
        : input.difficulty === 2 ? ['base64', 'hex', 'caesar', 'reverse'] : ['base64', 'hex', 'caesar', 'vigenere'];
      const count = input.difficulty === 3 ? 6 : 5;
      const chosen = shuffle(words, rnd).slice(0, count);
      return {
        kind: 'decode',
        items: chosen.map((w, i) => {
          const method = methods[(i + Math.floor(rnd() * methods.length)) % methods.length];
          const plaintext = `NB{${w}}`;
          const shift = 1 + Math.floor(rnd() * 24);
          const keyword = shuffle(['NEON', 'BAY', 'PALM', 'TIDE', 'SHIELD'], rnd)[0];
          const cipher = encode(method, plaintext, { shift, keyword });
          const hint = method === 'vigenere' ? `Keyword: ${keyword}` : method === 'caesar' ? 'Letters are rotated by a fixed amount (1–25)' : 'No key needed';
          return { key: `x${i}`, cipher, method, plaintext, hint, shift: method === 'caesar' ? shift : undefined, keyword: method === 'vigenere' ? keyword : undefined };
        }),
      };
    }
    case 'triage': {
      const p = pool(bank, 'triage');
      const alerts = draw(p.main, p.related, n, rnd);
      return { kind: 'triage', alerts: alerts.map((a, i) => ({ key: `a${i}`, ...a })) };
    }
    case 'quiz-scenario': {
      const p = pool(bank, 'quiz');
      const items = draw(p.main, p.related, n, rnd);
      return { kind: 'quiz-scenario', items: items.map((q, i) => ({ key: `q${i}`, ...q })) };
    }
  }
}

const P_LABEL: Record<number, string> = { 1: 'P1 Critical', 2: 'P2 High', 3: 'P3 Medium', 4: 'P4 Benign' };

export function scoreRound(round: Round, a: Answers): RoundScore {
  const items: RoundItemResult[] = [];
  let earned = 0, total = 0;
  const breakdown: RoundScore['breakdown'] = [];
  switch (round.kind) {
    case 'classify': {
      for (const it of round.items) {
        const want = it.suspicious ? 'suspicious' : 'safe';
        const ok = a[it.key] === want;
        if (ok) earned++;
        items.push({ key: it.key, label: it.text, correct: ok, why: it.why, expected: it.suspicious ? 'Suspicious' : 'Safe' });
      }
      total = round.items.length;
      breakdown.push({ label: 'Correctly classified', value: earned, max: total });
      break;
    }
    case 'spot': {
      const flags = round.chips.filter((c) => c.isFlag);
      let tp = 0, fp = 0;
      for (const c of round.chips) {
        const picked = a[c.key] === 'flag';
        if (picked && c.isFlag) tp++;
        if (picked && !c.isFlag) fp++;
        items.push({ key: c.key, label: c.text, correct: picked === c.isFlag, why: c.why, expected: c.isFlag ? 'Red flag' : 'Not a red flag' });
      }
      earned = Math.max(0, tp - fp);
      total = flags.length;
      breakdown.push({ label: 'Real red flags found', value: tp, max: flags.length });
      breakdown.push({ label: 'Decoys wrongly flagged', value: fp, max: round.chips.length - flags.length });
      break;
    }
    case 'order': {
      const given = (a.order ?? '').split('|').filter(Boolean);
      const pos = new Map(given.map((k, i) => [k, i]));
      const c = round.correct;
      let pairs = 0, good = 0;
      for (let i = 0; i < c.length; i++) {
        for (let j = i + 1; j < c.length; j++) {
          pairs++;
          const pi = pos.get(c[i]), pj = pos.get(c[j]);
          if (pi !== undefined && pj !== undefined && pi < pj) good++;
        }
      }
      earned = given.length === c.length ? good : 0;
      total = pairs;
      const textOf = new Map(round.steps.map((s) => [s.key, s.text]));
      c.forEach((k, i) => {
        items.push({ key: k, label: textOf.get(k) ?? k, correct: given[i] === k, why: i === c.length - 1 ? round.why : `Step ${i + 1} of ${c.length}.`, expected: `Position ${i + 1}` });
      });
      breakdown.push({ label: 'Pairs in the right order', value: earned, max: total });
      break;
    }
    case 'match': {
      for (const t of round.terms) {
        const ok = a[t.key] === t.answer;
        if (ok) earned++;
        const def = round.definitions.find((d) => d.key === t.answer)?.text ?? '';
        items.push({ key: t.key, label: t.term, correct: ok, why: round.whyByTerm[t.key], expected: def });
      }
      total = round.terms.length;
      breakdown.push({ label: 'Correct matches', value: earned, max: total });
      break;
    }
    case 'configure': {
      for (const it of round.items) {
        const ok = a[it.key] === it.secure;
        if (ok) earned++;
        items.push({ key: it.key, label: it.setting, correct: ok, why: it.why, expected: it.secure });
      }
      total = round.items.length;
      breakdown.push({ label: 'Secure settings chosen', value: earned, max: total });
      break;
    }
    case 'decode': {
      let methods = 0, texts = 0;
      for (const it of round.items) {
        const mOk = a[`${it.key}:method`] === it.method;
        const tOk = (a[`${it.key}:text`] ?? '').trim().toUpperCase() === it.plaintext.toUpperCase();
        if (mOk) methods++;
        if (tOk) texts++;
        earned += (mOk ? 0.4 : 0) + (tOk ? 0.6 : 0);
        const detail = it.method === 'caesar' ? ` (shift ${it.shift})` : it.method === 'vigenere' ? ` (keyword ${it.keyword})` : '';
        items.push({
          key: it.key, label: it.cipher, correct: mOk && tOk, partial: mOk !== tOk,
          why: `${METHOD_LABELS[it.method]}${detail}. ${it.method === 'base64' || it.method === 'hex' || it.method === 'reverse' ? 'Encodings are reversible by anyone — they hide nothing.' : 'Classical ciphers are educational only; modern systems use AES/RSA/ECC.'}`,
          expected: it.plaintext,
        });
      }
      total = round.items.length;
      breakdown.push({ label: 'Methods identified', value: methods, max: total });
      breakdown.push({ label: 'Plaintexts recovered', value: texts, max: total });
      break;
    }
    case 'triage': {
      let exact = 0;
      for (const al of round.alerts) {
        const got = Number(a[al.key] ?? 0);
        const diff = got ? Math.abs(got - al.priority) : 9;
        const pts = diff === 0 ? 1 : diff === 1 ? 0.5 : 0;
        if (diff === 0) exact++;
        earned += pts;
        items.push({ key: al.key, label: al.text, correct: diff === 0, partial: diff === 1, why: al.why, expected: P_LABEL[al.priority] });
      }
      total = round.alerts.length;
      breakdown.push({ label: 'Exact priorities', value: exact, max: total });
      break;
    }
    case 'quiz-scenario': {
      for (const q of round.items) {
        const ok = a[q.key] === String(q.correct);
        if (ok) earned++;
        items.push({ key: q.key, label: q.situation, correct: ok, why: q.why, expected: q.options[q.correct] });
      }
      total = round.items.length;
      breakdown.push({ label: 'Best responses chosen', value: earned, max: total });
      break;
    }
  }
  return { score: clampScore(total ? (earned / total) * 100 : 0), breakdown, items };
}

/** The fully correct answer set (used for tests and the "reveal" hint). */
export function perfectAnswers(round: Round): Answers {
  const a: Answers = {};
  switch (round.kind) {
    case 'classify': for (const it of round.items) a[it.key] = it.suspicious ? 'suspicious' : 'safe'; break;
    case 'spot': for (const c of round.chips) if (c.isFlag) a[c.key] = 'flag'; break;
    case 'order': a.order = round.correct.join('|'); break;
    case 'match': for (const t of round.terms) a[t.key] = t.answer; break;
    case 'configure': for (const it of round.items) a[it.key] = it.secure; break;
    case 'decode': for (const it of round.items) { a[`${it.key}:method`] = it.method; a[`${it.key}:text`] = it.plaintext; } break;
    case 'triage': for (const al of round.alerts) a[al.key] = String(al.priority); break;
    case 'quiz-scenario': for (const q of round.items) a[q.key] = String(q.correct); break;
  }
  return a;
}

/** A deliberately wrong answer set (every item answered incorrectly). */
export function wrongAnswers(round: Round): Answers {
  const a: Answers = {};
  switch (round.kind) {
    case 'classify': for (const it of round.items) a[it.key] = it.suspicious ? 'safe' : 'suspicious'; break;
    case 'spot': for (const c of round.chips) if (!c.isFlag) a[c.key] = 'flag'; break;
    case 'order': a.order = [...round.correct].reverse().join('|'); break;
    case 'match': round.terms.forEach((t, i) => { a[t.key] = round.terms[(i + 1) % round.terms.length].answer; }); break;
    case 'configure': for (const it of round.items) a[it.key] = it.options.find((o) => o !== it.secure) ?? ''; break;
    case 'decode': for (const it of round.items) { a[`${it.key}:method`] = it.method === 'base64' ? 'hex' : 'base64'; a[`${it.key}:text`] = 'NB{WRONG}'; } break;
    case 'triage': for (const al of round.alerts) a[al.key] = al.priority <= 2 ? '4' : '1'; break;
    case 'quiz-scenario': for (const q of round.items) a[q.key] = String((q.correct + 1) % q.options.length); break;
  }
  return a;
}

/** Three escalating hints: technique, concept, then one revealed answer. */
export function roundHints(round: Round, bank: Bank): string[] {
  const tip: Record<Round['kind'], string> = {
    classify: 'Look for the classic tells: urgency, unexpected destinations, missing controls, or behavior at odd times.',
    spot: 'A red flag is evidence of risk in THIS artifact. Decoys are true statements that aren\'t a problem — don\'t tag everything.',
    order: 'Think "stop the bleeding" first and "write it up" last. Preserve before you change; verify before you reconnect.',
    match: 'Start with the terms you\'re sure about, then eliminate.',
    configure: 'The secure option usually applies least privilege, defaults to deny, or removes a single point of failure.',
    decode: 'Base64 uses A–Z a–z 0–9 + / and often ends with "="; hex is only 0–9 a–f; a Caesar shift keeps word shapes like NB{…}.',
    triage: 'Confirmed active compromise or data exposure is P1; expected, authorized activity is P4.',
    'quiz-scenario': 'Prefer answers that verify through an independent channel, contain before cleaning, and follow the written process.',
  };
  const reveal = (() => {
    const p = perfectAnswers(round);
    switch (round.kind) {
      case 'classify': return `"${round.items[0].text}" → ${p[round.items[0].key]}.`;
      case 'spot': { const f = round.chips.find((c) => c.isFlag); return f ? `"${f.text}" is a real red flag.` : ''; }
      case 'order': return `The first step is: "${round.steps.find((s) => s.key === round.correct[0])?.text}".`;
      case 'match': return `${round.terms[0].term} → "${round.definitions.find((d) => d.key === round.terms[0].answer)?.text}".`;
      case 'configure': return `${round.items[0].setting} → "${round.items[0].secure}".`;
      case 'decode': return `The first one is ${METHOD_LABELS[round.items[0].method]}.`;
      case 'triage': return `"${round.alerts[0].text}" is ${P_LABEL[round.alerts[0].priority]}.`;
      case 'quiz-scenario': return `Scenario 1 → "${round.items[0].options[round.items[0].correct]}".`;
    }
  })();
  return [tip[round.kind], `Concept: ${bank.card.title} — ${bank.card.bestPractice}`, reveal];
}

export { P_LABEL };
