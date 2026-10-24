import * as THREE from 'three';

// Shared vehicle materials. Paint is cached per color; customized vehicles
// get their own material instances (see Vehicle.applyLook).

const paintCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function paint(color: string): THREE.MeshPhysicalMaterial {
  let m = paintCache.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3 });
    paintCache.set(color, m);
  }
  return m;
}
export function isSharedPaint(m: THREE.Material): boolean {
  for (const p of paintCache.values()) if (p === m) return true;
  return false;
}

export const glassMat = new THREE.MeshPhysicalMaterial({ color: '#16202e', metalness: 0.2, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.8, transparent: true, opacity: 0.88 });
export const tireMat = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.9 });
export const rimMat = new THREE.MeshStandardMaterial({ color: '#d9dde6', metalness: 0.9, roughness: 0.25 });
export const chromeMat = new THREE.MeshStandardMaterial({ color: '#eeeeee', metalness: 1, roughness: 0.15 });
export const darkMat = new THREE.MeshStandardMaterial({ color: '#202028', roughness: 0.6 });
export const seatMat = new THREE.MeshStandardMaterial({ color: '#f2e6d8', roughness: 0.7 });
export const headMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 0.4 });
export const tailMat = new THREE.MeshStandardMaterial({ color: '#550010', emissive: '#ff1030', emissiveIntensity: 0.6 });
export const neonMat = (color: string, intensity = 2): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

export type Finish = 'metallic' | 'matte' | 'pearlescent' | 'chrome';
export const FINISHES: Finish[] = ['metallic', 'matte', 'pearlescent', 'chrome'];

/** A fresh paint material for a custom look. */
export function customPaint(color: string, finish: Finish): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color, envMapIntensity: 1.3 });
  switch (finish) {
    case 'matte':
      m.metalness = 0.05; m.roughness = 0.82; m.clearcoat = 0; break;
    case 'pearlescent':
      m.metalness = 0.35; m.roughness = 0.22; m.clearcoat = 1; m.clearcoatRoughness = 0.04;
      m.iridescence = 0.85; m.iridescenceIOR = 1.6; m.sheen = 0.6; m.sheenColor = new THREE.Color('#ffd6ff');
      break;
    case 'chrome':
      m.metalness = 1; m.roughness = 0.06; m.clearcoat = 1; m.envMapIntensity = 2; break;
    default:
      m.metalness = 0.6; m.roughness = 0.3; m.clearcoat = 1; m.clearcoatRoughness = 0.08;
  }
  return m;
}
