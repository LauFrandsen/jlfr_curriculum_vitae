// The guided tour: the hero's Explore button takes the visitor through the CV one part at a time. A
// bar along the bottom names the part it's at, with a line about it (its data-tour), a square for each
// stop like the timeline's markers, and Back and Next; the rest of the CV dims a little around it.
// Scrolling works as ever: the tour follows along to whichever part is in view, and ends on scrolling
// back up into the hero. ← and → step through it too, and Esc ends it.

import { reducedMotion } from './voxel.js';
import { play } from './sound.js';

const LINE = 0.4;    // the part shown is the last one whose top has passed this share of the screen's height
const HERO = 0.6;    // the tour ends once the first part's top is back down below this share of it

const root = document.documentElement;
const explore = document.getElementById('explore-button');
const bar = document.getElementById('tour');
const title = bar.querySelector('.tour-title');
const text = bar.querySelector('.tour-text');
const back = bar.querySelector('.tour-back');
const next = bar.querySelector('.tour-next');

// The stops: every part of the CV with a data-tour, named by its heading or its data-tour-title.
const stops = [...document.querySelectorAll('[data-tour]')].map((el) => ({
  el,
  title: el.dataset.tourTitle || el.querySelector('h2')?.textContent.trim() || '',
  text: el.dataset.tour,
}));

// A square for each stop, filled in ink up to the one shown; a tap goes there.
const squares = stops.map((stop, i) => {
  const li = document.createElement('li'), b = document.createElement('button');
  b.type = 'button';
  b.className = 'tour-stop';
  b.title = stop.title;
  b.setAttribute('aria-label', stop.title);
  b.addEventListener('click', () => go(i));
  li.append(b);
  bar.querySelector('.tour-stops').append(li);
  return b;
});

let at = -1;        // the stop shown; -1 when not on the tour
let steering = 0;   // while the tour scrolls the page itself (a timer), it doesn't follow along
let hiding = 0;     // the timer that hides the bar once it has slid away

// Shows stop i in the bar, and lights up its part of the CV.
function show(i) {
  at = i;
  title.textContent = stops[i].title;
  text.textContent = stops[i].text;
  squares.forEach((b, k) => {
    b.classList.toggle('seen', k <= i);
    if (k === i) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
  });
  back.disabled = i === 0;
  next.textContent = i === stops.length - 1 ? 'Done' : 'Next';
  stops.forEach((s, k) => s.el.classList.toggle('tour-here', k === i));
}

// Goes to stop i: shows it and scrolls its part of the CV up to the top.
function go(i) {
  if (i < 0 || i >= stops.length) return;
  if (at >= 0 && i !== at) play('step');
  show(i);
  steer();
  stops[i].el.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
}

// Holds off following the scroll until the page has stopped moving for a moment.
function steer() {
  clearTimeout(steering);
  steering = setTimeout(() => { steering = 0; }, 200);
}

// Starts the tour; from the keyboard, it takes the focus along to Next.
function start(byKeyboard) {
  clearTimeout(hiding);
  bar.hidden = false;
  void bar.offsetWidth;   // (laid out where it starts, so it slides in)
  bar.classList.remove('away');
  root.classList.add('touring');
  play('open');
  at = -1;
  go(0);
  if (byKeyboard) next.focus({ preventScroll: true });
}

function end() {
  if (at < 0) return;
  at = -1;
  play('close');
  root.classList.remove('touring');
  stops.forEach((s) => s.el.classList.remove('tour-here'));
  bar.classList.add('away');
  clearTimeout(hiding);
  hiding = setTimeout(() => { bar.hidden = true; }, reducedMotion.matches ? 0 : 400);
  if (bar.contains(document.activeElement)) explore.focus({ preventScroll: true });
}

explore.addEventListener('click', (e) => {
  e.preventDefault();
  start(e.detail === 0);   // (a click from Enter has no count)
});
back.addEventListener('click', () => go(at - 1));
next.addEventListener('click', () => (at === stops.length - 1 ? end() : go(at + 1)));
bar.querySelector('.tour-end').addEventListener('click', end);

// Following the visitor's own scrolling: the part in view is the one shown (the last one at the very
// bottom of the page, which may not reach the line); back up in the hero, the tour is over.
addEventListener('scroll', () => {
  if (at < 0) return;
  if (steering) {
    steer();
    return;
  }
  if (stops[0].el.getBoundingClientRect().top > innerHeight * HERO) {
    end();
    return;
  }
  let i = 0;
  if (scrollY + innerHeight >= root.scrollHeight - 2) i = stops.length - 1;
  else stops.forEach((s, k) => { if (s.el.getBoundingClientRect().top <= innerHeight * LINE) i = k; });
  if (i !== at) show(i);
}, { passive: true });

// The keys, unless a project pane is open or they're for a field (like the tune panel's sliders).
addEventListener('keydown', (e) => {
  if (at < 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || root.classList.contains('focusing')) return;
  if (e.target.closest?.('input, select, textarea, [contenteditable]')) return;
  if (e.key === 'ArrowRight') go(at + 1);
  else if (e.key === 'ArrowLeft') go(at - 1);
  else if (e.key === 'Escape') end();
  else return;
  e.preventDefault();
});

// ---------- the Explore button ----------
// Its edge is drawn in ink squares, each with its soft burn, like the graphics. As the page opens they
// blip in one by one, from the top's middle round both ways; then they breathe together, slowly, like
// the orb, while a swell circles round them like a satellite on its orbit. Under the mouse they're
// drawn toward it a little, and pressed, they draw in. (The CSS makes it float.)

