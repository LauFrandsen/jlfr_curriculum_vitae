// The voxel engine: draws graphics made of thousands of small ink squares, each with a soft scorch
// ("burn") around it, as ink on the page's paper with WebGL, so all per-square work runs on the GPU.
// A graphic (graphics/*.js) brings its squares, its vertex shader and its settings; the engine does
// what they all share. It glides the graphic with the page from the hero (#voxel-slot) to where it
// rests once scrolled (#voxel-rest; on narrow screens a "horizon" on the bottom edge) or beside a
// project pane (#voxel-focus), lets CV entries send "story" squares into it (dropFrom), handles the
// pointer and presses, adapts the square count to the device and opens the ?tune panel. Every few
// minutes it morphs into the next graphic: the squares fly from where they sit in one to where they
// sit in the other (morphTo).
//
// A graphic is an object with:
//   name        its name; <html data-graphic> is set to it, so the CSS can place it its own way.
//   CONFIG      tunable values, read live every frame. Besides its own, it holds the shared ones the
//               engine reads: color, burnColor, dotSize, squareSize, burn, brightness, cameraDistance,
//               landing, slotGlow, afterglowSeconds, storyFallSeconds, storyGlow, storyIntegrateSeconds,
//               pullRadius, pullStrength, pullGlow, minDotCount.
//   attributes  [[name, size], ...] of its vertex data; build() returns that data, story squares first.
//   shader      its vertex shader, placed after the engine's shared GLSL (COMMON below). It ends by
//               calling emit(), and may use story() for the CV entries' squares.
//   frame(ctx)  per frame, before drawing: ctx = { t, dt, set(uniformName, value), activeCount }.
//   pose(t)     where its visible squares are at engine time t, for morphing: a Float32Array of
//               POSE numbers per square: x, y, z (stage units, as passed to project()), depth, and
//               the ink, size and boost it passes to emit().
//   Optional: settle() (put itself in its finished state before it's morphed into, e.g. fully grown),
//   press(), focus(on), onDrop(entry, time), halo() (strength of the paper's scorch behind it),
//   pressDelay (seconds before the page glides to the CV after a press in the hero), over(at) and
//   tap(at) for targets of its own (at = a point on the canvas in device px; over says whether one is
//   there, tap handles a tap and returns true if it hit one), and for the tune panel sliders and actions.

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

// Numbers per square in a graphic's pose(): x, y, z, depth, ink, size, boost.
export const POSE = 7;

// The morph from one graphic to the next, in seconds: the old one fades into the travelling squares,
// each square sets off within SPREAD (bottom first) and travels for TRAVEL, and the new one fades in
// under the landed squares at the end.
const MORPH = { seconds: 7, fade: 0.5, spread: 1.6, travel: 4 };

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

// Shared GLSL at the top of every vertex shader. Positions are in "stage" units: the radius of the
// box the graphic is placed in, with y up and z toward the viewer.
const COMMON = `
precision highp float;
uniform float uTime, uCamera, uBrightness, uRadius, uDotSize, uSquare, uFade;
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
  // Its entry's data, picked with a constant-index loop: some phone GPUs get uniform arrays indexed
  // with a per-square value wrong.
  vec4 s = vec4(0.0);
  vColor = uColor;
  for (int i = 0; i < ${STORY_ENTRIES}; i++) {
    if (float(i) == entry) {
      s = uStory[i];
      vColor = uStoryColor[i];
    }
  }
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

// Every vertex shader ends here: pointer pull, ink and size of the square, and the horizon.
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
         + heat * (0.3 + 0.7 * depth)) * uBrightness * ink * uFade;
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

// The morph between two graphics: each square flies from where it sat in the old one to where it
// sits in the new one, bowing outward and swirling a little around the middle on the way, and lands
// with a soft flare. Squares with no place in the new one leave off the nearer side of the screen,
// and squares the new one needs beyond the old one's come in from it, level with where they go.
const MORPH_SHADER = `
attribute vec4 aFrom;   // where it starts: x, y, z (stage units), depth there
attribute vec4 aTo;     // where it ends, the same
attribute vec4 aLook;   // ink at the start and end, size at the start and end
attribute vec4 aMore;   // boost at the start and end; when it sets off (s); kind + random * 0.9
                        // (kind: 0 = moves, 1 = comes in from the side, 2 = leaves to the side)

