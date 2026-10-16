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
    return { x, y, w, h: L.thickness };
  }
}
