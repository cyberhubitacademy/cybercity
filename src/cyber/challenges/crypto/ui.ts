import { el, type ChallengeContext, type ChallengeResult } from '../../types';
import './crypto.css';
import {
  base64Decode, caesar, evaluateCrypto, HASH_CANDIDATES, HASH_MESSAGE, hexDecode,
  hexDiffCount, INTERCEPTED, letterFrequency, MATCH_CONCEPTS, MATCH_DESCRIPTIONS, OUTER_LAYER_OPTIONS,
  reverseText, sha256, SIGNATURE_OPTIONS, type ConceptId, type CryptoAnswers,
} from './logic';

const HINTS = [
  'Look at the alphabet of the intercepted blob: letters, digits, "+", "/" and "=" padding at the end. That is Base64 — an encoding, not encryption. Hit "Base64 decode".',
  'The decoded text still looks like gibberish but keeps spaces and punctuation: a letter-shift (Caesar) cipher. The most common letter in English is E. If "L" is most common here, L − E = 7.',
  'For the hash: paste the exact message into the SHA-256 calculator and compare. The decoys differ by ONE character (0 vs O) and a trailing space. Signatures are verified with the signer\'s PUBLIC key.',
];
const PAID_HINT_COST = 3;

export function mountCrypto(ctx: ChallengeContext, challengeId: string, conceptIds: string[]): () => void {
  let finished = false;
  const cleanups: (() => void)[] = [];

  const build = (): void => {
    ctx.root.innerHTML = '';
    let hintsUsed = 0;
    const answers: CryptoAnswers = { outerLayer: null, flag: '', hashIndex: null, matches: {}, signatureKey: null, hintPenalty: 0 };

    // ---------- Intercepted message ----------
    const intercept = el('div', { class: 'cx-card cr-intercept' },
      el('div', { class: 'cx-row' }, el('span', { class: 'cx-tag pink' }, 'Intercepted · Pink Tide channel'), el('span', { class: 'cx-muted' }, 'Captured by Priya Shah off a rogue pager relay at Neon Pier')),
      el('div', { class: 'cx-mono cr-blob' }, INTERCEPTED),
    );

    // ---------- Playground ----------
    const work = el('textarea', { class: 'cx-textarea cr-work', rows: '4', spellcheck: 'false' }) as HTMLTextAreaElement;
    work.value = INTERCEPTED;
    const status = el('div', { class: 'cx-muted cr-status' }, 'Workbench loaded with the intercepted blob.');
    const freq = el('div', { class: 'cx-mono cr-freq' });
    const shiftLabel = el('span', { class: 'cx-mono' }, 'shift back 0');
    const slider = el('input', { type: 'range', min: '0', max: '25', value: '0', class: 'cr-slider' }) as HTMLInputElement;
    const preview = el('div', { class: 'cx-mono cr-preview' });
    const history: string[] = [];

    const refresh = (): void => {
      const top = letterFrequency(work.value).slice(0, 5);
      freq.textContent = top.length ? 'Top letters: ' + top.map((t) => `${t.letter}×${t.count}`).join('  ') : 'Top letters: —';
      const s = Number(slider.value);
      shiftLabel.textContent = `shift back ${s}`;
      preview.textContent = caesar(work.value, -s);
    };
    const apply = (label: string, fn: (t: string) => string | null): void => {
      const out = fn(work.value);
      if (out === null) {
        status.textContent = `✖ ${label} failed — the input is not valid for this tool.`;
        status.className = 'cx-bad cr-status';
        ctx.sfx('bad');
        return;
      }
      history.push(work.value);
      work.value = out;
      status.textContent = `✔ Applied ${label}.`;
      status.className = 'cx-good cr-status';
      ctx.sfx('type');
      refresh();
    };
    work.addEventListener('input', refresh);
    slider.addEventListener('input', () => { refresh(); ctx.sfx('click'); });

    const toolBtn = (label: string, fn: () => void): HTMLButtonElement => {
      const b = el('button', { class: 'cx-btn small' }, label);
      b.addEventListener('click', fn);
      return b;
    };
    const playground = el('div', { class: 'cx-card' },
      el('h4', {}, '🧪 Cryptography Playground'),
      work,
      el('div', { class: 'cx-row' },
        toolBtn('Base64 decode', () => apply('Base64 decode', base64Decode)),
        toolBtn('Hex decode', () => apply('Hex decode', hexDecode)),
        toolBtn('Reverse', () => apply('Reverse', reverseText)),
        toolBtn('↶ Undo', () => { const prev = history.pop(); if (prev !== undefined) { work.value = prev; refresh(); status.textContent = 'Undone.'; status.className = 'cx-muted cr-status'; } }),
        toolBtn('Reset', () => { history.length = 0; work.value = INTERCEPTED; slider.value = '0'; refresh(); status.textContent = 'Reset to the intercepted blob.'; status.className = 'cx-muted cr-status'; }),
      ),
      status,
      el('div', { class: 'cr-caesar' },
        el('div', { class: 'cx-row' }, el('strong', {}, 'Caesar / ROT'), slider, shiftLabel, toolBtn('Apply shift', () => apply(`Caesar shift back ${slider.value}`, (t) => caesar(t, -Number(slider.value))))),
        el('div', { class: 'cx-muted' }, 'Live preview:'),
        preview,
        freq,
      ),
      el('div', { class: 'cx-hint cr-warn' }, '⚠ Base64 and Caesar are classroom tools. Base64 has no key at all, and Caesar has only 25 keys. Real secrets use vetted algorithms like AES-GCM or ChaCha20-Poly1305.'),
    );

    // ---------- Hash calculator ----------
    const hashIn = el('input', { class: 'cx-input cr-hashin', value: HASH_MESSAGE, spellcheck: 'false' }) as HTMLInputElement;
    const hashOut = el('div', { class: 'cx-mono cr-digest' });
    const candidateRows: { row: HTMLElement; diff: HTMLElement }[] = [];
    const candidates = el('div', { class: 'cx-col' });
    HASH_CANDIDATES.forEach((h, i) => {
      const diff = el('span', { class: 'cx-tag' }, '');
      const row = el('button', { class: 'cx-btn cr-cand' }, el('span', { class: 'cx-mono' }, `#${i + 1}  ${h}`), diff);
      row.addEventListener('click', () => {
        answers.hashIndex = i;
        candidateRows.forEach((c, j) => c.row.classList.toggle('selected', j === i));
        ctx.sfx('click');
      });
      candidateRows.push({ row, diff });
      candidates.append(row);
    });
    const refreshHash = (): void => {
      const d = sha256(hashIn.value);
      hashOut.textContent = d;
      candidateRows.forEach((c, i) => {
        const n = hexDiffCount(d, HASH_CANDIDATES[i]);
        c.diff.textContent = n === 0 ? 'MATCH' : `${n}/64 hex differ`;
        c.diff.className = 'cx-tag ' + (n === 0 ? 'good' : 'warn');
      });
    };
    hashIn.addEventListener('input', refreshHash);
    const hashCard = el('div', { class: 'cx-card' },
      el('h4', {}, '🔏 Integrity check — SHA-256 calculator'),
      el('div', { class: 'cx-muted' }, 'The crew posted three "official" digests for the meeting line. Which one truly matches the message below? Try changing a single character and watch the whole digest change (avalanche effect).'),
      hashIn, el('div', { class: 'cx-muted' }, 'SHA-256 digest:'), hashOut,
      el('div', { class: 'cx-muted' }, 'Pick the matching digest:'), candidates,
    );

    // ---------- Questions ----------
    const choiceGroup = <T extends string>(opts: { id: T; label: string }[], onPick: (id: T) => void): HTMLElement => {
      const wrap = el('div', { class: 'cx-row' });
      const btns: HTMLButtonElement[] = [];
      for (const o of opts) {
        const b = el('button', { class: 'cx-btn small' }, o.label);
        b.addEventListener('click', () => { btns.forEach((x) => x.classList.remove('selected')); b.classList.add('selected'); onPick(o.id); ctx.sfx('click'); });
        btns.push(b);
        wrap.append(b);
      }
      return wrap;
    };
    const flagIn = el('input', { class: 'cx-input', placeholder: 'NB{...}', spellcheck: 'false' }) as HTMLInputElement;
    flagIn.addEventListener('input', () => { answers.flag = flagIn.value; });

    const matchRows = el('div', { class: 'cx-col' });
    for (const c of MATCH_CONCEPTS) {
      const sel = el('select', { class: 'cx-select cr-match' }) as HTMLSelectElement;
      sel.append(el('option', { value: '' }, '— choose a description —'));
      for (const d of MATCH_DESCRIPTIONS) sel.append(el('option', { value: d.id }, d.text));
      sel.addEventListener('change', () => {
        if (sel.value) answers.matches[c.id] = sel.value as ConceptId;
        else delete answers.matches[c.id];
        ctx.sfx('click');
      });
      matchRows.append(el('label', { class: 'cr-matchrow' }, el('strong', {}, c.label), sel));
    }

    const questions = el('div', { class: 'cx-card' },
      el('h4', {}, '📝 Case file'),
      el('div', { class: 'cr-q' }, el('div', {}, '1. What was the OUTER layer of the intercepted blob?'), choiceGroup(OUTER_LAYER_OPTIONS, (id) => { answers.outerLayer = id; })),
      el('div', { class: 'cr-q' }, el('div', {}, '2. Break the inner cipher and submit the flag hidden in the plaintext:'), flagIn),
      el('div', { class: 'cr-q' }, el('div', {}, '3. Match each concept to its description:'), matchRows),
      el('div', { class: 'cr-q' },
        el('div', {}, "4. The note ends with a digital signature claiming to be from The Flamingo. Which key do you use to VERIFY it?"),
        choiceGroup(SIGNATURE_OPTIONS, (id) => { answers.signatureKey = id; })),
    );

    // ---------- Hints + submit ----------
    const hintBox = el('div', { class: 'cx-col' });
    const hintBtn = el('button', { class: 'cx-btn' }, '💡 Hint');
    const updateHintBtn = (): void => {
      const free = hintsUsed < ctx.bonusHints;
      hintBtn.textContent = hintsUsed >= HINTS.length ? '💡 No more hints' : `💡 Hint ${hintsUsed + 1}/${HINTS.length}${free ? ' (free)' : ` (−${PAID_HINT_COST} pts)`}`;
      hintBtn.disabled = hintsUsed >= HINTS.length;
    };
    hintBtn.addEventListener('click', () => {
      if (hintsUsed >= HINTS.length) return;
      if (hintsUsed >= ctx.bonusHints) answers.hintPenalty += PAID_HINT_COST;
      hintBox.append(el('div', { class: 'cx-hint' }, HINTS[hintsUsed]));
      hintsUsed++;
      updateHintBtn();
      ctx.sfx('open');
    });
    updateHintBtn();

    const feedback = el('div', {});
    const submit = el('button', { class: 'cx-btn primary' }, 'Submit findings');
    submit.addEventListener('click', () => {
      const ev = evaluateCrypto(answers);
      const passed = ev.score >= 60;
      ctx.sfx(passed ? 'good' : 'bad');
      submit.disabled = true;
      const result: ChallengeResult = {
        challengeId, score: ev.score, passed, breakdown: ev.breakdown,
        conceptsPracticed: conceptIds, mistakes: ev.mistakes, hintsUsed,
      };
      const retry = el('button', { class: 'cx-btn' }, '↻ Retry');
      retry.addEventListener('click', () => { ctx.sfx('click'); build(); });
      const cont = el('button', { class: 'cx-btn primary' }, 'Continue ▶');
      cont.addEventListener('click', () => { if (finished) return; finished = true; ctx.finish(result); });
      feedback.replaceChildren(el('div', { class: 'cx-feedback' + (passed ? '' : ' fail') },
        el('h3', {}, passed ? '✔ Cipher cracked!' : '✖ Not quite — the Flamingo slipped away'),
        el('div', { class: 'cx-row' }, el('span', { class: 'cx-score ' + (passed ? 'cx-good' : 'cx-bad') }, `${ev.score}`), el('span', { class: 'cx-muted' }, '/ 100  (pass: 60)')),
        el('ul', {}, ...ev.breakdown.map((b) => el('li', {}, `${b.label}: ${b.value}${b.max ? ` / ${b.max}` : ''}`))),
        el('ul', {}, ...ev.notes.map((n) => el('li', { class: n.ok ? 'cx-good' : 'cx-bad' }, (n.ok ? '✔ ' : '✖ ') + n.text))),
        el('p', {}, el('strong', {}, 'Real-world defense: '), 'Protect data in transit with TLS and at rest with AES-GCM, store keys in a key manager (never in code), verify signatures on software and messages, and remember that encoding hides nothing.'),
        el('div', { class: 'cx-row' }, retry, cont),
      ));
      feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    ctx.root.append(el('div', { class: 'cx-col cr-root' },
      intercept,
      el('div', { class: 'cx-grid cr-grid' }, playground, hashCard),
      questions,
      el('div', { class: 'cx-row' }, hintBtn, submit),
      hintBox,
      feedback,
    ));
    refresh();
    refreshHash();
  };

  build();
  return () => { cleanups.forEach((c) => c()); ctx.root.innerHTML = ''; };
}
