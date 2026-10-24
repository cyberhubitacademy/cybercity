// Inline SVG illustrations for the tutorial coach cards and How to Play.
// All markup here is constant (no user data), so innerHTML is safe.

const INK = '#0b0a24';
const KEY = '#2a2450';
const KEY_HI = '#ffd23f';

type Row = { x: number; y: number; w: number; label: string }[];

/** A compact keyboard with the given keys highlighted. */
export function keyboardSvg(highlight: string[], width = 360): string {
  const hi = new Set(highlight.map((k) => k.toUpperCase()));
  const u = 30, gap = 4;
  const row = (labels: string[], x0: number, y: number, wide: Record<string, number> = {}): Row => {
    let x = x0;
    return labels.map((label) => {
      const w = (wide[label] ?? 1) * u + ((wide[label] ?? 1) - 1) * gap;
      const k = { x, y, w, label };
      x += w + gap;
      return k;
    });
  };
  const keys: Row = [
    ...row(['ESC', '1', '2', '3', '4', '5'], 4, 4, { ESC: 1.4 }),
    ...row(['TAB', 'Q', 'W', 'E', 'R', 'T', 'Y'], 4, 4 + u + gap, { TAB: 1.5 }),
    ...row(['CAPS', 'A', 'S', 'D', 'F', 'G', 'H', 'J'], 4, 4 + 2 * (u + gap), { CAPS: 1.8 }),
    ...row(['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'], 4, 4 + 3 * (u + gap), { SHIFT: 2.3 }),
    ...row(['CTRL', 'SPACE'], 4, 4 + 4 * (u + gap), { CTRL: 1.5, SPACE: 6 }),
  ];
  const maxX = Math.max(...keys.map((k) => k.x + k.w)) + 4;
  const h = 4 + 5 * (u + gap);
  const parts = keys.map((k) => {
    const on = hi.has(k.label);
    return `<g><rect x="${k.x}" y="${k.y}" width="${k.w}" height="${u}" rx="5" fill="${on ? KEY_HI : KEY}" stroke="${on ? '#fff3c4' : '#4a4280'}" stroke-width="${on ? 2 : 1}"/>`
      + `<text x="${k.x + k.w / 2}" y="${k.y + u / 2 + 4}" text-anchor="middle" font-family="Oswald,Rajdhani,sans-serif" font-weight="700" font-size="${k.label.length > 2 ? 10 : 13}" fill="${on ? INK : '#cfc8ff'}">${k.label}</text></g>`;
  });
  return `<svg class="cc-ill" viewBox="0 0 ${maxX} ${h}" width="${width}" role="img" aria-label="Keyboard: ${[...hi].join(', ')}">${parts.join('')}</svg>`;
}

/** Mouse with the body (look) or a button highlighted. */
export function mouseSvg(mode: 'move' | 'left' | 'wheel' = 'move'): string {
  const hiLeft = mode === 'left';
  const hiWheel = mode === 'wheel';
  const arrows = mode === 'move'
    ? `<g stroke="${KEY_HI}" stroke-width="4" fill="none" stroke-linecap="round"><path d="M18 60 h-14 m6 -6 l-6 6 6 6"/><path d="M102 60 h14 m-6 -6 l6 6 -6 6"/><path d="M60 14 v-10 m-6 6 l6 -6 6 6"/></g>`
    : '';
  return `<svg class="cc-ill" viewBox="0 0 120 120" width="110" role="img" aria-label="Mouse">${arrows}
    <rect x="34" y="22" width="52" height="84" rx="26" fill="${KEY}" stroke="#8f86d8" stroke-width="2"/>
    <path d="M34 50 v-2 a26 26 0 0 1 26 -26 v28 z" fill="${hiLeft ? KEY_HI : '#3a3370'}"/>
    <path d="M86 50 v-2 a26 26 0 0 0 -26 -26 v28 z" fill="#3a3370"/>
    <rect x="56" y="30" width="8" height="16" rx="4" fill="${hiWheel ? KEY_HI : '#8f86d8'}"/></svg>`;
}

/** Yellow GTA-style marker cylinder. */
export function markerSvg(): string {
  return `<svg class="cc-ill" viewBox="0 0 120 110" width="120" role="img" aria-label="Yellow mission marker">
    <ellipse cx="60" cy="90" rx="40" ry="12" fill="rgba(255,210,63,0.35)" stroke="#ffd23f" stroke-width="3"/>
    <path d="M20 90 V30 a40 12 0 0 0 80 0 V90" fill="rgba(255,210,63,0.18)"/>
    <ellipse cx="60" cy="30" rx="40" ry="12" fill="none" stroke="rgba(255,210,63,0.6)" stroke-width="2"/>
    <circle cx="60" cy="70" r="9" fill="#fff"/><rect x="54" y="78" width="12" height="18" rx="5" fill="#fff"/></svg>`;
}

export function terminalSvg(): string {
  return `<svg class="cc-ill" viewBox="0 0 120 110" width="120" role="img" aria-label="Glowing cyber terminal">
    <rect x="22" y="14" width="76" height="52" rx="6" fill="#0c2a3a" stroke="#19e6ff" stroke-width="3"/>
    <g fill="#19e6ff" font-family="JetBrains Mono,monospace" font-size="9"><text x="30" y="32">&gt; scan</text><text x="30" y="46">&gt; inspect</text><text x="30" y="60">&gt; _</text></g>
    <rect x="40" y="66" width="40" height="8" fill="#241a4a"/><rect x="26" y="74" width="68" height="26" rx="4" fill="#241a4a" stroke="#ff2fa0" stroke-width="2"/></svg>`;
}

