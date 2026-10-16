// Score: distance, combo multiplier, bonuses, close calls and the local
// high score. Gameplay code reports events through `world.score`; every bonus
// is multiplied by the current combo multiplier.
//
// Multiplier: +perfectMult per perfect release, +chainMult x (length - 1) per
// chain, a little per close call. After multHold seconds without a boost it
// decays back toward 1. Any hit (including a hard landing) resets it to 1.

import { CONFIG } from './config.js';
import { circleHitsBox } from './entities/hazards.js';
import { surfaceY } from './level/world.js';

const S = CONFIG.score;
const U = CONFIG.world.unitsPerMeter;

export class Score {
  constructor() {
    this.best = loadBest();
    this.reset();
  }

  reset() {
    this.points = 0;
    this.mult = 1;
    this.sinceBoost = 0;
    this.maxDepth = 0;     // meters
    this.popups = [];      // { text, value, age }
    this.stats = { perfects: 0, chains: 0, closeCalls: 0, maxMult: 1, longestChain: 1, hits: 0 };
    this.pendingZones = [];
    this.skim = null; // { touched } while passing just above spikes
  }

  // ---------------------------------------------------------------- events

  add(base, label, color = '#ffd84a') {
    const value = Math.round(base * this.mult);
    this.points += value;
    if (label) this.popups.unshift({ text: label, value, age: 0, color });
    if (this.popups.length > 4) this.popups.pop();
    return value;
  }

  boost(amount) {
    this.mult = Math.min(S.maxMult, this.mult + amount);
    this.sinceBoost = 0;
    this.stats.maxMult = Math.max(this.stats.maxMult, this.mult);
  }

  perfect() {
    this.stats.perfects++;
    this.add(S.perfect, 'PERFECT');
    this.boost(S.perfectMult);
  }

  chain(chain, isNew, count) {
    this.stats.chains++;
    this.stats.longestChain = Math.max(this.stats.longestChain, count);
    this.boost(S.chainMult * Math.max(1, count - 1));
    this.add((chain.points ?? 100) + S.chainLengthBonus * count, chain.name.toUpperCase(), chain.color);
    if (isNew) this.add(S.firstChainBonus, 'FIRST ' + chain.name.toUpperCase(), '#ffffff');
  }

  closeCall(label = 'CLOSE CALL') {
    this.stats.closeCalls++;
    this.add(S.closeCall, label, '#c8f0ff');
    this.boost(S.closeCallMult);
  }

  destroy(n = 1) {
    if (n > 0) this.add(S.destroy * n, n > 1 ? `SMASH x${n}` : 'SMASH', '#e6c49a');
  }

  bonus(base, label, color) {
    this.add(base, label, color);
  }

  hit() {
    this.stats.hits++;
    this.mult = 1;
    this.sinceBoost = 0;
  }

  // ---------------------------------------------------------------- per step

  update(dt, player, world) {
    const depth = Math.floor((player.y - CONFIG.player.startY) / U);
    if (depth > this.maxDepth) {
      this.points += Math.round((depth - this.maxDepth) * S.perMeter * this.mult);
      this.maxDepth = depth;
    }

    this.sinceBoost += dt;
    if (this.sinceBoost > S.multHold) this.mult = Math.max(1, this.mult - S.multDecay * dt);

    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter((p) => p.age < CONFIG.ui.popupLife);

    this.trackCloseCalls(player, world);
    this.trackRockfalls(player, world);
  }

  // A close call: a hazard came within closeCallMargin and you got away clean.
  trackCloseCalls(player, { level, fx }) {
    if (player.dead) return;
    const m = S.closeCallMargin;
    const grown = { x: player.x - m, y: player.y - m, w: player.w + 2 * m, h: player.h + 2 * m };
    const check = (o, touching, near, label) => {
      if (o.ccDone) return;
      if (touching) o.touched = true;
      if (near) o.near = true;
      else if (o.near) {
        o.ccDone = true;
        if (!o.touched) {
          this.closeCall(label);
          fx.text(label, '#c8f0ff', 11);
        }
      }
    };

    for (const t of level.thorns) {
      check(t, circleHitsBox(t, t.r, player), circleHitsBox(t, t.r, grown), 'CLOSE CALL');
    }
    for (const r of level.rocks) {
      if (r.delay > 0) continue;
      check(r, boxes(r, player), boxes(r, grown), 'CLOSE CALL');
    }
    // Skimming just over spikes without landing on them (Ears make this possible).
    const cx = player.x + player.w / 2;
    const foot = player.y + player.h;
    const overSpikes = !player.grounded && level.world.ledges.some((l) => {
      if (l.kind !== 'spikes' || cx < l.x1 || cx > l.x2) return false;
      const gap = surfaceY(l, cx) - foot;
      return gap >= 0 && gap < m * 2;
    });
    const onSpikes = player.grounded && player.groundKind === 'spikes';
    if (overSpikes || onSpikes) {
      this.skim ??= { touched: false };
      if (onSpikes) this.skim.touched = true;
    } else if (this.skim) {
      if (!this.skim.touched) {
        this.closeCall('SKIM');
        fx.text('SKIM', '#c8f0ff', 11);
      }
      this.skim = null;
    }
  }

  // Clean escape: every rock from a rockfall has fallen past you without a hit.
  trackRockfalls(player, { level, fx }) {
    for (const z of level.rockZones) {
      if (z.fired && !z.tracked) {
        z.tracked = true;
        this.pendingZones.push(z);
      }
    }
    this.pendingZones = this.pendingZones.filter((z) => {
      const below = player.y + player.h;
      if (level.rocks.some((r) => r.zone === z && (r.delay > 0 || r.y < below))) return true;
      if (!z.playerHit) {
        this.add(S.cleanEscape, 'CLEAN ESCAPE', '#ffb347');
        fx.text('CLEAN ESCAPE', '#ffb347', 12);
      }
      return false;
    });
  }

  // Call once when the run ends. Returns true on a new best score.
  finish() {
    const isBest = this.points > this.best.score;
    this.best = {
      score: Math.max(this.best.score, this.points),
      depth: Math.max(this.best.depth, this.maxDepth),
    };
    saveBest(this.best);
    return isBest;
  }
}

const boxes = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function loadBest() {
  try {
    const v = JSON.parse(localStorage.getItem(S.storageKey));
    if (v && Number.isFinite(v.score)) return { score: v.score, depth: v.depth ?? 0 };
  } catch {
    // Storage unavailable (private mode, blocked): best score just won't persist.
  }
  return { score: 0, depth: 0 };
}

function saveBest(best) {
  try {
    localStorage.setItem(S.storageKey, JSON.stringify(best));
  } catch {
    // Ignore; see loadBest.
  }
}
