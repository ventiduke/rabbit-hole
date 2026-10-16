// HUD and overlays, drawn in world units on top of the scene.

import { CONFIG } from './config.js';

const W = CONFIG.world;

export function drawHud(ctx, { depthMeters, fps, seed, state, chainCount, hp, maxHp, tier }) {
  ctx.fillStyle = 'rgba(255, 240, 220, 0.9)';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${depthMeters} m`, W.wallThickness + 8, 26);

  for (let i = 0; i < maxHp; i++) drawHeart(ctx, W.wallThickness + 14 + i * 20, 62, i < hp);

  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255, 240, 220, 0.55)';
  ctx.fillText(`${fps} fps`, W.width - W.wallThickness - 8, 20);
  ctx.fillText(`seed ${seed}`, W.width - W.wallThickness - 8, 32);
  ctx.fillText(`tier ${tier} · ${state}`, W.width - W.wallThickness - 8, 44);

  if (chainCount > 1) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#ffd84a';
    ctx.fillText(`CHAIN x${chainCount}`, W.wallThickness + 8, 44);
  }
}

function drawHeart(ctx, cx, cy, full) {
  ctx.fillStyle = full ? '#ff5a6e' : 'rgba(255, 240, 220, 0.18)';
  ctx.beginPath();
  ctx.moveTo(cx, cy + 6);
  ctx.bezierCurveTo(cx - 10, cy - 1, cx - 6, cy - 9, cx, cy - 4);
  ctx.bezierCurveTo(cx + 6, cy - 9, cx + 10, cy - 1, cx, cy + 6);
  ctx.fill();
}

export function drawGameOver(ctx, viewH, { depthMeters, canRetry }) {
  ctx.fillStyle = 'rgba(10, 6, 3, 0.7)';
  ctx.fillRect(0, 0, W.width, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff6b5a';
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.fillText('KNOCKED OUT', W.width / 2, viewH * 0.4);
  ctx.fillStyle = '#f2ebe2';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(`${depthMeters} m`, W.width / 2, viewH * 0.4 + 40);
  if (canRetry) {
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(242, 235, 226, 0.8)';
    ctx.fillText('Tap to dig again', W.width / 2, viewH * 0.4 + 80);
  }
}

const CONTROLS = [
  ['Hold left / right', 'steer'],
  ['Hold both halves', 'ears (glide)'],
  ['Swipe down + hold', 'dive · burrow on ledge'],
  ['Steer into wall', 'wall drag · lift to jump'],
  ['Lift in the gold zone', 'PERFECT'],
];

export function drawTitle(ctx, viewH) {
  ctx.fillStyle = 'rgba(10, 6, 3, 0.72)';
  ctx.fillRect(0, 0, W.width, viewH);
  const y0 = viewH * 0.46;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2ebe2';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillText('RABBIT HOLE', W.width / 2, y0);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 235, 226, 0.85)';
  ctx.fillText('Tap to drop', W.width / 2, y0 + 36);

  ctx.font = '12px system-ui, sans-serif';
  CONTROLS.forEach(([input, action], i) => {
    const y = y0 + 80 + i * 22;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(242, 235, 226, 0.55)';
    ctx.fillText(input, W.width / 2 - 8, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = i === CONTROLS.length - 1 ? '#ffd84a' : 'rgba(242, 235, 226, 0.9)';
    ctx.fillText(action, W.width / 2 + 8, y);
  });

  ctx.textAlign = 'center';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 235, 226, 0.45)';
  ctx.fillText('Chains: Drill · Parachute Snap · Soft Landing · Wall Burrow', W.width / 2, y0 + 80 + CONTROLS.length * 22 + 14);
  ctx.fillText('Keys: ← → steer · Space ears · ↓ dive/burrow', W.width / 2, y0 + 80 + CONTROLS.length * 22 + 32);
  ctx.fillText('↑ wall jump · R restart', W.width / 2, y0 + 80 + CONTROLS.length * 22 + 48);
}

// Faint touch-zone hints for the first few seconds of a run.
export function drawTouchHints(ctx, viewH, opacity, input) {
  if (opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  if (input.left) ctx.fillRect(0, 0, W.width / 2, viewH);
  if (input.right) ctx.fillRect(W.width / 2, 0, W.width / 2, viewH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(W.width / 2 - 0.5, viewH * 0.55, 1, viewH * 0.4);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('◀ hold', W.width * 0.25, viewH * 0.85);
  ctx.fillText('hold ▶', W.width * 0.75, viewH * 0.85);
  ctx.restore();
}
