// The guided tour: the hero's Explore button takes the visitor through the CV one part at a time. A
// bar along the bottom names the part it's at, with a line about it (its data-tour), a square for each
// stop like the timeline's markers, and Back and Next. ← and → step through it too, and Esc ends it.
//
// Where the graphic can, the tour is a ride: the page's text gives way and the camera flies off to
// ride along with one of the orb's satellites, the orb a planet below (from the flower, it morphs into
// the orb on the way up), and at each stop purple squares on the orb walk through that part of the CV
// in windows (see "the ride's stops" below); leaving flies back down to the page. Otherwise (no WebGL,
// or reduced motion) it goes down the page itself: each stop scrolls its part up, the rest of the CV
// dims a little around it, and the tour follows the visitor's own scrolling, ending back up in the hero.

import { MARKS, current, markAt, marks, next as nextGraphic, reducedMotion, ridePace, rideState, riding, setMarks } from './voxel.js';
import { play } from './sound.js';

const LINE = 0.4;    // the part shown is the last one whose top has passed this share of the screen's height
const HERO = 0.6;    // the tour ends once the first part's top is back down below this share of it
const FLIGHT = 4.2;  // seconds the camera takes to fly up to the ride (voxel.js RIDE.there), for its sound

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

let at = -1;          // the stop shown; -1 when not on the tour
let rides = false;    // this tour is a ride (otherwise it goes down the page)
let steering = 0;     // while the tour scrolls the page itself (a timer), it doesn't follow along
let hiding = 0;       // the timer that hides the bar once it has slid away

// Whether the tour can be a ride: the graphic is drawn, and motion is welcome.
const canRide = () => !reducedMotion.matches && !root.classList.contains('no-webgl') && !!current();

// Shows stop i in the bar, and (down the page) lights up its part of the CV.
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
  stops.forEach((s, k) => s.el.classList.toggle('tour-here', !rides && k === i));
}

// Goes to stop i: shows it, and down the page scrolls its part of the CV up to the top.
function go(i) {
  if (i < 0 || i >= stops.length) return;
  if (at >= 0 && i !== at) play('step');
  show(i);
  if (rides) {
    visit(i);
    return;
  }
  steer();
  stops[i].el.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
}

// Holds off following the scroll until the page has stopped moving for a moment.
function steer() {
  clearTimeout(steering);
  steering = setTimeout(() => { steering = 0; }, 200);
}

// Starts the tour; from the keyboard, it takes the focus along to Next.
async function start(byKeyboard) {
  if (at >= 0) return;
  rides = canRide();
  clearTimeout(hiding);
  bar.hidden = false;
  void bar.offsetWidth;   // (laid out where it starts, so it slides in)
  bar.classList.remove('away');
  root.classList.add('touring');
  at = -1;
  if (rides) layer.hidden = false;
  go(0);
  if (byKeyboard) next.focus({ preventScroll: true });
  if (!rides) {
    play('open');
    return;
  }
  // The ride: from the flower, the orb first (its satellites are what's ridden).
  play('launch', { length: FLIGHT });
  if (current()?.name !== 'orb') await nextGraphic();
  if (at >= 0) riding(true, middle);
}

