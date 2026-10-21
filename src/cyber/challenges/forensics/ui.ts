import { el, type ChallengeContext, type ChallengeResult } from '../../types';
import './forensics.css';
import {
  ACCOUNT_OPTIONS, ARTIFACTS, artifactById, evaluateForensics, EXFIL_OPTIONS, HANDLING_OPTIONS,
  VECTOR_OPTIONS, type ForensicsAnswers,
} from './logic';

const HINTS = [
  'Before analysis, protect the evidence: a write-blocked forensic image plus matching hashes, and a chain-of-custody entry for every hand-off.',
  'Three logs end in "Z" — that means UTC. Neon Bay runs on UTC−5, so 14:02Z happened at 09:02 local. Convert before you sort!',
  'Not every log is part of the attack. Scheduled AV updates, patch reboots and an IT admin with an approved ticket are routine noise. The data left the building in the biggest outbound flow.',
];
const PAID_HINT_COST = 3;

export function mountForensics(ctx: ChallengeContext, challengeId: string, conceptIds: string[]): () => void {
  let finished = false;

  const build = (): void => {
    ctx.root.innerHTML = '';
    let hintsUsed = 0;
    const answers: ForensicsAnswers = { handling: null, timeline: [], vector: null, account: null, exfil: null, hintPenalty: 0 };

    const choiceGroup = <T extends string>(opts: readonly { id: T; label: string }[], onPick: (id: T) => void, vertical = false): HTMLElement => {
      const wrap = el('div', { class: vertical ? 'cx-col' : 'cx-row' });
      const btns: HTMLButtonElement[] = [];
      for (const o of opts) {
        const b = el('button', { class: 'cx-btn small fo-choice' }, o.label);
        b.addEventListener('click', () => { btns.forEach((x) => x.classList.remove('selected')); b.classList.add('selected'); onPick(o.id); ctx.sfx('click'); });
        btns.push(b);
        wrap.append(b);
      }
      return wrap;
    };

    // ---------- Step 1 ----------
    const step1 = el('div', { class: 'cx-card' },
      el('h4', {}, 'Step 1 · Secure the evidence'),
      el('div', { class: 'cx-muted' }, "Palmetto Bank's workstation PB-WS-017 just arrived at the lab in an evidence bag. What do you do FIRST?"),
      choiceGroup(HANDLING_OPTIONS, (id) => { answers.handling = id; }, true),
    );

    // ---------- Step 2: locker + timeline ----------
    const locker = el('div', { class: 'cx-col fo-locker' });
    const timeline = el('ol', { class: 'fo-timeline' });
    const renderBoard = (): void => {
      locker.replaceChildren(...ARTIFACTS.map((a) => {
        const placed = answers.timeline.includes(a.id);
        const isUtc = a.utcOffsetHours === 0;
        const btn = el('button', { class: 'cx-btn small' + (placed ? ' selected' : '') }, placed ? '✓ On timeline' : '＋ Add to timeline');
        btn.addEventListener('click', () => {
          if (placed) answers.timeline = answers.timeline.filter((x) => x !== a.id);
          else answers.timeline.push(a.id);
          ctx.sfx('click');
          renderBoard();
        });
        return el('div', { class: 'fo-artifact' + (placed ? ' placed' : '') },
          el('div', { class: 'cx-row' },
            el('strong', {}, a.title),
            el('span', { class: 'cx-tag ' + (isUtc ? 'warn' : 'cyan') }, isUtc ? 'UTC' : 'Local UTC−5'),
            el('span', { class: 'cx-muted fo-src' }, a.source)),
          el('div', { class: 'cx-mono fo-raw' }, a.raw),
          btn,
        );
      }));
      if (answers.timeline.length === 0) {
        timeline.replaceChildren(el('li', { class: 'cx-muted fo-empty' }, 'Add artifacts from the locker, then order them earliest → latest.'));
        return;
      }
      timeline.replaceChildren(...answers.timeline.map((id, i) => {
        const a = artifactById(id);
        const mk = (label: string, title: string, fn: () => void, disabled: boolean): HTMLButtonElement => {
          const b = el('button', { class: 'cx-btn small', title }, label);
          b.disabled = disabled;
          b.addEventListener('click', () => { fn(); ctx.sfx('click'); renderBoard(); });
          return b;
        };
        const swap = (j: number): void => { const t = answers.timeline; [t[i], t[j]] = [t[j], t[i]]; };
        return el('li', { class: 'fo-slot' },
          el('div', { class: 'fo-slot-body' },
            el('strong', {}, a.title),
            el('span', { class: 'cx-mono cx-muted' }, `${a.timestamp}${a.utcOffsetHours === 0 ? 'Z' : ''}`)),
          el('div', { class: 'cx-row fo-slot-btns' },
            mk('▲', 'Move earlier', () => swap(i - 1), i === 0),
            mk('▼', 'Move later', () => swap(i + 1), i === answers.timeline.length - 1),
            mk('✕', 'Remove', () => { answers.timeline.splice(i, 1); }, false)),
        );
      }));
    };
    const step2 = el('div', { class: 'cx-card' },
      el('h4', {}, 'Step 2 · Reconstruct the timeline'),
      el('div', { class: 'cx-muted' }, 'Put only the attack-related artifacts on the timeline, earliest first. Watch the time zones — the lab clock reads Neon Bay local time (UTC−5).'),
      el('div', { class: 'cx-split fo-board' },
        el('div', { class: 'cx-col' }, el('div', { class: 'cx-tag pink' }, '🗄 Evidence locker'), el('div', { class: 'cx-scroll' }, locker)),
        el('div', { class: 'cx-col' }, el('div', { class: 'cx-tag cyan' }, '⏱ Attack timeline'), timeline),
      ),
    );

    // ---------- Step 3 ----------
    const step3 = el('div', { class: 'cx-card' },
      el('h4', {}, 'Step 3 · Conclusions for the report'),
      el('div', { class: 'fo-q' }, el('div', {}, 'Initial access vector:'), choiceGroup(VECTOR_OPTIONS, (id) => { answers.vector = id; })),
      el('div', { class: 'fo-q' }, el('div', {}, 'Compromised account:'), choiceGroup(ACCOUNT_OPTIONS.map((a) => ({ id: a, label: a })), (id) => { answers.account = id; })),
      el('div', { class: 'fo-q' }, el('div', {}, 'Exfiltration time (Neon Bay local):'), choiceGroup(EXFIL_OPTIONS.map((a) => ({ id: a, label: a })), (id) => { answers.exfil = id; })),
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
    const submit = el('button', { class: 'cx-btn primary' }, 'File forensic report');
    submit.addEventListener('click', () => {
      const ev = evaluateForensics(answers);
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
        el('h3', {}, passed ? '✔ Case reconstructed — Dr. Okafor is impressed' : '✖ The defense attorney would shred this report'),
        el('div', { class: 'cx-row' }, el('span', { class: 'cx-score ' + (passed ? 'cx-good' : 'cx-bad') }, `${ev.score}`), el('span', { class: 'cx-muted' }, '/ 100  (pass: 60)')),
        el('ul', {}, ...ev.breakdown.map((b) => el('li', {}, `${b.label}: ${b.value}${b.max ? ` / ${b.max}` : ''}`))),
        el('ul', {}, ...ev.notes.map((n) => el('li', { class: n.ok ? 'cx-good' : 'cx-bad' }, (n.ok ? '✔ ' : '✖ ') + n.text))),
        el('details', { class: 'fo-details' }, el('summary', {}, 'Artifact-by-artifact explanations'),
          el('ul', {}, ...ARTIFACTS.map((a) => el('li', {}, el('strong', {}, a.title + ': '), a.explanation)))),
        el('p', {}, el('strong', {}, 'Real-world defense: '), 'Sync every system to NTP and log in UTC, forward logs to a central SIEM, keep retention long enough for investigations, and practice evidence handling before you need it.'),
        el('div', { class: 'cx-row' }, retry, cont),
      ));
      feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    ctx.root.append(el('div', { class: 'cx-col fo-root' },
      step1, step2, step3,
      el('div', { class: 'cx-row' }, hintBtn, submit),
      hintBox, feedback,
    ));
    renderBoard();
  };

  build();
  return () => { ctx.root.innerHTML = ''; };
}
