// Page behaviour around the orb: section reveals, CV entries sending their dots into the orb,
// project panes, the scroll cue, the PDF button, and gliding down to the CV after the ball is pressed.

import { CONFIG, dropFrom, setFocus, reducedMotion } from './orb.js';

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

// Each experience/project entry, once mostly in view, releases its dots from its marker into the orb,
// in the entry's own colour (its --dot custom property), which then blends into the orb's blue.
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

// The scroll cue fades once the visitor starts scrolling.
const cue = document.querySelector('.scroll-cue');
addEventListener('scroll', () => cue?.classList.toggle('hidden', scrollY > 40), { passive: true });

document.getElementById('pdf-button')?.addEventListener('click', () => window.print());

// Projects: clicking one makes the orb glide aside and swell as it draws the dots in, the CV dims,
// and then the project pane opens with the full details. Closing glides the orb back.
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
  clearTimeout(openTimer);
  openTimer = setTimeout(() => {
    dialog.showModal();
    dialog.scrollTop = 0;
  }, reducedMotion.matches ? 0 : 650);
}

function closeProject() {
  if (!dialog.open || dialog.classList.contains('closing')) return;
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

// Pressing the ball in the hero: let the dots be drawn in, then glide down to the CV.
document.addEventListener('orb:pressed', (e) => {
  if (!e.detail.inHero) return;
  const wait = reducedMotion.matches ? 0 : (CONFIG.gatherSeconds + CONFIG.gatherJitter) * 1000 + 250;
  setTimeout(() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }), wait);
});
