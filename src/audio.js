// Synthesised sound effects (WebAudio, no asset files). The audio context is
// created on the first touch / key press, as browsers require. Mute state is
// remembered in localStorage.

import { CONFIG } from './config.js';

const A = CONFIG.audio;

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = load();
    this.last = {}; // per-sound throttle
  }

  // Call from a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = A.volume;
    this.master.connect(this.ctx.destination);
    // One second of white noise, reused for every noisy sound.
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    save(this.muted);
    return this.muted;
  }

  // A tone sliding from f0 to f1.
  tone(f0, f1, dur, { type = 'triangle', vol = 0.3, delay = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Filtered noise, the filter sweeping from f0 to f1.
  noise(dur, f0, f1 = f0, { vol = 0.3, type = 'bandpass', q = 1, delay = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name, level = 1) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < (THROTTLE[name] ?? 0.03)) return;
    this.last[name] = now;
    SOUNDS[name]?.(this, level);
  }
}

const THROTTLE = { dig: 0.07, land: 0.08, smash: 0.06 };

const SOUNDS = {
  jump: (s) => s.tone(320, 640, 0.12, { type: 'square', vol: 0.12 }),
  wallJump: (s) => { s.noise(0.05, 2500, 1500, { vol: 0.15 }); s.tone(380, 760, 0.12, { type: 'square', vol: 0.12 }); },
  land: (s, v) => s.noise(0.09, 400, 120, { vol: 0.12 + 0.25 * Math.min(1, v), type: 'lowpass' }),
  hardLanding: (s) => { s.noise(0.18, 300, 60, { vol: 0.5, type: 'lowpass' }); s.tone(110, 50, 0.25, { type: 'sine', vol: 0.4 }); },
  dive: (s) => s.noise(0.3, 600, 2400, { vol: 0.12, q: 2 }),
  ears: (s) => s.tone(520, 700, 0.14, { type: 'sine', vol: 0.12 }),
  dig: (s) => s.noise(0.07, 900, 500, { vol: 0.18, q: 3 }),
  clunk: (s) => s.tone(140, 90, 0.1, { type: 'square', vol: 0.15 }),
  smash: (s) => s.noise(0.15, 1400, 300, { vol: 0.3 }),
  perfect: (s) => { s.tone(880, 880, 0.18, { type: 'sine', vol: 0.18 }); s.tone(1320, 1320, 0.22, { type: 'sine', vol: 0.12, delay: 0.05 }); },
  chain: (s, n) => [523, 659, 784, 1047].slice(0, 2 + Math.min(2, n)).forEach((f, i) =>
    s.tone(f, f, 0.16, { type: 'triangle', vol: 0.18, delay: i * 0.06 })),
  hurt: (s) => { s.tone(420, 110, 0.28, { type: 'sawtooth', vol: 0.18 }); s.noise(0.12, 800, 200, { vol: 0.2 }); },
  timeout: (s) => { s.tone(330, 300, 0.1, { vol: 0.12 }); s.tone(260, 220, 0.14, { vol: 0.12, delay: 0.1 }); },
  pad: (s) => s.tone(180, 620, 0.22, { type: 'sine', vol: 0.25 }),
  ring: (s) => s.noise(0.35, 500, 3000, { vol: 0.18, q: 4 }),
  carrot: (s) => { s.tone(660, 660, 0.08, { type: 'square', vol: 0.1 }); s.tone(990, 990, 0.12, { type: 'square', vol: 0.1, delay: 0.08 }); },
  gem: (s) => [988, 1319, 1976].forEach((f, i) => s.tone(f, f, 0.12, { type: 'sine', vol: 0.12, delay: i * 0.05 })),
  rumble: (s) => s.noise(0.9, 160, 60, { vol: 0.35, type: 'lowpass' }),
  skewer: (s) => { s.noise(0.08, 3000, 1200, { vol: 0.2 }); s.tone(700, 300, 0.12, { type: 'square', vol: 0.1 }); },
  gameOver: (s) => [392, 330, 262, 196].forEach((f, i) => s.tone(f, f * 0.98, 0.25, { type: 'triangle', vol: 0.2, delay: i * 0.14 })),
};

function load() {
  try {
    return localStorage.getItem(A.storageKey) === '1';
  } catch {
    return false;
  }
}

function save(muted) {
  try {
    localStorage.setItem(A.storageKey, muted ? '1' : '0');
  } catch {
    // Storage blocked: mute just won't persist.
  }
}
