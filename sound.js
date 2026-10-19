// Sound for the page, all of it made live with the Web Audio API: no files. Two parts:
//   - effects (SOUNDS): rounded and short, for what happens in the graphic and on the page: felt
//     thuds, low hums, soft knocks, breaths of noise, all in C major;
//   - music: calm and bright, a little sci-fi, made as it plays and never the same twice (see "the
//     music"). It opens with a motif and builds out from it.
// It's off until the visitor turns it on, which is remembered for their next visit. Browsers keep a
// page silent until the visitor taps, clicks or presses a key, so sound starts at the first of those
// once it's on.
//
// play(name, options) plays one of SOUNDS. Options: at (seconds from now), pan (-1 left .. 1 right),
// gain (multiplies its loudness), pitch (multiplies its frequencies), length (seconds, for an effect
// that lasts as long as what it goes with, like a rocket's climb), from (for one that moves: which
// side it comes in from, -1 left .. 1 right, 0 both) and share (for the orb's intro pops: how far
// through the intro, 0..1, which sets how far the radio they come through has opened). It returns a handle to let go of an effect that
// holds until something is over.

// A phone (a touch screen and no mouse): its small speaker can't play the deep bass, and driven with it
// anyway it crackles, so there the sound is cut below lowCut. Its audio also falls behind more easily,
// the more so the busier the sound and the graphic are, which crackles too, so it works further ahead
// (PHONE_BUFFER seconds; the sound comes that much later) and the music's reverb, which is most of
// the music's work, is shorter.
const PHONE = matchMedia('(pointer: coarse) and (hover: none)').matches;
const PHONE_BUFFER = 0.08;

// Tunable (the ?tune panel): overall volume, the music's level, how much of the effects comes back
// from the room, and below what pitch (Hz) everything is cut (0: nothing is).
export const SOUND = { volume: 1, music: 0.12, reverb: 0.25, lowCut: PHONE ? 120 : 0 };

const MAX_VOICES = 48;   // effects playing at once; any more are skipped
// The pentatonic, from A2 up (A minor's and C major's are the same notes).
const NOTES = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
const note = (lo, hi) => NOTES[lo + Math.floor(Math.random() * (hi - lo + 1))];

let on = false;
try { on = localStorage.getItem('sound') === 'on'; } catch { /* no storage: off */ }

let ctx = null;            // the audio context, made at the first gesture with sound on
let master, fx, mix, room; // overall level, the effects' level, the mix they go into, their room
let hall;                  // a large room, for the orb's intro's final sound
let lowCut = [];           // the filters cutting the deep bass (on a phone)
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

// A struck note: a sine with its octave and twelfth, ringing out.
function ping(s, { at = 0, freq, gain = 0.05, decay = 1.8 }) {
  const once = { ...s, pitch: 1 };
  return Math.max(
    tone(once, { at, freq, attack: 0.004, decay, gain }),
    tone(once, { at, freq: freq * 2, attack: 0.003, decay: decay * 0.4, gain: gain * 0.3 }),
    tone(once, { at, freq: freq * 3, attack: 0.002, decay: decay * 0.15, gain: gain * 0.12 }),
  );
}

