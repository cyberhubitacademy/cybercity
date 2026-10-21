import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Quality } from '../world/Environment';

// Rendering pipeline: scene -> ambient occlusion -> bloom -> tone map -> color grade.
// The grade pushes a warm-highlight / teal-shadow split tone with extra
// saturation and a soft vignette, for the sun-baked "Leonida" look.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    saturation: { value: 1.18 },
    contrast: { value: 1.06 },
    warmth: { value: 0.06 },
    vignette: { value: 0.32 },
    night: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float saturation; uniform float contrast; uniform float warmth; uniform float vignette; uniform float night;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      // split toning: warm highlights, teal/purple shadows
      vec3 shadowTint = mix(vec3(0.0, 0.05, 0.08), vec3(0.06, 0.0, 0.10), night);
      vec3 highTint = mix(vec3(0.10, 0.04, -0.03), vec3(0.08, 0.0, 0.06), night);
      col += shadowTint * (1.0 - smoothstep(0.0, 0.5, l)) * 0.6;
      col += highTint * smoothstep(0.45, 1.0, l) * warmth * 6.0;
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private gtao?: GTAOPass;
  private grade: ShaderPass;
  private renderPass: RenderPass;

  constructor(canvas: HTMLCanvasElement, scene: THREE.Scene, private camera: THREE.PerspectiveCamera, public quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'ultra' ? 2 : quality === 'high' ? 1.5 : 1));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = quality !== 'low';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.65;
    r.outputColorSpace = THREE.SRGBColorSpace;

    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(r);
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(size.x, size.y);
    if (quality !== 'low') {
      this.composer.renderTarget1.samples = 4;
      this.composer.renderTarget2.samples = 4;
    }
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    if (quality === 'high' || quality === 'ultra') {
      this.gtao = new GTAOPass(scene, camera, size.x, size.y);
      this.gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: quality === 'ultra' ? 16 : 10 });
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onContextLost?.();
    });
  }

  /** The GPU driver reset or ran out of memory. */
  onContextLost?: () => void;

  /** Internal resolution multiplier managed by the frame-rate governor (0.5..1). */
  private resScale = 1;
  /** 0 = everything on; higher levels progressively disable costly effects. */
  private shedLevel = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private goodStreak = 0;
  /** Called when the governor changes settings (e.g. to toggle shadows). */
  onAdjust?: (change: { resScale: number; shed: number; fps: number }) => void;

  private pixelRatio(): number {
    const q = this.quality;
    const base = Math.min(window.devicePixelRatio, q === 'ultra' ? 2 : q === 'high' ? 1.5 : 1);
    return Math.max(0.4, base * this.resScale);
  }

  /**
   * Frame-rate governor: keeps play smooth on any machine. Below ~38 fps it
   * lowers internal resolution, then sheds ambient occlusion, shadows and bloom;
   * with sustained headroom it restores them one step at a time.
   */
  govern(dtSeconds: number): void {
    if (document.hidden) return;
    this.fpsFrames++;
    this.fpsTime += dtSeconds;
    if (this.fpsTime < 1.5) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    const before = `${this.resScale}|${this.shedLevel}`;
    if (fps < 38) {
      this.goodStreak = 0;
      if (this.resScale > 0.6) this.resScale = Math.round((this.resScale - 0.15) * 100) / 100;
      else if (this.shedLevel < 3) this.shedLevel++;
    } else if (fps > 57) {
      this.goodStreak++;
      if (this.goodStreak >= 4) {
        this.goodStreak = 0;
        if (this.shedLevel > 0) this.shedLevel--;
        else if (this.resScale < 1) this.resScale = Math.min(1, Math.round((this.resScale + 0.15) * 100) / 100);
      }
    } else this.goodStreak = 0;
    if (`${this.resScale}|${this.shedLevel}` !== before) {
      if (this.gtao) this.gtao.enabled = this.shedLevel < 1;
      this.lastW = 0; // force a resize with the new pixel ratio
      this.onAdjust?.({ resScale: this.resScale, shed: this.shedLevel, fps: Math.round(fps) });
    }
  }

  /** Effects the governor has shed (shadows at level 2+, bloom at level 3). */
  get shed(): number {
    return this.shedLevel;
  }

  private onResize = (): void => {
    this.renderer.setPixelRatio(this.pixelRatio());
    this.composer.setPixelRatio(this.pixelRatio());
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };

  /** Swap the rendered scene (the world is built after the renderer). */
  setScene(scene: THREE.Scene): void {
    this.renderPass.scene = scene;
    if (this.gtao) this.gtao.scene = scene;
  }

  setLook(exposure: number, night: number, bloomEnabled: boolean): void {
    this.renderer.toneMappingExposure = exposure;
    this.bloom.enabled = bloomEnabled && this.shedLevel < 3;
    this.bloom.strength = 0.35 + night * 0.75;
    this.bloom.threshold = 0.85 - night * 0.2;
    this.grade.uniforms.night.value = night;
  }

  private lastW = 0;
  private lastH = 0;
  private lastDpr = 0;

  render(): void {
    // Some environments (devtools emulation, embedded panes) resize without a resize event.
    if (window.innerWidth !== this.lastW || window.innerHeight !== this.lastH || window.devicePixelRatio !== this.lastDpr) {
      this.lastW = window.innerWidth;
      this.lastH = window.innerHeight;
      this.lastDpr = window.devicePixelRatio;
      this.onResize();
    }
    this.composer.render();
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.renderer.dispose();
  }
}
