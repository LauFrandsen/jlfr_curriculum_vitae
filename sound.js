// Sound for the page, all of it made live with the Web Audio API: no files. Two parts:
//   - effects (SOUNDS): deep, rounded and short, for what happens in the graphic and on the page:
//     low hums and thuds, soft knocks, breaths of dark noise, all in A minor;
//   - music: somber, slow and spacious, made as it plays and never the same twice (see "the music").
// It's off until the visitor turns it on, which is remembered for their next visit. Browsers keep a
// page silent until the visitor taps, clicks or presses a key, so sound starts at the first of those
// once it's on.
//
// play(name, options) plays one of SOUNDS. Options: at (seconds from now), pan (-1 left .. 1 right),
// gain (multiplies its loudness), pitch (multiplies its frequencies), length (seconds, for an effect
// that lasts as long as what it goes with, like a rocket's climb) and from (for one that moves: which
// side it comes in from, -1 left .. 1 right, 0 both). It returns a handle to let go of an effect that
// holds until something is over.

// Tunable (the ?tune panel): overall volume, the music's level, and how much of the effects comes back
// from the room.
export const SOUND = { volume: 1, music: 0.1, reverb: 0.25 };

const MAX_VOICES = 48;   // effects playing at once; any more are skipped
// A minor pentatonic, from A2 up.
const NOTES = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
const note = (lo, hi) => NOTES[lo + Math.floor(Math.random() * (hi - lo + 1))];

let on = false;
try { on = localStorage.getItem('sound') === 'on'; } catch { /* no storage: off */ }

let ctx = null;            // the audio context, made at the first gesture with sound on
let master, fx, mix, room; // overall level, the effects' level, the mix they go into, their room
let noise = null;          // two seconds of white noise, for the breaths and the wind
let voices = 0;
let presence = 1;          // how present the graphic is: its effects are quieter once it has glided aside
let applied = '';          // the levels last applied
let music = null;          // the music, once it has started

// ---------- the instruments ----------
// Effects are built from these, given s = { ctx, out, t, pitch, noise, length }: the context, where it
// goes, when it starts, its pitch, the noise and how long it lasts (if it follows something). Each
// returns how long it sounds, in seconds from s.t; an effect that holds until it's let go returns
// { lasts (at the most), release() (lets it go, and returns how long it takes to die away) }.

// Rises to peak over attack, holds there for `hold`, then dies away over decay. Smooth: rises evenly
// and eases away instead (for long, held sounds, so they swell rather than surge).
function shape(param, t, peak, attack, decay, hold = 0, smooth = false) {
  const top = Math.max(peak, 0.0002);
  param.setValueAtTime(0.0001, t);
  if (smooth) {
    param.linearRampToValueAtTime(top, t + attack);
    param.setTargetAtTime(0.0001, t + attack + hold, decay / 4);
    return;
  }
  param.exponentialRampToValueAtTime(top, t + attack);
  if (hold > 0) param.setValueAtTime(top, t + attack + hold);
  param.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
}

// A tone: an oscillator at freq, gliding to `to` over `glide` (default: all of it).
function tone(s, { at = 0, type = 'sine', freq, to, glide, attack = 0.01, hold = 0, decay = 0.2, gain = 0.1, smooth = false }) {
  const t = s.t + at, o = s.ctx.createOscillator(), g = s.ctx.createGain(), end = attack + hold + decay;
  o.type = type;
  o.frequency.setValueAtTime(freq * s.pitch, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to * s.pitch, t + (glide ?? end));
  shape(g.gain, t, gain, attack, decay, hold, smooth);
  o.connect(g).connect(s.out);
  o.start(t);
  o.stop(t + end + 0.05);
  return at + end;
}

