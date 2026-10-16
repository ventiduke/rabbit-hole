// Player physics + move state machine.
//
// Every move follows the same lifecycle (README §2):
//   START -> HOLD (up to maxHold) -> RELEASE
//     inside the perfect window -> PERFECT: feedback, momentum carry, longer chain link
//     normal release            -> normal exit
//     held past maxHold         -> forced exit + short recovery (can't act)
// Starting a new move while one is held cancels the current one; the cancel is
// graded like a release, so cancelling inside the perfect window is perfect.

import { CONFIG } from './config.js';
import { ChainTracker, CHAIN_EFFECTS } from './chains.js';

const P = CONFIG.player;
const M = CONFIG.moves;
const C = CONFIG.chains;
const W = CONFIG.world;
const H = CONFIG.hazards;

const approach = (v, target, delta) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class Player {
  constructor() {
    this.w = P.width;
    this.h = P.height;
    this.reset();
  }

  reset() {
    this.x = (W.width - this.w) / 2;
    this.y = P.startY;
    this.vx = 0;
    this.vy = 0;
    this.prevX = this.x;
    this.prevY = this.y;
    this.time = 0;
    this.grounded = false;
    this.groundLedge = null;
    this.touchWall = 0;     // -1 / 1 when pressed against a side wall
    this.wallContact = 0;   // same, but only while steering into it
    this.lastImpact = 0;    // vertical speed at last landing
    this.justLanded = 0;    // impact speed if we landed this step
    this.squash = 0;        // 0..1 visual squash after landing
    this.facing = 1;
    this.move = null;       // { name, variant, t, maxHold, window, linked, ... }
    this.recover = 0;       // seconds of forced recovery left
    this.carry = 0;         // seconds of momentum carry left
    this.jumpFlight = 0;    // seconds a wall jump still counts as in flight
    this.lastJumpFrom = 0;  // wall side of the last wall jump
    this.softLanding = false;
    this.padBounced = null; // pad we bounced off this step
    this.hp = P.maxHp;
    this.invuln = 0;
    this.dead = false;
    this.chains = new ChainTracker();
  }

  // What the renderer and HUD show.
  get state() {
    if (this.dead) return 'dead';
    if (this.recover > 0) return 'recover';
    if (this.move) return this.move.variant === 'basic' ? this.move.name : this.move.variant;
    return this.grounded ? 'ground' : 'fall';
  }

  get inWindow() {
    const m = this.move;
    return !!(m?.window && m.t >= m.window[0] && m.t <= m.window[1]);
  }

  update(dt, input, world) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.time += dt;
    this.recover = Math.max(0, this.recover - dt);
    this.carry = Math.max(0, this.carry - dt);
    this.jumpFlight = Math.max(0, this.jumpFlight - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    this.handleInput(input, world);
    if (this.move) {
      this.move.t += dt;
      if (this.move.t >= this.move.maxHold) this.endMove(world, 'timeout');
    }

    this.justLanded = 0;
    this.padBounced = null;
    this.physics(dt, input, world);
    this.afterCollide(input, world);
    this.squash = Math.max(0, this.squash - dt * 5);
  }

  // ---------------------------------------------------------------- health

  // Returns true if the hit landed. fromX: where the hit came from (null = straight up).
  hurt(world, fromX) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp--;
    this.invuln = P.invulnTime;
    if (this.move) this.endMove(world, 'context');
    this.carry = 0;
    this.softLanding = false;
    const cx = this.x + this.w / 2;
    if (fromX !== null) this.vx = (cx >= fromX ? 1 : -1) * P.hitKnock;
    this.vy = P.hitBounce;
    this.grounded = false;
    if (this.hp <= 0) this.dead = true;
    world.fx.hurt(this);
    return true;
  }

  heal(n) {
    this.hp = Math.min(P.maxHp, this.hp + n);
  }

  // ---------------------------------------------------------------- input

  handleInput(input, world) {
    if (this.recover > 0) return;

    // Starts first, so e.g. a swipe-down on a wall cancels the drag instead
    // of being read as "lifted the steering finger" (= wall jump).
    if (input.downPressed) {
      if (this.grounded || this.touchWall) this.request('burrow', world);
      else this.request('dive', world);
    }
    if (input.earsPressed) this.request('ears', world);

    const m = this.move;
    if (!m) return;
    if (m.name === 'ears' && !input.earsHeld) this.endMove(world, 'release');
    else if ((m.name === 'dive' || m.name === 'burrow') && !input.downHeld) this.endMove(world, 'release');
    else if (m.name === 'wall' && (input.jump || input.steer !== m.side)) this.endMove(world, 'release');
  }

  request(name, world) {
    if (this.recover > 0) return;
    if (name === 'burrow' && !this.grounded && !this.touchWall) name = 'dive';
    if ((name === 'ears' || name === 'dive' || name === 'wall') && this.grounded) return;
    if (this.move?.name === name) return;

    if (this.move) this.endMove(world, 'cancel');
    const ctx = this.context(world);
    let chain = this.chains.match(name, this.time, ctx);
    // Burrowing into a wall only works as part of a chain; otherwise it's a dive.
    if (name === 'burrow' && !this.grounded && chain?.id !== 'wallBurrow') {
      name = 'dive';
      chain = this.chains.match(name, this.time, ctx);
    }
    this.startMove(name, chain, world);
  }

  context(world) {
    return {
      inJumpFlight: this.jumpFlight > 0,
      onGround: this.grounded,
      onOppositeWall: this.touchWall !== 0 && this.touchWall !== this.lastJumpFrom,
      nearGround: !this.grounded && this.distanceToGround(world.level.ledges) < C.softLanding.range,
    };
  }

  distanceToGround(ledges) {
    let best = Infinity;
    const bottom = this.y + this.h;
    for (const l of ledges) {
      if (l.x >= this.x + this.w || l.x + l.w <= this.x || l.y < bottom) continue;
      best = Math.min(best, l.y - bottom);
    }
    return best;
  }

  // ---------------------------------------------------------------- lifecycle

  startMove(name, chain, world) {
    const cfg = M[name];
    const linked = this.chains.isLinked(this.time, this.jumpFlight > 0);
    this.move = {
      name,
      variant: 'basic',
      t: 0,
      maxHold: cfg.maxHold,
      window: cfg.perfect ?? null,
      linked,
      chain,
    };
    if (name === 'wall') this.move.side = this.wallContact;
    if (name === 'burrow' && this.grounded) {
      this.move.variant = 'dig';
      this.move.ledge = this.groundLedge;
      this.move.window = null; // opens when we break through
    }

    const isNew = this.chains.onStart(linked, chain);
    if (chain) {
      CHAIN_EFFECTS[chain.effect]?.(this, world, chain);
      world.fx.chain(this, chain, isNew, this.chains.count);
    }
  }

  endMove(world, reason) {
    const m = this.move;
    if (!m) return;
    this.move = null;
    const quality = reason === 'timeout' ? 'timeout' : this.gradeRelease(m);
    this.chains.record(m.name, quality, this.time, m.linked);

    if (m.name === 'wall') {
      if (reason === 'release') this.wallJump(m.side, quality === 'perfect', world);
      else if (reason === 'timeout') this.vx = -m.side * M.wall.timeoutPush;
    }
    if (m.name === 'burrow') this.exitBurrow(m, quality, world);

    if (quality === 'perfect') {
      this.carry = M.carryTime;
      world.fx.perfect(this);
    } else if (quality === 'timeout') {
      this.recover = M.recoveryTime;
      world.fx.timeout(this);
    }
  }

  gradeRelease(m) {
    return m.window && m.t >= m.window[0] && m.t <= m.window[1] ? 'perfect' : 'normal';
  }

  wallJump(side, perfect, world) {
    this.vx = -side * (perfect ? M.wall.perfectJumpVx : M.wall.jumpVx);
    this.vy = perfect ? M.wall.perfectJumpVy : M.wall.jumpVy;
    this.facing = -side;
    this.jumpFlight = M.wall.jumpFlight;
    this.lastJumpFrom = side;
    this.chains.record('wallJump', perfect ? 'perfect' : 'normal', this.time, true);
    world.fx.wallKick(this, side);
  }

  exitBurrow(m, quality, world) {
    if (m.variant === 'dig' && !m.broke) {
      // Let go before breaking through: climb back out on top.
      if (m.ledge) this.y = m.ledge.y - this.h;
      this.vy = 0;
      return;
    }
    if (m.variant === 'dig' && quality === 'perfect') this.vy += M.burrow.perfectExitBoost;
    if (m.variant === 'wallBurrow') {
      const WB = C.wallBurrow;
      const t = W.wallThickness;
      this.x = m.side < 0 ? t : W.width - t - this.w;
      this.vx = -m.side * (quality === 'perfect' ? WB.perfectBurstVx : WB.burstVx);
      this.vy = WB.burstVy;
      this.facing = -m.side;
      // Don't pop out inside a ledge attached to this wall.
      for (const l of world.level.ledges) {
        if (overlaps(this, l)) this.y = l.y + l.h;
      }
      world.fx.dirt(this.x + this.w / 2, this.y + this.h / 2, 18);
    }
  }

  // ---------------------------------------------------------------- physics

  physics(dt, input, world) {
    const m = this.move;
    if (m?.variant === 'wallBurrow') return this.wallBurrowPhysics(dt, world);
    if (m?.variant === 'drill') return this.drillPhysics(dt, world);
    if (m?.variant === 'dig' && !m.broke) return this.digPhysics(dt, world);

    // --- Horizontal
    const name = m?.name;
    const locked = this.recover > 0 || name === 'dive' || name === 'burrow';
    let steer = locked ? 0 : input.steer;
    if (name === 'wall') steer = m.side;

    let maxSpeed, accel, decel;
    if (name === 'ears') {
      maxSpeed = M.ears.steerSpeed;
      accel = decel = M.ears.steerAccel;
    } else if (this.grounded) {
      maxSpeed = P.groundSteerSpeed;
      accel = P.groundSteerAccel;
      decel = P.groundSteerDecel;
    } else {
      maxSpeed = P.airSteerSpeed;
      accel = P.airSteerAccel;
      decel = P.airSteerDecel;
    }
    const carrying = !this.grounded && (this.carry > 0 || this.jumpFlight > 0);
    if (name === 'dive') decel = carrying ? P.momentumDrag : M.dive.vxDrag;
    else if (carrying && name !== 'ears') decel = P.momentumDrag;

    let rate;
    if (steer !== 0 && Math.sign(this.vx) === steer && Math.abs(this.vx) > maxSpeed) {
      rate = carrying ? P.momentumDrag : P.overspeedDecel; // keep momentum, don't snap down
    } else {
      rate = steer !== 0 ? accel : decel;
    }
    this.vx = approach(this.vx, steer * maxSpeed, rate * dt);
    if (steer !== 0 && name !== 'wall') this.facing = steer;

    // --- Vertical: accelerate up to the current cap, brake down to it from above.
    let cap = P.terminalVelocity;
    let gain = P.gravity;
    let brake = this.carry > 0 ? P.carryFallDecel : P.overspeedFallDecel;
    if (name === 'ears') {
      cap = M.ears.fallSpeed;
      brake = M.ears.brake;
    } else if (name === 'dive') {
      cap = M.dive.speed;
      gain = M.dive.accel;
    } else if (name === 'wall') {
      cap = M.wall.fallSpeed;
      brake = M.wall.brake;
    }
    this.vy = this.vy < cap ? Math.min(this.vy + gain * dt, cap) : approach(this.vy, cap, brake * dt);

    this.moveAndCollide(dt, steer, world.level.ledges);
  }

  moveAndCollide(dt, steer, ledges) {
    this.x += this.vx * dt;
    this.collideWalls(steer);
    for (const l of ledges) {
      if (!overlaps(this, l)) continue;
      if (this.vx > 0) this.x = l.x - this.w;
      else if (this.vx < 0) this.x = l.x + l.w;
      this.vx = 0;
    }

    const wasGrounded = this.grounded;
    this.grounded = false;
    this.y += this.vy * dt;
    for (const l of ledges) {
      if (!overlaps(this, l)) continue;
      if (this.vy > 0) {
        this.y = l.y - this.h;
        if (l.pad) {
          this.vy = H.padBounce;
          this.padBounced = l;
          continue;
        }
        if (!wasGrounded) this.land(this.vy);
        this.grounded = true;
        this.groundLedge = l;
      } else {
        this.y = l.y + l.h;
      }
      this.vy = 0;
    }
  }

  collideWalls(steer) {
    const t = W.wallThickness;
    const right = W.width - t - this.w;
    this.touchWall = 0;
    this.wallContact = 0;
    if (this.x <= t) {
      this.x = t;
      if (this.vx < 0) this.vx = 0;
      this.touchWall = -1;
    } else if (this.x >= right) {
      this.x = right;
      if (this.vx > 0) this.vx = 0;
      this.touchWall = 1;
    }
    if (this.touchWall && steer === this.touchWall) this.wallContact = this.touchWall;
  }

  land(speed) {
    this.lastImpact = speed;
    this.justLanded = speed;
    this.squash = Math.min(1, speed / P.landSquashSpeed);
  }

  digPhysics(dt, world) {
    const m = this.move;
    const l = m.ledge;
    this.vx = 0;
    this.vy = M.burrow.digSpeed;
    this.grounded = false;
    this.y += this.vy * dt;
    if (Math.random() < 0.5) world.fx.dirt(this.x + this.w / 2, this.y + this.h, 1);
    if (!l || !world.level.ledges.includes(l) || this.y >= l.y + l.h) {
      // Broke through: the hole stays, and the perfect window opens now.
      m.broke = true;
      m.window = [m.t + M.burrow.exitWindow[0], m.t + M.burrow.exitWindow[1]];
      if (l) world.level.carve(l, this.x - 2, this.x + this.w + 2);
      world.fx.dirt(this.x + this.w / 2, this.y, 14);
    }
  }

  drillPhysics(dt, world) {
    const m = this.move;
    this.vx = 0;
    this.vy = Math.max(this.vy, C.drill.minSpeed * 0.5);
    this.grounded = false;
    this.y += this.vy * dt;
    for (const l of [...world.level.ledges]) {
      if (!overlaps(this, l)) continue;
      if (l.pad) {
        this.y = l.y - this.h;
        this.vy = H.padBounce;
        this.padBounced = l;
        this.endMove(world, 'context');
        return;
      }
      if (m.charges > 0) {
        m.charges--;
        world.level.carve(l, this.x - 4, this.x + this.w + 4);
        this.vy *= C.drill.layerSlowdown;
        world.fx.dirt(this.x + this.w / 2, l.y, 16);
        world.fx.shake(2);
      } else {
        this.y = l.y - this.h;
        this.vy = 0;
        this.grounded = true;
        this.groundLedge = l;
        this.endMove(world, 'context');
        return;
      }
    }
  }

  wallBurrowPhysics(dt, world) {
    const m = this.move;
    const t = W.wallThickness;
    this.x = m.side < 0 ? t - this.w * 0.6 : W.width - t - this.w * 0.4;
    this.vx = 0;
    this.vy = C.wallBurrow.speed;
    this.y += this.vy * dt;
    this.grounded = false;
    this.touchWall = m.side;
    if (Math.random() < 0.6) world.fx.dirt(m.side < 0 ? t : W.width - t, this.y + this.h / 2, 1);
  }

  // Context-driven transitions after movement.
  afterCollide(input, world) {
    let m = this.move;

    // Landing ends air moves. Landing while still holding Dive turns into Burrow (-> Drill).
    if (this.grounded && m && (m.name === 'ears' || m.name === 'wall' || (m.name === 'burrow' && m.broke))) {
      this.endMove(world, 'context');
    }
    let drilled = false;
    if (this.grounded && m?.name === 'dive') {
      this.endMove(world, 'context');
      if (input.downHeld) {
        this.request('burrow', world);
        drilled = this.move?.variant === 'drill';
      }
    }

    // Diving into the opposite wall during a wall jump's flight = Wall Burrow.
    m = this.move;
    if (m?.name === 'dive' && this.jumpFlight > 0 && this.touchWall && this.touchWall !== this.lastJumpFrom) {
      this.move = null; // the dive was just the way in; don't record it
      this.request('burrow', world);
    }

    // Wall drag: automatic when steering into a wall in the air.
    m = this.move;
    if (m?.name === 'wall' && this.touchWall !== m.side) this.endMove(world, 'context');
    if ((!m || m.name === 'ears') && !this.grounded && this.recover <= 0 &&
        this.wallContact && this.vy > M.wall.minFallSpeed) {
      this.request('wall', world);
    }

    // A wall jump's flight ends on reaching a wall or the ground; chain links count from then.
    if (this.jumpFlight > 0 && (this.grounded || (this.touchWall && this.touchWall !== this.lastJumpFrom))) {
      this.jumpFlight = 0;
      this.chains.refreshLast('wallJump', this.time);
    }
    if (this.grounded) this.lastJumpFrom = 0;

    if (this.justLanded && !drilled) {
      if (this.softLanding) world.fx.puff(this, 10);
      else if (this.justLanded > P.hardLandingSpeed) {
        world.fx.hardLanding(this);
        this.hurt(world, null);
      }
      else world.fx.puff(this, Math.round(this.justLanded / 60));
    }
    if (this.grounded) this.softLanding = false;
    if (this.padBounced) world.fx.pad(this);
  }
}
