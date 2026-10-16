// Hand-authored level sections, placed by generator.js with long stretches
// of open falling in between. Sections are sparse on purpose: a sloped ledge
// that catches you and slides you left or right, a funnel, a few hazards.
//
// Coordinates: x is a fraction of the playable width (0 = left wall,
// 1 = right wall); y is in world units down from the section's top. Sections
// are mirrored at random, so author one side.
//
//   ledge(x1, y1, x2, y2, opts)  one-way ledge; slope it to steer the player.
//                                opts.kind: 'ledge' | 'fragile' | 'spikes' | 'pad'
//                                opts.fragile / opts.spikes: chance (x difficulty) to become that kind
//   block(x, y, w, h, kind)      solid block; w is a fraction too, h in units.
//                                kind: 'dirt' (Drill / Wall Burrow only) | 'soft' (dig / tunnel) | 'rock'
//   thorn(x, y, opts)            opts.dx: patrol half-width (fraction), opts.period: seconds
//   ring(x, y)                   down-ring (diving through = speed burst)
//   rockfall(x, y, w)            loose rocks under an overhang; drop when you pass beneath
//   slot(x, y, kinds)            optional 'thorn' / 'carrot', filled by difficulty
//
//   diff   tier (0-3), unlocks with depth (config.difficulty.tierDepths)
//   h      section height        weight  optional pick weight (default 1)
//   minW / maxW  cavern widths this section fits (default minW: config.level.bands.defaultMinW);
//          narrow shafts are ~380-540 wide, normal ~950

const ledge = (x1, y1, x2, y2, o = {}) => ({ type: 'ledge', x1, y1, x2, y2, ...o });
const block = (x, y, w, h, kind = 'dirt') => ({ type: 'block', x, y, w, h, kind });
const thorn = (x, y, o = {}) => ({ type: 'thorn', x, y, ...o });
const ring = (x, y) => ({ type: 'ring', x, y });
const rockfall = (x, y, w) => ({ type: 'rockfall', x, y, w });
const slot = (x, y, kinds) => ({ type: 'slot', x, y, kinds });

