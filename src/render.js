// World drawing with placeholder shapes. Everything is drawn in world units;
// the caller sets up the scale so the world width fills the canvas.

import { CONFIG } from './config.js';
import { drawHazards } from './entities/hazards.js';
import { drawRocks } from './entities/rockfall.js';
import { T, TILE, COLS, isSolid } from './level/tiles.js';

const W = CONFIG.world;
const lerp = (a, b, t) => a + (b - a) * t;

// Deterministic hash so per-tile details stay put as the camera moves.
const hash = (n) => {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

export function drawWorld(ctx, { camera, player, level, fx, alpha }) {
  const camY = lerp(camera.prevY, camera.y, alpha);
  const viewH = camera.viewH;
  const shake = fx.shakeOffset;

  // Tunnel interior, darkening slowly with depth.
  const k = Math.min(1, Math.max(0, camY / 20000));
  ctx.fillStyle = `rgb(${lerp(30, 14, k)}, ${lerp(20, 10, k)}, ${lerp(13, 8, k)})`;
  ctx.fillRect(0, 0, W.width, viewH);

  ctx.save();
  ctx.translate(shake.x, -camY + shake.y);

  // Depth markers every 10 m (behind the terrain).
  const markEvery = W.unitsPerMeter * 10;
  ctx.fillStyle = 'rgba(255, 230, 200, 0.16)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let m = Math.ceil(camY / markEvery); m * markEvery < camY + viewH; m++) {
    if (m <= 0) continue;
    ctx.fillText(`${m * 10}m`, W.width - TILE - 4, m * markEvery - 3);
  }

  drawTiles(ctx, level.map, camY, viewH, level.time);
  drawHazards(ctx, level);

  const blink = player.invuln > 0 && !player.dead && Math.floor(player.invuln * 12) % 2 === 0;
  if (!blink) drawRabbit(ctx, player, alpha);
  drawRocks(ctx, level, camY);

  fx.drawWorld(ctx);

  const px = lerp(player.prevX, player.x, alpha) + player.w / 2;
  const py = lerp(player.prevY, player.y, alpha);
  drawTimingBar(ctx, player, px, py);
  fx.drawLabels(ctx, px, py, W.wallThickness + 4, W.width - W.wallThickness - 4);
  ctx.restore();
}

const DIRT_SHADES = ['#573a24', '#5c3e27', '#523621'];

function drawTiles(ctx, map, camY, viewH, time) {
  const r0 = Math.floor(camY / TILE) - 1;
  const r1 = Math.ceil((camY + viewH) / TILE) + 1;
  for (let r = r0; r <= r1; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = map.get(c, r);
      if (t === T.EMPTY) continue;
      const x = c * TILE;
      const y = r * TILE;
      const h = hash(c * 7919 + r * 104729);
      const open = (dc, dr) => !isSolid(map.get(c + dc, r + dr));
      switch (t) {
        case T.DIRT:
        case T.SPIKES:
          drawDirt(ctx, x, y, h, open);
          if (t === T.SPIKES) drawSpikes(ctx, x, y);
          break;
        case T.SOFT:
          ctx.fillStyle = '#8b6a47';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#a7845c';
          ctx.fillRect(x + 3 + h * 5, y + 3, 3, 3);
          ctx.fillRect(x + 11 - h * 4, y + 9 + h * 3, 3, 3);
          ctx.fillStyle = '#6e5235';
          ctx.fillRect(x + 6 + h * 6, y + 13, 2, 2);
          ctx.fillRect(x + 2, y + 10 - h * 5, 2, 2);
          edges(ctx, x, y, open, 'rgba(60, 40, 22, 0.8)', 1.5);
          break;
        case T.ROCK:
          ctx.fillStyle = '#474b55';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#5c616d';
          ctx.fillRect(x + 1, y + 1, TILE - 4, 3);
          ctx.fillStyle = '#383b43';
          ctx.fillRect(x + 2 + h * 8, y + 8 + h * 5, 5, 2);
          break;
        case T.LEDGE:
        case T.FRAGILE:
          drawLedge(ctx, x, y, t === T.FRAGILE);
          break;
        case T.PAD:
          drawPad(ctx, x, y, time);
          break;
        case T.LOOSE: {
          const j = Math.sin(time * 30 + c) * 0.6;
          ctx.fillStyle = '#6e665c';
          ctx.fillRect(x + j, y, TILE, TILE);
          ctx.strokeStyle = 'rgba(20, 16, 12, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + 3, y + 2);
          ctx.lineTo(x + 9, y + 9);
          ctx.lineTo(x + 6, y + 16);
          ctx.moveTo(x + 9, y + 9);
          ctx.lineTo(x + 16, y + 7);
          ctx.stroke();
          if (open(0, 1)) {
            ctx.fillStyle = '#8d8478';
            ctx.fillRect(x + 4, y + TILE, 4, 4);
            ctx.fillRect(x + 11, y + TILE + 1, 3, 3);
          }
          break;
        }
      }
    }
  }
}