// A felt mallet on a soft drum: a fast drop in pitch, a body an octave up (so a phone, which can't
// play the drop, still hears it) and a tiny, muffled click of the felt. k: how hard.
function thud(s, k = 1) {
  return Math.max(
    tone(s, { freq: 205, to: 66, glide: 0.05, attack: 0.002, decay: 0.235, gain: 0.2 * k }),
    tone(s, { type: 'triangle', freq: 132, to: 125, attack: 0.002, decay: 0.106, gain: 0.05 * k }),
    hiss(s, { freq: 700, attack: 0.001, decay: 0.014, gain: 0.05 * k }),
  );
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
  // A square popping into the intro's core: a thud (pass a rising pitch for a crescendo), with a
  // faint ping from the C chord, louder and higher up it the further through the intro (`share`). In
  // the intro they come through an old radio (see "the radio" below) that opens as they quicken.
  blip: radioed((s) => {
    const k = s.share ?? 0;
    const freq = PING_NOTES[Math.min(PING_NOTES.length - 1, Math.floor(k * PING_NOTES.length * 0.8 + Math.random() * 2))];
    return Math.max(thud(s, 0.93), ping(s, { freq, gain: 0.0034 * (0.5 + k), decay: 0.9 + k * 1.2 }));
  }),
  // The core opening out into the orb, on the last pop: the radio drops away and a deep, full sound
  // fills the room for ten seconds, nothing in it gliding up: the pops' own sub thud, a low C, the C
  // chord they were pinging struck at once, and a warm, still chord body under it.
  bloom: inHall((s) => {
    closeRadio();
    return Math.max(
      tone(s, { freq: 110, to: 49, glide: 0.07, attack: 0.002, decay: 1.2, gain: 0.42 }),
      tone(s, { freq: 65.41, attack: 0.004, decay: 10, gain: 0.168 }),
      ...[[130.81, 0.07], [196, 0.056], [261.63, 0.049], [329.63, 0.035], [392, 0.021]].map(([freq, gain]) => ping(s, { freq, gain, decay: 8 })),
      hum(s, { freqs: [65.41, 98, 130.81, 164.81], cutoff: 900, attack: 0.01, decay: 10, gain: 0.061 }),
      hiss(s, { freq: 500, attack: 0.002, decay: 0.09, gain: 0.098 }),
    );
  }),
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
    hum(s, { at: 0.12, freqs: [130.81, 196], cutoff: 500, attack: 0.06, decay: 1.1, gain: 0.045 }),
    tone(s, { at: 0.12, freq: 65.41, attack: 0.05, decay: 1, gain: 0.08 }),
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
    hum(s, { at: 0.05, freqs: [65.41, 98], cutoff: 300, attack: 0.05, decay: 1.2, gain: 0.05 }),
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
  // A square slotting into its place in the orb: a soft thud.
  slot: (s) => thud(s, 0.55),
  // Pressing the orb, which draws the falling squares in: a deep breath drawn in.
  gather: (s) => Math.max(
    hiss(s, { freq: 150, to: 800, glide: 0.45, attack: 0.45, decay: 0.3, gain: 0.12 }),
    tone(s, { freq: 65.41, to: 98, attack: 0.4, decay: 0.5, gain: 0.12 }),
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
  // In full bloom for the first time: a warm C major chord over a deep root.
  bloomed: (s) => Math.max(
    hum(s, { freqs: [65.41, 130.81, 196, 261.63, 329.63], cutoff: 300, to: 1000, glide: 1.5, attack: 0.8, decay: 4, gain: 0.05 }),
    tone(s, { freq: 65.41, attack: 0.6, decay: 3.5, gain: 0.12 }),
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
    const approach = 4, from = s.from ?? 0, most = (s.length ?? 12) + 4, volume = 0.5;
    const level = s.ctx.createGain();
    level.gain.setValueAtTime(volume, s.t);
    level.gain.setValueAtTime(volume, s.t + most);
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
      hum(fromSide, { freqs: [65.41, 98], cutoff: 140, to: 480, glide: approach, attack: approach * 0.8, hold: most, decay: 2, gain: 0.03 * share, smooth: true });
    }
    const arrive = approach - 1.2;
    hum(all, { at: arrive, freqs: [98, 130.81], cutoff: 200, to: 420, glide: 3, attack: 1.5, hold: most, decay: 2, gain: 0.03, smooth: true });
    tone(all, { at: arrive, freq: 65.41, attack: 1.5, hold: most, decay: 2, gain: 0.09, smooth: true });
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
    tone(s, { freq: 65.41, attack: 0.4, decay: 1.2, gain: 0.08 }),
  ),

  // ----- the page -----
  // The squares flying from one graphic into the next (MORPH in voxel.js, `length` long): dark air
  // and a hum rising as they set off and settling as they arrive, soft pulses as they land, and a
  // chord as the new graphic fades in under them.
  morph: (s) => {
    const l = s.length ?? 7;
    let end = Math.max(
      drift(s, { path: [[0, 150], [l * 0.45, 900], [l * 0.9, 220]], level: [[l * 0.25, 0.1], [l * 0.6, 0.1], [l, 0.0001]] }),
      hum(s, { freqs: [65.41, 98, 130.81], cutoff: 200, to: 700, glide: l * 0.5, attack: l * 0.3, decay: l * 0.7, gain: 0.04 }),
    );
    for (let i = 0; i < 14; i++) {
      tone(s, { at: l * (0.57 + 0.28 * Math.random()), freq: note(0, 5), attack: 0.008, decay: 0.15, gain: 0.04 });
    }
    end = Math.max(end, hum(s, { at: l * 0.8, freqs: [130.81, 196, 261.63, 329.63], cutoff: 400, attack: 0.6, decay: 2.5, gain: 0.04 }));
    return end;
  },
  // A CV entry releasing its squares from its marker: a low boop.
  release: (s) => tone(s, { freq: 262, to: 196, attack: 0.01, decay: 0.22, gain: 0.07 }),
  // One of its squares landing in the graphic.
  land: (s) => Math.max(
    tone(s, { freq: 130.81, attack: 0.006, decay: 0.16, gain: 0.1 }),
    tone(s, { type: 'triangle', freq: 261.63, attack: 0.004, decay: 0.05, gain: 0.02 }),
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
  // The guided tour (tour.js) moving on to another part of the CV: a soft, low knock and a breath of
  // paper. (The tour's bar comes and goes with `open` and `close`.)
  step: (s) => Math.max(
    tone(s, { freq: 87.31, to: 73.42, attack: 0.006, decay: 0.25, gain: 0.1 }),
    hiss(s, { freq: 450, attack: 0.004, decay: 0.09, gain: 0.05 }),
  ),
  // A square calling out a skill (callouts.js): two soft, low blinks, a warm swell as it lights up,
  // and a quiet knock as the box appears.
  callout: (s) => Math.max(
    tone(s, { freq: 220, attack: 0.01, decay: 0.08, gain: 0.04 }),
    tone(s, { at: 0.24, freq: 220, attack: 0.01, decay: 0.08, gain: 0.04 }),
    hum(s, { at: 0.48, freqs: [130.81, 196], cutoff: 250, to: 700, glide: 0.5, attack: 0.25, decay: 1.2, gain: 0.02 }),
    tone(s, { at: 1.3, type: 'triangle', freq: 329.63, attack: 0.004, decay: 0.12, gain: 0.03 }),
  ),
  // Sound turned on (again: the first time, the music opens with it): the music's motif.
  on: (s) => motif(s.t + 0.3) - s.t,
};

// ---------- the radio ----------
// The orb's intro pops come through an old radio: its bass and treble cut, a little crunch, static
// under it. Each pop opens it a little further (by how far through the intro it is), the static
// thinning, so by the last pops it's most of the way to full range; then the bloom lets it go. With
// no pops for a while (the intro cut short), it goes by itself.
const RADIO = { low: 380, high: 2970, crunch: 0.76, static: 0.016, open: 0.64, boost: 1.3 };
const PING_NOTES = [261.63, 329.63, 392, 523.25, 659.25];   // the pops' pings: C major, up from C4
let radio = null;

// An effect made to go through the radio when it's given a share (the intro's pops; on its own, as
// in the tune panel, it plays as it is).
function radioed(make) {
  make.radio = true;
  return make;
}
// An effect that also rings out in the hall.
function inHall(make) {
  make.hall = true;
  return make;
}

// The radio's input, opened as far as `share` (0..1) of the way through the intro says.
function radioIn(share) {
  const now = ctx.currentTime;
  if (!radio) {
    const input = ctx.createGain(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), shaper = ctx.createWaveShaper(), out = ctx.createGain();
    hp.type = 'highpass'; hp.Q.value = 0.9; hp.frequency.value = RADIO.low;
    lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.value = RADIO.high;
    const drive = 1 + RADIO.crunch * 12, curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * drive) / Math.tanh(drive);
    shaper.curve = curve;
    input.gain.value = RADIO.boost;   // (the cut takes away much of a thud's weight)
    input.connect(hp).connect(lp).connect(shaper).connect(out).connect(mix);
    const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), hiss = ctx.createGain();
    src.buffer = noise;
    src.loop = true;
    band.type = 'bandpass'; band.Q.value = 0.6; band.frequency.value = Math.sqrt(RADIO.low * RADIO.high);
    hiss.gain.value = 0.0001;
    src.connect(band).connect(hiss).connect(out);
    src.start(now, Math.random() * 1.5);
    radio = { input, hp, lp, out, hiss, src, timer: 0 };
  }
  // The pops' share grows as the square of time; the radio opens evenly in time.
  const o = RADIO.open * Math.sqrt(Math.min(1, Math.max(0, share)));
  radio.hp.frequency.setTargetAtTime(RADIO.low * (25 / RADIO.low) ** o, now, 0.05);
  radio.lp.frequency.setTargetAtTime(RADIO.high * (16000 / RADIO.high) ** o, now, 0.05);
  radio.hiss.gain.setTargetAtTime(RADIO.static * (1 - o) + 0.0001, now, 0.15);
  clearTimeout(radio.timer);
  radio.timer = setTimeout(closeRadio, 1500);
  return radio.input;
}

