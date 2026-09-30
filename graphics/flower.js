// The flower: a strip of soil, and a flower that grows out of it square by square, every square
// flying up from below the screen, through the soil to the stem's foot and up the stem, as if the
// flower draws its nourishment from the ground. Over one cycle (about a minute) the soil forms (the
// first time), roots spread, the stem pokes through the ground, leaves unfold, the head fills in as a
// sunflower spiral and petals grow. At full bloom the petals let go and fall away on the wind, the
// rest flows back down into the ground, and a new, slightly different flower starts. Drawn by voxel.js.

import { STORY_TOTAL, rebuild, reducedMotion } from '../voxel.js';

// Everything here is read live every frame, so the ?tune panel (tune.js) can change it on the fly.
export const CONFIG = {
  cycleSeconds: 60,           // one full cycle: soil (first time), roots, stem, leaves, head, petals, bloom, fall
  flightSeconds: 3.2,         // how long a square takes to fly up from below the screen to its place
  gravity: 3,                 // 0 = constant speed; higher = slower rise at first, faster climb at the end
  landing: 0.35,              // share of the flight spent braking into place (0 = arrive at full speed)
  petalFallSeconds: 3.5,      // how long a falling petal takes to fade away
  witherSeconds: 2.6,         // how long the rest takes to flow back down into the ground
  sway: 0.035,                // how far the wind bends the flower, fraction of radius
  swaySpeed: 0.7,             // how fast the wind moves
  pitch: 0.28,                // radians the view looks down onto the ground
  soilCount: 1000,            // squares in the soil below its surface
  minDotCount: 1200,
  color: [0.067, 0.063, 0.059],   // ink of the squares (#11100f, a warm black)
  burnColor: [0.13, 0.085, 0.05], // ink of the scorch around them: near-black with a trace of umber
  cameraDistance: 6.4,        // in radii; lower = stronger perspective
  dotSize: 0.04,              // sprite size (square + burn) as a fraction of the radius
  squareSize: 0.19,           // the solid square, as a share of the sprite
  burn: 0.55,                 // strength of the scorch around each square
  brightness: 1,              // overall ink strength
  slotGlow: 1.2,              // strength of the dark flare of burn when a square lands
  afterglowSeconds: 2,        // how long a softer burn lingers after the flare
  storyFallSeconds: 2.4,      // CV entries: how long an entry's squares take to fall onto the soil
  storyGlow: 0.35,            // CV entries: how much stronger their squares stay once landed
  storyIntegrateSeconds: 4,   // CV entries: how long their own colour takes to blend into the ink
  pullRadius: 0.2,            // pointer influence radius, fraction of radius
  pullStrength: 0.22,         // how far toward the pointer a square travels at full influence
  pullGlow: 0.02,             // how much pulled squares darken and burn wider (0 = none)
};

// When each part grows, as shares of the cycle. These are arrival times: a square sets off
// flightSeconds earlier. Leaving times are the moment a square lets go.
const PHASE = {
  ground: [0.02, 0.1],        // the first cycle only: the soil rises into place
  roots: [0.1, 0.17],
  stem: [0.15, 0.4],          // from its foot in the soil up to the head
  leaf: 0.07,                 // each leaf, starting as the stem passes it
  head: [0.4, 0.5],
  petals: [0.5, 0.72],
  petalsFall: [0.84, 0.88],   // then they fall for petalFallSeconds
  wither: [0.89, 0.95],       // the rest returns into the ground, head first, roots last
};
const GROUND = -0.66;         // the soil's surface (stage units; the shader has the same)
const FOOT = -0.08;           // the stem starts this far below the ground, in stem heights
const HEAD_RADIUS = 0.09;
const HEAD_SQUARES = 110;

// Parts, as the shader knows them.
const SOIL = 0, ROOT = 1, STEM = 2, LEAF = 3, HEAD = 4, PETAL = 5, STORY = 6;

