// Tile terrain: the world is a grid of TILE-sized cells, COLS wide (the full
// screen width) and endless downward. Rows are generated ahead of the camera
// and dropped behind it.

import { CONFIG } from '../config.js';

export const TILE = CONFIG.world.tile;
export const COLS = Math.round(CONFIG.world.width / TILE);

export const T = {
  EMPTY: 0,
  DIRT: 1,     // solid; only Drill / Wall Burrow get through
  SOFT: 2,     // solid; dig down or tunnel sideways through it
  ROCK: 3,     // solid; unbreakable
  LEDGE: 4,    // one-way platform (jump up through it); diggable
  FRAGILE: 5,  // one-way platform that breaks (Parachute Snap, rocks); diggable
  SPIKES: 6,   // solid; landing on top hurts
  PAD: 7,      // solid; bounces you up
  LOOSE: 8,    // solid; a rockfall source (falls when you pass beneath)
};

const PROPS = {
  [T.EMPTY]: {},
  [T.DIRT]: { solid: true, drill: true },
  [T.SOFT]: { solid: true, dig: true, tunnel: true, drill: true },
  [T.ROCK]: { solid: true },
  [T.LEDGE]: { solid: true, oneWay: true, dig: true, drill: true },
  [T.FRAGILE]: { solid: true, oneWay: true, dig: true, drill: true, fragile: true },
  [T.SPIKES]: { solid: true, drill: true, spikes: true },
  [T.PAD]: { solid: true, pad: true },
  [T.LOOSE]: { solid: true },
};

export const props = (t) => PROPS[t];
export const isSolid = (t) => !!PROPS[t].solid;
// Blocks movement from every side (one-way ledges only block from above).
export const isWall = (t) => !!PROPS[t].solid && !PROPS[t].oneWay;

// Which tiles each kind of burrow can remove.
export const DIG_RULES = {
  dig: (t) => !!PROPS[t].dig,        // burrow down
  tunnel: (t) => !!PROPS[t].tunnel,  // burrow sideways
  drill: (t) => !!PROPS[t].drill,    // Drill / Wall Burrow chains
};

export class TileMap {
  constructor() {
    this.rows = new Map(); // row index -> Uint8Array(COLS)
  }

  get(c, r) {
    if (c < 0 || c >= COLS) return T.ROCK;
    const row = this.rows.get(r);
    return row ? row[c] : r < 0 ? T.EMPTY : T.DIRT;
  }

  set(c, r, t) {
    const row = this.rows.get(r);
    if (row && c > 0 && c < COLS - 1) row[c] = t;
  }

  setRow(r, row) {
    this.rows.set(r, row);
  }

  // Drop rows above `r` (recycling).
  prune(r) {
    for (const k of this.rows.keys()) if (k < r) this.rows.delete(k);
  }

  // Calls fn(c, r, t) for every tile overlapping the box.
  forBox(x, y, w, h, fn) {
    const c0 = Math.floor(x / TILE);
    const c1 = Math.floor((x + w - 1e-6) / TILE);
    const r0 = Math.floor(y / TILE);
    const r1 = Math.floor((y + h - 1e-6) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) fn(c, r, this.get(c, r));
    }
  }

  anyInBox(x, y, w, h, test) {
    let hit = false;
    this.forBox(x, y, w, h, (c, r, t) => {
      if (!hit && test(t)) hit = true;
    });
    return hit;
  }

  // Remove every solid tile in the box that `canDig` allows. If any solid tile
  // in the box is not allowed, nothing is removed and `blocked` is true.
  carveBox(x, y, w, h, canDig) {
    const cells = [];
    let blocked = false;
    this.forBox(x, y, w, h, (c, r, t) => {
      if (!isSolid(t)) return;
      if (canDig(t)) cells.push({ c, r, t });
      else blocked = true;
    });
    if (blocked) return { blocked, cells: [] };
    for (const { c, r } of cells) this.set(c, r, T.EMPTY);
    return { blocked, cells };
  }

  rect(c, r) {
    return { x: c * TILE, y: r * TILE, w: TILE, h: TILE };
  }
}
