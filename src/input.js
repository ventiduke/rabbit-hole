// Touch zones (left/right half of the canvas) + keyboard fallback.
// Exposes a simple state the game reads once per step.

export function createInput(canvas) {
  const pointers = new Map(); // pointerId -> 'left' | 'right'
  const keys = new Set();
  let pressedThisFrame = false;

  const sideOf = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    return clientX - rect.left < rect.width / 2 ? 'left' : 'right';
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, sideOf(e.clientX));
    pressedThisFrame = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, sideOf(e.clientX));
  });
  const release = (e) => pointers.delete(e.pointerId);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressedThisFrame = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    pointers.clear();
  });

  const has = (...codes) => codes.some((c) => keys.has(c));

  return {
    get left() {
      return has('ArrowLeft', 'KeyA') || [...pointers.values()].includes('left');
    },
    get right() {
      return has('ArrowRight', 'KeyD') || [...pointers.values()].includes('right');
    },
    // -1, 0 or 1. Both held cancels out (both halves will become Ears in M2).
    get steer() {
      return (this.right ? 1 : 0) - (this.left ? 1 : 0);
    },
    isDown: (code) => keys.has(code),
    // True if any key/touch went down since the last call.
    consumePress() {
      const p = pressedThisFrame;
      pressedThisFrame = false;
      return p;
    },
  };
}