// A hum: a low chord, two slightly detuned sawtooth oscillators per note, through a lowpass that
// opens from cutoff to `to` over `glide`.
function hum(s, { at = 0, freqs, cutoff = 400, to, glide, q = 0.7, attack = 0.2, hold = 0, decay = 1, gain = 0.05, smooth = false }) {
  const t = s.t + at, f = s.ctx.createBiquadFilter(), g = s.ctx.createGain(), end = attack + hold + decay;
  f.type = 'lowpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(cutoff, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + (glide ?? end));
  shape(g.gain, t, gain, attack, decay, hold, smooth);
  f.connect(g).connect(s.out);
  for (const freq of freqs) {
    for (const cents of [-6, 6]) {
      const o = s.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq * s.pitch;
      o.detune.value = cents;
      o.connect(f);
      o.start(t);
      o.stop(t + end + 0.05);
    }
  }
  return at + end;
}

// A breath of noise through a filter at freq, sweeping to `to` over `glide`.
function hiss(s, { at = 0, filter = 'lowpass', freq, to, glide, q = 0.7, attack = 0.01, hold = 0, decay = 0.2, gain = 0.1, smooth = false }) {
  const t = s.t + at, src = s.ctx.createBufferSource(), f = s.ctx.createBiquadFilter(), g = s.ctx.createGain(), end = attack + hold + decay;
  src.buffer = s.noise;
  src.loop = true;
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq * s.pitch, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to * s.pitch, t + (glide ?? end));
  shape(g.gain, t, gain, attack, decay, hold, smooth);
  src.connect(f).connect(g).connect(s.out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + end + 0.05);
  return at + end;
}

// Stops param's planned changes at time `now`, keeping it where it is then.
function freeze(param, now) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(now);
  } else {
    const v = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(v, now);
  }
}

// Noise whose filter wanders: `path` is [[seconds, freq], ...] for the filter, and `level` the same
// for its loudness.
function drift(s, { path, level, q = 1 }) {
  const t = s.t, src = s.ctx.createBufferSource(), f = s.ctx.createBiquadFilter(), g = s.ctx.createGain();
  src.buffer = s.noise;
  src.loop = true;
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(path[0][1] * s.pitch, t);
  for (const [at, freq] of path.slice(1)) f.frequency.exponentialRampToValueAtTime(freq * s.pitch, t + at);
  g.gain.setValueAtTime(0.0001, t);
  for (const [at, v] of level) g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0001), t + at);
  const end = level[level.length - 1][0];
  src.connect(f).connect(g).connect(s.out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + end + 0.05);
  return end;
}

// ---------- the effects ----------