uniform float uMorph, uTravel;   // seconds since the morph began; each square's travel time

// Just off the nearer side of the screen, level with p (device px).
vec2 offSide(vec2 p, float r) {
  float margin = uDotSize * uRadius * 2.0 + fract(r * 3.7) * uRadius * 0.3;
  return vec2(p.x < uCenter.x ? -margin : uResolution.x + margin, p.y + (fract(r * 7.3) - 0.5) * uRadius * 0.2);
}

void main() {
  float kind = floor(aMore.w), r = fract(aMore.w) / 0.9;
  vColor = uColor;
  float u = clamp((uMorph - aMore.z) / uTravel, 0.0, 1.0);
  float e = u * u * (3.0 - 2.0 * u);
  float s0, s1;
  vec2 a = project(aFrom.xyz, s0), b = project(aTo.xyz, s1);
  vec2 screen;
  float s;
  if (kind < 0.5) {
    float bow = sin(3.14159 * e);
    vec3 p = mix(aFrom.xyz, aTo.xyz, e);
    vec2 out2 = p.xy / max(length(p.xy), 0.05);
    p.xy = rot(p.xy + out2 * bow * 0.16 * (0.5 + r), bow * 0.45 * (fract(r * 5.1) < 0.5 ? 1.0 : -1.0));
    p.z += bow * 0.2 * (fract(r * 3.1) - 0.5);
    screen = project(p, s);
  } else if (kind < 1.5) {
    screen = mix(offSide(b, r), b, e);
    s = mix(1.0, s1, e);
  } else {
    screen = mix(a, offSide(a, r), e);
    s = mix(s0, 1.0, e);
  }
  float fade = kind < 0.5 ? 1.0 : kind < 1.5 ? smoothstep(0.0, 0.15, u) : 1.0 - smoothstep(0.85, 1.0, u);
  float heat = kind < 1.5 && u >= 1.0 ? slotHeat(uMorph - aMore.z - uTravel) * 0.35 : 0.0;
  emit(screen, s, mix(aFrom.w, aTo.w, e), 0.0, heat, mix(aLook.x, aLook.y, e) * fade,
       mix(aMore.x, aMore.y, e), mix(aLook.z, aLook.w, e), true);
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

// ---------- programs and layers ----------

// A drawable set of squares: a program, its data and how the data is laid out.
function makeLayer(shader, attributes) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, COMMON + shader));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  const stride = attributes.reduce((sum, [, size]) => sum + size, 0);
  let offset = 0;
  const attribs = attributes.map(([name, size]) => {
    const a = { loc: gl.getAttribLocation(program, name), size, offset };
    offset += size;
    return a;
  });
  // Every uniform the program uses, by name (arrays without their "[0]").
  const uniforms = {};
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const info = gl.getActiveUniform(program, i);
    uniforms[info.name.replace(/\[0\]$/, '')] = { loc: gl.getUniformLocation(program, info.name), type: info.type };
  }
  return { program, uniforms, attribs, stride, buffer: gl.createBuffer(), count: 0 };
}

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function upload(layer, data) {
  gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  layer.count = data.length / layer.stride;
}

let enabledAttribs = 0;   // how many vertex attribute arrays are switched on

// Makes layer's program current, with its data attached to its attributes.
function use(layer) {
  gl.useProgram(layer.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);
  for (let i = 0; i < enabledAttribs; i++) gl.disableVertexAttribArray(i);
  enabledAttribs = 0;
  for (const a of layer.attribs) {
    if (a.loc < 0) continue;
    gl.enableVertexAttribArray(a.loc);
    gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, layer.stride * 4, a.offset * 4);
    enabledAttribs = Math.max(enabledAttribs, a.loc + 1);
  }
}

