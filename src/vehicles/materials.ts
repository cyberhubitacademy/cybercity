import * as THREE from 'three';

// Shared vehicle materials. Paint is cached per color; customized vehicles
// get their own material instances (see Vehicle.applyLook).

export type VehicleQuality = 'low' | 'medium' | 'high' | 'ultra';
let quality: VehicleQuality = 'high';

/** Set once before cars are built (Traffic does it): 'low' uses plain standard paint. */
export function setVehicleQuality(q: VehicleQuality): void {
  if (q === quality) return;
  quality = q;
  paintCache.clear();
}

/** Tag read by collectSlots / VehicleEntry to find body paint without identity checks. */
export const PAINT_ROLE = 'carPaint';

const paintCache = new Map<string, THREE.MeshStandardMaterial>();
const _c = new THREE.Color();

/**
 * Factory clearcoat paint: sharp sky reflections over a metallic base. Very light
 * colors get little metalness (metallic white turns grey under the sky).
 */
export function paint(color: string): THREE.MeshStandardMaterial {
  let m = paintCache.get(color);
  if (!m) {
    _c.set(color); // linear working space
    const lum = 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b;
    const metalness = lum > 0.6 ? 0.15 : 0.5;
    m = quality === 'low'
      ? new THREE.MeshStandardMaterial({ color, metalness: metalness * 0.8, roughness: 0.35 })
      : new THREE.MeshPhysicalMaterial({ color, metalness, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1 });
    m.name = PAINT_ROLE;
    m.userData.role = PAINT_ROLE;
    paintCache.set(color, m);
  }
  return m;
}
export function isSharedPaint(m: THREE.Material): boolean {
  for (const p of paintCache.values()) if (p === m) return true;
  return false;
}

/** Opaque, dark, glossy dielectric glass: cheap (no sorting/blending) and reads well in daylight. */
export const glassMat = new THREE.MeshStandardMaterial({ name: 'carGlass', color: '#0b0f14', metalness: 0.1, roughness: 0.05, envMapIntensity: 1.4 });
export const tireMat = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.92 });
export const rimMat = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.85, roughness: 0.28 });
export const chromeMat = new THREE.MeshStandardMaterial({ color: '#eeeeee', metalness: 1, roughness: 0.15 });
export const darkMat = new THREE.MeshStandardMaterial({ color: '#202028', roughness: 0.6 });
export const seatMat = new THREE.MeshStandardMaterial({ color: '#f2e6d8', roughness: 0.7 });
export const headMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 0.4 });
export const tailMat = new THREE.MeshStandardMaterial({ color: '#550010', emissive: '#ff1030', emissiveIntensity: 0.6 });
export const neonMat = (color: string, intensity = 2): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

// ------------------------------------------------------------ merged-car atlas
// Merged CC0 cars draw every non-paint part (tyres, rims, trim, chrome, glass)
// with ONE material: base color from vertex colors, roughness/metalness from a
// tiny lookup texture addressed by a per-part uv. Lights work the same way with
// an emissive lookup, so a car is paint + parts + lights + one mesh per wheel.

export type PartId = 'tire' | 'rim' | 'trim' | 'chrome' | 'glass';
const PART_ORDER: PartId[] = ['tire', 'rim', 'trim', 'chrome', 'glass'];
const PART_PBR: Record<PartId, { color: string; rough: number; metal: number }> = {
  tire: { color: '#141418', rough: 0.92, metal: 0 },
  rim: { color: '#c9ced6', rough: 0.28, metal: 0.85 },
  trim: { color: '#1c1c22', rough: 0.55, metal: 0.15 },
  chrome: { color: '#b8bec8', rough: 0.3, metal: 0.8 },
  glass: { color: '#0b0f14', rough: 0.05, metal: 0.1 },
};
export const PART_COLOR: Record<PartId, string> = {
  tire: PART_PBR.tire.color, rim: PART_PBR.rim.color, trim: PART_PBR.trim.color, chrome: PART_PBR.chrome.color, glass: PART_PBR.glass.color,
};
/** Atlas u coordinate for a part (texel center). */
export function partU(p: PartId): number {
  return (PART_ORDER.indexOf(p) + 0.5) / PART_ORDER.length;
}

