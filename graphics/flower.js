// The flower: a strip of soil, and a flower that grows out of it square by square, as if it draws its
// nourishment from the ground. Every square comes in from the side of the screen, running along the
// edge and turning in at the ground, enters the soil at its end, travels through it to the stem's foot
// and climbs the stem to its place. Once per visit the soil forms, the roots spread, the stem pokes
// through the ground, leaves unfold, the head fills in as a sunflower spiral and petals grow. The
// flower then stays, mostly whole: now and then a petal (at most two) breaks apart and falls away on
// the wind, and a few seconds later new squares climb the stem to grow a new one. Drawn by voxel.js.

import { STORY_DOTS, STORY_TOTAL, evenOrder, rebuild, reducedMotion, storyLanded } from '../voxel.js';

// Everything here is read live every frame, so the ?tune panel (tune.js) can change it on the fly.
export const CONFIG = {
  growSeconds: 22.5,          // from the first soil to the first petals starting (the growth, once per visit)
  flightSeconds: 4,           // how long a square takes to come in to its place, on average
  gravity: 3,                 // 0 = constant speed; higher = slower start, faster climb at the end
  landing: 0.35,              // share of the flight spent braking into place (0 = arrive at full speed)
  petalGrowSeconds: 6.5,      // how long the first petals take to build, all together
  petalRegrowSeconds: 3.5,    // how long a single new petal takes to build
  breakPauseMin: 15,          // once the flower is whole, a petal breaks apart after a random pause between these
  breakPauseMax: 40,
  secondBreakChance: 0.2,     // chance that a second petal breaks just after the first (never more than two)
  regrowSecondsMin: 5,        // a new petal starts building a random time between these after one breaks
  regrowSecondsMax: 10,
  petalFallSeconds: 3.5,      // how long a falling petal takes to fade away
  sway: 0.035,                // how far the wind bends the flower, fraction of radius
  swaySpeed: 0.7,             // how fast the wind moves
  pitch: 0.28,                // radians the view looks down onto the ground
  soilCount: 1200,            // squares in the soil below its surface
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

// When each part of the flower lands during its growth, as shares of growSeconds (a square sets off
// a flight earlier). The first petals start building at the end of it.
const PHASE = {
  ground: [0.03, 0.13],
  roots: [0.13, 0.33],
  stem: [0.22, 0.53],         // from its foot in the soil up to the head
  leaf: 0.1,                  // each leaf, starting as the stem passes it
  head: [0.53, 0.66],
  petals: 0.66,
};
const NEVER = 1e9;            // a time that never comes: squares that never let go
const GROUND = -0.66;         // the soil's surface (stage units; the shader has the same)
const SOIL_DEPTH = 0.34;
const FOOT = -0.08;           // the stem starts this far below the ground, in stem heights
const HEAD_RADIUS = 0.09;
const HEAD_SQUARES = 110;

// Parts, as the shader knows them.
const SOIL = 0, ROOT = 1, STEM = 2, LEAF = 3, HEAD = 4, PETAL = 5, STORY = 6;

const SHADER = `
attribute vec3 aTarget;   // where the square sits once grown (stage units)
attribute vec2 aTime;     // when it lands and when it lets go, in flower seconds (flower.js rewrites
                          // the petals' as they break and regrow; the rest never let go)
attribute vec3 aInfo;     // x = part; y = stem height it branches off at (petals: its petal's random
                          // seed, soil: its ink, story: its index); z = random 0..1

uniform float uGrow, uFlight, uGravity, uFallSeconds;
uniform vec4 uStem;       // stem height, bend, bend phase, lean
uniform float uPitch, uSway, uSwaySpeed, uGust;

const float GROUND = ${GROUND.toFixed(3)};
const float FOOT = ${FOOT.toFixed(3)};
const float SCREEN_SHARE = 0.45;   // share of the way spent on screen, before entering the soil

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

// Which side of the screen a square comes in from: either, with the flower in the middle; the
// nearer side with the flower off to one side (beside the CV), so squares never cross the text.
float sideOf(float r) {
  float leftShare = 1.0 - smoothstep(0.38, 0.62, uCenter.x / uResolution.x);
  return fract(r * 13.7) < leftShare ? -1.0 : 1.0;
}

// Where a square enters the soil: at the soil's end on its side, somewhere in its depth.
vec3 entry(float r) {
  return vec3(sideOf(r) * (0.78 + 0.25 * fract(r * 17.3)), GROUND - 0.03 - 0.22 * fract(r * 4.9),
              (fract(r * 8.3) - 0.5) * 0.5);
}

// A square's way in on screen (device px) at progress p, ending where it enters the soil (at). It
// sets off just off its side edge, anywhere from a little above the ground to below the bottom of the
// screen, runs along the edge and turns in at the ground's height, so it never crosses the text in
// the middle of the screen.
vec2 wayIn(float p, float r, vec2 at) {
  float side = sideOf(r);
  float margin = uDotSize * uRadius * 2.0;
  float edge = side < 0.0 ? -margin : uResolution.x + margin;
  vec2 from = vec2(edge, mix(at.y - uRadius * 0.9, uResolution.y + uRadius * 0.3, fract(r * 23.1)));
  vec2 turn = vec2(mix(edge, at.x, 0.25 * fract(r * 31.7)), at.y + (fract(r * 41.3) - 0.5) * uRadius * 0.08);
  float q = 1.0 - p;
  return q * q * from + 2.0 * q * p * turn + p * p * at;
}

// Deep in the soil under the flower, where a square's climb begins.
vec3 deep(float r) {
  return vec3(stemAt(0.0).x + (r - 0.5) * 0.5, GROUND - 0.22, (fract(r * 7.13) - 0.5) * 0.3);
}

// The rest of a square's way at progress q (0 = entering the soil at e, 1 = in place): through the
// soil and under the flower to the stem's foot, up the stem to height a where its part branches off,
// then out to its place.
vec3 climb(float q, float a, vec3 e, vec3 target, float r) {
  vec3 d = deep(r), foot = stemAt(FOOT), branch = stemAt(a);
  float l0 = distance(e, d), l1 = distance(d, foot), l2 = (a - FOOT) * uStem.x, l3 = distance(branch, target) + 0.001;
  float x = q * (l0 + l1 + l2 + l3);
  if (x < l0) return mix(e, d, x / l0);
  x -= l0;
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
  float screenMix = 1.0;     // below 1: on screen, between start and its place
  bool clip = true;

  if (part > 5.5) {
    // A CV entry's square: falls from the entry's marker onto the soil at the flower's foot.
    float fall;
    if (story(aInfo.y, fall, start, heat, fade)) screenMix = fall;
    clip = false;
  } else {
    float ta = aTime.x, tl = aTime.y;   // when it lands and when it lets go
    float attach = part > 4.5 ? 1.0 : aInfo.y;   // petals branch off at the head
    float flight = uFlight * (0.75 + 0.5 * fract(r * 2.3));
    float t = uGrow;
    if (t < ta - flight) {
      fade = 0.0;
    } else if (t < ta) {
      // On its way in: along the side of the screen, into the soil at its end, through it and up.
      float u = (t - ta + flight) / flight;
      float q = fallCurve(u, uGravity, uLanding);
      fade = smoothstep(0.0, 0.06, u);
      vec3 e = entry(r);
      if (q < SCREEN_SHARE) {
        float es;
        start = wayIn(q / SCREEN_SHARE, r, project(view(e), es));
        screenMix = 0.0;
        pos = e;
      } else {
        float k = (q - SCREEN_SHARE) / (1.0 - SCREEN_SHARE);
        pos = part < 1.5 ? mix(e, aTarget, k) : climb(k, attach, e, aTarget, r);
        if (pos.y < GROUND - 0.01) ink = 0.7;   // fainter while it's inside the ground
      }
    } else if (t < tl) {
      heat = slotHeat(t - ta) * 0.3;   // softer than the orb's: many squares land at once here
    } else {
      // A petal breaks apart and falls away on the wind as one piece, fading as it goes (only petals
      // ever let go).
      float v = (t - tl) / uFallSeconds;
      float pr = aInfo.y;
      pos = aTarget
          + vec3((pr - 0.5) * 0.6 * v + 0.2 * v + sin(v * 4.0 + pr * 6.2832) * 0.05,
                 -0.9 * v * v - 0.05 * v,
                 (fract(pr * 3.7) - 0.5) * 0.4 * v)
          + (vec3(r, fract(r * 5.3), fract(r * 9.1)) - 0.5) * 0.02 * v;
      fade = 1.0 - smoothstep(0.35, 1.0, v);
    }
    // The soil fades toward its edges; stem and head a little darker than petals and leaves.
    ink *= part < 0.5 ? aInfo.y : part < 1.5 ? 0.95 : part < 2.5 ? 1.2 : part < 3.5 ? 1.05 : part < 4.5 ? 1.15 : 1.0;
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
const rand = (a, b) => a + Math.random() * (b - a);

// This visit's flower.
function newShape() {
  const side = Math.random() < 0.5 ? -1 : 1;
  return {
    height: 0.98 + Math.random() * 0.12,         // ground to head
    bend: side * (0.035 + Math.random() * 0.045),
    phase: Math.random() * 3,
    lean: -side * Math.random() * 0.05,
    leaves: [0.26 + Math.random() * 0.08, 0.46 + Math.random() * 0.1],
    petals: 9 + Math.floor(Math.random() * 5),
    petalLength: 0.28 + Math.random() * 0.06,
    side,
  };
}

// The stem's centreline, as in the shader.
function stemAt(shape, h) {
  return [shape.bend * (Math.sin(h * 2.4 + shape.phase) - Math.sin(shape.phase)) + shape.lean * h,
    GROUND + h * shape.height,
    0.5 * shape.bend * Math.sin(h * 1.8)];
}

// A square: [x, y, z (where it sits), land, let go (see aTime), part, info, random].
function square(p, land, letGo, part, info) {
  return [p[0], p[1], p[2], land, letGo, part, info, Math.random()];
}

// The soil: a jittered grid of squares on its surface, so the ground reads as a field receding into
// the page, over looser soil that thins out with depth, all of it fading out toward the ends. It forms
// from the middle outward. The CV entries' squares land on its surface around the stem.
function makeSoil() {
  const w = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
  const surface = (x, z) => GROUND + 0.012 * Math.sin(x * 5 + w[0]) + 0.008 * Math.sin(x * 13 + w[1]) + 0.006 * Math.sin(z * 9 + w[2]);
  const squares = [];
  const add = (x, z, depth) => {
    const ink = (1 - smooth(0.62, 1.08, Math.abs(x))) * (1 - smooth(0.26, 0.42, Math.abs(z))) * Math.exp(-depth / 0.16);
    if (ink < 0.04) return;
    const order = 0.55 * Math.abs(x) / 1.08 + 0.45 * Math.random();
    squares.push(square([x, surface(x, z) - depth, z], lerp(...PHASE.ground, order), 0, SOIL, ink * 0.65));
  };
  for (let x = -1.08; x <= 1.08; x += 0.04) {
    for (let z = -0.42; z <= 0.42; z += 0.04) add(x + (Math.random() - 0.5) * 0.016, z + (Math.random() - 0.5) * 0.016, Math.random() * 0.01);
  }
  for (let i = 0; i < CONFIG.soilCount; i++) {
    add((Math.random() * 2 - 1) * 1.08, (Math.random() * 2 - 1) * 0.42, 0.012 + Math.min(SOIL_DEPTH, -Math.log(1 - Math.random() * 0.97) * 0.08));
  }
  const story = [];
  for (let i = 0; i < STORY_TOTAL; i++) {
    const x = (Math.random() - 0.5) * 0.6, z = (Math.random() - 0.5) * 0.4;
    story.push(square([x, surface(x, z) + 0.004, z], 0, 0, STORY, i));
  }
  return { squares, story };
}

// The flower's squares, each with when it lands.
function makeFlower(shape) {
  const out = [];
  const stemArrive = (h) => lerp(...PHASE.stem, (h - FOOT) / (1 - FOOT));

  // Roots: a deep tap root, and pairs running down and out through the soil, one to each side, from
  // steep to shallow, so the whole reads balanced. Each keeps to its direction with a little wander,
  // is thicker near the foot, now and then branches, and stays inside the soil. They grow outward
  // from the foot.
  const foot = stemAt(shape, FOOT);
  const reach = 0.6;
  const root = (p, aim, length, dist, depth) => {
    let dir = aim;
    for (let d = 0; d < length; d += 0.012) {
      dir = norm([
        dir[0] + (Math.random() - 0.5) * 0.3 + (aim[0] - dir[0]) * 0.15,
        dir[1] - 0.01 + (aim[1] - dir[1]) * 0.15,
        dir[2] + (Math.random() - 0.5) * 0.2 + (aim[2] - dir[2]) * 0.15,
      ]);
      const next = addv(p, scale(dir, 0.012));
      if (next[1] < GROUND - SOIL_DEPTH + 0.03 || Math.abs(next[0] - foot[0]) > 0.6 || Math.abs(next[2]) > 0.3) break;
      p = next;
      const land = lerp(...PHASE.roots, Math.min(1, (dist + d) / reach));
      out.push(square(p, land, 0, ROOT, 0));
      if (depth === 0 && d < 0.1) out.push(square(addv(p, [0.008, 0, 0.004]), land, 0, ROOT, 0));   // thicker near the foot
      if (depth === 0 && d > 0.05 && Math.random() < 0.06) {
        const turn = Math.random() < 0.5 ? -1 : 1;
        root(p, norm([aim[0] + turn * 0.7, aim[1] * 0.7, aim[2] + (Math.random() - 0.5) * 0.4]), length * 0.35, dist + d, 1);
      }
    }
  };
  root(foot, [0, -1, 0], 0.24 + Math.random() * 0.06, 0, 0);
  for (const s of [0.35, 0.8, 1.4]) {
    const length = 0.26 + s * 0.05 + Math.random() * 0.06;
    const z = (Math.random() - 0.5) * 0.5;
    for (const side of [-1, 1]) root(foot, norm([side * s, -1 + s * 0.35, z * side]), length * (0.92 + Math.random() * 0.16), 0, 0);
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

  // Petals: around the head, cupped slightly toward the viewer. Each builds from base to tip over its
  // own build time (shares of it), and later breaks apart as one piece.
  for (let k = 0; k < shape.petals; k++) {
    const phi = (k * TAU) / shape.petals + (Math.random() - 0.5) * 0.2;
    const along = addv(scale(e1, Math.cos(phi)), scale(e2, Math.sin(phi)));
    const side = addv(scale(e1, -Math.sin(phi)), scale(e2, Math.cos(phi)));
    const length = shape.petalLength * (0.92 + Math.random() * 0.16), width = 0.075;
    for (let u = 0.03; u <= 1; u += 0.02 / length) {
      const w = width * Math.pow(Math.sin(Math.PI * Math.min(u * 1.06, 1)), 0.75) * (1 - 0.2 * u);
      const n = Math.max(1, Math.round((2 * w) / 0.02));
      for (let j = 0; j < n; j++) {
        const v = n === 1 ? 0 : -w + (2 * w * j) / (n - 1);
        const p = sum(centre, scale(along, HEAD_RADIUS * 0.85 + u * length), scale(side, v), scale(facing, 0.07 * u * u));
        out.push(square(p, u * 0.9 + (Math.abs(v) / width) * 0.08, Math.random() * 0.15, PETAL, k));
      }
    }
  }
  return out;
}

// ---------- the squares ----------

const shape = newShape();
let squares = null;   // made once per visit

// Story squares first (always drawn), then the soil and the flower, ordered evenly by where they sit,
// so drawing only the first k squares on a slow device thins all of it evenly. Each square carries its
// own times in flower seconds: when it lands and when it lets go (never, but for petals), from the
// growth and each petal's schedule as they are now; frame() rebuilds when a petal breaks or regrows.
function build() {
  if (!squares) {
    const soil = makeSoil();
    squares = soil.story.concat(evenOrder(soil.squares.concat(makeFlower(shape)), (s) => s));
  }
  const data = new Float32Array(squares.length * 8);
  squares.forEach(([x, y, z, land, letGo, part, info, r], k) => {
    let times = [land * CONFIG.growSeconds, NEVER];
    if (part === PETAL) {
      const p = petals[info];
      times = [p.start + land * p.build, p.fall === NEVER ? NEVER : p.fall + letGo];
      info = p.seed;
    }
    data.set([x, y, z, ...times, part, info, r], k * 8);
  });
  petalsChanged = false;
  return data;
}

// ---------- petals: mostly whole, one (at most two) breaking now and then ----------

let time = 0;       // seconds since the flower began (paused with the page)
let gust = 0;       // a press sends a gust of wind through the flower

// Per petal, in flower time: when its squares start landing and how long it takes to build, when it
// breaks apart (NEVER until it's picked) and when its replacement sets off.
const petals = [];
let petalsChanged = false;   // a petal's schedule changed since the squares were built
let nextBreak = NEVER;       // when the next petal breaks: set once the flower is whole
let secondBreak = NEVER;     // now and then a second petal follows the first

const whole = (p) => time >= p.start + p.build && time < p.fall;

function grow(p, start, build) {
  Object.assign(p, { start, build, fall: NEVER, next: NEVER, seed: Math.random() });
  petalsChanged = true;
}

// The first petals grow together at the end of the growth.
function firstPetals() {
  petals.length = 0;
  const start = PHASE.petals * CONFIG.growSeconds;
  for (let k = 0; k < shape.petals; k++) {
    const p = {};
    grow(p, start + Math.random() * 0.2 * CONFIG.petalGrowSeconds, CONFIG.petalGrowSeconds);
    petals.push(p);
  }
  nextBreak = secondBreak = NEVER;
}
firstPetals();

// Breaks a whole petal, unless two are already missing. Its replacement sets off 5-10 s later, once
// the broken one's squares have faded away.
function breakPetal() {
  const intact = petals.filter(whole);
  if (!intact.length || petals.length - intact.length >= 2) return;
  const p = intact[Math.floor(Math.random() * intact.length)];
  p.fall = time;
  const gone = time + 0.15 + CONFIG.petalFallSeconds + 0.2;
  p.next = Math.max(gone, time + rand(CONFIG.regrowSecondsMin, CONFIG.regrowSecondsMax));
  petalsChanged = true;
}

// Puts the flower in full bloom with every petal whole, as it is when it's morphed into.
function settle() {
  time = Math.max(time, ...petals.map((p) => p.start + p.build)) + 0.5;
  for (const p of petals) if (!whole(p)) grow(p, time - p.build - 0.5, p.build);
  nextBreak = secondBreak = NEVER;
}

// ---------- frame ----------

function frame({ dt, set }) {
  const still = reducedMotion.matches;   // with reduced motion: the flower in full bloom, still
  if (!still) time += dt;
  for (const p of petals) {
    // A new petal: new squares set off now (the slowest flights take 1.25 of the average) and climb the stem.
    if (time >= p.next) grow(p, time + 1.25 * CONFIG.flightSeconds, CONFIG.petalRegrowSeconds);
  }
  // Once the flower is whole, a petal breaks after a pause, and now and then a second follows it.
  if (nextBreak === NEVER && petals.every(whole)) nextBreak = time + rand(CONFIG.breakPauseMin, CONFIG.breakPauseMax);
  if (time >= nextBreak) {
    breakPetal();
    nextBreak = NEVER;
    if (Math.random() < CONFIG.secondBreakChance) secondBreak = time + rand(0.6, 1.8);
  }
  if (time >= secondBreak) {
    breakPetal();
    secondBreak = NEVER;
  }
  if (petalsChanged) rebuild({ keepQuality: true });
  gust *= Math.exp(-dt * 1.2);

  const firstBloom = PHASE.petals * CONFIG.growSeconds + 1.2 * CONFIG.petalGrowSeconds + CONFIG.flightSeconds;
  set('uGrow', still ? firstBloom : time);
  set('uFlight', Math.max(0.2, CONFIG.flightSeconds));
  set('uGravity', CONFIG.gravity);
  set('uFallSeconds', Math.max(0.2, CONFIG.petalFallSeconds));
  set('uStem', [shape.height, shape.bend, shape.phase, shape.lean]);
  set('uPitch', CONFIG.pitch);
  set('uSway', still ? 0 : CONFIG.sway);
  set('uSwaySpeed', CONFIG.swaySpeed);
  set('uGust', gust);
}

// ---------- pose, for morphing ----------

const PART_INK = [0, 0.95, 1.2, 1.05, 1.15, 1, 1];   // by part, as in the shader (soil has its own)

// Where the visible squares are at engine time t (see POSE in voxel.js): in place, as the shader
// views them, with the wind as it will be then.
function pose(t) {
  const out = [];
  const c = Math.cos(CONFIG.pitch), s = Math.sin(CONFIG.pitch);
  const tt = t * CONFIG.swaySpeed;
  const sway = CONFIG.sway * (1 + 3 * gust);
  const dx = (Math.sin(tt) + 0.4 * Math.sin(tt * 2.3 + 1.3)) * sway, dz = 0.6 * Math.sin(tt * 0.7 + 2) * sway;
  for (const [x0, y0, z0, land, letGo, part, info] of squares) {
    const visible = part === STORY ? storyLanded(Math.floor(info / STORY_DOTS))
      : part === PETAL ? time >= petals[info].start + land * petals[info].build && time < petals[info].fall + letGo
      : time >= land * CONFIG.growSeconds;
    if (!visible) continue;
    const h = Math.max(y0 - GROUND, 0) / shape.height;
    const x = x0 + dx * h * h, z = z0 + dz * h * h, y = y0 - GROUND;
    const vz = y * s + z * c;
    out.push(x, GROUND + y * c - z * s, vz, Math.min(1, Math.max(0, 0.55 + vz * 0.9)), part === SOIL ? info : PART_INK[part], 1, 0);
  }
  return new Float32Array(out);
}

// ---------- the graphic ----------

export default {
  name: 'flower',
  CONFIG,
  attributes: [['aTarget', 3], ['aTime', 2], ['aInfo', 3]],
  shader: SHADER,
  build,
  frame,
  pose,
  settle,
  press: () => { gust = 1; },
  halo: () => 0.35,
  pressDelay: 0.6,
  sliders: [
    { group: 'Growing' },
    { key: 'growSeconds', label: 'Growth, soil to first petals (s)', min: 10, max: 120, step: 1, apply: () => rebuild() },
    { key: 'flightSeconds', label: 'Flight in (s)', min: 0.5, max: 10, step: 0.1 },
    { key: 'gravity', label: 'Gravity (slow start, fast climb)', min: 0, max: 10, step: 0.1 },
    { group: 'Petals' },
    { key: 'petalGrowSeconds', label: 'First petals build (s)', min: 2, max: 40, step: 1 },
    { key: 'petalRegrowSeconds', label: 'A new petal builds (s)', min: 1, max: 30, step: 0.5 },
    { key: 'breakPauseMin', label: 'Whole for at least (s)', min: 1, max: 120, step: 1 },
    { key: 'breakPauseMax', label: 'Whole for at most (s)', min: 1, max: 180, step: 1 },
    { key: 'secondBreakChance', label: 'Chance a second petal breaks', min: 0, max: 1, step: 0.05 },
    { key: 'regrowSecondsMin', label: 'Regrows after at least (s)', min: 1, max: 30, step: 0.5 },
    { key: 'regrowSecondsMax', label: 'Regrows after at most (s)', min: 1, max: 30, step: 0.5 },
    { key: 'petalFallSeconds', label: 'Petal falling (s)', min: 0.5, max: 8, step: 0.1 },
    { group: 'Wind and view' },
    { key: 'sway', label: 'Sway', min: 0, max: 0.15, step: 0.005 },
    { key: 'swaySpeed', label: 'Wind speed', min: 0.1, max: 3, step: 0.05 },
    { key: 'pitch', label: 'Looking down', min: 0, max: 0.8, step: 0.01 },
    { group: 'Soil' },
    { key: 'soilCount', label: 'Squares below the surface', min: 0, max: 4000, step: 100, apply: () => { squares = null; rebuild(); } },
  ],
  actions: {
    'Grow again': () => { time = 0; firstPetals(); },
    'Break a petal': breakPetal,
    'Full bloom': settle,
  },
};
