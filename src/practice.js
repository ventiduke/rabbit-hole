// Practice drills: tiny hand-built levels, each for one move or combo.
// A drill succeeds or fails on its own conditions, shows the result for a
// moment, then resets automatically. Any hit, leaving the drill area, or
// running out of time is a fail.
//
// Each drill:
//   id, name   shown in the menu; tag: the inputs, in short
//   how        one-line instructions shown while practising
//   time       seconds before "out of time" (default config.practice.time)
//   bottom     falling below this y fails ("missed it")
//   build(b)   lay out the level with the helpers in `b` and place the player
//   check(c)   'ok', a fail reason string, or null (keep going)
//              c: { player, level, seen(chainId), last (latest move record), onTarget }

import { CONFIG } from './config.js';

const PR = CONFIG.practice;
const H = CONFIG.player.height;

export const DRILLS = [
  {
    id: 'perfectDive', name: 'Perfect Dive', tag: '↓ · tap in gold', bottom: 1500,
    how: 'Swipe ↓ to dive, then TAP when the marker is in the gold zone',
    build(b) {
      b.player(489, 0);
      b.block(24, 1400, 952, 60, 'rock');
    },
    check(c) {
      if (c.last?.move === 'dive') return c.last.quality === 'perfect' ? 'ok' : 'Tap inside the gold zone';
      if (c.player.grounded) return 'Dive first';
      return null;
    },
  },
  {
    id: 'wallJump', name: 'Wall Jump', tag: 'slide · ↑', bottom: 1000,
    how: 'Steer into the wall to slide, then SWIPE ↑ to kick across to the gold ledge',
    build(b) {
      b.shaft(300, 700);
      b.player(302, 60);
      b.ledge(560, 330, 700, 330, { target: true });
      b.block(300, 900, 400, 60, 'rock');
    },
    check(c) {
      if (c.onTarget) return 'ok';
      if (c.player.grounded) return 'Kick off the wall to reach the gold ledge';
      return null;
    },
  },
  {
    id: 'tunnel', name: 'Tunnel', tag: 'push · ↓', time: 8, bottom: 800,
    how: 'Run into the soft wall and SWIPE ↓ to tunnel through it',
    build(b) {
      b.player(200, 300 - H - 1);
      b.block(24, 300, 952, 60, 'rock');
      b.block(400, 160, 40, 140, 'soft');
      b.ledge(470, 299, 700, 299, { target: true }); // the flag (you walk on, so check by position)
    },
    check(c) {
      return c.player.grounded && c.player.x > 470 ? 'ok' : null;
    },
  },
  {
    id: 'drill', name: 'Drill', tag: '↓ · ↓ · land', bottom: 1200,
    how: 'Swipe ↓ to dive, swipe ↓ AGAIN, and drill through the ledges',
    build(b) {
      b.player(489, 0);
      for (const y of [520, 580, 640]) b.ledge(300, y, 700, y);
      b.block(24, 1000, 952, 60, 'rock');
    },
    check(c) {
      if (c.seen('drill') && c.player.y > 660) return 'ok';
      if (c.player.grounded && !c.seen('drill')) return 'Swipe ↓ again before you land';
      return null;
    },
  },
  {
    id: 'softLanding', name: 'Soft Landing', tag: '↓ · ears near ground', bottom: 1000,
    how: 'Dive, then TAP BOTH HALVES (ears) in the gold zone just above the ground',
    build(b) {
      b.player(489, 0);
      b.block(24, 760, 952, 60, 'rock');
    },
    check(c) {
      if (c.seen('softLanding') && c.player.grounded) return 'ok';
      if (c.player.grounded) return 'Open your ears in the gold zone, close to the ground';
      return null;
    },
  },
  {
    id: 'parachuteSnap', name: 'Parachute Snap', tag: '↓ · ears in gold', bottom: 1600,
    how: 'Dive, then TAP BOTH HALVES (ears) in the gold zone, high above the ledges',
    build(b) {
      b.player(489, 0);
      for (const y of [1100, 1180, 1260]) b.ledge(250, y, 750, y, { kind: 'fragile' });
      b.block(24, 1500, 952, 60, 'rock');
    },
    check(c) {
      if (c.seen('parachuteSnap')) return 'ok';
      if (c.player.grounded) return 'Open your ears in the gold zone while diving';
      return null;
    },
  },
  {
    id: 'popUp', name: 'Pop-Up', tag: 'dig · ears', bottom: 900,
    how: 'Swipe ↓ to dig through the soft floor, then TAP BOTH HALVES as you break out',
    build(b) {
      b.player(489, 200 - H - 1);
      b.block(300, 200, 400, 40, 'soft');
      b.block(24, 700, 952, 60, 'rock');
    },
    check(c) {
      if (c.seen('popUp')) return 'ok';
      if (c.player.grounded && c.player.y > 300) return 'Open your ears just as you break out';
      return null;
    },
  },
  {
    id: 'earCatch', name: 'Ear Catch', tag: 'ears · into wall', bottom: 1400,
    how: 'TAP BOTH HALVES (ears), then steer into the wall',
    build(b) {
      b.shaft(250, 750);
      b.player(489, 0);
      b.block(250, 1200, 500, 60, 'rock');
    },
    check(c) {
      if (c.seen('earCatch')) return 'ok';
      if (c.player.grounded) return 'Ears first, then glide into a wall';
      return null;
    },
  },
  {
    id: 'ricochet', name: 'Ricochet', tag: 'slide · ↑ · catch ×2', bottom: 1800,
    how: 'Slide, SWIPE ↑, and catch the far wall. Do it twice in a row',
    build(b) {
      b.shaft(400, 600);
      b.player(402, 40);
      b.block(400, 1600, 200, 60, 'rock');
    },
    check(c) {
      if (c.player.ricochet >= 2) return 'ok';
      if (c.player.grounded) return 'Keep bouncing wall to wall';
      return null;
    },
  },
  {
    id: 'spear', name: 'Spear', tag: 'slide · ↑ · ↓', bottom: 1300,
    how: 'Slide, SWIPE ↑, then SWIPE ↓ mid-air to spear through the thorns',
    build(b) {
      b.shaft(250, 750);
      b.player(252, 60);
      for (let y = 120; y <= 440; y += 40) b.thorn(520, y);
      b.block(250, 1200, 500, 60, 'rock');
    },
    check(c) {
      if (c.seen('spear') && c.level.thorns.length < c.thorns0) return 'ok';
      if (c.player.grounded) return 'Wall jump, then dive while you fly';
      return null;
    },
  },
  {
    id: 'wallBurrow', name: 'Wall Burrow', tag: 'slide · ↑ · ↓ into wall', bottom: 1500,
    how: 'Slide, SWIPE ↑, then SWIPE ↓ into the far dirt wall to burrow through it',
    build(b) {
      b.shaft(250, 950);
      b.player(252, 60);
      b.block(600, -400, 100, 1800, 'dirt');
      b.block(250, 1400, 700, 60, 'rock');
    },
    check(c) {
      if (c.seen('wallBurrow')) return 'ok';
      if (c.player.grounded) return 'Wall jump, then dive into the dirt wall';
      return null;
    },
  },
];

