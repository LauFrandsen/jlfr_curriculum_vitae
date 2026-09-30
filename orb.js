// Orb of thousands of small ink squares, each with a soft scorch ("burn") around it, drawn as ink
// on the page's paper with WebGL so all per-dot work runs on the GPU.
// A still, breathing shell inside a drifting cloud, with dots flowing in from beyond the screen
// edges, settling into the orb and drifting back out. Pressing the ball draws the falling dots in
// and pauses new ones. As the page scrolls, the orb glides from the hero (#orb-slot) to a fainter
// background position (#orb-rest), and CV entries can send "story" dots into it (dropFrom).
// Each square that slots in sends a faint ripple over the squares around it.
// Optional simulated "speech"; gentle pointer pull.

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

const canvas = document.getElementById('orb-canvas');
const slot = document.getElementById('orb-slot');
const restEl = document.getElementById('orb-rest');
const focusEl = document.getElementById('orb-focus');
const haloEl = document.getElementById('orb-halo');
const heroEl = slot.closest('header') || slot;

// Story dots: a small cluster per CV entry, always drawn (kept at the front of the buffer).
const STORY_ENTRIES = 12;
const STORY_DOTS = 6;
const STORY_TOTAL = STORY_ENTRIES * STORY_DOTS;
// Ripples: the most recent slot-ins, each spreading out from where its square landed.
const RIPPLES = 16;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });

// ---------- shaders ----------