function end() {
  if (at < 0) return;
  at = -1;
  if (rides) {
    play('fold', { length: 2.8 });
    leave();
    riding(false);
    setTimeout(() => { if (at < 0) layer.hidden = true; }, 450);
  } else {
    play('close');
  }
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

// Down the page, following the visitor's own scrolling: the part in view is the one shown (the last
// one at the very bottom of the page, which may not reach the line); back up in the hero, it's over.
addEventListener('scroll', () => {
  if (at < 0 || rides) return;
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
  else if (e.key === 'Escape' && scene?.open >= 0) {
    scene.open = -1;
    stack(scene);
  } else if (e.key === 'Escape') end();
  else return;
  e.preventDefault();
});

// ---------- the ride's stops: purple squares and their windows ----------
// At each stop of a ride the satellite speeds on for a moment, the orb rolling by below, and slows to
// a crawl. Then squares on the orb's face light up purple one after another, a dotted purple trail
// walking from each to the next, and a line draws out from each to a window with a piece of that
// stop's part of the CV, read from the page (up to MARKS of them). A window with more to it opens on a
// tap (an entry's points, all of a group's skills), the stop's other windows stepping aside meanwhile,
// or opens its project's pane. On a wide screen the windows stand in a column on the left, the orb to
// their right; on a narrow one they're stacked above the bar (squeezed, if they'd cover too much of
// the orb), their lines running up a lane each at the right edge, circuit-like, so none crosses a window.

const WALK = {
  cruise: 1.6,    // seconds the satellite speeds on between stops,
  fast: 1.8,      // ... at this pace (1 = the orb's own),
  slow: 0.06,     // and its pace while at a stop
  settle: 0.4,    // seconds after slowing before the first square lights
  stagger: 0.45,  // seconds between one square lighting and the next
  chips: 5,       // a window shows this many of a group's skills until it's opened (if 3 or more are left)
};
const SCENE = 0.42;   // on a narrow screen, the share of its height kept for the orb above the windows
const LANES = 34;  // px kept free at the right edge of a narrow screen for the lines' lanes
const GAP = 8;     // px between windows

// Where the ride's view has its middle (voxel.js riding): on a wide screen right of the windows'
// column; on a narrow one high up, above their stack.
const wide = () => innerWidth > innerHeight * 1.05;
const middle = () => (wide() ? [0.63, 0.44] : [0.5, 0.3]);

const SVG = 'http://www.w3.org/2000/svg';
const layer = document.createElement('div');
layer.className = 'ride';
layer.hidden = true;
layer.innerHTML = '<svg aria-hidden="true"><path class="ride-walk"/></svg>';
document.body.append(layer);
const svg = layer.querySelector('svg'), walkPath = layer.querySelector('.ride-walk');

let scene = null;   // the stop being shown: { stop, start (ms), cruise (s), items, hover, ... }
let ticking = 0;    // the animation frame asked for, if any

const textOf = (el) => el?.textContent.replace(/\s+/g, ' ').trim() ?? '';
const listOf = (els) => [...els].map(textOf);

// What a stop shows: its part of the page, in pieces: { kind (small, over it), title, note (under it),
// text, chips, more (points shown once opened), links, pdf, open (opens it elsewhere) }.
function itemsOf(el) {
  switch (el.id) {
    case 'about': {
      const chips = el.querySelector('.chips');
      return [
        { kind: textOf(el.querySelector('.role')), title: textOf(el.querySelector('h1')), note: textOf(el.querySelector('.contact li:last-child')) },
        { text: textOf(el.querySelector('.lead')) },
        { kind: chips?.getAttribute('aria-label') ?? '', chips: listOf(chips?.children ?? []) },
      ];
    }
    case 'experience':
      return [...el.querySelectorAll('.tl-item')].map((li) => {
        const [place, when, kind] = textOf(li.querySelector('.tl-meta')).split(' · ');
        return { kind: [when, kind].filter(Boolean).join(' · '), title: textOf(li.querySelector('h3')), note: place, more: listOf(li.querySelectorAll(':scope > ul > li')) };
      });
    case 'projects':
      return [...el.querySelectorAll('.project')].map((p) => ({
        kind: textOf(p.querySelector('.tl-meta')),
        title: textOf(p.querySelector('.project-open')),
        text: textOf(p.querySelector('.project-summary')),
        open: () => p.querySelector('.project-open')?.click(),
      }));
    case 'skills':
      return [...el.querySelectorAll('.skill-group')].map((g) => ({
        kind: textOf(g.querySelector('h3')),
        chips: listOf(g.querySelectorAll('.chips li')),
        more: g.querySelector('.note') ? [textOf(g.querySelector('.note'))] : null,
      }));
    case 'personal': {
      const languages = el.querySelector('.languages');
      return [...el.querySelectorAll('.trait')].map((t) => ({ title: textOf(t.querySelector('h3')), more: listOf(t.querySelectorAll('li')) }))
        .concat(languages ? [{
          kind: textOf(languages.previousElementSibling),
          title: [...languages.children].map((li) => `${textOf(li.querySelector('strong'))} · ${textOf(li.querySelector('span')).toLowerCase()}`).join(', '),
        }] : []);
    }
    case 'beyond':
      return [{ kind: textOf(el.querySelector('h2')), text: textOf(el.querySelector('p')) }];
    default:   // the footer: how to get in touch
      return [{
        kind: stops.find((s) => s.el === el)?.title ?? '',
        links: [...el.querySelectorAll('.contact a')].map((a) => ({ href: a.getAttribute('href'), text: textOf(a) })),
        pdf: !!el.querySelector('#pdf-button'),
      }];
  }
}

// A window for a piece; toggled() is told when it opens or closes (so the stack can make room).
function windowOf(item, toggled) {
  const el = document.createElement('div');
  el.className = 'ride-card';
  const add = (tag, cls, content, to = el) => {
    const e = document.createElement(tag);
    e.className = cls;
    if (content !== undefined) e.textContent = content;
    to.append(e);
    return e;
  };
  if (item.kind) add('span', 'ride-kind', item.kind);
  if (item.title) add('strong', 'ride-title', item.title);
  if (item.note) add('span', 'ride-note', item.note);
  if (item.text) add('p', 'ride-text', item.text);
  const folds = (item.chips?.length ?? 0) >= WALK.chips + 3;
  if (item.chips?.length) {
    const ul = add('ul', folds ? 'ride-chips folds' : 'ride-chips');
    item.chips.forEach((c) => add('li', '', c, ul));
    if (folds) add('li', 'ride-plus', `+${item.chips.length - WALK.chips}`, ul);
  }
  if (item.more?.length) {
    const ul = add('ul', 'ride-more');
    item.more.forEach((m) => add('li', '', m, ul));
  }
  if (item.links?.length || item.pdf) {
    const row = add('div', 'ride-links');
    for (const l of item.links ?? []) {
      const a = add('a', '', l.text, row);
      a.href = l.href;
    }
    if (item.pdf) {
      const b = add('button', 'ride-pdf', 'Save as PDF', row);
      b.type = 'button';
      b.addEventListener('click', () => window.print());
    }
  }
  const opens = !!item.open || !!item.more?.length || folds || (item.chips?.length ?? 0) > 3;
  if (opens) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    if (!item.open) el.setAttribute('aria-expanded', 'false');
    add('span', 'ride-cue', item.open ? 'Open →' : '+');
    const act = () => {
      if (item.open) return item.open();
      toggled(!el.classList.contains('open'));
    };
    el.addEventListener('click', act);
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      act();
    });
  }
  return el;
}

