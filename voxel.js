// The voxel engine: draws a graphic made of thousands of small ink squares, each with a soft scorch
// ("burn") around it, as ink on the page's paper with WebGL, so all per-square work runs on the GPU.
// A graphic (graphics/*.js) brings its squares, its vertex shader and its settings; the engine does
// what they all share. It glides the graphic with the page from the hero (#voxel-slot) to where it
// rests once scrolled (#voxel-rest; on narrow screens a "horizon" on the bottom edge) or beside a
// project pane (#voxel-focus), lets CV entries send "story" squares into it (dropFrom), handles the
// pointer and presses, adapts the square count to the device and opens the ?tune panel.
//
// A graphic is an object with:
//   CONFIG      tunable values, read live every frame. Besides its own, it holds the shared ones the
//               engine reads: color, burnColor, dotSize, squareSize, burn, brightness, cameraDistance,
//               landing, slotGlow, afterglowSeconds, storyFallSeconds, storyGlow, storyIntegrateSeconds,
//               pullRadius, pullStrength, pullGlow, minDotCount.
//   attributes  [[name, size], ...] of its vertex data; build() returns that data, story squares first.
//   shader      its vertex shader, placed after the engine's shared GLSL (COMMON below). It ends by
//               calling emit(), and may use story() for the CV entries' squares.
//   frame(ctx)  per frame, before drawing: ctx = { t, dt, set(uniformName, value), activeCount }.
//   Optional: press(), focus(on), onDrop(entry, time), halo() (strength of the paper's scorch behind
//   it), pressDelay (seconds before the page glides to the CV after a press in the hero), and for the
//   tune panel sliders and actions.

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const canvas = document.getElementById('voxel-canvas');
const slot = document.getElementById('voxel-slot');
const restEl = document.getElementById('voxel-rest');
const focusEl = document.getElementById('voxel-focus');
const haloEl = document.getElementById('voxel-halo');
const paperFadeEl = document.getElementById('paper-fade');
const heroEl = slot.closest('header') || slot;
const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });

// Story squares: a small cluster per CV entry. Graphics keep them at the front of their data so
// they're always drawn.
export const STORY_ENTRIES = 12;
export const STORY_DOTS = 6;
export const STORY_TOTAL = STORY_ENTRIES * STORY_DOTS;

// The shaders' exact(): fract(x * m) in 32-bit floats, for timings JavaScript must predict.
export function exact(x, m) {
  const v = Math.fround(Math.fround(x) * Math.fround(m));
  return v - Math.floor(v);
}

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