// 3D simplex noise: Ian McEwan / Stefan Gustavson (Ashima Arts), MIT licence.
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERTEX = `
precision highp float;
attribute vec3 aPos;      // unit vector on the sphere
attribute float aSeed;    // 0..1 shell, 1..2 loose, 2..3 flowing, 3..4 story

uniform float uTime, uVoiceTime, uBreath, uTilt, uEnergy, uVoiceAmp, uCamera, uBrightness;
uniform vec2 uCenter, uResolution, uPointer;
uniform float uRadius, uPointerStrength, uPullRadius, uPullStrength, uPullGlow, uDotSize, uSquare;
uniform float uLooseSpread, uLooseDrift, uLooseVoice;
uniform float uFlowTime, uFlowSeconds, uFlowLinger, uGravity, uLanding, uFlowSwirl, uSlotGlow, uAfterglow;
uniform float uGatherStart, uGatherEnd, uGatherSeconds, uGatherJitter;
uniform vec4 uStory[${STORY_ENTRIES}];   // per CV entry: xy = start (device px), z = drop time, w = 1 once dropped
uniform vec3 uStoryColor[${STORY_ENTRIES}];
uniform float uStoryFall, uStoryGlow, uStoryIntegrate;
uniform vec4 uRipple[${RIPPLES}];   // recent slot-ins: xyz = where (unit vector), w = when (seconds, uTime)
uniform float uRippleStrength, uRippleSpeed, uRippleSeconds;
uniform vec3 uColor;

// Loose pseudo-random hash; GPUs disagree on its exact value, so it only drives looks. Anything orb.js
// must predict (when a dot slots in, for its ripple) uses exact() instead: simple float maths every
// GPU computes the same way as JavaScript's Math.fround.
float hash(float x) { return fract(sin(x) * 43758.5453); }
float exact(float x, float m) { return fract(x * m); }
vec2 rot(vec2 v, float a) { float c = cos(a), sn = sin(a); return vec2(c * v.x - sn * v.y, sn * v.x + c * v.y); }

// Fall progress (0 = screen edge, 1 = slot) over normalised fall time u. Gravity g makes it
// accelerate (speed grows with closeness); the last share L of the time eases the speed back
// to zero so the dot brakes into its slot instead of slamming in.
float fallCurve(float u, float g, float L) {
  float w = u;
  if (L > 0.0 && u > 1.0 - L) {
    float x = (u - (1.0 - L)) / L;
    w = (1.0 - L) + L * (x + x * x - x * x * x);   // continuous speed at the join, zero at the end
  }
  return g < 0.01 ? w : (exp(g * w) - 1.0) / (exp(g) - 1.0);
}

varying float vAlpha;
varying float vHalf;     // half-width of the solid square, in sprite units (sprite edge = 1)
varying float vPixel;    // one device pixel, in sprite units
varying vec3 vColor;

${NOISE}

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
    // Story dot: a small cluster per CV entry. When the entry scrolls into view its dots leave
    // the entry's marker in the entry's own colour, fall into the orb, and once slotted in
    // slowly take on the orb's ink ("integrate"), staying a little stronger than the rest.
    float idx = floor((aSeed - 3.0) * ${STORY_TOTAL.toFixed(1)});
    float entry = floor(idx / ${STORY_DOTS.toFixed(1)});
    float sub = idx - entry * ${STORY_DOTS.toFixed(1)};
    vec4 story = uStory[int(entry)];
    vColor = uStoryColor[int(entry)];
    fk = idx / 97.0;
    fh2 = hash(idx * 7.7 + 4.0);
    float t = uTime - story.z - sub * 0.18 - exact(idx, 0.618034) * 0.12;
    pos = aPos;
    wobbleAmt = 0.03;
    if (story.w < 0.5 || t < 0.0) {
      fade = 0.0;
    } else if (t < uStoryFall) {
      float u = t / uStoryFall;
      fall = fallCurve(u, 3.0, uLanding);
      falling = true;
      fallStart = story.xy + (vec2(hash(idx * 1.3), hash(idx * 2.9)) - 0.5) * uRadius * 0.08;
      fade = smoothstep(0.0, 0.08, u);
    } else {
      float landed = t - uStoryFall;
      heat = uSlotGlow * (0.65 * exp(-landed * 3.0) + 0.35 * (1.0 - smoothstep(0.0, uAfterglow, landed)))
           + uStoryGlow;
      vColor = mix(vColor, uColor, smoothstep(0.4, 0.4 + uStoryIntegrate, landed));
    }
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
    float edge = min(room.x / max(abs(dir.x), 0.001), room.y / max(abs(dir.y), 0.001));
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

    // Slot-in: a dark flare of burn, then a softer afterglow that fades into the rest of the shell.
    if (landed >= 0.0) {
      heat = uSlotGlow * (0.65 * exp(-landed * 3.0) + 0.35 * (1.0 - smoothstep(0.0, uAfterglow, landed)));
    }
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

  float s = uCamera / (uCamera - p.z);
  vec2 screen = uCenter + vec2(p.x, -p.y) * uRadius * s;
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

  // Pull toward the pointer, strongest for close dots on the front face.
  vec2 toPointer = uPointer - screen;
  float w = 1.0 - clamp(length(toPointer) / (uRadius * uPullRadius), 0.0, 1.0);
  float influence = w * w * (3.0 - 2.0 * w) * (0.35 + 0.65 * depth) * uPointerStrength;
  screen += toPointer * influence * uPullStrength;
  float lift = influence * uPullGlow;

  // Front dots dark, back dots faint; the rim gets a little extra so the silhouette reads.
  float rim = 1.0 - abs(zn);
  vAlpha = (clamp(0.08 + 0.8 * pow(depth, 1.6) + 0.1 * rim * rim + lift * 0.6 + uEnergy * 0.1, 0.0, 1.0)
         + heat * (0.3 + 0.7 * depth)) * uBrightness * looseDim * fade * (1.0 + rippleInk);

  // Pull and heat widen the burn, not the square: the sprite grows and the square's share shrinks.
  float grow = 1.0 + lift * 0.8 + heat * 0.8;
  gl_PointSize = uDotSize * uRadius * 2.0 * s * (0.55 + 0.65 * depth) * grow * mix(0.6, 1.0, looseDim);
  vHalf = uSquare / grow;
  vPixel = 2.0 / max(gl_PointSize, 1.0);
  gl_Position = vec4(screen / uResolution * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}`;

