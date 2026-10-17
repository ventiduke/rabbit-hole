// HUD and overlays, drawn in world units on top of the scene.

import { CONFIG } from './config.js';

const W = CONFIG.world;

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const CX = W.width / 2;

export function drawHud(ctx, { score, depthMeters, hp, maxHp, chainCount }) {
  const t = W.wallThickness;

  for (let i = 0; i < maxHp; i++) drawHeart(ctx, t + 16 + i * 20, 24, i < hp);
  if (chainCount > 1) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#ffd84a';
    ctx.fillText(`CHAIN x${chainCount}`, t + 8, 50);
  }

  ctx.textAlign = 'right';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 240, 220, 0.9)';
  ctx.fillText(`${depthMeters} m`, W.width - t - 12, 30);

  // Score with a little pop when a bonus lands.
  const pop = score.popups[0] && score.popups[0].age < 0.15 ? 1 - score.popups[0].age / 0.15 : 0;
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(28 + pop * 5)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillText(fmt(score.points), CX + 1, 32);
  ctx.fillStyle = '#fff6e8';
  ctx.fillText(fmt(score.points), CX, 31);

  // Multiplier + hold/decay bar.
  if (score.mult > 1.001) {
    const S = CONFIG.score;
    const decaying = score.sinceBoost > S.multHold;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = decaying ? '#ff9a7a' : '#ffd84a';
    ctx.fillText(`x${score.mult.toFixed(1)}`, CX, 50);
    const left = decaying ? (score.mult - 1) / (S.maxMult - 1) : 1 - score.sinceBoost / S.multHold;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(CX - 24, 55, 48, 3);
    ctx.fillStyle = decaying ? '#ff9a7a' : '#ffd84a';
    ctx.fillRect(CX - 24, 55, 48 * Math.max(0, left), 3);
  }

  // Recent bonuses under the score.
  ctx.font = 'bold 11px system-ui, sans-serif';
  score.popups.forEach((p, i) => {
    const k = p.age / CONFIG.ui.popupLife;
    ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    ctx.fillStyle = p.color;
    ctx.fillText(`+${fmt(p.value)} ${p.text}`, CX, 74 + i * 14);
  });
  ctx.globalAlpha = 1;
}

// Small debug readout (bottom-left). Shown with ?debug.
export function drawDebug(ctx, viewH, { fps, seed, tier, state }) {
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 240, 220, 0.55)';
  ctx.fillText(`${fps} fps · seed ${seed} · tier ${tier} · ${state}`, W.wallThickness + 6, viewH - 10);
}

function drawHeart(ctx, cx, cy, full) {
  ctx.fillStyle = full ? '#ff5a6e' : 'rgba(255, 240, 220, 0.18)';
  ctx.beginPath();
  ctx.moveTo(cx, cy + 6);
  ctx.bezierCurveTo(cx - 10, cy - 1, cx - 6, cy - 9, cx, cy - 4);
  ctx.bezierCurveTo(cx + 6, cy - 9, cx + 10, cy - 1, cx, cy + 6);
  ctx.fill();
}

function panel(ctx, viewH, alpha = 0.75) {
  ctx.fillStyle = `rgba(10, 6, 3, ${alpha})`;
  ctx.fillRect(0, 0, W.width, viewH);
  ctx.textAlign = 'center';
}

