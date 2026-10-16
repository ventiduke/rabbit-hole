// Touch zones + gestures + keyboard fallback.
// sample() is called once per physics step and returns a snapshot of held
// states plus the edge events (presses/swipes) queued since the last sample.

import { CONFIG } from './config.js';

const I = CONFIG.input;

export function createInput(canvas) {
  // pointerId -> { side, x0, y0, t0, kind: 'steer' | 'down' | 'up', decided }
  const pointers = new Map();
  const keys = new Set();
  const queued = { press: false, down: false, ears: false, jump: false, tap: false };
  let prevBoth = false;

  const sideOf = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    return clientX - rect.left < rect.width / 2 ? 'left' : 'right';
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, {
      side: sideOf(e.clientX),
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
      kind: 'steer',
      decided: false,
    });
    queued.press = true;
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.side = sideOf(e.clientX);
    if (p.decided) return;
    if ((performance.now() - p.t0) / 1000 > I.swipeTime) {
      p.decided = true;
      return;
    }
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;
    if (dy > I.swipeDistance && dy > Math.abs(dx) * I.swipeAxisBias) {
      // Swipe down: this finger now holds Dive/Burrow and stops steering.
      p.kind = 'down';
      p.decided = true;
      queued.down = true;
    } else if (-dy > I.swipeDistance && -dy > Math.abs(dx) * I.swipeAxisBias) {
      // Swipe up: jump (hold the finger down for a higher jump).
      p.kind = 'up';
      p.decided = true;
      queued.jump = true;
    }
  });

  const release = (e) => {
    const p = pointers.get(e.pointerId);
    // A quick touch that never became a swipe is a tap (lets go of a wall slide).
    if (p && p.kind === 'steer' && e.type === 'pointerup' && (performance.now() - p.t0) / 1000 < I.tapTime) queued.tap = true;
    pointers.delete(e.pointerId);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const GAME_KEYS = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    queued.press = true;
    if (e.code === 'Space') queued.ears = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') queued.down = true;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') queued.jump = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    pointers.clear();
  });

  const has = (...codes) => codes.some((c) => keys.has(c));

  return {
    sample() {
      const all = [...pointers.values()];
      const steerTouches = all.filter((p) => p.kind === 'steer');
      const tLeft = steerTouches.some((p) => p.side === 'left');
      const tRight = steerTouches.some((p) => p.side === 'right');
      const left = tLeft || has('ArrowLeft', 'KeyA');
      const right = tRight || has('ArrowRight', 'KeyD');
      const both = tLeft && tRight;

      const frame = {
        left,
        right,
        steer: (right ? 1 : 0) - (left ? 1 : 0),
        earsPressed: queued.ears || (both && !prevBoth),
        // Ears stay open while any steering finger is down (lift one to steer).
        earsHeld: steerTouches.length > 0 || has('Space'),
        downPressed: queued.down,
        downHeld: all.some((p) => p.kind === 'down') || has('KeyS', 'ArrowDown'),
        tap: queued.tap,
        jumpPressed: queued.jump,
        jumpHeld: all.some((p) => p.kind === 'up') || has('KeyW', 'ArrowUp'),
        pressed: queued.press,
        restart: has('KeyR'),
      };
      prevBoth = both;
      queued.press = queued.down = queued.ears = queued.jump = queued.tap = false;
      return frame;
    },
  };
}
