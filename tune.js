// Live tuning panel for the orb. Only loaded when the URL contains ?tune.

import { CONFIG, setDotCount, speakNow, gather, getStats } from './orb.js';

const SLIDERS = [
  { group: 'Dots' },
  { key: 'dotCount', label: 'Number of dots', min: 1000, max: 20000, step: 500, apply: setDotCount },
  { key: 'dotSize', label: 'Dot size (square + burn)', min: 0.005, max: 0.08, step: 0.001 },
  { key: 'squareSize', label: 'Square (share of dot)', min: 0.05, max: 1, step: 0.01 },
  { key: 'burn', label: 'Burn', min: 0, max: 1.5, step: 0.05 },
  { key: 'brightness', label: 'Ink strength', min: 0.2, max: 2, step: 0.05 },
  { group: 'Flow' },
  { key: 'flowCount', label: 'Flowing dots', min: 0, max: 1000, step: 10, apply: () => setDotCount(CONFIG.dotCount) },
  { key: 'flowSeconds', label: 'Cycle length (s)', min: 4, max: 60, step: 1 },
  { key: 'flowLinger', label: 'Time resting in slot', min: 0, max: 0.9, step: 0.05 },
  { key: 'gravity', label: 'Gravity (slow start, fast finish)', min: 0, max: 12, step: 0.1 },
  { key: 'landing', label: 'Landing (brake into slot)', min: 0, max: 0.8, step: 0.05 },
  { key: 'flowSwirl', label: 'Spiral in', min: 0, max: 3, step: 0.05 },
  { key: 'slotGlow', label: 'Slot-in burn', min: 0, max: 4, step: 0.05 },
  { key: 'afterglowSeconds', label: 'Afterglow (s)', min: 0, max: 8, step: 0.1 },
  { key: 'gatherSeconds', label: 'Press: draw-in time (s)', min: 0.2, max: 5, step: 0.1 },
  { key: 'gatherJitter', label: 'Press: arrival spread (s)', min: 0, max: 1.5, step: 0.05 },
  { key: 'respawnDelay', label: 'Press: pause before respawn (s)', min: 0, max: 20, step: 0.5 },
  { group: 'Ripples' },
  { key: 'rippleStrength', label: 'Ripple strength (0 = off)', min: 0, max: 0.05, step: 0.001 },
  { key: 'rippleSpeed', label: 'Ripple speed', min: 0.05, max: 1.5, step: 0.05 },
  { key: 'rippleSeconds', label: 'Ripple length (s)', min: 0.2, max: 5, step: 0.1 },
  { group: 'CV entries' },
  { key: 'storyFallSeconds', label: 'Entry dots: fall time (s)', min: 0.5, max: 8, step: 0.1 },
  { key: 'storyGlow', label: 'Entry dots: lasting burn', min: 0, max: 1.5, step: 0.05 },
  { key: 'storyIntegrateSeconds', label: 'Entry dots: colour to ink (s)', min: 0.5, max: 20, step: 0.5 },
  { group: 'Speech' },
  { key: 'speech', label: 'Speech amount (0 = off)', min: 0, max: 1, step: 0.05 },
  { key: 'voiceAmplitude', label: 'Core swell', min: 0, max: 0.3, step: 0.005 },
  { key: 'voiceSpeed', label: 'Wobble speed', min: 0.1, max: 4, step: 0.05 },
  { key: 'syllableMs', label: 'Syllable length (ms)', min: 30, max: 300, step: 5 },
  { key: 'responsiveness', label: 'Snappiness', min: 2, max: 40, step: 1 },
  { key: 'burstSeconds', label: 'Burst length (s)', min: 0.5, max: 8, step: 0.1 },
  { key: 'pauseSeconds', label: 'Pause between (s)', min: 0.2, max: 10, step: 0.1 },
  { group: 'Loose particles' },
  { key: 'looseFraction', label: 'Amount (share of shell)', min: 0, max: 0.5, step: 0.01, apply: () => setDotCount(CONFIG.dotCount) },
  { key: 'looseSpread', label: 'Distance out', min: 0, max: 0.5, step: 0.005 },
  { key: 'looseDrift', label: 'Wander', min: 0, max: 0.2, step: 0.005 },
  { key: 'looseVoice', label: 'Push when speaking', min: 0, max: 0.6, step: 0.01 },
  { group: 'Breathing' },
  { key: 'breathSeconds', label: 'Breath length (s)', min: 1, max: 20, step: 0.5 },
  { key: 'breathDepth', label: 'Breath depth', min: 0, max: 0.2, step: 0.005 },
  { key: 'tilt', label: 'Viewing angle', min: 0, max: 1.2, step: 0.01 },
  { key: 'cameraDistance', label: 'Perspective (low = strong)', min: 1.6, max: 8, step: 0.1 },
  { group: 'Pointer pull' },
  { key: 'pullRadius', label: 'Pull radius', min: 0.1, max: 1.5, step: 0.05 },
  { key: 'pullStrength', label: 'Pull strength', min: 0, max: 1, step: 0.01 },
  { key: 'pullGlow', label: 'Pull burn', min: 0, max: 1, step: 0.01 },
];

