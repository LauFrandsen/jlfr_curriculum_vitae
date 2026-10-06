// Callouts: now and then a square of the graphic blinks purple, turns purple and grows a little, and a
// line draws out from it to a small window with something from the CV: a skill under its category,
// mostly the technical and personal ones. Less often a few squares light up one after another, each
// drawing a line to one window: a project. The same happens (with a skill) on the square nearest the
// mouse once it has rested over the graphic for a moment. The window stays open while the mouse is on
// it, and a click on it goes to that place in the CV.
//
// The squares themselves change (the graphic draws them, so they move as they do: voxel.js setMarks),
// and the lines follow them (marks, markAt). The lines and window go over the graphic and under the
// text, and only while the graphic is in the hero or resting beside the CV: not on a phone's horizon,
// nor beside a project pane.

import { MARKS, markAt, marks, reducedMotion, setMarks, stage } from './voxel.js';
import { play } from './sound.js';

const EVERY = [12, 24];      // seconds between callouts that come on their own (at random in between)
const FIRST = 6;             // seconds before the first, once the graphic has settled
const PROJECT_CHANCE = 0.2;  // the share of those that show a project
const PROJECT_SQUARES = [4, 6];   // how many squares light up for a project (at random in between)
const STAGGER = 140;         // ms between one square of a project lighting up and the next
const REST_MS = 800;         // the mouse resting over the graphic this long calls one out on the square nearest it,
const REST_BOUND = 18;       // ... resting meaning it stays within this many px of where it stopped,
const REACH = 36;            // ... and the nearest square within this many px of it
const HOLD_MS = 3800;        // how long a window stays (one the mouse called: while the mouse stays near)
const RECENT = 8;            // something said isn't said again until this many others have been
// A callout's steps, in ms from when a square starts: two blinks, growing, its line drawing out, the
// window opening; and how long it all takes to fade away at the end.
const STEP = { blinks: 480, lit: 900, line: 1300, open: 1600, out: 600 };

const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

// ---------- what to say ----------

// How often each skill comes up, by kind: the technical and personal skills most (the four personal
// ones each twice as often, so they hold their own against some forty technical ones), the
// specialities less, the everyday ones (operating systems, languages) seldom.
const WEIGHT = { technical: 3, personal: 6, specialised: 2, everyday: 0.5 };

// The skills, from the CV itself, as [{ kind (its category), skill, el (where it is), weight }]:
//  - the skill groups' chips, under the group's heading, or the chip's own data-category (which marks
//    an everyday one, like the operating systems);
//  - the personal skills (the headings in that section);
//  - the "Specialised in" chips;
//  - the languages.
// A skill listed twice keeps the first. The projects' own chips, only shown in a project's pane, are
// left out.
let skillList = null;
function skills() {
  if (skillList) return skillList;
  const out = new Map();
  const add = (skill, kind, el, weight) => {
    if (skill && skill.length <= 30 && !out.has(skill)) out.set(skill, { kind, skill, el, weight });
  };
  for (const li of document.querySelectorAll('.skill-group .chips li')) {
    const kind = li.dataset.category || li.closest('.skill-group').querySelector('h3')?.textContent.trim() || '';
    add(li.textContent.trim(), kind, li, li.dataset.category ? WEIGHT.everyday : WEIGHT.technical);
  }
  const traits = document.querySelectorAll('.trait h3');
  const personal = traits[0]?.closest('section')?.querySelector('h2')?.textContent.trim() || 'Personal skills';
  for (const h of traits) add(h.textContent.trim(), personal, h.closest('.trait'), WEIGHT.personal);
  for (const li of document.querySelectorAll('.chips li')) {
    if (li.closest('.project-more') || li.closest('.skill-group')) continue;
    add(li.textContent.trim(), li.closest('.chips')?.getAttribute('aria-label') || '', li, WEIGHT.specialised);
  }
  const languages = document.querySelector('.languages');
  const heading = languages?.previousElementSibling?.textContent.trim() || 'Languages';
  for (const li of languages?.querySelectorAll('li') ?? []) {
    const name = li.querySelector('strong')?.textContent, level = li.querySelector('span')?.textContent;
    if (name && level) add(`${name} · ${level.toLowerCase()}`, heading, li, WEIGHT.everyday);
  }
  return (skillList = [...out.values()]);
}

// The projects, as [{ kind: 'Project', skill (its name), note (where and when), el }].
function projects() {
  return [...document.querySelectorAll('.project')].map((p) => ({
    kind: 'Project',
    skill: p.querySelector('.project-open')?.textContent.trim() ?? '',
    note: p.querySelector('.tl-meta')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
    el: p,
    weight: 1,
  })).filter((p) => p.skill);
}

// One of a list, at random by weight, but not one said lately (unless there's nothing else).
const recent = [];
function pick(list) {
  const fresh = list.filter((s) => !recent.includes(s.skill));
  const pool = fresh.length ? fresh : list;
  let r = Math.random() * pool.reduce((sum, s) => sum + s.weight, 0);
  const said = pool.find((s) => (r -= s.weight) <= 0) ?? pool[pool.length - 1];
  if (!said) return { kind: '', skill: '', el: null, weight: 1 };
  recent.push(said.skill);
  if (recent.length > RECENT) recent.shift();
  return said;
}