// Stands the stop's windows in their column (wide) or stack above the bar (narrow), squeezing them
// (compact) if they don't fit, or (narrow) would cover more than the orb can spare; keeps where each
// is, for its line. An open window stands alone where the stack ends, as tall as there's room for
// (scrolling within, if it needs more), the others stepping aside.
function stack(s) {
  const barTop = bar.getBoundingClientRect().top || innerHeight;
  const w = wide() ? Math.min(340, innerWidth * 0.3) : innerWidth - 32 - LANES;
  const left = wide() ? Math.max(32, innerWidth * 0.04) : 16;
  const room = wide() ? barTop - 48 : barTop - 12 - innerHeight * SCENE;
  const cards = s.items.map((it) => it.card);
  for (const it of s.items) {
    const open = it.k === s.open;
    it.card.style.width = `${w}px`;
    it.card.style.maxHeight = open ? `${wide() ? barTop - 48 : barTop - 12 - innerHeight * 0.2}px` : '';
    it.card.classList.toggle('open', open);
    it.card.classList.toggle('aside', s.open >= 0 && !open);
    if (!it.item.open && it.card.getAttribute('role')) it.card.setAttribute('aria-expanded', open);
    const cue = it.card.querySelector('.ride-cue');
    if (cue && !it.item.open) cue.textContent = open ? '−' : '+';
    it.card.classList.remove('compact');
  }
  const height = (list) => list.reduce((h, c) => h + c.offsetHeight, 0) + GAP * (list.length - 1);
  if (height(cards) > room) s.items.forEach((it) => it.card.classList.toggle('compact', it.k !== s.open));
  const place = (list) => {
    const h = height(list);
    let y = Math.max(8, wide() ? Math.min((innerHeight - h) / 2 - 24, barTop - 24 - h) : barTop - 12 - h);
    const top = y;
    for (const c of list) {
      c.style.left = `${left}px`;
      c.style.top = `${y}px`;
      y += c.offsetHeight + GAP;
    }
    return top;
  };
  s.box = { left, w, top: place(cards) };
  if (s.open >= 0) place([s.items[s.open].card]);
  for (const it of s.items) it.rect = { x: left, y: parseFloat(it.card.style.top), w, h: it.card.offsetHeight };
}

