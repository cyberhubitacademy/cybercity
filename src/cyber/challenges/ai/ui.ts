import { el, type ChallengeContext } from '../../types';
import { CUES, HINTS, IMAGES, IMAGE_LABELS, MITIGATIONS, PROCEDURES, SNIPPETS, freshAi, scoreAi, type AiInput } from './logic';
import { Runner, chooser, step } from '../web/s2kit';
import './ai.css';

const PASS = 65;

export function mountAi(ctx: ChallengeContext): () => void {
  let st: AiInput = freshAi();
  const root = el('div', { class: 's2-root cx-col ai-root' });
  ctx.root.append(root);
  const runner = new Runner(ctx, HINTS, () => render());
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  function callScreen(): HTMLElement {
    return el('div', { class: 'ai-call' },
      el('div', { class: 'ai-face' }, el('div', { class: 'ai-scan' }), el('span', {}, 'MV'), el('div', { class: 'ai-rec' }, '● LIVE 00:41')),
      el('div', { class: 'cx-col' }, el('b', {}, '“Marisol Vance” — video call'), el('span', { class: 'cx-muted' }, 'Tap every observation that is a real red flag.')));
  }

  function render(): void {
    root.innerHTML = '';
    const cues = el('div', { class: 'ai-cues' });
    for (const c of CUES) {
      const on = st.cues.includes(c.id);
      const b = el('button', { class: `cx-btn small s2-choice${on ? ' selected' : ''}` }, `${on ? '🚩 ' : ''}${c.text}`);
      b.disabled = runner.finished;
      b.onclick = () => { st.cues = toggle(st.cues, c.id); ctx.sfx('click'); render(); };
      cues.append(b);
    }
    const snippets = el('div', { class: 'cx-col' });
    for (const s of SNIPPETS) {
      const on = st.injected.includes(s.id);
      const card = el('div', { class: `cx-card ai-snip${on ? ' flagged' : ''}` },
        el('div', { class: 'cx-row' }, el('span', { class: 'cx-tag cyan' }, s.source), el('button', { class: `cx-btn small${on ? ' selected' : ''}` }, on ? '⚠ Injected' : 'Flag as injection')),
        el('div', { class: 's2-code' }, s.text));
      const btn = card.querySelector('button')!;
      btn.disabled = runner.finished;
      btn.onclick = () => { st.injected = toggle(st.injected, s.id); ctx.sfx(on ? 'click' : 'alert'); render(); };
      snippets.append(card);
    }
    const images = el('div', { class: 'ai-images' });
    for (const im of IMAGES) {
      images.append(el('div', { class: 'cx-card ai-img' },
        el('div', { class: 'ai-thumb' }, '🖼'), el('b', {}, im.title), el('div', { class: 's2-code' }, im.meta),
        chooser(IMAGE_LABELS, st.images[im.id] ? [st.images[im.id]!] : [], false, (n) => { st.images[im.id] = n[0] as AiInput['images'][string]; ctx.sfx('click'); render(); }, runner.finished)));
    }
    const submit = el('button', { class: 'cx-btn primary' }, 'Submit to NOVA review board');
    submit.disabled = runner.finished;
    submit.onclick = () => {
      runner.finished = true;
      render();
      root.append(runner.feedback(scoreAi(st), {
        id: 'ai-1', passScore: PASS, concepts: ['ai-deepfakes', 'ai-verification', 'ai-prompt-injection', 'ai-agent-guardrails', 'ai-provenance'],
        defense: 'Assume voices and faces can be faked: verify money and data requests out-of-band with dual approval and code words. For AI assistants, treat every retrieved document as untrusted data, limit tools and permissions, require humans for sensitive actions, and log everything.',
        onRetry: () => { st = freshAi(); runner.finished = false; render(); },
      }));
    };
    root.append(
      step(1, 'The call', 'Marisol is "calling" with an urgent wire request.'),
      callScreen(), cues,
      step(2, 'What do you do?', 'Choose the procedure that is safe even if the call is perfect.'),
      chooser(PROCEDURES.map((p) => ({ id: p.id, label: p.label })), st.procedure ? [st.procedure] : [], false, (n) => { st.procedure = n[0] ?? null; ctx.sfx('click'); render(); }, runner.finished),
      step(3, 'NOVA’s poisoned document', 'NOVA summarized a vendor PDF. Flag every passage that gives the AI instructions.'),
      snippets,
      step(4, 'Guardrails', 'Select every control that should protect NOVA (and avoid the traps).'),
      chooser(MITIGATIONS.map((m) => ({ id: m.id, label: m.label })), st.mitigations, true, (n) => { st.mitigations = n; ctx.sfx('click'); render(); }, runner.finished),
      step(5, 'Real or synthetic?', 'Read each image’s content credentials. Label what you can actually prove.'),
      images,
      runner.hintsBlock(),
      el('div', { class: 'cx-row' }, submit),
    );
  }

  render();
  return () => { root.remove(); };
}
