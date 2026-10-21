import { el, type ChallengeContext } from '../../types';
import {
  ALGORITHMS,
  ATTACK_TYPES,
  CONTROLS,
  SAMPLE_PASSWORDS,
  STATEMENTS,
  buildLoginLog,
  correctRanking,
  emptyPasswordAnswers,
  estimateStrength,
  gradePassword,
  saltedToyHash,
  toPasswordResult,
  toyHash,
  type PasswordAnswers,
} from './logic';
import './password.css';

const HINTS = [
  'Strength lab: attackers try common passwords, dictionary words, names and years first. Every truly random character or random word is what really counts.',
  'Log review: look for one source range hitting MANY different usernames with automated software — then find the one line where it worked.',
  'Hashing is a one-way fingerprint for CHECKING a password; encryption is a locked box you can OPEN with a key.',
];

const STAGES = ['A · Strength Lab', 'B · Login Logs', 'C · Hash vs Encrypt'] as const;
const SALTS = ['a91f', '7c2e'];

export function mountPassword(ctx: ChallengeContext, passScore: number): () => void {
  let answers: PasswordAnswers = emptyPasswordAnswers();
  let stage = 0;
  let hintsUsed = 0;
  let hintsShown = 0;
  let finished = false;
  let practice = ''; // fake practice text: kept in memory only, never stored or sent
  const log = buildLoginLog();

  const root = el('div', { class: 'pw-root cx-col' });
  ctx.root.append(root);

  function render(): void {
    const tabs = el('div', { class: 'cx-row' });
    STAGES.forEach((label, i) => {
      const b = el('button', { class: `cx-btn${i === stage ? ' selected' : ''}` }, label);
      b.addEventListener('click', () => {
        stage = i;
        ctx.sfx('click');
        render();
      });
      tabs.append(b);
    });
    const body = stage === 0 ? strengthLab() : stage === 1 ? logReview() : hashLab();
    root.replaceChildren(tabs, body, hintsBlock(), controlsRow());
  }

  function strengthLab(): HTMLElement {
    const box = el('div', { class: 'cx-card cx-col' }, el('h4', {}, 'Rank these from WEAKEST (top) to STRONGEST (bottom)'));
    answers.ranking.forEach((id, i) => {
      const p = SAMPLE_PASSWORDS.find((s) => s.id === id);
      if (!p) return;
      const up = el('button', { class: 'cx-btn small' }, '▲');
      const down = el('button', { class: 'cx-btn small' }, '▼');
      up.toggleAttribute('disabled', i === 0);
      down.toggleAttribute('disabled', i === answers.ranking.length - 1);
      up.addEventListener('click', () => move(i, -1));
      down.addEventListener('click', () => move(i, 1));
      box.append(
        el(
          'div',
          { class: 'pw-rank cx-row' },
          el('span', { class: 'pw-pos' }, String(i + 1)),
          el('div', { class: 'cx-col pw-grow' }, el('span', { class: 'cx-mono pw-value' }, p.value), el('span', { class: 'cx-muted' }, p.owner)),
          up,
          down,
        ),
      );
    });
    box.append(el('div', { class: 'cx-muted' }, 'All passwords here are fictional training samples.'));
    return box;
  }

  function move(i: number, d: number): void {
    const j = i + d;
    if (j < 0 || j >= answers.ranking.length) return;
    const r = [...answers.ranking];
    [r[i], r[j]] = [r[j], r[i]];
    answers.ranking = r;
    ctx.sfx('click');
    render();
  }

  function logReview(): HTMLElement {
    const table = el('table', { class: 'cx-table' });
    table.append(el('thead', {}, el('tr', {}, ...['⚑', 'Time', 'User', 'Source IP', 'Location', 'Client', 'Result'].map((h) => el('th', {}, h)))));
    const tbody = el('tbody', {});
    for (const e of log) {
      const flagged = answers.flagged.includes(e.id);
      const tr = el(
        'tr',
        { class: `clickable${flagged ? ' flagged' : ''}` },
        el('td', {}, flagged ? '🚩' : ''),
        el('td', {}, e.time),
        el('td', {}, e.user),
        el('td', {}, e.sourceIp),
        el('td', {}, e.location),
        el('td', {}, e.device),
        el('td', { class: e.result === 'SUCCESS' ? 'cx-good' : 'cx-bad' }, e.result),
      );
      tr.addEventListener('click', () => {
        answers.flagged = flagged ? answers.flagged.filter((x) => x !== e.id) : [...answers.flagged, e.id];
        ctx.sfx('click');
        render();
      });
      tbody.append(tr);
    }
    table.append(tbody);

    const attack = el('div', { class: 'cx-col' }, el('h4', {}, 'What kind of attack is this?'));
    for (const t of ATTACK_TYPES) {
      const b = el('button', { class: `cx-btn pw-left${answers.attackType === t.id ? ' selected' : ''}` }, t.label);
      b.addEventListener('click', () => {
        answers.attackType = t.id;
        ctx.sfx('click');
        render();
      });
      attack.append(b);
    }
    const ctrls = el('div', { class: 'cx-col' }, el('h4', {}, 'Which controls do you apply? (pick all that help)'));
    for (const c of CONTROLS) {
      const on = answers.controls.includes(c.id);
      const b = el('button', { class: `cx-btn pw-left${on ? ' selected' : ''}` }, `${on ? '☑' : '☐'} ${c.label}`);
      b.addEventListener('click', () => {
        answers.controls = on ? answers.controls.filter((x) => x !== c.id) : [...answers.controls, c.id];
        ctx.sfx('click');
        render();
      });
      ctrls.append(b);
    }
    return el(
      'div',
      { class: 'cx-col' },
      el('div', { class: 'cx-card' }, el('h4', {}, 'coralcafe.nb staff portal — authentication log (click rows to flag the compromise)'), el('div', { class: 'cx-scroll' }, table)),
      el('div', { class: 'cx-grid' }, el('div', { class: 'cx-card' }, attack), el('div', { class: 'cx-card' }, ctrls)),
    );
  }

  function hashLab(): HTMLElement {
    const input = el('input', {
      class: 'cx-input',
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'type a FAKE practice password',
      'aria-label': 'Fake practice password (never use a real one)',
    });
    input.value = practice;
    const out = el('div', { class: 'cx-col cx-mono pw-hashout' });
    const paint = () => {
      const v = practice || 'Summer1985!';
      out.replaceChildren(
        el('div', {}, el('span', { class: 'cx-muted' }, 'toyHash(password)            → '), el('strong', { class: 'cx-warn' }, toyHash(v))),
        el('div', {}, el('span', { class: 'cx-muted' }, `toyHash("${SALTS[0]}" + password) → `), el('strong', { class: 'pw-h1' }, saltedToyHash(SALTS[0], v))),
        el('div', {}, el('span', { class: 'cx-muted' }, `toyHash("${SALTS[1]}" + password) → `), el('strong', { class: 'pw-h2' }, saltedToyHash(SALTS[1], v))),
      );
    };
    input.addEventListener('input', () => {
      practice = input.value;
      paint();
    });
    paint();

    const demo = el(
      'div',
      { class: 'cx-card cx-col' },
      el('h4', {}, 'Salt demo (toy hash — educational only, real systems use Argon2id / bcrypt / scrypt)'),
      el('div', { class: 'cx-muted' }, '⚠ Never type a real password into any game or website you don\'t trust. Nothing here is saved or sent.'),
      input,
      out,
      el('div', { class: 'cx-muted' }, 'Same input + same salt → same output (so the server can check you). Different salt → totally different output (so leaked tables can\'t be reused).'),
    );

    const quiz = el('div', { class: 'cx-card cx-col' }, el('h4', {}, 'Hashing or encryption?'));
    for (const s of STATEMENTS) {
      const pick = (v: 'hash' | 'encrypt', label: string) => {
        const b = el('button', { class: `cx-btn small${answers.statements[s.id] === v ? ' selected' : ''}` }, label);
        b.addEventListener('click', () => {
          answers.statements[s.id] = v;
          ctx.sfx('click');
          render();
        });
        return b;
      };
      quiz.append(el('div', { class: 'pw-stmt cx-row' }, el('span', { class: 'pw-grow' }, s.text), pick('hash', '# Hashing'), pick('encrypt', '🔐 Encryption')));
    }
    const algo = el('div', { class: 'cx-card cx-col' }, el('h4', {}, 'Carla\'s new portal must store passwords. Which method?'));
    for (const a of ALGORITHMS) {
      const b = el('button', { class: `cx-btn pw-left${answers.algorithm === a.id ? ' selected' : ''}` }, a.label);
      b.addEventListener('click', () => {
        answers.algorithm = a.id;
        ctx.sfx('click');
        render();
      });
      algo.append(b);
    }
    return el('div', { class: 'cx-col' }, demo, el('div', { class: 'cx-grid' }, quiz, algo));
  }

  function hintsBlock(): HTMLElement {
    const box = el('div', { class: 'cx-col' });
    for (let i = 0; i < hintsShown; i++) box.append(el('div', { class: 'cx-hint' }, `Hint ${i + 1}: ${HINTS[i]}`));
    return box;
  }

  function ready(): boolean {
    return (
      answers.flagged.length > 0 &&
      answers.attackType !== null &&
      answers.controls.length > 0 &&
      STATEMENTS.every((s) => answers.statements[s.id]) &&
      answers.algorithm !== null
    );
  }

  function controlsRow(): HTMLElement {
    const hint = el('button', { class: 'cx-btn' }, hintsShown >= HINTS.length ? 'No more hints' : `💡 Hint ${hintsShown + 1}/${HINTS.length}${hintsShown < ctx.bonusHints ? ' (free)' : ''}`);
    hint.toggleAttribute('disabled', hintsShown >= HINTS.length);
    hint.addEventListener('click', () => {
      if (hintsShown >= HINTS.length) return;
      if (hintsShown >= ctx.bonusHints) hintsUsed++;
      hintsShown++;
      ctx.sfx('open');
      render();
    });
    const next = el('button', { class: 'cx-btn' }, 'Next stage ▶');
    next.toggleAttribute('disabled', stage >= STAGES.length - 1);
    next.addEventListener('click', () => {
      stage = Math.min(STAGES.length - 1, stage + 1);
      ctx.sfx('open');
      render();
    });
    const submit = el('button', { class: 'cx-btn primary' }, 'Submit investigation');
    submit.toggleAttribute('disabled', !ready());
    submit.addEventListener('click', showFeedback);
    return el('div', { class: 'cx-row' }, next, hint, submit, ready() ? null : el('span', { class: 'cx-muted' }, 'Complete all three stages to submit.'));
  }

  function showFeedback(): void {
    const g = gradePassword(answers, passScore);
    ctx.sfx(g.passed ? 'good' : 'bad');
    const bar = (v: number, m: number) => el('div', { class: 'cx-bar' }, el('div', { style: `width:${m ? (v / m) * 100 : 0}%` }));
    const fb = el(
      'div',
      { class: `cx-feedback${g.passed ? '' : ' fail'}` },
      el('h3', { class: g.passed ? 'cx-good' : 'cx-bad' }, g.passed ? 'Account recovered. The Pink Tide is locked out.' : 'The door\'s still ajar — let\'s tighten it.'),
      el('div', { class: 'cx-score' }, `${g.score}/100`),
      ...g.breakdown.map((b) => el('div', { class: 'cx-col' }, el('div', {}, `${b.label}: ${b.value}/${b.max}`), bar(b.value, b.max))),
    );

    const meters = el('div', { class: 'cx-col' }, el('h4', {}, 'Strength meter (weakest → strongest)'));
    for (const id of correctRanking()) {
      const p = SAMPLE_PASSWORDS.find((s) => s.id === id);
      if (!p) continue;
      const r = estimateStrength(p.value);
      meters.append(
        el(
          'div',
          { class: 'cx-col pw-meter' },
          el('div', { class: 'cx-row' }, el('span', { class: 'cx-mono pw-value' }, p.value), el('span', { class: `cx-tag ${r.bits >= 50 ? 'good' : r.bits >= 36 ? 'warn' : 'bad'}` }, `${r.label} · ~${Math.round(r.bits)} bits`)),
          bar(Math.min(r.bits, 110), 110),
          el('div', { class: 'cx-muted' }, r.reasons.join(' ')),
        ),
      );
    }
    fb.append(meters);

    const logList = el(
      'ul',
      {},
      el('li', { class: g.foundCompromise ? 'cx-good' : 'cx-bad' }, `${g.foundCompromise ? '✓' : '✗'} The compromise: 03:12:40 SUCCESS for carla from 198.51.100.23 — the same automated client ("python-requests") and hosting range that had just failed against 12 different usernames. Carla's reused password from a breached site worked.`),
      el('li', { class: g.attackCorrect ? 'cx-good' : 'cx-bad' }, `${g.attackCorrect ? '✓' : '✗'} Credential stuffing: few attempts per account, many accounts, using leaked pairs — brute force hammers one account with many guesses.`),
    );
    if (g.falseFlags) logList.append(el('li', { class: 'cx-bad' }, `✗ ${g.falseFlags} flagged row(s) were normal logins from the café's own 192.0.2.x network.`));
    for (const c of CONTROLS) {
      const chosen = answers.controls.includes(c.id);
      const ok = chosen === c.good;
      logList.append(el('li', { class: ok ? 'cx-good' : 'cx-bad' }, `${ok ? '✓' : '✗'} ${c.good ? 'Apply' : 'Avoid'}: ${c.label} — ${c.explain}`));
    }
    fb.append(el('h4', {}, 'Login investigation'), logList);

    const hashList = el('ul', {});
    for (const s of STATEMENTS) {
      const ok = answers.statements[s.id] === s.answer;
      hashList.append(el('li', { class: ok ? 'cx-good' : 'cx-bad' }, `${ok ? '✓' : '✗'} "${s.text}" → ${s.answer === 'hash' ? 'Hashing' : 'Encryption'}. ${s.explain}`));
    }
    const algo = ALGORITHMS.find((a) => a.id === answers.algorithm);
    if (algo) hashList.append(el('li', { class: algo.good ? 'cx-good' : 'cx-bad' }, `${algo.good ? '✓' : '✗'} ${algo.label}: ${algo.explain}`));
    fb.append(el('h4', {}, 'Hashing vs encryption'), hashList);
    fb.append(el('p', { class: 'cx-muted' }, 'In the real world: password reuse plus a breach elsewhere is how most accounts fall. Unique passwords from a manager, MFA, login rate limiting and slow salted hashing stop the chain at every link.'));

    const retry = el('button', { class: 'cx-btn' }, '↺ Retry');
    retry.addEventListener('click', () => {
      answers = emptyPasswordAnswers();
      stage = 0;
      ctx.sfx('click');
      render();
    });
    const cont = el('button', { class: 'cx-btn primary' }, 'Continue ▶');
    cont.addEventListener('click', () => {
      if (finished) return;
      finished = true;
      ctx.finish(toPasswordResult(g, hintsUsed));
    });
    fb.append(el('div', { class: 'cx-row' }, retry, cont));
    root.replaceChildren(fb);
  }

  render();
  return () => {
    practice = '';
    root.remove();
    ctx.root.replaceChildren();
  };
}
