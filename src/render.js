// World drawing with placeholder shapes. Everything is drawn in world units;
// the caller sets up the scale so the world width fills the canvas.

import { CONFIG } from './config.js';
import { drawHazards } from './entities/hazards.js';
import { drawRocks, drawRockZones } from './entities/rockfall.js';
import { WALL, LEDGE_T } from './level/world.js';

const W = CONFIG.world;
const lerp = (a, b, t) => a + (b - a) * t;

// Deterministic hash so background details stay put as the camera moves.
const hash = (n) => {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

export function drawWorld(ctx, { camera, player, level, fx, alpha }) {
  const camY = lerp(camera.prevY, camera.y, alpha);
  const camX = lerp(camera.prevX, camera.x, alpha);
  const viewH = camera.viewH;
  const shake = fx.shakeOffset;

  // Cavern air, darkening slowly with depth.
  const k = Math.min(1, Math.max(0, camY / 30000));
  ctx.fillStyle = `rgb(${lerp(24, 12, k)}, ${lerp(17, 10, k)}, ${lerp(14, 12, k)})`;
  ctx.fillRect(0, 0, W.width, viewH);
  drawParallax(ctx, camX, camY, viewH);

  ctx.save();
  ctx.translate(-camX + shake.x, -camY + shake.y);

  // Depth markers every 10 m, by the right wall.
  const markEvery = W.unitsPerMeter * 10;
  ctx.fillStyle = 'rgba(255, 230, 200, 0.18)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let m = Math.ceil(camY / markEvery); m * markEvery < camY + viewH; m++) {
    if (m <= 0) continue;
    const right = Math.min(camX + W.width, level.world.wallsAt(m * markEvery).right);
    ctx.fillRect(right - 30, m * markEvery, 22, 1);
    ctx.fillText(`${m * 10}m`, right - 34, m * markEvery + 4);
  }

  const geo = level.world;
  for (const b of geo.blocks) {
    if (b.y + b.h >= camY && b.y <= camY + viewH) drawBlock(ctx, b);
  }
  drawRockZones(ctx, level);
  for (const l of geo.ledges) {
    if (Math.max(l.y1, l.y2) + LEDGE_T >= camY && Math.min(l.y1, l.y2) - 10 <= camY + viewH) drawLedge(ctx, l, level.time);
  }
  drawWalls(ctx, geo, camX, camY, viewH);
  drawHazards(ctx, level);

  const blink = player.invuln > 0 && !player.dead && Math.floor(player.invuln * 12) % 2 === 0;
  if (!blink) drawRabbit(ctx, player, alpha);
  drawRocks(ctx, level, camY);

  fx.drawWorld(ctx);

  const px = lerp(player.prevX, player.x, alpha) + player.w / 2;
  const py = lerp(player.prevY, player.y, alpha);
  drawTimingBar(ctx, player, px, py, camX + WALL, camX + W.width - WALL);
  fx.drawLabels(ctx, px, py, camX + WALL + 4, camX + W.width - WALL - 4);
  ctx.restore();
}

// Distant rock shapes and dust drifting past at different speeds: the sense of falling.
function drawParallax(ctx, camX, camY, viewH) {
  const layers = [
    { f: 0.25, band: 340, color: 'rgba(60, 44, 34, 0.35)', size: 120 },
    { f: 0.5, band: 260, color: 'rgba(70, 52, 40, 0.35)', size: 70 },
  ];
  for (const L of layers) {
    const off = camY * L.f;
    for (let i = Math.floor(off / L.band) - 1; i <= Math.ceil((off + viewH) / L.band) + 1; i++) {
      for (let j = 0; j < 3; j++) {
        const h = hash(i * 9176 + j * 131 + L.band);
        if (h > 0.7) continue;
        const span = W.width * 1.6;
        const x = ((hash(h * 1e9) * span - camX * L.f) % span + span) % span - W.width * 0.3;
        const y = i * L.band + hash(h * 7e8) * L.band - off;
        const s = L.size * (0.5 + hash(h * 3e8));
        ctx.fillStyle = L.color;
        ctx.beginPath();
        ctx.moveTo(x - s, y);
        ctx.lineTo(x - s * 0.3, y - s * 0.4);
        ctx.lineTo(x + s * 0.4, y - s * 0.3);
        ctx.lineTo(x + s, y + s * 0.1);
        ctx.lineTo(x + s * 0.2, y + s * 0.5);
        ctx.lineTo(x - s * 0.6, y + s * 0.35);
        ctx.fill();
      }
    }
  }
  // Dust motes.
  const off = camY * 0.85;
  ctx.fillStyle = 'rgba(255, 235, 210, 0.12)';
  for (let i = Math.floor(off / 90) - 1; i <= Math.ceil((off + viewH) / 90); i++) {
    for (let j = 0; j < 4; j++) {
      const h = hash(i * 31337 + j * 17);
      ctx.fillRect(((h * W.width - camX * 0.85) % W.width + W.width) % W.width, i * 90 + hash(h * 5e8) * 90 - off, 2, 2);
    }
  }
}