export const SOUNDS = {
  // ----- the orb -----
  // A square blipping into the intro's core: a soft, low pulse (pass a rising pitch for a crescendo).
  blip: (s) => Math.max(
    tone(s, { freq: 150, to: 130, attack: 0.008, decay: 0.11, gain: 0.11 }),
    tone(s, { type: 'triangle', freq: 300, attack: 0.006, decay: 0.05, gain: 0.02 }),
  ),
  // The core opening out into the orb: a deep swell, a hum opening up over it, and a breath of air.
  bloom: (s) => Math.max(
    tone(s, { freq: 41.2, to: 55, glide: 0.6, attack: 0.1, decay: 1.6, gain: 0.3 }),
    hum(s, { freqs: [55, 82.41, 110, 164.81], cutoff: 200, to: 900, glide: 1, attack: 0.35, decay: 2.4, gain: 0.05 }),
    hiss(s, { freq: 150, to: 900, glide: 0.8, attack: 0.25, decay: 1.4, gain: 0.06 }),
  ),
  // A rocket lifting off: a rumble and a low hum that climb with it over its ascent.
  launch: (s) => {
    const l = s.length ?? 2.8;
    return Math.max(
      hiss(s, { freq: 120, to: 500, glide: l, attack: 0.4, decay: l, gain: 0.22 }),
      tone(s, { freq: 45, to: 80, glide: l, attack: 0.5, decay: l, gain: 0.12 }),
      hum(s, { freqs: [65.41], cutoff: 200, to: 600, glide: l, attack: 0.6, decay: l, gain: 0.04 }),
    );
  },
  // Reaching its orbit and unfolding into a satellite: two soft knocks and a hum switching on.
  deploy: (s) => Math.max(
    tone(s, { type: 'triangle', freq: 196, attack: 0.004, decay: 0.08, gain: 0.06 }),
    tone(s, { at: 0.08, type: 'triangle', freq: 164.81, attack: 0.004, decay: 0.08, gain: 0.06 }),
    hum(s, { at: 0.12, freqs: [110, 164.81], cutoff: 500, attack: 0.06, decay: 1.1, gain: 0.045 }),
    tone(s, { at: 0.12, freq: 55, attack: 0.05, decay: 1, gain: 0.08 }),
  ),
  // One of an orbit's squares appearing as its satellite lays it: a low pulse.
  lay: (s) => Math.max(
    tone(s, { freq: 196, attack: 0.006, decay: 0.07, gain: 0.045 }),
    tone(s, { freq: 98, attack: 0.006, decay: 0.06, gain: 0.03 }),
  ),
  // A satellite folding up and leaving its orbit: two knocks going down, then a falling hum and dark
  // air over its descent.
  fold: (s) => {
    const l = s.length ?? 3.2;
    return Math.max(
      tone(s, { type: 'triangle', freq: 164.81, attack: 0.004, decay: 0.08, gain: 0.06 }),
      tone(s, { at: 0.08, type: 'triangle', freq: 130.81, attack: 0.004, decay: 0.08, gain: 0.06 }),
      tone(s, { at: 0.1, freq: 130, to: 45, glide: l, attack: 0.2, decay: l, gain: 0.07 }),
      hiss(s, { at: 0.1, freq: 600, to: 120, glide: l, attack: 0.3, decay: l, gain: 0.08 }),
    );
  },
  // Touching down on its pad: a deep thud and a hum settling.
  touchdown: (s) => Math.max(
    tone(s, { freq: 90, to: 38, attack: 0.004, decay: 0.45, gain: 0.3 }),
    tone(s, { type: 'triangle', freq: 180, to: 75, attack: 0.004, decay: 0.22, gain: 0.06 }),
    hiss(s, { freq: 300, attack: 0.003, decay: 0.15, gain: 0.08 }),
    hum(s, { at: 0.05, freqs: [55, 82.41], cutoff: 300, attack: 0.05, decay: 1.2, gain: 0.05 }),
  ),
  // Shot down: a dull crack, the burst's rumble, and a tone falling away.
  burst: (s) => Math.max(
    hiss(s, { filter: 'bandpass', freq: 1100, attack: 0.001, decay: 0.07, gain: 0.12 }),
    hiss(s, { freq: 900, to: 110, attack: 0.003, decay: 1, gain: 0.2 }),
    tone(s, { freq: 220, to: 40, attack: 0.003, decay: 0.6, gain: 0.12 }),
  ),
  // The wreck hitting the orb: a deep thud with a little gravel.
  crash: (s) => {
    let end = Math.max(
      tone(s, { freq: 70, to: 30, attack: 0.004, decay: 0.7, gain: 0.32 }),
      tone(s, { type: 'triangle', freq: 140, to: 55, attack: 0.004, decay: 0.35, gain: 0.07 }),
      hiss(s, { freq: 250, attack: 0.003, decay: 0.35, gain: 0.12 }),
    );
    for (let i = 0; i < 4; i++) {
      end = Math.max(end, hiss(s, { at: Math.random() * 0.15, filter: 'bandpass', freq: 800, q: 1.5, attack: 0.002, decay: 0.03, gain: 0.04 }));
    }
    return end;
  },
  // A square slotting into its place in the orb: a very soft, low pulse.
  slot: (s) => Math.max(
    tone(s, { freq: 130, attack: 0.012, decay: 0.14, gain: 0.05 }),
    tone(s, { type: 'triangle', freq: 260, attack: 0.008, decay: 0.05, gain: 0.012 }),
  ),
  // Pressing the orb, which draws the falling squares in: a deep breath drawn in.
  gather: (s) => Math.max(
    hiss(s, { freq: 150, to: 800, glide: 0.45, attack: 0.45, decay: 0.3, gain: 0.12 }),
    tone(s, { freq: 55, to: 82.41, attack: 0.4, decay: 0.5, gain: 0.12 }),
  ),

  // ----- the flower -----
  // Its squares landing as it grows: soil thuds softly, roots knock, the stem climbs in pitch (pass
  // its height in pitch), leaves rustle low, the head and the petals ring warm.
  soil: (s) => Math.max(
    hiss(s, { freq: 260, attack: 0.002, decay: 0.06, gain: 0.1 }),
    tone(s, { freq: 70, attack: 0.003, decay: 0.07, gain: 0.06 }),
  ),
  root: (s) => tone(s, { type: 'triangle', freq: 98, to: 82, attack: 0.004, decay: 0.1, gain: 0.08 }),
  stem: (s) => Math.max(
    tone(s, { type: 'triangle', freq: 130.81, attack: 0.006, decay: 0.09, gain: 0.06 }),
    tone(s, { freq: 130.81, attack: 0.006, decay: 0.12, gain: 0.04 }),
  ),
  leaf: (s) => hiss(s, { filter: 'bandpass', freq: 900, q: 0.9, attack: 0.006, decay: 0.1, gain: 0.14 }),
  head: (s) => {
    const freq = note(0, 5);
    return Math.max(
      tone(s, { freq, attack: 0.006, decay: 0.4, gain: 0.07 }),
      tone(s, { type: 'triangle', freq: freq * 2, attack: 0.004, decay: 0.08, gain: 0.012 }),
    );
  },
  petal: (s) => tone(s, { freq: note(5, 9), attack: 0.01, decay: 0.35, gain: 0.035 }),
  // In full bloom for the first time: a warm A minor chord over a deep root.
  bloomed: (s) => Math.max(
    hum(s, { freqs: [55, 110, 164.81, 220, 261.63], cutoff: 300, to: 1000, glide: 1.5, attack: 0.8, decay: 4, gain: 0.05 }),
    tone(s, { freq: 55, attack: 0.6, decay: 3.5, gain: 0.12 }),
  ),
  // A new petal finished: a single low, bell-like note over its octave below.
  regrown: (s) => {
    const freq = note(3, 8);
    return Math.max(
      tone(s, { freq, attack: 0.02, decay: 1.4, gain: 0.06 }),
      tone(s, { freq: freq / 2, attack: 0.02, decay: 1, gain: 0.05 }),
    );
  },
  // A petal breaking off: a loud, low thud with a short, dark tail of air.
  breakoff: (s) => Math.max(
    tone(s, { freq: 85, to: 40, attack: 0.003, decay: 0.3, gain: 0.32 }),
    tone(s, { type: 'triangle', freq: 170, to: 70, attack: 0.003, decay: 0.16, gain: 0.08 }),
    hiss(s, { freq: 320, attack: 0.002, decay: 0.12, gain: 0.12 }),
    hiss(s, { filter: 'bandpass', freq: 900, attack: 0.001, decay: 0.03, gain: 0.05 }),
    hiss(s, { at: 0.05, freq: 500, to: 160, attack: 0.05, decay: 0.4, gain: 0.05 }),
  ),
  // New squares coming in from the side to rebuild a petal (`from`: -1 the left, 1 the right, 0 both
  // sides; `length`: how long that should take at most). From each side they come from, a low rush and
  // hum swell and brighten as they near over `approach`, moving in toward the middle, and a fuller
  // hum gathers in the middle as they arrive. It all holds until it's let go (the flower lets go when
  // the last square has landed), then eases away; it lets itself go after `length` at the latest.
  sweep: (s) => {
    const approach = 4, from = s.from ?? 0, most = (s.length ?? 12) + 4;
    const level = s.ctx.createGain();
    level.gain.setValueAtTime(1, s.t);
    level.gain.setValueAtTime(1, s.t + most);
    level.gain.linearRampToValueAtTime(0.0001, s.t + most + 2);
    level.connect(s.out);
    const all = { ...s, out: level };
    for (const side of [-1, 1]) {
      const share = (1 + side * from) / 2;
      if (share < 0.05) continue;
      const move = s.ctx.createStereoPanner ? s.ctx.createStereoPanner() : s.ctx.createGain();
      if (move.pan) {
        move.pan.setValueAtTime(side * 0.9, s.t);
        move.pan.linearRampToValueAtTime(side * 0.15, s.t + approach);
      }
      move.connect(level);
      const fromSide = { ...s, out: move };
      hiss(fromSide, { freq: 110, to: 560, glide: approach, attack: approach * 0.85, hold: most, decay: 2, gain: 0.28 * share, smooth: true });
      hum(fromSide, { freqs: [55, 82.41], cutoff: 140, to: 480, glide: approach, attack: approach * 0.8, hold: most, decay: 2, gain: 0.03 * share, smooth: true });
    }
    const arrive = approach - 1.2;
    hum(all, { at: arrive, freqs: [82.41, 110], cutoff: 200, to: 420, glide: 3, attack: 1.5, hold: most, decay: 2, gain: 0.03, smooth: true });
    tone(all, { at: arrive, freq: 55, attack: 1.5, hold: most, decay: 2, gain: 0.09, smooth: true });
    hiss(all, { at: arrive, freq: 300, attack: 1.5, hold: most, decay: 2, gain: 0.1, smooth: true });
    return {
      lasts: most + 2,
      // Let go: it all eases away over two or three seconds.
      release: () => {
        const now = s.ctx.currentTime;
        freeze(level.gain, now);
        level.gain.setTargetAtTime(0.0001, now, 0.8);
        return 3.5;
      },
    };
  },
  // Pressing the flower, which sends a gust through it.
  gust: (s) => Math.max(
    drift(s, { path: [[0, 140], [0.5, 700], [1.8, 200]], level: [[0.35, 0.14], [0.8, 0.1], [1.9, 0.0001]], q: 0.6 }),
    tone(s, { freq: 55, attack: 0.4, decay: 1.2, gain: 0.08 }),
  ),

  // ----- the page -----
  // The squares flying from one graphic into the next (MORPH in voxel.js, `length` long): dark air
  // and a hum rising as they set off and settling as they arrive, soft pulses as they land, and a
  // chord as the new graphic fades in under them.
  morph: (s) => {
    const l = s.length ?? 7;
    let end = Math.max(
      drift(s, { path: [[0, 150], [l * 0.45, 900], [l * 0.9, 220]], level: [[l * 0.25, 0.1], [l * 0.6, 0.1], [l, 0.0001]] }),
      hum(s, { freqs: [55, 82.41, 110], cutoff: 200, to: 700, glide: l * 0.5, attack: l * 0.3, decay: l * 0.7, gain: 0.04 }),
    );
    for (let i = 0; i < 14; i++) {
      tone(s, { at: l * (0.57 + 0.28 * Math.random()), freq: note(0, 5), attack: 0.008, decay: 0.15, gain: 0.04 });
    }
    end = Math.max(end, hum(s, { at: l * 0.8, freqs: [110, 164.81, 220, 261.63], cutoff: 400, attack: 0.6, decay: 2.5, gain: 0.04 }));
    return end;
  },
  // A CV entry releasing its squares from its marker: a low boop.
  release: (s) => tone(s, { freq: 262, to: 196, attack: 0.01, decay: 0.22, gain: 0.07 }),
  // One of its squares landing in the graphic.
  land: (s) => Math.max(
    tone(s, { freq: 110, attack: 0.006, decay: 0.16, gain: 0.1 }),
    tone(s, { type: 'triangle', freq: 220, attack: 0.004, decay: 0.05, gain: 0.02 }),
  ),
  // A project pane opening: a sheet of paper slid out, and (`sheet`) laid down; and closing.
  open: (s) => Math.max(
    hiss(s, { freq: 1100, to: 350, attack: 0.03, decay: 0.45, gain: 0.08 }),
    tone(s, { freq: 82.41, attack: 0.04, decay: 0.7, gain: 0.1 }),
  ),
  sheet: (s) => Math.max(
    hiss(s, { freq: 400, attack: 0.003, decay: 0.1, gain: 0.09 }),
    tone(s, { freq: 65, attack: 0.004, decay: 0.15, gain: 0.12 }),
  ),
  close: (s) => Math.max(
    hiss(s, { freq: 350, to: 1100, attack: 0.04, decay: 0.3, gain: 0.08 }),
    tone(s, { freq: 98, to: 73, attack: 0.02, decay: 0.3, gain: 0.07 }),
  ),
  // Sound turned on: two low notes going up.
  on: (s) => Math.max(
    tone(s, { freq: 110, attack: 0.02, decay: 0.9, gain: 0.12 }),
    tone(s, { at: 0.14, freq: 164.81, attack: 0.02, decay: 1.2, gain: 0.1 }),
  ),
};

