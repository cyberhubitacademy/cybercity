import { voiceKey } from './voiceKey';

// Plays pre-generated Piper voice clips (public/voices/<key>.mp3) for dialogue.
// The manifest maps line keys to durations so subtitles can be paced to speech.

export class VoiceOver {
  private manifest: Record<string, number> = {};
  private current: HTMLAudioElement | null = null;
  volume = 1;

  constructor(private base: string) {}

  async load(): Promise<void> {
    try {
      const r = await fetch(`${this.base}voices/manifest.json`, { cache: 'no-cache' });
      if (r.ok) this.manifest = (await r.json()) as Record<string, number>;
    } catch {
      /* no voice pack: dialogue stays text-only */
    }
  }

  /** Clip length in seconds, or null if this line has no recorded voice. */
  duration(speaker: string, text: string): number | null {
    return this.manifest[voiceKey(speaker, text)] ?? null;
  }

  /** Play a line's clip. Returns false if there is no clip for it. */
  play(speaker: string, text: string): boolean {
    const key = voiceKey(speaker, text);
    if (!(key in this.manifest)) return false;
    this.stop();
    if (this.volume <= 0) return true;
    const a = new Audio(`${this.base}voices/${key}.mp3`);
    a.volume = Math.min(1, this.volume);
    this.current = a;
    a.play().catch((err: Error) => {
      // Autoplay blocked (no user gesture yet): retry on the next click or key press.
      console.warn('[voice] blocked:', err.name);
      const retry = () => {
        window.removeEventListener('pointerdown', retry, true);
        window.removeEventListener('keydown', retry, true);
        if (this.current === a) void a.play().catch(() => undefined);
      };
      window.addEventListener('pointerdown', retry, true);
      window.addEventListener('keydown', retry, true);
    });
    return true;
  }

  stop(): void {
    if (this.current) {
      this.current.pause();
      this.current = null;
    }
  }
}
