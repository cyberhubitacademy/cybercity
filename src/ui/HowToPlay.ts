import { el } from '../cyber/types';
import { drawBlipIcon } from './Minimap';
import { keycap, rich } from './markup';
import { carSvg, keyboardSvg, markerSvg, mouseSvg, terminalSvg } from './Illustrations';
import type { BlipKind } from './types';

// Illustrated "How to Play" guide (main menu, pause menu, end of tutorial).

function card(title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return el('section', { class: 'cc-howto-card' }, el('h3', {}, title), ...children);
}

function svgBox(svg: string, cls = 'cc-howto-ill'): HTMLElement {
  const d = el('div', { class: cls });
  d.innerHTML = svg; // constant SVG from Illustrations.ts
  return d;
}

function blipIcon(kind: BlipKind, label?: string, color?: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = 30 * dpr;
  c.height = 30 * dpr;
  c.style.width = '30px';
  c.style.height = '30px';
  const g = c.getContext('2d');
  if (g) {
    g.scale(dpr, dpr);
    drawBlipIcon(g, { x: 0, z: 0, kind, label, color }, 15, 15, 9, 0);
  }
  return c;
}

const STEP_COLORS = ['#ff2fa0', '#19e6ff', '#ffd23f', '#3dffb0', '#b14dff'];

/** Numbered, colored step list (readable at any card width). */
function steps(items: string[]): HTMLElement {
  const ol = el('ol', { class: 'cc-howto-steps' });
  items.forEach((t, i) => ol.append(el('li', {}, el('b', { style: `background:${STEP_COLORS[i % STEP_COLORS.length]}` }, String(i + 1)), rich(el('span'), t))));
  return ol;
}

function keyRow(keys: string[], text: string): HTMLElement {
  const k = el('div', { class: 'keys' });
  for (const key of keys) k.append(keycap(key));
  return el('div', { class: 'cc-howto-keyrow' }, k, rich(el('span'), text));
}

export function howToPlayPanel(): HTMLElement {
  const legend = el('div', { class: 'cc-howto-legend' });
  const items: [BlipKind, string, string?, string?][] = [
    ['objective', '[y]Your destination[/y]: go here next'],
    ['giver', '[b]Person with a mission[/b]: the letter is their name', 'M', '#5aa9e6'],
    ['terminal', 'Cyber terminal: hacking workstation'],
    ['target', '[r]Target / enemy[/r] (e.g. the Pink Tide van)'],
    ['shop', 'Byte Bazaar shop'],
    ['shard', 'Hidden data shard: collect all 12'],
    ['objective', '[p]Your own waypoint[/p] (set it on the map)', 'W', '#b05cff'],
  ];
  for (const [kind, text, label, color] of items) legend.append(el('div', { class: 'cc-howto-legend-row' }, blipIcon(kind, label, color), rich(el('span'), text)));
  legend.append(el('div', { class: 'cc-howto-legend-row' }, el('span', { class: 'cc-howto-arrow' }, '➤'), rich(el('span'), 'White arrow: [b]you[/b]. Edge arrows point to things off the radar.')));

  const colors = el('div', { class: 'cc-howto-colors' },
    rich(el('div', { class: 'cc-howto-sample' }), 'Go to [y]Coral Café[/y].'),
    rich(el('div', { class: 'cc-howto-sample' }), 'Talk to [b]Carla Reyes[/b].'),
    rich(el('div', { class: 'cc-howto-sample' }), 'Tail the [r]Pink Tide van[/r].'),
    rich(el('div', { class: 'cc-howto-note' }), '[y]Yellow[/y] = a place to go · [b]Blue[/b] = a friend or something to use · [r]Red[/r] = the bad guys. Exactly like GTA.'));

  return el('div', { class: 'cc-howto' },
    el('p', { class: 'cc-howto-lead' }, 'Everything you need in two minutes. You can reopen this any time from the pause menu (Esc).'),
    el('div', { class: 'cc-howto-grid' },
      card('1 · Move & look',
        svgBox(keyboardSvg(['W', 'A', 'S', 'D', 'SHIFT', 'SPACE', 'E'])),
        el('div', { class: 'cc-howto-row' }, svgBox(mouseSvg('move'), 'cc-howto-ill small'),
          el('div', {},
            keyRow(['W', 'A', 'S', 'D'], 'Walk (forward is where the camera looks)'),
            keyRow(['Shift'], 'Sprint ([b]blue bar[/b] = stamina)'),
            keyRow(['Space'], 'Jump'),
            keyRow(['Mouse'], 'Look around · click the game first'),
            keyRow(['Wheel'], 'Zoom the camera')))),
      card('2 · Talk, use & drive',
        el('div', { class: 'cc-howto-row' }, svgBox(terminalSvg(), 'cc-howto-ill small'), svgBox(carSvg(), 'cc-howto-ill small')),
        keyRow(['E'], 'Talk to people · use terminals · get in / out of cars'),
        keyRow(['W', 'S'], 'Gas / brake & reverse'),
        keyRow(['Space'], 'Handbrake (drift!)'),
        keyRow(['R'], 'Next radio station'),
        keyRow(['H'], 'Horn')),
      card('3 · Read the radar (bottom-left)', legend),
      card('4 · Objective colors', svgBox(markerSvg(), 'cc-howto-ill small'), colors),
      card('5 · How a mission works',
        steps(['Find a person with a [b]letter above their head[/b] (blue letter on the radar)', 'Talk with ~E~, read the briefing, press [y]Accept[/y]', 'Follow the [y]yellow marker[/y] and the route on the radar', 'Solve the cyber challenge at the glowing terminal', '[y]MISSION PASSED[/y]: XP, cash and respect']),
        rich(el('p', {}), 'Failed? No problem: missions restart and challenges can be retried as often as you like. Press ~Tab~ to see every mission.')),
      card('6 · How cyber challenges work',
        steps(['Read the scenario at the top: who is under attack?', 'Inspect the evidence: click emails, logs, files, rules', 'Stuck? Press [y]Hint[/y]. Hints never fail you', 'Submit your answer', 'Read the feedback, then retry or continue']),
        rich(el('p', {}), 'Every hack is a [b]safe simulation[/b] on fictional data. You learn real defensive skills: phishing, networks, firewalls, forensics, crypto and more.')),
      card('7 · Menus & extras',
        keyRow(['M'], 'City map: click to set a [p]waypoint[/p]'),
        keyRow(['Tab'], 'Missions, skills, journal'),
        keyRow(['G'], 'Cyber Arcade: 1,291 quick challenges'),
        keyRow(['I'], 'Inventory'),
        keyRow(['J'], 'Learning journal'),
        keyRow(['Esc'], 'Pause · settings · How to Play')),
      card('8 · Saving',
        rich(el('p', {}), 'The game [g]saves automatically[/g] after missions, purchases and every 30 seconds.'),
        rich(el('p', {}), '[y]Continue[/y] on the main menu picks up exactly where you left off. [y]New Game[/y] starts over (your old save is backed up once).'),
        rich(el('p', {}), 'On Chrome / Edge, [y]Save File[/y] keeps a copy on your computer too.'))));
}