// ---------- the music ----------
// Somber, slow and spacious, and never the same twice:
//   - a low drone on A that never stops (A1, E2 and A2, the A2 a hair sharp so the two beat slowly),
//     its filter breathing over half a minute, with a dark wind moving over it;
//   - a pad of warm chords in A minor, one every 15-22 seconds, each fading in over seven seconds and
//     out over nine, so they overlap;
//   - now and then a single soft bell note from the chord, sometimes answered by a second.
// The pads, bells and wind ring out into a long, dark reverb (the effects keep their own small room).

const CHORDS = [   // A minor, each voiced from its bass up
  [110, 164.81, 246.94, 261.63, 329.63],    // Am(add9)
  [87.31, 130.81, 164.81, 220, 329.63],     // Fmaj7
  [73.42, 146.83, 174.61, 220, 329.63],     // Dm(add9)
  [82.41, 123.47, 146.83, 220, 246.94],     // Em7sus4
  [110, 164.81, 220, 261.63, 392],          // Am7
  [98, 130.81, 164.81, 246.94, 293.66],     // Cmaj9/G
  [87.31, 130.81, 174.61, 220, 261.63],     // F
  [82.41, 123.47, 164.81, 196, 246.94],     // Em7
];

// A constant tone at freq into `to`, its level `level`, until the music is gone.
function held(type, freq, level, to) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = level;
  o.connect(g).connect(to);
  o.start();
}

