// The orb: a still, breathing shell of ink squares inside a drifting cloud, with squares flowing in
// from beyond the screen edges, settling into the orb and drifting back out. Each square that slots
// in sends a faint ripple over the squares around it. Pressing the orb draws the falling squares in
// and pauses new ones. Optional simulated "speech". Drawn by voxel.js.

import { STORY_DOTS, STORY_TOTAL, exact, rebuild, reducedMotion, storyLanded } from '../voxel.js';

// Everything here is read live every frame, so the ?tune panel (tune.js) can change it on the fly.
export const CONFIG = {
  dotCount: 6000,             // dots in the shell
  minDotCount: 1500,
  color: [0.067, 0.063, 0.059],   // ink of the squares (#11100f, a warm black)
  burnColor: [0.13, 0.085, 0.05], // ink of the scorch around them: near-black with a trace of umber
  breathSeconds: 14,          // one full in-and-out breath
  breathDepth: 0.025,         // how much the orb grows at the top of a breath, fraction of radius
  tilt: 0,                    // radians around the X axis; the orb doesn't spin, this just sets the viewing angle
  cameraDistance: 6.4,        // in orb radii; lower = stronger perspective
  dotSize: 0.042,             // sprite size (square + burn) as a fraction of the orb radius
  squareSize: 0.18,           // the solid square, as a share of the sprite
  burn: 0.55,                 // strength of the scorch around each square
  brightness: 1,              // overall ink strength
  flowCount: 100,             // dots that fall in from the screen edges into their own slot in the orb
  flowSeconds: 60,            // average length of one cycle: fall in, rest, drift out and fade
  flowLinger: 0.45,           // share of the cycle spent resting in the slot
  gravity: 8,                 // 0 = constant speed; higher = slower drift at first, faster pull at the end
  landing: 0.35,              // share of the fall spent braking into the slot (0 = arrive at full speed)
  flowSwirl: 0.35,            // how far (radians) the path curls around the orb on the way in
  slotGlow: 2,                // strength of the dark flare of burn when a dot slots in
  afterglowSeconds: 2.5,      // how long a softer burn lingers after the flare
  gatherSeconds: 1.5,         // pressing the ball: how long the falling dots take to be drawn in
  gatherJitter: 0.2,          // pressing the ball: arrivals are spread randomly over this many extra seconds
  respawnDelay: 5,            // pressing the ball: seconds before new dots start falling again
  storyFallSeconds: 2.4,      // CV entries: how long an entry's dots take to fall into the orb
  storyGlow: 0.35,            // CV entries: how much stronger their dots stay once slotted in
  storyIntegrateSeconds: 4,   // CV entries: how long their own colour takes to blend into the orb's ink
  rippleStrength: 0.004,      // how far a slotting-in square nudges the squares around it, fraction of radius (0 = off)
  rippleSpeed: 0.3,           // how fast the ripple spreads over the surface, orb radii per second
  rippleSeconds: 1.6,         // how long a ripple lasts before it has faded out
  speech: 0,                  // 0 = no simulated speech, 1 = full; scales everything below it
  voiceAmplitude: 0.035,      // core shell swell while "speaking", fraction of radius
  voiceSpeed: 1,              // how fast the lumps travel over the surface
  syllableMs: 220,            // average time between loudness changes while speaking
  burstSeconds: 4.5,          // average length of a speaking burst
  pauseSeconds: 3.2,          // average silence between bursts
  responsiveness: 8,          // how quickly the swell rises to each syllable (it fades at half this rate)
  looseFraction: 0.3,         // extra loose dots outside the shell, as a share of dotCount
  looseSpread: 0.36,          // how far out the outermost loose dots sit, fraction of radius
  looseDrift: 0.165,          // how much each loose dot wanders on its own
  looseVoice: 0.49,           // how far speech pushes the loose dots outward
  pullRadius: 0.2,            // pointer influence radius, fraction of orb radius
  pullStrength: 0.22,         // how far toward the pointer a dot travels at full influence
  pullGlow: 0.02,             // how much pulled dots darken and burn wider (0 = none)
};

// Ripples: the most recent slot-ins, each spreading out from where its square landed.
const RIPPLES = 16;

