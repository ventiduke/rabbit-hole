// Hand-authored level chunks, stitched together by generator.js.
//
// Coordinates: x runs 0..324 across the inner shaft (between the walls),
// y runs down from the chunk's top. The shaft is split into three lanes for
// connecting chunks: L = 0-108, C = 108-216, R = 216-324.
//
//   diff   tier (0-3) — unlocks with depth (config.difficulty.tierDepths)
//   h      chunk height
//   entry  lanes that are safe to fall into at the top
//   exit   lanes you can leave through at the bottom
//          (a chunk can follow another only if its entry covers the other's exit)
//   weight optional pick weight (default 1)
//
// Optional chances (spikes: 0.5, fragile: 0.3) scale with difficulty;
// `true` means always. Chunks are mirrored at random, so author one side.

const ledge = (x, y, w, o = {}) => ({ type: 'ledge', x, y, w, ...o });
const pad = (x, y, w) => ({ type: 'pad', x, y, w });           // up-bouncer
const ring = (x, y, w) => ({ type: 'ring', x, y, w });         // down-booster
const thorn = (x, y, o = {}) => ({ type: 'thorn', x, y, ...o }); // o.dx / o.period: patrol
const rockfall = (side, y, h, trigger = 'touch') => ({ type: 'rockfall', side, y, h, trigger });
const slot = (x, y, kinds) => ({ type: 'slot', x, y, kinds });  // filled by difficulty

export const CHUNKS = [
  // ---- Tier 0: learn to fall
  { id: 'gap', diff: 0, h: 160, entry: 'LCR', exit: 'LCR', weight: 0.4, items: [] },
  { id: 'shelf', diff: 0, h: 260, entry: 'LCR', exit: 'LCR', items: [
    ledge(0, 150, 140, { fragile: 0.3 }),
    slot(250, 90, ['carrot', 'thorn']),
  ] },
  { id: 'steps', diff: 0, h: 440, entry: 'LCR', exit: 'LCR', items: [
    ledge(0, 120, 170),
    ledge(154, 300, 170, { fragile: 0.3 }),
    slot(80, 230, ['thorn']),
  ] },
  { id: 'funnel', diff: 0, h: 300, entry: 'LCR', exit: 'C', items: [
    ledge(0, 170, 118),
    ledge(206, 170, 118),
    slot(162, 70, ['carrot']),
  ] },
  { id: 'float', diff: 0, h: 380, entry: 'LCR', exit: 'LCR', items: [
    ledge(40, 140, 100, { fragile: 0.4 }),
    ledge(190, 270, 110, { fragile: 0.4 }),
  ] },

  // ---- Tier 1: spikes, pads, rings, thorns
  { id: 'spikeShelf', diff: 1, h: 340, entry: 'CR', exit: 'CR', items: [
    ledge(0, 210, 120, { spikes: true }),
    ledge(244, 110, 80, { fragile: 0.3 }),
    slot(60, 90, ['thorn']),
  ] },
  { id: 'padWall', diff: 1, h: 400, entry: 'LCR', exit: 'LCR', items: [
    ledge(0, 120, 120, { spikes: 0.5 }),
    pad(234, 230, 90),
    ledge(0, 330, 150, { fragile: 0.5 }),
  ] },
  { id: 'rings', diff: 1, h: 460, entry: 'LCR', exit: 'C', items: [
    ring(126, 110, 72),
    ring(126, 260, 72),
    ledge(0, 400, 130, { fragile: 0.5 }),
    ledge(194, 400, 130, { fragile: 0.5 }),
  ] },
  { id: 'thornGate', diff: 1, h: 400, entry: 'LCR', exit: 'LCR', items: [
    ledge(0, 140, 118),
    ledge(206, 140, 118),
    thorn(162, 270, { dx: 100, period: 2.6 }),
  ] },

  // ---- Tier 2: rockfalls, moving thorns
  { id: 'rockWall', diff: 2, h: 520, entry: 'LCR', exit: 'LCR', items: [
    rockfall('L', 40, 220),
    ledge(0, 300, 130, { fragile: true }),
    ledge(190, 150, 134),
    pad(0, 470, 90),
    slot(250, 380, ['thorn', 'carrot']),
  ] },
  { id: 'thornField', diff: 2, h: 520, entry: 'LCR', exit: 'LCR', items: [
    thorn(60, 120, { dx: 40, period: 1.8 }),
    thorn(260, 220, { dx: 40, period: 2.2 }),
    thorn(150, 360, { dx: 120, period: 3 }),
    ledge(0, 460, 100, { spikes: 0.5 }),
  ] },
  { id: 'spikeSteps', diff: 2, h: 520, entry: 'LCR', exit: 'LCR', items: [
    ledge(0, 120, 150),
    ledge(200, 250, 124, { spikes: 0.7 }),
    ledge(0, 390, 110, { spikes: 0.7 }),
    slot(260, 120, ['carrot']),
  ] },
  { id: 'ringDrop', diff: 2, h: 560, entry: 'LCR', exit: 'LCR', items: [
    ring(20, 100, 80),
    ledge(130, 200, 194, { spikes: 0.6 }),
    ring(20, 300, 80),
    ledge(0, 460, 140, { fragile: true }),
    slot(250, 380, ['thorn']),
  ] },

  // ---- Tier 3: pressure
  { id: 'rumble', diff: 3, h: 600, entry: 'LCR', exit: 'LCR', items: [
    rockfall('L', 0, 300, 'pass'),
    rockfall('R', 200, 300, 'pass'),
    ledge(110, 200, 104, { fragile: true }),
    ledge(0, 420, 120, { spikes: 0.5 }),
    ledge(204, 420, 120, { spikes: 0.5 }),
  ] },
  { id: 'gauntlet', diff: 3, h: 560, entry: 'C', exit: 'C', items: [
    ledge(0, 120, 120, { spikes: true }),
    ledge(204, 120, 120, { spikes: true }),
    thorn(162, 260, { dx: 90, period: 2 }),
    ring(130, 340, 64),
    ledge(0, 480, 130, { spikes: 0.6 }),
    ledge(194, 480, 130, { spikes: 0.6 }),
  ] },
  { id: 'chase', diff: 3, h: 640, entry: 'LCR', exit: 'LCR', items: [
    rockfall('R', 0, 400, 'touch'),
    ledge(0, 160, 200, { fragile: true }),
    thorn(250, 300, { dx: 50, period: 1.6 }),
    ledge(124, 440, 200, { fragile: true }),
    pad(0, 560, 90),
  ] },
];
