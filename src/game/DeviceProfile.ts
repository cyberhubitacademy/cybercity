import type { Quality } from '../world/Environment';

// Picks a starting graphics preset from what the browser reports about the
// machine. It is only a first guess: the renderer's frame-rate governor keeps
// adjusting resolution and effects while playing.

export interface DeviceInfo {
  gpu: string;
  cores: number;
  memoryGb: number | null;
  pixels: number;
  software: boolean;
}

export function readDevice(): DeviceInfo {
  let gpu = 'unknown';
  let software = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* ignore */
  }
  software = /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(gpu);
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    gpu,
    cores: navigator.hardwareConcurrency || 4,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    pixels: window.screen.width * window.screen.height * Math.min(2, window.devicePixelRatio || 1),
    software,
  };
}

export function recommendQuality(d: DeviceInfo = readDevice()): Quality {
  if (d.software) return 'low';
  const g = d.gpu.toLowerCase();
  let q: Quality;
  if (/rtx|radeon rx [5-9]\d{3}|rx [67]\d{3}|arc a7|apple m[2-9]|apple m1 (pro|max|ultra)/.test(g)) q = 'high';
  else if (/geforce|gtx|radeon rx|quadro|apple m1|apple gpu|iris xe|arc/.test(g)) q = 'medium';
  else if (/intel|uhd|hd graphics|mali|adreno|powervr|radeon(tm)? graphics|vega \d/.test(g)) q = 'low';
  else q = 'medium';
  // Weak CPUs or little memory cap the preset regardless of GPU.
  if (d.cores <= 4 || (d.memoryGb !== null && d.memoryGb <= 4)) q = q === 'high' ? 'medium' : 'low';
  return q;
}
