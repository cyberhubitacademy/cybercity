import { el, type ChallengeContext } from '../../types';
import { DISCLOSURE, FIXES, HINTS, PACKAGES, freshSupply, scoreSupply, type SupplyInput, type Verdict } from './logic';
import { Runner, chooser, meter, step } from '../web/s2kit';
import './supplychain.css';

const PASS = 65;
const VERDICTS: { id: Verdict; label: string }[] = [
  { id: 'safe', label: '✅ Safe' },
  { id: 'risky', label: '⚠ Risky — harden' },
  { id: 'malicious', label: '☠ Malicious' },
];

export function mountSupply(ctx: ChallengeContext): () => void {
  let st: SupplyInput = freshSupply();
  let open = PACKAGES[0].id;
  const root = el('div', { class: 's2-root cx-col sc-root' });
  ctx.root.append(root);
  const runner = new Runner(ctx, HINTS, () => render());

  function tree(): HTMLElement {
    const t = el('div', { class: 'sc-tree' }, el('div', { class: 'sc-rootnode' }, '📦 sunset-shield/cybercity-app'));
    for (const p of PACKAGES) {
      const v = st.verdicts[p.id];
      const b = el('button', { class: `sc-node ${v ?? ''}${open === p.id ? ' open' : ''}` }, el('span', {}, `├─ ${p.name}`), el('span', { class: 'cx-mono cx-muted' }, p.version));
      b.onclick = () => { open = p.id; ctx.sfx('click'); render(); };
      t.append(b);
    }
    return t;
  }

  function detail(): HTMLElement {
    const p = PACKAGES.find((x) => x.id === open)!;
    const card = el('div', { class: 'cx-card sc-detail' }, el('h4', {}, `${p.name} @ ${p.version}`));
    for (const f of p.facts) card.append(el('div', { class: `sc-fact${f.alarm ? ' alarm' : ''}` }, el('span', { class: 'cx-muted' }, f.label), el('b', {}, f.value)));
    if (p.script) card.append(el('div', { class: 'cx-muted' }, 'Install script'), el('div', { class: 's2-code bad' }, p.script));
    card.append(chooser(VERDICTS, st.verdicts[p.id] ? [st.verdicts[p.id]!] : [], false, (n) => {
      st.verdicts[p.id] = n[0] as Verdict | undefined;
      ctx.sfx(n[0] === 'malicious' ? 'alert' : 'click');
      const next = PACKAGES.find((x) => !st.verdicts[x.id]);
      if (next) open = next.id;
      render();
    }, runner.finished));
    return card;
  }

  function render(): void {
    root.innerHTML = '';
    const done = PACKAGES.filter((p) => st.verdicts[p.id]).length;
    const submit = el('button', { class: 'cx-btn primary' }, 'Quarantine & ship the clean build');
    submit.disabled = runner.finished;
    submit.onclick = () => {
      runner.finished = true;
      render();
      root.append(runner.feedback(scoreSupply(st), {
        id: 'supplychain-1', passScore: PASS, concepts: ['supplychain-typosquat', 'supplychain-takeover', 'supplychain-provenance', 'supplychain-sbom', 'supplychain-disclosure'],
        defense: 'Treat dependencies as code you ship: pin and review them, verify signatures and provenance, block install scripts by default, pull only from approved registries, keep an SBOM, and report malicious packages through coordinated disclosure.',
        onRetry: () => { st = freshSupply(); open = PACKAGES[0].id; runner.finished = false; render(); },
      }));
    };
    root.append(
      step(1, 'Triage the dependency tree (SBOM)', 'Open each package and judge it: safe, risky (needs hardening) or malicious.'),
      meter(done / PACKAGES.length, 'Packages reviewed'),
      el('div', { class: 'sc-layout' }, tree(), detail()),
      step(2, 'Harden the build pipeline', 'Pick every control that would have stopped this — and avoid the shortcuts.'),
      chooser(FIXES.map((f) => ({ id: f.id, label: f.label })), st.fixes, true, (n) => { st.fixes = n; ctx.sfx('click'); render(); }, runner.finished),
      step(3, 'Do the right thing', 'Other teams use these packages too.'),
      chooser(DISCLOSURE.map((d) => ({ id: d.id, label: d.label })), st.disclosure ? [st.disclosure] : [], false, (n) => { st.disclosure = n[0] ?? null; ctx.sfx('click'); render(); }, runner.finished),
      runner.hintsBlock(),
      el('div', { class: 'cx-row' }, submit),
    );
  }

  render();
  return () => { root.remove(); };
}