// Sets a uniform of the current layer by name; one its shader doesn't use is skipped.
let using = null;
function set(name, value) {
  const u = using?.uniforms[name];
  if (!u) return;
  switch (u.type) {
    case gl.FLOAT: gl.uniform1f(u.loc, value); break;
    case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, value); break;
    case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, value); break;
    case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, value); break;
  }
}

// Each graphic that has been shown gets a layer, kept for when it comes round again.
const layers = new Map();   // graphic → layer
let shown = null;           // the layer of the graphic being shown
let morph = null;           // the morph under way, if any: { from, to, layer, start, restFrom, restTo }
let rotation = null;        // { every, next, since, upcoming }: morph to next() every `every` seconds

function layerFor(graphic) {
  let layer = layers.get(graphic);
  if (!layer) {
    layer = makeLayer(graphic.shader, graphic.attributes);
    layer.graphic = graphic;
    upload(layer, graphic.build());
    layers.set(graphic, layer);
  }
  return layer;
}

// The layer whose graphic's frame() is running, if any.
let framing = null;

// (Re)builds a graphic's squares: `graphic`'s if given (if it has been shown; otherwise it's built when
// it is), from within a frame() that graphic's, otherwise the one being shown. keepQuality keeps the
// adaptive quality's findings, for graphics that rebuild as they animate.
export function rebuild({ keepQuality = false, graphic = null } = {}) {
  const layer = graphic ? layers.get(graphic) : framing ?? shown;
  if (!layer) return;
  upload(layer, layer.graphic.build());
  if (layer === framing) use(layer);
  if (!keepQuality && layer === shown) resetQuality();
}

// Orders items so that any first share of them is spread evenly over where they sit (at(item) gives a
// point, in stage units): an item comes early only if no earlier one lies within a distance that
// shrinks step by step (blue noise), so the order fills in coarse to fine. Drawing only the first part
// of a graphic on a slow device then thins it evenly instead of leaving holes and clumps.
export function evenOrder(items, at) {
  const left = items.slice();
  for (let i = left.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [left[i], left[j]] = [left[j], left[i]];
  }
  const out = [], placed = [];
  for (let r = 0.5; left.length && r > 0.008; r /= Math.SQRT2) {
    // The items placed so far, in cells of size r, so only neighbouring cells need checking.
    const cells = new Map();
    const cellOf = (p) => [Math.floor(p[0] / r), Math.floor(p[1] / r), Math.floor(p[2] / r)];
    const key = (x, y, z) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
    const add = (p) => {
      const [x, y, z] = cellOf(p);
      const k = key(x, y, z);
      if (cells.has(k)) cells.get(k).push(p);
      else cells.set(k, [p]);
    };
    placed.forEach(add);
    for (let i = 0; i < left.length; ) {
      const p = at(left[i]);
      const [x, y, z] = cellOf(p);
      let near = false;
      for (let dx = -1; dx <= 1 && !near; dx++) {
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dz = -1; dz <= 1 && !near; dz++) {
            for (const q of cells.get(key(x + dx, y + dy, z + dz)) ?? []) {
              if ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 < r * r) { near = true; break; }
            }
          }
        }
      }
      if (near) {
        i++;
      } else {
        add(p);
        placed.push(p);
        out.push(left[i]);
        left[i] = left[left.length - 1];
        left.pop();
      }
    }
  }
  return out.concat(left);
}

// ---------- layout ----------