export function talkSvg(): string {
  return `<svg class="cc-ill" viewBox="0 0 140 110" width="130" role="img" aria-label="Talk to a character">
    <circle cx="40" cy="44" r="16" fill="#c98b5e"/><rect x="22" y="62" width="36" height="40" rx="12" fill="#1fb5c9"/>
    <path d="M70 18 h56 a8 8 0 0 1 8 8 v26 a8 8 0 0 1 -8 8 h-38 l-12 12 v-12 h-6 a8 8 0 0 1 -8 -8 v-26 a8 8 0 0 1 8 -8z" fill="#fffdf4" stroke="#111" stroke-width="3"/>
    <text x="98" y="44" text-anchor="middle" font-family="Bangers,Impact,sans-serif" font-size="18" fill="#111">HEY!</text></svg>`;
}

export function carSvg(): string {
  return `<svg class="cc-ill" viewBox="0 0 160 90" width="150" role="img" aria-label="Car">
    <path d="M14 60 l8 -20 q6 -12 20 -14 h46 q14 0 24 12 l14 14 h12 q8 0 8 8 v6 h-132 z" fill="#ff2fa0" stroke="#111" stroke-width="3"/>
    <path d="M48 30 h36 q10 0 16 10 h-58 z" fill="#16202e"/>
    <circle cx="44" cy="70" r="12" fill="#141418" stroke="#d9dde6" stroke-width="4"/><circle cx="118" cy="70" r="12" fill="#141418" stroke="#d9dde6" stroke-width="4"/></svg>`;
}

export function mapSvg(): string {
  return `<svg class="cc-ill" viewBox="0 0 160 100" width="150" role="img" aria-label="City map">
    <rect x="4" y="4" width="152" height="92" rx="8" fill="#2b2f34" stroke="#111" stroke-width="3"/>
    <rect x="112" y="4" width="44" height="92" fill="#36607f"/>
    <g stroke="#8c9197" stroke-width="7"><path d="M4 36 H112"/><path d="M4 70 H112"/><path d="M40 4 V96"/><path d="M84 4 V96"/></g>
    <path d="M40 70 H84 V36" stroke="#b05cff" stroke-width="4" fill="none"/>
    <circle cx="84" cy="36" r="7" fill="#f0c850" stroke="#000" stroke-width="2"/>
    <path d="M40 76 l-6 6 h12 z" transform="rotate(-90 40 70)" fill="#fff" stroke="#000"/></svg>`;
}

export function arcadeSvg(): string {
  return `<svg class="cc-ill" viewBox="0 0 110 120" width="100" role="img" aria-label="Arcade cabinet">
    <path d="M24 8 h62 l6 14 v90 h-74 v-90z" fill="#2a0f5a" stroke="#ff2fa0" stroke-width="3"/>
    <rect x="30" y="14" width="50" height="12" fill="#ffd23f"/><text x="55" y="24" text-anchor="middle" font-family="Bangers,Impact" font-size="10" fill="#111">ARCADE</text>
    <rect x="30" y="32" width="50" height="38" rx="3" fill="#0c2a3a" stroke="#19e6ff" stroke-width="2"/>
    <rect x="24" y="76" width="62" height="12" fill="#19e6ff"/><circle cx="44" cy="82" r="4" fill="#ff2fa0"/><circle cx="66" cy="82" r="4" fill="#ffd23f"/></svg>`;
}

/** Numbered step strip (e.g. how a mission works). */
export function stepsSvg(steps: string[]): string {
  const w = 150;
  const parts = steps.map((s, i) => {
    const x = 10 + i * w;
    return `<g><circle cx="${x + 22}" cy="30" r="20" fill="${['#ff2fa0', '#19e6ff', '#ffd23f', '#3dffb0', '#b14dff'][i % 5]}" stroke="#111" stroke-width="3"/>`
      + `<text x="${x + 22}" y="37" text-anchor="middle" font-family="Oswald,Impact" font-weight="700" font-size="20" fill="#111">${i + 1}</text>`
      + (i < steps.length - 1 ? `<path d="M${x + 48} 30 H${x + w - 6}" stroke="#ffffff55" stroke-width="3" stroke-dasharray="6 5"/>` : '')
      + `<foreignObject x="${x - 8}" y="56" width="${w - 6}" height="70"><div xmlns="http://www.w3.org/1999/xhtml" class="cc-step-label">${s}</div></foreignObject></g>`;
  });
  return `<svg class="cc-ill cc-steps" viewBox="0 0 ${steps.length * w + 10} 130" width="100%" role="img">${parts.join('')}</svg>`;
}

export const ILLUSTRATIONS: Record<string, () => string> = {
  mouse: () => mouseSvg('move'),
  wasd: () => keyboardSvg(['W', 'A', 'S', 'D']),
  shift: () => keyboardSvg(['SHIFT', 'W', 'SPACE']),
  marker: markerSvg,
  talk: () => `<div class="cc-ill-row">${talkSvg()}${keyboardSvg(['E'], 200)}</div>`,
  terminal: () => `<div class="cc-ill-row">${terminalSvg()}${keyboardSvg(['E'], 200)}</div>`,
  map: () => `<div class="cc-ill-row">${mapSvg()}${keyboardSvg(['M'], 200)}</div>`,
  car: () => `<div class="cc-ill-row">${carSvg()}${keyboardSvg(['E', 'F'], 200)}</div>`,
  drive: () => keyboardSvg(['W', 'A', 'S', 'D', 'SPACE', 'R', 'H']),
  tab: () => keyboardSvg(['TAB', 'ESC']),
  arcade: () => `<div class="cc-ill-row">${arcadeSvg()}${keyboardSvg(['G'], 200)}</div>`,
};
