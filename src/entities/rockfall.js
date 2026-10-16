// Rockfalls: loose-rock tiles (K in chunks) that, once you pass beneath
// them, crumble and drop a staggered burst of rocks straight down. Rocks hurt
// the player, smash fragile ledges (so they can open a path below) and
// shatter on anything else.

import { CONFIG } from '../config.js';
import { difficultyAt } from '../level/generator.js';
import { T, TILE, isSolid } from '../level/tiles.js';

const R = CONFIG.hazards.rock;
const D = CONFIG.difficulty;

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function updateRockfall(dt, player, world, camera) {
  const { level, fx } = world;
  const map = level.map;

  const pc = (player.x + player.w / 2) / TILE;
  for (const z of level.rockZones) {
    if (z.fired) continue;
    const below = player.y > z.y + TILE && player.y < z.y + R.triggerRows * TILE;
    if (below && Math.abs(pc - (z.c + 0.5)) <= R.triggerCols) fire(z, level, fx);
  }

  for (const w of level.warnings) w.age += dt;
  level.warnings = level.warnings.filter((w) => w.age < w.life);

  for (const r of level.rocks) {
    if (r.delay > 0) {
      r.delay -= dt;
      // Drop from the loose tile, or from just above the screen if it's far above.
      if (r.delay <= 0) r.y = Math.max(r.zone.y, camera.y - r.h - 10);
      continue;
    }
    r.vy = Math.min(r.vy + R.gravity * dt, r.maxSpeed);
    r.y += r.vy * dt;
    r.spin += dt * 4;

    map.forBox(r.x, r.y, r.w, r.h, (c, row, t) => {
      if (r.dead || !isSolid(t)) return;
      if (t === T.FRAGILE) {
        map.set(c, row, T.EMPTY);
        fx.debris(map.rect(c, row));
        r.vy *= 0.8;
      } else {
        r.dead = true;
        fx.burst(r.x + r.w / 2, row * TILE, { count: 10, color: '#8d8478', speed: 140, life: 0.45, g: 600, size: 4 });
      }
    });
    if (!r.dead && !player.dead && overlaps(r, player)) {
      r.zone.playerHit = true; // no clean escape, even if invulnerable
      if (player.hurt(world, r.x + r.w / 2)) r.dead = true;
    }
    if (r.y > camera.y + camera.viewH + 600) r.dead = true;
  }
  level.rocks = level.rocks.filter((r) => !r.dead);
}

function fire(z, level, fx) {
  z.fired = true;
  level.map.set(z.c, z.r, T.EMPTY);
  fx.debris(level.map.rect(z.c, z.r));
  const rng = level.hazardRng;
  const d = difficultyAt(z.y);
  const speed = R.maxSpeed * (D.rockSpeed[0] + (D.rockSpeed[1] - D.rockSpeed[0]) * d);
  const count = R.count[0] + Math.floor(rng.next() * (R.count[1] - R.count[0] + 1));
  for (let i = 0; i < count; i++) {
    const s = R.size[0] + rng.next() * (R.size[1] - R.size[0]);
    const x = z.x + TILE / 2 - s / 2 + (rng.next() - 0.5) * TILE;
    level.rocks.push({
      x, y: -99999, w: s, h: s,
      vy: 0, maxSpeed: speed * (0.9 + rng.next() * 0.2),
      delay: R.warn + i * R.stagger, zone: z, spin: rng.next() * 6,
    });
  }
  level.warnings.push({ x: z.x + TILE / 2, y: z.y, age: 0, life: R.warn + count * R.stagger });
  fx.shake(3);
  fx.haptic(30);
}

// ---------------------------------------------------------------- drawing

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

  // Telegraph: blinking warning at the source, or at the top of the screen if it's above.
  for (const w of level.warnings) {
    if (Math.floor(w.age * 8) % 2) continue;
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ ! ▼', w.x, Math.max(w.y + TILE, camY + 70));
  }
}