const SHADER = `
attribute vec3 aPos;      // unit vector on the sphere
attribute float aSeed;    // 0..1 shell, 1..2 loose, 2..3 flowing, 3..4 story

uniform float uVoiceTime, uBreath, uTilt, uEnergy, uVoiceAmp;
uniform float uLooseSpread, uLooseDrift, uLooseVoice;
uniform float uFlowTime, uFlowSeconds, uFlowLinger, uGravity, uFlowSwirl;
uniform float uGatherStart, uGatherEnd, uGatherSeconds, uGatherJitter;
uniform vec4 uRipple[${RIPPLES}];   // recent slot-ins: xyz = where (unit vector), w = when (seconds, uTime)
uniform float uRippleStrength, uRippleSpeed, uRippleSeconds;

// Ripples on the surface around recent slot-ins, at unit direction d: a single crest and trough
// spreading outward, nudging dots along the surface (plus a whisper outward) and darkening the crest.
// Returns the displacement in orb radii (xyz) and extra ink (w).
vec4 ripple(vec3 d) {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRipple[i];
    float age = uTime - r.w;
    if (age < 0.0 || age > uRippleSeconds) continue;
    vec3 toward = r.xyz - d;
    float x = (length(toward) - age * uRippleSpeed) / 0.06;
    float wave = sin(x * 2.2) * exp(-x * x);
    float life = 1.0 - age / uRippleSeconds;
    wave *= life * life * smoothstep(0.0, 0.12, age);
    vec3 along = toward - d * dot(toward, d);
    float len = length(along);
    if (len > 1e-4) sum.xyz -= along / len * wave;
    sum.xyz += d * wave * 0.4;
    sum.w += max(wave, 0.0);
  }
  return vec4(sum.xyz * uRippleStrength, sum.w * uRippleStrength * 30.0);
}

void main() {
  vec3 pos;
  vColor = uColor;
  float looseDim = 1.0;
  float fade = 1.0;
  float heat = 0.0;          // slot-in flash
  bool falling = false;
  float fall = 1.0;          // falling dots: 0 = at the start point, 1 = in its slot
  vec2 fallStart = vec2(0.0);
  float wobbleAmt = 0.12;
  float fk = 0.0, fh1 = 0.0, fh2 = 0.0;

  if (aSeed >= 3.0) {
    // Story dot: a CV entry's squares, falling in from the entry's marker (see story()).
    float idx = floor((aSeed - 3.0) * ${STORY_TOTAL.toFixed(1)});
    fk = idx / 97.0;
    fh2 = hash(idx * 7.7 + 4.0);
    pos = aPos;
    wobbleAmt = 0.03;
    falling = story(idx, fall, fallStart, heat, fade);
  } else if (aSeed >= 2.0) {
    // Flowing dot. Each has a reserved slot in the shell. Cycle: fall in from the screen edge
    // as if pulled by gravity (barely moving at first, speeding up as it nears, braking into
    // the slot), flare with burn, rest, then quietly drift outward and fade before starting again.
    // Cycle length, phase and gather delay come from exact() so orb.js can tell when it slots in.
    fk = aSeed - 2.0;
    fh1 = hash(fk * 91.7);
    fh2 = exact(fk, 61.0);
    float h3 = hash(fk * 13.1 + 2.0);
    float cycle = uFlowSeconds * (0.7 + 0.6 * fk);
    float phase = fract(uFlowTime / cycle + fh2);
    float cycleStart = uFlowTime - phase * cycle;
    float fallEnd = (1.0 - uFlowLinger) * 0.65;
    float restEnd = fallEnd + uFlowLinger;
    float fallTime = fallEnd * cycle;
    float g = uGravity * (0.8 + 0.4 * h3);
    float landed = -1.0;     // seconds since slotting in
    pos = aPos * (1.0 + (h3 - 0.5) * 0.03);
    looseDim = 0.8;

    // Start just past the screen edge in this dot's direction.
    vec2 dir = vec2(cos(fh1 * 6.2832), sin(fh1 * 6.2832));
    vec2 room = vec2(dir.x > 0.0 ? uResolution.x - uCenter.x : uCenter.x,
                     dir.y > 0.0 ? uResolution.y - uCenter.y : uCenter.y);
    // (At least just outside the orb: resting on the horizon, its centre is below the screen.)
    float edge = max(min(room.x / max(abs(dir.x), 0.001), room.y / max(abs(dir.y), 0.001)), uRadius * 1.1);
    fallStart = uCenter + dir * (edge + uDotSize * uRadius);

    // After the ball is pressed: cycles that would start during the pause are skipped (no new
    // spawns), and dots that were mid-fall are drawn straight in to their slots.
    bool skipped = cycleStart >= uGatherStart && cycleStart < uGatherEnd;
    bool gathered = cycleStart < uGatherStart && uGatherStart < cycleStart + fallTime;

    if (skipped) {
      fade = 0.0;
    } else if (phase >= restEnd) {
      float e = (phase - restEnd) / max(1.0 - restEnd, 0.001);
      pos *= 1.0 + e * e * (uLooseSpread + 0.1);
      fade = 1.0 - smoothstep(0.0, 1.0, e);
    } else if (gathered) {
      // Each dot gets its own small extra delay so the arrivals ripple in rather than land in unison.
      float gatherTime = uGatherSeconds + exact(fk, 29.0) * uGatherJitter;
      float x = (uFlowTime - uGatherStart) / gatherTime;
      if (x < 1.0) {
        float u0 = (uGatherStart - cycleStart) / fallTime;
        fall = mix(fallCurve(u0, g, uLanding), 1.0, smoothstep(0.0, 1.0, x));
        falling = true;
        fade = mix(smoothstep(0.0, 0.12, u0), 1.0, x) * mix(0.55, 1.0, fall);
      } else {
        landed = (x - 1.0) * gatherTime;
      }
    } else if (phase < fallEnd) {
      float u = phase / fallEnd;
      fall = fallCurve(u, g, uLanding);
      falling = true;
      fade = smoothstep(0.0, 0.12, u) * mix(0.55, 1.0, fall);
    } else {
      landed = (phase - fallEnd) * cycle;
    }

    if (landed >= 0.0) heat = slotHeat(landed);
  } else if (aSeed >= 1.0) {
    // Loose particle (seed 1..2), extra to the shell: floats outside it on its own slow path
    // and is pushed outward while speaking. Densest at the surface and thinning outward;
    // the further out, the fainter, smaller and freer it moves, so the ball dissolves gradually.
    float k = aSeed - 1.0;
    float outer = k * k;
    float n = k * 97.0;
    vec3 drift = vec3(
      snoise(vec3(n, uTime * 0.12, 1.7)),
      snoise(vec3(3.1, n, uTime * 0.12)),
      snoise(vec3(uTime * 0.12, 5.3, n))) * uLooseDrift * (0.25 + 0.75 * outer);
    float push = uEnergy * uLooseVoice * (0.2 + 0.8 * outer)
               * (0.6 + 0.4 * snoise(aPos * 2.2 + vec3(uVoiceTime * 0.8)));
    pos = aPos * (1.01 + outer * uLooseSpread + push) + drift;
    looseDim = mix(0.8, 0.2, outer);
  } else {
    // Core shell: steady, with a faint idle drift and a slow, gentle swell while speaking.
    float idle = snoise(aPos * 2.0 + vec3(0.0, uTime * 0.2, 0.0)) * 0.012;
    float voice = snoise(aPos * 1.3 + vec3(0.0, uVoiceTime * 0.9, uVoiceTime * 0.5)) * 0.8
                + snoise(aPos * 2.6 - vec3(uVoiceTime * 1.4)) * 0.2;
    pos = aPos * (1.0 + (aSeed - 0.5) * 0.04 + idle + uEnergy * uVoiceAmp * voice);
  }

  // Ripples from squares slotting in nearby move the shell and the dots resting in their slots.
  float rippleInk = 0.0;
  if (aSeed < 1.0 || (aSeed >= 2.0 && !falling)) {
    vec4 rp = ripple(aPos);
    pos += rp.xyz;
    rippleInk = rp.w;
  }
  pos *= uBreath;

  // No spin; just tilt around X for the viewing angle.
  float ct = cos(uTilt), st = sin(uTilt);
  vec3 p = vec3(pos.x, pos.y * ct - pos.z * st, pos.y * st + pos.z * ct);
  float zn = p.z / length(p);
  float s;
  vec2 screen = project(p, s);
  float depth = clamp((zn + 1.0) * 0.5, 0.0, 1.0);

  if (falling) {
    // Travel from the start point to exactly the slot. The path curls around the orb, more and
    // more as it nears (like a captured orbit), and wobbles organically while far out.
    float swirl = uFlowSwirl * (fh2 > 0.5 ? 1.0 : -1.0);
    vec2 v = rot(mix(fallStart - uCenter, rot(screen - uCenter, -swirl), fall), swirl * fall * fall);
    vec2 wobble = vec2(snoise(vec3(fk * 50.0, uTime * 0.15, 0.0)),
                       snoise(vec3(0.0, fk * 50.0, uTime * 0.15))) * uRadius * wobbleAmt * (1.0 - fall);
    screen = uCenter + v + wobble;
    s = mix(1.0, s, fall);
    depth = mix(0.8, depth, fall);
    zn = mix(0.6, zn, fall);
  }

  // The rim gets a little extra ink so the silhouette reads; story dots may fall through the horizon.
  emit(screen, s, depth, 1.0 - abs(zn), heat, looseDim * fade * (1.0 + rippleInk), uEnergy * 0.1,
       mix(0.6, 1.0, looseDim), aSeed < 3.0);
}`;