const DEFAULTS = structuredClone(CONFIG);

const style = document.createElement('style');
style.textContent = `
.tune-panel {
  position: fixed; top: 12px; right: 12px; z-index: 10;
  width: min(300px, calc(100vw - 24px)); max-height: calc(100dvh - 24px);
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
`;
document.head.append(style);

const panel = document.createElement('aside');
panel.className = 'tune-panel';
panel.dataset.noPull = '';
panel.innerHTML = `<header><span>Tune orb</span><span class="tune-caret">▾</span></header><div class="tune-body"></div>`;
const body = panel.querySelector('.tune-body');
panel.querySelector('header').addEventListener('click', () => {
  panel.classList.toggle('collapsed');
  panel.querySelector('.tune-caret').textContent = panel.classList.contains('collapsed') ? '▸' : '▾';
});

const format = (s, v) => (s.step >= 1 ? String(Math.round(v)) : v.toFixed(Math.max(0, -Math.floor(Math.log10(s.step)))));
const controls = [];

for (const s of SLIDERS) {
  if (s.group) {
    const h = document.createElement('h4');
    h.textContent = s.group;
    body.append(h);
    if (s.group === 'Dots') body.append(colorControl('color', 'Square ink'), colorControl('burnColor', 'Burn ink'));
    continue;
  }
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

function colorControl(key, text) {
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
}

const buttons = document.createElement('div');
buttons.className = 'tune-buttons';
buttons.innerHTML = `<button data-act="gather">Draw in</button><button data-act="speak">Speak now</button><button data-act="copy">Copy values</button><button data-act="reset">Reset</button>`;
buttons.addEventListener('click', async (e) => {
  const act = e.target.dataset.act;
  if (act === 'gather') gather();
  if (act === 'speak') speakNow();
  if (act === 'reset') {
    Object.assign(CONFIG, structuredClone(DEFAULTS));
    setDotCount(CONFIG.dotCount);
    controls.forEach((sync) => sync());
  }
  if (act === 'copy') {
    const round = (c) => c.map((v) => +v.toFixed(3));
    const values = { ...CONFIG, color: round(CONFIG.color), burnColor: round(CONFIG.burnColor) };
    const text = JSON.stringify(values, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = 'Copied!';
    } catch {
      prompt('Copy these values:', text);
    }
    setTimeout(() => { e.target.textContent = 'Copy values'; }, 1500);
  }
});
body.append(buttons);

// Live frame rate and dot count, so you can see the cost of each change.
const stats = document.createElement('div');
stats.className = 'tune-stats';
body.append(stats);
let frames = 0, since = performance.now();
(function tick(now) {
  frames++;
  if (now - since > 500) {
    const { drawn, requested } = getStats();
    const fps = Math.round((frames * 1000) / (now - since));
    stats.textContent = `${fps} fps · ${drawn}${drawn < requested ? ` of ${requested}` : ''} dots`;
    frames = 0;
    since = now;
  }
  requestAnimationFrame(tick);
})(performance.now());

document.body.append(panel);
