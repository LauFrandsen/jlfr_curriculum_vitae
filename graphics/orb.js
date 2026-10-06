// The orb: a still, breathing shell of ink squares inside a drifting cloud, with squares flowing in
// from beyond the screen edges, settling into the orb and drifting back out. Each square that slots
// in sends a faint ripple over the squares around it. Pressing the orb draws the falling squares in
// and pauses new ones. Optional simulated "speech". Drawn by voxel.js.
//
// As the page opens it plays an intro once: its squares start packed into a small core, unseen, blip
// in one by one, and the core then opens out into the orb, after which everything else starts.
//
// Its look can lean toward a network: squares arriving along traces or brought in by orbits, orbit
// rings with satellites, antennas sending signals, a latitude/longitude grid that turns, and data arcs
// drawing across the surface. LOOKS below has presets; the ?tune panel switches between them.

import { STORY_DOTS, STORY_TOTAL, evenOrder, exact, panOf, rebuild, reducedMotion, snoise, stage, storyLanded } from '../voxel.js';
import { play } from '../sound.js';

// Everything here is read live every frame, so the ?tune panel (tune.js) can change it on the fly.
export const CONFIG = {
  dotCount: 6000,             // dots in the shell
  minDotCount: 1500,
  color: [0.067, 0.063, 0.059],   // ink of the squares (#11100f, a warm black)
  burnColor: [0.13, 0.085, 0.05], // ink of the scorch around them: near-black with a trace of umber
  introCore: 0.3,             // the intro: the orb's squares start packed into a core this size, fraction of radius
  introBlipSeconds: 1.5,      // the intro: they blip in, one by one, over this long
  introExpandSeconds: 1.1,    // the intro: then the core opens out into the orb over this long
  breathSeconds: 14,          // one full in-and-out breath
  breathDepth: 0.025,         // how much the orb grows at the top of a breath, fraction of radius
  tilt: 0.22,                 // radians around the X axis: the viewing angle
  cameraDistance: 6.4,        // in orb radii; lower = stronger perspective
  dotSize: 0.042,             // sprite size (square + burn) as a fraction of the orb radius
  squareSize: 0.18,           // the solid square, as a share of the sprite
  burn: 0.55,                 // strength of the scorch around each square
  brightness: 1,              // overall ink strength
  arrival: 2,                 // how flowing dots arrive: 0 = swimming in from every side, 1 = along
                              //   traces from the sides, 2 = brought in by the orbits
  flowCount: 100,             // dots that come in from outside into their own slot in the orb
  flowSeconds: 60,            // average length of one cycle: come in, rest, drift out and fade
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
  orbits: 3,                  // orbit rings around the orb, each with a satellite (0-3)
  orbitSpeed: 1,              // how fast things travel along the orbits
  landPauseMin: 25,           // with every orbit up, a satellite comes down after a random pause between these (s)
  landPauseMax: 60,
  relaunchMin: 5,             // a new rocket lifts off a random time between these after the touchdown (s)
  relaunchMax: 10,
  antennas: 0,                // masts standing out from the surface, with signals running up them (0-12)
  antennaLength: 0.32,        // how far the longest mast reaches, fraction of radius
  gridLines: 0,               // shell dots on a latitude/longitude grid of this many parallels (0 = evenly spread)
  gridFill: 0.15,             // with a grid: dots spread evenly between the lines, as a share of dotCount
  spin: 0,                    // how fast the orb turns, radians per second
  arcs: 0,                    // data arcs drawing across the surface at once (0-6)
  arcLift: 0.16,              // how high the arcs lift off the surface, per radian they span
  arcSeconds: 2.2,            // how long an arc takes to draw, and later to wipe
  speech: 0,                  // 0 = no simulated speech, 1 = full; scales everything below it
  voiceAmplitude: 0.035,      // core shell swell while "speaking", fraction of radius
  voiceSpeed: 1,              // how fast the lumps travel over the surface
  syllableMs: 220,            // average time between loudness changes while speaking
  burstSeconds: 4.5,          // average length of a speaking burst
  pauseSeconds: 3.2,          // average silence between bursts
  responsiveness: 8,          // how quickly the swell rises to each syllable (it fades at half this rate)
  looseFraction: 0.06,        // extra loose dots outside the shell, as a share of dotCount
  looseSpread: 0.2,           // how far out the outermost loose dots sit, fraction of radius
  looseDrift: 0.165,          // how much each loose dot wanders on its own
  looseVoice: 0.49,           // how far speech pushes the loose dots outward
  pullRadius: 0.2,            // pointer influence radius, fraction of orb radius
  pullStrength: 0.22,         // how far toward the pointer a dot travels at full influence
  pullGlow: 0.02,             // how much pulled dots darken and burn wider (0 = none)
};

// Presets for the orb's look, applied over CONFIG. Orbits is the default; Today is the look it had first.
const LOOKS = {
  Today: { arrival: 0, flowCount: 100, orbits: 0, antennas: 0, gridLines: 0, spin: 0, arcs: 0, looseFraction: 0.3, looseSpread: 0.36, tilt: 0 },
  Circuit: { arrival: 1, flowCount: 100, orbits: 0, antennas: 0, gridLines: 0, spin: 0, arcs: 0, looseFraction: 0.06, looseSpread: 0.2, tilt: 0 },
  Orbits: { arrival: 2, flowCount: 100, orbits: 3, antennas: 0, gridLines: 0, spin: 0, arcs: 0, looseFraction: 0.06, looseSpread: 0.2, tilt: 0.22 },
  Globe: { arrival: 1, flowCount: 0, orbits: 0, antennas: 0, gridLines: 9, spin: 0.07, arcs: 5, looseFraction: 0.04, looseSpread: 0.15, tilt: 0.35 },
  Antennas: { arrival: 1, flowCount: 100, orbits: 0, antennas: 9, gridLines: 0, spin: 0.05, arcs: 0, looseFraction: 0.06, looseSpread: 0.2, tilt: 0.22 },
};

// Ripples: the most recent slot-ins, each spreading out from where its square landed.
const RIPPLES = 16;
// Data arcs, drawn across the surface at most this many at a time, and how long one holds.
const ARCS = 6;
const ARC_SQUARES = 48;
const ARC_HOLD = 1.2;

// ---------- orbits ----------