// ---------- the squares ----------

function randomDirection() {
  const y = Math.random() * 2 - 1;
  const r = Math.sqrt(1 - y * y);
  const a = Math.random() * Math.PI * 2;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

let storySlots = new Float32Array(0), flowSlots = [];
let placed = new Float32Array(0);   // the data build() made last

// Shell dots sit on an even Fibonacci lattice (seed 0..1); loose (seed 1..2) and
// flowing (seed 2..3) dots get random directions. Story dots (seed 3..4) get slots on the
// front of the orb, so their arrival is visible, and go first so they're never dropped.
function build() {
  const shellCount = CONFIG.dotCount;
  const looseCount = Math.round(shellCount * CONFIG.looseFraction);
  const flowCount = CONFIG.flowCount;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const dots = [];
  for (let i = 0; i < shellCount; i++) {
    const y = 1 - (2 * (i + 0.5)) / shellCount;
    const r = Math.sqrt(1 - y * y);
    const a = i * golden;
    dots.push([Math.cos(a) * r, y, Math.sin(a) * r, Math.random()]);
  }
  for (let i = 0; i < looseCount + flowCount; i++) {
    dots.push([...randomDirection(), (i < looseCount ? 1 : 2) + Math.random()]);
  }
  // Shuffle so drawing only the first k dots (on slow devices) still covers the sphere evenly.
  for (let i = dots.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [dots[i], dots[j]] = [dots[j], dots[i]];
  }
  const story = [];
  for (let i = 0; i < STORY_TOTAL; i++) {
    let d;
    do d = randomDirection(); while (d[2] < 0.3);
    story.push([...d, 3 + (i + 0.5) / STORY_TOTAL]);
  }
  const all = story.concat(dots);
  const data = new Float32Array(all.length * 4);
  all.forEach((d, k) => data.set(d, k * 4));

  // Keep the slots of the dots that slot in, read back from the Float32 data exactly as the shader
  // sees them, so each landing can be predicted (flowLandings) and sent out as a ripple.
  storySlots = data.subarray(0, STORY_TOTAL * 4);
  flowSlots = [];
  for (let i = STORY_TOTAL; i < all.length; i++) {
    const seed = data[i * 4 + 3];
    if (seed < 2 || seed >= 3) continue;
    const k = seed - 2;
    flowSlots.push({ index: i, dir: data.subarray(i * 4, i * 4 + 3), k, phase: exact(k, 61), gatherDelay: exact(k, 29) });
  }
  placed = data;
  return data;
}

// Where the visible squares are, for morphing (see POSE in voxel.js): each at rest in its place,
// as the shader draws it (without the loose dots' wandering and the flowing dots' travels).
function pose() {
  const out = [];
  const ct = Math.cos(CONFIG.tilt), st = Math.sin(CONFIG.tilt);
  for (let i = 0; i < placed.length / 4; i++) {
    const seed = placed[i * 4 + 3];
    let reach = 1 + (seed - 0.5) * 0.04, looseDim = 1;
    if (seed >= 3) {
      if (!storyLanded(Math.floor(i / STORY_DOTS))) continue;
      reach = 1;
    } else if (seed >= 2) {
      looseDim = 0.8;
      reach = 1;
    } else if (seed >= 1) {
      const outer = (seed - 1) ** 2;
      reach = 1.01 + outer * CONFIG.looseSpread;
      looseDim = 0.8 + (0.2 - 0.8) * outer;
    }
    const k = reach * breath;
    const x = placed[i * 4] * k, y = placed[i * 4 + 1] * k, z = placed[i * 4 + 2] * k;
    const py = y * ct - z * st, pz = y * st + z * ct;
    const zn = pz / Math.hypot(x, py, pz);
    const rim = 1 - Math.abs(zn);
    out.push(x, py, pz, (zn + 1) / 2, looseDim, 0.6 + 0.4 * looseDim, 0.1 * rim * rim);
  }
  return new Float32Array(out);
}

// ---------- pressing the ball: draw in the falling dots, pause spawning ----------

// In flow-time units. Cycles starting within [start, end) are skipped; dots mid-fall at `start` are drawn in.
const gathering = { start: -1e9, end: -1e9 };
let flowTime = 0;

function gather() {
  if (flowTime < gathering.end) {
    gathering.end = flowTime + CONFIG.respawnDelay;   // pressed again while paused: just extend the pause
  } else {
    gathering.start = flowTime;
    gathering.end = flowTime + CONFIG.respawnDelay;
  }
}

// ---------- ripples: each square that slots in nudges the squares around it ----------

// The most recent slot-ins as [x, y, z, time] (time in seconds, the frame clock). New ones overwrite
// the oldest; the shader ignores any older than rippleSeconds.
const ripples = new Float32Array(RIPPLES * 4).fill(-1e9);
let nextRipple = 0;
const scheduled = [];   // story dots' landings, known when they're dropped: { dir, time }

function addRipple(dir, time) {
  if (reducedMotion.matches || CONFIG.rippleStrength <= 0) return;
  ripples.set(dir, nextRipple * 4);
  ripples[nextRipple * 4 + 3] = time;
  nextRipple = (nextRipple + 1) % RIPPLES;
}

// A CV entry's dots each ripple the surface where they slot in (the shader's timing, in 32-bit floats).
function onDrop(entry, t0) {
  for (let sub = 0; sub < STORY_DOTS; sub++) {
    const idx = entry * STORY_DOTS + sub;
    const time = t0 + sub * 0.18 + exact(idx, 0.618034) * 0.12 + Math.max(0.1, CONFIG.storyFallSeconds);
    scheduled.push({ dir: storySlots.subarray(idx * 4, idx * 4 + 3), time });
  }
}

// Finds the flowing dots that slotted in between flow times prev and now, mirroring their cycle in the
// shader, and ripples from each. t is the frame's clock time, which ripples are timed in; dots past
// activeCount aren't being drawn.
function flowLandings(prev, now, t, activeCount) {
  const fallEnd = (1 - CONFIG.flowLinger) * 0.65;
  const gatherSeconds = Math.max(0.05, CONFIG.gatherSeconds);
  for (const f of flowSlots) {
    if (f.index >= activeCount) continue;
    const cycle = CONFIG.flowSeconds * (0.7 + 0.6 * f.k);
    // An ordinary landing: the phase passes fallEnd. Not for a cycle skipped or drawn in by a press.
    const n = Math.floor(now / cycle + f.phase - fallEnd);
    if (n > Math.floor(prev / cycle + f.phase - fallEnd)) {
      const start = (n - f.phase) * cycle;
      const skipped = start >= gathering.start && start < gathering.end;
      const gathered = start < gathering.start && gathering.start < start + fallEnd * cycle;
      if (!skipped && !gathered) addRipple(f.dir, t - (now - (start + fallEnd * cycle)));
    }
    // Drawn in by a press: dots that were mid-fall land a set time (plus their own delay) after it.
    const land = gathering.start + gatherSeconds + f.gatherDelay * CONFIG.gatherJitter;
    if (prev < land && land <= now) {
      const u = gathering.start / cycle + f.phase;
      const phase = u - Math.floor(u);
      if (phase > 0 && phase < fallEnd) addRipple(f.dir, t - (now - land));
    }
  }
  for (let i = 0; i < scheduled.length; ) {
    if (scheduled[i].time <= t) addRipple(scheduled[i].dir, scheduled.splice(i, 1)[0].time);
    else i++;
  }
}

// ---------- simulated voice ----------

const voice = { start: 0, end: 0, next: 0.6, level: 0, target: 0, nextSyllable: 0, energy: 0 };

function rand(a, b) { return a + Math.random() * (b - a); }

function startBurst(t) {
  voice.start = t;
  voice.end = t + CONFIG.burstSeconds * rand(0.6, 1.4);
  voice.next = voice.end + CONFIG.pauseSeconds * rand(0.5, 1.5);
}

function speakNow() {
  startBurst(performance.now() / 1000);
}

function updateVoice(t, dt) {
  if (reducedMotion.matches) { voice.energy = 0; return; }
  if (t >= voice.next && t >= voice.end) startBurst(t);

  const speaking = t < voice.end;
  if (speaking && t >= voice.nextSyllable) {
    // Syllable-like chatter: mostly loud, sometimes a short pause.
    voice.target = Math.random() < 0.1 ? 0.35 : rand(0.5, 0.95);
    voice.nextSyllable = t + (CONFIG.syllableMs / 1000) * rand(0.6, 1.4);
  }
  const attack = Math.min(1, (t - voice.start) / 0.5);
  const release = Math.min(1, Math.max(0, (voice.end - t) / 0.9));
  const envelope = speaking ? attack * release : 0;

  // Rise at `responsiveness`, fade at half that, so each syllable settles softly.
  voice.level += (voice.target - voice.level) * (1 - Math.exp(-dt * CONFIG.responsiveness * 1.5));
  const goal = envelope * voice.level;
  const rate = goal > voice.energy ? CONFIG.responsiveness : CONFIG.responsiveness * 0.5;
  voice.energy += (goal - voice.energy) * (1 - Math.exp(-dt * rate));
}

// ---------- frame ----------

let breathPhase = 0;          // accumulated so changing breathSeconds never jumps
let breath = 1;               // the orb's scale this frame
let voiceTime = 0;            // accumulated separately so changing voiceSpeed never jumps

function frame({ t, dt, set, activeCount }) {
  updateVoice(t, dt);

  // Breathing: smooth in-and-out scale, gentler with reduced motion.
  breathPhase += (dt * Math.PI * 2) / CONFIG.breathSeconds;
  const depth = reducedMotion.matches ? CONFIG.breathDepth * 0.5 : CONFIG.breathDepth;
  breath = 1 + depth * (0.5 - 0.5 * Math.cos(breathPhase));
  voiceTime += dt * CONFIG.voiceSpeed;
  const prevFlowTime = flowTime;
  flowTime += reducedMotion.matches ? dt * 0.5 : dt;
  flowLandings(prevFlowTime, flowTime, t, activeCount);

  set('uBreath', breath);
  set('uTilt', CONFIG.tilt);
  set('uEnergy', voice.energy * CONFIG.speech);
  set('uVoiceTime', voiceTime);
  set('uVoiceAmp', CONFIG.voiceAmplitude);
  set('uLooseSpread', CONFIG.looseSpread);
  set('uLooseDrift', CONFIG.looseDrift);
  set('uLooseVoice', CONFIG.looseVoice);
  set('uFlowTime', flowTime);
  set('uFlowSeconds', CONFIG.flowSeconds);
  set('uFlowLinger', CONFIG.flowLinger);
  set('uGravity', CONFIG.gravity);
  set('uFlowSwirl', CONFIG.flowSwirl);
  set('uGatherStart', gathering.start);
  set('uGatherEnd', gathering.end);
  set('uGatherSeconds', Math.max(0.05, CONFIG.gatherSeconds));
  set('uGatherJitter', CONFIG.gatherJitter);
  set('uRipple', ripples);
  set('uRippleStrength', CONFIG.rippleStrength);
  set('uRippleSpeed', CONFIG.rippleSpeed);
  set('uRippleSeconds', Math.max(0.1, CONFIG.rippleSeconds));
}

// ---------- the graphic ----------

const rebuildNow = () => rebuild();

export default {
  name: 'orb',
  CONFIG,
  attributes: [['aPos', 3], ['aSeed', 1]],
  shader: SHADER,
  build,
  frame,
  pose,
  onDrop,
  press: gather,
  focus: (on) => { if (on) gather(); },
  // The paper's scorch behind the orb swells a little while it "speaks".
  halo: () => 0.6 + voice.energy * CONFIG.speech * 0.8,
  // After a press in the hero, let the falling squares be drawn in before gliding down to the CV.
  get pressDelay() { return CONFIG.gatherSeconds + CONFIG.gatherJitter + 0.25; },
  sliders: [
    { group: 'Orb' },
    { key: 'dotCount', label: 'Number of dots', min: 1000, max: 20000, step: 500, apply: rebuildNow },
    { key: 'breathSeconds', label: 'Breath length (s)', min: 1, max: 20, step: 0.5 },
    { key: 'breathDepth', label: 'Breath depth', min: 0, max: 0.2, step: 0.005 },
    { key: 'tilt', label: 'Viewing angle', min: 0, max: 1.2, step: 0.01 },
    { group: 'Flow' },
    { key: 'flowCount', label: 'Flowing dots', min: 0, max: 1000, step: 10, apply: rebuildNow },
    { key: 'flowSeconds', label: 'Cycle length (s)', min: 4, max: 60, step: 1 },
    { key: 'flowLinger', label: 'Time resting in slot', min: 0, max: 0.9, step: 0.05 },
    { key: 'gravity', label: 'Gravity (slow start, fast finish)', min: 0, max: 12, step: 0.1 },
    { key: 'flowSwirl', label: 'Spiral in', min: 0, max: 3, step: 0.05 },
    { key: 'gatherSeconds', label: 'Press: draw-in time (s)', min: 0.2, max: 5, step: 0.1 },
    { key: 'gatherJitter', label: 'Press: arrival spread (s)', min: 0, max: 1.5, step: 0.05 },
    { key: 'respawnDelay', label: 'Press: pause before respawn (s)', min: 0, max: 20, step: 0.5 },
    { group: 'Ripples' },
    { key: 'rippleStrength', label: 'Ripple strength (0 = off)', min: 0, max: 0.05, step: 0.001 },
    { key: 'rippleSpeed', label: 'Ripple speed', min: 0.05, max: 1.5, step: 0.05 },
    { key: 'rippleSeconds', label: 'Ripple length (s)', min: 0.2, max: 5, step: 0.1 },
    { group: 'Speech' },
    { key: 'speech', label: 'Speech amount (0 = off)', min: 0, max: 1, step: 0.05 },
    { key: 'voiceAmplitude', label: 'Core swell', min: 0, max: 0.3, step: 0.005 },
    { key: 'voiceSpeed', label: 'Wobble speed', min: 0.1, max: 4, step: 0.05 },
    { key: 'syllableMs', label: 'Syllable length (ms)', min: 30, max: 300, step: 5 },
    { key: 'responsiveness', label: 'Snappiness', min: 2, max: 40, step: 1 },
    { key: 'burstSeconds', label: 'Burst length (s)', min: 0.5, max: 8, step: 0.1 },
    { key: 'pauseSeconds', label: 'Pause between (s)', min: 0.2, max: 10, step: 0.1 },
    { group: 'Loose particles' },
    { key: 'looseFraction', label: 'Amount (share of shell)', min: 0, max: 0.5, step: 0.01, apply: rebuildNow },
    { key: 'looseSpread', label: 'Distance out', min: 0, max: 0.5, step: 0.005 },
    { key: 'looseDrift', label: 'Wander', min: 0, max: 0.2, step: 0.005 },
    { key: 'looseVoice', label: 'Push when speaking', min: 0, max: 0.6, step: 0.01 },
  ],
  actions: { 'Draw in': gather, 'Speak now': speakNow },
};