// Picks a square of the orb for each window: on its face as the camera sees it, beside the column or
// above the stack, spread out (the first nearest the middle of that room, then each the furthest from
// those picked). Matched to the windows top to bottom: on a wide screen from the highest square down,
// on a narrow one from the lowest up (so the lines in their lanes never cross). False until the orb
// has squares to offer (it may still be arriving).
function pick(s) {
  const all = marks();
  if (!all.length) return false;
  const W = innerWidth, H = innerHeight, b = s.box, barTop = bar.getBoundingClientRect().top || H;
  const room = wide()
    ? { x0: b.left + b.w + W * 0.05, x1: W - 40, y0: H * 0.12, y1: barTop - 30 }
    : { x0: W * 0.08, x1: W - 28 - LANES, y0: H * 0.22, y1: b.top - 20 };
  const seen = (r) => {
    const out = [];
    for (const i of all) {
      const m = markAt(i);
      if (m?.front && m.x > r.x0 && m.x < r.x1 && m.y > r.y0 && m.y < r.y1) out.push({ i, x: m.x, y: m.y });
    }
    return out;
  };
  let found = seen(room);
  if (found.length < s.items.length) found = seen({ x0: 12, x1: W - 12, y0: 12, y1: wide() ? barTop - 12 : b.top - 12 });
  const chosen = [];
  const mx = (room.x0 + room.x1) / 2, my = (room.y0 + room.y1) / 2;
  let first = null, nearest = Infinity;
  for (const f of found) {
    const d = Math.hypot(f.x - mx, f.y - my);
    if (d < nearest) { nearest = d; first = f; }
  }
  if (first) chosen.push(first);
  while (first && chosen.length < s.items.length) {
    let far = null, furthest = 12;
    for (const f of found) {
      const d = Math.min(...chosen.map((c) => Math.hypot(f.x - c.x, f.y - c.y)));
      if (d > furthest) { furthest = d; far = f; }
    }
    if (!far) break;
    chosen.push(far);
  }
  chosen.sort((p, q) => (wide() ? p.y - q.y : q.y - p.y));
  s.items.forEach((it, k) => { it.square = chosen[k]?.i ?? -1; });
  return true;
}

// The line from a square (m, on screen) to its window: straight to the window's edge on a wide
// screen; on a narrow one across to the window's lane, down it, and in to the window's right edge.
function lineOf(it, m) {
  const r = it.rect, y = r.y + Math.min(r.h / 2, 22);
  if (wide()) return `M${m.x},${m.y}L${r.x + r.w},${y}`;
  const lane = innerWidth - 16 - LANES + 8 + it.k * 4;
  return `M${m.x},${m.y}L${lane},${m.y}L${lane},${y}L${r.x + r.w},${y}`;
}

const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
// A square lighting: two blinks, then lit.
const blinkOf = (t) => (t < 0 ? 0 : t < 0.48 ? (t % 0.24 < 0.12 ? 1 : 0.25) : 1);

