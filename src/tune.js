// Live tuning panel, for feel testing on a phone: open the game with ?tune.
// A ⚙ button opens a list of sliders that change CONFIG values on the spot
// (the game pauses while the panel is open). Changes are remembered in
// localStorage and only apply with ?tune; "Copy changes" gives a JSON list of
// everything that differs from the defaults, to paste back into config.js.

import { CONFIG } from './config.js';

const STORAGE_KEY = 'rabbit-hole.tune';

// [config path, min, max, step]
const GROUPS = [
  ['Falling', [
    ['player.gravity', 400, 1600, 20],
    ['player.terminalVelocity', 200, 600, 10],
    ['player.hardLandingSpeed', 300, 1200, 10],
  ]],
  ['Steering', [
    ['player.airSteerSpeed', 100, 400, 5],
    ['player.airSteerAccel', 300, 2400, 50],
    ['player.airSteerDecel', 100, 2400, 50],
    ['player.groundSteerSpeed', 150, 500, 10],
  ]],
  ['Jump', [
    ['player.jumpSpeed', 200, 600, 10],
    ['player.coyoteTime', 0, 0.25, 0.01],
    ['player.jumpBuffer', 0, 0.3, 0.01],
  ]],
  ['Wall slide', [
    ['moves.wall.fallSpeed', 40, 350, 5],
    ['moves.wall.maxHold', 0.5, 4, 0.1],
    ['moves.wall.autoGrabSpeed', 0, 600, 10],
    ['moves.wall.awayDelay', 0, 0.6, 0.01],
    ['moves.wall.jumpVx', 200, 800, 10],
    ['moves.wall.jumpVy', -500, 0, 10],
    ['moves.wall.perfectJumpVx', 200, 900, 10],
    ['moves.wall.perfectJumpVy', -600, 0, 10],
    ['moves.wall.perfect.0', 0, 3, 0.05],
    ['moves.wall.perfect.1', 0, 3, 0.05],
  ]],
  ['Ears', [
    ['moves.ears.fallSpeed', 20, 250, 5],
    ['moves.ears.steerSpeed', 150, 800, 10],
    ['moves.ears.maxHold', 0.5, 4, 0.1],
    ['moves.ears.perfect.0', 0, 3, 0.05],
    ['moves.ears.perfect.1', 0, 3, 0.05],
  ]],
  ['Dive', [
    ['moves.dive.speed', 400, 1400, 10],
    ['moves.dive.accel', 600, 5000, 100],
    ['moves.dive.maxHold', 0.4, 3, 0.05],
    ['moves.dive.perfect.0', 0, 2, 0.05],
    ['moves.dive.perfect.1', 0, 2, 0.05],
  ]],
  ['Chains', [
    ['chains.ricochet.boost', 0, 0.5, 0.01],
    ['chains.ricochet.liftDecay', 0, 1, 0.05],
    ['chains.spear.vx', 200, 900, 10],
    ['chains.spear.pierce', 0, 8, 1],
    ['chains.popUp.speed', 100, 600, 10],
    ['chains.earCatch.fallSpeed', 10, 200, 5],
  ]],
  ['Camera', [
    ['camera.anchor', 0.1, 0.6, 0.01],
    ['camera.lookAhead', 0, 200, 5],
  ]],
  ['Level (new sections)', [
    ['difficulty.gap.0.0', 100, 1200, 20],
    ['difficulty.gap.0.1', 100, 1400, 20],
    ['level.bands.weights.narrow', 0, 1, 0.05],
    ['level.bands.weights.wide', 0, 1, 0.05],
  ]],
  ['Touch', [
    ['input.swipeDistance', 8, 60, 1],
    ['input.tapTime', 0.1, 0.4, 0.01],
  ]],
];

// Find the object holding a dotted path's last key, e.g. 'moves.dive.perfect.0'.
function locate(path) {
  const keys = path.split('.');
  let o = CONFIG;
  for (const k of keys.slice(0, -1)) {
    o = o?.[k];
  }
  const key = keys.at(-1);
  return o && typeof o[key] === 'number' ? { o, key } : null;
}

const get = (path) => {
  const r = locate(path);
  return r ? r.o[r.key] : undefined;
};
const set = (path, v) => {
  const r = locate(path);
  if (r) r.o[r.key] = v;
};

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function save(changes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(changes));
  } catch {
    // Storage blocked: changes last until reload.
  }
}

const decimals = (step) => (String(step).split('.')[1] ?? '').length;