// A slow wobble of param around where it is: rate in Hz, depth in its own units.
function sway(param, rate, depth) {
  const lfo = ctx.createOscillator(), g = ctx.createGain();
  lfo.frequency.value = rate;
  g.gain.value = depth;
  lfo.connect(g).connect(param);
  lfo.start();
}

function startMusic() {
  if (music) return;
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(master);
  const space = ctx.createConvolver();
  space.buffer = roomResponse(5, 0.06, 2);
  const wet = ctx.createGain();
  wet.gain.value = 0.8;
  wet.connect(space).connect(bus);

  // The drone, dry.
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 280;
  lowpass.Q.value = 0.6;
  sway(lowpass.frequency, 1 / 30, 90);
  const drone = ctx.createGain();
  drone.gain.value = 0.16;
  lowpass.connect(drone).connect(bus);
  held('sine', 55, 1, lowpass);
  held('triangle', 82.41, 0.3, lowpass);
  held('sine', 110.3, 0.45, lowpass);

  // The wind: dark noise, its band drifting, mostly heard in the reverb.
  const wind = ctx.createBufferSource(), band = ctx.createBiquadFilter(), windLevel = ctx.createGain();
  wind.buffer = noise;
  wind.loop = true;
  band.type = 'bandpass';
  band.frequency.value = 380;
  band.Q.value = 0.6;
  sway(band.frequency, 1 / 40, 220);
  windLevel.gain.value = 0.03;
  wind.connect(band).connect(windLevel);
  windLevel.connect(bus);
  windLevel.connect(wet);
  wind.start();

  music = { bus, wet, next: ctx.currentTime + 1, bell: ctx.currentTime + 8, chord: 0, current: CHORDS[0] };
  levels(true);
  plan();
}

