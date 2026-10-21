import { el } from '../cyber/types';
import { BLIP_COLORS, MAP_H, MAP_W, MAP_X0, MAP_Z0, districtLabels, drawBlipIcon, mapBase, placeList } from './Minimap';
import type { Blip, MinimapState } from './types';

// Full-screen city map with legend and click-to-set waypoint.

export function buildMapScreen(state: MinimapState, onWaypoint: (x: number, z: number) => void, onClear: () => void, close: () => void): HTMLElement {
  const root = el('div', { class: 'cc-map' });
  const stage = el('div', { class: 'cc-map-stage' });
  const canvas = el('canvas');
  stage.append(canvas);
  let waypoint = state.waypoint ? { ...state.waypoint } : null;
  const SCALE = 2; // backing-store pixels per meter
  canvas.width = MAP_W * SCALE;
  canvas.height = MAP_H * SCALE;
  canvas.style.aspectRatio = `${MAP_W} / ${MAP_H}`;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const X = (x: number) => (x - MAP_X0) * SCALE;
  const Z = (z: number) => (z - MAP_Z0) * SCALE;
  let raf = 0;

  const draw = () => {
    const t = performance.now() / 1000;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(mapBase(), 0, 0, canvas.width, canvas.height);
    // district labels
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const d of districtLabels()) {
      g.font = `italic 700 ${15 * SCALE}px Pacifico, cursive`;
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(5,3,20,0.85)';
      g.strokeText(d.name, X(d.x), Z(d.z));
      g.fillStyle = '#ffffff';
      g.fillText(d.name, X(d.x), Z(d.z));
    }
    for (const p of placeList()) {
      g.font = `700 ${7 * SCALE}px Rajdhani, sans-serif`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(5,3,20,0.9)';
      g.strokeText(p.name, X(p.x), Z(p.z) + 13 * SCALE);
      g.fillStyle = '#ffe9a8';
      g.fillText(p.name, X(p.x), Z(p.z) + 13 * SCALE);
    }
    const blips: Blip[] = [...state.blips];
    if (waypoint) blips.push({ x: waypoint.x, z: waypoint.z, kind: 'objective', color: '#b14dff' });
    for (const b of blips) drawBlipIcon(g, b, X(b.x), Z(b.z), (b.kind === 'vehicle' ? 4 : 7) * SCALE, t);
    // player
    g.save();
    g.translate(X(state.x), Z(state.z));
    g.rotate(Math.atan2(Math.cos(state.heading), Math.sin(state.heading)));
    g.fillStyle = '#fff';
    g.strokeStyle = '#0b0a24';
    g.lineWidth = 3;
    g.shadowColor = '#19e6ff';
    g.shadowBlur = 14;
    const s = 9 * SCALE;
    g.beginPath();
    g.moveTo(s, 0);
    g.lineTo(-s * 0.7, -s * 0.7);
    g.lineTo(-s * 0.3, 0);
    g.lineTo(-s * 0.7, s * 0.7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    raf = requestAnimationFrame(draw);
  };
  draw();

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const wx = ((e.clientX - r.left) / r.width) * MAP_W + MAP_X0;
    const wz = ((e.clientY - r.top) / r.height) * MAP_H + MAP_Z0;
    if (waypoint && Math.hypot(waypoint.x - wx, waypoint.z - wz) < 12) {
      waypoint = null;
      onClear();
    } else {
      waypoint = { x: wx, z: wz };
      onWaypoint(wx, wz);
    }
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    waypoint = null;
    onClear();
  });

  const legendItems: [string, string][] = [
    ['You', '#ffffff'],
    ['Story mission', BLIP_COLORS.mission],
    ['Objective', BLIP_COLORS.objective],
    ['Cyber terminal', BLIP_COLORS.terminal],
    ['Shop', BLIP_COLORS.shop],
    ['Data shard', BLIP_COLORS.shard],
    ['Target', BLIP_COLORS.target],
    ['Waypoint', '#b14dff'],
  ];
  const legend = el('div', { class: 'cc-legend' });
  for (const [label, color] of legendItems) legend.append(el('div', {}, el('i', { style: `background:${color}` }), el('span', {}, label)));
  const closeBtn = el('button', { class: 'cx-btn primary' }, 'Close map (M / Esc)');
  closeBtn.addEventListener('click', close);
  const side = el('div', { class: 'cc-map-side' },
    el('h2', { class: 'neon-title' }, 'NEON BAY'),
    el('p', { class: 'cx-muted' }, 'Click the map to set a GPS waypoint. Click it again (or right-click) to clear.'),
    legend,
    closeBtn,
  );
  root.append(stage, side);
  (root as HTMLElement & { cleanup?: () => void }).cleanup = () => cancelAnimationFrame(raf);
  return root;
}
