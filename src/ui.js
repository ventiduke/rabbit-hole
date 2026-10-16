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
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 240, 220, 0.9)';
  ctx.fillText(`${depthMeters} m`, W.width - t - 8, 28);

  // Score with a little pop when a bonus lands.
  const pop = score.popups[0] && score.popups[0].age < 0.15 ? 1 - score.popups[0].age / 0.15 : 0;
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(24 + pop * 4)}px system-ui, sans-serif`;
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
  let y = viewH * 0.26;
  ctx.fillStyle = '#ff6b5a';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText('KNOCKED OUT', CX, y);

  y += 58;
  ctx.fillStyle = '#fff6e8';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(fmt(score.points), CX, y);

  y += 30;
  if (isBest) {
    ctx.fillStyle = '#ffd84a';
    ctx.font = `bold ${15 + Math.sin(time * 8) * 1.5}px system-ui, sans-serif`;
    ctx.fillText('NEW BEST!', CX, y);
  } else {
    ctx.fillStyle = 'rgba(242, 235, 226, 0.6)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`Best ${fmt(score.best.score)}`, CX, y);
  }

  const st = score.stats;
  const rows = [
    ['Depth', `${score.maxDepth} m`, score.maxDepth >= score.best.depth && score.maxDepth > 0 ? 'best!' : `best ${score.best.depth} m`],
    ['Max combo', `x${st.maxMult.toFixed(1)}`, ''],
    ['Chains', `${st.chains}`, st.longestChain > 1 ? `longest x${st.longestChain}` : ''],
    ['Perfects', `${st.perfects}`, ''],
    ['Close calls', `${st.closeCalls}`, ''],
  ];
  y += 46;
  ctx.font = '14px system-ui, sans-serif';
  rows.forEach(([label, value, note], i) => {
    const ry = y + i * 26;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(242, 235, 226, 0.6)';
    ctx.fillText(label, CX - 10, ry);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2ebe2';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(value, CX + 10, ry);
    if (note) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = note === 'best!' ? '#ffd84a' : 'rgba(242, 235, 226, 0.45)';
      ctx.fillText(note, CX + 10 + ctx.measureText(value).width + 30, ry);
    }
    ctx.font = '14px system-ui, sans-serif';
  });

  if (canRetry) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = `rgba(242, 235, 226, ${0.65 + Math.sin(time * 4) * 0.25})`;
    ctx.fillText('Tap to dig again', CX, y + rows.length * 26 + 40);
  }
}

const CONTROLS = [
  ['Hold left / right', 'steer · run'],
  ['Swipe up', 'jump · wall jump'],
  ['Hold both halves', 'ears (glide)'],
  ['Swipe down + hold', 'dive · dig down'],
  ['…pushing into soft dirt', 'tunnel sideways'],
  ['Steer into wall', 'wall slide · lift to drop'],
  ['Release in the gold zone', 'PERFECT'],
];

export function drawTitle(ctx, viewH, best) {
  ctx.fillStyle = 'rgba(10, 6, 3, 0.72)';
  ctx.fillRect(0, 0, W.width, viewH);
  const y0 = viewH * 0.4;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2ebe2';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillText('RABBIT HOLE', W.width / 2, y0);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 235, 226, 0.85)';
  ctx.fillText('Tap to drop', W.width / 2, y0 + 36);
  if (best.score > 0) {
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffd84a';
    ctx.fillText(`Best ${fmt(best.score)} · ${best.depth} m`, W.width / 2, y0 + 58);
  }

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
  ctx.fillText('Keys: ← → steer · ↑ jump · Space ears', W.width / 2, y0 + 80 + CONTROLS.length * 22 + 32);
  ctx.fillText('↓ dive / burrow · R restart', W.width / 2, y0 + 80 + CONTROLS.length * 22 + 48);
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