function lookup(n: number, fill: (i: number, px: Uint8Array) => void, srgb: boolean): THREE.DataTexture {
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) fill(i, data.subarray(i * 4, i * 4 + 4));
  const t = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// glTF convention: roughness in G, metalness in B.
const ormTex = lookup(PART_ORDER.length, (i, px) => {
  const p = PART_PBR[PART_ORDER[i]];
  px[0] = 255; px[1] = Math.round(p.rough * 255); px[2] = Math.round(p.metal * 255); px[3] = 255;
}, false);

/** Tyres, rims, trim, chrome and glass of every merged car. */
export const partsMat = new THREE.MeshStandardMaterial({
  name: 'carParts', color: '#ffffff', vertexColors: true, roughness: 1, metalness: 1, roughnessMap: ormTex, metalnessMap: ormTex, envMapIntensity: 1.2,
});

export type LightId = 'head' | 'tail' | 'blue';
const LIGHT_ORDER: LightId[] = ['head', 'tail', 'blue'];
export const LIGHT_COLOR: Record<LightId, string> = { head: '#ffffff', tail: '#550010', blue: '#2244ff' };
const LIGHT_EMIT: Record<LightId, string> = { head: '#fff4d6', tail: '#ff1030', blue: '#3355ff' };
export function lightU(l: LightId): number {
  return (LIGHT_ORDER.indexOf(l) + 0.5) / LIGHT_ORDER.length;
}
const emitColor = new THREE.Color();
const emitTex = lookup(LIGHT_ORDER.length, (i, px) => {
  emitColor.set(LIGHT_EMIT[LIGHT_ORDER[i]]).convertLinearToSRGB();
  px[0] = Math.round(emitColor.r * 255); px[1] = Math.round(emitColor.g * 255); px[2] = Math.round(emitColor.b * 255); px[3] = 255;
}, true);

/**
 * Head, tail and police lights of every merged car in one material. Intensities
 * follow headMat / tailMat (WorldSim drives those for night) via live uniforms.
 */
export const lightsMat = new THREE.MeshStandardMaterial({
  name: 'carLights', color: '#ffffff', vertexColors: true, roughness: 0.3, emissive: '#ffffff', emissiveMap: emitTex,
});
lightsMat.onBeforeCompile = (shader) => {
  shader.uniforms.carHeadI = { get value() { return headMat.emissiveIntensity; } };
  shader.uniforms.carTailI = { get value() { return tailMat.emissiveIntensity; } };
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform float carHeadI;\nuniform float carTailI;\nvoid main() {')
    .replace(
      '#include <emissivemap_fragment>',
      `#ifdef USE_EMISSIVEMAP
        float carU = vEmissiveMapUv.x;
        totalEmissiveRadiance *= texture2D( emissiveMap, vEmissiveMapUv ).rgb * ( carU < 0.333 ? carHeadI : carU < 0.667 ? carTailI : 2.0 );
      #endif`,
    );
};
lightsMat.customProgramCacheKey = () => 'carLights1';

export type Finish = 'metallic' | 'matte' | 'pearlescent' | 'chrome';
export const FINISHES: Finish[] = ['metallic', 'matte', 'pearlescent', 'chrome'];

/** A fresh paint material for a custom look. */
export function customPaint(color: string, finish: Finish): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color, envMapIntensity: 1 });
  m.name = PAINT_ROLE;
  m.userData.role = PAINT_ROLE;
  switch (finish) {
    case 'matte':
      m.metalness = 0.05; m.roughness = 0.82; m.clearcoat = 0; break;
    case 'pearlescent':
      m.metalness = 0.35; m.roughness = 0.22; m.clearcoat = 1; m.clearcoatRoughness = 0.04;
      m.iridescence = 0.85; m.iridescenceIOR = 1.6; m.sheen = 0.6; m.sheenColor = new THREE.Color('#ffd6ff');
      break;
    case 'chrome':
      m.metalness = 1; m.roughness = 0.06; m.clearcoat = 1; m.envMapIntensity = 1.6; break;
    default:
      m.metalness = 0.55; m.roughness = 0.32; m.clearcoat = 1; m.clearcoatRoughness = 0.06;
  }
  return m;
}
