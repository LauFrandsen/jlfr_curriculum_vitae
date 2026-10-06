// Page behaviour around the graphic: picking it, section reveals, CV entries sending their squares
// into it, project panes, the Explore button, the PDF button and the sound button. (callouts.js runs
// the graphic's callouts on its own, and tour.js the guided tour.)

import { current, dropFrom, reducedMotion, setFocus, start } from './voxel.js';
import { play, setSound, soundOn } from './sound.js';
import './callouts.js';
import './tour.js';

// A graphic of ink squares, picked at random on each visit (?graphic=orb or flower picks one), which
// morphs into the next one in the list every few minutes of the page being on screen.
const GRAPHICS = ['orb', 'flower'];
const ROTATE_SECONDS = 180;
const asked = new URLSearchParams(location.search).get('graphic');
let index = GRAPHICS.includes(asked) ? GRAPHICS.indexOf(asked) : Math.floor(Math.random() * GRAPHICS.length);
const load = async (i) => (await import(`./graphics/${GRAPHICS[i]}.js`)).default;
start(await load(index), {
  every: ROTATE_SECONDS,
  next: () => load(index = (index + 1) % GRAPHICS.length),
});

// Sections fade up as they come into view.
const revealer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealer.unobserve(entry.target);
    }
  }
}, { threshold: 0.08 });
document.querySelectorAll('.reveal').forEach((el) => revealer.observe(el));

// Each experience/project entry, once mostly in view, releases its squares from its marker into the
// graphic, in the entry's own colour (its --dot custom property, if set), which then blends into the ink.
const drops = [...document.querySelectorAll('[data-drop]')];
const dropper = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target;
    const marker = el.querySelector('.tl-marker') || el;
    const r = marker.getBoundingClientRect();
    const color = getComputedStyle(el).getPropertyValue('--dot');
    dropFrom(drops.indexOf(el), r.left + r.width / 2, r.top + r.height / 2, color);
    el.classList.add('dropped');
    dropper.unobserve(el);
  }
}, { threshold: 0.5, rootMargin: '0px 0px -15% 0px' });
drops.forEach((el) => dropper.observe(el));

// The Explore button (the guided tour, tour.js) fades once the visitor starts scrolling.
const explore = document.querySelector('.explore');
addEventListener('scroll', () => explore?.classList.toggle('hidden', scrollY > 40), { passive: true });

// On a phone each section's label sticks to the top while its section is in view (style.css); once
// it has reached the top it's .stuck, and gets the strip of paper the text slides under.
const labels = [...document.querySelectorAll('.cv h2')];
function stick() {
  const top = parseFloat(getComputedStyle(labels[0]).top);   // NaN (auto) where they don't stick
  for (const h of labels) h.classList.toggle('stuck', h.getBoundingClientRect().top <= top + 0.5);
}
if (labels.length) {
  addEventListener('scroll', stick, { passive: true });
  addEventListener('resize', stick);
  // A section still rising into place (.reveal) can carry its label up to the top after the scrolling stops.
  document.querySelector('.cv').addEventListener('transitionend', (e) => {
    if (e.propertyName === 'transform') stick();
  });
  stick();
}

document.getElementById('pdf-button')?.addEventListener('click', () => window.print());

// Sound: off until the visitor turns it on with the speaker button in the corner (sound.js remembers
// it). Turned on while the graphic is in view in the hero, it plays its opening again, now heard.
const soundButton = document.getElementById('sound-button');
function showSound() {
  soundButton.setAttribute('aria-pressed', soundOn());
  soundButton.title = soundOn() ? 'Turn sound off' : 'Turn sound on';
}
if (soundButton) {
  showSound();
  soundButton.addEventListener('click', () => {
    setSound(!soundOn());
    showSound();
    if (soundOn() && scrollY < innerHeight * 0.3) current()?.replay?.();
  });
}

// Projects: clicking one makes the graphic glide aside and swell, the CV dims, and then the project
// pane opens with the full details. Closing glides the graphic back.
const dialog = document.getElementById('project-dialog');
const dialogBody = dialog?.querySelector('.dialog-body');
let opener = null;
let openTimer = 0;

function openProject(article, button) {
  opener = button;
  const title = document.createElement('h2');
  title.id = 'project-dialog-title';
  title.textContent = button.textContent;
  const parts = ['.tl-meta', '.project-summary', '.project-more']
    .map((sel) => article.querySelector(sel)?.cloneNode(true))
    .filter(Boolean);
  dialogBody.replaceChildren(title, ...parts);
  dialog.style.setProperty('--dot', getComputedStyle(article).getPropertyValue('--dot'));

  document.documentElement.classList.add('focusing');
  setFocus(true);
  const delay = reducedMotion.matches ? 0 : 650;
  play('open');
  play('sheet', { at: delay / 1000 });
  clearTimeout(openTimer);
  openTimer = setTimeout(() => {
    dialog.showModal();
    dialog.scrollTop = 0;
  }, delay);
}

function closeProject() {
  if (!dialog.open || dialog.classList.contains('closing')) return;
  play('close');
  dialog.classList.add('closing');
  setTimeout(() => {
    dialog.classList.remove('closing');
    dialog.close();
  }, reducedMotion.matches ? 0 : 280);
}

if (dialog) {
  document.querySelectorAll('.project').forEach((article) => {
    const button = article.querySelector('.project-open');
    button?.addEventListener('click', () => openProject(article, button));
  });
  dialog.querySelector('.dialog-close').addEventListener('click', closeProject);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeProject(); });   // Esc
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeProject(); }); // backdrop
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('focusing');
    setFocus(false);
    opener?.focus({ preventScroll: true });
  });
}