// onRestart: start the run / drill over; onClose: the panel was closed.
export function createTuner({ onRestart, onClose }) {
  const defaults = {};
  for (const [, params] of GROUPS) {
    for (const [path] of params) {
      if (get(path) === undefined) console.warn('tune: no such config value', path);
      else defaults[path] = get(path);
    }
  }
  const changes = {};
  for (const [path, v] of Object.entries(load())) {
    if (path in defaults && typeof v === 'number') {
      changes[path] = v;
      set(path, v);
    }
  }

  injectStyle();
  const button = el('button', { id: 'tune-toggle', title: 'Tuning' }, '⚙');
  const panel = el('div', { id: 'tune-panel', hidden: true });
  document.body.append(button, panel);

  const header = el('div', { className: 'tune-head' });
  const close = el('button', {}, 'Close ▶');
  const restart = el('button', {}, 'Restart');
  const copy = el('button', {}, 'Copy changes');
  const reset = el('button', {}, 'Reset all');
  header.append(close, restart, copy, reset);
  const out = el('textarea', { readOnly: true, rows: 3, className: 'tune-out' });
  panel.append(header, out);

  const rows = {};
  for (const [title, params] of GROUPS) {
    const group = el('details', {}, el('summary', {}, title));
    for (const [path, min, max, step] of params) {
      if (!(path in defaults)) continue;
      const label = el('span', { className: 'tune-label' }, path.split('.').slice(-2).join('.'));
      const value = el('span', { className: 'tune-value' });
      const undo = el('button', { className: 'tune-undo', title: `default ${defaults[path]}` }, '↺');
      const slider = el('input', { type: 'range', min, max, step });
      const row = el('div', { className: 'tune-row' }, el('div', { className: 'tune-top' }, label, value, undo), slider);
      slider.addEventListener('input', () => update(path, Number(slider.value)));
      undo.addEventListener('click', () => update(path, defaults[path]));
      rows[path] = { row, slider, value, step };
      group.append(row);
    }
    panel.append(group);
  }

  function update(path, v) {
    set(path, v);
    if (v === defaults[path]) delete changes[path];
    else changes[path] = v;
    save(changes);
    refresh();
  }

  function refresh() {
    for (const [path, r] of Object.entries(rows)) {
      const v = get(path);
      r.slider.value = v;
      r.value.textContent = v.toFixed(decimals(r.step));
      r.row.classList.toggle('changed', path in changes);
    }
    const n = Object.keys(changes).length;
    out.value = n ? JSON.stringify(changes, null, 1) : '(no changes yet: everything is at its default)';
    copy.textContent = n ? `Copy changes (${n})` : 'Copy changes';
  }

  const setOpen = (open) => {
    panel.hidden = !open;
    button.hidden = open;
    if (!open) onClose?.();
  };
  button.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false));
  restart.addEventListener('click', () => {
    setOpen(false);
    onRestart?.();
  });
  reset.addEventListener('click', () => {
    for (const path of Object.keys(changes)) set(path, defaults[path]);
    for (const path of Object.keys(changes)) delete changes[path];
    save(changes);
    refresh();
  });
  copy.addEventListener('click', async () => {
    out.select();
    try {
      await navigator.clipboard.writeText(out.value);
      copy.textContent = 'Copied ✓';
    } catch {
      document.execCommand?.('copy'); // older browsers; otherwise long-press the box
    }
  });
  // Keep the game's own key and touch handlers out of the panel.
  for (const type of ['keydown', 'pointerdown', 'touchstart']) {
    panel.addEventListener(type, (e) => e.stopPropagation());
  }

  refresh();
  return {
    get open() {
      return !panel.hidden;
    },
  };
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

function injectStyle() {
  const css = `
#tune-toggle { position: fixed; left: 8px; bottom: 8px; z-index: 10; width: 40px; height: 40px;
  border-radius: 20px; border: 1px solid #6a5440; background: rgba(30, 20, 14, 0.8); color: #f2ebe2;
  font-size: 20px; }
#tune-panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 10; width: min(380px, 62vw);
  overflow-y: auto; background: rgba(22, 14, 9, 0.94); color: #f2ebe2; padding: 8px 10px;
  font: 13px system-ui, sans-serif; box-sizing: border-box; -webkit-user-select: text; user-select: text;
  touch-action: pan-y; }
#tune-panel[hidden], #tune-toggle[hidden] { display: none; }
#tune-panel button { background: #3a2a1d; color: #f2ebe2; border: 1px solid #6a5440; border-radius: 6px;
  padding: 6px 8px; font: inherit; }
.tune-head { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.tune-out { width: 100%; box-sizing: border-box; background: #120b07; color: #ffd84a; border: 1px solid #4a3a2c;
  font: 11px ui-monospace, monospace; }
#tune-panel summary { padding: 7px 0; font-weight: bold; color: #ffd84a; }
.tune-row { padding: 3px 0 6px; }
.tune-top { display: flex; align-items: center; gap: 6px; }
.tune-label { flex: 1; color: #cbb9a6; }
.tune-value { font-variant-numeric: tabular-nums; }
.tune-row input { width: 100%; }
#tune-panel .tune-undo { padding: 0 6px; visibility: hidden; }
.tune-row.changed .tune-label, .tune-row.changed .tune-value { color: #ffd84a; }
.tune-row.changed .tune-undo { visibility: visible; }`;
  document.head.append(el('style', { textContent: css }));
}