const SHADER = `
attribute vec3 aTarget;   // where the square sits once grown (stage units)
attribute vec2 aTime;     // when it lands and when it lets go, as shares of the cycle (> 1: never)
attribute vec3 aInfo;     // x = part; y = stem height it branches off at (petals: which petal,
                          // soil: its ink, story: its index); z = random 0..1

uniform float uCycle, uCycleSeconds, uSoilTime;   // seconds into this cycle; cycle length; since the soil began
uniform float uFlight, uGravity, uFallSeconds, uWitherSeconds;
uniform vec4 uStem;       // stem height, bend, bend phase, lean
uniform float uPitch, uSway, uSwaySpeed, uGust;

const float GROUND = ${GROUND.toFixed(3)};
const float FOOT = ${FOOT.toFixed(3)};
const float SCREEN_SHARE = 0.35;   // share of the way up spent rising from below the screen into the soil

// The stem's centreline at height h (0 = the ground, 1 = the head; below 0 it's in the soil).
// flower.js has the same function; keep them in step.
vec3 stemAt(float h) {
  return vec3(uStem.y * (sin(h * 2.4 + uStem.z) - sin(uStem.z)) + uStem.w * h,
              GROUND + h * uStem.x,
              0.5 * uStem.y * sin(h * 1.8));
}

// Wind: everything above the ground bends, more the higher it is.
vec3 sway(vec3 p) {
  float h = max(p.y - GROUND, 0.0) / uStem.x;
  float t = uTime * uSwaySpeed;
  vec2 d = vec2(sin(t) + 0.4 * sin(t * 2.3 + 1.3), 0.6 * sin(t * 0.7 + 2.0)) * uSway * (1.0 + 3.0 * uGust) * h * h;
  return p + vec3(d.x, 0.0, d.y);
}

// The view looks slightly down onto the ground, pivoting at the stem's foot.
vec3 view(vec3 p) {
  float c = cos(uPitch), s = sin(uPitch), y = p.y - GROUND;
  return vec3(p.x, GROUND + y * c - p.z * s, y * s + p.z * c);
}

// Just below the bottom of the screen, where a square sets off (device px).
vec2 below(float r) {
  return vec2(uCenter.x + (r - 0.5) * uRadius * 1.6, uResolution.y + uDotSize * uRadius * 2.0);
}

// Deep in the soil under the flower, where a square's climb begins.
vec3 deep(float r) {
  return vec3(stemAt(0.0).x + (r - 0.5) * 0.5, GROUND - 0.3, (fract(r * 7.13) - 0.5) * 0.3);
}

// A square's climb at progress q (0 = deep in the soil, 1 = in place): up through the soil to the
// stem's foot, up the stem to height a where its part branches off, then out to its place.
vec3 climb(float q, float a, vec3 target, float r) {
  vec3 d = deep(r), foot = stemAt(FOOT), branch = stemAt(a);
  float l1 = distance(d, foot), l2 = (a - FOOT) * uStem.x, l3 = distance(branch, target) + 0.001;
  float x = q * (l1 + l2 + l3);
  if (x < l1) return mix(d, foot, x / l1);
  x -= l1;
  if (x < l2) {
    float around = r * 6.2832;   // the stream up the stem spreads a little around it
    return stemAt(FOOT + (a - FOOT) * x / l2) + vec3(cos(around), 0.0, sin(around)) * 0.012;
  }
  return mix(branch, target, (x - l2) / l3);
}

void main() {
  float part = aInfo.x, r = aInfo.z;
  vColor = uColor;
  vec3 pos = aTarget;
  float fade = 1.0, heat = 0.0, ink = 1.0;
  vec2 start = vec2(0.0);
  float screenMix = 1.0;     // below 1: still on its way in from a point on screen (start)
  bool clip = true;

  if (part > 5.5) {
    // A CV entry's square: falls from the entry's marker onto the soil at the flower's foot.
    float fall;
    if (story(aInfo.y, fall, start, heat, fade)) screenMix = fall;
    clip = false;
  } else if (part < 0.5) {
    // Soil: rises from below the screen while the ground forms (the first cycle), then stays.
    ink = aInfo.y;
    float flight = uFlight * 0.8;
    float t = uSoilTime - aTime.x * uCycleSeconds;   // seconds since it landed
    if (t < -flight) {
      fade = 0.0;
    } else if (t < 0.0) {
      float u = 1.0 + t / flight;
      screenMix = fallCurve(u, uGravity, uLanding);
      start = below(r);
      fade = smoothstep(0.0, 0.1, u);
    } else {
      heat = slotHeat(t) * 0.3;
    }
  } else {
    float c = uCycle;
    float ta = aTime.x * uCycleSeconds, tl = aTime.y * uCycleSeconds;
    bool petal = part > 4.5;
    float a = petal ? 1.0 : aInfo.y;
    if (c < ta - uFlight) {
      fade = 0.0;
    } else if (c < ta) {
      // On its way: rising from below the screen into the soil, then climbing to its place.
      float u = (c - ta + uFlight) / uFlight;
      float q = fallCurve(u, uGravity, uLanding);
      fade = smoothstep(0.0, 0.06, u);
      if (part < 1.5) {                 // roots come straight up from below
        screenMix = q;
        start = below(r);
      } else if (q < SCREEN_SHARE) {
        screenMix = q / SCREEN_SHARE;
        start = below(r);
        pos = deep(r);
      } else {
        pos = climb((q - SCREEN_SHARE) / (1.0 - SCREEN_SHARE), a, aTarget, r);
      }
    } else if (c < tl) {
      heat = slotHeat(c - ta) * 0.3;   // softer than the orb's: many squares land at once here
    } else if (petal) {
      // Petals let go and fall away on the wind, each as one piece, fading as they go.
      float v = (c - tl) / uFallSeconds;
      float pr = hash(aInfo.y * 91.3 + 7.0);
      pos = aTarget
          + vec3((pr - 0.5) * 0.6 * v + 0.2 * v + sin(v * 4.0 + pr * 6.2832) * 0.05,
                 -0.9 * v * v - 0.05 * v,
                 (fract(pr * 3.7) - 0.5) * 0.4 * v)
          + (vec3(r, fract(r * 5.3), fract(r * 9.1)) - 0.5) * 0.02 * v;
      fade = 1.0 - smoothstep(0.35, 1.0, v);
    } else {
      // Everything else returns into the ground the way it came, fading as it sinks.
      float v = min((c - tl) / uWitherSeconds, 1.0);
      pos = part < 1.5 ? aTarget - vec3(0.0, 0.15 * v * v, 0.0) : climb(1.0 - v * v, a, aTarget, r);
      fade = 1.0 - smoothstep(0.5, 1.0, v);
    }
    // Stem and head a little darker than petals and leaves; roots lighter, down in the soil.
    ink = part < 1.5 ? 0.85 : part < 2.5 ? 1.2 : part < 3.5 ? 1.05 : part < 4.5 ? 1.15 : 1.0;
  }

  vec3 p = view(sway(pos));
  float s;
  vec2 screen = project(p, s);
  float depth = clamp(0.55 + p.z * 0.9, 0.0, 1.0);
  if (screenMix < 1.0) {
    screen = mix(start, screen, screenMix);
    s = mix(1.0, s, screenMix);
    depth = mix(0.8, depth, screenMix);
  }
  emit(screen, s, depth, 0.0, heat, ink * fade, 0.0, 1.0, clip);
}`;