export function drawGameOver(ctx, viewH, { score, isBest, canRetry, time }) {
  panel(ctx, viewH);
  // Left: the result.
  const lx = W.width * 0.3;
  let y = viewH * 0.3;
  ctx.fillStyle = '#ff6b5a';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('KNOCKED OUT', lx, y);
  y += 70;
  ctx.fillStyle = '#fff6e8';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText(fmt(score.points), lx, y);
  y += 38;
  if (isBest) {
    ctx.fillStyle = '#ffd84a';
    ctx.font = `bold ${18 + Math.sin(time * 8) * 1.5}px system-ui, sans-serif`;
    ctx.fillText('NEW BEST!', lx, y);
  } else {
    ctx.fillStyle = 'rgba(242, 235, 226, 0.6)';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`Best ${fmt(score.best.score)}`, lx, y);
  }

  // Right: the run's stats.
  const st = score.stats;
  const rows = [
    ['Depth', `${score.maxDepth} m`, score.maxDepth >= score.best.depth && score.maxDepth > 0 ? 'best!' : `best ${score.best.depth} m`],
    ['Max combo', `x${st.maxMult.toFixed(1)}`, ''],
    ['Chains', `${st.chains}`, st.longestChain > 1 ? `longest x${st.longestChain}` : ''],
    ['Perfects', `${st.perfects}`, ''],
    ['Close calls', `${st.closeCalls}`, ''],
  ];
  const rx = W.width * 0.66;
  const ry0 = viewH * 0.5 - (rows.length * 30) / 2 - 10;
  rows.forEach(([label, value, note], i) => {
    const ry = ry0 + i * 30;
    ctx.textAlign = 'right';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(242, 235, 226, 0.6)';
    ctx.fillText(label, rx - 12, ry);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2ebe2';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(value, rx + 12, ry);
    if (note) {
      const vw = ctx.measureText(value).width;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = note === 'best!' ? '#ffd84a' : 'rgba(242, 235, 226, 0.45)';
      ctx.fillText(note, rx + 24 + vw, ry);
    }
  });

  if (canRetry) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = `rgba(242, 235, 226, ${0.65 + Math.sin(time * 4) * 0.25})`;
    ctx.fillText('Tap to dig again', W.width / 2, viewH * 0.88);
  }
}

const CONTROLS = [
  ['Hold left / right', 'steer · run'],
  ['Swipe up', 'jump · wall jump'],
  ['Tap both halves', 'ears on / off (glide + steer)'],
  ['Swipe down + hold', 'dive · dig down'],
  ['…pushing into soft dirt', 'tunnel through'],
  ['Steer into a wall', 'wall slide (sticks) · tap to drop'],
  ['Release in the gold zone', 'PERFECT'],
];

export function drawTitle(ctx, viewH, best) {
  ctx.fillStyle = 'rgba(10, 6, 3, 0.72)';
  ctx.fillRect(0, 0, W.width, viewH);
  // Left: title.
  const lx = W.width * 0.28;
  const y0 = viewH * 0.42;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2ebe2';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText('RABBIT HOLE', lx, y0);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 235, 226, 0.85)';
  ctx.fillText('Tap to drop', lx, y0 + 44);
  if (best.score > 0) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = '#ffd84a';
    ctx.fillText(`Best ${fmt(best.score)} · ${best.depth} m`, lx, y0 + 74);
  }

  // Right: controls.
  const rx = W.width * 0.72;
  const rowH = 26;
  let y = viewH * 0.5 - (CONTROLS.length * rowH + 60) / 2 + 10;
  ctx.font = '15px system-ui, sans-serif';
  CONTROLS.forEach(([input, action], i) => {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(242, 235, 226, 0.55)';
    ctx.fillText(input, rx - 10, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = i === CONTROLS.length - 1 ? '#ffd84a' : 'rgba(242, 235, 226, 0.9)';
    ctx.fillText(action, rx + 10, y);
    y += rowH;
  });
  ctx.textAlign = 'center';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 235, 226, 0.45)';
  ctx.fillText('Chains: Drill · Parachute Snap · Soft Landing · Wall Burrow', rx, y + 14);
  ctx.fillText('Keys: ← → steer · ↑ jump · Space ears on/off · ↓ dive / burrow · R restart', rx, y + 36);
}

// Shown over everything while the phone is held upright.
export function drawRotateHint(ctx, viewH) {
  ctx.fillStyle = 'rgba(10, 6, 3, 0.9)';
  ctx.fillRect(0, 0, W.width, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2ebe2';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText('↻  Turn your phone sideways', W.width / 2, viewH * 0.5);
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
  ctx.font = '18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('◀ hold', W.width * 0.25, viewH * 0.85);
  ctx.fillText('hold ▶', W.width * 0.75, viewH * 0.85);
  ctx.restore();
}
