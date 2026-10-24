import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { SHORE_X } from './layout';

// GTA 6-style coast: turquoise shallows that deepen to ocean blue, animated
// white foam where waves wash up the sand, and a sun glare lens flare.

export class Shoreline {
  private mat: THREE.ShaderMaterial;
  private flareHolder = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    // The sand slope crosses the water surface about 13 m west of SHORE_X.
    const edge = SHORE_X - 13;
    const x0 = edge - 4, x1 = edge + 60, z0 = -300, z1 = 260;
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { time: { value: 0 }, edge: { value: edge }, sun: { value: 1 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float time; uniform float edge; uniform float sun; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
        void main(){
          float d = vW.x - edge;                       // meters out from the waterline
          // turquoise -> aqua -> ocean blue with distance from the beach
          vec3 shallow = vec3(0.30, 0.92, 0.86), mid = vec3(0.05, 0.70, 0.78), deep = vec3(0.02, 0.36, 0.60);
          vec3 col = mix(shallow, mid, smoothstep(0.0, 14.0, d));
          col = mix(col, deep, smoothstep(14.0, 55.0, d));
          float alpha = mix(0.75, 0.0, smoothstep(20.0, 58.0, d));
          // rolling foam bands washing in and out
          float wave = sin(vW.z * 0.08 + time * 0.6) * 1.2 + noise(vW.xz * 0.15 + time * 0.1) * 1.5;
          float wash = sin(time * 0.9 + vW.z * 0.02) * 1.6;
          float band = d + wash - wave * 0.4;
          float foam = smoothstep(1.4, 0.0, abs(band - 1.0)) * (0.55 + 0.45 * noise(vW.xz * 0.9 + time * 0.4));
          foam += smoothstep(0.9, 0.0, abs(band - 6.0 - sin(time * 0.5) * 1.5)) * 0.35 * noise(vW.xz * 0.6 - time * 0.3);
          col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0));
          alpha = max(alpha, foam * 0.95);
          alpha *= smoothstep(-3.5, 0.5, d);           // fade under the sand edge
          gl_FragColor = vec4(col * (0.75 + 0.35 * sun), alpha);
        }`,
    });
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.position.set((x0 + x1) / 2, -0.32, (z0 + z1) / 2);
    mesh.renderOrder = 1;
    scene.add(mesh);

    // Sun glare: lens flare far along the sun direction.
    const flare = new Lensflare();
    const tex = (size: number, inner: string, outer: string) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      if (g) {
        const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gr.addColorStop(0, inner);
        gr.addColorStop(1, outer);
        g.fillStyle = gr;
        g.fillRect(0, 0, size, size);
      }
      return new THREE.CanvasTexture(c);
    };
    flare.addElement(new LensflareElement(tex(256, 'rgba(255,248,230,1)', 'rgba(255,200,120,0)'), 520, 0, new THREE.Color('#fff2d8')));
    flare.addElement(new LensflareElement(tex(64, 'rgba(255,180,120,0.5)', 'rgba(255,120,80,0)'), 70, 0.5));
    flare.addElement(new LensflareElement(tex(64, 'rgba(140,220,255,0.45)', 'rgba(80,160,255,0)'), 110, 0.75));
    flare.addElement(new LensflareElement(tex(64, 'rgba(255,140,200,0.35)', 'rgba(255,80,160,0)'), 160, 1.0));
    this.flareHolder.add(flare);
    scene.add(this.flareHolder);
  }

  update(time: number, sunDir: THREE.Vector3, focus: THREE.Vector3, sunStrength: number): void {
    this.mat.uniforms.time.value = time;
    this.mat.uniforms.sun.value = sunStrength;
    this.flareHolder.position.set(focus.x + sunDir.x * 3000, sunDir.y * 3000, focus.z + sunDir.z * 3000);
    this.flareHolder.visible = sunDir.y > 0.02;
  }
}