// One practice run of one drill: builds it, judges it, resets it.
export class PracticeSession {
  constructor(index) {
    this.index = index;
    this.drill = DRILLS[index];
    this.attempts = 0;
    this.successes = 0;
    this.streak = 0;
    this.result = null; // { ok, reason, t }
  }

  // Lay out the drill in a fresh (fixed) level and place the player.
  build(level, player) {
    const geo = level.world;
    player.reset();
    const b = {
      player: (x, y) => {
        player.x = x;
        player.y = y;
        player.prevX = x;
        player.prevY = y;
      },
      shaft: (left, right) => {
        geo.profile = [{ y: -1e6, left, right }];
      },
      ledge: (x1, y1, x2, y2, o = {}) => geo.ledges.push({ x1, y1, x2, y2, kind: o.kind ?? 'ledge', target: !!o.target }),
      block: (x, y, w, h, kind = 'dirt') => geo.blocks.push({ x, y, w, h, kind }),
      thorn: (x, y) => level.thorns.push({ x, y, baseX: x, dx: 0, period: 2, phase: 0, r: CONFIG.hazards.thornRadius }),
    };
    this.drill.build(b);
    this.thorns0 = level.thorns.length;
    this.t = 0;
    this.result = null;
    this.attempts++;
  }

  // Returns 'reset' when it's time to rebuild the drill.
  update(dt, player, level) {
    if (this.result) {
      this.result.t += dt;
      return this.result.t >= PR.resultTime ? 'reset' : null;
    }
    this.t += dt;
    const d = this.drill;
    const ctx = {
      player,
      level,
      thorns0: this.thorns0,
      seen: (id) => player.chains.seen.has(id),
      last: player.chains.history.at(-1),
      onTarget: !!(player.grounded && player.ground?.ledge?.target),
    };
    let verdict = d.check(ctx);
    if (!verdict && player.hp < CONFIG.player.maxHp) verdict = 'Ouch, you got hit';
    if (!verdict && player.y > d.bottom) verdict = 'Missed it';
    if (!verdict && this.t > (d.time ?? PR.time)) verdict = 'Out of time';
    if (!verdict) return null;
    const ok = verdict === 'ok';
    if (ok) {
      this.successes++;
      this.streak++;
      markCleared(d.id);
    } else this.streak = 0;
    this.result = { ok, reason: ok ? '' : verdict, t: 0 };
    return ok ? 'success' : 'fail';
  }
}

// Cleared drills (menu checkmarks), remembered in localStorage.
export function loadCleared() {
  try {
    return new Set(JSON.parse(localStorage.getItem(PR.storageKey)) ?? []);
  } catch {
    return new Set();
  }
}

function markCleared(id) {
  const s = loadCleared();
  s.add(id);
  try {
    localStorage.setItem(PR.storageKey, JSON.stringify([...s]));
  } catch {
    // Storage blocked: checkmarks just won't persist.
  }
}