// ---------- shapes ----------

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a) => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const sum = (...terms) => terms.reduce(addv);

// One flower's shape, drawn fresh every cycle so each regrowth is a little different.
function newShape() {
  const side = Math.random() < 0.5 ? -1 : 1;
  return {
    height: 0.98 + Math.random() * 0.12,         // ground to head
    bend: side * (0.035 + Math.random() * 0.045),
    phase: Math.random() * 3,
    lean: -side * Math.random() * 0.05,
    petals: 9 + Math.floor(Math.random() * 5),
    petalLength: 0.28 + Math.random() * 0.06,
    leaves: [0.26 + Math.random() * 0.08, 0.46 + Math.random() * 0.1],
    side,
  };
}

// The stem's centreline, as in the shader.
function stemAt(shape, h) {
  return [shape.bend * (Math.sin(h * 2.4 + shape.phase) - Math.sin(shape.phase)) + shape.lean * h,
    GROUND + h * shape.height,
    0.5 * shape.bend * Math.sin(h * 1.8)];
}

// A square: [x, y, z (where it sits), arrive, leave (shares of the cycle), part, info, random].
function square(p, arrive, leave, part, info) {
  return [p[0], p[1], p[2], arrive, leave, part, info, Math.random()];
}

// The soil, made once: it stays put across cycles. A jittered grid of squares on its surface, so the
// ground reads as a field receding into the page, over looser soil that thins out with depth; all of
// it fading out toward the ends. It forms from the middle outward. The CV entries' squares land on
// its surface around the stem.
function makeSoil() {
  const w = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
  const surface = (x, z) => GROUND + 0.012 * Math.sin(x * 5 + w[0]) + 0.008 * Math.sin(x * 13 + w[1]) + 0.006 * Math.sin(z * 9 + w[2]);
  const squares = [];
  const add = (x, z, depth) => {
    const ink = (1 - smooth(0.62, 1.08, Math.abs(x))) * (1 - smooth(0.26, 0.42, Math.abs(z))) * Math.exp(-depth / 0.14);
    if (ink < 0.04) return;
    const order = 0.55 * Math.abs(x) / 1.08 + 0.45 * Math.random();
    squares.push(square([x, surface(x, z) - depth, z], lerp(...PHASE.ground, order), 9, SOIL, ink * 0.65));
  };
  for (let x = -1.08; x <= 1.08; x += 0.04) {
    for (let z = -0.42; z <= 0.42; z += 0.04) add(x + (Math.random() - 0.5) * 0.016, z + (Math.random() - 0.5) * 0.016, Math.random() * 0.01);
  }
  for (let i = 0; i < CONFIG.soilCount; i++) {
    add((Math.random() * 2 - 1) * 1.08, (Math.random() * 2 - 1) * 0.42, 0.012 + Math.min(0.3, -Math.log(1 - Math.random() * 0.97) * 0.07));
  }
  const story = [];
  for (let i = 0; i < STORY_TOTAL; i++) {
    const x = (Math.random() - 0.5) * 0.6, z = (Math.random() - 0.5) * 0.4;
    story.push(square([x, surface(x, z) + 0.004, z], 0, 9, STORY, i));
  }
  return { squares, story };
}