export const CHUNKS = [
  // ---- Tier 0: long falls, ledges that send you left or right
  { id: 'deflect', minW: 300, diff: 0, h: 200, items: [
    ledge(0.04, 0, 0.5, 140),
    slot(0.62, 170, ['carrot']),
  ] },
  { id: 'funnel', minW: 300, diff: 0, h: 200, items: [
    ledge(0, 0, 0.4, 150),
    ledge(0.6, 150, 1, 0),
  ] },
  { id: 'shelf', minW: 300, diff: 0, h: 80, items: [
    ledge(0.3, 0, 0.7, 0, { fragile: 0.4 }),
    slot(0.5, -60, ['carrot', 'thorn']),
  ] },
  { id: 'cascade', minW: 380, diff: 0, h: 600, items: [
    ledge(0.12, 0, 0.55, 110),
    ledge(0.45, 330, 0.88, 220),
    ledge(0.15, 480, 0.5, 570),
  ] },
  { id: 'drift', minW: 300, diff: 0, weight: 0.6, h: 380, items: [
    ring(0.5, 60),
    ring(0.32, 320),
    slot(0.7, 200, ['carrot']),
  ] },
  { id: 'softShelf', minW: 400, diff: 0, h: 140, items: [
    block(0.3, 0, 0.4, 44, 'soft'),      // punch through, or slide off the ends
    ledge(0.08, 70, 0.28, 120),
  ] },

  // Narrow shafts
  { id: 'zigzag', diff: 0, minW: 300, h: 500, items: [
    ledge(0, 0, 0.42, 50),
    ledge(0.58, 220, 1, 170),
    ledge(0, 440, 0.42, 490),
  ] },
  { id: 'softPlug', diff: 0, minW: 300, maxW: 600, h: 80, items: [
    block(0, 0, 1, 40, 'soft'),          // the whole shaft: dig through (or Drill)
    slot(0.5, -50, ['carrot']),
  ] },

  // ---- Tier 1: spikes, pads, pillars, fragile stacks
  { id: 'spikeLanding', minW: 380, diff: 1, h: 220, items: [
    ledge(0.06, 0, 0.42, 130),
    ledge(0.5, 200, 0.82, 200, { kind: 'spikes' }), // you'll fly off the slope toward these
  ] },
  { id: 'padPop', minW: 450, diff: 1, h: 160, items: [
    ledge(0.18, 120, 0.4, 120, { kind: 'spikes' }),
    ledge(0.43, 100, 0.57, 100, { kind: 'pad' }),
    ledge(0.6, 120, 0.82, 120, { kind: 'spikes' }),
  ] },
  { id: 'pillars', diff: 1, h: 460, items: [
    block(0.3, 0, 0.05, 380, 'dirt'),    // wall-slide lanes
    block(0.65, 0, 0.05, 380, 'dirt'),
    block(0.3, 380, 0.05, 80, 'soft'),
    ring(0.5, 160),
    slot(0.15, 220, ['thorn']),
    slot(0.85, 260, ['thorn', 'carrot']),
  ] },
  { id: 'thornGate', minW: 360, diff: 1, h: 300, items: [
    ledge(0, 0, 0.4, 140),
    ledge(0.6, 140, 1, 0),
    thorn(0.5, 260, { dx: 0.16, period: 2.6 }),
  ] },
  { id: 'fragileStack', minW: 380, diff: 1, h: 300, items: [
    ledge(0.36, 0, 0.64, 0, { kind: 'fragile' }),   // Parachute Snap breaks the lot
    ledge(0.3, 140, 0.7, 140, { kind: 'fragile' }),
    ledge(0.24, 280, 0.76, 280, { kind: 'fragile' }),
  ] },

  { id: 'shaftThorns', diff: 1, minW: 300, maxW: 600, h: 480, items: [
    thorn(0.5, 120, { dx: 0.22, period: 2.2 }), // hug the walls (wall slide) to get past
    thorn(0.5, 320, { dx: 0.22, period: 1.8 }),
    ledge(0.3, 470, 0.7, 470, { fragile: 0.6 }),
  ] },

  // ---- Tier 2: rockfalls, thorn fields, soft walls
  { id: 'overhang', diff: 2, h: 420, items: [
    block(0, 0, 0.46, 48, 'dirt'),
    rockfall(0.05, 48, 0.36),
    ledge(0.06, 250, 0.5, 360),          // slides you right under the falling rocks
  ] },
  { id: 'spikePit', minW: 380, diff: 2, h: 340, items: [
    ledge(0, 0, 0.38, 160),
    ledge(0.62, 160, 1, 0),
    ledge(0.42, 320, 0.58, 320, { kind: 'spikes' }),
  ] },
  { id: 'thornField', diff: 2, h: 380, items: [
    thorn(0.18, 60),
    thorn(0.5, 20, { dx: 0.1, period: 2 }),
    thorn(0.82, 120),
    thorn(0.34, 260, { dx: 0.12, period: 2.4 }),
    thorn(0.68, 300),
    ledge(0.55, 380, 0.95, 300, { spikes: 0.4 }),
  ] },
  { id: 'softWall', diff: 2, h: 420, items: [
    block(0.48, 0, 0.04, 360, 'soft'),   // slide it, tunnel through it
    slot(0.25, 180, ['thorn']),
    slot(0.72, 120, ['carrot']),
    ledge(0.06, 400, 0.4, 420, { spikes: 0.5 }),
  ] },

  // ---- Tier 3: pressure
  { id: 'gauntlet', minW: 450, diff: 3, h: 520, items: [
    ledge(0, 0, 0.42, 180),
    ledge(0.58, 180, 1, 0),
    thorn(0.5, 260, { dx: 0.08, period: 1.6 }),
    ring(0.5, 330),
    ledge(0.2, 470, 0.45, 470, { spikes: 0.7 }),
    ledge(0.55, 470, 0.8, 470, { spikes: 0.7 }),
  ] },
  { id: 'chute', diff: 3, h: 560, items: [
    block(0.32, 0, 0.1, 520, 'dirt'),    // a narrow chute between two walls (or go around)
    block(0.58, 0, 0.1, 520, 'dirt'),
    block(0.42, 300, 0.04, 120, 'soft'),
    thorn(0.5, 140, { dx: 0.04, period: 1.4 }),
    ring(0.5, 420),
  ] },
  { id: 'rockSlide', diff: 3, h: 480, items: [
    block(0.5, 0, 0.5, 48, 'dirt'),
    rockfall(0.55, 48, 0.4),
    ledge(0.95, 200, 0.5, 300, { spikes: 0.3 }),
    ledge(0.05, 420, 0.4, 480),
  ] },
];
