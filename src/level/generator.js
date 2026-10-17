// Endless open cavern: hand-authored sections (chunks.js) placed one after
// another with long stretches of open falling in between. The cavern's width
// changes in bands: normal (the full screen), narrow shafts, and wide
// stretches that run past the screen edge (the camera pans, and there's extra
// to find off to the side). Sections spawn ahead of the camera and everything
// is recycled behind it. All layout randomness comes from the seeded RNG, so
// a seed replays the same level.

import { CONFIG } from '../config.js';
import { createRng } from '../rng.js';
import { CHUNKS } from './chunks.js';
import { World, WALL, INNER } from './world.js';

const LV = CONFIG.level;
const D = CONFIG.difficulty;
const H = CONFIG.hazards;
const B = CONFIG.level.bands;
const WW = CONFIG.world.width;

const lerp = (a, b, t) => a + (b - a) * t;

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
  // forceChunk: section id to repeat (debug, ?chunk=id)
  // forceBand: 'narrow' | 'wide' | 'normal' to use every time (debug, ?band=narrow)
  // fixed: practice drills build their own level; generate nothing, recycle nothing
  constructor(seed, forceChunk = null, forceBand = null, { fixed = false } = {}) {
    this.forceBand = forceBand;
    this.fixed = fixed;
    this.seed = seed;
    this.rng = createRng(seed);
    this.hazardRng = createRng(seed ^ 0x9e3779b9); // runtime randomness, kept off the layout RNG
    this.forceChunk = CHUNKS.find((c) => c.id === forceChunk) ?? null;
    this.world = new World();
    this.time = 0;
    this.thorns = [];    // { x, y, baseX, dx, period, phase, r }
    this.rings = [];     // { x, y, w, h }
    this.carrots = [];   // { x, y }
    this.gems = [];      // { x, y }
    this.rockZones = []; // { x, y, w, fired }
    this.rocks = [];     // { x, y, w, h, vy, delay, zone }
    this.warnings = [];  // rockfall telegraphs
    this.placed = [];    // recent section ids, for debugging
    this.nextY = CONFIG.player.startY + LV.startClear;
    this.band = { type: 'normal', left: WALL, right: WW - WALL, until: forceBand ? 0 : B.firstBand };
  }

  update(dt, camera) {
    this.time += dt;
    while (!this.fixed && this.nextY < camera.y + camera.viewH + LV.spawnAhead) this.placeChunk();

    for (const t of this.thorns) {
      t.x = t.baseX + (t.dx ? t.dx * Math.sin((this.time / t.period) * Math.PI * 2 + t.phase) : 0);
    }

    if (this.fixed) return;
    const top = camera.y - LV.despawnBehind;
    const keep = (o) => o.y + (o.h ?? o.r ?? 0) > top;
    this.thorns = this.thorns.filter(keep);
    this.rings = this.rings.filter(keep);
    this.carrots = this.carrots.filter(keep);
    this.gems = this.gems.filter(keep);
    this.rockZones = this.rockZones.filter((z) => z.y + 600 > top);
    this.world.prune(top);
  }

  // ---------------------------------------------------------------- placing

  // Change the cavern's width: a slanted transition, then a new band.
  nextBand() {
    const prev = this.band;
    const { rng } = this;
    let type = 'normal';
    if (this.forceBand) type = this.forceBand;
    else if (prev.type === 'normal') {
      const r = rng.next() * (B.weights.normal + B.weights.narrow + B.weights.wide);
      type = r < B.weights.narrow ? 'narrow' : r < B.weights.narrow + B.weights.wide ? 'wide' : 'normal';
    }
    let left = WALL;
    let right = WW - WALL;
    if (type === 'narrow') {
      const w = rng.range(B.narrow[0], B.narrow[1]);
      const c = WW / 2 + rng.range(-B.narrowShift, B.narrowShift);
      left = c - w / 2;
      right = c + w / 2;
    } else if (type === 'wide') {
      const extra = rng.range(B.wideExtra[0], B.wideExtra[1]);
      const r = rng.next();
      if (r < 0.4) left -= extra;                  // more to the left
      else if (r < 0.8) right += extra;            // more to the right
      else { left -= extra / 2; right += extra / 2; } // both
    }
    const y0 = this.nextY;
    const y1 = y0 + B.transition;
    this.world.addProfilePoint(y0, prev.left, prev.right);
    this.world.addProfilePoint(y1, left, right);
    this.band = { type, left, right, until: y1 + rng.range(B.length[type][0], B.length[type][1]) };
    this.nextY = y1 + B.settle;
  }

  placeChunk() {
    if (this.nextY >= this.band.until) this.nextBand();
    const y0 = this.nextY;
    const d = difficultyAt(y0);
    const band = this.band;
    // The section's window: the whole band, or a normal-width slice of a wide band.
    const bandW = band.right - band.left;
    const secW = Math.min(bandW, INNER);
    const secL = band.left + (bandW > secW ? this.rng.range(0, bandW - secW) : 0);
    const chunk = this.pickChunk(y0, secW);
    const mirrored = this.rng.chance(0.5);
    const X = (fx) => secL + secW * (mirrored ? 1 - fx : fx);
    const hazardScale = lerp(D.hazardScale[0], D.hazardScale[1], d);
    const chance = (v) => v === true || (typeof v === 'number' && this.rng.chance(v * hazardScale));

    for (const it of chunk.items) {
      const y = y0 + it.y;
      switch (it.type) {
        case 'ledge': {
          let kind = it.kind ?? 'ledge';
          if (kind === 'ledge' && chance(it.spikes)) kind = 'spikes';
          else if (kind === 'ledge' && chance(it.fragile)) kind = 'fragile';
          let a = { x: X(it.x1), y: y0 + it.y1 };
          let b = { x: X(it.x2), y: y0 + it.y2 };
          if (a.x > b.x) [a, b] = [b, a];
          this.world.ledges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind });
          break;
        }
        case 'block': {
          const w = secW * it.w;
          const x = mirrored ? X(it.x) - w : X(it.x);
          this.world.blocks.push({ x, y, w, h: it.h, kind: it.kind });
          break;
        }
        case 'thorn':
          this.addThorn(X(it.x), y, secW * (it.dx ?? 0), it.period ?? 2, d);
          break;
        case 'ring':
          this.addRing(X(it.x), y);
          break;
        case 'rockfall': {
          const w = secW * it.w;
          this.rockZones.push({ x: mirrored ? X(it.x) - w : X(it.x), y, w, fired: false });
          break;
        }
        case 'gem':
          this.gems.push({ x: X(it.x), y });
          break;
        case 'slot':
          this.fillSlot(it.kinds, X(it.x), y, d);
          break;
      }
    }

    // Wide band: something worth exploring in the parts off to the side.
    if (bandW > secW) {
      if (secL - band.left >= B.sideMin) this.fillSide(band.left, secL, y0, chunk.h, d);
      if (band.right - (secL + secW) >= B.sideMin) this.fillSide(secL + secW, band.right, y0, chunk.h, d);
    }

    this.placed.push(chunk.id + (mirrored ? '~' : ''));
    if (this.placed.length > 12) this.placed.shift();
    this.lastChunk = chunk;

    // A long open fall before the next section, maybe with something drifting in it.
    const [g0, g1] = [lerp(D.gap[0][0], D.gap[1][0], d), lerp(D.gap[0][1], D.gap[1][1], d)];
    const gap = this.rng.range(g0, g1);
    const gy = y0 + chunk.h;
    if (gap >= LV.gapThornMin && this.rng.chance(lerp(D.gapThornChance[0], D.gapThornChance[1], d))) {
      this.addThorn(secL + secW * this.rng.range(0.2, 0.8), gy + gap * 0.5, secW * this.rng.range(0, 0.15), 2.4, d);
    } else if (this.rng.chance(D.gapRingChance)) {
      this.addRing(secL + secW * this.rng.range(0.25, 0.75), gy + gap * 0.5);
    }
    this.nextY = gy + gap;
  }

  // Off to the side of a wide band: a ledge sloping back toward the middle,
  // usually with a carrot or ring on it, sometimes guarded by a thorn.
  fillSide(a, b, y0, h, d) {
    const { rng } = this;
    const toMiddle = a < WW / 2 ? 1 : -1; // which way leads back
    const w = b - a;
    const x1 = a + w * rng.range(0.15, 0.3);
    const x2 = b - w * rng.range(0.15, 0.3);
    const y = y0 + rng.range(0, Math.max(40, h * 0.6));
    const drop = rng.range(40, 120);
    this.world.ledges.push(toMiddle > 0
      ? { x1, y1: y, x2, y2: y + drop, kind: 'ledge' }
      : { x1, y1: y + drop, x2, y2: y, kind: 'ledge' });
    const cx = (x1 + x2) / 2;
    if (rng.chance(B.sideCarrot)) this.carrots.push({ x: cx, y: y - 40 });
    else for (let i = -1; i <= 1; i++) this.gems.push({ x: cx + i * 34, y: y - 40 });
    if (rng.chance(B.sideThorn * (0.3 + d))) this.addThorn(cx, y - 160, w * 0.2, 2.2, d);
  }

  pickChunk(y, width) {
    if (this.forceChunk) return this.forceChunk;
    const tier = tierAt(y);
    const fits = (c) => (c.minW ?? B.defaultMinW) <= width && width <= (c.maxW ?? Infinity);
    let options = CHUNKS.filter((c) => c.diff <= tier && c !== this.lastChunk && fits(c));
    if (!options.length) options = CHUNKS.filter((c) => fits(c));
    const weight = (c) => (c.weight ?? 1) * (c.diff === tier && tier > 0 ? D.newestTierWeight : 1);
    let r = this.rng.next() * options.reduce((s, c) => s + weight(c), 0);
    for (const c of options) {
      r -= weight(c);
      if (r <= 0) return c;
    }
    return options.at(-1);
  }

  addThorn(x, y, dx, period, d) {
    const speed = lerp(D.thornSpeed[0], D.thornSpeed[1], d);
    this.thorns.push({
      x, y, baseX: x, dx: Math.max(0, dx), period: period / speed,
      phase: this.rng.next() * Math.PI * 2,
      r: H.thornRadius,
    });
  }

  addRing(x, y) {
    this.rings.push({ x: x - 45, y: y - 7, w: 90, h: 14 });
  }

  fillSlot(kinds, x, y, d) {
    if (kinds.includes('carrot') && this.rng.chance(D.carrotChance)) {
      this.carrots.push({ x, y });
    } else if (kinds.includes('thorn') && this.rng.chance(lerp(D.slotChance[0], D.slotChance[1], d))) {
      this.addThorn(x, y, this.rng.chance(d) ? 40 + 60 * d : 0, 2, d);
    }
  }

  // ---------------------------------------------------------------- breaking

  // Break fragile ledges below (Parachute Snap). Returns the broken ledges.
  shockwave(cx, y, range, width) {
    const broken = this.world.ledges.filter((l) =>
      l.kind === 'fragile' && Math.min(l.y1, l.y2) >= y - 4 && Math.min(l.y1, l.y2) <= y + range &&
      l.x2 > cx - width && l.x1 < cx + width);
    for (const l of broken) this.world.removeLedge(l);
    return broken;
  }
}