// The radio eases away (under the bloom), the static with it.
function closeRadio() {
  if (!radio) return;
  const r = radio, now = ctx.currentTime;
  radio = null;
  clearTimeout(r.timer);
  r.out.gain.setTargetAtTime(0.0001, now, 0.3);
  r.src.stop(now + 2);
  setTimeout(() => r.out.disconnect(), 2500);
}

// ---------- the music ----------
// Calm and bright, a little sci-fi, and never the same twice. It opens with a motif, two notes on a
// warm pulse synth with a silence between ("found it": A5, then E6), and builds out from it a layer at
// a time (MUSIC.enter):
//   - a singing bowl; wave-like air; a drone on C (C3 and G3, a C3 a hair sharp beating slowly
//     against it, a soft C2 under them);
//   - a pad of chords in C major (its IV Lydian-coloured, an Am9 and a Dm9 for warmth), a new one
//     every 3 to 8.5 seconds, each fading out under the next;
//   - plucks in the motif's synth, walking the C major pentatonic in eighth notes, some bars resting,
//     with a ping-pong echo;
//   - a soft synth bass on the chord's root;
//   - now and then a singing bowl, and every 45 seconds or so a "moment": the sound takes on a texture
//     for a while (underwater, an old radio, faint tape hiss, a little crackle), easing in and out,
//     never changing the music itself.
// All of it goes through a Juno-style chorus and a little analog warmth, and rings out into a reverb
// (half as long on a phone; the effects keep their own small room). Made in a sound lab by ear.

