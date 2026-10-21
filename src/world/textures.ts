import * as THREE from 'three';
import { mulberry32 } from './layout';

// All textures are generated at runtime on canvases, so the game ships with no
// third-party art. Each generator caches its result.

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function finish(c: HTMLCanvasElement, srgb = true, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const t = make();
  cache.set(key, t);
  return t;
}

export type FacadeKind = 'deco' | 'glass' | 'warehouse' | 'datacenter' | 'campus' | 'house';

export interface FacadeMaps {
  map: THREE.Texture;
  emissive: THREE.Texture;
  roughness: THREE.Texture;
  /** World size in meters that one texture tile covers (width, height). */
  tile: [number, number];
}

/**
 * Facade with 4x4 bays. White/neutral wall so material.color tints it;
 * glass is darker & smoother (roughness map), lit windows go in the emissive map.
 */
const facadeCache = new Map<string, FacadeMaps>();

export function facade(kind: FacadeKind, seed = 1): FacadeMaps {
  const key = `${kind}-${seed}`;
  const hit = facadeCache.get(key);
  if (hit) return hit;
  const made = ((): FacadeMaps => {
    const S = 512;
    const [c, g] = canvas(S, S);
    const [ce, ge] = canvas(S, S);
    const [cr, gr] = canvas(S, S);
    const rnd = mulberry32(seed * 977 + kind.length * 31);
    const bays = kind === 'glass' ? 6 : kind === 'warehouse' ? 2 : 4;
    const bw = S / bays;
    // base wall
    g.fillStyle = '#f2efe9';
    g.fillRect(0, 0, S, S);
    // subtle plaster noise
    for (let i = 0; i < 2600; i++) {
      const v = 225 + Math.floor(rnd() * 30);
      g.fillStyle = `rgba(${v},${v},${v},0.25)`;
      g.fillRect(rnd() * S, rnd() * S, 2, 2);
    }
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, S, S);
    gr.fillStyle = '#d8d8d8'; // rough walls
    gr.fillRect(0, 0, S, S);

    const warm = ['#ffd9a0', '#ffe8c2', '#fff2d6', '#ffc27a', '#bfe6ff', '#ffb0de'];
    for (let by = 0; by < bays; by++) {
      for (let bx = 0; bx < bays; bx++) {
        const x = bx * bw, y = by * bw;
        if (kind === 'warehouse') {
          // corrugated panels + one high window strip
          for (let k = 0; k < bw; k += 8) {
            g.fillStyle = k % 16 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
            g.fillRect(x + k, y, 4, bw);
          }
          g.fillStyle = '#5d7a8c';
          g.fillRect(x + 20, y + 20, bw - 40, 26);
          gr.fillStyle = '#404040';
          gr.fillRect(x + 20, y + 20, bw - 40, 26);
          continue;
        }
        if (kind === 'datacenter') {
          g.fillStyle = 'rgba(0,0,0,0.06)';
          g.fillRect(x + 4, y + 4, bw - 8, bw - 8);
          // LED strip
          ge.fillStyle = '#19e6ff';
          ge.fillRect(x, y + bw - 10, bw, 3);
          g.fillStyle = '#9fefff';
          g.fillRect(x, y + bw - 10, bw, 3);
          if (rnd() < 0.3) {
            g.fillStyle = '#2b3a4f';
            g.fillRect(x + 30, y + 30, bw - 60, 20);
          }
          continue;
        }
        const pad = kind === 'glass' ? 3 : kind === 'house' ? 34 : 22;
        const wx = x + pad, wy = y + pad * (kind === 'glass' ? 1 : 1.2), ww = bw - pad * 2, wh = bw - pad * (kind === 'glass' ? 2 : 2.2);
        // glass with sky-reflection gradient
        const grad = g.createLinearGradient(0, wy, 0, wy + wh);
        if (kind === 'glass') {
          grad.addColorStop(0, '#9ccbe8');
          grad.addColorStop(0.5, '#4f7fa6');
          grad.addColorStop(1, '#2b4a6b');
        } else {
          grad.addColorStop(0, '#7fb4d6');
          grad.addColorStop(1, '#27405e');
        }
        g.fillStyle = grad;
        g.fillRect(wx, wy, ww, wh);
        if (kind !== 'glass') {
          // frames + mullion
          g.strokeStyle = 'rgba(255,255,255,0.9)';
          g.lineWidth = 4;
          g.strokeRect(wx, wy, ww, wh);
          g.beginPath();
          g.moveTo(wx + ww / 2, wy);
          g.lineTo(wx + ww / 2, wy + wh);
          g.stroke();
          // sill shadow
          g.fillStyle = 'rgba(0,0,0,0.18)';
          g.fillRect(wx - 4, wy + wh + 2, ww + 8, 5);
        } else {
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.fillRect(wx, wy, ww, 2);
        }
        gr.fillStyle = kind === 'glass' ? '#141414' : '#262626';
        gr.fillRect(wx, wy, ww, wh);
        if (rnd() < (kind === 'glass' ? 0.45 : 0.55)) {
          const col = warm[Math.floor(rnd() * warm.length)];
          ge.fillStyle = col;
          ge.globalAlpha = 0.55 + rnd() * 0.45;
          ge.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
          ge.globalAlpha = 1;
          // blinds silhouette
          if (rnd() < 0.4) {
            ge.fillStyle = 'rgba(0,0,0,0.5)';
            for (let k = 0; k < wh; k += 6) ge.fillRect(wx + 2, wy + k, ww - 4, 2);
          }
        }
      }
    }
    if (kind === 'deco' || kind === 'campus') {
      // horizontal floor band
      for (let by = 0; by < bays; by++) {
        g.fillStyle = 'rgba(0,0,0,0.07)';
        g.fillRect(0, by * bw + bw - 8, S, 8);
      }
    }
    const tileW = kind === 'glass' ? 18 : kind === 'warehouse' ? 16 : 14;
    const tileH = kind === 'glass' ? 18 : kind === 'warehouse' ? 12 : 14;
    return { map: finish(c), emissive: finish(ce), roughness: finish(cr, false), tile: [tileW, tileH] };
  })();
  facadeCache.set(key, made);
  return made;
}