// Writes a saying into a window: its category over the skill, and a note under it (a project's place
// and dates).
function fill(el, { kind, skill, note }) {
  const part = (className, text) => {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  };
  el.replaceChildren(...[kind && part('callout-kind', kind), part('callout-skill', skill), note && part('callout-note', note)].filter(Boolean));
}

// ---------- the layer ----------

// The window is a button (for the mouse: everything in it is in the CV itself, so the layer is hidden
// from assistive tech and the button left out of the tab order). Resting on it keeps it open; clicking
// it goes to that place in the CV. A line per square.
const layer = document.createElement('div');
layer.className = 'callout';
layer.setAttribute('aria-hidden', 'true');
layer.hidden = true;
layer.innerHTML = `<svg>${'<line></line>'.repeat(MARKS)}</svg><button class="callout-box" type="button" tabindex="-1"></button>`;
document.getElementById('voxel-canvas')?.after(layer);   // before the text, so the text stays on top
const lines = [...layer.querySelectorAll('line')], box = layer.querySelector('.callout-box');

box.addEventListener('pointerenter', () => { if (current) current.held = true; });
box.addEventListener('pointerleave', () => {
  if (!current) return;
  current.held = false;
  current.left = performance.now();
});
box.addEventListener('click', () => {
  const c = current;
  if (!c || c.ending) return;
  c.ending = performance.now();
  goTo(c.said.el);
});

// Scrolls to a place in the CV and picks it out in the callouts' colour for a moment.
function goTo(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
  el.classList.add('found');
  setTimeout(() => el.classList.remove('found'), 2600);
}

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

// Where the window goes for squares around m: out along the line from the graphic's middle through m,
// a little past it, on the side that points to; on the screen, and clear of the hero's text (or,
// beside the CV, of its column). Returns its top-left and how far it had to move from where it wanted
// to be.
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

// The callout showing: { squares: [{ index, at (where it was last), gone }], said, start, mouse
// (called by the mouse resting), size (its window's), opens (ms from start when its window has
// opened), ending, away (since when the mouse has been away), held (the mouse is on its window), left
// (when the mouse last left it), restX/restY (where the mouse rested to call it) }.
let current = null;
let looping = false;

function show(indices, said, byMouse = false) {
  const squares = indices.map((index) => ({ index, at: markAt(index), gone: false })).filter((s) => s.at);
  if (!squares.length) return;
  const now = performance.now();
  const opens = STEP.open + (squares.length - 1) * STAGGER;
  fill(box, said);
  current = {
    squares, said, start: reducedMotion.matches ? now - opens : now, mouse: byMouse, size: measure(said), opens,
    ending: 0, away: 0, held: false, left: 0, restX: mouse.restX, restY: mouse.restY,
  };
  layer.hidden = false;
  play('callout', { pan: (squares[0].at.x / innerWidth) * 2 - 1 });
  if (!looping) {
    looping = true;
    requestAnimationFrame(tick);
  }
}

