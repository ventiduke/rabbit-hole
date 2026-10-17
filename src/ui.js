// HUD and overlays, drawn in world units on top of the scene.

import { CONFIG } from './config.js';

const W = CONFIG.world;

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const CX = W.width / 2;

export function drawHud(ctx, { score, depthMeters, hp, maxHp, chainCount, banner, viewH }) {
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

  // Entering a new biome.
  if (banner && banner.t < 3) {
    const a = banner.t < 0.4 ? banner.t / 0.4 : banner.t > 2.2 ? (3 - banner.t) / 0.8 : 1;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    const by = viewH * 0.66; // below the rabbit
    ctx.fillText(banner.text, CX + 2, by + 2);
    ctx.fillStyle = '#f2ebe2';
    ctx.fillText(banner.text, CX, by);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(242, 235, 226, 0.7)';
    ctx.fillText(`${depthMeters} m`, CX, by + 22);
    ctx.globalAlpha = 1;
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

  drawButton(ctx, OVER_MENU, '☰  Menu', false);
  if (canRetry) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = `rgba(242, 235, 226, ${0.65 + Math.sin(time * 4) * 0.25})`;
    ctx.fillText('Tap to dig again', W.width / 2, viewH * 0.88);
  }
}

// ---------------------------------------------------------------- buttons & menus
// Layout functions are shared by drawing and by tap hit-testing in main.js.

export const hit = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

function drawButton(ctx, r, label, primary) {
  ctx.fillStyle = primary ? '#ffd84a' : 'rgba(242, 235, 226, 0.12)';
  roundRect(ctx, r.x, r.y, r.w, r.h, 12);
  ctx.fill();
  ctx.strokeStyle = primary ? '#ffd84a' : 'rgba(242, 235, 226, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = primary ? '#1a110b' : '#f2ebe2';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 7);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function titleButtons(viewH) {
  const x = W.width * 0.28 - 130;
  const y = viewH * 0.42 + 60;
  return {
    endless: { x, y, w: 260, h: 54 },
    practice: { x, y: y + 68, w: 260, h: 54 },
  };
}

export const BACK = { x: 30, y: 14, w: 120, h: 42 };
export const OVER_MENU = { x: 30, y: 14, w: 120, h: 42 };

export function practiceCards(viewH, n) {
  const cols = 4;
  const rows = Math.ceil(n / cols);
  const gap = 14;
  const top = 76;
  const w = (W.width - 60 - gap * (cols - 1)) / cols;
  const h = Math.min(110, (viewH - top - 20 - gap * (rows - 1)) / rows);
  return Array.from({ length: n }, (_, i) => ({
    x: 30 + (i % cols) * (w + gap),
    y: top + Math.floor(i / cols) * (h + gap),
    w,
    h,
  }));
}

export function drawPracticeMenu(ctx, viewH, { drills, cleared, tallies, selected }) {
  panel(ctx, viewH, 0.85);
  drawButton(ctx, BACK, '‹  Back', false);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2ebe2';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText('PRACTICE', BACK.x + BACK.w + 24, 46);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 235, 226, 0.6)';
  ctx.fillText('Pick a drill. It resets on its own after every try.', BACK.x + BACK.w + 200, 44);

  practiceCards(viewH, drills.length).forEach((r, i) => {
    const d = drills[i];
    const done = cleared.has(d.id);
    ctx.fillStyle = i === selected ? 'rgba(255, 216, 74, 0.18)' : 'rgba(242, 235, 226, 0.07)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.strokeStyle = i === selected ? '#ffd84a' : done ? 'rgba(155, 227, 122, 0.7)' : 'rgba(242, 235, 226, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2ebe2';
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillText(`${i + 1}. ${d.name}`, r.x + 14, r.y + 30);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(242, 235, 226, 0.65)';
    ctx.fillText(d.tag, r.x + 14, r.y + 54);
    const tally = tallies[d.id];
    if (tally) {
      ctx.fillStyle = 'rgba(242, 235, 226, 0.5)';
      ctx.fillText(`${tally.successes} / ${tally.attempts}`, r.x + 14, r.y + r.h - 14);
    }
    if (done) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9be37a';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('✓', r.x + r.w - 14, r.y + 30);
    }
  });
}