const FRAGMENT = `
precision mediump float;
uniform float uBurn;
uniform vec3 uBurnColor;
varying float vAlpha;
varying float vHalf;
varying float vPixel;
varying vec3 vColor;

void main() {
  vec2 p = abs(gl_PointCoord - 0.5) * 2.0;   // 0 at the centre, 1 at the sprite's edge
  // A crisp square of ink, antialiased over one device pixel.
  float square = 1.0 - smoothstep(vHalf - vPixel * 0.5, vHalf + vPixel * 0.5, max(p.x, p.y));
  // The burn: a scorch that is darkest where it touches the square and falls away fast,
  // rounding off towards the corners.
  float d = length(max(p - vHalf, 0.0)) / max(1.0 - vHalf, 0.001);
  float burn = exp(-d * 5.0) * (1.0 - smoothstep(0.5, 1.0, d)) * uBurn;
  float a = clamp(mix(burn, 1.0, square) * vAlpha, 0.0, 1.0);
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uBurnColor, vColor, square) * a, a);   // premultiplied ink, laid over the paper
}`;

// ---------- setup ----------

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function randomDirection() {
  const y = Math.random() * 2 - 1;
  const r = Math.sqrt(1 - y * y);
  const a = Math.random() * Math.PI * 2;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

// Shell dots sit on an even Fibonacci lattice (seed 0..1); loose (seed 1..2) and
// flowing (seed 2..3) dots get random directions. Story dots (seed 3..4) get slots on the
// front of the orb, so their arrival is visible, and go first so they're never dropped.
function makeDots(shellCount, looseCount, flowCount) {
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
  return data;
}

// The shader's exact(): fract(x * m) in 32-bit floats.
function exact(x, m) {
  const v = Math.fround(Math.fround(x) * Math.fround(m));
  return v - Math.floor(v);
}

let program, uniforms = {};
let dotCount = 0, activeCount = 0;
let storySlots = new Float32Array(0), flowSlots = [];

export function setDotCount(n) {
  const loose = Math.round(n * CONFIG.looseFraction);
  dotCount = activeCount = STORY_TOTAL + n + loose + CONFIG.flowCount;
  gl.bufferData(gl.ARRAY_BUFFER, makeDots(n, loose, CONFIG.flowCount), gl.STATIC_DRAW);
  resetQuality();
}

function init() {
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  setDotCount(CONFIG.dotCount);
  const aPos = gl.getAttribLocation(program, 'aPos');
  const aSeed = gl.getAttribLocation(program, 'aSeed');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aSeed);
  gl.vertexAttribPointer(aSeed, 1, gl.FLOAT, false, 16, 12);

  for (const name of ['uTime', 'uVoiceTime', 'uBreath', 'uTilt', 'uEnergy', 'uVoiceAmp', 'uCamera', 'uBrightness',
    'uCenter', 'uResolution', 'uPointer', 'uRadius', 'uPointerStrength', 'uPullRadius', 'uPullStrength',
    'uDotSize', 'uSquare', 'uColor', 'uBurn', 'uBurnColor', 'uPullGlow', 'uLooseSpread', 'uLooseDrift', 'uLooseVoice',
    'uFlowTime', 'uFlowSeconds', 'uFlowLinger', 'uGravity', 'uLanding', 'uFlowSwirl', 'uSlotGlow', 'uAfterglow',
    'uGatherStart', 'uGatherEnd', 'uGatherSeconds', 'uGatherJitter', 'uStory', 'uStoryColor', 'uStoryFall', 'uStoryGlow', 'uStoryIntegrate',
    'uRipple', 'uRippleStrength', 'uRippleSpeed', 'uRippleSeconds']) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // ink over paper: overlapping dots darken
  gl.clearColor(0, 0, 0, 0);
}