// The flower's squares for one shape, each with when it lands and when it lets go.
function makeFlower(shape) {
  const out = [];
  const stemArrive = (h) => lerp(...PHASE.stem, (h - FOOT) / (1 - FOOT));

  // Roots: a few thin strands wandering down and out from the stem's foot, now and then branching,
  // growing outward from the foot.
  const root = (p, dir, length, dist, depth) => {
    for (let d = 0; d < length; d += 0.014) {
      dir = norm([dir[0] + (Math.random() - 0.5) * 0.5, dir[1] - 0.08, dir[2] + (Math.random() - 0.5) * 0.3]);
      p = addv(p, scale(dir, 0.014));
      if (p[1] < GROUND - 0.3) break;
      out.push(square(p, lerp(...PHASE.roots, Math.min(1, (dist + d) / 0.3)), 0, ROOT, 0));
      if (depth < 1 && Math.random() < 0.07) {
        root(p, norm([dir[0] + (Math.random() < 0.5 ? -0.8 : 0.8), dir[1], dir[2]]), length * 0.4, dist + d, depth + 1);
      }
    }
  };
  const foot = stemAt(shape, FOOT);
  for (let m = 0; m < 5; m++) {
    root(foot, norm([(m / 4 - 0.5) * 1.8 + (Math.random() - 0.5) * 0.4, -1, (Math.random() - 0.5) * 0.8]),
      0.12 + Math.random() * 0.14, 0, 0);
  }

  // Stem: rings of squares around the centreline, tapering a little, built from the foot up.
  const rings = Math.ceil(((1 - FOOT) * shape.height) / 0.021);
  for (let i = 0; i <= rings; i++) {
    const h = FOOT + ((1 - FOOT) * i) / rings;
    const c = stemAt(shape, h);
    const radius = 0.017 * (1 - 0.3 * Math.max(h, 0));
    for (let j = 0; j < 4; j++) {
      const a = (j * TAU) / 4 + h * 9;
      out.push(square([c[0] + Math.cos(a) * radius, c[1], c[2] + Math.sin(a) * radius], stemArrive(h) + j * 0.0004, 0, STEM, h));
    }
  }

  // Leaves: one to each side, reaching out and up and drooping at the tip, unfolding from the stem
  // as it passes them.
  shape.leaves.forEach((h, j) => {
    const base = stemAt(shape, h);
    const outward = norm([j === 0 ? shape.side : -shape.side, 0.55, (Math.random() - 0.5) * 0.4]);
    const across = norm(addv(scale(norm(cross([0, 0, 1], outward)), 0.65), [0, 0, 0.35]));
    const length = 0.28 + Math.random() * 0.07, width = 0.062;
    const begin = stemArrive(h) + 0.01;
    for (let u = 0.03; u <= 1; u += 0.02 / length) {
      const w = width * Math.pow(Math.sin(Math.PI * u), 0.9) * (1 - 0.1 * u);
      const n = Math.max(1, Math.round((2 * w) / 0.02));
      for (let k = 0; k < n; k++) {
        const v = n === 1 ? 0 : -w + (2 * w * k) / (n - 1);
        const p = sum(base, scale(outward, u * length), [0, -0.2 * length * u * u, 0], scale(across, v));
        out.push(square(p, begin + (u * 0.9 + (Math.abs(v) / width) * 0.05) * PHASE.leaf, 0, LEAF, h));
      }
    }
  });

  // Head: a disc facing the viewer (tilted up a little, following the stem), its squares in a
  // sunflower spiral, domed, filling in from the middle outward.
  const top = stemAt(shape, 1);
  const tangent = norm(addv(top, scale(stemAt(shape, 0.97), -1)));
  const facing = norm(addv(scale(tangent, 0.35), [0, 0.35, 1]));
  const e1 = norm(cross([0, 1, 0], facing));
  const e2 = cross(facing, e1);
  const centre = addv(top, scale(facing, 0.02));
  for (let i = 0; i < HEAD_SQUARES; i++) {
    const rr = HEAD_RADIUS * Math.sqrt((i + 0.5) / HEAD_SQUARES), a = i * GOLDEN;
    const p = sum(centre, scale(e1, rr * Math.cos(a)), scale(e2, rr * Math.sin(a)), scale(facing, 0.035 * (1 - (rr / HEAD_RADIUS) ** 2)));
    out.push(square(p, lerp(...PHASE.head, rr / HEAD_RADIUS), 0, HEAD, 1));
  }

  // Petals: around the head, cupped slightly toward the viewer, each growing from base to tip on its
  // own schedule, and later letting go as one piece.
  for (let k = 0; k < shape.petals; k++) {
    const phi = (k * TAU) / shape.petals + (Math.random() - 0.5) * 0.2;
    const along = addv(scale(e1, Math.cos(phi)), scale(e2, Math.sin(phi)));
    const side = addv(scale(e1, -Math.sin(phi)), scale(e2, Math.cos(phi)));
    const length = shape.petalLength * (0.92 + Math.random() * 0.16), width = 0.075;
    const begin = PHASE.petals[0] + Math.random() * 0.05;
    const span = PHASE.petals[1] - PHASE.petals[0] - 0.06;
    const letGo = lerp(...PHASE.petalsFall, Math.random());
    for (let u = 0.03; u <= 1; u += 0.02 / length) {
      const w = width * Math.pow(Math.sin(Math.PI * Math.min(u * 1.06, 1)), 0.75) * (1 - 0.2 * u);
      const n = Math.max(1, Math.round((2 * w) / 0.02));
      for (let j = 0; j < n; j++) {
        const v = n === 1 ? 0 : -w + (2 * w * j) / (n - 1);
        const p = sum(centre, scale(along, HEAD_RADIUS * 0.85 + u * length), scale(side, v), scale(facing, 0.07 * u * u));
        out.push(square(p, begin + (u * 0.92 + (Math.abs(v) / width) * 0.05) * span, letGo + Math.random() * 0.004, PETAL, k));
      }
    }
  }

  // Everything but the petals returns into the ground in the reverse of the order it grew.
  const [grown0, grown1] = [PHASE.roots[0], PHASE.head[1]];
  for (const s of out) {
    if (s[5] !== PETAL) s[4] = lerp(...PHASE.wither, Math.min(1, Math.max(0, (grown1 - s[3]) / (grown1 - grown0))));
  }
  return out;
}