function tick(now) {
  const c = current;
  // Where its squares are now; one that's gone (its petal broke off, a morph) lets go at once.
  for (const s of c?.squares ?? []) {
    const m = s.gone ? null : markAt(s.index);
    if (m) s.at = m;
    else s.gone = true;
  }
  const live = c?.squares.filter((s) => !s.gone) ?? [];
  if (c && !c.ending) {
    if (!live.length || !allowed()) {
      c.ending = now;   // its squares are gone, or the graphic has moved on
    } else if (c.held) {
      c.away = 0;       // the mouse is on its window: it stays open
    } else if (c.mouse) {
      // Called by the mouse: stays while the mouse stays about where it rested (or near the square,
      // which may sway), and goes a moment after it moves away.
      const m = live[0].at;
      const near = mouse.on && (Math.hypot(mouse.x - c.restX, mouse.y - c.restY) < REST_BOUND * 2
        || Math.hypot(mouse.x - m.x, mouse.y - m.y) < 40);
      c.away = near ? 0 : c.away || now;
      if (c.away && now - c.away > 900) c.ending = now;
    } else if (now > Math.max(c.start + c.opens + HOLD_MS, c.left + 1200)) {
      c.ending = now;   // its time is up, and the mouse left its window a moment ago (if it was on it)
    }
  }
  const out = c?.ending ? (now - c.ending) / STEP.out : 0;
  if (!c || out >= 1) {
    if (c === current) current = null;
    looping = false;
    layer.hidden = true;
    setMarks([]);
    return;
  }
  const e = now - c.start, fade = 1 - ease(out);

  // Each square, one after another: two purple blinks, then purple, growing a little. Gone, it's
  // plain ink again straight away; only its line and the window fade.
  const steps = c.squares.map((s, k) => {
    const t = e - k * STAGGER;
    const blink = t < 0 || (t < STEP.blinks && Math.floor(t / 120) % 2 === 1) ? 0 : 1;
    return { s, t, blink, grow: ease((t - STEP.blinks) / (STEP.lit - STEP.blinks)) };
  });
  setMarks(steps.filter((q) => !q.s.gone).map((q) => [q.s.index, q.blink * fade, q.grow * fade]));

  // The window, placed for the squares' middle, opening once the last line has drawn out; and a line
  // from each square's edge to the window's nearest point.
  const mid = { x: 0, y: 0 };
  for (const s of c.squares) {
    mid.x += s.at.x / c.squares.length;
    mid.y += s.at.y / c.squares.length;
  }
  const { left, top } = place(mid, graphic(), c.size.w, c.size.h);
  lines.forEach((ln, k) => {
    const q = steps[k];
    if (!q || (q.s.gone && live.length)) {
      ln.style.display = 'none';   // no square, or one gone while the others stay
      return;
    }
    const at = q.s.at;
    const tx = clamp(at.x, left, left + c.size.w), ty = clamp(at.y, top, top + c.size.h);
    const span = Math.hypot(tx - at.x, ty - at.y) || 1;
    const edge = Math.min(span, (at.size * (1 + 0.35 * q.grow)) / 2 + 2);
    const sx = at.x + ((tx - at.x) / span) * edge, sy = at.y + ((ty - at.y) / span) * edge;
    const drawn = ease((q.t - STEP.lit) / (STEP.line - STEP.lit)) * fade;
    ln.style.display = '';
    ln.setAttribute('x1', sx);
    ln.setAttribute('y1', sy);
    ln.setAttribute('x2', sx + (tx - sx) * drawn);
    ln.setAttribute('y2', sy + (ty - sy) * drawn);
  });
  const opened = ease((e - (c.opens - (STEP.open - STEP.line))) / (STEP.open - STEP.line)) * fade;
  box.style.opacity = String(opened);
  box.style.pointerEvents = opened > 0.5 && !c.ending ? 'auto' : 'none';
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

// More squares around square `first` for a project: a few within a third of the graphic's radius,
// apart from each other, so a small constellation lights up.
function constellation(all, first) {
  const g = graphic(), count = PROJECT_SQUARES[0] + ((Math.random() * (PROJECT_SQUARES[1] - PROJECT_SQUARES[0] + 1)) | 0);
  const out = [first], spots = [markAt(first)];
  for (let tries = 0; tries < 200 && out.length < Math.min(count, MARKS); tries++) {
    const i = all[(Math.random() * all.length) | 0], m = markAt(i);
    if (!m || out.includes(i) || Math.hypot(m.x - spots[0].x, m.y - spots[0].y) > g.r * 0.35) continue;
    if (spots.some((p) => Math.hypot(p.x - m.x, p.y - m.y) < 14)) continue;
    out.push(i);
    spots.push(m);
  }
  return out;
}

// Calls one out now, if there's a square for it: a skill, or (now and then, or if asked) a project.
// Also the tune panel's buttons. Returns whether it did.
export function callOut(kind = Math.random() < PROJECT_CHANCE ? 'project' : 'skill') {
  const all = marks();
  if (!all.length) return false;
  const project = kind === 'project' && projects().length > 0;
  const said = pick(project ? projects() : skills()), { w, h } = measure(said), i = choose(all, w, h);
  if (i < 0) return false;
  show(project ? constellation(all, i) : [i], said);
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

// ---------- the mouse resting on the graphic ----------

// Where the mouse is, whether it's over open space, and where and since when it has been resting
// (staying within REST_BOUND); done once it has called one out from there.
const mouse = { x: 0, y: 0, on: false, restX: 0, restY: 0, since: 0, done: false };
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  // Over open space only (the canvas sits behind the page, so there it reports the body or the root).
  const t = e.target;
  mouse.on = t === document.body || t === document.documentElement || t?.id === 'voxel-canvas';
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  if (Math.hypot(mouse.x - mouse.restX, mouse.y - mouse.restY) > REST_BOUND) {
    mouse.restX = mouse.x;
    mouse.restY = mouse.y;
    mouse.since = performance.now();
    mouse.done = false;
  }
});
document.addEventListener('pointerleave', () => { mouse.on = false; });
addEventListener('blur', () => { mouse.on = false; });

// The square nearest the mouse, within REACH; -1 if none.
function under(all) {
  let best = -1, nearest = REACH;
  for (const i of all) {
    const m = markAt(i);
    const d = m ? Math.hypot(m.x - mouse.x, m.y - mouse.y) : Infinity;
    if (d < nearest) {
      nearest = d;
      best = i;
    }
  }
  return best;
}

// The mouse resting over the graphic for REST_MS calls one out (a skill) on the square nearest it then
// (once, until the mouse moves on): a square needn't stay under it, so the flower's swaying doesn't
// matter.
setInterval(() => {
  if (!mouse.on || mouse.done || current?.held || performance.now() - mouse.since < REST_MS || !allowed()) return;
  const all = marks();
  if (!all.length) return;
  mouse.done = true;
  const i = under(all);
  if (i >= 0 && !current?.squares.some((s) => s.index === i)) show([i], pick(skills()), true);
}, 100);
