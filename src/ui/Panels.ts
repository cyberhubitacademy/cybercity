import { el, TOPIC_LABELS, Topic } from '../cyber/types';
import type { ConceptView, LearningHubView, QualityLevel, SettingsView } from './types';

// Reusable panel bodies shared by the pause menu and the main-menu screens.

export const CONTROLS: { keys: string[]; action: string }[] = [
  { keys: ['W', 'A', 'S', 'D'], action: 'Move / drive' },
  { keys: ['Mouse'], action: 'Look around (click the game to lock the mouse)' },
  { keys: ['Wheel'], action: 'Camera zoom' },
  { keys: ['Shift'], action: 'Sprint' },
  { keys: ['Space'], action: 'Jump / handbrake' },
  { keys: ['E'], action: 'Interact · enter / exit vehicle' },
  { keys: ['F'], action: 'Enter / exit vehicle' },
  { keys: ['R'], action: 'Next radio station (in a vehicle)' },
  { keys: ['H'], action: 'Horn' },
  { keys: ['M'], action: 'City map' },
  { keys: ['Tab'], action: 'Missions & status' },
  { keys: ['I'], action: 'Inventory' },
  { keys: ['J'], action: 'Learning journal' },
  { keys: ['Esc'], action: 'Pause menu' },
];

export function controlsPanel(): HTMLElement {
  const grid = el('div', { class: 'cc-controls' });
  for (const c of CONTROLS) {
    const keys = el('div', { class: 'keys' });
    for (const k of c.keys) keys.append(el('span', { class: 'cc-key' }, k));
    grid.append(el('div', { class: 'cc-control' }, keys, el('span', {}, c.action)));
  }
  return grid;
}

function slider(label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onChange: (v: number) => void): HTMLElement {
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
  const val = el('span', { class: 'val' }, fmt(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    val.textContent = fmt(v);
    onChange(v);
  });
  return el('div', { class: 'cc-set' }, el('label', {}, label), input, val);
}

function toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const sw = el('button', { class: `cc-switch${value ? ' on' : ''}`, role: 'switch', 'aria-checked': String(value), 'aria-label': label });
  let on = value;
  sw.addEventListener('click', () => {
    on = !on;
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', String(on));
    onChange(on);
  });
  return el('div', { class: 'cc-set toggle' }, el('label', {}, label), sw);
}

/** Settings form. Calls onChange with a fresh copy after every edit. */
export function settingsPanel(initial: SettingsView, onChange: (s: SettingsView) => void, onResetSave?: () => void, confirm?: (text: string) => Promise<boolean>): HTMLElement {
  const s: SettingsView = { ...initial };
  const emit = () => onChange({ ...s });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const audio = el('div', { class: 'cc-set-grid' },
    slider('Master volume', s.master, 0, 1, 0.05, pct, (v) => { s.master = v; emit(); }),
    slider('Music / radio', s.music, 0, 1, 0.05, pct, (v) => { s.music = v; emit(); }),
    slider('Sound effects', s.sfx, 0, 1, 0.05, pct, (v) => { s.sfx = v; emit(); }),
    slider('Ambience', s.ambient, 0, 1, 0.05, pct, (v) => { s.ambient = v; emit(); }),
    slider('Dialogue voice', s.voice, 0, 1, 0.05, pct, (v) => { s.voice = v; emit(); }),
  );
  const qualities: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
  const qSel = el('select', { class: 'cx-select', 'aria-label': 'Graphics quality' });
  for (const q of qualities) {
    const o = el('option', { value: q }, q[0].toUpperCase() + q.slice(1));
    if (q === s.quality) o.selected = true;
    qSel.append(o);
  }
  qSel.addEventListener('change', () => { s.quality = qSel.value as QualityLevel; emit(); });
  const gfx = el('div', { class: 'cc-set-grid' },
    el('div', { class: 'cc-set toggle' }, el('label', {}, 'Graphics quality (applies on reload)'), qSel),
    toggle('Neon bloom glow', s.bloom, (v) => { s.bloom = v; emit(); }),
    toggle('Shadows', s.shadows, (v) => { s.shadows = v; emit(); }),
    toggle('Reduced motion', s.reducedMotion, (v) => { s.reducedMotion = v; emit(); }),
  );
  const play = el('div', { class: 'cc-set-grid' },
    slider('Mouse sensitivity', s.mouseSensitivity, 0.2, 3, 0.1, (v) => `${v.toFixed(1)}×`, (v) => { s.mouseSensitivity = v; emit(); }),
    toggle('Invert camera Y', s.invertY, (v) => { s.invertY = v; emit(); }),
    toggle('Learning tips & hints', s.showHints, (v) => { s.showHints = v; emit(); }),
    toggle('Subtitles', s.subtitles, (v) => { s.subtitles = v; emit(); }),
    toggle('Spoken dialogue (browser voice)', s.voiceTTS, (v) => { s.voiceTTS = v; emit(); }),
  );
  const root = el('div', { class: 'cx-col' },
    el('h3', { class: 'cyan-title' }, 'Audio'), audio,
    el('h3', { class: 'cyan-title' }, 'Graphics'), gfx,
    el('h3', { class: 'cyan-title' }, 'Gameplay'), play,
    el('h3', { class: 'cyan-title' }, 'Controls'), controlsPanel(),
  );
  if (onResetSave) {
    const btn = el('button', { class: 'cx-btn danger' }, 'Reset saved progress…');
    btn.addEventListener('click', async () => {
      const ok = confirm ? await confirm('Erase ALL saved progress? This cannot be undone.') : false;
      if (ok) {
        onResetSave();
        btn.textContent = 'Progress erased';
        btn.disabled = true;
      }
    });
    root.append(el('h3', { class: 'cyan-title' }, 'Save data'), el('p', { class: 'cx-muted' }, 'Progress is stored only in this browser (local storage). No passwords or personal data are saved.'), btn);
  }
  return root;
}

