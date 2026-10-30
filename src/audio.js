"use strict";
// ─── sound ─────────────────────────────────────────────────────────────────
// Every sound in a film is synthesised here, so the repository carries no
// recordings and no licences beyond its own: the effects (whooshes, pops,
// clicks, hits, sparkles) and a music bed made for the film's own cuts.
// Everything is drawn into float buffers at 48 kHz and written as one WAV.
//
// The music follows the film: the first clip gets only pads, the groove
// starts on the second clip's downbeat, and the logo clip lands on a hit with
// the last chord ringing out. Clip lengths are whole bars, so every cut
// falls on a downbeat.

const fs = require("fs");

const SR = 48000;
const TAU = Math.PI * 2;

// ─── buffers ───────────────────────────────────────────────────────────────
class Bus {
  constructor(seconds) {
    this.length = Math.max(1, Math.ceil(seconds * SR));
    this.L = new Float32Array(this.length);
    this.R = new Float32Array(this.length);
  }
  get seconds() {
    return this.length / SR;
  }
  // Adds a mono sample at index i, panned (-1 left, 1 right).
  put(i, v, pan = 0) {
    if (i < 0 || i >= this.length) return;
    this.L[i] += v * Math.min(1, 1 - pan);
    this.R[i] += v * Math.min(1, 1 + pan);
  }
  // Mixes another bus in at a time, with a gain.
  mix(other, at = 0, gain = 1) {
    const start = Math.round(at * SR);
    for (let i = 0; i < other.length; i++) {
      const j = start + i;
      if (j < 0) continue;
      if (j >= this.length) break;
      this.L[j] += other.L[i] * gain;
      this.R[j] += other.R[i] * gain;
    }
  }
}

