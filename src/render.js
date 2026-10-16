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

export function drawWorld(ctx, { camera, player, ledges, fx, alpha }) {
  const camY = lerp(camera.prevY, camera.y, alpha);
  const viewH = camera.viewH;
  const shake = fx.shakeOffset;

  // Soil, darkening slowly with depth.
  const depthTint = Math.min(1, Math.max(0, camY / 20000));
  ctx.fillStyle = `rgb(${lerp(58, 26, depthTint)}, ${lerp(38, 18, depthTint)}, ${lerp(24, 14, depthTint)})`;
  ctx.fillRect(0, 0, W.width, viewH);

  ctx.save();
  ctx.translate(shake.x, -camY + shake.y);

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

  for (const l of ledges) drawLedge(ctx, l);

  // Wall burrowing happens behind the wall surface.
  const inWall = player.state === 'wallBurrow';
  if (inWall) drawRabbit(ctx, player, alpha);
  drawWalls(ctx, camY, viewH, inWall);
  if (!inWall) drawRabbit(ctx, player, alpha);

  fx.drawWorld(ctx);

  const px = lerp(player.prevX, player.x, alpha) + player.w / 2;
  const py = lerp(player.prevY, player.y, alpha);
  drawTimingBar(ctx, player, px, py);
  fx.drawLabels(ctx, px, py, W.wallThickness + 4, W.width - W.wallThickness - 4);
  ctx.restore();
}

function drawLedge(ctx, l) {
  ctx.fillStyle = l.fragile ? '#8a7258' : '#6b4a2f';
  ctx.fillRect(l.x, l.y, l.w, l.h);
  ctx.fillStyle = l.fragile ? '#9aa86a' : '#5f8f3e';
  ctx.fillRect(l.x, l.y, l.w, 4);
  if (!l.fragile) return;
  // Cracks.
  ctx.strokeStyle = 'rgba(30, 18, 10, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = l.x + 12; x < l.x + l.w - 6; x += 22) {
    ctx.moveTo(x, l.y + 4);
    ctx.lineTo(x + 5, l.y + 9);
    ctx.lineTo(x + 1, l.y + l.h);
  }
  ctx.stroke();
}

function drawWalls(ctx, camY, viewH, translucent) {
  const t = W.wallThickness;
  ctx.globalAlpha = translucent ? 0.75 : 1;
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
  ctx.globalAlpha = 1;
}

function drawRabbit(ctx, p, alpha) {
  const x = lerp(p.prevX, p.x, alpha);
  const y = lerp(p.prevY, p.y, alpha);
  const state = p.state;
  const cx = x + p.w / 2;
  const cy = y + p.h / 2;

  ctx.save();
  ctx.translate(cx, cy);

  let w = p.w;
  let h = p.h;
  let ears = 'up';
  if (state === 'ears') ears = 'out';
  if (state === 'dive' || state === 'drill' || state === 'dig' || state === 'burrow') {
    ears = 'down';
    w *= 0.75;
    h *= 1.15;
  }
  if (state === 'wallBurrow') {
    // Head-first into the wall.
    ears = 'down';
    ctx.rotate(-p.move.side * Math.PI / 2);
  }
  if (state === 'recover') ctx.rotate(Math.sin(p.time * 30) * 0.25);
  if (state === 'wall') {
    // Feet against the wall: lean toward it.
    ctx.translate(p.move.side * 2, 0);
    ctx.rotate(p.move.side * 0.25);
    ears = 'back';
  }
  const sq = p.squash * 0.35;
  w *= 1 + sq;
  h *= 1 - sq;
  ctx.translate(0, (p.h - h) / 2);

  const fur = state === 'recover' ? '#bdb3a8' : '#f2ebe2';
  const earFur = state === 'recover' ? '#b0a69b' : '#e8ddd0';

  // Ears.
  ctx.fillStyle = earFur;
  if (ears === 'up' || ears === 'back') {
    const len = 14 * (1 - sq);
    const lean = ears === 'back' ? -p.move.side * 4 : 0;
    drawEar(ctx, -w / 2 + 5.5, -h / 2, len, lean);
    drawEar(ctx, w / 2 - 5.5, -h / 2, len, lean);
  } else if (ears === 'out') {
    // Spread like a parachute.
    ctx.save();
    ctx.translate(-w / 2 + 2, -h / 2 + 4);
    ctx.rotate(-1.25);
    ctx.fillRect(-2.5, -20, 5, 20);
    ctx.fillStyle = '#e9a3a3';
    ctx.fillRect(-1, -17, 2, 14);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = earFur;
    ctx.translate(w / 2 - 2, -h / 2 + 4);
    ctx.rotate(1.25);
    ctx.fillRect(-2.5, -20, 5, 20);
    ctx.fillStyle = '#e9a3a3';
    ctx.fillRect(-1, -17, 2, 14);
    ctx.restore();
  } else if (ears === 'down') {
    // Head-first: ears pressed forward like a diver's arms.
    ctx.fillRect(-4, h / 2 - 2, 3, 12);
    ctx.fillRect(1, h / 2 - 2, 3, 12);
  }

  // Body.
  ctx.fillStyle = fur;
  roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(7, w / 2));
  ctx.fill();

  // Eye: on the facing side, or near the bottom when head-down.
  ctx.fillStyle = '#2a1a10';
  if (ears === 'down') ctx.fillRect(-1.5, h / 2 - 8, 3, 3);
  else ctx.fillRect(p.facing * w * 0.2 - 1.5, -h / 2 + 7, 3, 3);

  ctx.restore();

  // Speed lines while diving.
  if (state === 'dive' || state === 'drill') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      const lx = cx + i * 7;
      const off = (p.time * 900 + i * 13) % 20;
      ctx.moveTo(lx, y - 10 - off);
      ctx.lineTo(lx, y - 26 - off);
    }
    ctx.stroke();
  }
}

function drawEar(ctx, x, top, len, lean) {
  ctx.save();
  ctx.translate(x, top + 2);
  ctx.rotate(lean * 0.08);
  ctx.fillRect(-2.5, -len - 2, 5, len + 2);
  ctx.fillStyle = '#e9a3a3';
  ctx.fillRect(-1, -len + 1, 2, len - 4);
  ctx.restore();
}

// Hold-time bar above the rabbit. The gold band is the perfect window.
function drawTimingBar(ctx, p, cx, top) {
  const bw = 64;
  const bh = 6;
  const t = W.wallThickness;
  const x = Math.max(t + 3, Math.min(W.width - t - 3 - bw, cx - bw / 2));
  const y = top - 28;
  if (p.recover > 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#8f8379';
    ctx.fillRect(x, y, bw * (p.recover / CONFIG.moves.recoveryTime), bh);
    return;
  }
  const m = p.move;
  if (!m) return;
  const k = (t) => Math.max(0, Math.min(1, t / m.maxHold));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
  if (m.window) {
    ctx.fillStyle = p.inWindow ? '#fff3a0' : 'rgba(255, 216, 74, 0.75)';
    ctx.fillRect(x + bw * k(m.window[0]), y, bw * (k(m.window[1]) - k(m.window[0])), bh);
  }
  ctx.fillStyle = p.inWindow ? '#ffffff' : 'rgba(242, 235, 226, 0.85)';
  ctx.fillRect(x + bw * k(m.t) - 1, y - 2, 2, bh + 4);
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