export function asphalt(): THREE.Texture {
  return cached('asphalt', () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#4a4a55';
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(42);
    for (let i = 0; i < 26000; i++) {
      const v = 50 + Math.floor(rnd() * 60);
      g.fillStyle = `rgba(${v},${v},${v + 8},${0.3 + rnd() * 0.4})`;
      g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // patches & cracks
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(30,30,40,${0.12 + rnd() * 0.1})`;
      g.beginPath();
      g.ellipse(rnd() * S, rnd() * S, 20 + rnd() * 60, 10 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(20,20,25,0.5)';
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      let x = rnd() * S, y = rnd() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rnd() - 0.5) * 40;
        y += (rnd() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return finish(c);
  });
}

export function sidewalk(): THREE.Texture {
  return cached('sidewalk', () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#e9d8cf';
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      const v = 200 + Math.floor(rnd() * 50);
      g.fillStyle = `rgba(${v},${v - 12},${v - 18},0.35)`;
      g.fillRect(rnd() * S, rnd() * S, 2, 2);
    }
    g.strokeStyle = 'rgba(120,90,90,0.45)';
    g.lineWidth = 3;
    for (let k = 0; k <= S; k += S / 4) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.stroke();
      g.beginPath(); g.moveTo(0, k); g.lineTo(S, k); g.stroke();
    }
    return finish(c);
  });
}

export function sand(): THREE.Texture {
  return cached('sand', () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#f3dcb0';
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(11);
    for (let i = 0; i < 40000; i++) {
      const v = rnd();
      g.fillStyle = v < 0.5 ? 'rgba(255,240,210,0.5)' : 'rgba(200,165,115,0.35)';
      g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
    }
    // wind ripples
    g.strokeStyle = 'rgba(190,150,100,0.18)';
    g.lineWidth = 2;
    for (let y = 0; y < S; y += 14) {
      g.beginPath();
      for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 4);
      g.stroke();
    }
    return finish(c);
  });
}

export function grass(): THREE.Texture {
  return cached('grass', () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#4fae4a';
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(3);
    for (let i = 0; i < 30000; i++) {
      const h = 90 + rnd() * 40;
      g.fillStyle = `hsla(${h},${55 + rnd() * 25}%,${30 + rnd() * 25}%,0.6)`;
      g.fillRect(rnd() * S, rnd() * S, 1.5, 3 + rnd() * 3);
    }
    return finish(c);
  });
}

/** Tileable normal map for the ocean (sum of sines, analytically differentiated). */
export function waterNormals(): THREE.Texture {
  return cached('waternormals', () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const img = g.createImageData(S, S);
    const waves: [number, number, number, number][] = [];
    const rnd = mulberry32(99);
    for (let i = 0; i < 14; i++) {
      const kx = Math.round((rnd() - 0.5) * 16), ky = Math.round((rnd() - 0.5) * 16);
      waves.push([kx || 1, ky, 0.6 / (1 + i * 0.35), rnd() * Math.PI * 2]);
    }
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let dx = 0, dy = 0;
        for (const [kx, ky, a, p] of waves) {
          const ph = ((kx * x + ky * y) / S) * Math.PI * 2 + p;
          const d = Math.cos(ph) * a;
          dx += d * kx * 0.05;
          dy += d * ky * 0.05;
        }
        const n = new THREE.Vector3(-dx, -dy, 1).normalize();
        const o = (y * S + x) * 4;
        img.data[o] = (n.x * 0.5 + 0.5) * 255;
        img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
        img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return finish(c, false);
  });
}

/** Hawaiian shirt print. */
export function hawaiianShirt(base = '#1fb5c9', flower = '#ff3d9a', leaf = '#0f7a52'): THREE.Texture {
  return cached(`shirt-${base}-${flower}`, () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    const rnd = mulberry32(base.length * 13 + flower.charCodeAt(1));
    for (let i = 0; i < 14; i++) {
      const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 10, rot = rnd() * Math.PI;
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = leaf;
      g.beginPath();
      g.ellipse(r * 1.4, 0, r * 1.5, r * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    for (let i = 0; i < 12; i++) {
      const x = rnd() * S, y = rnd() * S, r = 7 + rnd() * 7;
      g.fillStyle = i % 3 === 0 ? '#ffd23f' : flower;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, r * 0.5, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#fff4c2';
      g.beginPath();
      g.arc(x, y, r * 0.35, 0, Math.PI * 2);
      g.fill();
    }
    const t = finish(c);
    t.repeat.set(2.5, 2.5);
    return t;
  });
}

/** Glowing neon sign text. Returns texture + aspect ratio. */
export function neonSign(text: string, color: string, vertical = false, script = false): { tex: THREE.Texture; aspect: number } {
  const key = `neon-${text}-${color}-${vertical}-${script}`;
  const hit = cache.get(key);
  const fontSize = 96;
  const font = script ? `italic 700 ${fontSize}px Pacifico, 'Brush Script MT', cursive` : `900 ${fontSize}px Bungee, Impact, sans-serif`;
  const measure = () => {
    const [, g] = canvas(4, 4);
    g.font = font;
    return g.measureText(text).width;
  };
  const tw = measure();
  const W = vertical ? fontSize * 1.6 : Math.ceil(tw + fontSize);
  const H = vertical ? Math.ceil(fontSize * 1.05 * text.length + fontSize * 0.6) : Math.ceil(fontSize * 1.7);
  if (hit) return { tex: hit, aspect: W / H };
  const [c, g] = canvas(W, H);
  g.fillStyle = 'rgba(10,6,24,0.0)';
  g.fillRect(0, 0, W, H);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const draw = (blur: number, style: string, width: number) => {
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.strokeStyle = style;
    g.lineWidth = width;
    g.fillStyle = style;
    if (vertical) {
      [...text].forEach((ch, i) => {
        g.strokeText(ch, W / 2, fontSize * 0.8 + i * fontSize * 1.05);
        g.fillText(ch, W / 2, fontSize * 0.8 + i * fontSize * 1.05);
      });
    } else {
      g.strokeText(text, W / 2, H / 2);
      g.fillText(text, W / 2, H / 2);
    }
  };
  draw(40, color, 8);
  draw(14, '#ffffff', 2);
  const tex = finish(c, true, false);
  cache.set(key, tex);
  return { tex, aspect: W / H };
}

/** Billboard / poster art with a headline (original fictional ads). */
export function billboard(headline: string, sub: string, a: string, b: string): THREE.Texture {
  return cached(`bb-${headline}`, () => {
    const W = 1024, H = 512;
    const [c, g] = canvas(W, H);
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, a);
    grad.addColorStop(1, b);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // sun stripes
    g.fillStyle = 'rgba(255,210,63,0.9)';
    g.beginPath();
    g.arc(W * 0.8, H * 0.62, 150, Math.PI, 0);
    g.fill();
    g.fillStyle = a;
    for (let i = 0; i < 6; i++) g.fillRect(W * 0.8 - 160, H * 0.62 - 20 - i * 24, 320, 6 + i);
    g.font = '900 96px Bungee, Impact, sans-serif';
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(0,0,0,0.4)';
    g.shadowBlur = 12;
    g.fillText(headline, 40, 150);
    g.font = '700 46px Rajdhani, sans-serif';
    g.fillText(sub, 44, 230);
    return finish(c, true, false);
  });
}

/** Simple radial glow sprite (for lamps, markers, headlights). */
export function glowSprite(): THREE.Texture {
  return cached('glow', () => {
    const S = 128;
    const [c, g] = canvas(S, S);
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    return finish(c, true, false);
  });
}

/** Label sprite text (for floating mission letters and NPC names). */
export function labelTexture(text: string, color: string, bg = 'rgba(10,6,30,0.85)'): THREE.Texture {
  return cached(`label-${text}-${color}`, () => {
    const W = 256, H = 256;
    const [c, g] = canvas(W, H);
    g.fillStyle = bg;
    g.beginPath();
    g.arc(W / 2, H / 2, 110, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 24;
    g.stroke();
    g.font = '900 120px Bungee, Impact, sans-serif';
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 6);
    return finish(c, true, false);
  });
}
