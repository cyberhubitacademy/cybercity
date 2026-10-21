import { el, type ChallengeContext, type ChallengeResult } from '../../types';
import type { Answers, Bank, MechanicId, Round } from '../types';
import { MECHANICS } from '../types';
import { generateRound, perfectAnswers, P_LABEL, roundHints, scoreRound } from './logic';
import { caesar, fromBase64, fromHex, METHOD_LABELS, reverse, vigenere } from './decode';
import '../arcade.css';

// Shared play screen for every arcade entry: workspace for the mechanic,
// hints, submit → per-item feedback, Retry / Continue.

export interface PlayOptions {
  entryId: string;
  name: string;
  mechanic: MechanicId;
  difficulty: 1 | 2 | 3;
  seed: number;
  bank: Bank;
  passScore: number;
  conceptIds: string[];
}

export function mountArcadeRound(ctx: ChallengeContext, o: PlayOptions): () => void {
  const root = ctx.root;
  let attempt = 0;
  let hintsUsed = 0;
  let finished = false;
  let answers: Answers = {};
  let round: Round = generateRound({ mechanic: o.mechanic, bankId: o.bank.id, seed: o.seed, difficulty: o.difficulty });
  const mech = MECHANICS.find((m) => m.id === o.mechanic) ?? MECHANICS[0];

  function render(): void {
    root.innerHTML = '';
    const head = el('div', { class: 'ar-head' },
      el('span', { class: 'ar-mech' }, `${mech.icon} ${mech.label}`),
      el('span', { class: 'cx-muted' }, mech.verb),
      el('span', { class: 'cx-tag cyan' }, `Variation #${(o.seed % 9000) + 1000 + attempt}`),
    );
    const note = el('div', { class: 'ar-note cx-muted' }, 'Arcade entries are generated variations of shared mechanics over Neon Bay content banks — fictional scenarios, real defensive lessons.');
    const work = el('div', { class: 'ar-work' });
    renderWork(work);
    const hintBox = el('div', { class: 'cx-col' });
    const hints = roundHints(round, o.bank);
    const hintBtn = el('button', { class: 'cx-btn small' }, `💡 Hint (${hintsUsed}/3)`);
    hintBtn.addEventListener('click', () => {
      if (hintsUsed >= 3) return;
      hintsUsed++;
      ctx.sfx('click');
      hintBox.append(el('div', { class: 'cx-hint' }, `${hintsUsed <= ctx.bonusHints ? '(free) ' : ''}${hints[hintsUsed - 1]}`));
      hintBtn.textContent = `💡 Hint (${hintsUsed}/3)`;
      if (hintsUsed >= 3) hintBtn.setAttribute('disabled', '');
    });
    const submit = el('button', { class: 'cx-btn primary' }, 'Submit');
    submit.addEventListener('click', () => showFeedback());
    root.append(head, note, work, el('div', { class: 'cx-row ar-actions' }, hintBtn, submit), hintBox);
    if (round.kind === 'order' && !answers.order) answers.order = round.steps.map((s) => s.key).join('|');
  }

  function choiceRow(key: string, options: { value: string; label: string }[]): HTMLElement {
    const row = el('div', { class: 'cx-row ar-choices' });
    for (const opt of options) {
      const b = el('button', { class: 'cx-btn small' + (answers[key] === opt.value ? ' selected' : '') }, opt.label);
      b.addEventListener('click', () => {
        answers[key] = opt.value;
        ctx.sfx('click');
        for (const c of Array.from(row.children)) c.classList.remove('selected');
        b.classList.add('selected');
      });
      row.append(b);
    }
    return row;
  }

  function renderWork(w: HTMLElement): void {
    const r = round;
    switch (r.kind) {
      case 'classify':
        for (const it of r.items) {
          w.append(el('div', { class: 'cx-card ar-item' }, el('div', { class: 'ar-text' }, it.text),
            choiceRow(it.key, [{ value: 'safe', label: '✅ Safe' }, { value: 'suspicious', label: '🚩 Suspicious' }])));
        }
        break;
      case 'spot': {
        const table = el('table', { class: 'cx-table' });
        for (const [k, v] of r.artifact.fields) table.append(el('tr', {}, el('th', {}, k), el('td', {}, v)));
        w.append(el('div', { class: 'cx-card' }, el('h4', {}, r.artifact.title), table));
        const chips = el('div', { class: 'ar-chips' });
        for (const c of r.chips) {
          const b = el('button', { class: 'cx-btn small' + (answers[c.key] === 'flag' ? ' selected' : '') }, c.text);
          b.addEventListener('click', () => {
            if (answers[c.key] === 'flag') delete answers[c.key];
            else answers[c.key] = 'flag';
            b.classList.toggle('selected');
            ctx.sfx('click');
          });
          chips.append(b);
        }
        w.append(el('div', { class: 'cx-muted' }, 'Tap every statement that is a real red flag:'), chips);
        break;
      }
      case 'order': {
        const list = el('ol', { class: 'ar-order' });
        const keys = () => (answers.order ?? r.steps.map((s) => s.key).join('|')).split('|');
        const draw = () => {
          list.innerHTML = '';
          const ks = keys();
          ks.forEach((k, i) => {
            const text = r.steps.find((s) => s.key === k)?.text ?? k;
            const up = el('button', { class: 'cx-btn small', 'aria-label': 'Move up' }, '▲');
            const down = el('button', { class: 'cx-btn small', 'aria-label': 'Move down' }, '▼');
            if (i === 0) up.setAttribute('disabled', '');
            if (i === ks.length - 1) down.setAttribute('disabled', '');
            const move = (d: number) => {
              const arr = keys();
              [arr[i], arr[i + d]] = [arr[i + d], arr[i]];
              answers.order = arr.join('|');
              ctx.sfx('click');
              draw();
            };
            up.addEventListener('click', () => move(-1));
            down.addEventListener('click', () => move(1));
            list.append(el('li', { class: 'cx-card ar-step' }, el('span', { class: 'ar-text' }, text), el('span', { class: 'cx-row' }, up, down)));
          });
        };
        draw();
        w.append(el('h4', { class: 'cyan-title ar-sub' }, r.title), list);
        break;
      }
      case 'match':
        for (const t of r.terms) {
          const sel = el('select', { class: 'cx-select' });
          sel.append(el('option', { value: '' }, '— choose a definition —'));
          for (const d of r.definitions) {
            const opt = el('option', { value: d.key }, d.text);
            if (answers[t.key] === d.key) opt.setAttribute('selected', '');
            sel.append(opt);
          }
          sel.addEventListener('change', () => { answers[t.key] = sel.value; });
          w.append(el('div', { class: 'cx-card ar-item' }, el('div', { class: 'ar-term' }, t.term), sel));
        }
        break;
      case 'configure':
        for (const it of r.items) {
          w.append(el('div', { class: 'cx-card ar-item' }, el('div', { class: 'ar-term' }, `⚙️ ${it.setting}`),
            choiceRow(it.key, it.options.map((op) => ({ value: op, label: op })))));
        }
        break;
      case 'triage':
        for (const al of r.alerts) {
          w.append(el('div', { class: 'cx-card ar-item' }, el('div', { class: 'ar-text' }, `🚨 ${al.text}`),
            choiceRow(al.key, [1, 2, 3, 4].map((p) => ({ value: String(p), label: P_LABEL[p] })))));
        }
        break;
      case 'quiz-scenario':
        r.items.forEach((q, i) => {
          w.append(el('div', { class: 'cx-card ar-item' }, el('div', { class: 'ar-text' }, `${i + 1}. ${q.situation}`),
            choiceRow(q.key, q.options.map((op, k) => ({ value: String(k), label: op })))));
        });
        break;
      case 'decode':
        renderDecode(w, r);
        break;
    }
  }

  function renderDecode(w: HTMLElement, r: Extract<Round, { kind: 'decode' }>): void {
    // workbench
    const input = el('textarea', { class: 'cx-textarea ar-bench', rows: '2', placeholder: 'Load a cipher, then apply tools…' }) as HTMLTextAreaElement;
    const out = el('div', { class: 'cx-mono ar-out' }, '');
    const shift = el('input', { type: 'range', min: '0', max: '25', value: '0', class: 'ar-range' }) as HTMLInputElement;
    const shiftLbl = el('span', { class: 'cx-mono' }, 'shift 0');
    const kw = el('input', { class: 'cx-input', placeholder: 'Vigenère keyword', size: '10' }) as HTMLInputElement;
    const apply = (f: (s: string) => string | null) => {
      const res = f(input.value);
      out.textContent = res === null ? '⚠ That input is not valid for this tool.' : res;
      ctx.sfx('click');
    };
    const tool = (label: string, f: (s: string) => string | null) => {
      const b = el('button', { class: 'cx-btn small' }, label);
      b.addEventListener('click', () => apply(f));
      return b;
    };
    shift.addEventListener('input', () => {
      shiftLbl.textContent = `shift ${shift.value}`;
      out.textContent = caesar(input.value, -Number(shift.value));
    });
    const copy = el('button', { class: 'cx-btn small' }, '⤵ Use output as input');
    copy.addEventListener('click', () => { input.value = out.textContent ?? ''; });
    w.append(el('div', { class: 'cx-card' },
      el('h4', {}, '🧰 Decoder workbench'), input,
      el('div', { class: 'cx-row' },
        tool('Base64 decode', fromBase64), tool('Hex decode', fromHex), tool('Reverse', (s) => reverse(s)),
        el('span', { class: 'cx-row' }, 'Caesar', shift, shiftLbl),
        kw, tool('Vigenère decrypt', (s) => vigenere(s, kw.value, true)), copy),
      out,
      el('div', { class: 'cx-muted' }, 'Encoding (Base64, hex) hides nothing; Caesar and Vigenère are historic ciphers — none of these are secure today.')));
    for (const it of r.items) {
      const load = el('button', { class: 'cx-btn small' }, 'Load ⤴');
      load.addEventListener('click', () => { input.value = it.cipher; out.textContent = ''; ctx.sfx('open'); });
      const method = el('select', { class: 'cx-select' });
      method.append(el('option', { value: '' }, '— method —'));
      for (const [m, label] of Object.entries(METHOD_LABELS)) {
        const opt = el('option', { value: m }, label);
        if (answers[`${it.key}:method`] === m) opt.setAttribute('selected', '');
        method.append(opt);
      }
      method.addEventListener('change', () => { answers[`${it.key}:method`] = method.value; });
      const text = el('input', { class: 'cx-input', placeholder: 'NB{...}', value: answers[`${it.key}:text`] ?? '' }) as HTMLInputElement;
      text.addEventListener('input', () => { answers[`${it.key}:text`] = text.value; });
      w.append(el('div', { class: 'cx-card ar-item' },
        el('div', { class: 'cx-mono ar-cipher' }, it.cipher),
        el('div', { class: 'cx-muted' }, `Hint: ${it.hint}`),
        el('div', { class: 'cx-row' }, load, method, text)));
    }
  }

  function showFeedback(): void {
    const s = scoreRound(round, answers);
    const passed = s.score >= o.passScore;
    ctx.sfx(passed ? 'good' : 'bad');
    root.innerHTML = '';
    const fb = el('div', { class: 'cx-feedback' + (passed ? '' : ' fail') },
      el('h3', {}, passed ? `✅ ${o.name}: cleared!` : `❌ ${o.name}: not yet`),
      el('div', { class: 'cx-score' }, `${s.score}/100`),
      el('div', { class: 'cx-bar' }, el('div', { style: `width:${s.score}%` })),
    );
    for (const b of s.breakdown) fb.append(el('div', { class: 'cx-muted' }, `${b.label}: ${b.value}/${b.max}`));
    if (hintsUsed) fb.append(el('div', { class: 'cx-muted' }, `Hints used: ${hintsUsed} (hints never cost points in the arcade)`));
    const list = el('ul', {});
    for (const it of s.items) {
      list.append(el('li', {},
        el('span', { class: it.correct ? 'cx-good' : it.partial ? 'cx-warn' : 'cx-bad' }, it.correct ? '✔ ' : it.partial ? '◐ ' : '✘ '),
        el('strong', {}, it.label), el('br', {}),
        el('span', { class: 'cx-muted' }, `Answer: ${it.expected}. `), it.why));
    }
    fb.append(list, el('p', {}, el('strong', {}, 'Real-world defense: '), o.bank.card.bestPractice));
    const retry = el('button', { class: 'cx-btn' }, '↻ Retry (new variation)');
    retry.addEventListener('click', () => {
      attempt++;
      answers = {};
      round = generateRound({ mechanic: o.mechanic, bankId: o.bank.id, seed: o.seed + attempt * 7919, difficulty: o.difficulty });
      render();
    });
    const cont = el('button', { class: 'cx-btn primary' }, 'Continue');
    cont.addEventListener('click', () => {
      if (finished) return;
      finished = true;
      const result: ChallengeResult = {
        challengeId: `arcade:${o.entryId}`,
        score: s.score,
        passed,
        breakdown: s.breakdown,
        conceptsPracticed: o.conceptIds,
        mistakes: s.items.filter((i) => !i.correct).slice(0, 4).map((i) => `${o.name}: ${i.label} → ${i.expected}`),
        hintsUsed,
      };
      ctx.finish(result);
    });
    root.append(fb, el('div', { class: 'cx-row ar-actions' }, retry, cont));
    root.scrollTop = 0;
  }

  render();
  return () => { root.innerHTML = ''; };
}

/** Exposed for the board's "solution check" debug and tests of the UI wiring. */
export { perfectAnswers };
