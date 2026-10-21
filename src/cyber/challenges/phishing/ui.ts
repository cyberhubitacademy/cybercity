import { el, type ChallengeContext } from '../../types';
import {
  ALL_FLAGS,
  EMAILS,
  FLAG_LABELS,
  RESPONSE_OPTIONS,
  WORST_EMAIL_ID,
  emptyAnswers,
  gradePhishing,
  hostOf,
  isComplete,
  toResult,
  type Email,
  type FlagId,
  type PhishingAnswers,
} from './logic';
import './phishing.css';

const HINTS = [
  'Compare the display name with the real address after the "<". Then compare the From domain letter by letter with the real company domain.',
  'Press "Inspect" on every link. If the destination host differs from the text — or is a raw IP address — that\'s a red flag.',
  'Legit mail rarely combines a deadline with a request for passwords, codes, card numbers or gift cards. Two of the six emails are perfectly normal.',
];

export function mountPhishing(ctx: ChallengeContext, passScore: number): () => void {
  let answers: PhishingAnswers = emptyAnswers();
  let selected = EMAILS[0].id;
  let hintsUsed = 0;
  let hintsShown = 0;
  let finished = false;
  const inspected = new Set<string>();

  const root = el('div', { class: 'ph-root cx-col' });
  ctx.root.append(root);

  function render(): void {
    root.replaceChildren(workspace(), hintsBlock(), responseBlock(), submitRow());
  }

  function workspace(): HTMLElement {
    const list = el('div', { class: 'cx-col ph-inbox' });
    list.append(el('div', { class: 'cx-tag cyan' }, `Inbox — carla@coralcafe.nb (${EMAILS.length})`));
    for (const e of EMAILS) {
      const v = answers.verdicts[e.id];
      const card = el(
        'div',
        { class: `cx-card ph-item${selected === e.id ? ' active' : ''}` },
        el('div', { class: 'cx-row ph-item-top' }, el('strong', {}, e.fromName), el('span', { class: 'cx-muted cx-mono' }, e.time)),
        el('div', { class: 'ph-subject' }, e.subject),
        v ? el('span', { class: `cx-tag ${v === 'phishing' ? 'bad' : 'good'}` }, v === 'phishing' ? '⚑ Phishing' : '✓ Legit') : el('span', { class: 'cx-tag' }, 'Unreviewed'),
      );
      card.addEventListener('click', () => {
        selected = e.id;
        ctx.sfx('open');
        render();
      });
      list.append(card);
    }
    const email = EMAILS.find((x) => x.id === selected) ?? EMAILS[0];
    return el('div', { class: 'cx-split' }, list, reader(email));
  }

  function reader(e: Email): HTMLElement {
    const authTag = (name: string, val: string) =>
      el('span', { class: `cx-tag ${val === 'pass' ? 'good' : val === 'none' ? 'warn' : 'bad'}` }, `${name}: ${val}`);
    const header = el(
      'div',
      { class: 'ph-headers cx-mono' },
      el('div', {}, el('span', { class: 'cx-muted' }, 'From: '), el('strong', {}, e.fromName), ` <${e.fromAddress}>`),
      e.replyTo ? el('div', {}, el('span', { class: 'cx-muted' }, 'Reply-To: '), e.replyTo) : null,
      el('div', {}, el('span', { class: 'cx-muted' }, 'To: '), e.to),
      el('div', {}, el('span', { class: 'cx-muted' }, 'Subject: '), e.subject),
      el('div', { class: 'cx-row' }, el('span', { class: 'cx-muted' }, 'Auth results: '), authTag('SPF', e.spf), authTag('DKIM', e.dkim)),
    );
    const body = el('div', { class: 'ph-body' }, ...e.body.map((p) => el('p', {}, p)));
    const links = e.links.map((l, i) => {
      const key = `${e.id}#${i}`;
      const anchor = el('span', { class: 'ph-link', title: `Real destination: ${l.href}` }, l.text);
      const btn = el('button', { class: 'cx-btn small' }, inspected.has(key) ? 'Hide' : 'Inspect');
      btn.addEventListener('click', () => {
        if (inspected.has(key)) inspected.delete(key);
        else inspected.add(key);
        ctx.sfx('click');
        render();
      });
      return el(
        'div',
        { class: 'cx-col ph-linkbox' },
        el('div', { class: 'cx-row' }, anchor, btn),
        inspected.has(key)
          ? el('div', { class: 'cx-mono ph-href' }, 'href → ', el('strong', {}, l.href), el('span', { class: 'cx-muted' }, `  (host: ${hostOf(l.href)})`))
          : null,
      );
    });
    const atts = e.attachments.length
      ? el('div', { class: 'cx-row' }, el('span', { class: 'cx-muted' }, 'Attachments:'), ...e.attachments.map((a) => el('span', { class: 'cx-tag warn cx-mono' }, '📎 ' + a)))
      : null;

    const v = answers.verdicts[e.id];
    const mk = (label: string, verdict: 'legit' | 'phishing') => {
      const b = el('button', { class: `cx-btn${v === verdict ? ' selected' : ''}` }, label);
      b.addEventListener('click', () => {
        answers.verdicts[e.id] = verdict;
        if (verdict === 'legit') answers.flags[e.id] = [];
        ctx.sfx('click');
        render();
      });
      return b;
    };
    const verdictRow = el('div', { class: 'cx-row' }, el('strong', {}, 'Your verdict:'), mk('✓ Legit', 'legit'), mk('⚑ Phishing', 'phishing'));

    let flagBox: HTMLElement | null = null;
    if (v === 'phishing') {
      const chosen = answers.flags[e.id] ?? [];
      flagBox = el('div', { class: 'cx-col' }, el('div', { class: 'cx-muted' }, 'Tag the evidence you can see (click to toggle):'));
      const chips = el('div', { class: 'cx-row' });
      for (const f of ALL_FLAGS) {
        const on = chosen.includes(f);
        const chip = el('button', { class: `cx-btn small ph-flag${on ? ' selected' : ''}` }, (on ? '🚩 ' : '') + FLAG_LABELS[f]);
        chip.addEventListener('click', () => {
          const cur = answers.flags[e.id] ?? [];
          answers.flags[e.id] = cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f as FlagId];
          ctx.sfx('click');
          render();
        });
        chips.append(chip);
      }
      flagBox.append(chips);
    }

    return el('div', { class: 'cx-card ph-reader cx-col' }, header, body, ...links, atts, verdictRow, flagBox);
  }

  function hintsBlock(): HTMLElement {
    const box = el('div', { class: 'cx-col' });
    for (let i = 0; i < hintsShown; i++) box.append(el('div', { class: 'cx-hint' }, `Hint ${i + 1}: ${HINTS[i]}`));
    return box;
  }

  function responseBlock(): HTMLElement {
    const worst = EMAILS.find((e) => e.id === WORST_EMAIL_ID);
    const box = el(
      'div',
      { class: 'cx-card cx-col' },
      el('h4', {}, `Final call: what should Carla do about "${worst?.subject ?? ''}"?`),
    );
    for (const o of RESPONSE_OPTIONS) {
      const b = el('button', { class: `cx-btn ph-resp${answers.response === o.id ? ' selected' : ''}` }, o.label);
      b.addEventListener('click', () => {
        answers.response = o.id;
        ctx.sfx('click');
        render();
      });
      box.append(b);
    }
    return box;
  }

  function submitRow(): HTMLElement {
    const reviewed = EMAILS.filter((e) => answers.verdicts[e.id]).length;
    const hintBtn = el(
      'button',
      { class: 'cx-btn' },
      hintsShown >= HINTS.length ? 'No more hints' : `💡 Hint ${hintsShown + 1}/${HINTS.length}${hintsShown < ctx.bonusHints ? ' (free)' : ''}`,
    );
    hintBtn.toggleAttribute('disabled', hintsShown >= HINTS.length);
    hintBtn.addEventListener('click', () => {
      if (hintsShown >= HINTS.length) return;
      if (hintsShown >= ctx.bonusHints) hintsUsed++;
      hintsShown++;
      ctx.sfx('open');
      render();
    });
    const submit = el('button', { class: 'cx-btn primary' }, 'Submit findings');
    submit.toggleAttribute('disabled', !isComplete(answers));
    submit.addEventListener('click', showFeedback);
    return el('div', { class: 'cx-row' }, el('span', { class: 'cx-muted' }, `Reviewed ${reviewed}/${EMAILS.length}`), hintBtn, submit);
  }

  function showFeedback(): void {
    const g = gradePhishing(answers, passScore);
    ctx.sfx(g.passed ? 'good' : 'bad');
    const fb = el(
      'div',
      { class: `cx-feedback${g.passed ? '' : ' fail'}` },
      el('h3', { class: g.passed ? 'cx-good' : 'cx-bad' }, g.passed ? 'Phish fried! Inbox secured.' : 'The Pink Tide slipped one past you.'),
      el('div', { class: 'cx-score' }, `${g.score}/100`),
      ...g.breakdown.map((b) =>
        el('div', { class: 'cx-col' }, el('div', {}, `${b.label}: ${b.value}/${b.max}`), el('div', { class: 'cx-bar' }, el('div', { style: `width:${(b.value / b.max) * 100}%` }))),
      ),
    );
    const list = el('ul', {});
    for (const r of g.reviews) {
      const verdictTxt = r.email.phishing ? 'PHISHING' : 'LEGIT';
      const li = el(
        'li',
        {},
        el('strong', { class: r.correctVerdict ? 'cx-good' : 'cx-bad' }, `${r.correctVerdict ? '✓' : '✗'} ${r.email.subject} — ${verdictTxt}. `),
        r.email.explanation,
      );
      if (r.flagsMissed.length) li.append(el('div', { class: 'cx-warn' }, 'Missed flags: ' + r.flagsMissed.map((f) => FLAG_LABELS[f]).join(', ')));
      if (r.flagsWrong.length) li.append(el('div', { class: 'cx-bad' }, 'Not present here: ' + r.flagsWrong.map((f) => FLAG_LABELS[f]).join(', ')));
      list.append(li);
    }
    fb.append(el('h4', {}, 'Email by email'), list);
    const resp = RESPONSE_OPTIONS.find((o) => o.id === answers.response);
    if (resp) fb.append(el('p', { class: g.responseCorrect ? 'cx-good' : 'cx-bad' }, 'Response: ' + resp.explain));
    fb.append(
      el(
        'p',
        { class: 'cx-muted' },
        'In the real world: most breaches start with one click. Checking sender domains, hovering links and reporting (not replying) stops credential theft, ransomware drops and invoice fraud before they spread.',
      ),
    );
    const retry = el('button', { class: 'cx-btn' }, '↺ Retry');
    retry.addEventListener('click', () => {
      answers = emptyAnswers();
      inspected.clear();
      selected = EMAILS[0].id;
      ctx.sfx('click');
      render();
    });
    const cont = el('button', { class: 'cx-btn primary' }, 'Continue ▶');
    cont.addEventListener('click', () => {
      if (finished) return;
      finished = true;
      ctx.finish(toResult(g, hintsUsed));
    });
    fb.append(el('div', { class: 'cx-row' }, retry, cont));
    root.replaceChildren(fb);
    fb.scrollIntoView({ block: 'start' });
  }

  render();
  return () => {
    root.remove();
    ctx.root.replaceChildren();
  };
}