const TAU = Math.PI * 2;
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Three rings around the orb, fairly flat so they reach out sideways (where there's room) more than up
// and down, each tilted a little differently, further out and slower each: the plane's normal, the
// radius (orb radii) and the speed along it (radians per second; the sign is its direction).
const ORBITS = [
  { normal: [0.06, 1, 0.12], radius: 1.32, speed: 0.22 },
  { normal: [-0.42, 1, 0.12], radius: 1.52, speed: -0.15 },
  { normal: [0.3, 1, -0.5], radius: 1.72, speed: 0.11 },
].map((o) => {
  const n = norm3(o.normal);
  const u = norm3(cross3(n, [0, 0, 1]));
  return { ...o, n, u, v: cross3(n, u), sign: Math.sign(o.speed) };
});
const g3 = (v) => `vec3(${v.map((x) => x.toFixed(5)).join(', ')})`;
const SATELLITE_STEP = 0.017;   // spacing of a satellite's squares (orb radii)
const WIDEST = ORBITS[ORBITS.length - 1].radius;

// The launch, in orbit time (seconds, scaled by orbitSpeed): as the page opens, rocket k lifts off at
// first + k * stagger and climbs for `ascent`. Reaching its orbit it unfolds into a satellite over
// `deploy` and races round a first lap (`boost` radians on top of its cruising speed, easing off over
// `ease`), dropping the orbit's dotted line behind it. `done` is when every orbit has been laid; `laid`
// is how long after lift-off an orbit counts as up. Now and then a satellite comes down again (see
// landings below): it folds up, leaves its orbit and takes `descent` to touch down on its pad, its
// orbit dissolving behind it; a while later a new rocket lifts off from the same pad.
const LAUNCH = { first: 0.8, stagger: 2.4, ascent: 2.8, deploy: 0.7, boost: TAU * 0.94, ease: 1.8, exhaust: 14, descent: 3.2 };
LAUNCH.done = LAUNCH.first + 2 * LAUNCH.stagger + LAUNCH.ascent + 14;
LAUNCH.laid = LAUNCH.ascent + 14;
const NEVER = 1e9;
const launches = [0, 1, 2].map((k) => LAUNCH.first + k * LAUNCH.stagger);   // when orbit k's rocket lifted off
const lands = [NEVER, NEVER, NEVER];                                         // when its satellite began to come down
const relaunches = [NEVER, NEVER, NEVER];                                    // when its next rocket lifts off
const crashes = [0, 0, 0];                                                   // 1 while it's down from being shot
const CRASH_HIT = 1.9;   // seconds (orbit time) for a shot-down satellite's middle to hit the orb
const launchTime = (k) => launches[k];

// The intro, in seconds from when the orb is first shown: after `delay` its squares blip in over
// introBlipSeconds, each at its own moment and more and more of them toward the end; after `hold` the
// core opens out over introExpandSeconds, each square up to `spread` late, overshooting a little
// (`overshoot`) and settling into the orb. The orbits, breathing and flow wait until it's over.
const INTRO = { delay: 0.3, hold: 0.2, spread: 0.15, overshoot: 1.2 };
const introEnd = () => INTRO.delay + CONFIG.introBlipSeconds + INTRO.hold + CONFIG.introExpandSeconds + INTRO.spread;
// The core's size at intro time x (the shader's, without each square's own lag).
function introScale(x) {
  const e = Math.min(1, Math.max(0, (x - INTRO.delay - CONFIG.introBlipSeconds - INTRO.hold) / CONFIG.introExpandSeconds));
  const c = INTRO.overshoot, back = 1 + (c + 1) * (e - 1) ** 3 + c * (e - 1) ** 2;
  return CONFIG.introCore + (1 - CONFIG.introCore) * back;
}
// How far (radians) satellite k has gone round its orbit s seconds after reaching it.
const lapped = (k, s) => Math.abs(ORBITS[k].speed) * s + LAUNCH.boost * (1 - Math.exp(-s / LAUNCH.ease));

// Where each rocket reaches its orbit: at the ring's outer edge, a quarter turn before its front-most
// point (as seen from the viewing angle), so its first lap sweeps across the front of the orb. It lifts
// off from the top of the orb, leaning toward that side, so it climbs against the paper.
const ringDir = (o, a) => [0, 1, 2].map((i) => Math.cos(a) * o.u[i] + Math.sin(a) * o.v[i]);
for (const o of ORBITS) {
  let best = 0, front = -Infinity;
  for (let j = 0; j < 360; j++) {
    const a = (j / 360) * TAU, d = ringDir(o, a);
    const z = d[1] * Math.sin(CONFIG.tilt) + d[2] * Math.cos(CONFIG.tilt);
    if (z > front) { front = z; best = a; }
  }
  o.launch = best - o.sign * (Math.PI / 2);
  const edge = ringDir(o, o.launch);
  o.site = norm3([edge[0] * 0.5, 1, edge[2] * 0.5 + 0.2]);
}

// How far out the orbits reach, from 1 (as set) down to tucked in close. They're drawn in toward the
// orb so the widest stays on the screen (as when the orb is wide on a phone) and, in the hero, so the
// lowest stays clear of the text under the orb; once scrolled past the hero they open back out.
let orbitFit = 1;
const fitted = (k) => 1 + (ORBITS[k].radius - 1) * orbitFit;

// How far below the orb's centre the orbits reach on screen, in orb radii, at fit f.
function lowestAt(f) {
  const ct = Math.cos(CONFIG.tilt), st = Math.sin(CONFIG.tilt), cam = CONFIG.cameraDistance;
  let low = 0;
  for (let k = 0; k < Math.min(3, CONFIG.orbits); k++) {
    const r = 1 + (ORBITS[k].radius - 1) * f;
    for (let j = 0; j < 48; j++) {
      const [x, y, z] = ringDir(ORBITS[k], (j / 48) * TAU).map((c) => c * r);
      const py = y * ct - z * st, pz = y * st + z * ct;
      low = Math.max(low, (-py * cam) / (cam - pz));
    }
  }
  return low;
}

function fitOrbits() {
  const { x, radius, width, recede, clearBelow } = stage();
  const room = Math.min(x, width - x) / Math.max(radius, 1);
  let fit = Math.min(1, Math.max(0.2, (room * 0.96 - 1) / (WIDEST - 1)));
  const below = (clearBelow / Math.max(radius, 1)) * 0.94;
  if (recede < 1 && lowestAt(fit) > below) {
    let f = fit;
    while (f > 0.2 && lowestAt(f) > below) f -= 0.02;
    fit += (Math.max(0.2, f) - fit) * (1 - recede);
  }
  orbitFit = fit;
}

// Rocket k's climb at progress q (0 = lift-off, 1 = reaching its orbit), as the shader has it: from the
// launch site straight up off the surface, bending over to meet the orbit along its direction of travel.
function climbAt(k, q) {
  const o = ORBITS[k], r = fitted(k);
  const at = orbitAt(k, o.launch, 0);
  const ahead = orbitAt(k, o.launch + 0.01 * o.sign, 0);
  const tangent = norm3([0, 1, 2].map((i) => ahead[i] - at[i]));
  const p = [o.site, o.site.map((c) => c * 1.45), at.map((c, i) => c - tangent[i] * 0.55 * r), at];
  const s = 1 - q;
  return [0, 1, 2].map((i) => s * s * s * p[0][i] + 3 * s * s * q * p[1][i] + 3 * s * q * q * p[2][i] + q * q * q * p[3][i]);
}

// Orbit k's ring at angle a, dr further out than its (fitted) radius, as the shader has it.
function orbitAt(k, a, dr) {
  const o = ORBITS[k], r = fitted(k) + dr;
  return [0, 1, 2].map((i) => (Math.cos(a) * o.u[i] + Math.sin(a) * o.v[i]) * r);
}

// The orb's turn by angle a (the shader has the same).
function spun(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

const SHADER = `
attribute vec3 aPos;      // per kind (the whole part of aSeed): a unit vector on the sphere (0-3);
                          // which orbit (4: x; 5: x, and the square's place in its satellite: y along
                          // the orbit, z outward; 8: x, and y = its place in the trail); a point on a
                          // mast (6); where on which arc (7: x = how far along, y = which arc)
attribute float aSeed;    // kind + 0..1: 0 shell, 1 loose, 2 flowing, 3 story, 4 orbit path,
                          // 5 satellite, 6 antenna, 7 data arc, 8 exhaust; the fraction is its own
                          // random value (orbit path: its angle, as a share of a turn)

uniform float uVoiceTime, uBreath, uTilt, uEnergy, uVoiceAmp;
uniform float uLooseSpread, uLooseDrift, uLooseVoice;
uniform float uFlowTime, uFlowSeconds, uFlowLinger, uGravity, uFlowSwirl;
uniform float uGatherStart, uGatherEnd, uGatherSeconds, uGatherJitter;
uniform vec4 uRipple[${RIPPLES}];   // recent slot-ins: xyz = where (unit vector), w = when (seconds, uTime)
uniform float uRippleStrength, uRippleSpeed, uRippleSeconds;
uniform vec4 uNet;        // x = orbit time, y = the orb's turn (radians), z = how flowing dots arrive
                          // (0 = swimming in, 1 = along traces from the sides, 2 = by orbit), w = orbits
uniform vec4 uNet2;       // x = longest antenna, y = arc lift, z = seconds to draw an arc, w = how far
                          // out the orbits reach (1 = as set, less to fit the screen)
uniform vec4 uArcA[${ARCS}];   // per arc: xyz = where it starts (unit vector, turning with the orb), w = when
uniform vec4 uArcB[${ARCS}];   // xyz = where it ends
uniform vec4 uIntro;      // the intro: x = seconds since the squares began to blip in, y = how long that
                          // takes, z = when the core begins to open out, w = how long that takes
uniform float uIntroCore; // the core's size at the start, fraction of radius

// Orbit k's ring (k = 0, 1, 2): its radius (fitted to the screen), the point at angle a and dr
// further out, and its speed.
float orbitRadius(float k) {
  return 1.0 + ((k < 0.5 ? ${ORBITS[0].radius.toFixed(3)} : k < 1.5 ? ${ORBITS[1].radius.toFixed(3)} : ${ORBITS[2].radius.toFixed(3)}) - 1.0) * uNet2.w;
}
vec3 orbitAt(float k, float a, float dr) {
${ORBITS.map((o, k) => `  if (k < ${k}.5) return (cos(a) * ${g3(o.u)} + sin(a) * ${g3(o.v)}) * (orbitRadius(k) + dr);`).join('\n')}
  return vec3(0.0);
}
float orbitSpeed(float k) { return k < 0.5 ? ${ORBITS[0].speed.toFixed(3)} : k < 1.5 ? ${ORBITS[1].speed.toFixed(3)} : ${ORBITS[2].speed.toFixed(3)}; }
vec3 orbitNormal(float k) { return k < 0.5 ? ${g3(ORBITS[0].n)} : k < 1.5 ? ${g3(ORBITS[1].n)} : ${g3(ORBITS[2].n)}; }

// The launches and landings (see LAUNCH in orb.js), in orbit time: when orbit k's rocket lifted off and
// when its satellite began to come down (far in the future while it's up), from where, and at which
// angle it reaches its orbit.
uniform vec4 uLaunch;     // xyz = when orbit 0, 1, 2's rocket lifted off
uniform vec4 uLand;       // xyz = when its satellite began to come down
uniform vec4 uCrash;      // xyz = 1 if that satellite was shot down (it crashes rather than landing)
const float ASCENT = ${LAUNCH.ascent.toFixed(2)};
const float DEPLOY = ${LAUNCH.deploy.toFixed(2)};
const float DESCENT = ${LAUNCH.descent.toFixed(2)};
const float EXHAUST = ${LAUNCH.exhaust.toFixed(1)};
float launchTime(float k) { return k < 0.5 ? uLaunch.x : k < 1.5 ? uLaunch.y : uLaunch.z; }
float landTime(float k) { return k < 0.5 ? uLand.x : k < 1.5 ? uLand.y : uLand.z; }
bool crashed(float k) { return (k < 0.5 ? uCrash.x : k < 1.5 ? uCrash.y : uCrash.z) > 0.5; }
float launchAngle(float k) { return k < 0.5 ? ${ORBITS[0].launch.toFixed(4)} : k < 1.5 ? ${ORBITS[1].launch.toFixed(4)} : ${ORBITS[2].launch.toFixed(4)}; }
vec3 launchSite(float k) { return k < 0.5 ? ${g3(ORBITS[0].site)} : k < 1.5 ? ${g3(ORBITS[1].site)} : ${g3(ORBITS[2].site)}; }
// How far (radians) satellite k has gone round its orbit s seconds after reaching it: a fast first lap
// laying the orbit, easing into its cruising speed; and how fast it's going then.
float lapped(float k, float s) {
  return abs(orbitSpeed(k)) * s + ${LAUNCH.boost.toFixed(4)} * (1.0 - exp(-s / ${LAUNCH.ease.toFixed(2)}));
}
float lapSpeed(float k, float s) {
  return abs(orbitSpeed(k)) + ${(LAUNCH.boost / LAUNCH.ease).toFixed(4)} * exp(-s / ${LAUNCH.ease.toFixed(2)});
}
// Rocket k's climb at progress q (0 = lift-off, 1 = reaching its orbit): from the launch site straight
// up off the surface, bending over to meet the orbit along its direction of travel. dir = its heading.
vec3 climb(float k, float q, out vec3 dir) {
  float a = launchAngle(k), sg = sign(orbitSpeed(k)), r = orbitRadius(k);
  vec3 at = orbitAt(k, a, 0.0);
  vec3 tangent = normalize(orbitAt(k, a + 0.01 * sg, 0.0) - at);
  vec3 p0 = launchSite(k), p1 = p0 * 1.45, p2 = at - tangent * 0.55 * r, p3 = at;
  float s = 1.0 - q;
  dir = normalize(3.0 * s * s * (p1 - p0) + 6.0 * s * q * (p2 - p1) + 3.0 * q * q * (p3 - p2) + vec3(1e-5));
  return s * s * s * p0 + 3.0 * s * s * q * p1 + 3.0 * s * q * q * p2 + q * q * q * p3;
}
// A piece of satellite k, shot down where it was at angle a (p0, in orbit), t seconds ago: flung
// forward and apart out of the orbit, falling faster and faster onto the orb. seed (0..1) sets its own
// way; spread 0 is the satellite's middle. Returns where it is; hit = when it reaches the surface and
// at = where.
vec3 debris(float k, float a, vec3 p0, float seed, float spread, float t, out float hit, out vec3 at) {
  float sg = sign(orbitSpeed(k)), r = orbitRadius(k);
  vec3 tangent = normalize(orbitAt(k, a + 0.01 * sg, 0.0) - orbitAt(k, a, 0.0));
  vec3 apart = (vec3(seed, fract(seed * 7.3), fract(seed * 3.9)) - 0.5) * spread;
  // Thrown outward and apart by the burst first, then curving back in, further along the orbit.
  vec3 c = p0 + tangent * (0.5 + 0.3 * seed) * r + normalize(p0) * 0.3 + apart * 1.2;
  at = normalize(p0 + tangent * 1.0 + apart * 1.2);
  hit = ${CRASH_HIT.toFixed(2)} + 0.7 * fract(seed * 5.7) * spread;
  float q = pow(clamp(t / hit, 0.0, 1.0), 1.25);
  return mix(mix(p0, c, q), mix(c, at, q), q);
}
// Satellite k coming down at progress q (0 = leaving its orbit at angle a, 1 = touching down): forward
// out of its orbit, curving over and down onto its pad. dir = its heading.
vec3 descend(float k, float a, float q, out vec3 dir) {
  float sg = sign(orbitSpeed(k)), r = orbitRadius(k);
  vec3 at = orbitAt(k, a, 0.0);
  vec3 tangent = normalize(orbitAt(k, a + 0.01 * sg, 0.0) - at);
  vec3 p0 = at, p1 = at + tangent * 0.55 * r, p3 = launchSite(k), p2 = p3 * 1.45;
  float s = 1.0 - q;
  dir = normalize(3.0 * s * s * (p1 - p0) + 6.0 * s * q * (p2 - p1) + 3.0 * q * q * (p3 - p2) + vec3(1e-5));
  return s * s * s * p0 + 3.0 * s * s * q * p1 + 3.0 * s * q * q * p2 + q * q * q * p3;
}

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
  markKey = vec4(aPos, aSeed);   // for a callout (markKey in orb.js)
  float looseDim = 1.0;
  float fade = 1.0;
  float heat = 0.0;          // slot-in flash
  bool falling = false;
  bool free = false;         // out in space (orbits, satellites): doesn't turn or breathe with the orb
  float fall = 1.0;          // falling dots: 0 = at the start point, 1 = in its slot
  float fallTimeShare = 1.0; // the same, as a plain share of its fall time (no gravity)
  vec2 fallStart = vec2(0.0);
  float wobbleAmt = 0.12;
  float fk = 0.0, fh1 = 0.0, fh2 = 0.0;

  if (aSeed >= 8.0) {
    // Exhaust: a trail of squares behind a climbing rocket, a puff at the launch site first, spreading
    // and thinning as it goes, and gone soon after the rocket reaches its orbit. When its satellite is
    // shot down, it's the smoke trailing the wreck down to the orb instead.
    float k = aPos.x, i = aPos.y, r = aSeed - 8.0;
    float tau = uNet.x - launchTime(k);
    float down = uNet.x - landTime(k);
    float lag = 0.06 + i * 0.07;
    vec3 dir;
    vec3 puff = (vec3(r, fract(r * 7.1), fract(r * 3.3)) - 0.5) * (0.015 + 0.07 * i / EXHAUST);
    if (down >= 0.0 && crashed(k)) {
      float left = launchAngle(k) + sign(orbitSpeed(k)) * lapped(k, landTime(k) - launchTime(k) - ASCENT);
      float hit;
      vec3 at;
      pos = debris(k, left, orbitAt(k, left, 0.0), 0.5, 0.0, max(down - lag, 0.0), hit, at) + puff;
      fade = step(lag, down) * (1.0 - 0.6 * i / EXHAUST) * (1.0 - smoothstep(hit * 0.7, hit + 1.0, down - lag));
    } else {
      pos = climb(k, pow(clamp((tau - lag) / ASCENT, 0.0, 1.0), 1.6), dir) + puff;
      fade = step(0.0, tau) * (1.0 - 0.6 * i / EXHAUST) * (1.0 - smoothstep(ASCENT * 0.8, ASCENT + 1.2, tau - lag));
    }
    free = true;
    looseDim = 0.9 - 0.3 * i / EXHAUST;
  } else if (aSeed >= 7.0) {
    // Data arc: a stroke of squares drawn across the surface from one point to another, lifting off
    // it in between, led by a dark packet; it holds a moment, then is wiped from its start.
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = 0; i < ${ARCS}; i++) {
      if (float(i) == aPos.y) {
        a = uArcA[i];
        b = uArcB[i];
      }
    }
    float along = aPos.x;
    float age = uTime - a.w;
    float head = clamp(age / uNet2.z, 0.0, 1.0);
    float tail = clamp((age - uNet2.z - ${ARC_HOLD.toFixed(2)}) / uNet2.z, 0.0, 1.0);
    float span = acos(clamp(dot(a.xyz, b.xyz), -1.0, 1.0));
    pos = normalize(mix(a.xyz, b.xyz, along) + vec3(1e-4)) * (1.01 + uNet2.y * span * sin(3.14159 * along));
    if (age < 0.0 || along > head || along < tail) fade = 0.0;
    if (age < uNet2.z) heat = exp(-pow((head - along) / 0.035, 2.0)) * 1.2;
    else if (along > 0.95) heat = slotHeat(age - uNet2.z) * 0.6;   // it connects
    looseDim = 0.85;
  } else if (aSeed >= 6.0) {
    // Antenna: a mast of squares standing out from the surface; signals run up it and off its tip.
    pos = aPos;
    float out1 = length(aPos) - 1.0;
    float front = fract(uTime * 0.28 + (aSeed - 6.0)) * (uNet2.x + 0.3);
    heat = exp(-pow((out1 - front) / 0.035, 2.0)) * 1.3;
  } else if (aSeed >= 5.0) {
    // Satellite: a small body with a panel to either side, travelling along its orbit. It goes up as a
    // rocket, folded: the body leading, the panels stacked in a column behind it. It climbs to its
    // orbit, unfolds, and races round a first lap before easing into its cruising speed. Coming down,
    // it folds up again, leaves its orbit and lands on its pad, flaring as it touches down and sinking
    // into the orb.
    float k = aPos.x, sg = sign(orbitSpeed(k)), r = orbitRadius(k);
    float tau = uNet.x - launchTime(k);
    float down = uNet.x - landTime(k);
    float side = abs(aPos.z);
    float foldAlong = side < 1.0 ? aPos.y : -(side - 0.3) - (aPos.z < 0.0 ? 3.0 : 0.0);
    float foldOut = side < 1.0 ? aPos.z : 0.0;
    if (down >= 0.0 && crashed(k)) {
      // Shot down: it bursts with a flash, its squares tumbling out of the orbit as debris and
      // falling onto the orb, each flaring where it hits before it sinks in.
      float left = launchAngle(k) + sg * lapped(k, landTime(k) - launchTime(k) - ASCENT);
      vec3 open = orbitAt(k, left + aPos.y * ${SATELLITE_STEP} / r, aPos.z * ${SATELLITE_STEP});
      float hit;
      vec3 at;
      pos = debris(k, left, open, hash(aPos.y * 13.1 + aPos.z * 7.7 + k * 3.3), 1.0, down, hit, at);
      heat = 2.4 * (1.0 - smoothstep(0.0, 0.55, down));
      float landed = down - hit;
      if (landed > 0.0) {
        heat = slotHeat(landed) * 0.9;
        fade = 1.0 - smoothstep(0.3, 1.6, landed);
      }
    } else if (down >= 0.0) {
      float left = launchAngle(k) + sg * lapped(k, landTime(k) - launchTime(k) - ASCENT);
      vec3 open = orbitAt(k, left + aPos.y * ${SATELLITE_STEP} / r, aPos.z * ${SATELLITE_STEP});
      vec3 dir;
      float u = clamp(down / DESCENT, 0.0, 1.0);
      vec3 c = descend(k, left, 1.0 - pow(1.0 - u, 1.6), dir);
      vec3 across = normalize(cross(dir, orbitNormal(k)) + vec3(1e-5));
      vec3 folded = c + dir * foldAlong * ${SATELLITE_STEP} + across * foldOut * ${SATELLITE_STEP};
      pos = mix(open, folded, smoothstep(0.0, 0.5, down));
      float landed = down - DESCENT;
      if (landed > 0.0) {
        heat = slotHeat(landed) * 0.4;
        fade = 1.0 - smoothstep(0.2, 1.2, landed);
      }
    } else if (tau < 0.0) {
      fade = 0.0;
      pos = launchSite(k);
    } else if (tau < ASCENT) {
      vec3 dir;
      vec3 c = climb(k, pow(tau / ASCENT, 1.6), dir);
      vec3 across = normalize(cross(dir, orbitNormal(k)) + vec3(1e-5));
      pos = c + dir * foldAlong * ${SATELLITE_STEP} + across * foldOut * ${SATELLITE_STEP};
      fade = smoothstep(0.0, 0.25, tau);
      heat = 0.25;
    } else {
      float s = tau - ASCENT;
      float angle = launchAngle(k) + sg * lapped(k, s);
      vec3 folded = orbitAt(k, angle + sg * foldAlong * ${SATELLITE_STEP} / r, foldOut * ${SATELLITE_STEP});
      vec3 open = orbitAt(k, angle + aPos.y * ${SATELLITE_STEP} / r, aPos.z * ${SATELLITE_STEP});
      pos = mix(folded, open, smoothstep(0.0, DEPLOY, s));
    }
    free = true;
  } else if (aSeed >= 4.0) {
    // Orbit path: a dotted ring, fainter than what travels on it, dropped by its satellite on its first
    // lap: each square appears as the satellite passes, dark at first and cooling behind it. Once its
    // satellite has left, it dissolves square by square.
    float k = aPos.x;
    float phi = (aSeed - 4.0) * 6.2832;
    pos = orbitAt(k, phi, 0.0);
    free = true;
    looseDim = 0.5;
    float s = uNet.x - launchTime(k) - ASCENT;
    float ahead = mod((phi - launchAngle(k)) * sign(orbitSpeed(k)), 6.2832);
    float gone = s < 0.0 ? -1.0 : lapped(k, s);
    if (gone < ahead) fade = 0.0;
    else heat = exp(-(gone - ahead) / lapSpeed(k, s) * 1.4) * 1.1;
    fade *= 1.0 - smoothstep(0.0, 0.5, uNet.x - landTime(k) - 0.4 - hash(aSeed * 91.3) * 2.2);
  } else if (aSeed >= 3.0) {
    // Story dot: a CV entry's squares, falling in from the entry's marker (see story()).
    float idx = floor((aSeed - 3.0) * ${STORY_TOTAL.toFixed(1)});
    fk = idx / 97.0;
    fh2 = hash(idx * 7.7 + 4.0);
    pos = aPos;
    wobbleAmt = 0.03;
    falling = story(idx, fall, fallStart, heat, fade);
  } else if (aSeed >= 2.0) {
    // Flowing dot. Each has a reserved slot in the shell. Cycle: come in from outside as if pulled by
    // gravity (barely moving at first, speeding up as it nears, braking into the slot), flare with
    // burn, rest, then quietly drift outward and fade before starting again. How it comes in depends
    // on uNet.z (see below). Cycle length, phase and gather delay come from exact() so orb.js can tell
    // when it slots in.
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
    // Along a trace it travels more evenly than when swimming or dropping in.
    float g = uGravity * (0.8 + 0.4 * h3) * (uNet.z > 0.5 && uNet.z < 1.5 ? 0.35 : 1.0);
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
        fallTimeShare = mix(u0, 1.0, smoothstep(0.0, 1.0, x));
        falling = true;
        fade = mix(smoothstep(0.0, 0.12, u0), 1.0, x) * mix(0.55, 1.0, fall);
      } else {
        landed = (x - 1.0) * gatherTime;
      }
    } else if (phase < fallEnd) {
      float u = phase / fallEnd;
      fall = fallCurve(u, g, uLanding);
      fallTimeShare = u;
      falling = true;
      fade = smoothstep(0.0, 0.12, u) * mix(0.55, 1.0, fall);
    } else {
      landed = (phase - fallEnd) * cycle;
    }

    // (No flare for one that was already in its slot when the page opened.)
    if (landed >= 0.0 && landed <= uFlowTime) heat = slotHeat(landed);
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

  // The intro: everything in the orb (not what's out in space) starts packed into a small core, unseen.
  // Each square blips in at its own moment, more and more of them toward the end, popping up with a
  // flare; packed in, they're smaller and lighter, so the core reads as a crowd of squares rather than a
  // blot. Then the core opens out into the orb, each square a little late, overshooting a touch before
  // it settles, and the squares grow to their full size and ink. CV entries' squares only move with the
  // core; flowing squares on their way in wait for the end.
  float introScale = 1.0, introSize = 1.0;
  if (!free && uIntro.x < uIntro.z + uIntro.w + 1.0) {
    float h = hash(aSeed * 71.3 + aPos.x * 13.7 + aPos.y * 5.3 + aPos.z * 3.1);
    float e = clamp((uIntro.x - uIntro.z - fract(h * 7.31) * ${INTRO.spread.toFixed(2)}) / uIntro.w, 0.0, 1.0);
    float m = e - 1.0, c = ${INTRO.overshoot.toFixed(2)};
    introScale = mix(uIntroCore, 1.0, 1.0 + (c + 1.0) * m * m * m + c * m * m);
    float age = uIntro.x - sqrt(h) * uIntro.y;
    float pop = step(0.0, age) * exp(-max(age, 0.0) * 9.0);
    if (falling && aSeed >= 2.0 && aSeed < 3.0) {
      fade *= smoothstep(uIntro.z + uIntro.w, uIntro.z + uIntro.w + 0.6, uIntro.x);
    } else if (aSeed < 3.0 || aSeed >= 4.0) {
      float crowded = 1.0 - smoothstep(0.0, 0.7, e);
      fade *= smoothstep(0.0, 0.05, age) * (1.0 - 0.6 * crowded);
      heat += 1.2 * pop;
      introSize = (1.0 - 0.55 * crowded) * (1.0 + 1.2 * pop);
    }
  }

  // Ripples from squares slotting in nearby move the shell and the dots resting in their slots.
  float rippleInk = 0.0;
  if (aSeed < 1.0 || (aSeed >= 2.0 && aSeed < 4.0 && !falling)) {
    vec4 rp = ripple(aPos);
    pos += rp.xyz;
    rippleInk = rp.w;
  }
  // The orb breathes and turns (and opens out in the intro); what's out in space doesn't.
  if (!free) {
    pos *= uBreath * introScale;
    float cs = cos(uNet.y), sn = sin(uNet.y);
    pos = vec3(pos.x * cs + pos.z * sn, pos.y, -pos.x * sn + pos.z * cs);
  }

  bool flowing = aSeed >= 2.0 && aSeed < 3.0;
  if (falling && flowing && uNet.z > 1.5) {
    // Brought in by an orbit: in the last stretch of its fall time it appears on the orbit line a
    // little before the point closest to its slot, rides along to it at about the orbit's own pace,
    // and is let go there, dropping straight down onto its slot: carried a little forward at first,
    // falling faster, then braking into place. Only while that orbit is up: laid, and its satellite
    // not come down.
    float k = floor(fh1 * uNet.w);
    float laid = uNet.x - launchTime(k) - ASCENT;
    if (laid < 0.0 || lapped(k, laid) < 6.2832 || uNet.x >= landTime(k)) fade = 0.0;
    float sg = sign(orbitSpeed(k)), r = orbitRadius(k);
    vec3 slot = pos;
    vec3 d = normalize(slot);
    float letGo = atan(dot(d, normalize(orbitAt(k, 1.5708, 0.0))), dot(d, normalize(orbitAt(k, 0.0, 0.0))));
    float w = fallTimeShare;
    fade *= smoothstep(0.6, 0.66, w);
    if (w < 0.8) {
      pos = orbitAt(k, letGo - sg * 0.6 * (1.0 - clamp((w - 0.6) / 0.2, 0.0, 1.0)), 0.0);
    } else {
      float q = fallCurve((w - 0.8) / 0.2, 2.5, uLanding);
      vec3 p0 = orbitAt(k, letGo, 0.0);
      vec3 tangent = normalize(orbitAt(k, letGo + 0.01 * sg, 0.0) - p0);
      vec3 p1 = p0 + tangent * 0.15 * r, p2 = slot * 1.12;
      float s = 1.0 - q;
      pos = s * s * s * p0 + 3.0 * s * s * q * p1 + 3.0 * s * q * q * p2 + q * q * q * slot;
    }
    falling = false;
  }

  // Tilt around X for the viewing angle.
  float ct = cos(uTilt), st = sin(uTilt);
  vec3 p = vec3(pos.x, pos.y * ct - pos.z * st, pos.y * st + pos.z * ct);
  float zn = p.z / length(p);
  float s;
  vec2 screen = project(p, s);
  float depth = clamp((zn + 1.0) * 0.5, 0.0, 1.0);
  // Out from the surface and behind the orb: hidden by it.
  if (aSeed >= 4.0) fade *= 1.0 - 0.85 * step(p.z, 0.0) * (1.0 - smoothstep(0.92, 1.04, length(p.xy) / (uBreath * introScale)));

  if (falling && flowing && uNet.z > 0.5) {
    // Along a trace: in from the side of the screen near its slot's height, straight across with one
    // right-angle jog on the way, like a signal on a circuit board.
    float margin = uDotSize * uRadius * 2.0;
    float edge = fh1 < 0.5 ? -margin : uResolution.x + margin;
    float y0 = screen.y + (fh2 - 0.5) * uRadius * 0.7;
    float xm = mix(edge, screen.x, 0.3 + 0.45 * hash(fk * 5.1 + 1.0));
    float l1 = abs(xm - edge), l2 = abs(screen.y - y0), l3 = abs(screen.x - xm);
    float d = fall * (l1 + l2 + l3);
    screen = d < l1 ? vec2(mix(edge, xm, d / max(l1, 1e-3)), y0)
           : d < l1 + l2 ? vec2(xm, mix(y0, screen.y, (d - l1) / max(l2, 1e-3)))
           : vec2(mix(xm, screen.x, (d - l1 - l2) / max(l3, 1e-3)), screen.y);
    s = mix(1.0, s, fall);
    depth = mix(0.8, depth, fall);
    zn = mix(0.6, zn, fall);
  } else if (falling) {
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
  emit(screen, s, depth, free ? 0.0 : 1.0 - abs(zn), heat, looseDim * fade * (1.0 + rippleInk), uEnergy * 0.1,
       mix(0.6, 1.0, looseDim) * introSize, aSeed < 3.0 || aSeed >= 4.0);
}`;

// ---------- the squares ----------

function randomDirection() {
  const y = Math.random() * 2 - 1;
  const r = Math.sqrt(1 - y * y);
  const a = Math.random() * Math.PI * 2;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

// Squares along `lines` parallels and twice as many meridians (stopping short of the poles, where
// they'd crowd), spaced evenly along each line.
function gridPoints(lines) {
  const step = 0.024;
  const out = [];
  for (let i = 0; i < lines; i++) {
    const lat = (-0.5 + (i + 0.5) / lines) * Math.PI * 0.86;
    const r = Math.cos(lat), y = Math.sin(lat);
    const n = Math.max(8, Math.round((TAU * r) / step));
    for (let j = 0; j < n; j++) out.push([Math.cos((j / n) * TAU) * r, y, Math.sin((j / n) * TAU) * r]);
  }
  const meridians = lines * 2;
  const n = Math.round((Math.PI * 0.9) / step);
  for (let k = 0; k < meridians; k++) {
    const a = (k / meridians) * TAU;
    for (let j = 0; j <= n; j++) {
      const lat = (-0.45 + (0.9 * j) / n) * Math.PI;
      out.push([Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat)]);
    }
  }
  return out;
}

// The decorations: orbit paths and their satellites with their rockets' exhaust, antennas and the data
// arcs' squares. They sit right after the story dots, so they're always drawn whole.
function decorations() {
  const out = [];
  for (let k = 0; k < Math.min(3, CONFIG.orbits); k++) {
    const n = Math.round((TAU * ORBITS[k].radius) / 0.05);
    for (let j = 0; j < n; j++) out.push([k, 0, 0, 4 + (j + 0.5) / n]);
    // A satellite: a 2x2 body with a panel of three squares to either side, across its orbit.
    for (const [along, outward] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5],
      [0, -1.8], [0, -2.8], [0, -3.8], [0, 1.8], [0, 2.8], [0, 3.8]]) out.push([k, along, outward, 5.5]);
    for (let i = 0; i < LAUNCH.exhaust; i++) out.push([k, i, 0, 8 + Math.random() * 0.999]);
  }
  // Antennas: masts of different lengths, standing apart, each with a small cross at its tip.
  const masts = [];
  for (let k = 0; k < CONFIG.antennas; k++) {
    let dir, tries = 0;
    do dir = randomDirection(); while (tries++ < 50 && masts.some((m) => m[0] * dir[0] + m[1] * dir[1] + m[2] * dir[2] > 0.8));
    masts.push(dir);
    const length = CONFIG.antennaLength * (0.35 + 0.65 * Math.random());
    const phase = Math.random() * 0.999;
    for (let d = 0.03; d <= length; d += 0.022) out.push([dir[0] * (1 + d), dir[1] * (1 + d), dir[2] * (1 + d), 6 + phase]);
    const t1 = norm3(cross3(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross3(dir, t1);
    const tip = dir.map((x) => x * (1 + length + 0.022));
    for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      out.push([0, 1, 2].map((c) => tip[c] + (t1[c] * i + t2[c] * j) * 0.018).concat(6 + phase));
    }
  }
  for (let k = 0; k < ARCS; k++) {
    for (let j = 0; j < ARC_SQUARES; j++) out.push([(j + 0.5) / ARC_SQUARES, k, 0, 7.5]);
  }
  return out;
}

let storySlots = new Float32Array(0), flowSlots = [];
let placed = new Float32Array(0);   // the data build() made last

// Shell dots sit on an even Fibonacci lattice, or on a latitude/longitude grid (seed 0..1); loose
// (seed 1..2) and flowing (seed 2..3) dots get random directions (on the grid, if there is one).
// Story dots (seed 3..4) get slots on the front of the orb, so their arrival is visible, and go
// first so they're never dropped; then the decorations.
function build() {
  const looseCount = Math.round(CONFIG.dotCount * CONFIG.looseFraction);
  const flowCount = CONFIG.flowCount;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const grid = CONFIG.gridLines > 0 ? gridPoints(CONFIG.gridLines) : null;
  const even = grid ? Math.round(CONFIG.dotCount * CONFIG.gridFill) : CONFIG.dotCount;
  const dots = [];
  for (const p of grid ?? []) dots.push([...p, 0.5]);
  for (let i = 0; i < even; i++) {
    const y = 1 - (2 * (i + 0.5)) / even;
    const r = Math.sqrt(1 - y * y);
    const a = i * golden;
    dots.push([Math.cos(a) * r, y, Math.sin(a) * r, Math.random()]);
  }
  for (let i = 0; i < looseCount; i++) dots.push([...randomDirection(), 1 + Math.random()]);
  for (let i = 0; i < flowCount; i++) {
    const slot = grid ? grid[Math.floor(Math.random() * grid.length)] : randomDirection();
    dots.push([...slot, 2 + Math.random()]);
  }
  // Evenly ordered, so drawing only the first k dots (on slow devices) still covers the sphere evenly.
  const ordered = evenOrder(dots, (d) => d);
  const story = [];
  for (let i = 0; i < STORY_TOTAL; i++) {
    let d;
    do d = randomDirection(); while (d[2] < 0.3);
    story.push([...d, 3 + (i + 0.5) / STORY_TOTAL]);
  }
  const all = story.concat(decorations(), ordered);
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

// Where the visible squares are at engine time t, for morphing (see POSE in voxel.js): each at rest
// in its place, as the shader draws it (without the loose dots' wandering, the flowing dots' travels,
// the rockets' exhaust and the data arcs, which come and go; a climbing rocket as one point).
function pose(t) {
  const out = [];
  fitOrbits();
  const ct = Math.cos(CONFIG.tilt), st = Math.sin(CONFIG.tilt);
  const turn = spinAngle + (t - lastT) * CONFIG.spin;
  const travelled = orbitTime + (t - lastT) * CONFIG.orbitSpeed;
  const core = introTime < introEnd() ? introScale(introTime + t - lastT) : 1;   // its size, mid-intro
  for (let i = 0; i < placed.length / 4; i++) {
    const seed = placed[i * 4 + 3];
    const at = [placed[i * 4], placed[i * 4 + 1], placed[i * 4 + 2]];
    let p, looseDim = 1, inSpace = false;
    if (seed >= 7) continue;
    if (seed >= 6) {
      p = spun(at.map((x) => x * breath * core), turn);
    } else if (seed >= 5) {
      const k = at[0], o = ORBITS[k], tau = travelled - launchTime(k);
      if (tau < 0 || travelled >= lands[k]) continue;
      if (tau < LAUNCH.ascent) p = climbAt(k, (tau / LAUNCH.ascent) ** 1.6);
      else {
        const angle = o.launch + o.sign * lapped(k, tau - LAUNCH.ascent);
        p = orbitAt(k, angle + (at[1] * SATELLITE_STEP) / fitted(k), at[2] * SATELLITE_STEP);
      }
      inSpace = true;
    } else if (seed >= 4) {
      const k = at[0], o = ORBITS[k], phi = (seed - 4) * TAU, s = travelled - launchTime(k) - LAUNCH.ascent;
      const ahead = ((((phi - o.launch) * o.sign) % TAU) + TAU) % TAU;
      if (s < 0 || lapped(k, s) < ahead || travelled >= lands[k]) continue;
      p = orbitAt(k, phi, 0);
      looseDim = 0.5;
      inSpace = true;
    } else {
      let reach = 1 + (seed - 0.5) * 0.04;
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
      p = spun(at.map((x) => x * reach * breath * core), turn);
    }
    const [x, y, z] = p;
    const py = y * ct - z * st, pz = y * st + z * ct;
    const zn = pz / Math.hypot(x, py, pz);
    const rim = inSpace ? 0 : 1 - Math.abs(zn);
    out.push(x, py, pz, (zn + 1) / 2, looseDim, 0.6 + 0.4 * looseDim, 0.1 * rim * rim);
  }
  return new Float32Array(out);
}

// ---------- callouts: the squares one may point at ----------

// Shell squares on the front of the orb (as it's turned now), once the intro is over.
function marks() {
  if (introTime < introEnd()) return [];
  const ct = Math.cos(CONFIG.tilt), st = Math.sin(CONFIG.tilt), out = [];
  for (let i = STORY_TOTAL; i < placed.length / 4; i++) {
    if (placed[i * 4 + 3] >= 1) continue;
    const [, y, z] = spun([placed[i * 4], placed[i * 4 + 1], placed[i * 4 + 2]], spinAngle);
    if (y * st + z * ct > 0.35) out.push(i);
  }
  return out;
}

// Where shell square i sits at engine time t, as the shader draws it: with its faint idle drift and
// the orb's breath and turn (but not the ripples, too small to see).
function markAt(i, t) {
  const seed = placed[i * 4 + 3];
  if (!(seed < 1)) return null;
  const idle = snoise(placed[i * 4] * 2, placed[i * 4 + 1] * 2 + t * 0.2, placed[i * 4 + 2] * 2) * 0.012;
  const reach = (1 + (seed - 0.5) * 0.04 + idle) * breath;
  const [x, y, z] = spun([0, 1, 2].map((k) => placed[i * 4 + k] * reach), spinAngle + (t - lastT) * CONFIG.spin);
  const ct = Math.cos(CONFIG.tilt), st = Math.sin(CONFIG.tilt);
  const py = y * ct - z * st, pz = y * st + z * ct;
  return [x, py, pz, (pz / Math.hypot(x, py, pz) + 1) / 2, 1];
}

// Square i as the shader knows it, for lighting it up (markKey in the shader): its aPos and aSeed.
const markKey = (i) => Array.from(placed.subarray(i * 4, i * 4 + 4));

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

// A flowing dot slotting in at time t: a ripple, and a soft tick.
function slotIn(f, t) {
  addRipple(f.dir, t);
  play('slot', { pan: panOf(f.dir[0]), pitch: 0.9 + f.k * 0.4 });
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
      if (!skipped && !gathered) slotIn(f, t - (now - (start + fallEnd * cycle)));
    }
    // Drawn in by a press: dots that were mid-fall land a set time (plus their own delay) after it.
    const land = gathering.start + gatherSeconds + f.gatherDelay * CONFIG.gatherJitter;
    if (prev < land && land <= now) {
      const u = gathering.start / cycle + f.phase;
      const phase = u - Math.floor(u);
      if (phase > 0 && phase < fallEnd) slotIn(f, t - (now - land));
    }
  }
  for (let i = 0; i < scheduled.length; ) {
    if (scheduled[i].time <= t) addRipple(scheduled[i].dir, scheduled.splice(i, 1)[0].time);
    else i++;
  }
}