// ---------- layout ----------

// CSS decides both ends of the scroll glide: #orb-slot in the hero (measured at scroll 0) and the
// fixed, invisible #orb-rest (its --rest-brightness sets how dim the orb gets behind the CV).
let dpr = 1, maxDpr = 2, cx = 0, cy = 0, radius = 100;
const hero = { x: 0, y: 0, r: 100 };
const rest = { x: 0, y: 0, r: 100, brightness: 1 };
const focusPose = { x: 0, y: 0, r: 100, brightness: 1 };
let heroSpan = 1;     // CSS px of scrolling over which the orb glides to its rest position
let recede = 0;       // 0 = in the hero, 1 = at rest behind the CV
let focusTarget = 0;  // 1 while something (e.g. a project pane) has the orb's attention
let focus = 0;        // eased towards focusTarget
let dim = 1;          // brightness multiplier from scrolling and focus

function measure(el, into, brightnessVar) {
  const r = el.getBoundingClientRect();
  into.x = (r.left + r.width / 2) * dpr;
  into.y = (r.top + r.height / 2) * dpr;
  into.r = (r.width / 2) * dpr;
  into.brightness = parseFloat(getComputedStyle(el).getPropertyValue(brightnessVar)) || into.brightness;
}

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  const box = slot.getBoundingClientRect();
  hero.x = (box.left + box.width / 2) * dpr;
  hero.y = (box.top + scrollY + box.height / 2) * dpr;
  hero.r = (box.width / 2) * dpr;
  if (restEl) measure(restEl, rest, '--rest-brightness');
  else Object.assign(rest, hero, { brightness: 1 });
  if (focusEl) measure(focusEl, focusPose, '--focus-brightness');
  else Object.assign(focusPose, rest);
  heroSpan = Math.max(1, heroEl.offsetHeight * 0.85);
  gl.viewport(0, 0, canvas.width, canvas.height);
  placeOrb();
}

function placeOrb() {
  const p = Math.min(1, Math.max(0, scrollY / heroSpan));
  recede = p * p * (3 - 2 * p);
  const heroY = hero.y - scrollY * dpr;
  cx = hero.x + (rest.x - hero.x) * recede;
  cy = heroY + (rest.y - heroY) * recede;
  radius = hero.r + (rest.r - hero.r) * recede;
  dim = 1 + (rest.brightness - 1) * recede;

  // Focus: glide to #orb-focus, swelling a little on the way like it's taking a breath.
  const f = focus * focus * (3 - 2 * focus);
  cx += (focusPose.x - cx) * f;
  cy += (focusPose.y - cy) * f;
  radius += (focusPose.r - radius) * f;
  radius *= 1 + 0.1 * 4 * f * (1 - f);
  dim += (focusPose.brightness - dim) * f;
}

// Glides the orb to its focus position (and draws in the falling dots), or back again.
export function setFocus(on) {
  focusTarget = on ? 1 : 0;
  if (on) gather();
  if (reducedMotion.matches) focus = focusTarget;
}

// ---------- pointer (smoothed so the pull eases in and out) ----------

const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false, strength: 0 };

function setPointer(e) {
  // Only pull when the pointer is over the orb's own canvas, not over text or controls.
  if (e.target !== canvas) { pointer.active = false; return; }
  pointer.tx = e.clientX;
  pointer.ty = e.clientY;
  if (!pointer.active && pointer.strength < 0.01) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
  pointer.active = true;
}

function overOrb(e) {
  return Math.hypot(e.clientX * dpr - cx, e.clientY * dpr - cy) < radius * 1.05;
}