function drawDirt(ctx, x, y, h, open) {
  ctx.fillStyle = DIRT_SHADES[(h * 3) | 0];
  ctx.fillRect(x, y, TILE, TILE);
  if (h > 0.6) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(x + h * 10, y + 4 + h * 8, 4, 3);
  }
  edges(ctx, x, y, open, '#2c1c11', 2);
  if (open(0, -1)) {
    ctx.fillStyle = '#5f8f3e';
    ctx.fillRect(x, y, TILE, 3);
    ctx.fillStyle = '#76a84f';
    ctx.fillRect(x + h * 10, y - 1, 3, 2);
  }
}

// Dark outline on the faces that touch open tunnel.
function edges(ctx, x, y, open, color, wd) {
  ctx.fillStyle = color;
  if (open(-1, 0)) ctx.fillRect(x, y, wd, TILE);
  if (open(1, 0)) ctx.fillRect(x + TILE - wd, y, wd, TILE);
  if (open(0, 1)) ctx.fillRect(x, y + TILE - wd, TILE, wd);
}

function drawLedge(ctx, x, y, fragile) {
  ctx.fillStyle = fragile ? '#8a7258' : '#6b4a2f';
  ctx.fillRect(x, y, TILE, 10);
  ctx.fillStyle = fragile ? '#9aa86a' : '#5f8f3e';
  ctx.fillRect(x, y, TILE, 3);
  if (!fragile) return;
  ctx.strokeStyle = 'rgba(30, 18, 10, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 3);
  ctx.lineTo(x + 10, y + 6);
  ctx.lineTo(x + 7, y + 10);
  ctx.stroke();
}

function drawSpikes(ctx, x, y) {
  ctx.fillStyle = '#cfd3d6';
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const sx = x + i * (TILE / 2);
    ctx.moveTo(sx, y + 1);
    ctx.lineTo(sx + TILE / 4, y - 7);
    ctx.lineTo(sx + TILE / 2, y + 1);
  }
  ctx.fill();
}

function drawPad(ctx, x, y, time) {
  const wob = Math.sin(time * 6) * 1;
  ctx.fillStyle = '#7a3b52';
  ctx.fillRect(x + 2, y + 6, TILE - 4, TILE - 6);
  ctx.fillStyle = '#e0568f';
  ctx.beginPath();
  ctx.ellipse(x + TILE / 2, y + 7 + wob, TILE / 2 + 1, 7, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#ffd1e3';
  ctx.fillRect(x + 5, y + 2 + wob, 3, 3);
  ctx.fillRect(x + 11, y + 3 + wob, 3, 2);
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
  if ((state === 'wallBurrow' || state === 'tunnel') && !p.move.broke) {
    // Head-first into the wall.
    ears = 'down';
    ctx.rotate(-p.move.side * Math.PI / 2);
  }
  if (state === 'recover') ctx.rotate(Math.sin(p.time * 30) * 0.25);
  if (state === 'dead') ctx.rotate(Math.PI);
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

  const dim = state === 'recover' || state === 'dead';
  const fur = dim ? '#bdb3a8' : '#f2ebe2';
  const earFur = dim ? '#b0a69b' : '#e8ddd0';

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