// While practising: the drill, how to do it, the tally, the timer, and the result.
export function drawPracticeHud(ctx, viewH, session) {
  const d = session.drill;
  drawButton(ctx, BACK, '‹  Menu', false);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2ebe2';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(d.name.toUpperCase(), CX, 34);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(242, 235, 226, 0.85)';
  ctx.fillText(d.how, CX, 58);
  const limit = d.time ?? CONFIG.practice.time;
  const left = Math.max(0, 1 - session.t / limit);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(CX - 120, 68, 240, 4);
  ctx.fillStyle = left > 0.25 ? 'rgba(242, 235, 226, 0.7)' : '#ff9a7a';
  ctx.fillRect(CX - 120, 68, 240 * left, 4);

  ctx.textAlign = 'right';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#9be37a';
  ctx.fillText(`✓ ${session.successes} / ${session.attempts}`, W.width - 40, 36);
  if (session.streak > 1) {
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = '#ffd84a';
    ctx.fillText(`streak ${session.streak}`, W.width - 40, 58);
  }

  const r = session.result;
  if (!r) return;
  const a = Math.min(1, r.t / 0.12);
  ctx.globalAlpha = a;
  ctx.fillStyle = r.ok ? 'rgba(30, 60, 20, 0.55)' : 'rgba(60, 20, 16, 0.55)';
  ctx.fillRect(0, viewH * 0.36, W.width, 110);
  ctx.textAlign = 'center';
  ctx.font = `bold ${44 + (1 - a) * 12}px system-ui, sans-serif`;
  ctx.fillStyle = r.ok ? '#9be37a' : '#ff8a6e';
  ctx.fillText(r.ok ? 'NICE!' : 'TRY AGAIN', CX, viewH * 0.36 + 56);
  if (!r.ok) {
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = '#f2ebe2';
    ctx.fillText(r.reason, CX, viewH * 0.36 + 90);
  }
  ctx.globalAlpha = 1;
}

const CONTROLS = [
  ['Hold left / right', 'steer · run'],
  ['Swipe up', 'jump · wall jump'],
  ['Tap both halves', 'ears on / off (glide + steer)'],
  ['Swipe down', 'dive (again: drill) · dig'],
  ['Tap', 'end a dive / slide · clean exit'],
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
  if (best.score > 0) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = '#ffd84a';
    ctx.fillText(`Best ${fmt(best.score)} · ${best.depth} m`, lx, y0 + 34);
  }
  const btn = titleButtons(viewH);
  drawButton(ctx, btn.endless, '▶  ENDLESS', true);
  drawButton(ctx, btn.practice, '◎  PRACTICE', false);

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
  ctx.fillText('Ricochet · Spear · Ear Catch · Pop-Up', rx, y + 32);
  ctx.fillText('Keys: ← → steer · ↑ jump · Space ears · ↓ dive / burrow · X tap · M mute', rx, y + 54);
  ctx.fillText('Enter: endless · P: practice · Esc: back · R: restart', rx, y + 72);
}

// Mute button (title and game-over screens), top-right.
export const SPEAKER = { x: W.width - 70, y: 18, size: 40 };

export function drawSpeaker(ctx, muted) {
  const { x, y, size: s } = SPEAKER;
  ctx.save();
  ctx.fillStyle = 'rgba(242, 235, 226, 0.75)';
  ctx.strokeStyle = 'rgba(242, 235, 226, 0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + s * 0.38);
  ctx.lineTo(x + 12, y + s * 0.38);
  ctx.lineTo(x + 22, y + s * 0.18);
  ctx.lineTo(x + 22, y + s * 0.82);
  ctx.lineTo(x + 12, y + s * 0.62);
  ctx.lineTo(x + 4, y + s * 0.62);
  ctx.fill();
  ctx.beginPath();
  if (muted) {
    ctx.moveTo(x + 27, y + s * 0.35);
    ctx.lineTo(x + 37, y + s * 0.65);
    ctx.moveTo(x + 37, y + s * 0.35);
    ctx.lineTo(x + 27, y + s * 0.65);
  } else {
    ctx.arc(x + 22, y + s / 2, 9, -0.8, 0.8);
    ctx.moveTo(x + 22 + 15 * Math.cos(-0.8), y + s / 2 + 15 * Math.sin(-0.8));
    ctx.arc(x + 22, y + s / 2, 15, -0.8, 0.8);
  }
  ctx.stroke();
  ctx.restore();
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