// Shared GLSL at the top of every graphic's vertex shader. Positions are in "stage" units: the
// radius of the box the graphic is placed in, with y up and z toward the viewer.
const COMMON = `
precision highp float;
uniform float uTime, uCamera, uBrightness, uRadius, uDotSize, uSquare;
uniform vec2 uCenter, uResolution, uPointer;
uniform float uPointerStrength, uPullRadius, uPullStrength, uPullGlow;
uniform float uLanding, uSlotGlow, uAfterglow;
uniform vec4 uStory[${STORY_ENTRIES}];   // per CV entry: xy = start (device px), z = drop time, w = 1 once dropped
uniform vec3 uStoryColor[${STORY_ENTRIES}];
uniform float uStoryFall, uStoryGlow, uStoryIntegrate;
uniform float uClipY, uClipFade;         // the horizon: clipped squares fade out above uClipY (device px)
uniform vec3 uColor;

varying float vAlpha;
varying float vHalf;     // half-width of the solid square, in sprite units (sprite edge = 1)
varying float vPixel;    // one device pixel, in sprite units
varying vec3 vColor;

// Loose pseudo-random hash; GPUs disagree on its exact value, so it only drives looks. Anything
// JavaScript must predict (like when a square lands) uses exact() instead: simple float maths every
// GPU computes the same way as JavaScript's Math.fround.
float hash(float x) { return fract(sin(x) * 43758.5453); }
float exact(float x, float m) { return fract(x * m); }
vec2 rot(vec2 v, float a) { float c = cos(a), sn = sin(a); return vec2(c * v.x - sn * v.y, sn * v.x + c * v.y); }

// Travel progress (0 = start, 1 = in place) over normalised travel time u. Gravity g makes it
// accelerate (speed grows with closeness); the last share L of the time eases the speed back to
// zero so the square brakes into its place instead of slamming in.
float fallCurve(float u, float g, float L) {
  float w = u;
  if (L > 0.0 && u > 1.0 - L) {
    float x = (u - (1.0 - L)) / L;
    w = (1.0 - L) + L * (x + x * x - x * x * x);   // continuous speed at the join, zero at the end
  }
  return g < 0.01 ? w : (exp(g * w) - 1.0) / (exp(g) - 1.0);
}

// Slot-in: a dark flare of burn, then a softer afterglow, over seconds since landing.
float slotHeat(float landed) {
  return uSlotGlow * (0.65 * exp(-landed * 3.0) + 0.35 * (1.0 - smoothstep(0.0, uAfterglow, landed)));
}

${NOISE}

// Perspective projection of a stage point to device px; s is the perspective scale.
vec2 project(vec3 p, out float s) {
  s = uCamera / (uCamera - p.z);
  return uCenter + vec2(p.x, -p.y) * uRadius * s;
}

// Story square idx (0 .. ${STORY_TOTAL - 1}) of the CV entry idx / ${STORY_DOTS}. When the entry
// scrolls into view its squares leave the entry's marker in the entry's colour, fall into the
// graphic and, once landed, slowly take on the graphic's ink, staying a little stronger than the
// rest. Sets vColor. Returns true while falling, with fall progress (0 = at start, 1 = in place)
// and where the fall starts (device px); heat is the slot-in flare once landed; fade is 0 until
// the entry has been dropped.
bool story(float idx, out float fall, out vec2 start, out float heat, out float fade) {
  float entry = floor(idx / ${STORY_DOTS.toFixed(1)});
  float sub = idx - entry * ${STORY_DOTS.toFixed(1)};
  vec4 s = uStory[int(entry)];
  vColor = uStoryColor[int(entry)];
  float t = uTime - s.z - sub * 0.18 - exact(idx, 0.618034) * 0.12;
  start = s.xy + (vec2(hash(idx * 1.3), hash(idx * 2.9)) - 0.5) * uRadius * 0.08;
  fall = 1.0;
  heat = 0.0;
  fade = 1.0;
  if (s.w < 0.5 || t < 0.0) {
    fade = 0.0;
    return false;
  }
  if (t < uStoryFall) {
    float u = t / uStoryFall;
    fall = fallCurve(u, 3.0, uLanding);
    fade = smoothstep(0.0, 0.08, u);
    return true;
  }
  float landed = t - uStoryFall;
  heat = slotHeat(landed) + uStoryGlow;
  vColor = mix(vColor, uColor, smoothstep(0.4, 0.4 + uStoryIntegrate, landed));
  return false;
}

// Every graphic's vertex shader ends here: pointer pull, ink and size of the square, and the horizon.
//   screen, s  where it is (device px) and its perspective scale (from project())
//   depth      0 = far back (faint, small) .. 1 = front (dark, full size)
//   rim        extra ink where a surface turns away, so a silhouette reads (0 = none)
//   heat       slot-in flare: darker, with a wider burn
//   ink        multiplies the ink (fades, lighter parts); boost adds to it before clamping
//   size       multiplies the sprite
//   clip       false exempts it from the horizon's clip (story squares falling through it)
void emit(vec2 screen, float s, float depth, float rim, float heat, float ink, float boost, float size, bool clip) {
  // Pull toward the pointer, strongest for close squares at the front.
  vec2 toPointer = uPointer - screen;
  float w = 1.0 - clamp(length(toPointer) / (uRadius * uPullRadius), 0.0, 1.0);
  float influence = w * w * (3.0 - 2.0 * w) * (0.35 + 0.65 * depth) * uPointerStrength;
  screen += toPointer * influence * uPullStrength;
  float lift = influence * uPullGlow;

  // Front squares dark, back squares faint; the rim gets a little extra so the silhouette reads.
  vAlpha = (clamp(0.08 + 0.8 * pow(depth, 1.6) + 0.1 * rim * rim + lift * 0.6 + boost, 0.0, 1.0)
         + heat * (0.3 + 0.7 * depth)) * uBrightness * ink;
  // On the horizon, keep the text above it clear.
  if (clip) vAlpha *= smoothstep(uClipY - uClipFade, uClipY, screen.y);

  // Pull and heat widen the burn, not the square: the sprite grows and the square's share shrinks.
  float grow = 1.0 + lift * 0.8 + heat * 0.8;
  gl_PointSize = uDotSize * uRadius * 2.0 * s * (0.55 + 0.65 * depth) * grow * size;
  vHalf = uSquare / grow;
  vPixel = 2.0 / max(gl_PointSize, 1.0);
  gl_Position = vec4(screen / uResolution * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}
`;

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