// CSS decides both ends of the scroll glide: #voxel-slot in the hero (measured at scroll 0) and the
// fixed, invisible #voxel-rest (its --rest-brightness sets how faint the graphic gets behind the CV).
// On narrower screens #voxel-rest sits on the bottom edge as a horizon: its --horizon-clip (a share
// of the screen height) hides clipped squares above that line, a copy of the paper (#paper-fade)
// fades the text out just above it, and once settled the graphic is lifted above the text
// (html.horizon) so the text can't run over it. During a morph the rest position moves from the old
// graphic's to the new one's.
let dpr = 1, maxDpr = 2, cx = 0, cy = 0, radius = 100;
const hero = { x: 0, y: 0, r: 100 };
let rest = { x: 0, y: 0, r: 100, brightness: 1, clip: 0 };
const focusPose = { x: 0, y: 0, r: 100, brightness: 1 };
let heroSpan = 1;     // CSS px of scrolling over which the graphic glides to its rest position
let heroClear = Infinity;   // device px from the graphic's centre in the hero down to [data-voxel-clear]
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

function measureRest(into) {
  if (restEl) {
    measure(restEl, into, '--rest-brightness');
    into.clip = parseFloat(getComputedStyle(restEl).getPropertyValue('--horizon-clip')) || 0;
  } else {
    Object.assign(into, hero, { brightness: 1, clip: 0 });
  }
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
  if (morph) {
    // The CSS now places the new graphic; the old one's rest was measured at the morph's start.
    measureRest(morph.restTo);
  } else {
    measureRest(rest);
  }
  if (focusEl) measure(focusEl, focusPose, '--focus-brightness');
  else Object.assign(focusPose, rest);
  heroSpan = Math.max(1, heroEl.offsetHeight * 0.85);
  // What the graphic should keep clear of in the hero (the text under it), for graphics that reach out.
  const clearEl = document.querySelector('[data-voxel-clear]');
  heroClear = clearEl ? (clearEl.getBoundingClientRect().top + scrollY) * dpr - hero.y : Infinity;
  gl.viewport(0, 0, canvas.width, canvas.height);
  place();
}

const smoothstep = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const mixRest = (a, b, k) => Object.fromEntries(Object.keys(a).map((key) => [key, a[key] + (b[key] - a[key]) * k]));

function place() {
  const at = morph ? mixRest(morph.restFrom, morph.restTo, smoothstep((last - morph.start) / MORPH.seconds)) : rest;
  const p = Math.min(1, Math.max(0, scrollY / heroSpan));
  recede = p * p * (3 - 2 * p);
  const heroY = hero.y - scrollY * dpr;
  cx = hero.x + (at.x - hero.x) * recede;
  cy = heroY + (at.y - heroY) * recede;
  radius = hero.r + (at.r - hero.r) * recede;
  dim = 1 + (at.brightness - 1) * recede;

  // Focus: glide to #voxel-focus, swelling a little on the way like it's taking a breath.
  const f = focus * focus * (3 - 2 * focus);
  cx += (focusPose.x - cx) * f;
  cy += (focusPose.y - cy) * f;
  radius += (focusPose.r - radius) * f;
  radius *= 1 + 0.1 * 4 * f * (1 - f);
  dim += (focusPose.brightness - dim) * f;

  // The horizon's clip line comes down from the top of the screen as the graphic settles, and lifts
  // while it glides up to a project pane.
  clipY = at.clip * recede * (1 - f) * canvas.height;
  const settled = at.clip > 0 && recede > 0.999;
  if (settled !== horizon) {
    horizon = settled;
    document.documentElement.classList.toggle('horizon', horizon);
  }
  if (paperFadeEl) {
    const opacity = at.clip > 0 ? recede.toFixed(3) : '0';
    if (paperFadeEl.style.opacity !== opacity) paperFadeEl.style.opacity = opacity;
  }
}