// ---------- the squares ----------

let shape = newShape();
let soil = null;

// Story squares first (always drawn), then the soil and the flower shuffled together so drawing only
// the first k squares on a slow device still shows all of it.
function build() {
  soil ??= makeSoil();
  const rest = soil.squares.concat(makeFlower(shape));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const all = soil.story.concat(rest);
  const data = new Float32Array(all.length * 8);
  all.forEach((s, k) => data.set(s, k * 8));
  return data;
}

// ---------- frame ----------

let time = 0;       // seconds of growing so far (paused with the page)
let cycle = 0;      // which cycle the squares were built for
let gust = 0;       // a press sends a gust of wind through the flower

function frame({ dt, set }) {
  if (!reducedMotion.matches) time += dt;
  const n = Math.floor(time / CONFIG.cycleSeconds);
  if (n !== cycle) {
    // A new cycle: the last flower has gone back into the ground, so grow a new one.
    cycle = n;
    shape = newShape();
    rebuild({ keepQuality: true });
  }
  // With reduced motion: the flower in full bloom, still.
  const into = reducedMotion.matches ? CONFIG.cycleSeconds * 0.76 : time - n * CONFIG.cycleSeconds;
  gust *= Math.exp(-dt * 1.2);

  set('uCycle', into);
  set('uCycleSeconds', CONFIG.cycleSeconds);
  set('uSoilTime', reducedMotion.matches ? 1e4 : time);
  set('uFlight', Math.max(0.2, CONFIG.flightSeconds));
  set('uGravity', CONFIG.gravity);
  set('uFallSeconds', Math.max(0.2, CONFIG.petalFallSeconds));
  set('uWitherSeconds', Math.max(0.2, CONFIG.witherSeconds));
  set('uStem', [shape.height, shape.bend, shape.phase, shape.lean]);
  set('uPitch', CONFIG.pitch);
  set('uSway', reducedMotion.matches ? 0 : CONFIG.sway);
  set('uSwaySpeed', CONFIG.swaySpeed);
  set('uGust', gust);
}