// A seeded random source: the same film always sounds the same.
function random(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── filters ───────────────────────────────────────────────────────────────
// A biquad (the audio EQ cookbook's), its cutoff settable per sample.
class Biquad {
  constructor(type, freq, q = 0.707) {
    this.type = type;
    this.q = q;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(freq);
  }
  set(freq, q = this.q) {
    const f = Math.max(10, Math.min(SR * 0.45, freq));
    const w = (TAU * f) / SR;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0;
    let b1;
    let b2;
    if (this.type === "lowpass") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (this.type === "highpass") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha];
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// A small stereo reverb: four combs and two allpasses a side (Schroeder's
// design), the sides' delays a little apart so the tail is wide.
function reverb(bus, { size = 0.82, damp = 0.35, wet = 0.3 } = {}) {
  const out = new Bus(bus.seconds);
  const sides = [[bus.L, out.L, 0], [bus.R, out.R, 23]];
  for (const [input, output, spread] of sides) {
    const combs = [1116, 1188, 1277, 1356].map((d) => ({ buf: new Float32Array(Math.round(((d + spread) * SR) / 44100)), i: 0, low: 0 }));
    const passes = [556, 441].map((d) => ({ buf: new Float32Array(Math.round(((d + spread) * SR) / 44100)), i: 0 }));
    for (let n = 0; n < input.length; n++) {
      const x = input[n] * 0.12;
      let y = 0;
      for (const c of combs) {
        const v = c.buf[c.i];
        c.low = v * (1 - damp) + c.low * damp;
        c.buf[c.i] = x + c.low * size;
        c.i = (c.i + 1) % c.buf.length;
        y += v;
      }
      for (const a of passes) {
        const v = a.buf[a.i];
        a.buf[a.i] = y + v * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = v - y;
      }
      output[n] = input[n] * (1 - wet) + y * wet;
    }
  }
  return out;
}

// ─── oscillators ───────────────────────────────────────────────────────────
// A saw with its jumps smoothed (polyBLEP), so high notes do not fizz.
function saw(phase, inc) {
  let v = 2 * phase - 1;
  if (phase < inc) {
    const t = phase / inc;
    v -= t + t - t * t - 1;
  } else if (phase > 1 - inc) {
    const t = (phase - 1) / inc;
    v -= t * t + t + t + 1;
  }
  return v;
}
const noteHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

// ─── effects ───────────────────────────────────────────────────────────────
// Each effect is a short buffer; the film mixes them at the scenes' cues.
function whoosh(seconds, { low = 300, high = 3200, peak = 0.45, pan = true, seed = 3 } = {}) {
  const bus = new Bus(seconds);
  const rnd = random(seed);
  const bp = new Biquad("bandpass", low, 1.1);
  const bp2 = new Biquad("bandpass", low, 1.1);
  for (let i = 0; i < bus.length; i++) {
    const t = i / bus.length;
    // Rises to its peak, then falls away faster than it came.
    const shape = t < peak ? (t / peak) ** 2 : Math.exp(-((t - peak) / (1 - peak)) * 4);
    const f = low + (high - low) * (t < peak ? t / peak : Math.max(0, 1 - (t - peak) / (1 - peak) * 0.8));
    if (i % 32 === 0) {
      bp.set(f, 1.1);
      bp2.set(f * 1.5, 1.4);
    }
    const n = rnd() * 2 - 1;
    const v = (bp.run(n) + 0.6 * bp2.run(n)) * shape * 1.6;
    bus.put(i, v, pan ? (t - 0.5) * 1.2 : 0);
  }
  return bus;
}

function pop({ from = 1300, to = 380, seconds = 0.16 } = {}) {
  const bus = new Bus(seconds);
  let phase = 0;
  for (let i = 0; i < bus.length; i++) {
    const t = i / SR;
    const f = to + (from - to) * Math.exp(-t * 45);
    phase += f / SR;
    const v = Math.sin(TAU * phase) * env(t, 0.002, 0.035) * 0.9;
    bus.put(i, v);
  }
  return bus;
}

function click({ tone = 2400, body = 0, seconds = 0.06, seed = 5, level = 0.8 } = {}) {
  const bus = new Bus(seconds);
  const rnd = random(seed);
  const bp = new Biquad("bandpass", tone, 2.5);
  let phase = 0;
  for (let i = 0; i < bus.length; i++) {
    const t = i / SR;
    phase += (body || 1) / SR;
    const v = bp.run(rnd() * 2 - 1) * env(t, 0.0005, 0.006) * 2.2 + (body ? Math.sin(TAU * phase) * env(t, 0.001, 0.02) * 0.5 : 0);
    bus.put(i, v * level);
  }
  return bus;
}

function typing(seconds = 1.4, seed = 9) {
  const bus = new Bus(seconds);
  const rnd = random(seed);
  for (let t = 0.02; t < seconds - 0.08; t += 0.055 + rnd() * 0.08) {
    bus.mix(click({ tone: 1800 + rnd() * 1600, body: 140 + rnd() * 80, seed: Math.floor(rnd() * 1e6), level: 0.45 + rnd() * 0.35 }), t);
  }
  return bus;
}

function impact({ swell = 0, seconds = 2.2, seed = 13 } = {}) {
  const bus = new Bus(seconds + swell);
  const rnd = random(seed);
  const lp = new Biquad("lowpass", 900, 0.7);
  const hp = new Biquad("highpass", 200, 0.7);
  let phase = 0;
  const start = Math.round(swell * SR);
  // A short swell of noise leading into the hit.
  for (let i = 0; i < start; i++) {
    const t = i / start;
    hp.set(200 + 3000 * t);
    bus.put(i, hp.run(rnd() * 2 - 1) * t ** 2.5 * 0.35, (t - 0.5) * 0.6);
  }
  for (let i = start; i < bus.length; i++) {
    const t = (i - start) / SR;
    const f = 42 + 90 * Math.exp(-t * 18);
    phase += f / SR;
    let v = Math.sin(TAU * phase) * env(t, 0.002, 0.6);
    v += lp.run(rnd() * 2 - 1) * env(t, 0.001, 0.05) * 0.8;
    v = Math.tanh(v * 1.6) * 0.85;
    bus.put(i, v);
  }
  return bus;
}

function bell(notes, { seconds = 1.8, decay = 0.6, partials = [[1, 1], [2.01, 0.35], [2.76, 0.22], [5.4, 0.08]], gap = 0.07, level = 0.4 } = {}) {
  const bus = new Bus(seconds);
  notes.forEach((midi, k) => {
    const f0 = noteHz(midi);
    const start = Math.round(k * gap * SR);
    const pan = notes.length > 1 ? (k / (notes.length - 1) - 0.5) * 0.6 : 0;
    for (const [ratio, amp] of partials) {
      const f = f0 * ratio;
      for (let i = start; i < bus.length; i++) {
        const t = (i - start) / SR;
        const v = Math.sin(TAU * f * t) * amp * env(t, 0.002, decay / Math.sqrt(ratio));
        bus.put(i, v * level, pan);
      }
    }
  });
  return reverb(bus, { wet: 0.35 });
}

function sparkle(seed = 21) {
  const bus = new Bus(1.4);
  const rnd = random(seed);
  for (let k = 0; k < 9; k++) {
    const t0 = k * 0.045 + rnd() * 0.03;
    const f = 2200 + rnd() * 3800;
    const pan = rnd() * 1.6 - 0.8;
    const start = Math.round(t0 * SR);
    for (let i = start; i < bus.length; i++) {
      const t = (i - start) / SR;
      const v = (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2.01 * t)) * env(t, 0.003, 0.09) * 0.16;
      bus.put(i, v, pan);
    }
  }
  return reverb(bus, { wet: 0.45, size: 0.86 });
}

function glitch(seed = 33) {
  const bus = new Bus(0.5);
  const rnd = random(seed);
  let hold = 0;
  let v = 0;
  for (let i = 0; i < bus.length; i++) {
    if (hold-- <= 0) {
      hold = Math.floor(30 + rnd() * 400);
      v = (rnd() * 2 - 1) * (rnd() < 0.3 ? 0 : 0.5);
    }
    bus.put(i, v * env(i / SR, 0.001, 0.15), (rnd() - 0.5) * 0.4);
  }
  return bus;
}

function error() {
  const bus = new Bus(0.5);
  [[0, 330], [0.14, 247]].forEach(([at, f]) => {
    const start = Math.round(at * SR);
    for (let i = start; i < bus.length; i++) {
      const t = (i - start) / SR;
      const v = Math.tanh(Math.sin(TAU * f * t) * 3) * env(t, 0.004, 0.08) * 0.25;
      bus.put(i, v);
    }
  });
  return bus;
}

function riser(seconds = 2) {
  const bus = new Bus(seconds);
  const rnd = random(41);
  const hp = new Biquad("highpass", 400, 0.9);
  let phase = 0;
  for (let i = 0; i < bus.length; i++) {
    const t = i / bus.length;
    if (i % 32 === 0) hp.set(400 + 5000 * t * t);
    phase += (200 + 900 * t * t) / SR;
    const v = (hp.run(rnd() * 2 - 1) * 0.6 + Math.sin(TAU * phase) * 0.15) * t ** 2;
    bus.put(i, v, Math.sin(t * 9) * 0.3);
  }
  return bus;
}

// The effects the scenes ask for by name.
const EFFECTS = {
  whoosh: () => whoosh(0.55, { low: 500, high: 4200, peak: 0.35, seed: 4 }),
  "whoosh-short": () => whoosh(0.4, { low: 600, high: 5000, peak: 0.3, seed: 7 }),
  "whoosh-cinematic": () => whoosh(1.5, { low: 180, high: 2600, peak: 0.28, seed: 11 }),
  pop: () => pop(),
  click: () => click({ tone: 2600, body: 900, level: 0.7 }),
  "click-soft": () => click({ tone: 1500, body: 0, level: 0.45 }),
  "key-press": () => click({ tone: 2100, body: 170, level: 0.6, seconds: 0.08 }),
  typing: () => typing(),
  "impact-bass-1": () => impact({ seconds: 2 }),
  "impact-bass-2": () => impact({ swell: 0.32, seconds: 2 }),
  sparkle: () => sparkle(),
  chime: () => bell([84, 88, 91], { seconds: 2, decay: 0.7, gap: 0.08, level: 0.3 }),
  ping: () => bell([90], { seconds: 1, decay: 0.35, level: 0.35, partials: [[1, 1], [2, 0.25]] }),
  notification: () => bell([88, 93], { seconds: 1.2, decay: 0.3, gap: 0.12, level: 0.35, partials: [[1, 1], [3, 0.2]] }),
  "glitch-1": () => glitch(33),
  error: () => error(),
  riser: () => riser(),
};
// Each effect's peak once drawn: short ticks sit lower than sweeps and hits,
// as they would in a mix, and a cue's volume scales from there.
const PEAKS = { whoosh: 0.75, "whoosh-short": 0.7, "whoosh-cinematic": 0.75, pop: 0.8, click: 0.6, "click-soft": 0.45, "key-press": 0.55,
  typing: 0.55, "impact-bass-1": 0.95, "impact-bass-2": 0.95, sparkle: 0.7, chime: 0.7, ping: 0.65, notification: 0.65, "glitch-1": 0.6, error: 0.6, riser: 0.7 };
const effectCache = new Map();
function effect(name) {
  if (!EFFECTS[name]) return null;
  if (!effectCache.has(name)) {
    const bus = EFFECTS[name]();
    let peak = 0;
    for (const ch of [bus.L, bus.R]) for (const v of ch) peak = Math.max(peak, Math.abs(v));
    const k = peak ? (PEAKS[name] || 0.7) / peak : 1;
    for (const ch of [bus.L, bus.R]) for (let i = 0; i < ch.length; i++) ch[i] *= k;
    effectCache.set(name, bus);
  }
  return effectCache.get(name);
}

// ─── music ─────────────────────────────────────────────────────────────────
// A mood per look: tempo, key, chords and which parts play.
const MOODS = {
  launch: { bpm: 112, root: 57, scale: "minor", chords: [0, 5, 2, 6], parts: ["pad", "pulse", "kick", "hat", "clap", "arp"], bright: 1600 },
  aurora: { bpm: 96, root: 60, scale: "major", chords: [0, 4, 5, 3], parts: ["pad", "kick-soft", "shaker", "arp-soft", "bass-soft"], bright: 2400 },
  gridline: { bpm: 120, root: 55, scale: "minor", chords: [0, 0, 5, 6], parts: ["kick", "hat", "rim", "pulse", "pad-thin"], bright: 1200 },
  pop: { bpm: 124, root: 60, scale: "major", chords: [0, 4, 5, 3], parts: ["kick", "clap", "hat", "bounce", "arp", "pad-thin"], bright: 2600 },
  journal: { bpm: 90, root: 58, scale: "major", chords: [0, 5, 3, 4], parts: ["keys", "brush", "bass-soft"], bright: 1800 },
};
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
// The chord on a degree of the scale, as MIDI notes (a triad and its 7th).
function chordOf(mood, degree, octave = 0) {
  const s = SCALES[mood.scale];
  const at = (k) => mood.root + octave * 12 + s[(degree + k) % 7] + 12 * Math.floor((degree + k) / 7);
  return [at(0), at(2), at(4), at(6)];
}

function kick(bus, at, gain = 1) {
  const start = Math.round(at * SR);
  let phase = 0;
  for (let i = 0; i < 0.42 * SR; i++) {
    const t = i / SR;
    phase += (46 + 120 * Math.exp(-t * 32)) / SR;
    bus.put(start + i, Math.tanh(Math.sin(TAU * phase) * env(t, 0.001, 0.16) * 1.4) * 0.75 * gain);
  }
}
function noiseHit(bus, at, { gain = 0.3, decay = 0.04, filter = "highpass", freq = 7000, q = 0.8, pan = 0, seconds = 0.3, seed = 1, bursts = 1 } = {}) {
  const start = Math.round(at * SR);
  const rnd = random(seed);
  const f = new Biquad(filter, freq, q);
  for (let i = 0; i < seconds * SR; i++) {
    const t = i / SR;
    let e = env(t, 0.001, decay);
    // A clap is a few quick bursts before its tail.
    if (bursts > 1 && t < 0.03) e = Math.max(e * 0.4, Math.exp(-((t % 0.01) / 0.003)));
    bus.put(start + i, f.run(rnd() * 2 - 1) * e * gain, pan);
  }
}
function bassNote(bus, at, seconds, midi, { gain = 0.32, cutoff = 520, soft = false } = {}) {
  const start = Math.round(at * SR);
  const f = noteHz(midi);
  const lp = new Biquad("lowpass", cutoff, 0.9);
  let phase = 0;
  const n = Math.round(seconds * SR);
  for (let i = 0; i < n + 0.08 * SR; i++) {
    const t = i / SR;
    phase = (phase + f / SR) % 1;
    const amp = Math.min(1, t / 0.006) * (i < n ? 1 : Math.exp(-(i - n) / (0.02 * SR)));
    if (i % 64 === 0) lp.set(cutoff * (1 + 2.5 * Math.exp(-t * 12)));
    const raw = soft ? Math.sin(TAU * phase) : saw(phase, f / SR) * 0.6 + Math.sin(TAU * phase) * 0.7;
    bus.put(start + i, lp.run(raw) * amp * gain);
  }
}
function padChord(bus, at, seconds, notes, { gain = 0.08, cutoff = 1600, attack = 0.5, release = 0.9 } = {}) {
  const start = Math.round(at * SR);
  const n = Math.round(seconds * SR);
  const total = n + Math.round(release * SR);
  notes.forEach((midi, k) => {
    const f = noteHz(midi);
    const lpL = new Biquad("lowpass", cutoff, 0.6);
    const lpR = new Biquad("lowpass", cutoff, 0.6);
    const detune = [0.9965, 1.0035];
    const phases = [Math.random() * 0, 0.31 * k, 0.17 * k, 0.53];
    for (let i = 0; i < total; i++) {
      const t = i / SR;
      const amp = Math.min(1, t / attack) * (i < n ? 1 : Math.exp(-(i - n) / (release * SR * 0.4)));
      if (i % 128 === 0) {
        const wobble = cutoff * (1 + 0.25 * Math.sin(TAU * 0.13 * (at + t) + k));
        lpL.set(wobble);
        lpR.set(wobble * 1.05);
      }
      phases[0] = (phases[0] + (f * detune[0]) / SR) % 1;
      phases[1] = (phases[1] + (f * detune[1]) / SR) % 1;
      const l = lpL.run(saw(phases[0], f / SR));
      const r = lpR.run(saw(phases[1], f / SR));
      const j = start + i;
      if (j >= bus.length) break;
      bus.L[j] += l * amp * gain;
      bus.R[j] += r * amp * gain;
    }
  });
}
function pluck(bus, at, midi, { gain = 0.12, decay = 0.22, pan = 0, ratio = 2, index = 1.6 } = {}) {
  const start = Math.round(at * SR);
  const f = noteHz(midi);
  for (let i = 0; i < (decay * 5 + 0.05) * SR; i++) {
    const t = i / SR;
    // Two-operator FM: the brightness falls faster than the note.
    const mod = Math.sin(TAU * f * ratio * t) * index * Math.exp(-t / (decay * 0.5));
    bus.put(start + i, Math.sin(TAU * f * t + mod) * env(t, 0.002, decay) * gain, pan);
  }
}
function keysChord(bus, at, seconds, notes, { gain = 0.07 } = {}) {
  notes.forEach((midi, k) => {
    const start = Math.round((at + k * 0.012) * SR);
    const f = noteHz(midi);
    const n = Math.round((seconds + 0.6) * SR);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const mod = Math.sin(TAU * f * t) * 1.2 * Math.exp(-t * 3);
      const trem = 1 + 0.12 * Math.sin(TAU * 4.2 * t);
      const amp = env(t, 0.004, 1.1) * (t < seconds ? 1 : Math.exp(-(t - seconds) / 0.15));
      bus.put(start + i, Math.sin(TAU * f * t + mod) * amp * trem * gain, (k - 1.5) * 0.2);
    }
  });
}

