// Open-cavern geometry: long one-way ledges (straight segments, often
// sloped, so they steer you left or right) and occasional solid blocks
// (pillars, overhangs, soft walls). The cavern's side walls follow a profile
// that changes with depth: normal width, thin shafts, and wide stretches that
// run past the edges of the screen.

import { CONFIG } from '../config.js';

const W = CONFIG.world;
export const WALL = W.wallThickness;          // side walls at normal width
export const INNER = W.width - 2 * WALL;      // playable width at normal width
export const LEDGE_T = CONFIG.world.ledgeThickness;

// Ledge kinds: 'ledge' | 'fragile' | 'spikes' | 'pad'
// Block kinds: 'dirt' (Drill / Wall Burrow only) | 'soft' (dig / tunnel) | 'rock' (unbreakable)
export const RULES = {
  dig: { ledge: (k) => k !== 'pad', block: (k) => k === 'soft' },     // burrow down
  tunnel: { ledge: () => false, block: (k) => k === 'soft' },         // burrow sideways
  drill: { ledge: (k) => k !== 'pad', block: (k) => k !== 'rock' },   // Drill / Wall Burrow chains
};

export const slope = (l) => (l.y2 - l.y1) / (l.x2 - l.x1);
export const surfaceY = (l, x) => l.y1 + (l.y2 - l.y1) * ((x - l.x1) / (l.x2 - l.x1));
export const ledgeTop = (l) => Math.min(l.y1, l.y2);
export const ledgeBottom = (l) => Math.max(l.y1, l.y2) + LEDGE_T;

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class World {
  constructor() {
    this.ledges = []; // { x1, y1, x2, y2, kind }  (x1 < x2)
    this.blocks = []; // { x, y, w, h, kind }
    // Cavern walls: points { y, left, right }, linear in between.
    this.profile = [{ y: -1e6, left: WALL, right: W.width - WALL }];
  }

  addProfilePoint(y, left, right) {
    this.profile.push({ y, left, right });
  }

  // { left, right } inner wall positions at depth y.
  wallsAt(y) {
    const p = this.profile;
    let i = p.length - 1;
    while (i > 0 && p[i].y > y) i--;
    const a = p[i];
    const b = p[i + 1];
    if (!b) return { left: a.left, right: a.right };
    const t = (y - a.y) / (b.y - a.y);
    return { left: a.left + (b.left - a.left) * t, right: a.right + (b.right - a.right) * t };
  }

  // The narrowest opening over a vertical span (walls can slant in transitions).
  wallsOver(y, h) {
    const a = this.wallsAt(y);
    const b = this.wallsAt(y + h);
    return { left: Math.max(a.left, b.left), right: Math.min(a.right, b.right) };
  }

  // Solid blocks overlapping a box (the cavern walls count as rock blocks).
  blocksIn(x, y, w, h) {
    const box = { x, y, w, h };
    const hits = this.blocks.filter((b) => overlaps(box, b));
    const { left, right } = this.wallsOver(y, h);
    if (x < left) hits.push({ x: left - 2000, y: y - 1000, w: 2000, h: h + 2000, kind: 'rock', side: true });
    if (x + w > right) hits.push({ x: right, y: y - 1000, w: 2000, h: h + 2000, kind: 'rock', side: true });
    return hits;
  }

  solidAt(x, y, w, h) {
    return this.blocksIn(x, y, w, h).length > 0;
  }

  // Remove [x0, x1] from a ledge, keeping the pieces either side.
  carveLedge(l, x0, x1) {
    const i = this.ledges.indexOf(l);
    if (i < 0) return;
    const pieces = [];
    const min = CONFIG.level.minPiece;
    if (x0 - l.x1 >= min) pieces.push({ ...l, x2: x0, y2: surfaceY(l, x0) });
    if (l.x2 - x1 >= min) pieces.push({ ...l, x1, y1: surfaceY(l, x1) });
    this.ledges.splice(i, 1, ...pieces);
  }

  removeLedge(l) {
    this.ledges = this.ledges.filter((o) => o !== l);
  }

  // Subtract a rect from a block (up to four pieces remain).
  carveBlock(b, r) {
    const i = this.blocks.indexOf(b);
    if (i < 0) return;
    const min = CONFIG.level.minPiece;
    const x0 = Math.max(b.x, r.x);
    const x1 = Math.min(b.x + b.w, r.x + r.w);
    const y0 = Math.max(b.y, r.y);
    const y1 = Math.min(b.y + b.h, r.y + r.h);
    if (x0 >= x1 || y0 >= y1) return;
    const pieces = [
      { ...b, h: y0 - b.y },                                   // above
      { ...b, y: y1, h: b.y + b.h - y1 },                      // below
      { ...b, y: y0, h: y1 - y0, w: x0 - b.x },                // left
      { ...b, x: x1, y: y0, h: y1 - y0, w: b.x + b.w - x1 },   // right
    ].filter((p) => p.w >= min && p.h >= min);
    this.blocks.splice(i, 1, ...pieces);
  }

  prune(top) {
    while (this.profile.length > 2 && this.profile[1].y < top) this.profile.shift();
    this.ledges = this.ledges.filter((l) => ledgeBottom(l) > top);
    this.blocks = this.blocks.filter((b) => b.y + b.h > top);
  }
}
