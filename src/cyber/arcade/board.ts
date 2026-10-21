import { el } from '../types';
import { MECHANICS, type MechanicId } from './types';
import { ARCADE_CATEGORIES, ARCADE_ENTRIES, type ArcadeEntry } from './catalog';
import './arcade.css';

// The "CYBER ARCADE" browser: category sidebar, search, filters and entry
// cards. Only the current category / search results are rendered (paged),
// so 1,000+ entries stay fast.

export interface BoardOptions {
  progress: Record<string, { best: number }>;
  onPlay: (entryId: string) => void;
}

const PAGE = 60;
const mechIcon = (m: MechanicId) => MECHANICS.find((x) => x.id === m)?.icon ?? '🎮';

export function mountArcadeBoard(root: HTMLElement, opts: BoardOptions): () => void {
  let category = 'all';
  let query = '';
  let mech: MechanicId | 'any' = 'any';
  let diff = 0;
  let unplayedOnly = false;
  let limit = PAGE;

  const played = () => ARCADE_ENTRIES.filter((e) => opts.progress[e.id]).length;
  const wrap = el('div', { class: 'ar-board' });
  const side = el('nav', { class: 'ar-side', 'aria-label': 'Arcade categories' });
  const main = el('div', { class: 'ar-main' });
  const header = el('div', { class: 'ar-board-head' });
  const grid = el('div', { class: 'ar-grid' });
  const more = el('button', { class: 'cx-btn ar-more' }, 'Show more');
  more.addEventListener('click', () => { limit += PAGE; drawGrid(); });

  const search = el('input', { class: 'cx-input ar-search', placeholder: 'Search 1,000+ challenges… (e.g. "deepfake", "vault")', 'aria-label': 'Search challenges' }) as HTMLInputElement;
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); limit = PAGE; drawGrid(); });
  const mechSel = el('select', { class: 'cx-select', 'aria-label': 'Filter by mechanic' });
  mechSel.append(el('option', { value: 'any' }, 'All mechanics'));
  for (const m of MECHANICS) mechSel.append(el('option', { value: m.id }, `${m.icon} ${m.label}`));
  mechSel.addEventListener('change', () => { mech = mechSel.value as MechanicId | 'any'; limit = PAGE; drawGrid(); });
  const diffSel = el('select', { class: 'cx-select', 'aria-label': 'Filter by difficulty' });
  for (const [v, l] of [['0', 'Any difficulty'], ['1', '★ Rookie'], ['2', '★★ Analyst'], ['3', '★★★ Expert']]) diffSel.append(el('option', { value: v }, l));
  diffSel.addEventListener('change', () => { diff = Number(diffSel.value); limit = PAGE; drawGrid(); });
  const unplayed = el('label', { class: 'cx-row ar-check' }, el('input', { type: 'checkbox' }), 'Unplayed only');
  unplayed.querySelector('input')?.addEventListener('change', (e) => { unplayedOnly = (e.target as HTMLInputElement).checked; limit = PAGE; drawGrid(); });
  const random = el('button', { class: 'cx-btn primary' }, '🎲 Random challenge');
  random.addEventListener('click', () => {
    const list = filtered();
    const pick = (list.length ? list : ARCADE_ENTRIES)[Math.floor(Math.random() * (list.length || ARCADE_ENTRIES.length))];
    opts.onPlay(pick.id);
  });

  function filtered(): ArcadeEntry[] {
    return ARCADE_ENTRIES.filter((e) =>
      (category === 'all' || e.categoryIds.includes(category)) &&
      (!query || e.name.toLowerCase().includes(query)) &&
      (mech === 'any' || e.mechanic === mech) &&
      (!diff || e.difficulty === diff) &&
      (!unplayedOnly || !opts.progress[e.id]));
  }

  function drawSide(): void {
    side.innerHTML = '';
    const mk = (id: string, label: string, icon: string, count: number, color: string) => {
      const b = el('button', { class: 'ar-cat' + (category === id ? ' active' : ''), style: `--c:${color}` }, el('span', {}, `${icon} ${label}`), el('span', { class: 'ar-count' }, String(count)));
      b.addEventListener('click', () => { category = id; limit = PAGE; drawSide(); drawGrid(); });
      side.append(b);
    };
    mk('all', 'All challenges', '🕹️', ARCADE_ENTRIES.length, '#ff2fa0');
    for (const c of ARCADE_CATEGORIES) mk(c.id, c.title, c.icon, ARCADE_ENTRIES.filter((e) => e.categoryIds.includes(c.id)).length, c.color);
  }

  function drawGrid(): void {
    const list = filtered();
    const cat = ARCADE_CATEGORIES.find((c) => c.id === category);
    header.innerHTML = '';
    header.append(
      el('div', {},
        el('h2', { class: 'neon-title ar-title' }, 'CYBER ARCADE'),
        el('div', { class: 'cx-muted' }, cat ? `${cat.icon} ${cat.title} — ${cat.blurb}` : `${ARCADE_ENTRIES.length} challenges in ${ARCADE_CATEGORIES.length} categories. Each is a seeded variation of one of ${MECHANICS.length} mechanics.`)),
      el('div', { class: 'ar-progress' }, el('div', { class: 'cx-score' }, `${played()} / ${ARCADE_ENTRIES.length}`), el('div', { class: 'cx-muted' }, 'played')),
    );
    grid.innerHTML = '';
    for (const e of list.slice(0, limit)) {
      const best = opts.progress[e.id]?.best;
      const card = el('button', { class: 'ar-card' + (best !== undefined ? ' played' : ''), title: `${e.name} — ${MECHANICS.find((m) => m.id === e.mechanic)?.label}` },
        el('div', { class: 'ar-card-top' }, el('span', { class: 'ar-icon' }, mechIcon(e.mechanic)), el('span', { class: 'ar-stars' }, '★'.repeat(e.difficulty))),
        el('div', { class: 'ar-card-name' }, e.name),
        el('div', { class: 'ar-card-foot' },
          el('span', { class: 'cx-muted' }, MECHANICS.find((m) => m.id === e.mechanic)?.label ?? ''),
          best !== undefined ? el('span', { class: 'cx-tag ' + (best >= 60 ? 'good' : 'warn') }, `best ${best}`) : null));
      card.addEventListener('click', () => opts.onPlay(e.id));
      grid.append(card);
    }
    if (!list.length) grid.append(el('div', { class: 'cx-muted' }, 'No challenges match those filters.'));
    more.style.display = list.length > limit ? '' : 'none';
    more.textContent = `Show more (${list.length - limit} left)`;
  }

  main.append(header, el('div', { class: 'cx-row ar-filters' }, search, mechSel, diffSel, unplayed, random), grid, more);
  wrap.append(side, main);
  root.append(wrap);
  drawSide();
  drawGrid();
  return () => { wrap.remove(); };
}