let graphic = null, CONFIG = null;
let program, uniforms = {};
let stride = 0, dotCount = 0, activeCount = 0;

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function init() {
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, COMMON + graphic.shader));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  stride = graphic.attributes.reduce((sum, [, size]) => sum + size, 0);
  let offset = 0;
  for (const [name, size] of graphic.attributes) {
    const loc = gl.getAttribLocation(program, name);
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
    }
    offset += size;
  }
  rebuild();

  // Every uniform the program uses, by name (arrays without their "[0]").
  uniforms = {};
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const info = gl.getActiveUniform(program, i);
    uniforms[info.name.replace(/\[0\]$/, '')] = { loc: gl.getUniformLocation(program, info.name), type: info.type };
  }

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // ink over paper: overlapping squares darken
  gl.clearColor(0, 0, 0, 0);
}

// Sets a uniform by name; one the shader doesn't use is skipped.
function set(name, value) {
  const u = uniforms[name];
  if (!u) return;
  switch (u.type) {
    case gl.FLOAT: gl.uniform1f(u.loc, value); break;
    case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, value); break;
    case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, value); break;
    case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, value); break;
  }
}

// (Re)builds the graphic's squares. keepQuality keeps the adaptive quality's findings, for graphics
// that rebuild as part of their animation.
export function rebuild({ keepQuality = false } = {}) {
  const data = graphic.build();
  dotCount = data.length / stride;
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  if (keepQuality) activeCount = Math.min(activeCount || dotCount, dotCount);
  else {
    activeCount = dotCount;
    resetQuality();
  }
}

// ---------- layout ----------

// CSS decides both ends of the scroll glide: #voxel-slot in the hero (measured at scroll 0) and the
// fixed, invisible #voxel-rest (its --rest-brightness sets how faint the graphic gets behind the CV).
// On narrower screens #voxel-rest sits on the bottom edge as a horizon: its --horizon-clip (a share
// of the screen height) hides clipped squares above that line, a copy of the paper (#paper-fade)
// fades the text out just above it, and once settled the graphic is lifted above the text
// (html.horizon) so the text can't run over it.
let dpr = 1, maxDpr = 2, cx = 0, cy = 0, radius = 100;
const hero = { x: 0, y: 0, r: 100 };
const rest = { x: 0, y: 0, r: 100, brightness: 1, clip: 0 };
const focusPose = { x: 0, y: 0, r: 100, brightness: 1 };
let heroSpan = 1;     // CSS px of scrolling over which the graphic glides to its rest position
let recede = 0;       // 0 = in the hero, 1 = at rest
let focusTarget = 0;  // 1 while something (e.g. a project pane) has the graphic's attention
let focus = 0;        // eased towards focusTarget
let dim = 1;          // brightness multiplier from scrolling and focus
let clipY = 0;        // device px from the top: clipped squares above it fade out
let horizon = false;  // the graphic has settled on the horizon and sits above the text

// The canvas's own CSS size at the last layout. frame() re-runs layout() as soon as it changes: a
// phone's address bar can resize this fixed layer mid-scroll without a timely resize event.
const laidOut = { w: 0, h: 0 };

function measure(el, into, brightnessVar) {
  const r = el.getBoundingClientRect();
  into.x = (r.left + r.width / 2) * dpr;
  into.y = (r.top + r.height / 2) * dpr;
  into.r = (r.width / 2) * dpr;
  into.brightness = parseFloat(getComputedStyle(el).getPropertyValue(brightnessVar)) || into.brightness;
}

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  laidOut.w = canvas.clientWidth || innerWidth;
  laidOut.h = canvas.clientHeight || innerHeight;
  canvas.width = Math.round(laidOut.w * dpr);
  canvas.height = Math.round(laidOut.h * dpr);
  const box = slot.getBoundingClientRect();
  hero.x = (box.left + box.width / 2) * dpr;
  hero.y = (box.top + scrollY + box.height / 2) * dpr;
  hero.r = (box.width / 2) * dpr;
  if (restEl) {
    measure(restEl, rest, '--rest-brightness');
    rest.clip = parseFloat(getComputedStyle(restEl).getPropertyValue('--horizon-clip')) || 0;
  } else {
    Object.assign(rest, hero, { brightness: 1, clip: 0 });
  }
  if (focusEl) measure(focusEl, focusPose, '--focus-brightness');
  else Object.assign(focusPose, rest);
  heroSpan = Math.max(1, heroEl.offsetHeight * 0.85);
  gl.viewport(0, 0, canvas.width, canvas.height);
  place();
}

