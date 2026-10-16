// World drawing with placeholder shapes. Everything is drawn in world units;
// the caller sets up the scale so the shaft width fills the canvas.

import { CONFIG } from './config.js';

const W = CONFIG.world;
const lerp = (a, b, t) => a + (b - a) * t;

// Deterministic hash so background speckles stay put as the camera moves.
const hash = (n) => {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

export function drawWorld(ctx, { camera, player, ledges, alpha }) {
  const camY = lerp(camera.prevY, camera.y, alpha);
  const viewH = camera.viewH;

  // Soil, darkening slowly with depth.
  const depthTint = Math.min(1, Math.max(0, camY / 20000));
  ctx.fillStyle = `rgb(${lerp(58, 26, depthTint)}, ${lerp(38, 18, depthTint)}, ${lerp(24, 14, depthTint)})`;
  ctx.fillRect(0, 0, W.width, viewH);

  ctx.save();
  ctx.translate(0, -camY);

  // Background speckles in 60u cells: cheap motion cue.
  const cell = 60;
  const first = Math.floor(camY / cell);
  const last = Math.ceil((camY + viewH) / cell);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  for (let row = first; row <= last; row++) {
    for (let col = 0; col < W.width / cell; col++) {
      const h = hash(row * 73856093 ^ col * 19349663);
      if (h > 0.55) continue;
      const x = col * cell + hash(h * 1e9) * cell;
      const y = row * cell + hash(h * 7e8) * cell;
      ctx.fillRect(x, y, 3 + h * 6, 2 + h * 4);
    }
  }

  // Depth markers every 10 m.
  const markEvery = W.unitsPerMeter * 10;
  ctx.fillStyle = 'rgba(255, 230, 200, 0.22)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let m = Math.ceil(camY / markEvery); m * markEvery < camY + viewH; m++) {
    if (m <= 0) continue;
    ctx.fillRect(W.width / 2 - 14, m * markEvery, 28, 1);
    ctx.fillText(`${m * 10}m`, W.width / 2, m * markEvery - 4);
  }

  // Ledges.
  for (const l of ledges) {
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(l.x, l.y, l.w, l.h);
    ctx.fillStyle = '#5f8f3e';
    ctx.fillRect(l.x, l.y, l.w, 4);
  }

  // Walls with grooves that scroll with the world.
  const t = W.wallThickness;
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(0, camY, t, viewH);
  ctx.fillRect(W.width - t, camY, t, viewH);
  ctx.fillStyle = '#3d2818';
  const groove = 34;
  for (let g = Math.floor(camY / groove); g * groove < camY + viewH; g++) {
    const off = hash(g) * 8;
    ctx.fillRect(2, g * groove + off, t - 6, 3);
    ctx.fillRect(W.width - t + 4, g * groove + 17 - off, t - 6, 3);
  }

  drawRabbit(ctx, player, alpha);
  ctx.restore();
}

function drawRabbit(ctx, p, alpha) {
  const x = lerp(p.prevX, p.x, alpha);
  const y = lerp(p.prevY, p.y, alpha);
  const sq = p.squash * 0.35;
  const w = p.w * (1 + sq);
  const h = p.h * (1 - sq);
  const cx = x + p.w / 2;
  const bottom = y + p.h;

  ctx.save();
  ctx.translate(cx, bottom);

  // Ears: trail upward while falling.
  const earLen = 14 * (1 - sq);
  ctx.fillStyle = '#e8ddd0';
  ctx.fillRect(-w / 2 + 3, -h - earLen, 5, earLen + 2);
  ctx.fillRect(w / 2 - 8, -h - earLen, 5, earLen + 2);
  ctx.fillStyle = '#e9a3a3';
  ctx.fillRect(-w / 2 + 4.5, -h - earLen + 3, 2, earLen - 4);
  ctx.fillRect(w / 2 - 6.5, -h - earLen + 3, 2, earLen - 4);

  // Body.
  ctx.fillStyle = '#f2ebe2';
  roundRect(ctx, -w / 2, -h, w, h, 7);
  ctx.fill();

  // Eye, on the facing side.
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(p.facing * w * 0.2 - 1.5, -h + 7, 3, 3);

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
