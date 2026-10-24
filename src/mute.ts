// `?mute=1` in the URL silences the whole page before any game code runs:
// every Web Audio context is held suspended and media elements never play.
// Used for silent testing (and handy for anyone who wants a quiet session).

if (new URLSearchParams(location.search).has('mute')) {
  const proto = AudioContext.prototype;
  proto.resume = function (this: AudioContext) { return this.suspend(); };
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    constructor(opts?: AudioContextOptions) {
      super(opts);
      void this.suspend();
    }
  };
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    this.muted = true;
    return Promise.resolve();
  };
  // speech synthesis fallback too
  if ('speechSynthesis' in window) window.speechSynthesis.speak = () => undefined;
}

export {};