// Jumps to a point in the cycle (a share of it), for the tune panel.
function jumpTo(share) {
  time = Math.floor(time / CONFIG.cycleSeconds) * CONFIG.cycleSeconds + share * CONFIG.cycleSeconds;
}

// ---------- the graphic ----------

export default {
  name: 'flower',
  CONFIG,
  attributes: [['aTarget', 3], ['aTime', 2], ['aInfo', 3]],
  shader: SHADER,
  build,
  frame,
  press: () => { gust = 1; },
  jumpTo,
  halo: () => 0.35,
  pressDelay: 0.6,
  sliders: [
    { group: 'Growing' },
    { key: 'cycleSeconds', label: 'Cycle length (s)', min: 20, max: 180, step: 5 },
    { key: 'flightSeconds', label: 'Flight up (s)', min: 0.5, max: 8, step: 0.1 },
    { key: 'gravity', label: 'Gravity (slow rise, fast climb)', min: 0, max: 10, step: 0.1 },
    { key: 'petalFallSeconds', label: 'Petals falling (s)', min: 0.5, max: 8, step: 0.1 },
    { key: 'witherSeconds', label: 'Back into the ground (s)', min: 0.5, max: 8, step: 0.1 },
    { group: 'Wind and view' },
    { key: 'sway', label: 'Sway', min: 0, max: 0.15, step: 0.005 },
    { key: 'swaySpeed', label: 'Wind speed', min: 0.1, max: 3, step: 0.05 },
    { key: 'pitch', label: 'Looking down', min: 0, max: 0.8, step: 0.01 },
    { group: 'Soil' },
    { key: 'soilCount', label: 'Squares below the surface', min: 0, max: 4000, step: 100, apply: () => { soil = null; rebuild(); } },
  ],
  actions: {
    Restart: () => { time = 0; },
    'Skip to bloom': () => jumpTo(0.7),
    'Next flower': () => { time = (Math.floor(time / CONFIG.cycleSeconds) + 1) * CONFIG.cycleSeconds + 0.08 * CONFIG.cycleSeconds; },
  },
};
