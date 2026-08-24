export class AudioService {
  #context = null;
  #musicTimer = null;
  #musicStep = 0;

  constructor(storage = window.localStorage) {
    this.storage = storage;
    this.muted = storage.getItem("show-tetris:muted") === "true";
    this.sfxVolume = Number(storage.getItem("show-tetris:sfx-volume") ?? 0.35);
    this.musicVolume = Number(storage.getItem("show-tetris:music-volume") ?? 0.15);
  }

  async unlock() {
    if (!this.#context) this.#context = new AudioContext();
    if (this.#context.state === "suspended") await this.#context.resume();
  }

  tone(frequency, duration = 0.08, options = {}) {
    if (this.muted) return;
    this.unlock().then(() => {
      const now = this.#context.currentTime + (options.delay ?? 0);
      const oscillator = this.#context.createOscillator();
      const gain = this.#context.createGain();
      oscillator.type = options.type ?? "square";
      oscillator.frequency.setValueAtTime(frequency, now);
      if (options.toFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(options.toFrequency, now + duration);
      }
      const volume = (options.music ? this.musicVolume : this.sfxVolume) * (options.gain ?? 0.25);
      gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(this.#context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }).catch(() => {});
  }

  setMuted(muted) {
    this.muted = muted;
    this.storage.setItem("show-tetris:muted", String(muted));
  }

  setVolume(kind, value) {
    const normalized = Math.min(1, Math.max(0, Number(value)));
    if (kind === "music") this.musicVolume = normalized;
    else this.sfxVolume = normalized;
    this.storage.setItem(`show-tetris:${kind}-volume`, String(normalized));
  }

  startMusic() {
    if (this.#musicTimer) return () => this.stopMusic();
    const notes = [220, 277.18, 329.63, 440, 329.63, 277.18, 246.94, 329.63];
    this.#musicTimer = window.setInterval(() => {
      this.tone(notes[this.#musicStep % notes.length], 0.16, { music: true, type: "triangle", gain: 0.18 });
      this.#musicStep += 1;
    }, 220);
    return () => this.stopMusic();
  }

  stopMusic() {
    if (this.#musicTimer) window.clearInterval(this.#musicTimer);
    this.#musicTimer = null;
  }
}