const MUSIC = {
  drone: 0.105, droneCutoff: 500, sub: 0.35,
  pad: 1.25, padBright: 2610, chordMin: 3, chordMax: 8.5,
  bpm: 85, density: 0.7, rests: 0.38, pluck: 0.165, pluckBright: 4, dyads: 0.35, gate: 0.1, release: 0.6, echo: 0.3,
  bowl: 0.06, bowlEvery: 18, air: 0.014, airSwell: 0.7,
  wet: 0.9, reverb: PHONE ? 2.5 : 4.5, reverbBright: 0.22, chorus: 0.5, drive: 0.76,
  bass: 0.035, bassCutoff: 380, bassBusy: 0.6,
  momentsEvery: 45, momentDepth: 0.35,
  // the motif
  motif: 0.024, notes: [880, 1318.51], first: 0.7, gap: 0.52, second: 0.75, bright: 1520, secondBrighter: 0.24,
  scoop: 35, vibrato: 21, motifEcho: 0.43, motifRoom: 1.49,
  // after the motif, when each layer comes in (s), and how long the drone and air take to fade in
  enter: { bowl: 0.4, air: 3.3, pad: 3, drone: 7.2, pluck: 9, bass: 13.3 }, fadeIn: 4,
};

const CHORDS = [   // C major, each voiced from its bass up
  [65.41, 196, 246.94, 293.66, 329.63],     // Cmaj9
  [87.31, 174.61, 220, 329.63, 493.88],     // Fmaj7#11
  [110, 164.81, 196, 246.94, 261.63],       // Am9
  [98, 146.83, 196, 261.63, 329.63],        // G6sus
  [82.41, 196, 246.94, 293.66, 392],        // Cmaj9/E
  [87.31, 174.61, 220, 261.63, 392],        // Fmaj9
  [73.42, 146.83, 174.61, 220, 329.63],     // Dm9
  [98, 146.83, 196, 261.63, 329.63],        // G6sus
];
// The plucks' scale: C major pentatonic, C4 to E6.
const SCALE = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
const pitchClass = (f) => Math.round(12 * Math.log2(f / 261.63) + 120) % 12;

// A constant tone at freq into `to`, its level `level`, until the music is gone.
function held(type, freq, level, to) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = level;
  o.connect(g).connect(to);
  o.start();
}

// Filter f, its settings updated once per block of 128 samples instead of every sample: much less
// work, and no different for the music's slow sweeps.
function blockRate(f) {
  for (const p of [f.frequency, f.Q, f.detune, f.gain]) {
    try { p.automationRate = 'k-rate'; } catch { /* stays per sample */ }
  }
  return f;
}

// A slow wobble of param around where it is: rate in Hz, depth in its own units.
function sway(param, rate, depth) {
  const lfo = ctx.createOscillator(), g = ctx.createGain();
  lfo.frequency.value = rate;
  g.gain.value = depth;
  lfo.connect(g).connect(param);
  lfo.start();
}

// Holds param silent until time t, then eases it up to `to` over `over` seconds.
function easeIn(param, t, to, over) {
  param.setValueAtTime(0.0001, ctx.currentTime);
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(to, t + over);
}

// A ping-pong echo into `to`: a dotted eighth at the music's tempo, each repeat darker. Returns its
// input, with stop() to let it go (it rings on by itself otherwise).
function echo(to, feedback) {
  const input = ctx.createGain(), time = (60 / MUSIC.bpm) * 0.75;
  const left = ctx.createDelay(2), right = ctx.createDelay(2), fb = ctx.createGain(), dark = blockRate(ctx.createBiquadFilter());
  const panL = ctx.createStereoPanner(), panR = ctx.createStereoPanner();
  left.delayTime.value = time;
  right.delayTime.value = time;
  dark.type = 'lowpass';
  dark.frequency.value = 2600;
  fb.gain.value = feedback;
  panL.pan.value = -0.8;
  panR.pan.value = 0.8;
  input.connect(left);
  left.connect(dark).connect(right);
  right.connect(fb).connect(left);
  left.connect(panL).connect(to);
  right.connect(panR).connect(to);
  input.stop = () => {
    left.disconnect();
    right.disconnect();
  };
  return input;
}

// The music's chain, from its bus: the warmth (pushed into a tanh curve, linear for quiet sounds, and
// brought back down, so only the louder parts warm up), the moments' lowpass and highpass, then dry
// and through a Juno-style chorus (two short, wavering delays, hard left and right).
function chain(bus) {
  const push = 1 + MUSIC.drive * 30, pre = ctx.createGain(), post = ctx.createGain(), shaper = ctx.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 4);
  shaper.curve = curve;
  shaper.oversample = PHONE ? 'none' : '2x';
  pre.gain.value = push / 4;
  post.gain.value = 1 / push;
  const lowpass = ctx.createBiquadFilter(), highpass = ctx.createBiquadFilter(), out = ctx.createGain();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 18000;
  lowpass.Q.value = 0.5;
  highpass.type = 'highpass';
  highpass.frequency.value = 10;
  highpass.Q.value = 0.5;
  bus.connect(pre).connect(shaper).connect(post).connect(lowpass).connect(highpass).connect(out);
  out.connect(master);
  [-1, 1].forEach((side, k) => {
    const d = ctx.createDelay(0.05), g = ctx.createGain(), pan = ctx.createStereoPanner();
    d.delayTime.value = k ? 0.0105 : 0.0072;
    sway(d.delayTime, k ? 0.83 : 0.51, 0.0022);
    g.gain.value = MUSIC.chorus * 0.7;
    pan.pan.value = side;
    out.connect(d).connect(g).connect(pan).connect(master);
  });
  return { lowpass, highpass };
}