// The bed for a film: cuts (clip starts, seconds) after the first start the
// groove, the last clip lands on a hit. Returns a Bus.
function music({ look = "launch", seconds, cuts = [], seed = 1 }) {
  const mood = MOODS[look] || MOODS.launch;
  const beat = 60 / mood.bpm;
  const bar = beat * 4;
  const dry = new Bus(seconds + 2);
  const wet = new Bus(seconds + 2);
  const rnd = random(seed);
  const has = (p) => mood.parts.includes(p);
  const grooveFrom = cuts.length > 1 ? cuts[1] : bar * 2;
  const closeAt = cuts.length > 2 ? cuts[cuts.length - 1] : seconds - bar;
  const bars = Math.ceil(seconds / bar) + 1;
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    if (t0 >= seconds) break;
    const closing = t0 >= closeAt - 1e-3;
    const groove = t0 >= grooveFrom - 1e-3 && !closing;
    const degree = mood.chords[b % mood.chords.length];
    const chord = chordOf(mood, degree, 0);
    // Pads and keys hold the harmony throughout; the last chord rings out.
    const hold = closing ? Math.max(bar, seconds - t0) : bar;
    if (has("pad") || has("pad-thin")) padChord(wet, t0, hold, has("pad-thin") ? chord.slice(0, 3) : chord, { gain: has("pad-thin") ? 0.05 : 0.075, cutoff: mood.bright * (groove ? 1 : 0.7) });
    if (has("keys")) keysChord(wet, t0, Math.min(hold, bar * 0.95), chord.map((n) => n + 12).slice(0, 3), { gain: 0.06 });
    if (closing && b === Math.round(closeAt / bar)) {
      // The hit under the logo.
      kick(dry, t0, 1.1);
      noiseHit(dry, t0, { gain: 0.16, decay: 0.9, freq: 5000, seconds: 2, seed: 77 });
      bassNote(dry, t0, Math.min(2, seconds - t0), mood.root - 12 + SCALES[mood.scale][degree % 7], { gain: 0.3, cutoff: 300, soft: true });
    }
    if (!groove) {
      // Before the groove: a filtered pulse and the arp, quiet.
      if (!closing && (has("arp") || has("arp-soft"))) {
        for (let s = 0; s < 8; s++) pluck(wet, t0 + s * (beat / 2), chord[s % 4] + 12, { gain: 0.035, decay: 0.16, pan: s % 2 ? 0.3 : -0.3 });
      }
      continue;
    }
    for (let q = 0; q < 4; q++) {
      const t = t0 + q * beat;
      if (has("kick")) kick(dry, t, 0.7);
      if (has("kick-soft") && q % 2 === 0) kick(dry, t, 0.55);
      if (has("hat")) noiseHit(dry, t + beat / 2, { gain: 0.08, decay: 0.03, freq: 8000, seed: 100 + q, pan: 0.2 });
      if (has("shaker")) for (let s = 0; s < 4; s++) noiseHit(dry, t + (s * beat) / 4, { gain: s % 2 ? 0.03 : 0.05, decay: 0.025, filter: "bandpass", freq: 6500, q: 1.2, seed: 200 + s, pan: -0.25 });
      if (has("brush")) noiseHit(dry, t + beat / 2, { gain: 0.05, decay: 0.08, filter: "bandpass", freq: 4500, q: 0.7, seed: 300 + q });
      if ((has("clap") || has("rim")) && q % 2 === 1) {
        if (has("clap")) noiseHit(dry, t, { gain: 0.16, decay: 0.12, filter: "bandpass", freq: 1500, q: 0.9, seed: 400 + b, bursts: 3 });
        else noiseHit(dry, t, { gain: 0.12, decay: 0.02, filter: "bandpass", freq: 2200, q: 3, seed: 500 + b });
      }
    }
    const rootNote = mood.root - 12 + SCALES[mood.scale][degree % 7] + 12 * Math.floor(degree / 7);
    if (has("pulse")) for (let s = 0; s < 8; s++) bassNote(dry, t0 + s * (beat / 2), beat / 2 * 0.8, rootNote, { gain: s % 2 ? 0.2 : 0.26, cutoff: 420 });
    if (has("bounce")) for (let s = 0; s < 4; s++) bassNote(dry, t0 + s * beat + beat / 2, beat * 0.45, rootNote + (s === 3 ? 7 : 0), { gain: 0.28, cutoff: 700 });
    if (has("bass-soft")) for (let s = 0; s < 2; s++) bassNote(dry, t0 + s * beat * 2, beat * 1.8, rootNote, { gain: 0.24, cutoff: 380, soft: true });
    if (has("arp") || has("arp-soft")) {
      const soft = has("arp-soft");
      for (let s = 0; s < (soft ? 8 : 16); s++) {
        const step = soft ? beat / 2 : beat / 4;
        const note = chord[[0, 1, 2, 3, 2, 1][s % 6]] + 12 + (s % 8 === 7 ? 12 : 0);
        pluck(wet, t0 + s * step, note, { gain: soft ? 0.05 : 0.045 + rnd() * 0.01, decay: soft ? 0.3 : 0.14, pan: (s % 4) / 3 - 0.5 });
      }
    }
  }
  // A riser into the groove, and a short one into the close.
  if (grooveFrom > 1.2) dry.mix(riser(Math.min(2, grooveFrom)), grooveFrom - Math.min(2, grooveFrom), 0.25);
  const out = reverb(wet, { wet: 0.32, size: 0.84 });
  out.mix(dry, 0, 1);
  // The whole bed fades in over the first beat and out over the last second.
  const total = Math.round(seconds * SR);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const g = Math.min(1, t / beat) * (i < total - SR ? 1 : Math.max(0, (total - i) / SR));
    out.L[i] *= g;
    out.R[i] *= g;
  }
  return { bus: out, beat, bar, bpm: mood.bpm };
}

