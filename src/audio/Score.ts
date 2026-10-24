import type { MusicMood } from '../scripting/cinematic';

// Procedural cinematic score. Each mood is a looping 4-bar cue built from a
// few synthesized "sections": strings (detuned saws), brass swells, taiko
// drums, ticking ostinato, arpeggiator, piano, choir pads and cymbal swells.
// Moods crossfade on their own gain layers; nothing here uses audio files.

type Part = 'strings' | 'stringsStac' | 'brass' | 'taiko' | 'tick' | 'arp' | 'piano' | 'choir' | 'pulse' | 'swell' | 'hit';

interface Cue {
  bpm: number;
  /** One chord (MIDI notes) per bar, looped. */
  chords: number[][];
  /** Which parts play on which 16th-steps (0..15) of each bar. 'bar' = once per bar. */
  parts: Partial<Record<Part, number[] | 'bar'>>;
  /** Optional melody (MIDI or null) per 16th across the 4 bars (64 steps). */
  melody?: (number | null)[];
  level: number;
}

const C: Record<Exclude<MusicMood, 'none'>, Cue> = {
  calm: { bpm: 70, chords: [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]], parts: { strings: 'bar', piano: [0, 6, 10] }, level: 0.6 },
  tension: { bpm: 92, chords: [[38, 45, 50, 53], [38, 46, 50, 53], [43, 46, 50, 55], [45, 49, 52, 55]], parts: { strings: 'bar', tick: [0, 2, 4, 6, 8, 10, 12, 14], pulse: [0, 4, 8, 12], swell: [8] }, level: 0.7 },
  action: { bpm: 122, chords: [[40, 47, 52, 55], [36, 43, 48, 52], [38, 45, 50, 54], [35, 42, 47, 51]], parts: { taiko: [0, 6, 8, 11, 14], stringsStac: [0, 2, 4, 6, 8, 10, 12, 14], brass: [0], tick: [2, 6, 10, 14] }, level: 0.8 },
  chase: { bpm: 140, chords: [[45, 52, 57, 60], [41, 48, 53, 57], [36, 43, 48, 52], [43, 50, 55, 59]], parts: { arp: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], taiko: [0, 4, 8, 10, 12], strings: 'bar', tick: [2, 6, 10, 14] }, level: 0.8 },
  sorrow: {
    bpm: 62, chords: [[45, 52, 57, 60], [41, 48, 53, 57], [36, 43, 48, 52], [43, 50, 55, 59]], parts: { strings: 'bar' }, level: 0.65,
    melody: [76, null, null, null, 74, null, 72, null, 71, null, null, null, 69, null, null, null, 72, null, null, null, 71, null, 69, null, 67, null, null, null, 65, null, null, null, 64, null, null, null, 67, null, 72, null, 71, null, null, null, 69, null, null, null, 67, null, 69, null, 71, null, 74, null, 72, null, null, null, null, null, null, null],
  },
  hope: { bpm: 80, chords: [[48, 55, 60, 64], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57]], parts: { strings: 'bar', piano: [0, 3, 6, 8, 11, 14], swell: [12] }, level: 0.7 },
  triumph: { bpm: 100, chords: [[48, 55, 60, 64], [41, 48, 53, 57], [43, 50, 55, 59], [48, 55, 60, 64]], parts: { brass: [0, 8], taiko: [0, 8, 12], strings: 'bar', swell: [8], hit: [] }, level: 0.85 },
  villain: { bpm: 74, chords: [[36, 43, 48, 51], [32, 39, 44, 48], [41, 44, 48, 53], [43, 47, 50, 55]], parts: { choir: 'bar', pulse: [0, 6], taiko: [0], brass: [8] }, level: 0.75 },
  stealth: { bpm: 96, chords: [[40, 47, 52, 55], [40, 47, 52, 55], [38, 45, 50, 53], [40, 47, 52, 55]], parts: { pulse: [0, 10], tick: [4, 12], piano: [7] }, level: 0.55 },
  epic: { bpm: 110, chords: [[38, 45, 50, 53], [34, 41, 46, 50], [41, 48, 53, 57], [36, 43, 48, 52]], parts: { taiko: [0, 3, 6, 8, 11, 12, 14], brass: [0, 8], strings: 'bar', choir: 'bar', swell: [12], hit: [0] }, level: 0.9 },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Score {
  private bus: GainNode;
  private layer: GainNode | null = null;
  private mood: MusicMood = 'none';
  private step = 0;
  private nextTime = 0;
  private reverb: ConvolverNode;
  private send: GainNode;

  constructor(private ctx: AudioContext, out: AudioNode, private noise: AudioBuffer) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.6;
    this.bus.connect(out);
    // Long hall reverb for a cinematic space.
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.6);
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = imp.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb.buffer = imp;
    this.send = ctx.createGain();
    this.send.gain.value = 0.45;
    this.send.connect(this.reverb).connect(this.bus);
  }

  get current(): MusicMood {
    return this.mood;
  }

  setVolume(v: number): void {
    this.bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }

  /** Crossfade to a mood over ~2.5 s ('none' fades out). */
  set(mood: MusicMood): void {
    if (mood === this.mood) return;
    const t = this.ctx.currentTime;
    const old = this.layer;
    if (old) {
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + 2.5);
      setTimeout(() => old.disconnect(), 4000);
    }
    this.mood = mood;
    this.layer = null;
    if (mood === 'none') return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(C[mood].level, t + 2.5);
    g.connect(this.bus);
    g.connect(this.send);
    this.layer = g;
    this.step = 0;
    this.nextTime = t + 0.1;
  }

  /** Called from the engine's 25 ms scheduler; schedules ~150 ms ahead. */
  tick(): void {
    if (this.mood === 'none' || !this.layer) return;
    const cue = C[this.mood];
    const ctx = this.ctx;
    const sixteenth = 60 / cue.bpm / 4;
    if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(cue, this.step, this.nextTime, sixteenth);
      this.step = (this.step + 1) % 64;
      this.nextTime += sixteenth;
    }
  }

  private playStep(cue: Cue, step: number, t: number, sx: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = cue.chords[bar % cue.chords.length];
    const barLen = sx * 16;
    const out = this.layer!;
    const on = (p: Part) => {
      const v = cue.parts[p];
      return v === 'bar' ? s === 0 : !!v && v.includes(s);
    };
    if (on('strings')) this.strings(out, chord, t, barLen * 1.05, 0.11);
    if (on('stringsStac')) this.strings(out, chord.slice(1), t, sx * 1.4, 0.07, 0.01);
    if (on('choir')) this.choir(out, chord, t, barLen * 1.05);
    if (on('brass')) this.brass(out, [chord[0] + 12, chord[1] + 12], t, sx * 6);
    if (on('taiko')) this.taiko(out, t, s === 0 ? 0.9 : 0.6);
    if (on('tick')) this.tick16(out, t);
    if (on('pulse')) this.pulse(out, chord[0] - 12, t, sx * 3);
    if (on('arp')) this.arp(out, chord[[0, 1, 2, 3, 2, 1][s % 6]] + 12, t, sx);
    if (on('piano')) this.piano(out, chord[(s / 2) % chord.length | 0] + 24, t, sx * 8);
    if (on('swell') && bar === 3) this.swell(out, t, barLen - s * sx);
    if (on('hit') && bar === 0) this.hit(out, chord, t);
    const mel = cue.melody?.[step];
    if (mel) this.piano(out, mel, t, sx * 10, 0.16);
  }

  // ---- instruments ----

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0.0001, t + Math.max(a, d - 0.3), 0.25);
  }

  private strings(out: AudioNode, notes: number[], t: number, dur: number, level: number, attack = 0.7): void {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1600, t + dur * 0.5);
    const g = ctx.createGain();
    this.env(g, t, attack, level, dur);
    f.connect(g).connect(out);
    for (const n of notes) {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 1);
      }
    }
  }

  private choir(out: AudioNode, notes: number[], t: number, dur: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    this.env(g, t, 1.2, 0.09, dur);
    g.connect(out);
    for (const fq of [700, 1150]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = 6;
      bp.connect(g);
      for (const n of notes) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n + 12);
        o.detune.value = (Math.random() - 0.5) * 14;
        o.connect(bp);
        o.start(t);
        o.stop(t + dur + 1);
      }
    }
  }

  private brass(out: AudioNode, notes: number[], t: number, dur: number): void {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(350, t);
    f.frequency.linearRampToValueAtTime(1900, t + 0.35);
    f.frequency.linearRampToValueAtTime(900, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.25, 0.1, dur);
    f.connect(g).connect(out);
    for (const n of notes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(n - 12);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 1);
    }
  }

  private taiko(out: AudioNode, t: number, level: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level * 0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.8);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(level * 0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(lp).connect(ng).connect(out);
    n.start(t, Math.random());
    n.stop(t + 0.2);
  }

  private tick16(out: AudioNode, t: number): void {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(hp).connect(g).connect(out);
    n.start(t, Math.random());
    n.stop(t + 0.05);
  }

  private pulse(out: AudioNode, note: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private arp(out: AudioNode, note: number, t: number, sx: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = mtof(note);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(500, t + sx * 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + sx * 0.95);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + sx);
  }

  private piano(out: AudioNode, note: number, t: number, dur: number, level = 0.12): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(4, dur));
    g.connect(out);
    for (const [mult, type, lvl] of [[1, 'sine', 1], [2, 'triangle', 0.25], [3, 'sine', 0.08]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(note) * mult;
      const og = ctx.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + Math.min(4, dur) + 0.1);
    }
  }

  private swell(out: AudioNode, t: number, dur: number): void {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(3000, t);
    hp.frequency.linearRampToValueAtTime(8000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    n.connect(hp).connect(g).connect(out);
    n.start(t);
    n.stop(t + dur + 0.6);
  }

  private hit(out: AudioNode, chord: number[], t: number): void {
    this.brass(out, chord.slice(0, 3).map((n) => n + 12), t, 1.6);
    this.taiko(out, t, 1);
    this.swell(out, Math.max(this.ctx.currentTime, t - 0.6), 0.6);
  }
}
