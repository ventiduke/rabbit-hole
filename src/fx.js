// Particles, floating labels, screen flash/shake and haptics.
// Particles live in world space; labels follow the rabbit so they stay
// readable at dive speed.

import { CONFIG } from './config.js';

const F = CONFIG.fx;

export class Fx {
  constructor() {
    this.reset();
  }

  reset() {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.flash = 0;
    this.flashColor = '#fff';
    this.shakeAmt = 0;
  }

  update(dt) {
    for (const p of this.particles) {
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
    for (const t of this.texts) t.age += dt;
    this.texts = this.texts.filter((t) => t.age < t.life);
    this.flash = Math.max(0, this.flash - F.flashDecay * dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - F.shakeDecay * dt);
  }

  // ------------------------------------------------------------ primitives

  burst(x, y, { count = 10, color = '#fff', speed = 120, life = 0.5, g = 300, size = 3, spread = Math.PI * 2, dir = -Math.PI / 2 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g, age: 0, life: life * (0.6 + Math.random() * 0.4), color, size });
    }
  }

  text(str, color = '#fff', size = 14) {
    this.texts.push({ str, color, size, age: 0, life: F.textLife, slot: this.texts.length });
  }

  flashScreen(amount, color = '#fff') {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  }

  shake(amount) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  haptic(pattern) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Not supported (e.g. iOS Safari); ignore.
    }
  }

  // ------------------------------------------------------------ game events

  perfect(player) {
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    this.burst(cx, cy, { count: 16, color: '#ffd84a', speed: 180, life: 0.45, g: 0 });
    this.text('PERFECT', '#ffd84a', 13);
    this.flashScreen(F.perfectFlash, '#fff6c8');
    this.haptic(F.hapticPerfect);
  }

  chain(player, chain, isNew, count) {
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    this.burst(cx, cy, { count: 26, color: chain.color, speed: 240, life: 0.6, g: 0, size: 4 });
    this.text(`${chain.name.toUpperCase()}${count > 1 ? `  x${count}` : ''}`, chain.color, 17);
    if (isNew) this.text('NEW!', '#fff', 11);
    this.flashScreen(F.chainFlash, chain.color);
    this.shake(F.chainShake);
    this.haptic(F.hapticChain);
  }

  timeout(player) {
    this.text('TOO LONG', '#b9a99a', 11);
    this.burst(player.x + player.w / 2, player.y, { count: 6, color: '#b9a99a', speed: 60, life: 0.6, g: 0 });
  }

  hardLanding(player) {
    this.text('OOF', '#ff6b5a', 15);
    this.puff(player, 14);
    this.shake(F.hardLandingShake);
    this.flashScreen(0.18, '#ff6b5a');
    this.haptic(F.hapticHit);
  }

  puff(player, count) {
    if (count <= 0) return;
    this.burst(player.x + player.w / 2, player.y + player.h, { count, color: '#c9b49c', speed: 90, life: 0.4, g: 200, dir: -Math.PI / 2, spread: Math.PI * 0.9 });
  }

  wallKick(player, side) {
    const x = side < 0 ? player.x : player.x + player.w;
    this.burst(x, player.y + player.h, { count: 8, color: '#c9b49c', speed: 110, life: 0.35, g: 200, dir: side < 0 ? 0 : Math.PI, spread: 1.2 });
  }

  dirt(x, y, count) {
    this.burst(x, y, { count, color: '#8a6440', speed: 120, life: 0.5, g: 500, size: 3 });
  }

  debris(ledge) {
    for (let i = 0; i < ledge.w / 8; i++) {
      this.particles.push({
        x: ledge.x + Math.random() * ledge.w, y: ledge.y + Math.random() * ledge.h,
        vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 80,
        g: 700, age: 0, life: 0.8, color: Math.random() < 0.5 ? '#6b4a2f' : '#9a7a55', size: 4 + Math.random() * 4,
      });
    }
  }

  shockwave(x, y, range) {
    this.rings.push({ x, y, range, age: 0, life: 0.45 });
  }

  // ------------------------------------------------------------ drawing

  get shakeOffset() {
    const a = this.shakeAmt;
    return a > 0 ? { x: (Math.random() - 0.5) * 2 * a, y: (Math.random() - 0.5) * 2 * a } : { x: 0, y: 0 };
  }

  drawWorld(ctx) {
    for (const r of this.rings) {
      const k = r.age / r.life;
      ctx.strokeStyle = `rgba(255, 122, 184, ${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y + r.range * k * 0.5, r.range * k * 0.9, r.range * k * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // Labels stack above the rabbit and drift up as they fade.
  // minX/maxX keep labels on screen near the walls.
  drawLabels(ctx, px, top, minX, maxX) {
    ctx.textAlign = 'center';
    this.texts.forEach((t, i) => {
      const k = t.age / t.life;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `bold ${t.size}px system-ui, sans-serif`;
      const half = ctx.measureText(t.str).width / 2;
      const cx = Math.max(minX + half, Math.min(maxX - half, px));
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const y = top - 34 - i * 18 - k * 24;
      ctx.fillText(t.str, cx + 1, y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, cx, y);
    });
    ctx.globalAlpha = 1;
  }

  drawOverlay(ctx, width, height) {
    if (this.flash <= 0) return;
    ctx.globalAlpha = this.flash;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}