// ---------- data arcs ----------

// Each arc draws, holds, is wiped, and after a short pause starts again somewhere new: between two
// points a little apart, starting on the side facing the viewer.
const arcs = Array.from({ length: ARCS }, () => ({ a: [0, 0, 1], b: [0, 0, 1], start: -1e9 }));
const arcA = new Float32Array(ARCS * 4), arcB = new Float32Array(ARCS * 4);

function updateArcs(t) {
  const life = 2 * CONFIG.arcSeconds + ARC_HOLD;
  arcs.forEach((arc, i) => {
    if (i >= CONFIG.arcs || reducedMotion.matches) {
      arc.start = -1e9;
    } else if (t > arc.start + life) {
      let world;
      do world = randomDirection(); while (world[2] < 0.25);
      const a = spun(world, -spinAngle);
      const side = norm3(cross3(a, randomDirection()));
      const angle = 0.5 + Math.random() * 1.0;
      const b = [0, 1, 2].map((c) => a[c] * Math.cos(angle) + side[c] * Math.sin(angle));
      // The first arcs start spread out; later ones after a short pause.
      Object.assign(arc, { a, b, start: arc.start < -1e8 ? t + Math.random() * life : t + 0.3 + Math.random() * 1.2 });
    }
    arcA.set([...arc.a, arc.start], i * 4);
    arcB.set([...arc.b, 0], i * 4);
  });
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

// ---------- satellites coming down and going up again ----------

// Once every orbit is up, after a pause one satellite comes down (only ever one at a time), touching down
// on its pad with a ripple through the orb's surface; a while after, a new rocket lifts off from the same
// pad and lays its orbit again.
let nextLanding = NEVER;      // orbit time when the next satellite comes down

const orbitUp = (k) => orbitTime > launches[k] + LAUNCH.laid && lands[k] === NEVER;

// Whether satellite k is on the front half of its orbit now (as seen from the viewing angle), so its
// way down can be seen.
function inFront(k) {
  const o = ORBITS[k];
  const [, y, z] = orbitAt(k, o.launch + o.sign * lapped(k, orbitTime - launches[k] - LAUNCH.ascent), 0);
  return y * Math.sin(CONFIG.tilt) + z * Math.cos(CONFIG.tilt) > 0.15;
}

function landings(t) {
  const count = Math.min(3, CONFIG.orbits);
  for (let k = 0; k < count; k++) {
    if (orbitTime >= relaunches[k]) {
      launches[k] = orbitTime;
      lands[k] = relaunches[k] = NEVER;
      crashes[k] = 0;
    }
  }
  if (reducedMotion.matches || count === 0) return;
  const up = [...Array(count).keys()].filter(orbitUp);
  if (nextLanding === NEVER && up.length === count) nextLanding = orbitTime + rand(CONFIG.landPauseMin, CONFIG.landPauseMax);
  // When it's time, a satellite on the front of its orbit comes down; if none is, it waits for one.
  const ready = up.filter(inFront);
  if (orbitTime >= nextLanding && up.length === count && ready.length) {
    nextLanding = NEVER;
    landSatellite(ready[Math.floor(Math.random() * ready.length)], t);
  }
}

// Brings satellite k down now (t is the frame clock, for its touchdown ripple).
function landSatellite(k, t) {
  lands[k] = orbitTime;
  relaunches[k] = orbitTime + LAUNCH.descent + 1 + rand(CONFIG.relaunchMin, CONFIG.relaunchMax);
  scheduled.push({ dir: ORBITS[k].site, time: t + LAUNCH.descent / Math.max(CONFIG.orbitSpeed, 0.01) });
}

// Every rocket back on its pad, to lift off as the page opens (for the tune panel).
function launchAgain() {
  orbitTime = 0;
  for (let k = 0; k < 3; k++) {
    launches[k] = LAUNCH.first + k * LAUNCH.stagger;
    lands[k] = relaunches[k] = NEVER;
    crashes[k] = 0;
  }
  nextLanding = NEVER;
}

// The intro from the start, and the launch after it.
function replay() {
  introTime = 0;
  launchAgain();
}

// All orbits up, as if launched long ago (morphed into, or launched again from the start).
function orbitsUp(since) {
  for (let k = 0; k < 3; k++) {
    if (orbitTime < launches[k] + LAUNCH.laid || lands[k] !== NEVER) launches[k] = orbitTime - since;
    lands[k] = relaunches[k] = NEVER;
    crashes[k] = 0;
  }
  nextLanding = NEVER;
}

// ---------- shooting a satellite down ----------

// The satellite under a point on the canvas (device px), if one is in its orbit there and not hidden
// behind the orb: the nearest within a fingertip.
function satelliteAt({ x, y }) {
  const st = stage(), cam = CONFIG.cameraDistance;
  const ct = Math.cos(CONFIG.tilt), sn = Math.sin(CONFIG.tilt);
  const reach = Math.max(24 * st.scale, 0.12 * st.radius);
  let best = -1, nearest = reach;
  for (let k = 0; k < Math.min(3, CONFIG.orbits); k++) {
    const tau = orbitTime - launches[k];
    if (tau < LAUNCH.ascent || lands[k] !== NEVER) continue;
    const o = ORBITS[k];
    const [px, y0, z0] = orbitAt(k, o.launch + o.sign * lapped(k, tau - LAUNCH.ascent), 0);
    const py = y0 * ct - z0 * sn, pz = y0 * sn + z0 * ct;
    if (pz < 0 && Math.hypot(px, py) < 1) continue;
    const s = cam / (cam - pz);
    const d = Math.hypot(x - (st.x + px * st.radius * s), y - (st.y - py * st.radius * s));
    if (d < nearest) { nearest = d; best = k; }
  }
  return best;
}

// Shoots satellite k down now (t is the frame clock): it crashes onto the orb rather than landing, the
// wreck rippling the surface where it hits, and is relaunched a while after, like a landing.
function shootDown(k, t) {
  const o = ORBITS[k];
  lands[k] = orbitTime;
  crashes[k] = 1;
  relaunches[k] = orbitTime + CRASH_HIT + 1.8 + rand(CONFIG.relaunchMin, CONFIG.relaunchMax);
  nextLanding = NEVER;
  // Where the wreck comes down, as the shader has it (its middle piece), and two ripples beside it.
  const angle = o.launch + o.sign * lapped(k, orbitTime - launches[k] - LAUNCH.ascent);
  const p0 = orbitAt(k, angle, 0), ahead = orbitAt(k, angle + 0.01 * o.sign, 0);
  play('burst', { pan: panOf(p0[0]) });
  const tangent = norm3([0, 1, 2].map((i) => ahead[i] - p0[i]));
  const at = norm3([0, 1, 2].map((i) => p0[i] + tangent[i] * 1.0));
  const side = norm3(cross3(at, tangent));
  const speed = Math.max(CONFIG.orbitSpeed, 0.01);
  scheduled.push({ dir: at, time: t + CRASH_HIT / speed });
  for (const [k2, delay] of [[1, 0.25], [-1, 0.5]]) {
    scheduled.push({ dir: norm3([0, 1, 2].map((i) => at[i] + side[i] * 0.15 * k2)), time: t + (CRASH_HIT + delay) / speed });
  }
}

// ---------- sound ----------

// The intro: a blip for some of the squares as they come in, more and more of them and rising a
// little, and the core opening out. a, b: the intro's time at the last frame and at this one.
let blipCarry = 0;
function introSounds(a, b) {
  const share = (x) => Math.min(1, Math.max(0, (x - INTRO.delay) / Math.max(CONFIG.introBlipSeconds, 0.01))) ** 2;
  blipCarry += 46 * (share(b) - share(a));
  for (; blipCarry >= 1; blipCarry--) {
    play('blip', {
      at: Math.random() * (b - a),
      pan: panOf((Math.random() - 0.5) * 2 * CONFIG.introCore),
      pitch: 0.85 + 0.4 * share(b) + Math.random() * 0.15,
    });
  }
  const opens = INTRO.delay + CONFIG.introBlipSeconds + INTRO.hold;
  if (a < opens && b >= opens) play('bloom', { pan: panOf() });
}

// The orbits, as orbit time passes from `prev` to now (so they keep pace with them): a rocket lifting
// off, unfolding into its satellite and laying its orbit (a pulse for about every sixth square of it),
// a satellite coming down onto its pad, and a shot-down one's wreck hitting the orb. A jump in orbit
// time (morphed into, launched again) is silent.
const layCarry = [0, 0, 0];
function orbitSounds(prev) {
  if (orbitTime < prev || orbitTime - prev > 0.5) return;
  const speed = Math.max(CONFIG.orbitSpeed, 0.01), frame = (orbitTime - prev) / speed;
  const passes = (from, to, mark) => from <= mark && to > mark;
  for (let k = 0; k < Math.min(3, CONFIG.orbits); k++) {
    const o = ORBITS[k], t0 = prev - launches[k], t1 = orbitTime - launches[k];
    if (passes(t0, t1, 0)) play('launch', { pan: panOf(o.site[0]), length: LAUNCH.ascent / speed });
    if (passes(t0, t1, LAUNCH.ascent)) play('deploy', { pan: panOf(orbitAt(k, o.launch, 0)[0]) });
    if (lands[k] === NEVER && t1 > LAUNCH.ascent) {
      const laid0 = t0 > LAUNCH.ascent ? Math.min(TAU, lapped(k, t0 - LAUNCH.ascent)) : 0;
      const laid1 = Math.min(TAU, lapped(k, t1 - LAUNCH.ascent));
      layCarry[k] += (Math.round((TAU * o.radius) / 0.05) * (laid1 - laid0)) / TAU / 6;
      const pan = panOf(orbitAt(k, o.launch + o.sign * laid1, 0)[0]);
      for (; layCarry[k] >= 1; layCarry[k]--) play('lay', { at: Math.random() * frame, pan, pitch: [1.2, 1, 0.84][k] });
    }
    const d0 = prev - lands[k], d1 = orbitTime - lands[k];
    if (crashes[k]) {
      const left = orbitAt(k, o.launch + o.sign * lapped(k, lands[k] - launches[k] - LAUNCH.ascent), 0)[0];
      for (const [mark, gain] of [[CRASH_HIT, 1], [CRASH_HIT + 0.25, 0.6], [CRASH_HIT + 0.5, 0.5]]) {
        if (passes(d0, d1, mark)) play('crash', { pan: panOf(left * 0.6), gain });
      }
    } else {
      if (passes(d0, d1, 0)) play('fold', { pan: panOf(o.site[0]), length: LAUNCH.descent / speed });
      if (passes(d0, d1, LAUNCH.descent)) play('touchdown', { pan: panOf(o.site[0]) });
    }
  }
}

let breathPhase = 0;          // accumulated so changing breathSeconds never jumps
let breath = 1;               // the orb's scale this frame
let voiceTime = 0;            // accumulated separately so changing voiceSpeed never jumps
let spinAngle = 0;            // how far the orb has turned
let orbitTime = 0;            // how far along the orbits things have travelled (scaled by orbitSpeed);
                              // also the launch's clock, from the visit's start
let lastT = 0;                // the frame clock at the last frame, for poses
let introTime = 0;            // seconds since the intro began (see INTRO; NEVER once skipped)

// How much of the orb shows during the intro, for the paper's scorch behind it: the share of squares
// that have blipped in, at the core's size.
function introShown() {
  if (introTime >= introEnd()) return 1;
  const blipped = Math.min(1, Math.max(0, (introTime - INTRO.delay) / Math.max(CONFIG.introBlipSeconds, 0.01))) ** 2;
  return blipped * Math.min(1, introScale(introTime));
}

function frame({ t, dt, set, activeCount }) {
  updateVoice(t, dt);
  const slow = reducedMotion.matches ? 0.3 : 1;
  // The intro plays first (not with reduced motion); everything else waits for it.
  if (reducedMotion.matches) introTime = Math.max(introTime, introEnd());
  if (introTime < introEnd()) introSounds(introTime, introTime + dt);
  introTime += dt;
  const run = introTime < introEnd() ? 0 : dt;
  const prevOrbitTime = orbitTime;

  // Breathing: smooth in-and-out scale, gentler with reduced motion.
  breathPhase += (run * Math.PI * 2) / CONFIG.breathSeconds;
  const depth = reducedMotion.matches ? CONFIG.breathDepth * 0.5 : CONFIG.breathDepth;
  breath = 1 + depth * (0.5 - 0.5 * Math.cos(breathPhase));
  voiceTime += run * CONFIG.voiceSpeed;
  spinAngle += run * CONFIG.spin * slow;
  orbitTime += run * CONFIG.orbitSpeed * slow;
  if (reducedMotion.matches && orbitTime < LAUNCH.done) orbitsUp(LAUNCH.laid + 30);   // no launch: the orbits are up
  lastT = t;
  landings(t);
  orbitSounds(prevOrbitTime);
  const prevFlowTime = flowTime;
  flowTime += reducedMotion.matches ? run * 0.5 : run;
  flowLandings(prevFlowTime, flowTime, t, activeCount);
  updateArcs(t);
  // Brought in by orbits needs an orbit; without one, they come along traces.
  const arrival = CONFIG.arrival >= 2 && CONFIG.orbits < 1 ? 1 : CONFIG.arrival;

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
  set('uNet', [orbitTime, spinAngle, arrival, Math.min(3, CONFIG.orbits)]);
  fitOrbits();
  set('uNet2', [CONFIG.antennaLength, CONFIG.arcLift, Math.max(0.2, CONFIG.arcSeconds), orbitFit]);
  set('uArcA', arcA);
  set('uArcB', arcB);
  set('uLaunch', [launches[0], launches[1], launches[2], 0]);
  set('uLand', [lands[0], lands[1], lands[2], 0]);
  set('uCrash', [crashes[0], crashes[1], crashes[2], 0]);
  set('uIntro', [introTime - INTRO.delay, CONFIG.introBlipSeconds, CONFIG.introBlipSeconds + INTRO.hold, Math.max(0.05, CONFIG.introExpandSeconds)]);
  set('uIntroCore', CONFIG.introCore);
}

// ---------- the graphic ----------

const rebuildNow = () => rebuild({ graphic: orb });

// Puts on one of the LOOKS (also while another graphic is shown: the orb then arrives in it).
function look(name) {
  Object.assign(CONFIG, LOOKS[name]);
  rebuild({ graphic: orb });
}

const orb = {
  name: 'orb',
  CONFIG,
  attributes: [['aPos', 3], ['aSeed', 1]],
  shader: SHADER,
  build,
  frame,
  pose,
  marks,
  markAt,
  markKey,
  onDrop,
  look,
  // Morphed into, it arrives whole with its orbits up (the intro and the launch play once per visit,
  // as the page opens).
  settle: () => {
    introTime = NEVER;
    orbitsUp(LAUNCH.laid + 30);
  },
  // A satellite is a target of its own: tapping it shoots it down.
  over: (at) => satelliteAt(at) >= 0,
  tap: (at) => {
    const k = satelliteAt(at);
    if (k < 0) return false;
    shootDown(k, lastT);
    return true;
  },
  press: () => {
    gather();
    play('gather', { pan: panOf() });
  },
  focus: (on) => { if (on) gather(); },
  // Plays the intro and the launch again (when sound is turned on, so they're heard).
  replay,
  // The paper's scorch behind the orb swells a little while it "speaks", and grows with it in the intro.
  halo: () => (0.6 + voice.energy * CONFIG.speech * 0.8) * introShown(),
  sliders: [
    { group: 'Intro' },
    { key: 'introCore', label: 'Core at the start (share of radius)', min: 0.02, max: 0.8, step: 0.01 },
    { key: 'introBlipSeconds', label: 'Squares blip in over (s)', min: 0, max: 5, step: 0.1 },
    { key: 'introExpandSeconds', label: 'Core opens out over (s)', min: 0.2, max: 5, step: 0.1 },
    { group: 'Orb' },
    { key: 'dotCount', label: 'Number of dots', min: 1000, max: 20000, step: 500, apply: rebuildNow },
    { key: 'breathSeconds', label: 'Breath length (s)', min: 1, max: 20, step: 0.5 },
    { key: 'breathDepth', label: 'Breath depth', min: 0, max: 0.2, step: 0.005 },
    { key: 'tilt', label: 'Viewing angle', min: 0, max: 1.2, step: 0.01 },
    { key: 'spin', label: 'Turning speed', min: 0, max: 0.5, step: 0.01 },
    { group: 'Network' },
    { key: 'arrival', label: 'Arrive: 0 swim, 1 trace, 2 orbit', min: 0, max: 2, step: 1 },
    { key: 'orbits', label: 'Orbits with satellites', min: 0, max: 3, step: 1, apply: rebuildNow },
    { key: 'orbitSpeed', label: 'Orbit speed', min: 0, max: 4, step: 0.1 },
    { key: 'landPauseMin', label: 'Satellite lands after at least (s)', min: 2, max: 120, step: 1 },
    { key: 'landPauseMax', label: 'Satellite lands after at most (s)', min: 2, max: 180, step: 1 },
    { key: 'relaunchMin', label: 'Relaunch after at least (s)', min: 0, max: 30, step: 0.5 },
    { key: 'relaunchMax', label: 'Relaunch after at most (s)', min: 0, max: 30, step: 0.5 },
    { key: 'antennas', label: 'Antennas', min: 0, max: 12, step: 1, apply: rebuildNow },
    { key: 'antennaLength', label: 'Antenna length', min: 0.05, max: 0.8, step: 0.01, apply: rebuildNow },
    { key: 'gridLines', label: 'Grid parallels (0 = none)', min: 0, max: 16, step: 1, apply: rebuildNow },
    { key: 'gridFill', label: 'Grid: dots between lines', min: 0, max: 1, step: 0.05, apply: rebuildNow },
    { key: 'arcs', label: 'Data arcs', min: 0, max: ARCS, step: 1 },
    { key: 'arcLift', label: 'Arc lift', min: 0, max: 0.5, step: 0.01 },
    { key: 'arcSeconds', label: 'Arc draw time (s)', min: 0.4, max: 6, step: 0.1 },
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
  actions: {
    'Play intro': replay,
    'Launch again': launchAgain,
    // Shoots down a satellite on the front of its orbit, as tapping one does.
    'Shoot one down': () => {
      const up = [...Array(Math.min(3, CONFIG.orbits)).keys()]
        .filter((k) => orbitTime - launches[k] > LAUNCH.ascent && lands[k] === NEVER);
      const pick = up.filter(inFront).length ? up.filter(inFront) : up;
      if (pick.length) shootDown(pick[Math.floor(Math.random() * pick.length)], lastT);
    },
    // Brings a satellite down now: one on the front of its orbit if there is one.
    'Land a satellite': () => {
      const up = [...Array(Math.min(3, CONFIG.orbits)).keys()].filter(orbitUp);
      const pick = up.filter(inFront).length ? up.filter(inFront) : up;
      if (pick.length) landSatellite(pick[Math.floor(Math.random() * pick.length)], lastT);
    },
    'Draw in': gather,
    'Speak now': speakNow,
    ...Object.fromEntries(Object.keys(LOOKS).map((name) => [`Look: ${name}`, () => look(name)])),
  },
};

export default orb;