// Starts the music: the motif, and the rest building out from it. Says whether it started now.
function startMusic() {
  if (music) return false;
  const bus = ctx.createGain();
  bus.gain.value = 0;
  const space = ctx.createConvolver();
  space.buffer = roomResponse(MUSIC.reverb, MUSIC.reverbBright, 2);
  const wet = ctx.createGain();
  wet.gain.value = MUSIC.wet;
  wet.connect(space).connect(bus);
  const filters = chain(bus);
  const plucks = ctx.createGain();
  plucks.connect(bus);
  plucks.connect(wet);
  const pluckEcho = echo(bus, 0.38);
  pluckEcho.gain.value = MUSIC.echo;
  plucks.connect(pluckEcho);

  const from = motif(ctx.currentTime + 0.3), e = MUSIC.enter;

  // The drone, dry and in the room.
  const lowpass = blockRate(ctx.createBiquadFilter());
  lowpass.type = 'lowpass';
  lowpass.frequency.value = MUSIC.droneCutoff;
  lowpass.Q.value = 0.5;
  sway(lowpass.frequency, 1 / 24, MUSIC.droneCutoff * 0.3);
  const drone = ctx.createGain();
  easeIn(drone.gain, from + e.drone, MUSIC.drone, MUSIC.fadeIn);
  lowpass.connect(drone);
  drone.connect(bus);
  drone.connect(wet);
  held('sine', 130.81, 0.6, lowpass);
  held('triangle', 196, 0.18, lowpass);
  held('sine', 131.15, 0.3, lowpass);
  held('sine', 65.41, MUSIC.sub, lowpass);

  // The air: soft high noise, its band drifting, swelling slowly like distant waves.
  const air = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), band = blockRate(ctx.createBiquadFilter()), airLevel = ctx.createGain();
  air.buffer = noise;
  air.loop = true;
  hp.type = 'highpass';
  hp.frequency.value = 500;
  band.type = 'bandpass';
  band.frequency.value = 1500;
  band.Q.value = 0.5;
  sway(band.frequency, 1 / 31, 700);
  easeIn(airLevel.gain, from + e.air, MUSIC.air, MUSIC.fadeIn);
  sway(airLevel.gain, 1 / 9, MUSIC.air * MUSIC.airSwell);
  air.connect(hp).connect(band).connect(airLevel);
  airLevel.connect(bus);
  airLevel.connect(wet);
  air.start();

  music = {
    bus, wet, plucks, filters,
    next: from + e.pad, chord: 0, chords: [],    // the pad: when the next chord starts, and those planned
    beat: from + e.pluck, step: 0, at: 5, resting: false,   // the plucks: the next eighth, and where the tune is
    bassFrom: from + e.bass,
    bowl: from + e.bowl,
    moment: from + Math.max(15, MUSIC.momentsEvery * (0.6 + Math.random() * 0.8)),
  };
  levels(true);
  plan();
  return true;
}

// Plans the next couple of seconds of the music, four times a second (it waits while the audio is
// suspended: its clock stops with it).
function plan() {
  const now = ctx.currentTime, ahead = now + 2, m = music;
  while (m.next < ahead) {
    const length = MUSIC.chordMin + Math.random() * (MUSIC.chordMax - MUSIC.chordMin);
    pad(CHORDS[m.chord], m.next, length);
    m.chords.push([m.next, CHORDS[m.chord]]);
    m.chord = (m.chord + 1) % CHORDS.length;
    m.next += length;
  }
  while (m.chords.length > 2 && m.chords[1][0] < now - 10) m.chords.shift();
  while (m.beat < ahead) {
    eighth(m.beat);
    m.beat += 30 / MUSIC.bpm;
  }
  while (m.bowl < ahead) {
    bowl(m.bowl);
    m.bowl += MUSIC.bowlEvery * (0.7 + Math.random() * 0.6);
  }
  if (MUSIC.momentsEvery > 0 && m.moment < ahead) {
    moment(m.moment);
    m.moment += MUSIC.momentsEvery * (0.6 + Math.random() * 0.8);
  }
  setTimeout(plan, 250);
}

// The chord sounding at time t.
function chordAt(t) {
  let chord = music.chords[0]?.[1] ?? CHORDS[0];
  for (const [start, c] of music.chords) if (start <= t) chord = c;
  return chord;
}

