// Procedural audio for Cyber City: synthwave radio stations, synthesized
// sound effects, engine hum and ambience. No audio files are used.

export type SfxId =
  | 'click' | 'good' | 'bad' | 'type' | 'alert' | 'open' | 'pickup' | 'levelup' | 'passed' | 'failed'
  | 'crash' | 'horn' | 'door' | 'whoosh' | 'beep' | 'cash';

export type MusicMode = 'menu' | 'world' | 'vehicle' | 'off';

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  voice: number;
}

interface Station {
  name: string;
  bpm: number;
  /** Chord tones (MIDI) per bar, 4 bars loop. */
  chords: number[][];
  /** Bass root (MIDI) per bar. */
  bass: number[];
  /** 16-step patterns (1 = hit). */
  kick: number[];
  snare: number[];
  hat: number[];
  /** Bass rhythm per 16 steps: 0 rest, 1 root, 2 octave up. */
  bassPat: number[];
  /** Lead melody, 64 steps (MIDI or 0 = rest). */
  lead: number[];
  arp: boolean;
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  padCutoff: number;
  swing: number;
  /** 0..1 overall brightness / grit. */
  grit: number;
}

const X = 1, _ = 0;

function melody(...bars: (number | 0)[][]): number[] {
  const out: number[] = [];
  for (const b of bars) for (let i = 0; i < 16; i++) out.push(b[i] ?? 0);
  return out;
}

