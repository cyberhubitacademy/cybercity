import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import type { Quality } from '../world/Environment';

// Rendering pipeline: scene -> ambient occlusion -> bloom -> tone map -> color grade.
// The grade is natural and restrained (see docs/VISUAL_TARGET.md): warm sunlit
// highlights, cool shade, filmic contrast, colour saved for accents, soft vignette.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    saturation: { value: 1.0 },
    vibrance: { value: 0.12 },
    contrast: { value: 1.06 },
    warmth: { value: 0.05 },
    sharpen: { value: 0.35 },
    vignette: { value: 0.18 },
    night: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  // Crisp detail, filmic S-curve, light vibrance (boosts muted colors more than
  // already-saturated ones), teal shadows, warm peach highlights, light vignette.
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 texel;
    uniform float saturation; uniform float vibrance; uniform float contrast; uniform float warmth;
    uniform float sharpen; uniform float vignette; uniform float night;
    varying vec2 vUv;
    vec3 sCurve(vec3 x, float k) { return mix(x, x * x * (3.0 - 2.0 * x), k); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // unsharp mask (4 taps) for GTA-crisp edges
      vec3 blur = (texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb
                 + texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb) * 0.25;
      vec3 col = clamp(c + (c - blur) * sharpen, 0.0, 1.0);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
      col = mix(vec3(l), col, saturation + vibrance * (1.0 - sat));
      col = clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
      col = sCurve(col, 0.35);
      vec3 shadowTint = mix(vec3(-0.01, 0.035, 0.06), vec3(0.06, 0.0, 0.10), night);
      vec3 highTint = mix(vec3(0.10, 0.045, -0.02), vec3(0.08, 0.0, 0.06), night);
      col += shadowTint * (1.0 - smoothstep(0.0, 0.45, l)) * 0.7;
      col += highTint * smoothstep(0.5, 1.0, l) * warmth * 6.0;
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - vignette * smoothstep(0.4, 0.9, d);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private gtao?: GTAOPass;
  private grade: ShaderPass;
  private dof?: BokehPass;
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
    if (quality !== 'low') {
      // Cinematic depth of field, only switched on during cutscenes.
      this.dof = new BokehPass(scene, camera, { focus: 8, aperture: 0.0016, maxblur: 0.006 });
      this.dof.enabled = false;
      this.composer.addPass(this.dof);
    }
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
   * lowers internal resolution, then sheds ambient occlusion, bloom and (last) shadows;
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

  /** Effects the governor has shed (AO at 1+, bloom at 2+, shadows at 3). */
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
    const pr = this.renderer.getPixelRatio();
    this.grade.uniforms.texel.value.set(1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr));
  };

  /** Swap the rendered scene (the world is built after the renderer). */
  setScene(scene: THREE.Scene): void {
    this.renderPass.scene = scene;
    if (this.dof) this.dof.scene = scene;
    if (this.gtao) this.gtao.scene = scene;
  }

  setLook(exposure: number, night: number, bloomEnabled: boolean): void {
    this.renderer.toneMappingExposure = exposure;
    this.bloom.enabled = bloomEnabled && this.shedLevel < 2; // bloom goes before shadows: shadows sell realism
    this.bloom.strength = 0.35 + night * 0.75;
    this.bloom.threshold = 0.85 - night * 0.2;
    this.grade.uniforms.night.value = night;
  }

  private lastW = 0;
  private lastH = 0;
  private lastDpr = 0;

  /** Cutscene depth of field: focus on a subject this many meters from the camera. */
  setCinematicDof(on: boolean, focus = 8): void {
    if (!this.dof) return;
    this.dof.enabled = on;
    (this.dof.uniforms as Record<string, { value: number }>).focus.value = focus;
  }

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
