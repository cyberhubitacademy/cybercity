import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// Loads the CC0 asset pack (Quaternius people and cars, Poly Haven PBR
// textures and HDR skies) before the world is built. Every consumer checks
// for null and falls back to the procedural version, so a failed download
// never breaks the game.

export type PersonModel = 'man' | 'woman_casual' | 'woman_tank' | 'woman_dress' | 'woman_jacket';
export type CarModel = 'sports' | 'sports2' | 'sedan' | 'hatch' | 'suv' | 'police' | 'taxi' | 'pickup' | 'truck';
export type SurfaceName = 'asphalt' | 'sidewalk' | 'sand' | 'deck' | 'plaza' | 'grass';

export interface Surface {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

const PEOPLE: PersonModel[] = ['man', 'woman_casual', 'woman_tank', 'woman_dress', 'woman_jacket'];
const CARS: CarModel[] = ['sports', 'sports2', 'sedan', 'hatch', 'suv', 'police', 'taxi', 'pickup', 'truck'];
const SURFACES: SurfaceName[] = ['asphalt', 'sidewalk', 'sand', 'deck', 'plaza', 'grass'];

class AssetStore {
  people = new Map<PersonModel, GLTF>();
  cars = new Map<CarModel, GLTF>();
  surfaces = new Map<SurfaceName, Surface>();
  hdri: { day: THREE.DataTexture | null; sunset: THREE.DataTexture | null } = { day: null, sunset: null };
  loaded = false;

  async load(base: string, onProgress: (pct: number, label: string) => void): Promise<void> {
    const gltf = new GLTFLoader();
    const tex = new THREE.TextureLoader();
    const hdr = new RGBELoader();
    const jobs: { label: string; run: () => Promise<void> }[] = [];
    for (const p of PEOPLE) jobs.push({ label: 'people', run: async () => { this.people.set(p, await gltf.loadAsync(`${base}models/people/${p}.glb`)); } });
    for (const c of CARS) jobs.push({ label: 'cars', run: async () => { this.cars.set(c, await gltf.loadAsync(`${base}models/cars/${c}.glb`)); } });
    for (const s of SURFACES) {
      jobs.push({
        label: 'streets',
        run: async () => {
          const [map, normalMap, roughnessMap] = await Promise.all(
            ['diff', 'nor', 'rough'].map((k) => tex.loadAsync(`${base}textures/${s}_${k}.jpg`)),
          );
          map.colorSpace = THREE.SRGBColorSpace;
          for (const t of [map, normalMap, roughnessMap]) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = 8;
          }
          this.surfaces.set(s, { map, normalMap, roughnessMap });
        },
      });
    }
    for (const h of ['day', 'sunset'] as const) {
      jobs.push({ label: 'sky', run: async () => { this.hdri[h] = await hdr.loadAsync(`${base}hdri/${h}.hdr`); } });
    }
    let done = 0;
    await Promise.all(
      jobs.map(async (j) => {
        try {
          await j.run();
        } catch (err) {
          console.warn('[assets] failed', j.label, err);
        }
        done++;
        onProgress(done / jobs.length, j.label);
      }),
    );
    this.loaded = true;
  }

  /** A fresh copy of a surface with its own tiling (textures share the image). */
  surface(name: SurfaceName, repeatX: number, repeatY: number): Surface | null {
    const s = this.surfaces.get(name);
    if (!s) return null;
    const c = (t: THREE.Texture) => {
      const k = t.clone();
      k.repeat.set(repeatX, repeatY);
      k.needsUpdate = true;
      return k;
    };
    return { map: c(s.map), normalMap: c(s.normalMap), roughnessMap: c(s.roughnessMap) };
  }
}

export const ASSETS = new AssetStore();