// The stop's windows, made once the satellite has slowed.
function build(s) {
  s.built = true;
  s.items = itemsOf(stops[s.stop].el).slice(0, MARKS).map((item, k) => {
    const it = { item, k, square: -1, card: windowOf(item, (open) => { s.open = open ? k : -1; stack(s); }) };
    it.card.addEventListener('pointerenter', () => { s.hover = k; });
    it.card.addEventListener('pointerleave', () => { if (s.hover === k) s.hover = -1; });
    layer.append(it.card);
    it.line = document.createElementNS(SVG, 'path');
    it.line.setAttribute('class', 'ride-line');
    it.line.setAttribute('pathLength', '1');
    svg.append(it.line);
    return it;
  });
  stack(s);
}

// Draws the stop t seconds after its first square began to light: each square blinking and lighting
// in turn (growing more while its window is under the mouse), the trail walking on to it, its line
// drawing out to its window, and the window appearing; the lines follow the squares as the orb moves.
function light(s, t) {
  const lit = [];
  let walk = '', prev = null;
  for (const it of s.items) {
    const tl = t - it.k * WALK.stagger;
    if (tl >= 0 && !it.heard) {
      it.heard = true;
      play('lay', { pitch: 0.9 + it.k * 0.07 });
    }
    it.card.classList.toggle('shown', tl >= 0.7);
    const m = it.square >= 0 && tl >= 0 ? markAt(it.square) : null;
    const aside = s.open >= 0 && s.open !== it.k, near = s.hover === it.k || s.open === it.k;
    if (m) lit.push([it.square, blinkOf(tl) * (aside ? 0.35 : 1), ease((tl - 0.3) / 0.5) * (near ? 1 : aside ? 0 : 0.55)]);
    if (m?.front && !aside) {
      it.line.setAttribute('d', lineOf(it, m));
      it.line.style.strokeDasharray = `${ease((tl - 0.35) / 0.4)} 1`;
      it.line.style.opacity = '1';
      if (!prev) walk = `M${m.x},${m.y}`;
      else {
        const e = ease(tl / 0.4);
        walk += `L${prev.x + (m.x - prev.x) * e},${prev.y + (m.y - prev.y) * e}`;
      }
      prev = m;
    } else {
      it.line.style.opacity = '0';
    }
  }
  walkPath.setAttribute('d', walk);
  setMarks(lit);
}

function tick(now) {
  ticking = 0;
  if (at < 0 || !rides) return;
  ticking = requestAnimationFrame(tick);
  const s = scene;
  if (!s) return;
  if (rideState() < 0.98) {   // still flying up: the stop begins once the camera is there
    s.start = now;
    return;
  }
  const t = (now - s.start) / 1000;
  if (!s.slowed && t >= s.cruise) {
    ridePace(WALK.slow);
    s.slowed = true;
  }
  if (!s.built && t >= s.cruise + WALK.settle) build(s);
  if (s.built && s.t0 === undefined && (pick(s) || t > s.cruise + 6)) s.t0 = t;
  if (s.t0 !== undefined) light(s, t - s.t0);
}

// Goes to stop i on the ride: the last stop's windows go, the satellite speeds on (not on arriving
// from the flight up), and the stop's own come.
function visit(i) {
  const arriving = !scene;
  leave();
  scene = { stop: i, start: performance.now(), cruise: arriving ? 0 : WALK.cruise, items: [], hover: -1, open: -1 };
  if (!arriving) ridePace(WALK.fast);
  if (!ticking) ticking = requestAnimationFrame(tick);
}

// The stop's squares go back to ink, and its windows and lines go.
function leave() {
  const s = scene;
  scene = null;
  setMarks([]);
  walkPath.setAttribute('d', '');
  for (const it of s?.items ?? []) {
    it.card.classList.remove('shown');
    it.line.remove();
    setTimeout(() => it.card.remove(), 450);
  }
}

addEventListener('resize', () => { if (scene?.built) stack(scene); });

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
