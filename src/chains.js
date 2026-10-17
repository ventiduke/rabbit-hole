// Chain history, detection and effects.
// A chain is a sequence of moves where each transition is "linked": the next
// move started inside the previous move's link window (longer after a perfect
// release), or during a wall jump's flight. New chains are added as data in
// CHAINS plus, if needed, an effect in CHAIN_EFFECTS.

import { CONFIG } from './config.js';
import { LEDGE_T } from './level/world.js';

const C = CONFIG.chains;
const M = CONFIG.moves;

// Ordered by priority: the first match wins.
// seq      — move names; the last one is the move being started.
//            'wallJump' is recorded when a wall drag releases into a jump.
// perfect  — every earlier step must have been released perfectly.
// context  — a flag from Player.context() that must be true.
// points   — base score bonus (x combo multiplier).
export const CHAINS = [
  { id: 'wallBurrow', points: 400, name: 'Wall Burrow', seq: ['wallJump', 'burrow'], context: 'onOppositeWall', effect: 'wallBurrow', color: '#7fd1ff' },
  { id: 'drill', points: 250, name: 'Drill', seq: ['dive', 'burrow'], context: 'onGround', effect: 'drill', color: '#ffb347' },
  { id: 'softLanding', points: 200, name: 'Soft Landing', seq: ['dive', 'ears'], perfect: true, context: 'nearGround', effect: 'softLanding', color: '#9be37a' },
  { id: 'parachuteSnap', points: 300, name: 'Parachute Snap', seq: ['dive', 'ears'], perfect: true, effect: 'parachuteSnap', color: '#ff7ab8' },
  { id: 'ricochet', points: 250, name: 'Ricochet', seq: ['wallJump', 'wall'], effect: 'ricochet', color: '#c7a6ff' },
  { id: 'spear', points: 300, name: 'Spear', seq: ['wallJump', 'dive'], effect: 'spear', color: '#ff9a4a' },
  { id: 'earCatch', points: 200, name: 'Ear Catch', seq: ['ears', 'wall'], effect: 'earCatch', color: '#b8f0a0' },
  { id: 'popUp', points: 200, name: 'Pop-Up', seq: ['burrow', 'ears'], effect: 'popUp', color: '#ffe27a' },
];

// Effects run right after the chained move starts.
export const CHAIN_EFFECTS = {
  // Tunnel sideways through the wall (dirt too; only rock stops it).
  // The slot is already cut by Player.startTunnel.
  wallBurrow(player) {
    const m = player.move;
    m.variant = 'wallBurrow';
    m.maxHold = C.wallBurrow.maxHold;
    m.window = null; // opens when you break through
  },

  drill(player) {
    const m = player.move;
    const D = C.drill;
    const speed = Math.max(player.lastImpact, player.vy, D.minSpeed);
    m.variant = 'drill';
    m.maxHold = D.maxHold;
    m.window = D.perfect;
    m.charges = Math.min(D.maxLayers, 1 + Math.floor(Math.max(0, speed - CONFIG.player.terminalVelocity) / D.speedPerLayer));
    player.vy = speed;
  },

  // Wall jump straight into another wall slide: each one in a row kicks harder.
  ricochet(player) {
    player.ricochet = Math.min(C.ricochet.maxStack, player.ricochet + 1);
  },

  // Wall jump into a dive: a diagonal spear that keeps its sideways speed,
  // skewers thorns, and smashes through soft blocks and fragile ledges.
  spear(player) {
    const m = player.move;
    m.variant = 'spear';
    m.dir = -player.lastJumpFrom || player.facing;
    player.vx = m.dir * Math.max(Math.abs(player.vx), C.spear.vx);
  },

  // Ears into a wall: a slow, long, controlled slide.
  earCatch(player) {
    const m = player.move;
    m.maxHold = C.earCatch.maxHold;
    m.window = C.earCatch.perfect;
    m.fallSpeed = C.earCatch.fallSpeed;
  },

  // Burst out of a burrow and open your ears: pop up and float.
  popUp(player) {
    player.vy = -C.popUp.speed;
  },

  softLanding(player) {
    player.vy = Math.min(player.vy, C.softLanding.maxSpeed);
    player.softLanding = true;
  },

  parachuteSnap(player, world) {
    player.vy = 0;
    const cx = player.x + player.w / 2;
    const y = player.y + player.h;
    const P = C.parachuteSnap;
    const broken = world.level.shockwave(cx, y, P.shockwaveRange, P.shockwaveWidth);
    world.fx.shockwave(cx, y, P.shockwaveRange);
    for (const l of broken) world.fx.debris({ x: l.x1, y: Math.min(l.y1, l.y2), w: l.x2 - l.x1, h: LEDGE_T });
    world.score?.destroy(broken.length);
  },
};

export class ChainTracker {
  constructor() {
    this.history = [];   // { move, quality, time, linked }
    this.count = 0;      // current chain length (linked moves in a row)
    this.seen = new Set();
  }

  record(move, quality, time, linked) {
    this.history.push({ move, quality, time, linked });
    if (this.history.length > C.historySize) this.history.shift();
  }

  // A wall jump "lands" when the flight ends; links are measured from then.
  refreshLast(move, time) {
    const last = this.history.at(-1);
    if (last?.move === move) last.time = time;
  }

  isLinked(now, inJumpFlight) {
    const last = this.history.at(-1);
    if (!last || last.quality === 'timeout') return false;
    if (last.move === 'wallJump' && inJumpFlight) return true;
    const window = last.quality === 'perfect' ? M.perfectLinkWindow : M.linkWindow;
    return now - last.time <= window;
  }

  match(next, now, ctx) {
    if (!this.isLinked(now, ctx.inJumpFlight)) return null;
    for (const chain of CHAINS) {
      if (chain.seq.at(-1) !== next) continue;
      const prev = chain.seq.slice(0, -1);
      const tail = this.history.slice(-prev.length);
      if (tail.length < prev.length) continue;
      if (!tail.every((e, i) => e.move === prev[i] && (i === 0 || e.linked))) continue;
      if (chain.perfect && !tail.every((e) => e.quality === 'perfect')) continue;
      if (chain.context && !ctx[chain.context]) continue;
      return chain;
    }
    return null;
  }

  // Call when a move starts; returns true the first time a chain is used this run.
  onStart(linked, chain) {
    this.count = linked ? this.count + 1 : 1;
    if (!chain || this.seen.has(chain.id)) return false;
    this.seen.add(chain.id);
    return true;
  }
}
