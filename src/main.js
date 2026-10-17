// Boot, fixed-timestep loop, and scene switching.

import { CONFIG } from './config.js';
import { createInput } from './input.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { LevelGenerator, tierAt } from './level/generator.js';
import { interactHazards } from './entities/hazards.js';
import { updateRockfall } from './entities/rockfall.js';
import { randomSeed } from './rng.js';
import { Fx } from './fx.js';
import { Score } from './score.js';
import { Sound } from './audio.js';
import { drawWorld } from './render.js';
import { biomeName } from './biomes.js';
import { drawHud, drawDebug, drawTitle, drawTouchHints, drawGameOver, drawRotateHint, drawSpeaker, SPEAKER } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const STEP = 1 / CONFIG.loop.stepHz;

// Debug handle for console tuning/tests.
const params = new URLSearchParams(location.search);
const fixedSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
const forceChunk = params.get('chunk'); // repeat one section, e.g. ?chunk=cascade
const forceBand = params.get('band');   // cavern width every time: narrow | wide | normal
const debug = params.has('debug');      // fps / seed / tier / state readout

const player = new Player();
const camera = new Camera();
const fx = new Fx();
const score = new Score();
const sound = new Sound();
fx.sound = sound;
let level;
let scene = 'title';  // 'title' | 'play' | 'over'
let overTime = 0;
let isBest = false;
let runTime = 0;
let banner = null;     // { text, t } biome name when you enter a new one
let scale = 1;        // device pixels per world unit
let portrait = false; // show the "turn sideways" hint

// Landscape play area: the full world width always fits the screen; the
// aspect ratio is clamped, and anything outside it letterboxes.
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const { minAspect, maxAspect } = CONFIG.world;
  const aspect = window.innerWidth / window.innerHeight;
  portrait = aspect < 1;
  const a = Math.max(minAspect, Math.min(maxAspect, aspect));
  let cssW = Math.min(window.innerWidth, window.innerHeight * a);
  let cssH = cssW / a;
  if (cssH > window.innerHeight) {
    cssH = window.innerHeight;
    cssW = cssH * a;
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = canvas.width / CONFIG.world.width;
  camera.viewH = canvas.height / scale;
}

// Audio can only start from a user gesture. The speaker button (title and
// game-over screens) or M toggles mute; that tap doesn't also start a run.
let swallowPress = false;
canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (scene === 'play') return;
  const rect = canvas.getBoundingClientRect();
  const k = CONFIG.world.width / rect.width;
  const x = (e.clientX - rect.left) * k;
  const y = (e.clientY - rect.top) * k;
  if (x > SPEAKER.x - 10 && y < SPEAKER.y + SPEAKER.size + 10) {
    sound.toggleMute();
    swallowPress = true;
  }
});
window.addEventListener('keydown', (e) => {
  sound.unlock();
  if (e.code === 'KeyM') sound.toggleMute();
});

// On phones, the first tap goes fullscreen and tries to lock landscape
// (works on Android Chrome; iOS ignores it and shows the hint instead).
let triedLock = false;
canvas.addEventListener('pointerdown', (e) => {
  if (triedLock || e.pointerType !== 'touch') return;
  triedLock = true;
  try {
    const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    p?.then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } catch {
    // Not supported; the rotate hint covers it.
  }
});

function newRun() {
  level = new LevelGenerator(fixedSeed ?? randomSeed(), forceChunk, forceBand);
  player.reset();
  fx.reset();
  score.reset();
  camera.snapTo(player, level.world);
  level.update(0, camera);
  runTime = 0;
  banner = null;
  lastBiome = biomeName(player.y);
}
let lastBiome = '';

let lastFrame = null; // latest input snapshot, for the touch hints

function step(dt) {
  const frame = input.sample();
  lastFrame = frame;
  if (swallowPress) {
    frame.pressed = false;
    swallowPress = false;
  }
  if (scene === 'title') {
    if (frame.pressed) scene = 'play';
    return;
  }
  if (frame.restart || (scene === 'over' && frame.pressed && overTime > CONFIG.ui.retryDelay)) {
    newRun();
    scene = 'play';
    return;
  }
  fx.update(dt);
  if (scene === 'over') {
    overTime += dt;
    return;
  }
  runTime += dt;
  const world = { level, fx, score };
  player.update(dt, frame, world);
  interactHazards(player, world);
  updateRockfall(dt, player, world, camera);
  score.update(dt, player, world);
  camera.update(dt, player, level.world);
  level.update(dt, camera);
  const b = biomeName(player.y);
  if (b !== lastBiome) {
    lastBiome = b;
    banner = { text: b.toUpperCase(), t: 0 };
  }
  if (banner) banner.t += dt;
  if (player.dead) {
    scene = 'over';
    overTime = 0;
    isBest = score.finish();
    sound.play('gameOver');
  }
}

// --- FPS counter (rendered frames per second, averaged over 0.5 s).
let fps = 0;
let fpsFrames = 0;
let fpsTime = 0;

function render(alpha, frameDt) {
  fpsFrames++;
  fpsTime += frameDt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawWorld(ctx, { camera, player, level, fx, alpha: scene === 'over' ? 1 : alpha });
  const depthMeters = Math.max(0, Math.floor((player.y - CONFIG.player.startY) / CONFIG.world.unitsPerMeter));
  fx.drawOverlay(ctx, CONFIG.world.width, camera.viewH);
  const chainLive = player.move || player.chains.isLinked(player.time, player.jumpFlight > 0);
  if (scene === 'play') {
    drawHud(ctx, {
      score, depthMeters, hp: player.hp, maxHp: CONFIG.player.maxHp,
      chainCount: chainLive ? player.chains.count : 0,
      banner,
      viewH: camera.viewH,
    });
  }
  if (debug) drawDebug(ctx, camera.viewH, { fps, seed: level.seed, tier: tierAt(player.y), state: player.state });

  if (scene === 'title') drawTitle(ctx, camera.viewH, score.best);
  else if (scene === 'over') drawGameOver(ctx, camera.viewH, { score, isBest, canRetry: overTime > CONFIG.ui.retryDelay, time: overTime });
  if (scene !== 'play') drawSpeaker(ctx, sound.muted);
  else if (lastFrame) drawTouchHints(ctx, camera.viewH, Math.min(1, CONFIG.ui.hintSeconds - runTime), lastFrame);
  if (portrait) drawRotateHint(ctx, camera.viewH);
}

// --- Fixed-timestep loop with interpolated rendering.
let last = performance.now();
let acc = 0;

function frame(now) {
  const frameDt = Math.min((now - last) / 1000, 0.25);
  last = now;
  acc += frameDt;
  let steps = 0;
  while (acc >= STEP && steps < CONFIG.loop.maxStepsPerFrame) {
    step(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === CONFIG.loop.maxStepsPerFrame) acc = 0;
  render(acc / STEP, frameDt);
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  last = performance.now();
  acc = 0;
});
window.addEventListener('resize', resize);
screen.orientation?.addEventListener?.('change', resize);

window.__game = { player, camera, fx, score, sound, get level() { return level; } };

resize();
newRun();
requestAnimationFrame(frame);
