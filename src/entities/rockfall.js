// Rockfalls: loose rocks hanging under an overhang. Once you pass beneath,
// they drop as a staggered burst. Rocks hurt the player, smash fragile ledges
// (so they can open a path below) and shatter on anything else.

import { CONFIG } from '../config.js';
import { difficultyAt } from '../level/generator.js';
import { surfaceY, LEDGE_T } from '../level/world.js';

const R = CONFIG.hazards.rock;
const D = CONFIG.difficulty;

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function updateRockfall(dt, player, world, camera) {
  const { level, fx } = world;
  const geo = level.world;

  const cx = player.x + player.w / 2;
  for (const z of level.rockZones) {
    if (z.fired) continue;
    const below = player.y > z.y && player.y < z.y + R.triggerDepth;
    if (below && cx > z.x - R.triggerMargin && cx < z.x + z.w + R.triggerMargin) fire(z, level, fx);
  }

  for (const w of level.warnings) w.age += dt;
  level.warnings = level.warnings.filter((w) => w.age < w.life);

  for (const r of level.rocks) {
    if (r.delay > 0) {
      r.delay -= dt;
      // Drop from the overhang, or from just above the screen if it's far above.
      if (r.delay <= 0) r.y = Math.max(r.zone.y, camera.y - r.h - 10);
      continue;
    }
    const prevBottom = r.y + r.h;
    r.vy = Math.min(r.vy + R.gravity * dt, r.maxSpeed);
    r.y += r.vy * dt;
    r.spin += dt * 4;

    const rcx = r.x + r.w / 2;
    for (const l of geo.ledges) {
      if (rcx < l.x1 || rcx > l.x2) continue;
      const sy = surfaceY(l, rcx);
      if (prevBottom > sy + 0.5 || r.y + r.h < sy) continue;
      if (l.kind === 'fragile') {
        geo.removeLedge(l);
        fx.debris({ x: l.x1, y: Math.min(l.y1, l.y2), w: l.x2 - l.x1, h: LEDGE_T });
        r.vy *= 0.8;
      } else {
        shatter(r, sy, fx);
      }
      break;
    }
    if (!r.dead && geo.blocksIn(r.x, r.y, r.w, r.h).length) shatter(r, r.y + r.h, fx);
    if (!r.dead && !player.dead && overlaps(r, player)) {
      r.zone.playerHit = true; // no clean escape, even if invulnerable
      if (player.hurt(world, r.x + r.w / 2)) r.dead = true;
    }
    if (r.y > camera.y + camera.viewH + 600) r.dead = true;
  }
  level.rocks = level.rocks.filter((r) => !r.dead);
}

function shatter(r, y, fx) {
  r.dead = true;
  fx.burst(r.x + r.w / 2, y, { count: 10, color: '#8d8478', speed: 140, life: 0.45, g: 600, size: 4 });
}

function fire(z, level, fx) {
  z.fired = true;
  const rng = level.hazardRng;
  const d = difficultyAt(z.y);
  const speed = R.maxSpeed * (D.rockSpeed[0] + (D.rockSpeed[1] - D.rockSpeed[0]) * d);
  const count = R.count[0] + Math.floor(rng.next() * (R.count[1] - R.count[0] + 1));
  for (let i = 0; i < count; i++) {
    const s = R.size[0] + rng.next() * (R.size[1] - R.size[0]);
    level.rocks.push({
      x: z.x + rng.next() * (z.w - s), y: -99999, w: s, h: s,
      vy: 0, maxSpeed: speed * (0.9 + rng.next() * 0.2),
      delay: R.warn + i * R.stagger, zone: z, spin: rng.next() * 6,
    });
  }
  level.warnings.push({ x: z.x + z.w / 2, y: z.y, age: 0, life: R.warn + count * R.stagger });
  fx.shake(3);
  fx.haptic(30);
  fx.sfx('rumble');
}

// ---------------------------------------------------------------- drawing

// Loose rocks still hanging under their overhang.
export function drawRockZones(ctx, level) {
  for (const z of level.rockZones) {
    if (z.fired) continue;
    const j = Math.sin(level.time * 25) * 0.6;
    ctx.fillStyle = '#7d756a';
    for (let x = z.x + 6; x < z.x + z.w - 10; x += 22) {
      const s = 10 + ((x * 7) % 9);
      ctx.beginPath();
      ctx.moveTo(x + j, z.y);
      ctx.lineTo(x + s + j, z.y);
      ctx.lineTo(x + s * 0.6 + j, z.y + s);
      ctx.lineTo(x + s * 0.2 + j, z.y + s * 0.8);
      ctx.fill();
    }
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

  // Telegraph: blinking warning at the overhang, or at the top of the screen if it's above.
  for (const w of level.warnings) {
    if (Math.floor(w.age * 8) % 2) continue;
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ ! ▼', w.x, Math.max(w.y + 30, camY + 70));
  }
}