function conceptCard(c: ConceptView): HTMLElement {
  const card = el('div', { class: `cx-card cc-concept${c.unlocked ? '' : ' locked'}` });
  const mastery = c.mastery ?? 0;
  card.append(
    el('div', { class: 'cx-row', style: 'justify-content:space-between' },
      el('h4', {}, c.unlocked ? c.title : '??? Locked concept'),
      el('span', { class: 'cx-tag cyan' }, TOPIC_LABELS[c.topic] ?? c.topic)),
  );
  if (c.unlocked) {
    card.append(
      el('div', { class: 'def' }, c.definition),
      el('div', { class: 'cx-bar', style: 'margin-top:8px' }, el('div', { style: `width:${Math.round(mastery)}%` })),
      el('div', { class: 'more' },
        el('p', {}, el('b', {}, 'Why it matters: '), c.whyItMatters),
        el('p', {}, el('b', {}, 'Example: '), c.example),
        el('p', {}, el('b', { class: 'cx-good' }, 'Best practice: '), c.bestPractice)),
    );
    card.addEventListener('click', () => card.classList.toggle('open'));
  } else {
    card.append(el('div', { class: 'def' }, 'Play missions and find data shards to unlock this concept card.'));
  }
  return card;
}

/** Learning hub: mastery bars, practice list and concept cards grouped by topic. */
export function learningHubPanel(v: LearningHubView): HTMLElement {
  const root = el('div', { class: 'cx-col' });
  const unlocked = v.concepts.filter((c) => c.unlocked).length;
  root.append(el('p', { class: 'cx-muted' }, `Concept cards unlocked: ${unlocked} / ${v.concepts.length}. Click a card to expand it.`));

  const mast = el('div', { class: 'cx-grid' });
  for (const m of v.mastery) {
    mast.append(el('div', { class: 'cx-card' },
      el('div', { class: 'cx-row', style: 'justify-content:space-between' }, el('b', {}, m.label), el('span', { class: 'cx-mono' }, `${Math.round(m.percent)}%`)),
      el('div', { class: 'cx-bar', style: 'margin-top:6px' }, el('div', { style: `width:${Math.round(m.percent)}%` }))));
  }
  root.append(el('h3', { class: 'cyan-title' }, 'Mastery'), mast);

  if (v.practice.length) {
    const list = el('div', { class: 'cx-grid' });
    for (const p of v.practice) {
      const btn = el('button', { class: 'cx-btn small primary' }, 'Practice');
      if (!v.onPractice) btn.disabled = true;
      btn.addEventListener('click', () => v.onPractice?.(p.id));
      list.append(el('div', { class: 'cx-card' },
        el('h4', {}, p.title),
        el('div', { class: 'cx-row', style: 'justify-content:space-between' },
          el('span', { class: 'cx-tag' }, TOPIC_LABELS[p.topic as Topic] ?? p.topic),
          el('span', { class: 'cx-mono cx-muted' }, p.best === null ? 'not played' : `best ${p.best}%`), btn)));
    }
    root.append(el('h3', { class: 'cyan-title' }, 'Training lab (replay challenges)'), list);
  }

  const byTopic = new Map<string, ConceptView[]>();
  for (const c of v.concepts) {
    const list = byTopic.get(c.topic) ?? [];
    list.push(c);
    byTopic.set(c.topic, list);
  }
  for (const [topic, list] of byTopic) {
    const grid = el('div', { class: 'cx-grid' });
    for (const c of list) grid.append(conceptCard(c));
    root.append(el('h3', { class: 'cyan-title' }, TOPIC_LABELS[topic as Topic] ?? topic), grid);
  }
  return root;
}
