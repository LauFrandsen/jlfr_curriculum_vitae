// Callouts: now and then a square of the graphic blinks purple, turns purple and grows a little, and
// a line draws out from it to a small window with one of the CV's skills; and the same on the square
// the mouse has rested on for two seconds. The square itself changes (the graphic draws it, so it
// moves as it does: voxel.js setMark), and the line follows it (marks, markAt); the skills come from
// the page's chips. The line and window go over the graphic and under the text, and only while the
// graphic is in the hero or resting beside the CV: not on a phone's horizon, nor beside a project pane.

import { clearMark, markAt, marks, reducedMotion, setMark, stage } from './voxel.js';
import { play } from './sound.js';

const EVERY = [12, 24];   // seconds between callouts that come on their own (at random in between)
const FIRST = 6;          // seconds before the first, once the graphic has settled
const HOVER_MS = 2000;    // the mouse resting on a square this long calls one out there
const HOLD_MS = 3800;     // how long a window stays (one the mouse called: while the mouse stays near)
// A callout's steps, in ms from its start: two blinks, growing, the line drawing out, the window
// opening; and how long it takes to fade away at the end.
const STEP = { blinks: 480, lit: 900, line: 1300, open: 1600, out: 600 };

const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

// ---------- what to say ----------

// The CV's skills (its chips, the short ones) and languages, each with its category, so a skill like
// "Windows" reads right: a chip's own data-category, or the heading of its skill group, or its list's
// label ("Specialised in", "Technologies"). A skill listed twice takes the category from the skill
// groups. As [{ kind, skill }].
function sayings() {
  const out = new Map();   // skill → category
  const chips = [...document.querySelectorAll('.skill-group .chips li'), ...document.querySelectorAll('.chips li')];
  for (const li of chips) {
    const skill = li.textContent.trim();
    if (skill.length > 28 || out.has(skill)) continue;
    out.set(skill, li.dataset.category
      || li.closest('.skill-group')?.querySelector('h3')?.textContent.trim()
      || li.closest('.chips')?.getAttribute('aria-label')
      || '');
  }
  const languages = document.querySelector('.languages');
  const heading = languages?.previousElementSibling?.textContent.trim() || 'Languages';
  for (const li of languages?.querySelectorAll('li') ?? []) {
    const name = li.querySelector('strong')?.textContent, level = li.querySelector('span')?.textContent;
    if (name && level) out.set(`${name} · ${level.toLowerCase()}`, heading);
  }
  return [...out].map(([skill, kind]) => ({ kind, skill }));
}