// One chord of the pad from time t: its bass a sine, the rest pairs of detuned sawtooths under a
// lowpass that opens and closes again.
function pad(chord, t, length) {
  const attack = Math.min(4.5, length * 0.5), release = 7, end = t + length + release;
  const f = blockRate(ctx.createBiquadFilter()), g = ctx.createGain();
  f.type = 'lowpass';
  f.Q.value = 0.5;
  f.frequency.setValueAtTime(MUSIC.padBright * 0.45, t);
  f.frequency.linearRampToValueAtTime(MUSIC.padBright, t + length * 0.6);
  f.frequency.linearRampToValueAtTime(MUSIC.padBright * 0.5, end);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(MUSIC.pad, t + attack);
  g.gain.setValueAtTime(MUSIC.pad, t + length);
  g.gain.linearRampToValueAtTime(0, end);
  f.connect(g);
  g.connect(music.bus);
  g.connect(music.wet);
  chord.forEach((freq, i) => {
    for (const cents of i === 0 ? [0] : [-6, 6]) {
      const o = ctx.createOscillator(), level = ctx.createGain();
      o.type = i === 0 ? 'sine' : 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = cents;
      level.gain.value = i === 0 ? 0.07 : 0.013;
      o.connect(level).connect(f);
      o.start(t);
      o.stop(end + 0.1);
    }
  });
}

// An eighth note at time t: maybe the bass, maybe a pluck. Bars of eight; a bar may rest (the bass
// plays on through it). The tune walks the pentatonic in small steps, leaning toward the chord's own
// notes, now and then with a second note a third below.
function eighth(t) {
  const m = music;
  if (m.step % 8 === 0) m.resting = Math.random() < MUSIC.rests;
  const strong = m.step % 2 === 0, inBar = m.step % 8;
  m.step++;
  bass(t, strong, inBar);
  if (m.resting || Math.random() >= MUSIC.density * (strong ? 1.25 : 0.55)) return;
  const moves = [-2, -1, -1, 1, 1, 2, 0];
  let at = m.at + moves[Math.floor(Math.random() * moves.length)];
  if (at < 0) at = 1;
  if (at > SCALE.length - 1) at = SCALE.length - 2;
  if (!chordAt(t).map(pitchClass).includes(pitchClass(SCALE[at])) && Math.random() < 0.5) {
    at = Math.max(0, Math.min(SCALE.length - 1, at + (Math.random() < 0.5 ? -1 : 1)));
  }
  m.at = at;
  const human = (Math.random() - 0.5) * 0.03, velocity = (0.6 + Math.random() * 0.4) * (strong ? 1 : 0.8);
  pluck(t + human, SCALE[at], velocity);
  if (Math.random() < MUSIC.dyads && at >= 2) pluck(t + human + 0.012, SCALE[at - 2], velocity * 0.6);
}

// A pluck: a short note in the motif's synth, its brightness following its pitch, panned by it.
function pluck(t, freq, velocity) {
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.log2(freq / 600) * 0.5;
  pan.connect(music.plucks);
  const end = synthNote(pan, t, [freq], MUSIC.gate, {
    level: MUSIC.pluck * velocity, release: MUSIC.release, vibrato: 0, scoop: MUSIC.scoop * 0.3,
    bright: Math.min(MUSIC.bright, freq * MUSIC.pluckBright),
  });
  setTimeout(() => pan.disconnect(), (end - ctx.currentTime + 0.5) * 1000);
}

// The synth bass at time t: the chord's root (an octave up if it's very low; now and then a fifth up),
// a soft sawtooth over a square an octave down, through a lowpass that blooms open on each note and
// closes. Always on the bar's first eighth, otherwise by a loose pattern.
function bass(t, strong, inBar) {
  if (t < music.bassFrom) return;
  const pattern = [1, 0.25, 0.6, 0.35, 0.9, 0.25, 0.6, 0.5];
  if (inBar !== 0 && Math.random() > pattern[inBar] * (0.4 + MUSIC.bassBusy * 0.6)) return;
  let root = chordAt(t)[0];
  if (root < 70) root *= 2;
  if (inBar === 6 && Math.random() < 0.4) root *= 1.5;
  const saw = ctx.createOscillator(), square = ctx.createOscillator(), under = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  const length = (60 / MUSIC.bpm) * 0.5 * (strong ? 0.9 : 0.7), peak = MUSIC.bass * (strong ? 1 : 0.75);
  saw.type = 'sawtooth';
  saw.frequency.value = root;
  square.type = 'square';
  square.frequency.value = root / 2;
  square.detune.value = 4;
  under.gain.value = 0.5;
  f.type = 'lowpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(MUSIC.bassCutoff * 0.4, t);
  f.frequency.exponentialRampToValueAtTime(MUSIC.bassCutoff * 1.6, t + 0.03);
  f.frequency.exponentialRampToValueAtTime(MUSIC.bassCutoff * 0.5, t + length);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.setTargetAtTime(0.0001, t + length * 0.7, length * 0.4);
  saw.connect(f);
  square.connect(under).connect(f);
  f.connect(g).connect(music.bus);
  for (const o of [saw, square]) {
    o.start(t);
    o.stop(t + length * 2 + 0.2);
  }
}