// ─── the mix ───────────────────────────────────────────────────────────────
// Music and effects into one buffer of the film's length; a soft limiter
// keeps the peaks under full scale. cues: [{ sfx, at, volume }].
function mixFilm({ seconds, music: bed = null, cues = [], musicGain = 0.55, sfxGain = 1 }) {
  const out = new Bus(seconds);
  if (bed) out.mix(bed, 0, musicGain);
  for (const c of cues) {
    const fx = effect(c.sfx);
    if (!fx || !(c.at >= 0) || c.at >= seconds - 0.05) continue;
    out.mix(fx, c.at, Math.min(2, Number(c.volume) || 0.4) * sfxGain);
  }
  for (const ch of [out.L, out.R]) for (let i = 0; i < ch.length; i++) ch[i] = Math.tanh(ch[i] * 1.1) * 0.92;
  return out;
}

// A 32-bit float WAV.
function writeWav(file, bus) {
  const n = bus.length;
  const data = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) {
    data.writeFloatLE(bus.L[i], i * 8);
    data.writeFloatLE(bus.R[i], i * 8 + 4);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 8, 28);
  head.writeUInt16LE(8, 32);
  head.writeUInt16LE(32, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

module.exports = { SR, Bus, MOODS, EFFECTS, effect, music, mixFilm, writeWav };