// One at a time, each once before any comes round again.
let bag = [];
function saying() {
  if (!bag.length) {
    bag = sayings();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop() ?? { kind: '', skill: '' };
}

// Writes a saying into a window: its category over the skill.
function fill(el, { kind, skill }) {
  const label = document.createElement('span'), text = document.createElement('span');
  label.className = 'callout-kind';
  label.textContent = kind;
  text.className = 'callout-skill';
  text.textContent = skill;
  el.replaceChildren(...(kind ? [label] : []), text);
}

// ---------- the layer ----------

const layer = document.createElement('div');
layer.className = 'callout';
layer.setAttribute('aria-hidden', 'true');   // the skills are in the CV itself
layer.hidden = true;
layer.innerHTML = '<svg><line></line></svg><span class="callout-box"></span>';
document.getElementById('voxel-canvas')?.after(layer);   // before the text, so the text stays on top
const line = layer.querySelector('line'), box = layer.querySelector('.callout-box');

// A hidden copy of the window, to measure one before it shows.
const ruler = document.createElement('span');
ruler.className = 'callout-box';
ruler.setAttribute('aria-hidden', 'true');
ruler.style.visibility = 'hidden';
document.body.append(ruler);
function measure(said) {
  fill(ruler, said);
  return { w: ruler.offsetWidth, h: ruler.offsetHeight };
}

// ---------- where ----------

// The graphic's centre and radius, in CSS px, and how far it has glided from the hero and to a pane.
function graphic() {
  const st = stage();
  return { x: st.x / st.scale, y: st.y / st.scale, r: st.radius / st.scale, recede: st.recede, focus: st.focus };
}

// Whether callouts may show: the graphic in the hero, or resting beside the CV on a wide screen.
function allowed() {
  const g = graphic();
  if (document.hidden || g.focus > 0.01 || document.documentElement.classList.contains('focusing')) return false;
  return g.recede < 0.3 || (g.recede > 0.95 && innerWidth >= 1100);
}

// Where the window goes for a square at m: out along the line from the graphic's middle through the
// square, a little past it, on the side that points to; on the screen, and clear of the hero's text
// (or, beside the CV, of its column). Returns its top-left and how far it had to move from where it
// wanted to be.
function place(m, g, w, h) {
  let dx = m.x - g.x, dy = m.y - g.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) [dx, dy] = [0.7, -0.7];
  else [dx, dy] = [dx / len, dy / len];
  const besideText = g.recede > 0.5;
  if (besideText && dx < 0.3) [dx, dy] = [0.3, (dy < 0 ? -1 : 1) * Math.sqrt(0.91)];
  const reach = clamp(g.r * 0.4, 40, 110);
  const ex = m.x + dx * reach, ey = m.y + dy * reach;
  const want = [dx >= 0 ? ex + 6 : ex - 6 - w, dy < -0.5 ? ey - h - 4 : dy > 0.5 ? ey + 4 : ey - h / 2];
  const minLeft = besideText ? (document.querySelector('.cv')?.getBoundingClientRect().right ?? 0) + 16 : 12;
  const left = clamp(want[0], minLeft, innerWidth - 12 - w);
  let top = clamp(want[1], 12, innerHeight - 12 - h);
  const text = besideText ? null : document.querySelector('[data-voxel-clear]')?.getBoundingClientRect();
  if (text && top + h > text.top - 8 && left < text.right && left + w > text.left) top = Math.max(12, text.top - 8 - h);
  return { left, top, moved: Math.hypot(left - want[0], top - want[1]) };
}

// ---------- showing one ----------

let current = null;   // the callout showing: { index, start, mouse, size, at, ending, away, gone }
let looping = false;

function show(index, said, mouse = false) {
  const at = markAt(index);
  if (!at) return;
  const now = performance.now();
  fill(box, said);
  current = { index, start: reducedMotion.matches ? now - STEP.open : now, mouse, size: measure(said), at, ending: 0, away: 0 };
  layer.hidden = false;
  play('callout', { pan: (at.x / innerWidth) * 2 - 1 });
  if (!looping) {
    looping = true;
    requestAnimationFrame(tick);
  }
}

function tick(now) {
  const c = current;
  const m = c && markAt(c.index);
  if (c && !m) c.gone = true;   // its square is gone (its petal broke off, a morph): it lets go at once
  if (c && !c.ending) {
    if (!m || !allowed()) {
      c.ending = now;   // its square is gone, or the graphic has moved on
    } else if (c.mouse) {
      // Called by the mouse: stays while the mouse rests near it, and goes a moment after it leaves.
      const near = mouse.on && Math.hypot(mouse.x - m.x, mouse.y - m.y) < 40;
      c.away = near ? 0 : c.away || now;
      if (c.away && now - c.away > 900) c.ending = now;
    } else if (now - c.start > STEP.open + HOLD_MS) {
      c.ending = now;
    }
  }
  const out = c?.ending ? (now - c.ending) / STEP.out : 0;
  if (!c || out >= 1) {
    if (c === current) current = null;
    looping = false;
    layer.hidden = true;
    clearMark();
    return;
  }
  const at = (c.at = m ?? c.at), e = now - c.start, fade = 1 - ease(out);

  // The square itself: two purple blinks, then purple, growing a little. Once it's gone (a broken
  // petal falling away) it's plain ink again straight away; only the line and window fade.
  const blink = e < STEP.blinks && Math.floor(e / 120) % 2 === 1 ? 0 : 1;
  const grow = ease((e - STEP.blinks) / (STEP.lit - STEP.blinks));
  if (c.gone) clearMark();
  else setMark(c.index, blink * fade, grow * fade);

  // The line drawing out from its edge to the window, and the window opening at its end.
  const { left, top } = place(at, graphic(), c.size.w, c.size.h);
  const tx = clamp(at.x, left, left + c.size.w), ty = clamp(at.y, top, top + c.size.h);
  const span = Math.hypot(tx - at.x, ty - at.y) || 1;
  const edge = Math.min(span, (at.size * (1 + 0.35 * grow)) / 2 + 2);
  const sx = at.x + ((tx - at.x) / span) * edge, sy = at.y + ((ty - at.y) / span) * edge;
  const drawn = ease((e - STEP.lit) / (STEP.line - STEP.lit)) * fade;
  line.setAttribute('x1', sx);
  line.setAttribute('y1', sy);
  line.setAttribute('x2', sx + (tx - sx) * drawn);
  line.setAttribute('y2', sy + (ty - sy) * drawn);
  const opened = ease((e - STEP.line) / (STEP.open - STEP.line)) * fade;
  box.style.opacity = String(opened);
  box.style.transform = `translate(${left}px, ${top + (1 - opened) * 4}px)`;
  requestAnimationFrame(tick);
}

