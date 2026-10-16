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
import { drawWorld } from './render.js';
import { drawHud, drawTitle, drawTouchHints, drawGameOver } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const STEP = 1 / CONFIG.loop.stepHz;

// Debug handle for console tuning/tests.
const params = new URLSearchParams(location.search);
const fixedSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
const forceChunk = params.get('chunk'); // repeat one chunk, e.g. ?chunk=rockWall

const player = new Player();
const camera = new Camera();
const fx = new Fx();
let level;
let scene = 'title';  // 'title' | 'play' | 'over'
let overTime = 0;
let runTime = 0;
let scale = 1;        // device pixels per world unit

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssH = window.innerHeight;
  const cssW = Math.min(window.innerWidth, cssH * CONFIG.world.maxAspect);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = canvas.width / CONFIG.world.width;
  camera.viewH = canvas.height / scale;
}

function newRun() {
  level = new LevelGenerator(fixedSeed ?? randomSeed(), forceChunk);
  player.reset();
  fx.reset();
  camera.snapTo(player);
  level.update(0, camera);
  runTime = 0;
}

let lastFrame = null; // latest input snapshot, for the touch hints

function step(dt) {
  const frame = input.sample();
  lastFrame = frame;
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
  const world = { level, fx };
  player.update(dt, frame, world);
  interactHazards(player, world);
  updateRockfall(dt, player, world, camera);
  camera.update(dt, player);
  level.update(dt, camera);
  if (player.dead) {
    scene = 'over';
    overTime = 0;
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
  drawHud(ctx, {
    depthMeters, fps, seed: level.seed, state: player.state,
    chainCount: chainLive ? player.chains.count : 0,
    hp: player.hp, maxHp: CONFIG.player.maxHp, tier: tierAt(player.y),
  });

  if (scene === 'title') drawTitle(ctx, camera.viewH);
  else if (scene === 'over') drawGameOver(ctx, camera.viewH, { depthMeters, canRetry: overTime > CONFIG.ui.retryDelay });
  else if (lastFrame) drawTouchHints(ctx, camera.viewH, Math.min(1, CONFIG.ui.hintSeconds - runTime), lastFrame);
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

window.__game = { player, camera, fx, get level() { return level; } };

resize();
newRun();
requestAnimationFrame(frame);
