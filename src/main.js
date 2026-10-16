// Boot, fixed-timestep loop, and scene switching.

import { CONFIG } from './config.js';
import { createInput } from './input.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { LevelGenerator } from './level/generator.js';
import { randomSeed } from './rng.js';
import { drawWorld } from './render.js';
import { drawHud, drawTitle, drawTouchHints } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const STEP = 1 / CONFIG.loop.stepHz;

const params = new URLSearchParams(location.search);
const fixedSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;

const player = new Player();
const camera = new Camera();
let level;
let scene = 'title';  // 'title' | 'play'
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
  level = new LevelGenerator(fixedSeed ?? randomSeed());
  player.reset();
  camera.snapTo(player);
  level.update(camera);
  runTime = 0;
}

function step(dt) {
  const pressed = input.consumePress();
  if (scene === 'title') {
    if (pressed) scene = 'play';
    return;
  }
  if (input.isDown('KeyR')) {
    newRun();
    return;
  }
  runTime += dt;
  player.update(dt, input, level.ledges);
  camera.update(dt, player);
  level.update(camera);
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
  drawWorld(ctx, { camera, player, ledges: level.ledges, alpha });
  const depthMeters = Math.max(0, Math.floor((player.y - CONFIG.player.startY) / CONFIG.world.unitsPerMeter));
  drawHud(ctx, { viewH: camera.viewH, depthMeters, fps, seed: level.seed });

  if (scene === 'title') drawTitle(ctx, camera.viewH);
  else drawTouchHints(ctx, camera.viewH, Math.min(1, CONFIG.ui.hintSeconds - runTime), input);
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

resize();
newRun();
requestAnimationFrame(frame);
