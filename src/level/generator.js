// Endless tunnel level: hand-authored ASCII chunks (chunks.js) stitched
// together procedurally. Between two chunks a connector is carved: a short
// drop out of the previous chunk's exit, then a sideways tunnel over to the
// next chunk's entry, so the route keeps turning left and right.
//
// Rows are generated ahead of the camera and everything is recycled behind
// it. All layout randomness comes from the seeded RNG, so a seed replays the
// same level.

import { CONFIG } from '../config.js';
import { createRng } from '../rng.js';
import { CHUNKS } from './chunks.js';
import { TileMap, T, TILE, COLS, isSolid } from './tiles.js';

const LV = CONFIG.level;
const D = CONFIG.difficulty;
const H = CONFIG.hazards;

const lerp = (a, b, t) => a + (b - a) * t;

const CHAR_TILE = {
  '.': T.EMPTY, '#': T.DIRT, S: T.SOFT, R: T.ROCK, '=': T.LEDGE, '~': T.FRAGILE,
  '^': T.SPIKES, P: T.PAD, K: T.LOOSE,
  o: T.EMPTY, O: T.EMPTY, v: T.EMPTY, c: T.EMPTY, '?': T.EMPTY,
  '!': T.DIRT, '%': T.LEDGE, // chance-based; these are the fallbacks
};
const openChar = (ch) => !isSolid(CHAR_TILE[ch]);

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
    this.map = new TileMap();
    this.time = 0;
    this.thorns = [];    // { x, y, baseX, dx, period, phase, r }
    this.rings = [];     // { x, y, w, h }
    this.carrots = [];   // { x, y }
    this.rockZones = []; // { c, r, x, y, fired } — LOOSE tiles
    this.rocks = [];     // { x, y, w, h, vy, delay, zone }
    this.warnings = [];  // rockfall telegraphs
    this.placed = [];    // recent chunk ids, for debugging
    this.chunkRows = []; // recent chunks' row ranges, for debugging
    this.nextRow = -LV.startRows;
    this.placeStart();
  }

  update(dt, camera) {
    this.time += dt;
    while (this.nextRow * TILE < camera.y + camera.viewH + LV.spawnAhead) this.placeChunk();

    for (const t of this.thorns) {
      t.x = t.baseX + (t.dx ? t.dx * Math.sin((this.time / t.period) * Math.PI * 2 + t.phase) : 0);
    }

    const top = camera.y - LV.despawnBehind;
    const keep = (o) => o.y + (o.h ?? o.r ?? TILE) > top;
    this.thorns = this.thorns.filter(keep);
    this.rings = this.rings.filter(keep);
    this.carrots = this.carrots.filter(keep);
    this.rockZones = this.rockZones.filter(keep);
    this.map.prune(Math.floor(top / TILE));
  }

  // ---------------------------------------------------------------- building

  pushRow(row) {
    this.map.setRow(this.nextRow++, row);
  }

  solidRow() {
    const row = new Uint8Array(COLS).fill(T.DIRT);
    row[0] = row[COLS - 1] = T.ROCK;
    return row;
  }

  placeStart() {
    // A wide open drop to begin in.
    for (let i = 0; i < LV.startRows * 2; i++) {
      const row = this.solidRow();
      for (let c = 2; c < COLS - 2; c++) row[c] = T.EMPTY;
      this.pushRow(row);
    }
    this.prevExit = Array.from({ length: COLS - 4 }, (_, i) => i + 2);
  }

  placeChunk() {
    const d = difficultyAt(this.nextRow * TILE);
    const { chunk, mirrored } = this.pickChunk(this.nextRow * TILE);
    const rows = mirrored ? chunk.rows.map((r) => [...r].reverse().join('')) : chunk.rows;
    const openCols = (str) => [...str].flatMap((ch, j) => (openChar(ch) ? [j + 1] : []));

    this.placeConnector(this.prevExit, openCols(rows[0]), d);

    const hazardScale = lerp(D.hazardScale[0], D.hazardScale[1], d);
    rows.forEach((str, i) => {
      const r = this.nextRow;
      const row = this.solidRow();
      [...str].forEach((ch, j) => {
        const c = j + 1;
        let t = CHAR_TILE[ch] ?? T.DIRT;
        if (ch === '!' && this.rng.chance(0.5 * hazardScale)) t = T.SPIKES;
        if (ch === '%' && this.rng.chance(0.5 * hazardScale)) t = T.FRAGILE;
        row[c] = t;
        this.placeEntity(ch, c, r, str, j, d);
      });
      this.pushRow(row);
    });

    this.placed.push(chunk.id + (mirrored ? '~' : ''));
    if (this.placed.length > 12) this.placed.shift();
    this.chunkRows.push({ id: chunk.id, r0: this.nextRow - rows.length, r1: this.nextRow });
    if (this.chunkRows.length > 12) this.chunkRows.shift();
    this.lastChunk = chunk;
    this.prevExit = openCols(rows.at(-1));
  }

  // Drop out of `exit`, then a sideways tunnel spanning both openings.
  placeConnector(exit, entry, d) {
    const drop = Math.round(lerp(D.connectorDrop[0], D.connectorDrop[1], d));
    const lo = Math.min(...exit, ...entry);
    const hi = Math.max(...exit, ...entry);
    for (let k = 0; k < drop + LV.runHeight; k++) {
      const row = this.solidRow();
      if (k <= drop) for (const c of exit) row[c] = T.EMPTY;
      if (k >= drop) for (let c = lo; c <= hi; c++) row[c] = T.EMPTY;
      this.pushRow(row);
    }
    // Long runs can get a patrolling thorn.
    if (hi - lo + 1 >= LV.runThornMin && this.rng.chance(D.runThornChance * d)) {
      const y = (this.nextRow - 2) * TILE + TILE / 2;
      this.addThorn((lo + hi + 1) / 2 * TILE, y, ((hi - lo + 1) * TILE) / 2 - H.thornRadius - 6, 2.4, d);
    }
  }

  placeEntity(ch, c, r, str, j, d) {
    const cx = c * TILE + TILE / 2;
    const cy = r * TILE + TILE / 2;
    switch (ch) {
      case 'o':
        this.addThorn(cx, cy, 0, 2, d);
        break;
      case 'O': {
        // Patrol the open span of this row.
        let a = j;
        let b = j;
        while (a > 0 && openChar(str[a - 1])) a--;
        while (b < str.length - 1 && openChar(str[b + 1])) b++;
        const x0 = (a + 1) * TILE;
        const x1 = (b + 2) * TILE;
        this.addThorn((x0 + x1) / 2, cy, (x1 - x0) / 2 - H.thornRadius - 4, 0.9 + (x1 - x0) / 140, d);
        break;
      }
      case 'v':
        this.rings.push({ x: cx - TILE * 1.5, y: cy - 6, w: TILE * 3, h: 12 });
        break;
      case 'c':
        if (this.rng.chance(D.carrotChance)) this.carrots.push({ x: cx, y: cy });
        break;
      case '?':
        if (this.rng.chance(lerp(D.slotChance[0], D.slotChance[1], d))) {
          this.addThorn(cx, cy, this.rng.chance(d) ? TILE * (1 + d) : 0, 2, d);
        }
        break;
      case 'K':
        this.rockZones.push({ c, r, x: c * TILE, y: r * TILE, fired: false });
        break;
    }
  }

  pickChunk(y) {
    const tier = tierAt(y);
    const options = [];
    for (const chunk of this.forceChunk ? [this.forceChunk] : CHUNKS) {
      if (!this.forceChunk && (chunk.diff > tier || chunk === this.lastChunk)) continue;
      const w = (chunk.weight ?? 1) * (chunk.diff === tier && tier > 0 ? D.newestTierWeight : 1);
      options.push({ chunk, mirrored: false, w: w / 2 }, { chunk, mirrored: true, w: w / 2 });
    }
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
      x, y, baseX: x, dx: Math.max(0, dx), period: period / speed,
      phase: this.rng.next() * Math.PI * 2,
      r: H.thornRadius,
    });
  }

  // ---------------------------------------------------------------- breaking

  // Break fragile tiles below (Parachute Snap). Returns the broken tile rects.
  shockwave(cx, y, range) {
    const c0 = Math.floor(cx / TILE) - LV.shockCols;
    const c1 = Math.floor(cx / TILE) + LV.shockCols;
    const broken = [];
    for (let r = Math.floor(y / TILE); r <= Math.floor((y + range) / TILE); r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.map.get(c, r) !== T.FRAGILE) continue;
        this.map.set(c, r, T.EMPTY);
        broken.push(this.map.rect(c, r));
      }
    }
    return broken;
  }
}