const STATIONS: Station[] = [
  {
    name: 'NEON FM 80.8',
    bpm: 100,
    chords: [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]], // Am F C G
    bass: [33, 29, 36, 31],
    kick: [X, _, _, _, X, _, _, _, X, _, _, _, X, _, _, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hat: [_, _, X, _, _, _, X, _, _, _, X, _, _, _, X, X],
    bassPat: [1, _, 1, 2, 1, _, 1, 2, 1, _, 1, 2, 1, _, 1, 2],
    lead: melody(
      [76, 0, 0, 0, 74, 0, 72, 0, 0, 0, 69, 0, 0, 0, 0, 0],
      [72, 0, 0, 0, 74, 0, 76, 0, 0, 0, 77, 0, 76, 0, 0, 0],
      [79, 0, 0, 0, 76, 0, 0, 0, 72, 0, 0, 0, 74, 0, 76, 0],
      [74, 0, 0, 0, 71, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0],
    ),
    arp: true,
    bassWave: 'sawtooth',
    leadWave: 'sawtooth',
    padCutoff: 1500,
    swing: 0,
    grit: 0.5,
  },
  {
    name: 'BYTE BEACH 104',
    bpm: 118,
    chords: [[66, 69, 73], [66, 69, 74], [64, 69, 73], [64, 68, 71]], // F#m D A E
    bass: [30, 26, 33, 28],
    kick: [X, _, _, _, X, _, _, _, X, _, _, _, X, _, _, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, X],
    hat: [_, _, X, _, _, _, X, _, _, _, X, _, _, _, X, _],
    bassPat: [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2],
    lead: melody(
      [78, 0, 81, 0, 78, 0, 76, 0, 73, 0, 0, 0, 76, 0, 78, 0],
      [74, 0, 0, 0, 78, 0, 0, 0, 81, 0, 78, 0, 74, 0, 0, 0],
      [76, 0, 73, 0, 76, 0, 81, 0, 80, 0, 0, 0, 76, 0, 0, 0],
      [80, 0, 78, 0, 76, 0, 73, 0, 71, 0, 0, 0, 0, 0, 0, 0],
    ),
    arp: true,
    bassWave: 'square',
    leadWave: 'square',
    padCutoff: 2200,
    swing: 0,
    grit: 0.6,
  },
  {
    name: 'CIPHER CHILL',
    bpm: 80,
    chords: [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 67]], // Dmaj7 Bm7 Gmaj7 A7
    bass: [38, 35, 31, 33],
    kick: [X, _, _, _, _, _, _, X, _, _, X, _, _, _, _, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hat: [X, _, X, _, X, _, X, _, X, _, X, _, X, _, X, X],
    bassPat: [1, _, _, _, _, _, _, 1, _, _, 1, _, _, _, _, _],
    lead: melody(
      [0, 0, 78, 0, 0, 0, 76, 0, 0, 0, 74, 0, 0, 0, 0, 0],
      [0, 0, 74, 0, 0, 0, 73, 0, 71, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 71, 0, 74, 0, 0, 0, 78, 0, 0, 0, 0, 0, 0, 0],
      [76, 0, 0, 0, 73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ),
    arp: false,
    bassWave: 'triangle',
    leadWave: 'triangle',
    padCutoff: 900,
    swing: 0.12,
    grit: 0.1,
  },
  {
    name: 'PINK TIDE PIRATE',
    bpm: 130,
    chords: [[64, 67, 71], [60, 64, 67], [57, 60, 64], [59, 63, 66]], // Em C Am B
    bass: [28, 24, 33, 35],
    kick: [X, _, _, _, X, _, _, _, X, _, _, _, X, _, X, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hat: [X, X, X, X, X, X, X, X, X, X, X, X, X, X, X, X],
    bassPat: [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1],
    lead: melody(
      [76, 0, 0, 79, 0, 0, 76, 0, 74, 0, 71, 0, 0, 0, 0, 0],
      [72, 0, 0, 76, 0, 0, 79, 0, 0, 0, 76, 0, 0, 0, 0, 0],
      [69, 0, 0, 72, 0, 0, 76, 0, 0, 0, 81, 0, 79, 0, 0, 0],
      [78, 0, 0, 0, 75, 0, 0, 0, 71, 0, 0, 0, 0, 0, 0, 0],
    ),
    arp: true,
    bassWave: 'sawtooth',
    leadWave: 'sawtooth',
    padCutoff: 1200,
    swing: 0,
    grit: 0.9,
  },
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private delay!: DelayNode;
  private delaySend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private vol: Volumes = { master: 0.8, music: 0.6, sfx: 0.8, ambient: 0.6, voice: 0.8 };
  private mode: MusicMode = 'off';
  private station = 0;
  private bonus = false;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private paused = false;
  private voiceEnabled = false;
  // continuous voices
  private engOsc: OscillatorNode[] = [];
  private engGain!: GainNode;
  private engFilter!: BiquadFilterNode;
  private ocean!: GainNode;
  private city!: GainNode;
  private crickets!: GainNode;

  get ready(): boolean {
    return !!this.ctx;
  }

  /** Create the AudioContext. Call from a user gesture; safe to call repeatedly. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.musicFilter).connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);

    // noise buffer (2 s)
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // reverb (generated impulse) and tempo delay, both fed from the music bus
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2;
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = imp.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb.buffer = imp;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb).connect(this.musicBus);
    this.delay = ctx.createDelay(1.5);
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2500;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.25;
    this.delaySend.connect(this.delay);
    dl.connect(this.musicBus);

    this.buildEngine();
    this.buildAmbience();
    this.applyVolumes();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  setVolumes(v: Volumes): void {
    this.vol = { ...v };
    this.applyVolumes();
  }

  setVoiceEnabled(on: boolean): void {
    this.voiceEnabled = on;
    if (!on && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  private modeGain(): number {
    switch (this.mode) {
      case 'menu': return 0.8;
      case 'vehicle': return 1;
      case 'world': return 0.32;
      default: return 0;
    }
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * this.modeGain() * (this.station < 0 ? 0 : 1) * 0.55, t, 0.15);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 0.8, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.ambient * 0.7, t, 0.2);
  }

  // ---------------- music ----------------

  stations(): string[] {
    return STATIONS.slice(0, this.bonus ? 4 : 3).map((s) => s.name);
  }

  setBonusStation(enabled: boolean): void {
    this.bonus = enabled;
    if (!enabled && this.station === 3) this.setStation(0);
  }

  currentStation(): string | null {
    return this.station < 0 ? null : STATIONS[this.station].name;
  }

  setStation(index: number): void {
    const count = this.bonus ? 4 : 3;
    this.station = index < 0 ? -1 : index % count;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.08;
    this.applyVolumes();
  }

  /** Cycles stations, including "radio off". Returns the new station name (or 'RADIO OFF'). */
  nextStation(): string {
    const count = this.bonus ? 4 : 3;
    const next = this.station + 1 >= count ? -1 : this.station + 1;
    this.setStation(next);
    this.sfx('whoosh');
    return next < 0 ? 'RADIO OFF' : STATIONS[next].name;
  }

  setMusicMode(mode: MusicMode): void {
    const wasMenu = this.mode === 'menu';
    this.mode = mode;
    if (mode === 'menu' && !wasMenu) this.setStation(0);
    this.applyVolumes();
  }

  /** Muffle music (pause menus) with a low-pass on the music bus. */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(paused ? 650 : 20000, this.ctx.currentTime, 0.12);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.station < 0 || this.mode === 'off') {
      this.nextTime = ctx.currentTime + 0.05;
      return;
    }
    const st = STATIONS[this.station];
    const sixteenth = 60 / st.bpm / 4;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const s = this.step % 64;
      const swing = s % 2 === 1 ? st.swing * sixteenth : 0;
      this.playStep(st, s, this.nextTime + swing, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  private playStep(st: Station, s: number, t: number, six: number): void {
    const bar = Math.floor(s / 16);
    const i = s % 16;
    const chord = st.chords[bar];
    if (st.kick[i]) this.kick(t, st.grit);
    if (st.snare[i]) this.snare(t, st.grit);
    if (st.hat[i]) this.hat(t, i % 4 === 2 ? 0.5 : 0.28);
    const bp = st.bassPat[i];
    if (bp) this.bass(t, mtof(st.bass[bar] + (bp === 2 ? 12 : 0)), six * (st.bpm < 90 ? 3 : 0.9), st.bassWave, st.grit);
    if (i === 0) this.pad(t, chord.map(mtof), six * 16, st.padCutoff);
    // Arpeggio: 16ths in vehicles/menus, sparser 8ths on foot.
    if (st.arp && (this.mode !== 'world' || i % 2 === 0)) {
      const n = chord[i % chord.length] + (Math.floor(i / chord.length) % 2 ? 12 : 0);
      this.pluck(t, mtof(n + 12), six * 0.8, this.mode === 'world' ? 0.035 : 0.045);
    }
    const note = st.lead[s];
    if (note) {
      let len = 1;
      while (len < 6 && !st.lead[(s + len) % 64]) len++;
      this.lead(t, mtof(note), six * len * 0.95, st.leadWave);
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private kick(t: number, grit: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140 + grit * 30, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    this.env(g, t, 0.9, 0.003, 0.32);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, dest: AudioNode, sends = false): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, peak, 0.002, dur);
    src.connect(f).connect(g).connect(dest);
    if (sends) g.connect(this.reverbSend);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private snare(t: number, grit: number): void {
    this.noise(t, 0.22, 'bandpass', 1800, 0.8, 0.5 + grit * 0.15, this.musicBus, true);
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    this.env(g, t, 0.25, 0.002, 0.1);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.15);
  }

  private hat(t: number, peak: number): void {
    this.noise(t, 0.045, 'highpass', 7500, 0.7, peak * 0.5, this.musicBus);
  }

  private bass(t: number, f: number, dur: number, wave: OscillatorType, grit: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.value = f;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 6;
    filt.frequency.setValueAtTime(250 + grit * 300, t);
    filt.frequency.exponentialRampToValueAtTime(900 + grit * 900, t + 0.02);
    filt.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.42, 0.005, dur);
    o.connect(filt).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pad(t: number, freqs: number[], dur: number, cutoff: number): void {
    const ctx = this.ctx!;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(cutoff * 0.5, t);
    filt.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.35);
    g.gain.setValueAtTime(0.09, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
    filt.connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverbSend);
    for (const f of freqs) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(filt);
        o.start(t);
        o.stop(t + dur + 0.3);
      }
    }
  }

  private pluck(t: number, f: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(3200, t);
    filt.frequency.exponentialRampToValueAtTime(600, t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.003, dur);
    o.connect(filt).connect(g);
    g.connect(this.musicBus);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private lead(t: number, f: number, dur: number, wave: OscillatorType): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(dur, 0.4));
    vib.connect(vg).connect(o.frequency);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = wave === 'triangle' ? 3000 : 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085, t + 0.02);
    g.gain.setValueAtTime(0.085, t + Math.max(0.03, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(filt).connect(g);
    g.connect(this.musicBus);
    g.connect(this.delaySend);
    g.connect(this.reverbSend);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
  }

  // ---------------- sfx ----------------

  private tone(t: number, f: number, dur: number, type: OscillatorType, peak: number, slideTo?: number, dest?: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.004, dur);
    o.connect(g).connect(dest ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  sfx(name: SfxId): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    const B = this.sfxBus;
    switch (name) {
      case 'click': this.tone(t, 1400, 0.035, 'square', 0.08, 900); break;
      case 'type': this.noise(t, 0.015, 'highpass', 5000, 1, 0.05, B); break;
      case 'beep': this.tone(t, 1000, 0.1, 'sine', 0.2); break;
      case 'good': [72, 76, 79, 84].forEach((m, i) => this.tone(t + i * 0.07, mtof(m), 0.18, 'triangle', 0.22)); break;
      case 'bad': this.tone(t, 220, 0.28, 'sawtooth', 0.14, 110); this.tone(t + 0.12, 180, 0.25, 'square', 0.08, 90); break;
      case 'alert': for (let k = 0; k < 2; k++) { this.tone(t + k * 0.3, 880, 0.13, 'square', 0.1); this.tone(t + k * 0.3 + 0.15, 660, 0.13, 'square', 0.1); } break;
      case 'open': this.noise(t, 0.25, 'bandpass', 900, 2, 0.12, B); this.tone(t + 0.05, 600, 0.12, 'sine', 0.15, 1200); break;
      case 'whoosh': {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.5;
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(4000, t + 0.35);
        const g = ctx.createGain();
        this.env(g, t, 0.18, 0.08, 0.3);
        src.connect(f).connect(g).connect(B);
        src.start(t);
        src.stop(t + 0.5);
        break;
      }
      case 'pickup': this.tone(t, 900, 0.12, 'sine', 0.2, 1800); this.tone(t + 0.08, 2400, 0.2, 'triangle', 0.1); break;
      case 'cash': this.tone(t, 2093, 0.08, 'triangle', 0.18); this.tone(t + 0.08, 2637, 0.3, 'triangle', 0.18); this.noise(t + 0.05, 0.12, 'highpass', 6000, 1, 0.08, B); break;
      case 'levelup': [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => this.tone(t + i * 0.06, mtof(m), 0.22, 'square', 0.08)); break;
      case 'passed': {
        const chords = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]];
        chords.forEach((c, i) => c.forEach((m) => this.tone(t + i * 0.22, mtof(m), i === 3 ? 1.1 : 0.2, 'sawtooth', 0.06)));
        this.noise(t + 0.66, 0.6, 'highpass', 4000, 0.7, 0.08, B);
        break;
      }
      case 'failed': [67, 63, 60, 55].forEach((m, i) => this.tone(t + i * 0.22, mtof(m), 0.3, 'sawtooth', 0.08)); break;
      case 'crash':
        this.noise(t, 0.5, 'lowpass', 900, 0.5, 0.5, B);
        this.tone(t, 90, 0.3, 'sine', 0.5, 40);
        this.noise(t + 0.03, 0.25, 'highpass', 3000, 1, 0.15, B);
        break;
      case 'horn': this.tone(t, 392, 0.45, 'square', 0.08); this.tone(t, 494, 0.45, 'square', 0.07); break;
      case 'door': this.tone(t, 120, 0.12, 'sine', 0.3, 60); this.noise(t + 0.02, 0.05, 'bandpass', 2500, 2, 0.12, B); break;
    }
  }

  // ---------------- engine & ambience ----------------

  private buildEngine(): void {
    const ctx = this.ctx!;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter.connect(this.engGain).connect(this.sfxBus);
    for (const [type, mult] of [['sawtooth', 1], ['square', 0.5]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 40 * mult;
      o.connect(this.engFilter);
      o.start();
      this.engOsc.push(o);
    }
  }

  /** Continuous engine hum; speed01 is 0..1 of top speed. */
  engine(on: boolean, speed01: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.max(0, Math.min(1, speed01));
    const base = 38 + s * 120;
    this.engOsc[0].frequency.setTargetAtTime(base, t, 0.08);
    this.engOsc[1].frequency.setTargetAtTime(base * 0.5, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(300 + s * 1400, t, 0.1);
    this.engGain.gain.setTargetAtTime(on ? 0.05 + s * 0.06 : 0, t, 0.12);
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start();
    return src;
  }

  private buildAmbience(): void {
    const ctx = this.ctx!;
    // ocean: low-passed noise with a slow swell
    const of = ctx.createBiquadFilter();
    of.type = 'lowpass';
    of.frequency.value = 520;
    const swell = ctx.createGain();
    swell.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ctx.createGain();
    lg.gain.value = 0.45;
    lfo.connect(lg).connect(swell.gain);
    lfo.start();
    this.ocean = ctx.createGain();
    this.ocean.gain.value = 0;
    this.loopNoise().connect(of).connect(swell).connect(this.ocean).connect(this.ambBus);
    // city hum: deep rumble
    const cf = ctx.createBiquadFilter();
    cf.type = 'lowpass';
    cf.frequency.value = 160;
    this.city = ctx.createGain();
    this.city.gain.value = 0;
    this.loopNoise().connect(cf).connect(this.city).connect(this.ambBus);
    // crickets: high sine, amplitude-modulated in chirps
    const cr = ctx.createOscillator();
    cr.frequency.value = 4300;
    const am = ctx.createGain();
    am.gain.value = 0;
    const chirp = ctx.createOscillator();
    chirp.type = 'square';
    chirp.frequency.value = 28;
    const chirpG = ctx.createGain();
    chirpG.gain.value = 0.5;
    chirp.connect(chirpG).connect(am.gain);
    const gate = ctx.createGain();
    gate.gain.value = 0;
    const slow = ctx.createOscillator();
    slow.type = 'square';
    slow.frequency.value = 1.6;
    const slowG = ctx.createGain();
    slowG.gain.value = 0.5;
    slow.connect(slowG).connect(gate.gain);
    this.crickets = ctx.createGain();
    this.crickets.gain.value = 0;
    cr.connect(am).connect(gate).connect(this.crickets).connect(this.ambBus);
    cr.start();
    chirp.start();
    slow.start();
  }

  ambient(p: { beach: number; night: number; city: number }): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.ocean.gain.setTargetAtTime(Math.max(0, Math.min(1, p.beach)) * 0.35, t, 0.5);
    this.city.gain.setTargetAtTime(Math.max(0, Math.min(1, p.city)) * 0.25, t, 0.5);
    this.crickets.gain.setTargetAtTime(Math.max(0, Math.min(1, p.night)) * 0.012, t, 1);
  }

  // ---------------- voice ----------------

  /** Speak a line with the browser's speech synthesis, if enabled. */
  speak(text: string, voiceHint: 'male' | 'female' | 'neutral' = 'neutral'): void {
    if (!this.voiceEnabled || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.volume = Math.max(0, Math.min(1, this.vol.voice * this.vol.master));
    u.rate = 1.04;
    u.pitch = voiceHint === 'female' ? 1.15 : voiceHint === 'male' ? 0.9 : 1;
    const voices = synth.getVoices().filter((v) => v.lang.startsWith('en'));
    const pick = voices.find((v) => (voiceHint === 'female' ? /female|zira|samantha|aria|jenny/i : /(^|[^e])male|david|guy|daniel|mark/i).test(v.name));
    if (pick) u.voice = pick;
    else if (voices[0]) u.voice = voices[0];
    synth.speak(u);
  }

  suspend(): void {
    this.paused = true;
    void this.ctx?.suspend();
  }

  resume(): void {
    this.paused = false;
    void this.ctx?.resume();
  }

  dispose(): void {
    window.clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }
}
