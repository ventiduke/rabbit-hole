// Endless level: hand-authored chunks (chunks.js) stitched procedurally.
// Chunks spawn ahead of the camera and everything is recycled behind it, so
// memory stays flat. All randomness comes from the seeded RNG, so a seed
// replays the same level.

import { CONFIG } from '../config.js';
import { createRng } from '../rng.js';
import { CHUNKS } from './chunks.js';

const LV = CONFIG.level;
const LG = CONFIG.ledges;
const D = CONFIG.difficulty;
const T = CONFIG.world.wallThickness;
const INNER = CONFIG.world.width - 2 * T;

const lerp = (a, b, t) => a + (b - a) * t;
const MIRROR_LANE = { L: 'R', C: 'C', R: 'L' };

export function difficultyAt(y) {
  const meters = y / CONFIG.world.unitsPerMeter;
  return Math.max(0, Math.min(1, meters / D.maxDepth));
}

export function tierAt(y) {
  const meters = y / CONFIG.world.unitsPerMeter;
  let tier = 0;
  D.tierDepths.forEach((depth, i) => {
    if (meters >= depth) tier = i;
  });
  return tier;
}

export class LevelGenerator {
  // forceChunk: chunk id to repeat (debug, ?chunk=id)
  constructor(seed, forceChunk = null) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.hazardRng = createRng(seed ^ 0x9e3779b9); // runtime randomness, kept off the layout RNG
    this.forceChunk = CHUNKS.find((c) => c.id === forceChunk) ?? null;
    this.time = 0;
    this.ledges = [];   // { x, y, w, h, fragile, spikes, pad }
    this.thorns = [];   // { x, y, baseX, dx, period, phase, r }
    this.rings = [];    // { x, y, w, h }
    this.carrots = [];  // { x, y }
    this.rockZones = [];// { side, y0, y1, trigger, fired }
    this.rocks = [];    // { x, y, w, h, vy, delay }
    this.warnings = []; // { side, age, life } rockfall telegraphs
    this.nextY = LV.firstY;
    this.prevExit = 'LCR';
    this.placed = [];   // recent chunk ids, for debugging
  }

  update(dt, camera) {
    this.time += dt;
    const bottom = camera.y + camera.viewH + LV.spawnAhead;
    while (this.nextY < bottom) this.placeChunk();

    for (const t of this.thorns) {
      t.x = t.baseX + (t.dx ? t.dx * Math.sin((this.time / t.period) * Math.PI * 2 + t.phase) : 0);
    }

    const top = camera.y - LV.despawnBehind;
    const keep = (o) => o.y + (o.h ?? o.r ?? 0) > top;
    this.ledges = this.ledges.filter(keep);
    this.thorns = this.thorns.filter(keep);
    this.rings = this.rings.filter(keep);
    this.carrots = this.carrots.filter(keep);
    this.rockZones = this.rockZones.filter((z) => z.y1 > top);
  }

  // ---------------------------------------------------------------- chunks

  placeChunk() {
    const y0 = this.nextY;
    const d = difficultyAt(y0);
    const { chunk, mirrored } = this.pickChunk(y0);
    const lanes = (s) => (mirrored ? [...s].map((l) => MIRROR_LANE[l]).join('') : s);
    const mx = (x, w = 0) => T + (mirrored ? INNER - x - w : x);
    const hazardScale = lerp(D.hazardScale[0], D.hazardScale[1], d);
    const chance = (v) => v === true || (typeof v === 'number' && this.rng.chance(v * hazardScale));

    for (const it of chunk.items) {
      const y = y0 + it.y;
      switch (it.type) {
        case 'ledge':
          this.ledges.push({ x: mx(it.x, it.w), y, w: it.w, h: LG.thickness, fragile: chance(it.fragile), spikes: chance(it.spikes) });
          break;
        case 'pad':
          this.ledges.push({ x: mx(it.x, it.w), y, w: it.w, h: LG.padThickness, pad: true });
          break;
        case 'ring':
          this.rings.push({ x: mx(it.x, it.w), y, w: it.w, h: 12 });
          break;
        case 'thorn':
          this.addThorn(mx(it.x), y, it.dx ?? 0, it.period ?? 2, d);
          break;
        case 'rockfall': {
          const side = (it.side === 'L') !== mirrored ? -1 : 1;
          this.rockZones.push({ side, y0: y, y1: y + it.h, trigger: it.trigger, fired: false });
          break;
        }
        case 'slot':
          this.fillSlot(it, mx(it.x), y, d);
          break;
      }
    }

    this.placed.push(chunk.id + (mirrored ? '~' : ''));
    if (this.placed.length > 12) this.placed.shift();
    this.prevExit = lanes(chunk.exit);
    this.nextY = y0 + chunk.h + lerp(D.chunkGap[0], D.chunkGap[1], d);
  }

  pickChunk(y) {
    const tier = tierAt(y);
    const fits = (entry) => [...this.prevExit].every((l) => entry.includes(l));
    const options = [];
    for (const chunk of this.forceChunk ? [this.forceChunk] : CHUNKS) {
      if (chunk.diff > tier && !this.forceChunk) continue;
      const w = (chunk.weight ?? 1) * (chunk.diff === tier && tier > 0 ? D.newestTierWeight : 1);
      for (const mirrored of [false, true]) {
        const entry = mirrored ? [...chunk.entry].map((l) => MIRROR_LANE[l]).join('') : chunk.entry;
        if (this.forceChunk || fits(entry)) options.push({ chunk, mirrored, w });
      }
    }
    if (!options.length) return { chunk: CHUNKS[0], mirrored: false }; // 'gap' fits anything
    let r = this.rng.next() * options.reduce((s, o) => s + o.w, 0);
    for (const o of options) {
      r -= o.w;
      if (r <= 0) return o;
    }
    return options.at(-1);
  }

  addThorn(x, y, dx, period, d) {
    const speed = lerp(D.thornSpeed[0], D.thornSpeed[1], d);
    this.thorns.push({
      x, y, baseX: x, dx, period: period / speed,
      phase: this.rng.next() * Math.PI * 2,
      r: CONFIG.hazards.thornRadius,
    });
  }

  fillSlot(slot, x, y, d) {
    if (slot.kinds.includes('carrot') && this.rng.chance(D.carrotChance)) {
      this.carrots.push({ x, y });
      return;
    }
    if (slot.kinds.includes('thorn') && this.rng.chance(lerp(D.slotChance[0], D.slotChance[1], d))) {
      // Deeper slot thorns start to patrol.
      this.addThorn(x, y, this.rng.chance(d) ? 30 + 40 * d : 0, 2, d);
    }
  }

  // ---------------------------------------------------------------- ledges

  // Cut a hole [x0, x1] out of a ledge (burrow / drill), keeping the pieces.
  carve(ledge, x0, x1) {
    const i = this.ledges.indexOf(ledge);
    if (i < 0) return;
    const pieces = [];
    if (x0 - ledge.x >= LG.minPiece) pieces.push({ ...ledge, w: x0 - ledge.x });
    if (ledge.x + ledge.w - x1 >= LG.minPiece) pieces.push({ ...ledge, x: x1, w: ledge.x + ledge.w - x1 });
    this.ledges.splice(i, 1, ...pieces);
  }

  remove(ledge) {
    this.ledges = this.ledges.filter((l) => l !== ledge);
  }

  // Break every fragile ledge in [y, y + range]; returns the broken ledges.
  shockwave(y, range) {
    const broken = this.ledges.filter((l) => l.fragile && l.y >= y - 2 && l.y <= y + range);
    this.ledges = this.ledges.filter((l) => !broken.includes(l));
    return broken;
  }
}