// Plans the next few seconds of the music, and again each second (it waits while the audio is
// suspended: its clock stops with it).
function plan() {
  const ahead = ctx.currentTime + 4;
  while (music.next < ahead) {
    const length = 15 + Math.random() * 7;
    music.current = CHORDS[music.chord];
    pad(music.current, music.next, length);
    music.chord = (music.chord + 1) % CHORDS.length;
    music.next += length;
  }
  while (music.bell < ahead) {
    bell(music.bell);
    music.bell += 6 + Math.random() * 10;
  }
  setTimeout(plan, 1000);
}

// One chord of the pad from time t: its bass a sine, the rest pairs of detuned sawtooths under a
// lowpass that opens a little and closes again.
function pad(chord, t, length) {
  const attack = 7, release = 9, end = t + length + release;
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass';
  f.Q.value = 0.5;
  f.frequency.setValueAtTime(380, t);
  f.frequency.linearRampToValueAtTime(800, t + length * 0.6);
  f.frequency.linearRampToValueAtTime(420, end);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(1, t + attack);
  g.gain.setValueAtTime(1, t + length);
  g.gain.linearRampToValueAtTime(0, end);
  f.connect(g);
  g.connect(music.bus);
  g.connect(music.wet);
  chord.forEach((freq, i) => {
    for (const cents of i === 0 ? [0] : [-7, 7]) {
      const o = ctx.createOscillator(), level = ctx.createGain();
      o.type = i === 0 ? 'sine' : 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = cents;
      level.gain.value = i === 0 ? 0.1 : 0.018;
      o.connect(level).connect(f);
      o.start(t);
      o.stop(end + 0.1);
    }
  });
}

