// Synthesized sound effects. No sample files - everything here is generated in
// Web Audio at call time, which keeps the payload small and lets each cue be
// tuned by ear. Two gain buses (music / effects) hang off the master so the
// settings panel can ride them independently.

const STORE_KEY = 'mib.audio.v1';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.settings = { master: 0.9, music: 0.45, sfx: 0.75, muted: false };
    this._load();
    this._unlockBound = null;
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) Object.assign(this.settings, JSON.parse(raw));
    } catch { /* storage may be unavailable; defaults are fine */ }
  }

  _save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
  }

  // Browsers require a gesture before audio starts; call this from any click.
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();

    // A gentle limiter keeps stacked cues from clipping.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.18;

    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    this.applySettings();
    return this.ctx;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  applySettings() {
    if (!this.ctx) return;
    const m = this.settings.muted ? 0 : this.settings.master;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(m, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.settings.music, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.02);
  }

  set(key, value) {
    this.settings[key] = value;
    this.applySettings();
    this._save();
  }

  get(key) { return this.settings[key]; }

  // ------------------------------------------------------------ primitives ---

  _now() { return this.ctx.currentTime; }

  _env(node, t0, { a = 0.005, d = 0.12, s = 0, r = 0.08, peak = 1, sustain = 0 }) {
    const g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    if (sustain > 0) {
      g.exponentialRampToValueAtTime(Math.max(s, 0.0002), t0 + a + d);
      g.setValueAtTime(Math.max(s, 0.0002), t0 + a + d + sustain);
      g.exponentialRampToValueAtTime(0.0001, t0 + a + d + sustain + r);
    } else {
      g.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
    }
  }

  _tone({ freq = 440, type = 'sine', t0 = null, dur = 0.2, peak = 0.3, glide = null, dest = null, ...env }) {
    if (!this.ctx) return;
    const t = t0 ?? this._now();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(glide, 1), t + dur);
    osc.connect(gain);
    gain.connect(dest || this.sfxBus);
    this._env(gain, t, { peak, d: dur, ...env });
    osc.start(t);
    osc.stop(t + dur + (env.sustain || 0) + 0.4);
    return { osc, gain };
  }

  _noise({ t0 = null, dur = 0.25, peak = 0.3, type = 'lowpass', freq = 1200, q = 1, sweep = null, dest = null, ...env }) {
    if (!this.ctx) return;
    const t = t0 ?? this._now();
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * (dur + 0.1)));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    filt.Q.value = q;
    if (sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(sweep, 20), t + dur);
    const gain = this.ctx.createGain();

    src.connect(filt); filt.connect(gain); gain.connect(dest || this.sfxBus);
    this._env(gain, t, { peak, d: dur, ...env });
    src.start(t);
    src.stop(t + dur + 0.2);
    return { src, gain, filt };
  }

  // ----------------------------------------------------------------- cues ---

  click() {
    if (!this.ctx) return;
    this._noise({ dur: 0.045, peak: 0.16, type: 'highpass', freq: 2200, a: 0.001, r: 0.02 });
    this._tone({ freq: 320, type: 'triangle', dur: 0.05, peak: 0.07, a: 0.001, r: 0.03 });
  }

  hover() {
    if (!this.ctx) return;
    this._tone({ freq: 620, type: 'sine', dur: 0.04, peak: 0.035, a: 0.004, r: 0.03 });
  }

  // Paper sliding across a table.
  deal(i = 0) {
    if (!this.ctx) return;
    const t = this._now() + i * 0.06;
    this._noise({ t0: t, dur: 0.16, peak: 0.14, type: 'bandpass', freq: 1800, q: 0.8, sweep: 700, a: 0.006, r: 0.06 });
  }

  flip() {
    if (!this.ctx) return;
    this._noise({ dur: 0.12, peak: 0.16, type: 'highpass', freq: 900, sweep: 2600, a: 0.004, r: 0.05 });
  }

  // A gunshot. Four layers, because a single noise burst reads as a click:
  // a bright transient crack, the broadband body of the report, a low chest
  // thump, and a short tail that suggests the room it went off in.
  bulletPlace() {
    if (!this.ctx) return;
    const t = this._now();

    // Crack: the supersonic snap, very short and very bright.
    this._noise({ t0: t, dur: 0.035, peak: 0.75, type: 'highpass', freq: 2600, sweep: 5200, a: 0.0004, r: 0.02 });

    // Report: the main body, sweeping down as the pressure wave collapses.
    this._noise({ t0: t + 0.002, dur: 0.14, peak: 0.62, type: 'lowpass', freq: 3600, sweep: 320, a: 0.0006, r: 0.1 });
    this._noise({ t0: t + 0.004, dur: 0.09, peak: 0.34, type: 'bandpass', freq: 900, q: 0.7, sweep: 260, a: 0.0006, r: 0.07 });

    // Thump: the low end you feel more than hear.
    this._tone({ t0: t, freq: 128, type: 'sine', dur: 0.19, peak: 0.5, glide: 38, a: 0.0008, r: 0.13 });
    this._tone({ t0: t + 0.006, freq: 62, type: 'sine', dur: 0.24, peak: 0.34, glide: 30, a: 0.002, r: 0.18 });

    // Tail: the report bouncing off the walls.
    this._noise({ t0: t + 0.05, dur: 0.42, peak: 0.10, type: 'lowpass', freq: 1500, sweep: 260, a: 0.02, r: 0.36 });
    this._noise({ t0: t + 0.14, dur: 0.34, peak: 0.045, type: 'bandpass', freq: 700, q: 1.1, a: 0.05, r: 0.3 });
  }

  // Badge leaves the hand: a whoosh, then metal on wood.
  badgeThrow() {
    if (!this.ctx) return;
    const t = this._now();
    this._noise({ t0: t, dur: 0.3, peak: 0.22, type: 'bandpass', freq: 400, q: 1.4, sweep: 2400, a: 0.03, r: 0.1 });
    this._tone({ t0: t + 0.26, freq: 1460, type: 'triangle', dur: 0.5, peak: 0.2, a: 0.002, r: 0.42 });
    this._tone({ t0: t + 0.26, freq: 2190, type: 'sine', dur: 0.55, peak: 0.1, a: 0.002, r: 0.48 });
    this._tone({ t0: t + 0.265, freq: 150, type: 'sine', dur: 0.2, peak: 0.24, glide: 70, a: 0.001, r: 0.12 });
  }

  // Verdict: correct. A rising minor-to-major resolution with a bell on top.
  verdictCorrect() {
    if (!this.ctx) return;
    const t = this._now();
    [261.63, 329.63, 392.00, 523.25].forEach((f, i) => {
      this._tone({ t0: t + i * 0.09, freq: f, type: 'triangle', dur: 0.5, peak: 0.16, a: 0.006, r: 0.5, sustain: 0.1 });
    });
    this._tone({ t0: t + 0.36, freq: 1046.5, type: 'sine', dur: 1.3, peak: 0.14, a: 0.004, r: 1.2 });
    this._noise({ t0: t + 0.36, dur: 0.5, peak: 0.05, type: 'highpass', freq: 5000, a: 0.01, r: 0.45 });
  }

  // Verdict: wrong. A tritone slab that sags.
  verdictWrong() {
    if (!this.ctx) return;
    const t = this._now();
    this._tone({ t0: t, freq: 146.83, type: 'sawtooth', dur: 0.9, peak: 0.16, glide: 92, a: 0.006, r: 0.6 });
    this._tone({ t0: t, freq: 207.65, type: 'sawtooth', dur: 0.9, peak: 0.13, glide: 130, a: 0.006, r: 0.6 });
    this._tone({ t0: t + 0.05, freq: 98, type: 'square', dur: 0.7, peak: 0.09, glide: 62, a: 0.01, r: 0.5 });
    this._noise({ t0: t, dur: 0.4, peak: 0.12, type: 'lowpass', freq: 700, sweep: 140, a: 0.004, r: 0.3 });
  }

  // A single clock stroke to mark the turn of a round.
  roundAdvance() {
    if (!this.ctx) return;
    const t = this._now();
    [[220, 0.2], [329.6, 0.12], [523.3, 0.07], [659.3, 0.04]].forEach(([f, p]) => {
      this._tone({ t0: t, freq: f, type: 'sine', dur: 1.8, peak: p, a: 0.003, r: 1.7 });
    });
    this._noise({ t0: t, dur: 0.12, peak: 0.1, type: 'bandpass', freq: 3000, q: 2, a: 0.001, r: 0.1 });
  }

  // Distant thunder over Broomfield as the case opens.
  gameStart() {
    if (!this.ctx) return;
    const t = this._now();
    this._noise({ t0: t, dur: 1.9, peak: 0.3, type: 'lowpass', freq: 320, sweep: 70, a: 0.18, r: 1.4 });
    this._tone({ t0: t + 0.1, freq: 55, type: 'sine', dur: 1.6, peak: 0.22, glide: 34, a: 0.12, r: 1.2 });
    this._tone({ t0: t + 0.7, freq: 82, type: 'triangle', dur: 1.2, peak: 0.1, glide: 46, a: 0.2, r: 0.9 });
  }

  winSting() {
    if (!this.ctx) return;
    const t = this._now();
    [130.81, 196, 261.63, 329.63, 392].forEach((f, i) => {
      this._tone({ t0: t + i * 0.07, freq: f, type: 'triangle', dur: 1.4, peak: 0.15, a: 0.008, r: 1.3, sustain: 0.25 });
    });
  }

  loseSting() {
    if (!this.ctx) return;
    const t = this._now();
    [130.81, 155.56, 185, 233.08].forEach((f, i) => {
      this._tone({ t0: t + i * 0.11, freq: f / 2, type: 'sawtooth', dur: 1.6, peak: 0.11, a: 0.02, r: 1.4, sustain: 0.2 });
    });
    this._noise({ t0: t, dur: 1.4, peak: 0.08, type: 'lowpass', freq: 400, sweep: 90, a: 0.1, r: 1.2 });
  }

  playerJoin() {
    if (!this.ctx) return;
    const t = this._now();
    this._tone({ t0: t, freq: 392, type: 'sine', dur: 0.18, peak: 0.12, a: 0.004, r: 0.14 });
    this._tone({ t0: t + 0.1, freq: 587.33, type: 'sine', dur: 0.28, peak: 0.1, a: 0.004, r: 0.24 });
  }

  playerLeave() {
    if (!this.ctx) return;
    const t = this._now();
    this._tone({ t0: t, freq: 392, type: 'sine', dur: 0.2, peak: 0.11, a: 0.004, r: 0.16 });
    this._tone({ t0: t + 0.1, freq: 261.63, type: 'sine', dur: 0.34, peak: 0.09, a: 0.004, r: 0.3 });
  }

  error() {
    if (!this.ctx) return;
    this._tone({ freq: 155, type: 'square', dur: 0.14, peak: 0.1, a: 0.002, r: 0.09 });
    this._tone({ t0: this._now() + 0.1, freq: 116, type: 'square', dur: 0.18, peak: 0.09, a: 0.002, r: 0.12 });
  }

  // Typewriter tick used by the narration crawl.
  tick() {
    if (!this.ctx) return;
    this._noise({ dur: 0.03, peak: 0.09, type: 'bandpass', freq: 2600, q: 1.6, a: 0.001, r: 0.02 });
  }

  // Time is up on a round. Deliberately a plain, unmistakable station beep -
  // it is a nudge to move on, not a dramatic beat.
  timeUp() {
    if (!this.ctx) return;
    const t = this._now();
    for (let i = 0; i < 3; i++) {
      this._tone({ t0: t + i * 0.34, freq: 880, type: 'square', dur: 0.16, peak: 0.2, a: 0.004, r: 0.1 });
      this._tone({ t0: t + i * 0.34, freq: 1320, type: 'sine', dur: 0.16, peak: 0.1, a: 0.004, r: 0.1 });
    }
  }

  // Quiet pip for the final countdown seconds.
  clockTick() {
    if (!this.ctx) return;
    this._tone({ freq: 1200, type: 'sine', dur: 0.05, peak: 0.06, a: 0.002, r: 0.04 });
  }

  reveal() {
    if (!this.ctx) return;
    const t = this._now();
    this._noise({ t0: t, dur: 0.7, peak: 0.14, type: 'highpass', freq: 1200, sweep: 5200, a: 0.25, r: 0.4 });
    this._tone({ t0: t + 0.25, freq: 880, type: 'sine', dur: 0.9, peak: 0.1, a: 0.02, r: 0.8 });
  }
}

export const audio = new AudioEngine();
