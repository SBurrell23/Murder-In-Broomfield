// Looping score. Two tracks: the Candlewick Case theme over the title screen
// and lobby, and the main game bed once play begins. Crossfades are done on a
// per-track gain node feeding the shared music bus.

import { audio } from './sfx.js';

const TRACKS = {
  lobby: 'assets/audio/candlewick-case.mp3',
  game: 'assets/audio/main-game-music.mp3'
};

class Music {
  constructor() {
    this.current = null;
    this.elements = {};
    this.nodes = {};
    this.wired = false;
  }

  _element(name) {
    if (this.elements[name]) return this.elements[name];
    const el = new Audio(TRACKS[name]);
    el.loop = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    this.elements[name] = el;
    return el;
  }

  // Route the media elements through the Web Audio graph so the music slider
  // shares the same bus as everything else.
  _wire(name) {
    const ctx = audio.init();
    if (!ctx) return null;
    if (this.nodes[name]) return this.nodes[name];
    const el = this._element(name);
    try {
      const src = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(audio.musicBus);
      this.nodes[name] = { src, gain, el };
      return this.nodes[name];
    } catch {
      // Some browsers refuse a second MediaElementSource on the same element;
      // fall back to plain element volume so music still plays.
      this.nodes[name] = { src: null, gain: null, el };
      return this.nodes[name];
    }
  }

  async play(name, { fade = 1.2 } = {}) {
    if (this.current === name) return;
    const ctx = audio.init();
    audio.resume();
    const prev = this.current;
    this.current = name;

    const node = this._wire(name);
    if (!node) return;

    try {
      node.el.currentTime = node.el.currentTime || 0;
      await node.el.play();
    } catch {
      // Autoplay blocked until a gesture - main.js retries on first click.
      return;
    }

    if (node.gain && ctx) {
      const t = ctx.currentTime;
      node.gain.gain.cancelScheduledValues(t);
      node.gain.gain.setValueAtTime(node.gain.gain.value, t);
      node.gain.gain.linearRampToValueAtTime(1, t + fade);
    } else {
      node.el.volume = 1;
    }

    if (prev && prev !== name) this.stop(prev, { fade });
  }

  stop(name = this.current, { fade = 1.0 } = {}) {
    const node = this.nodes[name];
    if (!node) return;
    const ctx = audio.ctx;
    if (node.gain && ctx) {
      const t = ctx.currentTime;
      node.gain.gain.cancelScheduledValues(t);
      node.gain.gain.setValueAtTime(node.gain.gain.value, t);
      node.gain.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => { try { node.el.pause(); } catch {} }, fade * 1000 + 60);
    } else {
      try { node.el.pause(); } catch {}
    }
    if (this.current === name) this.current = null;
  }

  stopAll() {
    Object.keys(this.nodes).forEach(n => this.stop(n, { fade: 0.4 }));
  }
}

export const music = new Music();