// A square for a callout that comes on its own, for a window of size w x h: in the upper part of the
// graphic (so the window goes up and out, clear of the text under it), on the screen, and with room
// for its window where it points. -1 if none turns up.
function choose(all, w, h) {
  const g = graphic();
  for (let tries = 0; tries < 30; tries++) {
    const i = all[(Math.random() * all.length) | 0], m = markAt(i);
    if (!m || m.y > g.y + 0.15 * g.r) continue;
    if (m.x < 16 || m.y < 16 || m.x > innerWidth - 16 || m.y > innerHeight - 16) continue;
    if (place(m, g, w, h).moved < 40) return i;
  }
  return -1;
}

// Calls one out now, if there's a square for it (also the tune panel's button). Returns whether it did.
export function callOut() {
  const all = marks();
  if (!all.length) return false;
  const said = saying(), { w, h } = measure(said), i = choose(all, w, h);
  if (i < 0) return false;
  show(i, said);
  return true;
}

// ---------- now and then ----------

let next = 0;   // when the next one comes (performance.now() ms); 0 until the graphic has settled
setInterval(() => {
  const now = performance.now();
  if (current || !allowed()) return;
  if (!marks().length) {
    next = 0;   // not settled: the orb's intro, the flower growing, a morph
    return;
  }
  if (!next) next = now + FIRST * 1000;
  if (now < next) return;
  next = now + (EVERY[0] + Math.random() * (EVERY[1] - EVERY[0])) * 1000;
  callOut();
}, 500);

// ---------- the mouse resting on a square ----------

const mouse = { x: 0, y: 0, on: false, index: -1, since: 0, done: -1 };
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  // Over open space only (the canvas sits behind the page, so there it reports the body or the root).
  const t = e.target;
  mouse.on = t === document.body || t === document.documentElement || t?.id === 'voxel-canvas';
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
document.addEventListener('pointerleave', () => { mouse.on = false; });
addEventListener('blur', () => { mouse.on = false; });

// The square nearest the mouse, within a little more than its own size; -1 if none.
function under(all) {
  let best = -1, nearest = Infinity;
  for (const i of all) {
    const m = markAt(i);
    const d = m ? Math.hypot(m.x - mouse.x, m.y - mouse.y) : Infinity;
    if (d < Math.max(8, m?.size * 2.5) && d < nearest) {
      nearest = d;
      best = i;
    }
  }
  return best;
}

// The mouse stays on a square while it's still close to it (even if another has come a little
// nearer); two seconds there, and that square calls one out (once, until the mouse moves on).
setInterval(() => {
  const now = performance.now();
  if (!mouse.on || !allowed()) {
    mouse.index = -1;
    return;
  }
  const was = mouse.index >= 0 ? markAt(mouse.index) : null;
  if (!was || Math.hypot(was.x - mouse.x, was.y - mouse.y) > Math.max(10, was.size * 3)) {
    const all = marks();
    mouse.index = all.length ? under(all) : -1;
    mouse.since = now;
    if (mouse.index !== mouse.done) mouse.done = -1;
    return;
  }
  if (now - mouse.since >= HOVER_MS && mouse.done !== mouse.index && current?.index !== mouse.index) {
    mouse.done = mouse.index;
    show(mouse.index, saying(), true);
  }
}, 100);