// Glides the graphic to its focus position, or back again.
export function setFocus(on) {
  focusTarget = on ? 1 : 0;
  shown?.graphic.focus?.(on);
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

// A pointer's place on the canvas, in device px, for a graphic's own targets (graphic.over / tap).
const onCanvas = (e) => ({ x: e.clientX * dpr, y: e.clientY * dpr });

function listen() {
  addEventListener('pointermove', (e) => {
    setPointer(e);
    const own = !morph && shown.graphic.over?.(onCanvas(e));
    canvas.style.cursor = pointer.active && (own || overGraphic(e)) ? 'pointer' : '';
  });
  addEventListener('pointerdown', (e) => {
    setPointer(e);
    // A tap on one of the graphic's own targets (like a satellite) is the graphic's alone.
    if (pointer.active && !morph && shown.graphic.tap?.(onCanvas(e))) return;
    if (pointer.active && overGraphic(e)) {
      if (!morph) shown.graphic.press?.();
      // Lets the page react (e.g. glide down to the CV) when the graphic is pressed in the hero.
      document.dispatchEvent(new CustomEvent('voxel:pressed', {
        detail: { inHero: recede < 0.05, delay: morph ? 0.5 : shown.graphic.pressDelay ?? 0.5 },
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
  if (!shown || entry < 0 || entry >= STORY_ENTRIES || storyData[entry * 4 + 3]) return;
  const config = shown.graphic.CONFIG;
  const now = performance.now() / 1000;
  // With reduced motion the squares simply appear in place, already settled.
  const start = reducedMotion.matches ? now - config.storyFallSeconds - 10 : now;
  storyData.set([clientX * dpr, clientY * dpr, start, 1], entry * 4);
  storyColors.set(parseHex(color) || config.color, entry * 3);
  shown.graphic.onDrop?.(entry, storyData[entry * 4 + 2]);
}

// Whether CV entry `entry`'s squares have landed, for poses.
export function storyLanded(entry) {
  const config = shown?.graphic.CONFIG;
  return !!storyData[entry * 4 + 3] && performance.now() / 1000 - storyData[entry * 4 + 2] > (config?.storyFallSeconds ?? 2.4) + 1;
}

// ---------- morphing from one graphic to the next ----------

// The order in which a pose's squares are paired: bands from the bottom up, each band left to right,
// so squares in the same part of one graphic go to the same part of the other.
function spatialOrder(pose) {
  const n = pose.length / POSE;
  const byHeight = Array.from({ length: n }, (_, i) => i).sort((a, b) => pose[a * POSE + 1] - pose[b * POSE + 1]);
  const bands = Math.max(1, Math.round(Math.sqrt(n)));
  const order = [];
  for (let b = 0; b < bands; b++) {
    const band = byHeight.slice(Math.floor((b * n) / bands), Math.floor(((b + 1) * n) / bands));
    band.sort((x, y) => pose[x * POSE] - pose[y * POSE]);
    for (const i of band) order.push(i);
  }
  return order;
}

// The morph's squares: every square of the smaller pose paired with one spread evenly over the
// larger pose's order; the larger pose's other squares come in from, or leave to, the side. Each sets
// off by its height, bottom first. Ordered evenly by where they end up (or, leaving, where they start),
// so drawing only the first k still looks whole.
function morphData(from, to) {
  const a = spatialOrder(from), b = spatialOrder(to);
  const squares = [];
  const put = (i, j, kind, rank) => {
    const p = kind === 1 ? to : from, q = kind === 2 ? from : to;
    const pi = (kind === 1 ? j : i) * POSE, qi = (kind === 2 ? i : j) * POSE;
    const r = Math.random();
    squares.push([
      p[pi], p[pi + 1], p[pi + 2], p[pi + 3],
      q[qi], q[qi + 1], q[qi + 2], q[qi + 3],
      p[pi + 4], q[qi + 4], p[pi + 5], q[qi + 5],
      p[pi + 6], q[qi + 6], rank * MORPH.spread + r * 0.3, kind + r * 0.9,
    ]);
  };
  const [large, small] = a.length >= b.length ? [a, b] : [b, a];
  const paired = new Uint8Array(large.length);
  small.forEach((s, k) => {
    const l = Math.min(large.length - 1, Math.floor(((k + 0.5) * large.length) / small.length));
    paired[l] = 1;
    if (large === a) put(a[l], s, 0, k / small.length);
    else put(s, b[l], 0, l / large.length);
  });
  large.forEach((l, k) => {
    if (paired[k]) return;
    if (large === a) put(l, 0, 2, k / large.length);
    else put(0, l, 1, k / large.length);
  });
  const ordered = evenOrder(squares, (s) => (Math.floor(s[15]) === 2 ? s : s.slice(4, 7)));
  const data = new Float32Array(ordered.length * 16);
  ordered.forEach((s, k) => data.set(s, k * 16));
  return data;
}

let morphLayer = null;

// Morphs from the graphic being shown into graphic g.
export function morphTo(g) {
  if (!gl || !shown || morph || g === shown.graphic) return;
  const to = layerFor(g);
  g.settle?.();
  const restFrom = { ...rest };
  document.documentElement.dataset.graphic = g.name;
  const restTo = { ...rest };
  measureRest(restTo);
  morphLayer ??= makeLayer(MORPH_SHADER, [['aFrom', 4], ['aTo', 4], ['aLook', 4], ['aMore', 4]]);
  upload(morphLayer, morphData(shown.graphic.pose(last), g.pose(last + MORPH.seconds)));
  morph = { from: shown, to, start: last, restFrom, restTo };
}

// Morphs into the next graphic of the rotation now.
export async function next() {
  if (!rotation || morph || rotation.loading) return;
  rotation.loading = true;
  try {
    rotation.upcoming ??= rotation.next();
    const g = await rotation.upcoming;
    rotation.upcoming = null;
    rotation.since = 0;
    morphTo(g);
  } finally {
    rotation.loading = false;
  }
}

function finishMorph() {
  shown = morph.to;
  rest = morph.restTo;
  morph = null;
  resetQuality();
  document.dispatchEvent(new CustomEvent('voxel:graphic', { detail: { name: shown.graphic.name } }));
}

// ---------- frame ----------

let last = performance.now() / 1000;

// The shared uniforms, from a graphic's CONFIG (or, during a morph, from both, blended by k).
function setShared(config, fade, other = config, k = 0) {
  const mix = (key) => config[key] + (other[key] - config[key]) * k;
  const mix3 = (key) => config[key].map((v, i) => v + (other[key][i] - v) * k);
  set('uTime', last);
  set('uFade', fade);
  set('uCenter', [cx, cy]);
  set('uResolution', [canvas.width, canvas.height]);
  set('uRadius', radius);
  set('uPointer', [pointer.x * dpr, pointer.y * dpr]);
  set('uPointerStrength', pointer.strength);
  set('uCamera', mix('cameraDistance'));
  set('uBrightness', mix('brightness') * dim);
  set('uPullRadius', mix('pullRadius'));
  set('uPullStrength', mix('pullStrength'));
  set('uPullGlow', mix('pullGlow'));
  set('uDotSize', mix('dotSize'));
  set('uSquare', mix('squareSize'));
  set('uBurn', mix('burn'));
  set('uBurnColor', mix3('burnColor'));
  set('uColor', mix3('color'));
  set('uLanding', mix('landing'));
  set('uSlotGlow', mix('slotGlow'));
  set('uAfterglow', Math.max(0.01, mix('afterglowSeconds')));
  set('uStory', storyData);
  set('uStoryColor', storyColors);
  set('uStoryFall', Math.max(0.1, mix('storyFallSeconds')));
  set('uStoryGlow', mix('storyGlow'));
  set('uStoryIntegrate', Math.max(0.05, mix('storyIntegrateSeconds')));
  set('uClipY', clipY);
  set('uClipFade', canvas.height * 0.1);
}

function drawGraphic(layer, fade, t, dt) {
  use(layer);
  using = layer;
  framing = layer;
  layer.graphic.frame({ t, dt, set, activeCount: activeOf(layer) });
  framing = null;
  setShared(layer.graphic.CONFIG, fade);
  gl.drawArrays(gl.POINTS, 0, activeOf(layer));
}

function frame(nowMs) {
  const t = nowMs / 1000;
  const rawDt = t - last;
  const dt = Math.min(0.05, rawDt);
  last = t;

  if (canvas.clientWidth && (canvas.clientWidth !== laidOut.w || canvas.clientHeight !== laidOut.h)) layout();
  adaptQuality(rawDt);

  // Rotation: after `every` seconds of the page on screen, morph into the next graphic (fetched a
  // little ahead, so it's ready).
  if (rotation && !morph && !reducedMotion.matches) {
    rotation.since += dt;
    if (rotation.since > rotation.every - 10) rotation.upcoming ??= rotation.next();
    if (rotation.since >= rotation.every) next();
  }

  const k = 1 - Math.exp(-dt * 12);
  pointer.x += (pointer.tx - pointer.x) * k;
  pointer.y += (pointer.ty - pointer.y) * k;
  pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * (1 - Math.exp(-dt * 6));

  // Focus eases at a steady pace (about 0.8 s end to end); place() smooths the ends.
  focus = focusTarget > focus ? Math.min(focusTarget, focus + dt * 1.25) : Math.max(focusTarget, focus - dt * 1.25);
  place();

  gl.clear(gl.COLOR_BUFFER_BIT);
  let halo;
  if (morph) {
    const since = t - morph.start;
    const blend = smoothstep(since / MORPH.seconds);
    const fadeIn = smoothstep(since / MORPH.fade);
    const fadeOut = 1 - smoothstep((since - (MORPH.seconds - MORPH.fade)) / MORPH.fade);
    // The old graphic fades into the travelling squares, and the new one fades in under them as they land.
    if (fadeIn < 1) drawGraphic(morph.from, 1 - fadeIn, t, dt);
    use(morphLayer);
    using = morphLayer;
    setShared(morph.from.graphic.CONFIG, Math.min(fadeIn, fadeOut), morph.to.graphic.CONFIG, blend);
    set('uMorph', since);
    set('uTravel', MORPH.travel);
    gl.drawArrays(gl.POINTS, 0, activeOf(morphLayer));
    if (fadeOut < 1) drawGraphic(morph.to, 1 - fadeOut, t, dt);
    const h0 = morph.from.graphic.halo?.() ?? 0.6, h1 = morph.to.graphic.halo?.() ?? 0.6;
    halo = h0 + (h1 - h0) * blend;
    if (since >= MORPH.seconds) finishMorph();
  } else {
    drawGraphic(shown, 1, t, dt);
    halo = shown.graphic.halo?.() ?? 0.6;
  }

  if (haloEl) {
    // A 100px element, centred on the graphic and scaled to 3.2 radii.
    haloEl.style.transform =
      `translate(${cx / dpr - 50}px, ${cy / dpr - 50}px) scale(${(radius / dpr) * 0.032})`;
    haloEl.style.opacity = (halo * dim).toFixed(3);
  }
  requestAnimationFrame(frame);
}

// ---------- adaptive quality ----------
// Judged in 2-second windows. Below ~45 fps: render at a slightly lower pixel ratio first (hardly
// visible on a phone's dense screen, and the squares' burn makes every pixel count), then draw fewer
// squares, then the lowest pixel ratio. Every cut is an experiment: if the next window isn't faster,
// the device is frame-capped (e.g. battery saver at 30 fps) rather than overloaded, so the cut is
// undone and adapting stops. When it runs smoothly again, quality comes back step by step in reverse,
// never up to a step that proved too slow. The share of squares applies to every layer; layers order
// their data evenly (evenOrder; graphics keep story squares first), so drawing only the first part
// thins them evenly instead of leaving holes.

let detail = 1;       // share of each layer's squares drawn
let quality;
const SHARP = 2, SOFT = 1.5, SOFTEST = 1;   // the pixel ratios it steps between
const effective = (cap) => Math.min(window.devicePixelRatio || 1, cap);

function activeOf(layer) {
  const min = Math.min(layer.count, shown?.graphic.CONFIG.minDotCount ?? 0);
  return Math.max(min, Math.min(layer.count, Math.round(layer.count * detail)));
}

function resetQuality() {
  quality = { frames: 0, time: 0, pending: null, blocked: false, goodWindows: 0, justRaised: null, ceiling: Infinity, dprCeiling: Infinity };
}
resetQuality();

function setDpr(cap) {
  maxDpr = cap;
  layout();
}

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
  if (morph) return;   // a morph draws more than usual; judge the graphic on its own

  if (quality.pending) {
    const before = quality.pending;
    quality.pending = null;
    if (fps < before.fps * 1.1) {
      detail = before.detail;
      if (maxDpr !== before.dpr) { maxDpr = before.dpr; layout(); }
      quality.blocked = true;
    }
    return;
  }
  if (quality.blocked) return;

  const minDetail = Math.min(1, (shown.graphic.CONFIG.minDotCount || 0) / shown.count);
  if (fps < 45) {
    // The last increase was too much: don't go back up to it.
    if (quality.justRaised === 'detail') quality.ceiling = detail;
    if (quality.justRaised === 'dpr') quality.dprCeiling = maxDpr;
    const before = { fps, detail, dpr: maxDpr };
    if (effective(SOFT) < effective(maxDpr)) setDpr(SOFT);
    else if (detail > minDetail) detail = Math.max(minDetail, detail * 0.75);
    else if (effective(SOFTEST) < effective(maxDpr)) setDpr(SOFTEST);
    else return;
    quality.pending = before;
    quality.goodWindows = 0;
    quality.justRaised = null;
    return;
  }

  quality.justRaised = null;
  if (fps > 56 && ++quality.goodWindows >= 3) {
    quality.goodWindows = 0;
    const raised = Math.min(1, quality.ceiling * 0.99, detail * 1.15);
    if (maxDpr < SOFT && quality.dprCeiling > SOFT) {
      setDpr(SOFT);
      quality.justRaised = 'dpr';
    } else if (raised > detail) {
      detail = raised;
      quality.justRaised = 'detail';
    } else if (maxDpr < SHARP && quality.dprCeiling > SHARP) {
      setDpr(SHARP);
      quality.justRaised = 'dpr';
    }
  }
}

// ---------- start ----------

function glState() {
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // ink over paper: overlapping squares darken
  gl.clearColor(0, 0, 0, 0);
}

// Starts drawing graphic g (a graphics/*.js default export). With rotate = { every, next }, morphs
// into the graphic next() resolves to after every `every` seconds of the page on screen.
export function start(g, rotate) {
  document.documentElement.dataset.graphic = g.name;
  if (!gl) {
    document.documentElement.classList.add('no-webgl');
    return;
  }
  shown = layerFor(g);
  if (rotate) rotation = { ...rotate, since: 0, upcoming: null };
  glState();
  listen();
  const resize = new ResizeObserver(layout);
  resize.observe(slot);
  resize.observe(document.body);   // content above the hero never changes, but fonts/layout shifts can
  if (restEl) resize.observe(restEl);
  if (focusEl) resize.observe(focusEl);
  addEventListener('resize', layout);
  layout();
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => {
    // Everything on the GPU is gone, state included: rebuild the layer being shown (the rest are
    // rebuilt when needed) and switch blending back on.
    const graphic = shown.graphic;
    layers.clear();
    morph = null;
    morphLayer = null;
    enabledAttribs = 0;
    shown = layerFor(graphic);
    glState();
    layout();
  });
  requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has('tune')) import('./tune.js');
}

// The graphic being shown, for the tune panel.
export function current() {
  return shown?.graphic ?? null;
}

// Where the graphic sits on the canvas, in device px: its centre, its radius and the canvas size; how
// far it has glided from the hero to its rest (0..1); and in the hero, how far below its centre the
// text it should keep clear of starts ([data-voxel-clear]). For graphics that fit themselves to the
// room around them.
export function stage() {
  return { x: cx, y: cy, radius, width: canvas.width, height: canvas.height, scale: dpr, recede, clearBelow: heroClear };
}

export function getStats() {
  return { drawn: shown ? activeOf(shown) : 0, requested: shown?.count ?? 0 };
}