// A soft bell at time t: a note of the chord sounding, an octave up, ringing out; now and then a
// second answers it.
function bell(t) {
  const notes = music.current.slice(1).map((f) => f * 2).filter((f) => f >= 200 && f <= 700);
  const ring = (at, freq) => {
    const s = { ctx, out: music.wet, t: at, pitch: 1, noise };
    tone(s, { freq, attack: 0.03, decay: 5, gain: 0.05 });
    tone(s, { freq: freq * 2.01, attack: 0.02, decay: 1.6, gain: 0.008 });
    const dry = { ...s, out: music.bus };
    tone(dry, { freq, attack: 0.03, decay: 3, gain: 0.02 });
  };
  ring(t, notes[Math.floor(Math.random() * notes.length)] ?? 220);
  if (Math.random() < 0.3) ring(t + 1.5 + Math.random() * 1.5, notes[Math.floor(Math.random() * notes.length)] ?? 330);
}

// ---------- playing ----------

// Two seconds of white noise in context c.
export function makeNoise(c) {
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// A reverb's impulse response: noise dying away over `seconds`, darker the lower `bright` (0..1),
// fading as (1 - x) ** fall.
function roomResponse(seconds, bright, fall) {
  const n = Math.round(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y += (Math.random() * 2 - 1 - y) * bright;
      d[i] = y * (1 - i / n) ** fall;
    }
  }
  return buf;
}

