// Rockfalls: cracked wall patches that, once triggered, drop a staggered
// burst of rocks down that side of the shaft. Rocks hurt the player, smash
// fragile ledges (so they can open a path below) and shatter on anything else.
//   trigger 'touch' — the player touches the patch (wall drag, wall jump...)
//   trigger 'pass'  — the player falls past the top of the patch

import { CONFIG } from '../config.js';
import { difficultyAt } from '../level/generator.js';

const R = CONFIG.hazards.rock;
const D = CONFIG.difficulty;
const W = CONFIG.world;

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function updateRockfall(dt, player, world, camera) {
  const { level, fx } = world;

  for (const z of level.rockZones) {
    if (z.fired) continue;
    const touching = player.touchWall === z.side && player.y + player.h > z.y0 && player.y < z.y1;
    const passing = z.trigger === 'pass' && player.y > z.y0;
    if (touching || passing) fire(z, level, fx);
  }

  for (const w of level.warnings) w.age += dt;
  level.warnings = level.warnings.filter((w) => w.age < w.life);

  const hidden = player.state === 'wallBurrow';
  for (const r of level.rocks) {
    if (r.delay > 0) {
      r.delay -= dt;
      if (r.delay <= 0) r.y = Math.min(r.zone.y0, camera.y) - r.h - 10;
      continue;
    }
    r.vy = Math.min(r.vy + R.gravity * dt, r.maxSpeed);
    r.y += r.vy * dt;
    r.spin += dt * 4;

    for (const l of level.ledges) {
      if (!overlaps(r, l)) continue;
      if (l.fragile) {
        level.remove(l);
        fx.debris(l);
        r.vy *= 0.8;
      } else {
        r.dead = true;
        fx.burst(r.x + r.w / 2, l.y, { count: 10, color: '#8d8478', speed: 140, life: 0.45, g: 600, size: 4 });
      }
      break;
    }
    if (!r.dead && !hidden && !player.dead && overlaps(r, player)) {
      r.zone.playerHit = true; // no clean escape, even if invulnerable
      if (player.hurt(world, r.x + r.w / 2)) r.dead = true;
    }
    if (r.y > camera.y + camera.viewH + 600) r.dead = true;
  }
  level.rocks = level.rocks.filter((r) => !r.dead);
}

function fire(z, level, fx) {
  z.fired = true;
  const rng = level.hazardRng;
  const d = difficultyAt(z.y0);
  const speed = R.maxSpeed * (D.rockSpeed[0] + (D.rockSpeed[1] - D.rockSpeed[0]) * d);
  const count = R.count[0] + Math.floor(rng.next() * (R.count[1] - R.count[0] + 1));
  const laneX = z.side < 0 ? W.wallThickness : W.width - W.wallThickness - R.lane;
  for (let i = 0; i < count; i++) {
    const s = R.size[0] + rng.next() * (R.size[1] - R.size[0]);
    level.rocks.push({
      x: laneX + rng.next() * (R.lane - s), y: -99999, w: s, h: s,
      vy: 0, maxSpeed: speed * (0.9 + rng.next() * 0.2),
      delay: R.warn + i * R.stagger, zone: z, spin: rng.next() * 6,
    });
  }
  level.warnings.push({ side: z.side, age: 0, life: R.warn + count * R.stagger });
  fx.shake(3);
  fx.haptic(30);
}

// ---------------------------------------------------------------- drawing

export function drawRockZones(ctx, level) {
  const t = W.wallThickness;
  for (const z of level.rockZones) {
    const x = z.side < 0 ? 0 : W.width - t;
    ctx.fillStyle = z.fired ? '#1d120b' : '#4a3424';
    ctx.fillRect(x, z.y0, t, z.y1 - z.y0);
    if (z.fired) continue;
    // Cracks and loose stones.
    ctx.strokeStyle = 'rgba(15, 8, 4, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = z.y0 + 10; y < z.y1 - 10; y += 26) {
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + t - 4, y + 9);
      ctx.lineTo(x + 5, y + 18);
    }
    ctx.stroke();
    ctx.fillStyle = '#8d8478';
    for (let y = z.y0 + 18; y < z.y1 - 6; y += 40) ctx.fillRect(x + (z.side < 0 ? t - 7 : 2), y, 5, 5);
  }
}

export function drawRocks(ctx, level, camY) {
  for (const r of level.rocks) {
    if (r.delay > 0) continue;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.rotate(r.spin);
    ctx.fillStyle = '#8d8478';
    ctx.beginPath();
    const s = r.w / 2;
    ctx.moveTo(-s, -s * 0.4);
    ctx.lineTo(-s * 0.3, -s);
    ctx.lineTo(s * 0.8, -s * 0.7);
    ctx.lineTo(s, s * 0.3);
    ctx.lineTo(s * 0.2, s);
    ctx.lineTo(-s * 0.8, s * 0.7);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-s * 0.2, 0, s * 0.8, s * 0.5);
    ctx.restore();
  }

  // Telegraph: blinking warning at the top of the screen over the rock lane.
  for (const w of level.warnings) {
    if (Math.floor(w.age * 8) % 2) continue;
    const x = w.side < 0 ? W.wallThickness + R.lane / 2 : W.width - W.wallThickness - R.lane / 2;
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ ! ▼', x, camY + 70);
  }
}