function place() {
  const p = Math.min(1, Math.max(0, scrollY / heroSpan));
  recede = p * p * (3 - 2 * p);
  const heroY = hero.y - scrollY * dpr;
  cx = hero.x + (rest.x - hero.x) * recede;
  cy = heroY + (rest.y - heroY) * recede;
  radius = hero.r + (rest.r - hero.r) * recede;
  dim = 1 + (rest.brightness - 1) * recede;

  // Focus: glide to #voxel-focus, swelling a little on the way like it's taking a breath.
  const f = focus * focus * (3 - 2 * focus);
  cx += (focusPose.x - cx) * f;
  cy += (focusPose.y - cy) * f;
  radius += (focusPose.r - radius) * f;
  radius *= 1 + 0.1 * 4 * f * (1 - f);
  dim += (focusPose.brightness - dim) * f;

  // The horizon's clip line comes down from the top of the screen as the graphic settles, and lifts
  // while it glides up to a project pane.
  clipY = rest.clip * recede * (1 - f) * canvas.height;
  const settled = rest.clip > 0 && recede > 0.999;
  if (settled !== horizon) {
    horizon = settled;
    document.documentElement.classList.toggle('horizon', horizon);
  }
  if (paperFadeEl) {
    const opacity = rest.clip > 0 ? recede.toFixed(3) : '0';
    if (paperFadeEl.style.opacity !== opacity) paperFadeEl.style.opacity = opacity;
  }
}

// Glides the graphic to its focus position, or back again.
export function setFocus(on) {
  focusTarget = on ? 1 : 0;
  graphic?.focus?.(on);
  if (reducedMotion.matches) focus = focusTarget;
}

// ---------- pointer (smoothed so the pull eases in and out) ----------

const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false, strength: 0 };

function setPointer(e) {
  // Only pull when the pointer is over the canvas itself, not over text or controls.
  if (e.target !== canvas) { pointer.active = false; return; }
  pointer.tx = e.clientX;
  pointer.ty = e.clientY;
  if (!pointer.active && pointer.strength < 0.01) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
  pointer.active = true;
}

function overGraphic(e) {
  return Math.hypot(e.clientX * dpr - cx, e.clientY * dpr - cy) < radius * 1.05;
}

function listen() {
  addEventListener('pointermove', (e) => {
    setPointer(e);
    canvas.style.cursor = pointer.active && overGraphic(e) ? 'pointer' : '';
  });
  addEventListener('pointerdown', (e) => {
    setPointer(e);
    if (pointer.active && overGraphic(e)) {
      graphic.press?.();
      // Lets the page react (e.g. glide down to the CV) when the graphic is pressed in the hero.
      document.dispatchEvent(new CustomEvent('voxel:pressed', {
        detail: { inHero: recede < 0.05, delay: graphic.pressDelay ?? 0.5 },
      }));
    }
  });
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pointer.active = false; });
  addEventListener('pointercancel', () => { pointer.active = false; });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
  addEventListener('blur', () => { pointer.active = false; });
}

// ---------- story squares: CV entries dropping into the graphic ----------

const storyData = new Float32Array(STORY_ENTRIES * 4);
const storyColors = new Float32Array(STORY_ENTRIES * 3);

function parseHex(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : null;
}

