// HUD and overlays, drawn in world units on top of the scene.

import { CONFIG } from './config.js';

const W = CONFIG.world;

export function drawHud(ctx, { viewH, depthMeters, fps, seed }) {
  ctx.fillStyle = 'rgba(255, 240, 220, 0.9)';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${depthMeters} m`, W.wallThickness + 8, 26);

  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255, 240, 220, 0.55)';
  ctx.fillText(`${fps} fps`, W.width - W.wallThickness - 8, 20);
  ctx.fillText(`seed ${seed}`, W.width - W.wallThickness - 8, 32);
}

export function drawTitle(ctx, viewH) {
  ctx.fillStyle = 'rgba(10, 6, 3, 0.6)';
  ctx.fillRect(0, 0, W.width, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2ebe2';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillText('RABBIT HOLE', W.width / 2, viewH * 0.4);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 235, 226, 0.8)';
  ctx.fillText('Tap to drop', W.width / 2, viewH * 0.4 + 36);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 235, 226, 0.5)';
  ctx.fillText('Hold left / right half to steer', W.width / 2, viewH * 0.4 + 60);
  ctx.fillText('Keyboard: ← → or A / D · R restarts', W.width / 2, viewH * 0.4 + 76);
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
