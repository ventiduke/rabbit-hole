// Spiked ledges, thorn balls, down-boost rings and carrots: how they touch
// the player, and how the entities are drawn. (Pads are ledges handled in
// player collision; ledges are drawn in render.js; rockfalls live in rockfall.js.)

import { CONFIG } from '../config.js';
import { slope } from '../level/world.js';

const H = CONFIG.hazards;
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
  const cx = player.x + player.w / 2;

  // Spikes: landing on them hurts and throws you off the ledge (downhill, or
  // toward the nearer end). Burrowing (Drill) goes straight through safely.
  if (player.grounded && player.groundKind === 'spikes' && player.move?.name !== 'burrow') {
    const l = player.ground.ledge;
    const sl = slope(l);
    const dir = Math.abs(sl) > 0.05 ? Math.sign(sl) : cx - l.x1 < l.x2 - cx ? -1 : 1;
    player.hurt(world, null);
    player.vx = dir * H.spikeKnock;
    player.vy = H.spikeBounce;
    player.carry = H.spikeKnockCarry; // keep the knock so you actually clear the spikes
    fx.burst(cx, player.y + player.h, { count: 8, color: '#cfd3d6', speed: 140, life: 0.3, g: 300 });
  }

  for (const t of level.thorns) {
    if (circleHitsBox(t, t.r, player)) player.hurt(world, t.x);
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
      world.score?.bonus(CONFIG.score.speedBurst, 'SPEED BURST', '#7fe0ff');
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
    world.score?.bonus(CONFIG.score.carrot, 'CARROT', '#ff9a3c');
    fx.burst(c.x, c.y, { count: 14, color: '#ff9a3c', speed: 140, life: 0.5, g: 0 });
    fx.text(`+${H.carrotHeal} ♥`, '#ff9a3c', 14);
  }
  level.carrots = level.carrots.filter((c) => !c.taken);
}

// ---------------------------------------------------------------- drawing

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
