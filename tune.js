// Live tuning panel for the graphic on the page. Only loaded when the URL contains ?tune.
// Shared sliders (the squares' look, arrivals, CV entries, pointer) come after the graphic's own
// sliders and buttons. "Copy values" copies its whole CONFIG, to paste into its file in graphics/.
// The panel rebuilds itself for the new graphic after a morph.

import { current, getStats, next } from './voxel.js';
import { SOUND, SOUNDS, play, setSound, soundOn } from './sound.js';
import { callOut } from './callouts.js';

const SHARED = [
  { group: 'Squares', colors: true },
  { key: 'dotSize', label: 'Dot size (square + burn)', min: 0.005, max: 0.08, step: 0.001 },
  { key: 'squareSize', label: 'Square (share of dot)', min: 0.05, max: 1, step: 0.01 },
  { key: 'burn', label: 'Burn', min: 0, max: 1.5, step: 0.05 },
  { key: 'brightness', label: 'Ink strength', min: 0.2, max: 2, step: 0.05 },
  { key: 'cameraDistance', label: 'Perspective (low = strong)', min: 1.6, max: 8, step: 0.1 },
  { group: 'Arriving' },
  { key: 'landing', label: 'Landing (brake into place)', min: 0, max: 0.8, step: 0.05 },
  { key: 'slotGlow', label: 'Slot-in burn', min: 0, max: 4, step: 0.05 },
  { key: 'afterglowSeconds', label: 'Afterglow (s)', min: 0, max: 8, step: 0.1 },
  { group: 'CV entries' },
  { key: 'storyFallSeconds', label: 'Entry squares: fall time (s)', min: 0.5, max: 8, step: 0.1 },
  { key: 'storyGlow', label: 'Entry squares: lasting burn', min: 0, max: 1.5, step: 0.05 },
  { key: 'storyIntegrateSeconds', label: 'Entry squares: colour to ink (s)', min: 0.5, max: 20, step: 0.5 },
  { group: 'Pointer pull' },
  { key: 'pullRadius', label: 'Pull radius', min: 0.1, max: 1.5, step: 0.05 },
  { key: 'pullStrength', label: 'Pull strength', min: 0, max: 1, step: 0.01 },
  { key: 'pullGlow', label: 'Pull burn', min: 0, max: 1, step: 0.01 },
];

const style = document.createElement('style');
style.textContent = `
.tune-panel {
  position: fixed; top: 12px; right: 12px; z-index: 10;
  width: min(300px, calc(100vw - 24px)); max-height: calc(100dvh - 76px);   /* clear of the sound button */
  display: flex; flex-direction: column;
  background: rgba(250, 248, 243, 0.94); backdrop-filter: blur(8px);
  border: 1px solid rgba(17, 16, 15, 0.42);
  color: #37332e; font: 12px/1.3 system-ui, sans-serif;
  touch-action: pan-y;
}
.tune-panel header {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 12px; cursor: pointer; user-select: none; font-weight: 600; letter-spacing: 0.05em; color: #11100f;
}
.tune-panel .tune-body { overflow-y: auto; padding: 0 12px 12px; }
.tune-panel.collapsed .tune-body { display: none; }
.tune-panel h4 { margin: 12px 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #11100f; }
.tune-panel label { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; margin: 6px 0; }
.tune-panel output { font-variant-numeric: tabular-nums; color: #11100f; }
.tune-panel input[type=range] { grid-column: 1 / -1; width: 100%; accent-color: #11100f; }
.tune-panel input[type=color] { width: 44px; height: 22px; border: 0; background: none; padding: 0; }
.tune-panel .tune-buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.tune-panel button {
  flex: 1; padding: 6px 8px; cursor: pointer; font: inherit;
  background: transparent; color: #11100f; border: 1px solid #11100f;
}
.tune-panel button:hover { background: #11100f; color: #f5f2ea; }
.tune-panel .tune-stats { margin-top: 8px; opacity: 0.7; font-variant-numeric: tabular-nums; }
.tune-panel select { flex: 2; padding: 5px; font: inherit; border: 1px solid #11100f; background: transparent; color: #11100f; }
`;
document.head.append(style);

const defaults = new Map();   // graphic → its CONFIG as it was first opened here, for Reset
let panel = null;
let stats = null;
let collapsed = false;

const format = (s, v) => (s.step >= 1 ? String(Math.round(v)) : v.toFixed(Math.max(0, -Math.floor(Math.log10(s.step)))));

