// Small WebAudio synth for movement sounds (splashes, strokes, landings,
// parachute flap, wind, underwater rumble). Own AudioContext, created lazily
// on first use (the player has interacted with the page by then).

import type { MoveSound } from './Locomotion';

type Ctor = typeof AudioContext;

export class MoveAudio {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private wind: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private deep: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  volume = 0.6;

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return this.ctx;
    }
    try {
      const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
      const C = w.AudioContext ?? w.webkitAudioContext;
      if (!C) return null;
      const ctx = new C();
      this.ctx = ctx;
      this.out = ctx.createGain();
      this.out.gain.value = this.volume;
      this.out.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return ctx;
    } catch {
      return null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private burst(dur: number, f0: number, f1: number, gain: number, type: BiquadFilterType = 'lowpass', q = 0.8, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.noise || !this.out) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.out) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: MoveSound, strength = 0.5): void {
    const s = Math.max(0.1, Math.min(1, strength));
    switch (name) {
      case 'splash':
        this.burst(0.45, 2600, 500, 0.35 * s + 0.1, 'lowpass');
        this.burst(0.25, 5000, 1800, 0.12, 'bandpass', 1.2, 0.05);
        break;
      case 'bigsplash':
        this.burst(1.1, 3000, 200, 0.6, 'lowpass');
        this.tone(0.4, 120, 45, 0.35);
        this.burst(0.6, 6000, 1500, 0.15, 'bandpass', 1, 0.15);
        break;
      case 'stroke':
        this.burst(0.22, 1800, 600, 0.06 + s * 0.06, 'bandpass', 1.4);
        break;
      case 'dive':
        this.burst(0.35, 1500, 300, 0.2, 'lowpass');
        this.tone(0.3, 300, 140, 0.05, 'sine', 0.1);
        break;
      case 'gasp':
        this.burst(0.35, 900, 2200, 0.14, 'bandpass', 3);
        break;
      case 'jump':
        this.burst(0.12, 900, 300, 0.05, 'lowpass');
        break;
      case 'land':
        this.burst(0.16, 600, 120, 0.12 + s * 0.1, 'lowpass');
        break;
      case 'hardland':
        this.burst(0.3, 500, 80, 0.35, 'lowpass');
        this.tone(0.25, 90, 40, 0.3);
        break;
      case 'roll':
        this.burst(0.5, 700, 200, 0.12, 'lowpass');
        break;
      case 'vault':
      case 'climb':
        this.burst(0.18, 1200, 400, 0.09, 'bandpass', 1.5);
        this.burst(0.14, 700, 250, 0.08, 'lowpass', 1, 0.18);
        break;
      case 'deploy':
        for (let i = 0; i < 4; i++) this.burst(0.12, 1400, 600, 0.22, 'bandpass', 1.2, i * 0.07);
        this.burst(0.6, 800, 150, 0.4, 'lowpass', 1, 0.3);
        break;
      case 'cut':
        this.burst(0.2, 3000, 1200, 0.15, 'highpass');
        break;
      case 'whoosh':
        this.burst(0.8, 400, 2000, 0.15, 'bandpass', 0.8);
        break;
      case 'bump':
        this.burst(0.15, 500, 150, 0.16, 'lowpass');
        break;
      case 'crouch':
        this.burst(0.1, 1500, 700, 0.04, 'bandpass', 2);
        break;
    }
  }

  /** Continuous wind (0..1) while skydiving/parachuting. */
  setWind(level: number): void {
    if (level <= 0.01 && !this.wind) return;
    const ctx = this.ensure();
    if (!ctx || !this.noise || !this.out) return;
    if (!this.wind) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.out);
      src.start();
      this.wind = { src, gain, filter };
    }
    this.wind.gain.gain.setTargetAtTime(level * 0.35, ctx.currentTime, 0.15);
    this.wind.filter.frequency.setTargetAtTime(300 + level * 1500, ctx.currentTime, 0.2);
  }

  /** Low underwater rumble while the camera is submerged. */
  setUnderwater(on: boolean): void {
    if (!on && !this.deep) return;
    const ctx = this.ensure();
    if (!ctx || !this.noise || !this.out) return;
    if (!this.deep) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = 0.5;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(gain).connect(this.out);
      src.start();
      this.deep = { src, gain };
    }
    this.deep.gain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.2);
  }
}