addEventListener('pointermove', (e) => {
  setPointer(e);
  canvas.style.cursor = pointer.active && overOrb(e) ? 'pointer' : '';
});
addEventListener('pointerdown', (e) => {
  setPointer(e);
  if (pointer.active && overOrb(e)) {
    gather();
    // Lets the page react (e.g. glide down to the CV) when the ball is pressed in the hero.
    document.dispatchEvent(new CustomEvent('orb:pressed', { detail: { inHero: recede < 0.05 } }));
  }
});
addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pointer.active = false; });
addEventListener('pointercancel', () => { pointer.active = false; });
document.addEventListener('pointerleave', () => { pointer.active = false; });
addEventListener('blur', () => { pointer.active = false; });

// ---------- pressing the ball: draw in the falling dots, pause spawning ----------

// In flow-time units. Cycles starting within [start, end) are skipped; dots mid-fall at `start` are drawn in.
const gathering = { start: -1e9, end: -1e9 };

export function gather() {
  if (flowTime < gathering.end) {
    gathering.end = flowTime + CONFIG.respawnDelay;   // pressed again while paused: just extend the pause
  } else {
    gathering.start = flowTime;
    gathering.end = flowTime + CONFIG.respawnDelay;
  }
}

// ---------- story dots: CV entries dropping into the orb ----------

const storyData = new Float32Array(STORY_ENTRIES * 4);
const storyColors = new Float32Array(STORY_ENTRIES * 3);

function parseHex(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : null;
}