function open(graphic) {
  const CONFIG = graphic.CONFIG;
  if (!defaults.has(graphic)) defaults.set(graphic, structuredClone(CONFIG));
  const sliders = [...(graphic.sliders || []), ...SHARED];
  const controls = [];

  panel?.remove();
  panel = document.createElement('aside');
  panel.className = 'tune-panel' + (collapsed ? ' collapsed' : '');
  panel.innerHTML = `<header><span>Tune ${graphic.name}</span><span class="tune-caret">${collapsed ? '▸' : '▾'}</span></header><div class="tune-body"></div>`;
  const body = panel.querySelector('.tune-body');
  panel.querySelector('header').addEventListener('click', () => {
    collapsed = panel.classList.toggle('collapsed');
    panel.querySelector('.tune-caret').textContent = collapsed ? '▸' : '▾';
  });

  const colorControl = (key, text) => {
    const label = document.createElement('label');
    label.innerHTML = `<span>${text}</span><input type="color">`;
    const input = label.querySelector('input');
    const toHex = (c) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    const sync = () => { input.value = toHex(CONFIG[key]); };
    input.addEventListener('input', () => {
      const h = input.value;
      CONFIG[key] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    });
    sync();
    controls.push(sync);
    return label;
  };

  for (const s of sliders) {
    if (s.group) {
      const h = document.createElement('h4');
      h.textContent = s.group;
      body.append(h);
      if (s.colors) body.append(colorControl('color', 'Square ink'), colorControl('burnColor', 'Burn ink'));
      continue;
    }
    if (!(s.key in CONFIG)) continue;
    const label = document.createElement('label');
    label.innerHTML = `<span>${s.label}</span><output></output><input type="range" min="${s.min}" max="${s.max}" step="${s.step}">`;
    const input = label.querySelector('input');
    const out = label.querySelector('output');
    const sync = () => { input.value = CONFIG[s.key]; out.textContent = format(s, CONFIG[s.key]); };
    input.addEventListener('input', () => {
      CONFIG[s.key] = Number(input.value);
      out.textContent = format(s, CONFIG[s.key]);
      s.apply?.(CONFIG[s.key]);
    });
    sync();
    controls.push(sync);
    body.append(label);
  }

  const buttons = document.createElement('div');
  buttons.className = 'tune-buttons';
  const button = (text, act) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', () => act(b));
    buttons.append(b);
  };
  // A graphic's own buttons may change its settings (presets), so the sliders follow.
  for (const [text, act] of Object.entries(graphic.actions || {})) {
    button(text, () => {
      act();
      controls.forEach((sync) => sync());
    });
  }
  button('Next graphic', () => next());
  button('Callout: skill', () => callOut('skill'));
  button('Callout: project', () => callOut('project'));
  button('Copy values', async (b) => {
    const round = (c) => c.map((v) => +v.toFixed(3));
    const text = JSON.stringify({ ...CONFIG, color: round(CONFIG.color), burnColor: round(CONFIG.burnColor) }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = 'Copied!';
    } catch {
      prompt('Copy these values:', text);
    }
    setTimeout(() => { b.textContent = 'Copy values'; }, 1500);
  });
  button('Reset', () => {
    const initial = defaults.get(graphic);
    const rebuilds = sliders.filter((s) => s.apply && CONFIG[s.key] !== initial[s.key]);
    Object.assign(CONFIG, structuredClone(initial));
    rebuilds.forEach((s) => s.apply(CONFIG[s.key]));
    controls.forEach((sync) => sync());
  });
  body.append(buttons);

  // Sound (sound.js): the overall volume, the music's level and the effects' room, and any effect on
  // its own, to listen to.
  const soundTitle = document.createElement('h4');
  soundTitle.textContent = 'Sound';
  body.append(soundTitle);
  for (const [key, text, max] of [['volume', 'Volume', 2], ['music', 'Music', 1.5], ['reverb', 'Effects: room', 0.8]]) {
    const label = document.createElement('label');
    label.innerHTML = `<span>${text}</span><output>${SOUND[key].toFixed(2)}</output><input type="range" min="0" max="${max}" step="0.01" value="${SOUND[key]}">`;
    label.querySelector('input').addEventListener('input', (e) => {
      SOUND[key] = Number(e.target.value);
      label.querySelector('output').textContent = SOUND[key].toFixed(2);
    });
    body.append(label);
  }
  const listen = document.createElement('div');
  listen.className = 'tune-buttons';
  const pick = document.createElement('select');
  pick.setAttribute('aria-label', 'Sound to play');
  pick.innerHTML = Object.keys(SOUNDS).map((name) => `<option>${name}</option>`).join('');
  listen.append(pick);
  body.append(listen);
  const playButton = document.createElement('button');
  playButton.textContent = 'Play';
  // An effect that holds until it's let go (like `sweep`) is let go after 8 seconds here.
  const listenTo = (name) => {
    const held = play(name);
    setTimeout(() => held.release(), 8000);
  };
  playButton.addEventListener('click', () => {
    if (soundOn()) {
      listenTo(pick.value);
      return;
    }
    // Turns sound on first (as the page's sound button does), then plays it.
    setSound(true);
    const pageButton = document.getElementById('sound-button');
    pageButton?.setAttribute('aria-pressed', 'true');
    setTimeout(() => listenTo(pick.value), 400);
  });
  listen.append(playButton);

  // Live frame rate and square count, so you can see the cost of each change.
  stats = document.createElement('div');
  stats.className = 'tune-stats';
  body.append(stats);
  document.body.append(panel);
}

let frames = 0, since = performance.now();
(function tick(now) {
  frames++;
  if (now - since > 500 && stats) {
    const { drawn, requested } = getStats();
    const fps = Math.round((frames * 1000) / (now - since));
    stats.textContent = `${fps} fps · ${drawn}${drawn < requested ? ` of ${requested}` : ''} squares`;
    frames = 0;
    since = now;
  }
  requestAnimationFrame(tick);
})(performance.now());

open(current());
document.addEventListener('voxel:graphic', () => open(current()));