// A singing bowl struck at time t: inharmonic partials ringing long, its fundamental a pair a hair
// apart so it beats; mostly heard in the room.
function bowl(t) {
  const roots = [130.81, 196, 261.63, 196, 130.81], freq = roots[Math.floor(Math.random() * roots.length)];
  const out = ctx.createGain(), dry = ctx.createGain();
  out.gain.value = MUSIC.bowl;
  dry.gain.value = 0.35;
  out.connect(music.wet);
  out.connect(dry).connect(music.bus);
  for (const [ratio, level, life] of [[1, 1, 9], [1.0085, 0.7, 9], [2.71, 0.4, 5], [5.12, 0.18, 3], [8.3, 0.07, 1.6]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq * ratio;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + life);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + life + 0.05);
  }
  setTimeout(() => out.disconnect(), (t - ctx.currentTime + 11) * 1000);
}

// A moment at time t: the sound takes on a texture, easing in over five seconds, staying four and
// easing out over seven, so it's felt more than noticed. One of: underwater (a lowpass closing over
// it), an old radio (its bass thinned, its top dulled), a faint swell of tape hiss, or a little vinyl
// crackle. The music itself never changes.
function moment(t) {
  const d = MUSIC.momentDepth, rise = 5, stay = 4, fall = 7, end = t + rise + stay + fall, which = Math.floor(Math.random() * 4);
  const ease = (param, from, to) => {
    param.setValueAtTime(from, t);
    param.exponentialRampToValueAtTime(to, t + rise);
    param.setValueAtTime(to, t + rise + stay);
    param.exponentialRampToValueAtTime(from, end);
  };
  const { lowpass, highpass } = music.filters;
  if (which === 0) ease(lowpass.frequency, 18000, 18000 * 0.04 ** d);
  else if (which === 1) {
    ease(highpass.frequency, 10, 60 + 700 * d);
    ease(lowpass.frequency, 18000, 18000 * 0.25 ** d);
  } else {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = which === 2 ? noise : crackle();
    src.loop = true;
    f.type = which === 2 ? 'highpass' : 'bandpass';
    f.frequency.value = which === 2 ? 3500 : 2800;
    f.Q.value = 0.5;
    ease(g.gain, 0.0001, (which === 2 ? 0.012 : 0.06) * d + 0.0001);
    src.connect(f).connect(g).connect(music.bus);
    src.start(t);
    src.stop(end + 0.1);
  }
}

// Two seconds of vinyl crackle: silence with sparse, tiny pops of differing sizes.
function crackle() {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), x = buf.getChannelData(0);
  for (let n = 0; n < 70; n++) {
    const at = Math.floor(Math.random() * (x.length - 200)), size = Math.random() ** 3, len = 10 + Math.floor(Math.random() * 60);
    for (let i = 0; i < len; i++) x[at + i] += (Math.random() * 2 - 1) * size * (1 - i / len);
  }
  return buf;
}

// ---------- the motif ----------

let pulseWave = null;   // a pulse wave a quarter on: the synth's voice, warm and a little hollow

// One note of the synth into `out` at time t, `length` long (freqs: one or more at once): a crisp
// attack, a tiny scoop up into its pitch, vibrato easing in, a lowpass starting a little brighter and
// settling; two pulse waves, the second a hair sharp. o: its level, release, vibrato, scoop and
// brightness, and how much brighter it opens (open). Returns when it has rung out.
function synthNote(out, t, freqs, length, o = {}) {
  const level = o.level ?? MUSIC.motif, release = o.release ?? 0.14, vibrato = o.vibrato ?? MUSIC.vibrato, scoop = o.scoop ?? MUSIC.scoop;
  const bright = (o.bright ?? MUSIC.bright) * (1 + (o.open ?? 0) * 1.5), end = t + length + release + 0.06;
  if (!pulseWave) {
    const n = 64, real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    pulseWave = ctx.createPeriodicWave(real, imag);
  }
  const f = ctx.createBiquadFilter(), g = ctx.createGain(), peak = level / Math.sqrt(freqs.length);
  f.type = 'lowpass';
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(bright * 1.6, t);
  f.frequency.exponentialRampToValueAtTime(bright, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(peak * 0.7, t + Math.min(0.2, length * 0.5));
  g.gain.setValueAtTime(peak * 0.7, t + length);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length + release);
  f.connect(g).connect(out);
  let depth = null;
  if (vibrato > 0) {
    const lfo = ctx.createOscillator();
    depth = ctx.createGain();
    lfo.frequency.value = 5.6;
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + 0.18);
    depth.gain.linearRampToValueAtTime(vibrato, t + 0.45);
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(end);
  }
  for (const freq of freqs) {
    for (const [cents, share] of [[0, 0.55], [7, 0.4]]) {
      const osc = ctx.createOscillator(), lg = ctx.createGain();
      osc.setPeriodicWave(pulseWave);
      osc.frequency.value = freq;
      osc.detune.setValueAtTime(cents - scoop, t);
      osc.detune.linearRampToValueAtTime(cents, t + 0.035);
      depth?.connect(osc.detune);
      lg.gain.value = share;
      osc.connect(lg).connect(f);
      osc.start(t);
      osc.stop(end);
    }
  }
  return end;
}