// Sends entry `entry`'s cluster of dots from a point on screen (CSS px) into the orb, once,
// in `color` (#rrggbb; defaults to the orb's own ink) which blends into the orb's ink.
export function dropFrom(entry, clientX, clientY, color) {
  if (!gl || entry < 0 || entry >= STORY_ENTRIES || storyData[entry * 4 + 3]) return;
  const now = performance.now() / 1000;
  // With reduced motion the dots simply appear in place, already settled.
  const start = reducedMotion.matches ? now - CONFIG.storyFallSeconds - 10 : now;
  storyData.set([clientX * dpr, clientY * dpr, start, 1], entry * 4);
  storyColors.set(parseHex(color) || CONFIG.color, entry * 3);

  // Each of its dots ripples the surface where it slots in (the shader's timing, in 32-bit floats).
  const t0 = storyData[entry * 4 + 2];
  for (let sub = 0; sub < STORY_DOTS; sub++) {
    const idx = entry * STORY_DOTS + sub;
    const time = t0 + sub * 0.18 + exact(idx, 0.618034) * 0.12 + Math.max(0.1, CONFIG.storyFallSeconds);
    scheduled.push({ dir: storySlots.subarray(idx * 4, idx * 4 + 3), time });
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

// Finds the flowing dots that slotted in between flow times prev and now, mirroring their cycle in the
// shader, and ripples from each. t is the frame's clock time, which ripples are timed in.
function flowLandings(prev, now, t) {
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

let last = performance.now() / 1000;
let breathPhase = 0;          // accumulated so changing breathSeconds never jumps
let voiceTime = 0;            // accumulated separately so changing voiceSpeed never jumps
let flowTime = 0;

function frame(nowMs) {
  const t = nowMs / 1000;
  const rawDt = t - last;
  const dt = Math.min(0.05, rawDt);
  last = t;

  adaptQuality(rawDt);
  updateVoice(t, dt);

  // Breathing: smooth in-and-out scale, gentler with reduced motion.
  breathPhase += (dt * Math.PI * 2) / CONFIG.breathSeconds;
  const depth = reducedMotion.matches ? CONFIG.breathDepth * 0.5 : CONFIG.breathDepth;
  const breath = 1 + depth * (0.5 - 0.5 * Math.cos(breathPhase));
  voiceTime += dt * CONFIG.voiceSpeed;
  const prevFlowTime = flowTime;
  flowTime += reducedMotion.matches ? dt * 0.5 : dt;
  flowLandings(prevFlowTime, flowTime, t);
  const energy = voice.energy * CONFIG.speech;

  const k = 1 - Math.exp(-dt * 12);
  pointer.x += (pointer.tx - pointer.x) * k;
  pointer.y += (pointer.ty - pointer.y) * k;
  pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * (1 - Math.exp(-dt * 6));

  // Focus eases at a steady pace (about 0.8 s end to end); placeOrb smooths the ends.
  focus = focusTarget > focus ? Math.min(focusTarget, focus + dt * 1.25) : Math.max(focusTarget, focus - dt * 1.25);
  placeOrb();
  if (haloEl) {
    // A 100px element, centred on the orb and scaled to 3.2 radii.
    haloEl.style.transform =
      `translate(${cx / dpr - 50}px, ${cy / dpr - 50}px) scale(${(radius / dpr) * 0.032})`;
    haloEl.style.opacity = ((0.6 + energy * 0.8) * dim).toFixed(3);
  }

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(uniforms.uTime, t);
  gl.uniform1f(uniforms.uBreath, breath);
  gl.uniform1f(uniforms.uTilt, CONFIG.tilt);
  gl.uniform1f(uniforms.uEnergy, energy);
  gl.uniform2f(uniforms.uCenter, cx, cy);
  gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
  gl.uniform1f(uniforms.uRadius, radius);
  gl.uniform2f(uniforms.uPointer, pointer.x * dpr, pointer.y * dpr);
  gl.uniform1f(uniforms.uPointerStrength, pointer.strength);
  gl.uniform1f(uniforms.uVoiceTime, voiceTime);
  gl.uniform1f(uniforms.uVoiceAmp, CONFIG.voiceAmplitude);
  gl.uniform1f(uniforms.uCamera, CONFIG.cameraDistance);
  gl.uniform1f(uniforms.uBrightness, CONFIG.brightness * dim);
  gl.uniform1f(uniforms.uPullRadius, CONFIG.pullRadius);
  gl.uniform1f(uniforms.uPullStrength, CONFIG.pullStrength);
  gl.uniform1f(uniforms.uDotSize, CONFIG.dotSize);
  gl.uniform1f(uniforms.uSquare, CONFIG.squareSize);
  gl.uniform1f(uniforms.uBurn, CONFIG.burn);
  gl.uniform3fv(uniforms.uBurnColor, CONFIG.burnColor);
  gl.uniform1f(uniforms.uPullGlow, CONFIG.pullGlow);
  gl.uniform1f(uniforms.uLooseSpread, CONFIG.looseSpread);
  gl.uniform1f(uniforms.uLooseDrift, CONFIG.looseDrift);
  gl.uniform1f(uniforms.uLooseVoice, CONFIG.looseVoice);
  gl.uniform1f(uniforms.uFlowTime, flowTime);
  gl.uniform1f(uniforms.uFlowSeconds, CONFIG.flowSeconds);
  gl.uniform1f(uniforms.uFlowLinger, CONFIG.flowLinger);
  gl.uniform1f(uniforms.uGravity, CONFIG.gravity);
  gl.uniform1f(uniforms.uLanding, CONFIG.landing);
  gl.uniform1f(uniforms.uFlowSwirl, CONFIG.flowSwirl);
  gl.uniform1f(uniforms.uSlotGlow, CONFIG.slotGlow);
  gl.uniform1f(uniforms.uAfterglow, Math.max(0.01, CONFIG.afterglowSeconds));
  gl.uniform1f(uniforms.uGatherStart, gathering.start);
  gl.uniform1f(uniforms.uGatherEnd, gathering.end);
  gl.uniform1f(uniforms.uGatherSeconds, Math.max(0.05, CONFIG.gatherSeconds));
  gl.uniform1f(uniforms.uGatherJitter, CONFIG.gatherJitter);
  gl.uniform4fv(uniforms.uStory, storyData);
  gl.uniform3fv(uniforms.uStoryColor, storyColors);
  gl.uniform1f(uniforms.uStoryFall, Math.max(0.1, CONFIG.storyFallSeconds));
  gl.uniform1f(uniforms.uStoryGlow, CONFIG.storyGlow);
  gl.uniform1f(uniforms.uStoryIntegrate, Math.max(0.05, CONFIG.storyIntegrateSeconds));
  gl.uniform4fv(uniforms.uRipple, ripples);
  gl.uniform1f(uniforms.uRippleStrength, CONFIG.rippleStrength);
  gl.uniform1f(uniforms.uRippleSpeed, CONFIG.rippleSpeed);
  gl.uniform1f(uniforms.uRippleSeconds, Math.max(0.1, CONFIG.rippleSeconds));
  gl.uniform3fv(uniforms.uColor, CONFIG.color);
  gl.drawArrays(gl.POINTS, 0, activeCount);

  requestAnimationFrame(frame);
}

// ---------- adaptive quality ----------
// Judged in 2-second windows. Below ~45 fps: draw fewer dots, then render at a lower pixel ratio.
// Every cut is an experiment: if the next window isn't faster, the device is frame-capped
// (e.g. battery saver at 30 fps) rather than overloaded, so the cut is undone and adapting stops.
// When it runs smoothly again, dots come back gradually, never above a count that proved too slow.

let quality;

function resetQuality() {
  quality = { frames: 0, time: 0, pending: null, blocked: false, goodWindows: 0, justRaised: false, ceiling: Infinity };
}
resetQuality();

function adaptQuality(rawDt) {
  if (document.hidden || rawDt > 0.25) {        // a pause (hidden tab, window switch), not slowness
    quality.frames = 0;
    quality.time = 0;
    return;
  }
  quality.frames++;
  quality.time += rawDt;
  if (quality.time < 2) return;
  const fps = quality.frames / quality.time;
  quality.frames = 0;
  quality.time = 0;

  if (quality.pending) {
    const before = quality.pending;
    quality.pending = null;
    if (fps < before.fps * 1.1) {
      activeCount = before.count;
      if (maxDpr !== before.dpr) { maxDpr = before.dpr; layout(); }
      quality.blocked = true;
    }
    return;
  }
  if (quality.blocked) return;

  if (fps < 45) {
    if (quality.justRaised) quality.ceiling = activeCount;    // the last increase was too much
    const before = { fps, count: activeCount, dpr: maxDpr };
    if (activeCount > CONFIG.minDotCount) {
      activeCount = Math.max(CONFIG.minDotCount, Math.round(activeCount * 0.75));
    } else if (maxDpr > 1) {
      maxDpr = Math.max(1, maxDpr - 0.5);
      layout();
    } else {
      return;
    }
    quality.pending = before;
    quality.goodWindows = 0;
    quality.justRaised = false;
    return;
  }

  quality.justRaised = false;
  if (fps > 56 && ++quality.goodWindows >= 3) {
    quality.goodWindows = 0;
    if (maxDpr < 2) {
      maxDpr = Math.min(2, maxDpr + 0.5);
      layout();
      quality.justRaised = true;
    } else {
      const next = Math.min(dotCount, quality.ceiling - 1, Math.round(activeCount * 1.15));
      if (next > activeCount) {
        activeCount = next;
        quality.justRaised = true;
      }
    }
  }
}

// ---------- start ----------

if (gl) {
  init();
  const resize = new ResizeObserver(layout);
  resize.observe(slot);
  resize.observe(document.body);   // content above the hero never changes, but fonts/layout shifts can
  if (restEl) resize.observe(restEl);
  if (focusEl) resize.observe(focusEl);
  addEventListener('resize', layout);
  layout();
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { init(); layout(); });
  requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has('tune')) import('./tune.js');
} else {
  document.documentElement.classList.add('no-webgl');
}

export { reducedMotion };

export function speakNow() {
  startBurst(performance.now() / 1000);
}

export function getStats() {
  return { drawn: activeCount, requested: dotCount };
}
