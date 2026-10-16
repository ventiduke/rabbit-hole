// M1 placeholder generator: endless rows of static ledges from a seeded RNG,
// spawned ahead of the camera and recycled behind it. The data-driven chunk
// system (§7) replaces this in M4.

import { CONFIG } from '../config.js';
import { createRng } from '../rng.js';

const L = CONFIG.ledges;

export class LevelGenerator {
  constructor(seed) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.ledges = [];
    this.nextY = L.firstY;
  }

  update(camera) {
    const bottom = camera.y + camera.viewH + L.spawnAhead;
    while (this.nextY < bottom) {
      this.ledges.push(this.makeLedge(this.nextY));
      this.nextY += this.rng.range(L.gapMin, L.gapMax);
    }
    const top = camera.y - L.despawnBehind;
    this.ledges = this.ledges.filter((l) => l.y + l.h > top);
  }

  makeLedge(y) {
    const { rng } = this;
    const t = CONFIG.world.wallThickness;
    const inner = CONFIG.world.width - 2 * t;
    const w = Math.min(rng.range(L.widthMin, L.widthMax), inner - L.minHole);
    let x;
    if (rng.chance(L.wallAttachedChance)) {
      x = rng.chance(0.5) ? t : t + inner - w;
    } else {
      // Floating: at least one side keeps a passable hole.
      x = t + L.minHole + rng.next() * (inner - w - 2 * L.minHole);
      if (inner - w < 2 * L.minHole) x = t + L.minHole;
    }
    const fragile = y > L.firstY && rng.chance(L.fragileChance);
    return { x, y, w, h: L.thickness, fragile };
  }

  // Cut a hole [x0, x1] out of a ledge (burrow / drill), keeping the pieces.
  carve(ledge, x0, x1) {
    const i = this.ledges.indexOf(ledge);
    if (i < 0) return;
    const pieces = [];
    if (x0 - ledge.x >= L.minPiece) pieces.push({ ...ledge, w: x0 - ledge.x });
    if (ledge.x + ledge.w - x1 >= L.minPiece) pieces.push({ ...ledge, x: x1, w: ledge.x + ledge.w - x1 });
    this.ledges.splice(i, 1, ...pieces);
  }

  // Break every fragile ledge in [y, y + range]; returns the broken ledges.
  shockwave(y, range) {
    const broken = this.ledges.filter((l) => l.fragile && l.y >= y - 2 && l.y <= y + range);
    this.ledges = this.ledges.filter((l) => !broken.includes(l));
    return broken;
  }
}