const EDGE = {
  gap: 6.5,        // px between squares along the edge
  size: 2.4,       // a square's side, px
  start: 0.9,      // s after the page opens before they blip in
  stagger: 0.022,  // s between one square blipping in and the next
  blip: 0.4,       // s a square takes to blip in
  breath: 5,       // s for a breath
  orbit: 7,        // s for the swell to go round once
  reach: 30,       // px around the mouse within which squares are drawn to it
  pull: 0.3,       // how far toward it, at most (a share of the way)
};
const OUT = 12;    // px the canvas reaches past the button, for the burns (as in the CSS)

const edge = document.createElement('canvas');
const pen = edge.getContext('2d');
const ink = getComputedStyle(root).getPropertyValue('--ink').trim() || '#11100f';
let dots = [];     // the squares: { x, y (px, on the button's edge), u (0..1 round it), order (to blip in) }
let w = 0, h = 0, dpr = 1;
let hover = 0, hoverTo = 0, press = 0, pressTo = 0;
const mouse = { x: 0, y: 0 };
let frame = 0;     // the animation frame asked for, if any

// A burn, drawn once and stamped under each square: a soft umber glow.
const burn = document.createElement('canvas');
burn.width = burn.height = 32;
{
  const g = burn.getContext('2d'), glow = g?.createRadialGradient(16, 16, 0, 16, 16, 16);
  if (glow) {
    glow.addColorStop(0, 'rgba(58, 38, 20, 0.32)');
    glow.addColorStop(0.45, 'rgba(58, 38, 20, 0.1)');
    glow.addColorStop(1, 'rgba(58, 38, 20, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 32, 32);
  }
}

// Lays the squares out along the button's edge: evenly on each side, a square on every corner.
function layout() {
  w = explore.offsetWidth;
  h = explore.offsetHeight;
  dpr = Math.min(devicePixelRatio || 1, 2);
  edge.width = Math.round((w + 2 * OUT) * dpr);
  edge.height = Math.round((h + 2 * OUT) * dpr);
  const nx = Math.max(2, Math.round(w / EDGE.gap)), ny = Math.max(2, Math.round(h / EDGE.gap)), ring = [];
  for (let k = 0; k < nx; k++) ring.push([w * k / nx, 0]);
  for (let k = 0; k < ny; k++) ring.push([w, h * k / ny]);
  for (let k = 0; k < nx; k++) ring.push([w - w * k / nx, h]);
  for (let k = 0; k < ny; k++) ring.push([0, h - h * k / ny]);
  const top = Math.floor(nx / 2), n = ring.length;
  dots = ring.map((_, i) => {
    const [x, y] = ring[(i + top) % n];
    return { x, y, u: i / n, order: Math.min(i, n - i) };
  });
  draw(performance.now());
}

const easeOutBack = (x) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;

function draw(now) {
  frame = 0;
  const still = reducedMotion.matches, t = now / 1000, opened = t - EDGE.start;
  hover += (hoverTo - hover) * 0.12;
  press += (pressTo - press) * 0.3;
  pen.setTransform(dpr, 0, 0, dpr, OUT * dpr, OUT * dpr);
  pen.clearRect(-OUT, -OUT, w + 2 * OUT, h + 2 * OUT);
  pen.fillStyle = ink;
  const breath = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / EDGE.breath);
  const swell = (t / EDGE.orbit) % 1;
  let settling = false;
  dots.forEach((d, i) => {
    const age = still ? 1 : (opened - d.order * EDGE.stagger) / EDGE.blip;
    if (age < 1) settling = true;
    if (age <= 0) return;
    const behind = (((swell - d.u) % 1) + 1) % 1;   // how far round the swell has gone past it
    const wake = still ? 0 : Math.exp(-behind * dots.length / 5);
    const shimmer = still ? 0 : 0.08 * Math.sin(t * 1.7 + i * 2.39);
    let x = d.x, y = d.y;
    if (hover > 0.01) {   // drawn toward the mouse
      const dx = mouse.x - x, dy = mouse.y - y;
      const k = hover * EDGE.pull * Math.exp(-(dx * dx + dy * dy) / (2 * EDGE.reach ** 2));
      x += dx * k;
      y += dy * k;
    }
    x += (w / 2 - x) * 0.03 * press;   // pressed: drawn in
    y += (h / 2 - y) * 0.1 * press;
    const s = EDGE.size * (age < 1 ? easeOutBack(age) : 1) * (0.85 + 0.25 * breath + shimmer + 0.8 * wake) * (1 + 0.2 * hover);
    pen.globalAlpha = Math.min(1, 0.6 + 0.25 * breath + 0.4 * wake) * Math.min(1, age * 3);
    pen.drawImage(burn, x - s * 2.2, y - s * 2.2, s * 4.4, s * 4.4);
    pen.fillRect(x - s / 2, y - s / 2, s, s);
  });
  pen.globalAlpha = 1;
  if (!still || settling || Math.abs(hover - hoverTo) > 0.01) ask();
}

// Asks for the next frame, while the button can be seen.
function ask() {
  if (!frame && !document.hidden && scrollY < innerHeight) frame = requestAnimationFrame(draw);
}

if (pen) {
  explore.append(edge);
  explore.classList.add('drawn');
  new ResizeObserver(layout).observe(explore);
  addEventListener('scroll', ask, { passive: true });
  document.addEventListener('visibilitychange', ask);
  explore.addEventListener('pointermove', (e) => {
    const r = explore.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    hoverTo = e.pointerType === 'mouse' ? 1 : 0;
    ask();
  });
  explore.addEventListener('pointerleave', () => { hoverTo = pressTo = 0; ask(); });
  explore.addEventListener('pointerdown', () => { pressTo = 1; ask(); });
  addEventListener('pointerup', () => { pressTo = 0; ask(); });
}
