// Spiked ledges, thorn balls, down-boost rings and carrots: how they touch
// the player, and how they're drawn. (Pads are ledges with `pad: true` and are
// handled in player collision; rockfalls live in rockfall.js.)

import { CONFIG } from '../config.js';

const H = CONFIG.hazards;
const W = CONFIG.world;
const M = CONFIG.moves;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const circleHitsBox = (c, r, b) => {
  const nx = clamp(c.x, b.x, b.x + b.w);
  const ny = clamp(c.y, b.y, b.y + b.h);
  return (nx - c.x) ** 2 + (ny - c.y) ** 2 < r * r;
};

export function interactHazards(player, world) {
  const { level, fx } = world;
  if (player.dead) return;
  const hidden = player.state === 'wallBurrow'; // inside the wall
  const cx = player.x + player.w / 2;

  // Spiked ledge: hurts and bounces you toward its nearest open edge.
  // Burrowing (Drill) goes straight through safely.
  const l = player.grounded ? player.groundLedge : null;
  if (l?.spikes && player.move?.name !== 'burrow') {
    player.hurt(world, null);
    let dir = cx - l.x < l.x + l.w - cx ? -1 : 1;
    if (dir < 0 && l.x <= W.wallThickness + 1) dir = 1;
    if (dir > 0 && l.x + l.w >= W.width - W.wallThickness - 1) dir = -1;
    player.vx = dir * H.spikeKnock;
    player.vy = H.spikeBounce;
    player.carry = H.spikeKnockCarry; // keep the knock so you actually clear the spikes
    player.grounded = false;
    fx.burst(cx, l.y, { count: 8, color: '#cfd3d6', speed: 140, life: 0.3, g: 300 });
  }

  if (!hidden) {
    for (const t of level.thorns) {
      if (circleHitsBox(t, t.r, player)) player.hurt(world, t.x);
    }
  }

  // Down-rings: passing through downward boosts the fall; diving through is a speed burst.
  const prevC = player.prevY + player.h / 2;
  const curC = player.y + player.h / 2;
  for (const r of level.rings) {
    const mid = r.y + r.h / 2;
    if (player.vy <= 0 || prevC >= mid || curC < mid) continue;
    if (player.x + player.w <= r.x || player.x >= r.x + r.w) continue;
    if (player.move?.name === 'dive') {
      player.vy = M.dive.speed * H.ringDiveMult;
      player.carry = M.carryTime;
      fx.text('SPEED BURST', '#7fe0ff', 13);
      fx.shake(3);
      fx.haptic(15);
    } else {
      player.vy = Math.max(player.vy, H.ringBoost);
    }
    fx.burst(cx, mid, { count: 14, color: '#7fe0ff', speed: 160, life: 0.4, g: 0 });
  }

  for (const c of level.carrots) {
    if (c.taken || !circleHitsBox(c, 12, player)) continue;
    c.taken = true;
    player.heal(H.carrotHeal);
    fx.burst(c.x, c.y, { count: 14, color: '#ff9a3c', speed: 140, life: 0.5, g: 0 });
    fx.text(`+${H.carrotHeal} ♥`, '#ff9a3c', 14);
  }
  level.carrots = level.carrots.filter((c) => !c.taken);
}

// ---------------------------------------------------------------- drawing

export function drawSpikes(ctx, l) {
  ctx.fillStyle = '#cfd3d6';
  const n = Math.max(1, Math.floor(l.w / 9));
  const step = l.w / n;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = l.x + i * step;
    ctx.moveTo(x, l.y + 1);
    ctx.lineTo(x + step / 2, l.y - 7);
    ctx.lineTo(x + step, l.y + 1);
  }
  ctx.fill();
}

export function drawPad(ctx, l, time) {
  const wob = Math.sin(time * 6) * 1;
  ctx.fillStyle = '#7a3b52';
  ctx.fillRect(l.x + 4, l.y + 4, l.w - 8, l.h - 2);
  ctx.fillStyle = '#e0568f';
  ctx.beginPath();
  ctx.ellipse(l.x + l.w / 2, l.y + 4 + wob, l.w / 2, 7, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#ffd1e3';
  for (let x = l.x + 12; x < l.x + l.w - 8; x += 18) ctx.fillRect(x, l.y - 1 + wob, 4, 3);
}

export function drawHazards(ctx, level) {
  const t = level.time;
  for (const r of level.rings) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.strokeStyle = 'rgba(127, 224, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t * 30;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Down arrows.
    ctx.fillStyle = 'rgba(127, 224, 255, 0.5)';
    const off = (t * 40) % 14;
    for (let i = 0; i < 2; i++) {
      const y = cy + 8 + i * 14 + off;
      ctx.beginPath();
      ctx.moveTo(cx - 6, y);
      ctx.lineTo(cx + 6, y);
      ctx.lineTo(cx, y + 6);
      ctx.fill();
    }
  }

  for (const th of level.thorns) {
    ctx.save();
    ctx.translate(th.x, th.y);
    ctx.rotate(t * 2);
    ctx.fillStyle = '#5a1e2a';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * (th.r + 5), Math.sin(a) * (th.r + 5));
      ctx.lineTo(Math.cos(a + 0.39) * th.r * 0.7, Math.sin(a + 0.39) * th.r * 0.7);
    }
    ctx.fill();
    ctx.fillStyle = '#a3354b';
    ctx.beginPath();
    ctx.arc(0, 0, th.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const c of level.carrots) {
    const bob = Math.sin(t * 3 + c.x) * 2;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath();
    ctx.moveTo(-5, -6);
    ctx.lineTo(5, -6);
    ctx.lineTo(0, 10);
    ctx.fill();
    ctx.fillStyle = '#6cc04a';
    ctx.fillRect(-4, -11, 2, 6);
    ctx.fillRect(-1, -13, 2, 8);
    ctx.fillRect(2, -11, 2, 6);
    ctx.restore();
  }
}