// Sends entry `entry`'s cluster of squares from a point on screen (CSS px) into the graphic, once,
// in `color` (#rrggbb; defaults to the graphic's own ink) which blends into its ink.
export function dropFrom(entry, clientX, clientY, color) {
  if (!graphic || !gl || entry < 0 || entry >= STORY_ENTRIES || storyData[entry * 4 + 3]) return;
  const now = performance.now() / 1000;
  // With reduced motion the squares simply appear in place, already settled.
  const start = reducedMotion.matches ? now - CONFIG.storyFallSeconds - 10 : now;
  storyData.set([clientX * dpr, clientY * dpr, start, 1], entry * 4);
  storyColors.set(parseHex(color) || CONFIG.color, entry * 3);
  graphic.onDrop?.(entry, storyData[entry * 4 + 2]);
}

// ---------- frame ----------

let last = performance.now() / 1000;

function frame(nowMs) {
  const t = nowMs / 1000;
  const rawDt = t - last;
  const dt = Math.min(0.05, rawDt);
  last = t;

  if (canvas.clientWidth && (canvas.clientWidth !== laidOut.w || canvas.clientHeight !== laidOut.h)) layout();
  adaptQuality(rawDt);
  graphic.frame({ t, dt, set, activeCount });

  const k = 1 - Math.exp(-dt * 12);
  pointer.x += (pointer.tx - pointer.x) * k;
  pointer.y += (pointer.ty - pointer.y) * k;
  pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * (1 - Math.exp(-dt * 6));

  // Focus eases at a steady pace (about 0.8 s end to end); place() smooths the ends.
  focus = focusTarget > focus ? Math.min(focusTarget, focus + dt * 1.25) : Math.max(focusTarget, focus - dt * 1.25);
  place();
  if (haloEl) {
    // A 100px element, centred on the graphic and scaled to 3.2 radii.
    haloEl.style.transform =
      `translate(${cx / dpr - 50}px, ${cy / dpr - 50}px) scale(${(radius / dpr) * 0.032})`;
    haloEl.style.opacity = ((graphic.halo?.() ?? 0.6) * dim).toFixed(3);
  }

  gl.clear(gl.COLOR_BUFFER_BIT);
  set('uTime', t);
  set('uCenter', [cx, cy]);
  set('uResolution', [canvas.width, canvas.height]);
  set('uRadius', radius);
  set('uPointer', [pointer.x * dpr, pointer.y * dpr]);
  set('uPointerStrength', pointer.strength);
  set('uCamera', CONFIG.cameraDistance);
  set('uBrightness', CONFIG.brightness * dim);
  set('uPullRadius', CONFIG.pullRadius);
  set('uPullStrength', CONFIG.pullStrength);
  set('uPullGlow', CONFIG.pullGlow);
  set('uDotSize', CONFIG.dotSize);
  set('uSquare', CONFIG.squareSize);
  set('uBurn', CONFIG.burn);
  set('uBurnColor', CONFIG.burnColor);
  set('uColor', CONFIG.color);
  set('uLanding', CONFIG.landing);
  set('uSlotGlow', CONFIG.slotGlow);
  set('uAfterglow', Math.max(0.01, CONFIG.afterglowSeconds));
  set('uStory', storyData);
  set('uStoryColor', storyColors);
  set('uStoryFall', Math.max(0.1, CONFIG.storyFallSeconds));
  set('uStoryGlow', CONFIG.storyGlow);
  set('uStoryIntegrate', Math.max(0.05, CONFIG.storyIntegrateSeconds));
  set('uClipY', clipY);
  set('uClipFade', canvas.height * 0.1);
  gl.drawArrays(gl.POINTS, 0, activeCount);

  requestAnimationFrame(frame);
}

// ---------- adaptive quality ----------
// Judged in 2-second windows. Below ~45 fps: draw fewer squares, then render at a lower pixel ratio.
// Every cut is an experiment: if the next window isn't faster, the device is frame-capped
// (e.g. battery saver at 30 fps) rather than overloaded, so the cut is undone and adapting stops.
// When it runs smoothly again, squares come back gradually, never above a count that proved too slow.
// Graphics shuffle their data (story squares first), so drawing only the first k still looks whole.

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
      activeCount = Math.min(before.count, dotCount);
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

// Starts drawing graphic g (a graphics/*.js default export).
export function start(g) {
  graphic = g;
  CONFIG = g.CONFIG;
  if (!gl) {
    document.documentElement.classList.add('no-webgl');
    return;
  }
  init();
  listen();
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
}

// The graphic being drawn, for the tune panel.
export function current() {
  return graphic;
}

export function getStats() {
  return { drawn: activeCount, requested: dotCount };
}
