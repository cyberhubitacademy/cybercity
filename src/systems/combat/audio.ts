import type { WeaponId } from './weapons';

// Synthesized combat sounds (WebAudio, no files): gunshots per weapon class,
// suppressed shots, punches, taser buzz, reload clicks, hit ticks, bullet
// whizz and the police siren. One lazily created AudioContext.

type Voice = 'shot' | 'punch' | 'taser' | 'reload' | 'empty' | 'hit' | 'kill' | 'whizz' | 'ko' | 'pickup' | 'explosion';

const SHOT: Partial<Record<WeaponId, { f: number; q: number; decay: number; gain: number; thump: number }>> = {
  pistol: { f: 1800, q: 0.7, decay: 0.18, gain: 0.9, thump: 110 },
  smg: { f: 2200, q: 0.8, decay: 0.12, gain: 0.7, thump: 130 },
  shotgun: { f: 900, q: 0.5, decay: 0.42, gain: 1.2, thump: 70 },
  rifle: { f: 1500, q: 0.6, decay: 0.22, gain: 1.0, thump: 90 },
  sniper: { f: 1100, q: 0.5, decay: 0.6, gain: 1.3, thump: 60 },
};

export class CombatAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.6;
  private siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp);
      const len = Math.floor(ctx.sampleRate * 1.0);
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
    if (this.master) this.master.gain.value = v;
  }

  /** Play a sound; dist (m) attenuates, pan -1..1. */
  play(kind: Voice, opts: { weapon?: WeaponId; dist?: number; pan?: number; suppressed?: boolean } = {}): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const atten = 1 / (1 + (opts.dist ?? 0) / 14);
    if (atten < 0.03) return;
    const out = ctx.createGain();
    out.gain.value = atten;
    let dest: AudioNode = out;
    if (opts.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      out.connect(p);
      p.connect(this.master);
    } else out.connect(this.master);
    const noise = (dur: number, type: BiquadFilterType, f: number, q: number, gain: number, decay: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.value = f;
      flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
      src.connect(flt); flt.connect(g); g.connect(dest);
      src.start(t, Math.random() * 0.5, dur);
    };
    const tone = (type: OscillatorType, f0: number, f1: number, gain: number, decay: number, delay = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + decay);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t + delay);
      g.gain.exponentialRampToValueAtTime(0.0008, t + delay + decay);
      o.connect(g); g.connect(dest);
      o.start(t + delay);
      o.stop(t + delay + decay + 0.02);
    };
    switch (kind) {
      case 'shot': {
        const s = SHOT[opts.weapon ?? 'pistol'] ?? SHOT.pistol!;
        if (opts.weapon === 'taser') { tone('square', 140, 90, 0.25, 0.35); noise(0.3, 'highpass', 3000, 1, 0.2, 0.3); break; }
        if (opts.suppressed) { noise(0.12, 'bandpass', 2600, 1.2, 0.35 * s.gain, 0.08); tone('sine', 220, 90, 0.2, 0.06); break; }
        noise(s.decay + 0.1, 'lowpass', s.f, s.q, s.gain, s.decay);
        tone('sine', s.thump * 1.6, s.thump * 0.6, 0.9 * s.gain, s.decay * 0.6);
        // distant tail / echo off the towers
        noise(0.5, 'lowpass', 700, 0.5, 0.18 * s.gain, s.decay * 2.4);
        break;
      }
      case 'punch': noise(0.1, 'lowpass', 420, 1, 0.9, 0.09); tone('sine', 140, 60, 0.6, 0.08); break;
      case 'ko': noise(0.25, 'lowpass', 300, 1, 1, 0.22); tone('sine', 90, 40, 0.8, 0.2); break;
      case 'taser': tone('sawtooth', 110, 105, 0.18, 0.6); break;
      case 'reload': tone('square', 1800, 1500, 0.08, 0.03); tone('square', 1300, 1100, 0.1, 0.04, 0.22); break;
      case 'empty': tone('square', 2400, 2200, 0.06, 0.02); break;
      case 'hit': tone('sine', 1900, 1600, 0.18, 0.05); break;
      case 'kill': tone('sine', 1400, 900, 0.25, 0.12); tone('sine', 2100, 1500, 0.15, 0.1, 0.05); break;
      case 'whizz': noise(0.2, 'bandpass', 3500, 6, 0.35, 0.16); break;
      case 'pickup': tone('triangle', 800, 1400, 0.2, 0.12); break;
      case 'explosion': noise(1.2, 'lowpass', 500, 0.4, 1.4, 1.1); tone('sine', 70, 25, 1.2, 0.9); break;
    }
  }

  /** Police siren wail (0 = off). Volume by distance to the nearest unit. */
  setSiren(level: number): void {
    const ctx = level > 0 ? this.ensure() : this.ctx;
    if (!ctx || !this.master) return;
    if (level > 0 && !this.siren) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 900;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.45;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 320;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 2200;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(flt); flt.connect(gain); gain.connect(this.master);
      osc.start(); lfo.start();
      this.siren = { osc, lfo, gain };
    }
    if (this.siren) {
      this.siren.gain.gain.setTargetAtTime(Math.min(0.12, level * 0.12), ctx.currentTime, 0.2);
      if (level <= 0) {
        const s = this.siren;
        this.siren = null;
        setTimeout(() => { try { s.osc.stop(); s.lfo.stop(); } catch { /* already stopped */ } }, 800);
      }
    }
  }
}

/** One audio instance shared by combat, police and crime. */
export const COMBAT_AUDIO = new CombatAudio();