// The effects go into the mix, and from there into their small room and on through their level
// (which follows the graphic's presence); the music has its own level. Both go to the overall level,
// and a limiter at the end keeps many at once from clipping.
function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 10;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);
  master = ctx.createGain();
  master.connect(limiter);
  fx = ctx.createGain();
  fx.connect(master);
  mix = ctx.createGain();
  mix.connect(fx);
  const reverb = ctx.createConvolver();
  reverb.buffer = roomResponse(1, 0.15, 3);
  room = ctx.createGain();
  mix.connect(room).connect(reverb).connect(fx);
  noise = makeNoise(ctx);
  levels(true);
  // Quiet while the page is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.suspend();
    else if (on) ctx.resume();
  });
  return true;
}

// Sets the levels from SOUND and the graphic's presence (gliding there), if they've changed or `now`.
function levels(now = false) {
  if (!ctx) return;
  const key = `${SOUND.volume} ${SOUND.music} ${SOUND.reverb} ${presence.toFixed(2)}`;
  if (key === applied && !now) return;
  applied = key;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(SOUND.volume, t, 0.1);
  fx.gain.setTargetAtTime(presence, t, 0.15);
  room.gain.setTargetAtTime(SOUND.reverb, t, 0.15);
  // The music fades in when it starts.
  music?.bus.gain.setTargetAtTime(SOUND.music, t, now ? 2.5 : 0.3);
}

// Starts the audio and the music, or resumes them. The first time, it only works inside a gesture.
function wake() {
  if (!ctx && !build()) return Promise.resolve();
  const running = ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => {});
  return running.then(() => {
    if (ctx.state === 'running') startMusic();
  });
}

// With sound on, the first tap, click or key press (and any after the audio was interrupted) wakes it.
for (const type of ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click']) {
  addEventListener(type, () => {
    if (on && !document.hidden && ctx?.state !== 'running') wake();
  }, { capture: true, passive: true });
}

export const soundOn = () => on;

// Turns sound on or off and remembers it. Call it from a click or tap, so the browser lets it start.
// Turned off, it fades out quickly before the audio stops.
export function setSound(next) {
  on = !!next;
  try { localStorage.setItem('sound', on ? 'on' : 'off'); } catch { /* not remembered */ }
  if (on) {
    wake().then(() => {
      levels(true);
      play('on');
    });
  } else if (ctx) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    setTimeout(() => { if (!on) ctx.suspend(); }, 400);
  }
}

// How present the graphic is (1 = in the hero, less once it has glided aside), which sets how loud
// its effects are. The engine sets it every frame; it also picks up changes to SOUND.
export function setPresence(k) {
  presence = k;
  if (on) levels();
}

const SILENT = { release() {} };

// Plays effect `name` (see the top of this file for the options), if sound is on and running.
// Returns a handle whose release() lets go of an effect that holds until then (like `sweep`); for the
// rest, and when nothing played, it does nothing.
export function play(name, { at = 0, pan = 0, gain = 1, pitch = 1, length, from } = {}) {
  const make = SOUNDS[name];
  if (!on || !make || ctx?.state !== 'running' || document.hidden || voices >= MAX_VOICES) return SILENT;
  const out = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  if (out.pan) out.pan.value = Math.max(-1, Math.min(1, pan)) * 0.7;
  const level = ctx.createGain();
  level.gain.value = gain;
  out.connect(level).connect(mix);
  const t = ctx.currentTime + Math.max(0, at);
  const made = make({ ctx, out, t, pitch, noise, length, from });
  const held = typeof made === 'object';
  voices++;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    voices--;
    level.disconnect();
  };
  let timer = setTimeout(end, (Math.max(0, at) + (held ? made.lasts : made) + 0.3) * 1000);
  if (!held) return SILENT;
  return {
    release() {
      if (ended) return;
      clearTimeout(timer);
      timer = setTimeout(end, (made.release() + 0.3) * 1000);
    },
  };
}
