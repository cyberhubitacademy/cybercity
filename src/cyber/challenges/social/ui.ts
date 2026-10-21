import { el, type ChallengeContext } from '../../types';
import {
  SCENARIOS,
  emptySocialAnswers,
  gradeSocial,
  isSocialComplete,
  needsFollowUp,
  toSocialResult,
  type Channel,
  type SocialAnswers,
} from './logic';
import './social.css';

const HINTS = [
  'Watch for pressure: rank ("I\'m the CEO"), deadlines ("boarding in five minutes") and secrecy are levers to make you skip process.',
  'When in doubt, verify through a channel YOU already trust — a directory number, a vendor file — never one the requester gives you.',
  'Some requests are genuine. The best answer protects the bank AND still helps the real employee.',
];

const CHANNEL_ICON: Record<Channel, string> = { phone: '📞', chat: '💬', 'in-person': '🚪', email: '✉️' };

export function mountSocial(ctx: ChallengeContext, passScore: number): () => void {
  let answers: SocialAnswers = emptySocialAnswers();
  let idx = 0;
  let hintsUsed = 0;
  let hintsShown = 0;
  let finished = false;

  const root = el('div', { class: 'so-root cx-col' });
  ctx.root.append(root);

  function render(): void {
    root.replaceChildren(queue(), scenarioCard(), hints(), controls());
  }

  function queue(): HTMLElement {
    const row = el('div', { class: 'cx-row so-queue' }, el('span', { class: 'cx-tag pink' }, 'Palmetto Bank Help Desk — Line 1'));
    SCENARIOS.forEach((s, i) => {
      const done = answers.choices[s.id] !== undefined && (!needsFollowUp(s, answers) || answers.followUps[s.id] !== undefined);
      const b = el('button', { class: `cx-btn small${i === idx ? ' selected' : ''}` }, `${CHANNEL_ICON[s.channel]} ${i + 1}${done ? ' ✓' : ''}`);
      b.addEventListener('click', () => {
        idx = i;
        ctx.sfx('click');
        render();
      });
      row.append(b);
    });
    return row;
  }

  function scenarioCard(): HTMLElement {
    const s = SCENARIOS[idx];
    const card = el(
      'div',
      { class: 'cx-card so-card cx-col' },
      el(
        'div',
        { class: 'cx-row' },
        el('span', { class: 'so-icon' }, CHANNEL_ICON[s.channel]),
        el('div', { class: 'cx-col so-who' }, el('strong', {}, s.requester), el('span', { class: 'cx-muted' }, `${s.channel.toUpperCase()} · ${s.claim}`)),
      ),
      el('div', { class: 'so-bubble' }, s.message),
      el('h4', {}, 'How do you handle it?'),
    );
    for (const o of s.options) {
      const b = el('button', { class: `cx-btn so-opt${answers.choices[s.id] === o.id ? ' selected' : ''}` }, o.label);
      b.addEventListener('click', () => {
        answers.choices[s.id] = o.id;
        delete answers.followUps[s.id];
        ctx.sfx('click');
        render();
      });
      card.append(b);
    }
    if (needsFollowUp(s, answers) && s.followUp) {
      card.append(el('h4', { class: 'so-follow' }, '↳ ' + s.followUp.question));
      for (const o of s.followUp.options) {
        const b = el('button', { class: `cx-btn so-opt${answers.followUps[s.id] === o.id ? ' selected' : ''}` }, o.label);
        b.addEventListener('click', () => {
          answers.followUps[s.id] = o.id;
          ctx.sfx('click');
          render();
        });
        card.append(b);
      }
    }
    return card;
  }

  function hints(): HTMLElement {
    const box = el('div', { class: 'cx-col' });
    for (let i = 0; i < hintsShown; i++) box.append(el('div', { class: 'cx-hint' }, `Hint ${i + 1}: ${HINTS[i]}`));
    return box;
  }

  function controls(): HTMLElement {
    const prev = el('button', { class: 'cx-btn' }, '◀ Prev');
    prev.toggleAttribute('disabled', idx === 0);
    prev.addEventListener('click', () => {
      idx = Math.max(0, idx - 1);
      render();
    });
    const next = el('button', { class: 'cx-btn' }, 'Next call ▶');
    next.toggleAttribute('disabled', idx === SCENARIOS.length - 1);
    next.addEventListener('click', () => {
      idx = Math.min(SCENARIOS.length - 1, idx + 1);
      ctx.sfx('open');
      render();
    });
    const hint = el('button', { class: 'cx-btn' }, hintsShown >= HINTS.length ? 'No more hints' : `💡 Hint ${hintsShown + 1}/${HINTS.length}${hintsShown < ctx.bonusHints ? ' (free)' : ''}`);
    hint.toggleAttribute('disabled', hintsShown >= HINTS.length);
    hint.addEventListener('click', () => {
      if (hintsShown >= HINTS.length) return;
      if (hintsShown >= ctx.bonusHints) hintsUsed++;
      hintsShown++;
      ctx.sfx('open');
      render();
    });
    const submit = el('button', { class: 'cx-btn primary' }, 'End shift & submit');
    submit.toggleAttribute('disabled', !isSocialComplete(answers));
    submit.addEventListener('click', showFeedback);
    return el('div', { class: 'cx-row' }, prev, next, hint, submit);
  }

  function showFeedback(): void {
    const g = gradeSocial(answers, passScore);
    ctx.sfx(g.passed ? 'good' : 'bad');
    const fb = el(
      'div',
      { class: `cx-feedback${g.passed ? '' : ' fail'}` },
      el('h3', { class: g.passed ? 'cx-good' : 'cx-bad' }, g.passed ? 'Smooth operator. Nobody talked their way past you.' : 'The Flamingo\'s crew sweet-talked their way in.'),
      el('div', { class: 'cx-score' }, `${g.score}/100`),
      ...g.breakdown.map((b) =>
        el('div', { class: 'cx-col' }, el('div', {}, `${b.label}: ${b.value}/${b.max}`), el('div', { class: 'cx-bar' }, el('div', { style: `width:${b.max ? (b.value / b.max) * 100 : 0}%` }))),
      ),
    );
    const list = el('ul', {});
    for (const r of g.reviews) {
      const ok = r.points === r.max;
      const li = el(
        'li',
        {},
        el('strong', { class: ok ? 'cx-good' : r.points > 0 ? 'cx-warn' : 'cx-bad' }, `${CHANNEL_ICON[r.scenario.channel]} ${r.scenario.requester} — ${r.scenario.tactic} (${r.points}/${r.max})`),
        el('div', {}, r.chosen ? r.chosen.explain : 'No decision.'),
      );
      if (r.follow) li.append(el('div', { class: 'cx-muted' }, '↳ ' + r.follow.explain));
      li.append(el('div', { class: 'cx-muted' }, '★ ' + r.scenario.lesson));
      list.append(li);
    }
    fb.append(
      list,
      el('p', { class: 'cx-muted' }, 'In the real world: attackers target people because people can be persuaded. Verification procedures, payment controls and badge discipline turn "seems legit" into "proved legit".'),
    );
    const retry = el('button', { class: 'cx-btn' }, '↺ Retry');
    retry.addEventListener('click', () => {
      answers = emptySocialAnswers();
      idx = 0;
      ctx.sfx('click');
      render();
    });
    const cont = el('button', { class: 'cx-btn primary' }, 'Continue ▶');
    cont.addEventListener('click', () => {
      if (finished) return;
      finished = true;
      ctx.finish(toSocialResult(g, hintsUsed));
    });
    fb.append(el('div', { class: 'cx-row' }, retry, cont));
    root.replaceChildren(fb);
  }

  render();
  return () => {
    root.remove();
    ctx.root.replaceChildren();
  };
}