// How long the motif takes from being asked for (sound turned on) to its last note's end, in seconds.
export const MOTIF_SECONDS = 0.3 + MUSIC.first + MUSIC.gap + MUSIC.second;

// The motif from time t: its first note, a silence, and the second, a little brighter; dry, through
// a ping-pong echo, and in a room of its own. Returns when the second note ends.
function motif(t) {
  const out = ctx.createGain(), room = ctx.createConvolver(), roomLevel = ctx.createGain(), toEcho = echo(master, 0.42);
  out.connect(master);
  toEcho.gain.value = MUSIC.motifEcho;
  out.connect(toEcho);
  room.buffer = roomResponse(PHONE ? 2 : 3.5, 0.25, 2.2);
  roomLevel.gain.value = MUSIC.motifRoom;
  out.connect(roomLevel).connect(room).connect(master);
  const [a, b] = MUSIC.notes, second = t + MUSIC.first + MUSIC.gap;
  synthNote(out, t, [a], MUSIC.first);
  synthNote(out, second, [b], MUSIC.second, { open: MUSIC.secondBrighter });
  setTimeout(() => {
    out.disconnect();
    toEcho.stop();
  }, (second - ctx.currentTime + 12) * 1000);
  return second + MUSIC.second;
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
// (which follows the graphic's presence); one may also ring out in a large hall. The music has its
// own level. Both go to the overall level,
// then through the low cut (a steep highpass, two filters deep), and a limiter at the end keeps many
// at once from clipping.
function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  // A browser that won't take the phone's buffer (a number of seconds) gets the next best it will.
  for (const options of PHONE ? [{ latencyHint: PHONE_BUFFER }, { latencyHint: 'playback' }, {}] : [{}]) {
    try {
      ctx = new AC(options);
      break;
    } catch { /* the next */ }
  }
  if (!ctx) return false;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 10;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);
  lowCut = [0.54, 1.31].map((q) => {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.Q.value = q;
    return f;
  });
  lowCut[0].connect(lowCut[1]).connect(limiter);
  master = ctx.createGain();
  master.connect(lowCut[0]);
  fx = ctx.createGain();
  fx.connect(master);
  mix = ctx.createGain();
  mix.connect(fx);
  const reverb = ctx.createConvolver();
  reverb.buffer = roomResponse(1, 0.15, 3);
  room = ctx.createGain();
  mix.connect(room).connect(reverb).connect(fx);
  const large = ctx.createConvolver();
  large.buffer = roomResponse(PHONE ? 2.5 : 4.5, 0.2, 2);
  hall = ctx.createGain();
  hall.gain.value = 0.49;
  hall.connect(large).connect(fx);
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
  const key = `${SOUND.volume} ${SOUND.music} ${SOUND.reverb} ${SOUND.lowCut} ${presence.toFixed(2)}`;
  if (key === applied && !now) return;
  applied = key;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(SOUND.volume, t, 0.1);
  // With no cut, the filters sit far below anything heard.
  for (const f of lowCut) f.frequency.setTargetAtTime(Math.max(SOUND.lowCut, 10), t, 0.1);
  fx.gain.setTargetAtTime(presence, t, 0.15);
  room.gain.setTargetAtTime(SOUND.reverb, t, 0.15);
  // The music fades in when it starts.
  music?.bus.gain.setTargetAtTime(SOUND.music, t, now ? 2.5 : 0.3);
}

// Starts the audio and the music, or resumes them. The first time, it only works inside a gesture.
// Resolves to whether the music started now (with its motif).
function wake() {
  if (!ctx && !build()) return Promise.resolve(false);
  const running = ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => {});
  return running.then(() => ctx.state === 'running' && startMusic());
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
    // The motif greets it, as the music opens (or on its own, if the music was already playing).
    wake().then((started) => {
      levels(true);
      if (!started) play('on');
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
export function play(name, { at = 0, pan = 0, gain = 1, pitch = 1, length, from, share } = {}) {
  const make = SOUNDS[name];
  if (!on || !make || ctx?.state !== 'running' || document.hidden || voices >= MAX_VOICES) return SILENT;
  const out = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  if (out.pan) out.pan.value = Math.max(-1, Math.min(1, pan)) * 0.7;
  const level = ctx.createGain();
  level.gain.value = gain;
  out.connect(level).connect(make.radio && share !== undefined ? radioIn(share) : mix);
  if (make.hall) level.connect(hall);
  const t = ctx.currentTime + Math.max(0, at);
  const made = make({ ctx, out, t, pitch, noise, length, from, share });
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