// Solid earth beyond the cavern walls, with a jagged edge that follows the
// cavern's width profile.
function drawWalls(ctx, geo, camX, camY, viewH) {
  const seg = 40;
  const i0 = Math.floor(camY / seg) - 1;
  const i1 = Math.ceil((camY + viewH) / seg) + 1;
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#3a2618';
    ctx.beginPath();
    const base = side < 0 ? camX - 40 : camX + W.width + 40;
    ctx.moveTo(base, i0 * seg);
    for (let i = i0; i <= i1; i++) {
      const y = i * seg;
      const walls = geo.wallsAt(y);
      const jag = (hash(i * 7 + (side > 0 ? 99991 : 0)) - 0.5) * 10;
      ctx.lineTo(side < 0 ? walls.left + jag : walls.right - jag, y);
    }
    ctx.lineTo(base, i1 * seg);
    ctx.fill();
    // A lighter rim on the cavern edge.
    ctx.strokeStyle = 'rgba(120, 88, 60, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const y = i * seg;
      const walls = geo.wallsAt(y);
      const jag = (hash(i * 7 + (side > 0 ? 99991 : 0)) - 0.5) * 10;
      const x = side < 0 ? walls.left + jag : walls.right - jag;
      if (i === i0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawBlock(ctx, b) {
  const colors = {
    dirt: ['#5a3c26', '#2c1c11'],
    soft: ['#8b6a47', '#5e4630'],
    rock: ['#4a4e58', '#2f3238'],
  }[b.kind];
  ctx.fillStyle = colors[0];
  ctx.fillRect(b.x, b.y, b.w, b.h);
  // Texture.
  ctx.fillStyle = b.kind === 'soft' ? '#a7845c' : 'rgba(0, 0, 0, 0.16)';
  const n = Math.min(60, Math.floor((b.w * b.h) / 500));
  for (let i = 0; i < n; i++) {
    const h = hash(Math.floor(b.x) * 31 + Math.floor(b.y) * 17 + i * 7919);
    ctx.fillRect(b.x + 3 + h * (b.w - 9), b.y + 3 + hash(h * 1e9) * (b.h - 9), 3, 3);
  }
  ctx.strokeStyle = colors[1];
  ctx.lineWidth = 2;
  if (b.kind === 'soft') ctx.setLineDash([6, 4]);
  ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  ctx.setLineDash([]);
  if (b.kind === 'dirt') {
    ctx.fillStyle = '#5f8f3e';
    ctx.fillRect(b.x, b.y, b.w, 3);
  }
}

const LEDGE_COLORS = {
  ledge: ['#6b4a2f', '#5f8f3e'],
  fragile: ['#8a7258', '#9aa86a'],
  spikes: ['#5a3c26', '#5a3c26'],
  pad: ['#7a3b52', '#e0568f'],
};

function drawLedge(ctx, l, time) {
  const [body, top] = LEDGE_COLORS[l.kind];
  const wob = l.kind === 'pad' ? Math.sin(time * 6) : 0;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(l.x1, l.y1);
  ctx.lineTo(l.x2, l.y2);
  ctx.lineTo(l.x2 - 4, l.y2 + LEDGE_T);
  ctx.lineTo(l.x1 + 4, l.y1 + LEDGE_T);
  ctx.fill();
  ctx.strokeStyle = top;
  ctx.lineWidth = l.kind === 'pad' ? 6 : 3;
  ctx.beginPath();
  ctx.moveTo(l.x1, l.y1 + 1 + wob);
  ctx.lineTo(l.x2, l.y2 + 1 + wob);
  ctx.stroke();

  const len = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  if (l.kind === 'spikes') {
    ctx.fillStyle = '#cfd3d6';
    ctx.beginPath();
    for (let x = 0; x + 10 <= len; x += 10) {
      const y0 = l.y1 + (dy * x) / len;
      const y1 = l.y1 + (dy * (x + 10)) / len;
      ctx.moveTo(l.x1 + x, y0 + 1);
      ctx.lineTo(l.x1 + x + 5, (y0 + y1) / 2 - 8);
      ctx.lineTo(l.x1 + x + 10, y1 + 1);
    }
    ctx.fill();
  }
  if (l.kind === 'fragile') {
    ctx.strokeStyle = 'rgba(30, 18, 10, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 14; x < len - 8; x += 30) {
      const y = l.y1 + (dy * x) / len;
      ctx.moveTo(l.x1 + x, y + 3);
      ctx.lineTo(l.x1 + x + 5, y + 7);
      ctx.lineTo(l.x1 + x + 1, y + LEDGE_T);
    }
    ctx.stroke();
  }
  if (l.kind === 'pad') {
    ctx.fillStyle = '#ffd1e3';
    for (let x = 8; x < len - 6; x += 18) ctx.fillRect(l.x1 + x, l.y1 + (dy * x) / len - 3 + wob, 4, 3);
  }
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
  if (p.grounded && p.groundSlope) ctx.rotate(Math.atan(p.groundSlope) * 0.8); // lean with the ledge
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
function drawTimingBar(ctx, p, cx, top, minX, maxX) {
  const bw = 64;
  const bh = 6;
  const x = Math.max(minX + 3, Math.min(maxX - 3 - bw, cx - bw / 2));
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
