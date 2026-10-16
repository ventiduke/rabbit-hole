// Player physics + move state machine.
//
// Every move follows the same lifecycle (README §2):
//   START -> HOLD (up to maxHold) -> RELEASE
//     inside the perfect window -> PERFECT: feedback, momentum carry, longer chain link
//     normal release            -> normal exit
//     held past maxHold         -> forced exit + short recovery (can't act)
// Starting a new move while one is held cancels the current one; the cancel is
// graded like a release, so cancelling inside the perfect window is perfect.
//
// The world is an open cavern (level/world.js): one-way ledges that are often
// sloped (land on one and it slides you left or right, then launches you off
// its end), and solid blocks. Burrowing carves holes in ledges and blocks.

import { CONFIG } from './config.js';
import { ChainTracker, CHAIN_EFFECTS } from './chains.js';
import { RULES, LEDGE_T, slope, surfaceY } from './level/world.js';

const P = CONFIG.player;
const M = CONFIG.moves;
const C = CONFIG.chains;
const W = CONFIG.world;
const H = CONFIG.hazards;

const approach = (v, target, delta) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);

export class Player {
  constructor() {
    this.w = P.width;
    this.h = P.height;
    this.reset();
  }

  reset() {
    this.x = (W.width - this.w) / 2; // the cavern starts centred on the screen
    this.y = P.startY;
    this.vx = 0;
    this.vy = 0;
    this.prevX = this.x;
    this.prevY = this.y;
    this.time = 0;
    this.grounded = false;
    this.ground = null;     // { ledge } | { block } we're standing on
    this.touchWall = 0;     // -1 / 1 when pressed against a wall
    this.wallContact = 0;   // same, but only while steering into it
    this.lastSteer = { dir: 0, time: -1 };
    this.lastImpact = 0;    // vertical speed at last landing
    this.justLanded = 0;    // impact speed if we landed this step
    this.squash = 0;        // 0..1 visual squash after landing
    this.facing = 1;
    this.move = null;       // { name, variant, t, maxHold, window, linked, ... }
    this.recover = 0;       // seconds of forced recovery left
    this.carry = 0;         // seconds of momentum carry left
    this.jumpFlight = 0;    // seconds a wall jump still counts as in flight
    this.lastJumpFrom = 0;  // wall side of the last wall jump
    this.coyote = 0;        // seconds we can still ground-jump after leaving the ground
    this.jumpBuffer = 0;    // seconds a jump press waits for the ground
    this.jumping = false;   // rising from a ground jump (for variable height)
    this.softLanding = false;
    this.padBounced = false;
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

  // Kind of ledge we're standing on ('ledge' | 'fragile' | 'spikes'), 'block', or null.
  get groundKind() {
    return this.ground?.ledge?.kind ?? (this.ground?.block ? 'block' : null);
  }

  get groundSlope() {
    return this.ground?.ledge ? slope(this.ground.ledge) : 0;
  }

  update(dt, input, world) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.time += dt;
    this.recover = Math.max(0, this.recover - dt);
    this.carry = Math.max(0, this.carry - dt);
    this.jumpFlight = Math.max(0, this.jumpFlight - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? P.coyoteTime : Math.max(0, this.coyote - dt);
    if (input.steer !== 0) this.lastSteer = { dir: input.steer, time: this.time };

    this.handleInput(input, world);
    if (this.move) {
      this.move.t += dt;
      if (this.move.t >= this.move.maxHold) this.endMove(world, 'timeout');
    }

    this.justLanded = 0;
    this.padBounced = false;
    this.physics(dt, input, world);
    this.afterCollide(input, world);
    this.squash = Math.max(0, this.squash - dt * 5);
  }

  leaveGround() {
    this.grounded = false;
    this.ground = null;
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
    this.leaveGround();
    if (this.hp <= 0) this.dead = true;
    world.fx.hurt(this);
    world.score?.hit();
    return true;
  }

  heal(n) {
    this.hp = Math.min(P.maxHp, this.hp + n);
  }

  // ---------------------------------------------------------------- input

  handleInput(input, world) {
    if (this.recover > 0) return;

    // Starts first, so e.g. a swipe-down on a wall cancels the drag instead
    // of being read as "lifted the steering finger" (= let go of the wall).
    if (input.downPressed) {
      if (this.grounded || this.touchWall) this.requestBurrow(world);
      else this.request('dive', world);
    }
    if (input.earsPressed) this.request('ears', world);

    // Jump: wall jump while dragging, otherwise a ground jump (buffered + coyote time).
    if (input.jumpPressed) this.jumpBuffer = P.jumpBuffer;
    if (this.jumpBuffer > 0) {
      if (this.move?.name === 'wall') {
        this.jumpBuffer = 0;
        this.endMove(world, 'jump');
      } else if (!this.move && (this.grounded || this.coyote > 0)) {
        this.jumpBuffer = 0;
        this.groundJump(world);
      }
    }
    if (this.jumping && (this.vy >= 0 || !input.jumpHeld)) {
      if (this.vy < 0) this.vy *= P.jumpCut; // let go early = shorter hop
      this.jumping = false;
    }

    const m = this.move;
    if (!m) return;
    if (m.name === 'ears' && !input.earsHeld) this.endMove(world, 'release');
    else if ((m.name === 'dive' || m.name === 'burrow') && !input.downHeld) this.endMove(world, 'release');
    // Wall slides are sticky: you stay on until you jump (above), tap, or steer away.
    else if (m.name === 'wall' && (input.tap || input.steer === -m.side)) this.endMove(world, 'release');
  }

  groundJump(world) {
    this.vy = -P.jumpSpeed;
    this.leaveGround();
    this.coyote = 0;
    this.jumping = true;
    world.fx.puff(this, 5);
  }

  request(name, world) {
    if (this.recover > 0) return;
    if ((name === 'ears' || name === 'dive' || name === 'wall') && this.grounded) return;
    if (this.move?.name === name) return;
    if (this.move) this.endMove(world, 'cancel');
    this.startMove(name, this.chains.match(name, this.time, this.context(world)), world);
  }

  // Burrow picks its direction from context:
  //   Wall Burrow chain (wall jump -> burrow into the opposite wall): through any block but rock
  //   pushing into a soft block (wall slide or on the ground): tunnel through it sideways
  //   standing on a ledge or soft block: dig down through it (or Drill, as a chain)
  //   otherwise in the air: dive
  requestBurrow(world) {
    if (this.recover > 0 || this.move?.name === 'burrow') return;
    const geo = world.level.world;
    const side = this.pushSide();
    if (this.move) this.endMove(world, 'cancel');
    const chain = this.chains.match('burrow', this.time, this.context(world));

    if (chain?.id === 'wallBurrow') {
      const b = this.sideBlock(geo, this.touchWall);
      if (b && RULES.drill.block(b.kind)) return this.startTunnel(world, b, this.touchWall, chain);
      return world.fx.clunk(this);
    }
    if (side) {
      const b = this.sideBlock(geo, side);
      if (b && RULES.tunnel.block(b.kind)) return this.startTunnel(world, b, side, null);
    }
    if (this.grounded) {
      if (chain?.id === 'drill') return this.startMove('burrow', chain, world);
      const g = this.ground;
      const ok = g.ledge ? RULES.dig.ledge(g.ledge.kind) : RULES.dig.block(g.block.kind);
      if (ok) return this.startDig(world, chain);
      return world.fx.clunk(this);
    }
    this.request('dive', world);
  }

  // The wall we're pushing into: wall drag side, or steering into a wall just now.
  pushSide() {
    if (this.move?.name === 'wall') return this.move.side;
    if (this.touchWall && this.lastSteer.dir === this.touchWall && this.time - this.lastSteer.time < 0.25) {
      return this.touchWall;
    }
    return 0;
  }

  // The block right next to us on `side` (side walls come back as rock).
  sideBlock(geo, side) {
    const hits = geo.blocksIn(side > 0 ? this.x + this.w : this.x - 2, this.y + 3, 2, this.h - 6);
    const mid = this.y + this.h / 2;
    return hits.find((b) => b.y <= mid && b.y + b.h >= mid) ?? hits[0] ?? null;
  }

  startTunnel(world, b, side, chain) {
    // Cut a slot through the whole block at our height, then dig along it.
    world.level.world.carveBlock(b, { x: b.x - 1, y: this.y - 3, w: b.w + 2, h: this.h + 6 });
    world.fx.dirt(side > 0 ? this.x + this.w : this.x, this.y + this.h / 2, 12);
    this.startMove('burrow', chain, world, {
      variant: chain ? 'wallBurrow' : 'tunnel',
      side,
      edge: side > 0 ? b.x + b.w : b.x,
      speed: M.burrow.tunnelSpeed,
      window: null,
    });
  }

  startDig(world, chain) {
    const g = this.ground;
    const geo = world.level.world;
    let edge;
    if (g.ledge) {
      edge = surfaceY(g.ledge, this.x + this.w / 2) + LEDGE_T;
      geo.carveLedge(g.ledge, this.x - 6, this.x + this.w + 6);
    } else {
      edge = g.block.y + g.block.h;
      geo.carveBlock(g.block, { x: this.x - 4, y: g.block.y - 1, w: this.w + 8, h: g.block.h + 2 });
    }
    world.fx.dirt(this.x + this.w / 2, this.y + this.h, 10);
    this.leaveGround();
    this.startMove('burrow', chain, world, { variant: 'dig', edge, window: null });
  }

  context(world) {
    return {
      inJumpFlight: this.jumpFlight > 0,
      onGround: this.grounded,
      onOppositeWall: this.touchWall !== 0 && this.touchWall !== this.lastJumpFrom,
      nearGround: !this.grounded && this.distanceToGround(world.level.world) < C.softLanding.range,
    };
  }

  distanceToGround(geo) {
    const foot = this.y + this.h;
    const cx = this.x + this.w / 2;
    let best = Infinity;
    for (const l of geo.ledges) {
      if (cx < l.x1 || cx > l.x2) continue;
      const d = surfaceY(l, cx) - foot;
      if (d >= -1) best = Math.min(best, d);
    }
    for (const b of geo.blocks) {
      if (b.x >= this.x + this.w || b.x + b.w <= this.x) continue;
      const d = b.y - foot;
      if (d >= -1) best = Math.min(best, d);
    }
    return best;
  }

  // ---------------------------------------------------------------- lifecycle

  startMove(name, chain, world, opts = {}) {
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
      ...opts,
    };
    if (name === 'wall') this.move.side = this.wallContact;
    if (name === 'ears' || name === 'dive') this.jumping = false;

    const isNew = this.chains.onStart(linked, chain);
    if (chain) {
      CHAIN_EFFECTS[chain.effect]?.(this, world, chain);
      world.fx.chain(this, chain, isNew, this.chains.count);
      world.score?.chain(chain, isNew, this.chains.count);
    }
  }

  // reason: 'release' | 'jump' (wall only) | 'cancel' | 'context' | 'timeout'
  endMove(world, reason) {
    const m = this.move;
    if (!m) return;
    this.move = null;
    const quality = reason === 'timeout' ? 'timeout' : this.gradeRelease(m);
    this.chains.record(m.name, quality, this.time, m.linked);

    if (m.name === 'wall') {
      if (reason === 'jump') this.wallJump(m.side, quality === 'perfect', world);
      else if (reason === 'release') this.vx = -m.side * P.wallDropPush; // tap / steer away: drop off
      else if (reason === 'timeout') this.vx = -m.side * M.wall.timeoutPush;
    }
    if (m.name === 'burrow') this.exitBurrow(m, quality);

    if (quality === 'perfect') {
      this.carry = M.carryTime;
      world.fx.perfect(this);
      world.score?.perfect();
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

  exitBurrow(m, quality) {
    if (!m.broke) return; // let go inside: you stay in the hole you dug
    if (m.variant === 'dig' && quality === 'perfect') this.vy += M.burrow.perfectExitBoost;
    if ((m.variant === 'tunnel' || m.variant === 'wallBurrow') && quality === 'perfect') {
      const B = m.variant === 'wallBurrow' ? C.wallBurrow : M.burrow;
      this.vx = m.side * B.perfectBurstVx;
      this.vy = B.burstVy;
      this.carry = M.carryTime;
    }
  }

  // ---------------------------------------------------------------- physics

  physics(dt, input, world) {
    const m = this.move;
    if (m?.variant === 'drill') return this.drillPhysics(dt, world);
    if (m?.variant === 'dig' && !m.broke) return this.digPhysics(dt, world);
    if ((m?.variant === 'tunnel' || m?.variant === 'wallBurrow') && !m.broke) return this.tunnelPhysics(dt, world);

    // --- Horizontal
    const name = m?.name;
    const locked = this.recover > 0 || name === 'dive' || name === 'burrow';
    let steer = locked ? 0 : input.steer;
    if (name === 'wall') steer = m.side;
    const s = this.groundSlope;
    const sloped = Math.abs(s) > 0.05;

    let maxSpeed, accel, decel;
    if (name === 'ears') {
      maxSpeed = M.ears.steerSpeed;
      accel = decel = M.ears.steerAccel;
    } else if (this.grounded) {
      maxSpeed = P.groundSteerSpeed;
      accel = P.groundSteerAccel;
      decel = sloped ? P.slideFriction : P.groundSteerDecel; // slopes keep you sliding
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
      // Keep momentum instead of snapping down to the steer cap.
      rate = carrying ? P.momentumDrag : this.grounded && sloped ? P.slideFriction : P.overspeedDecel;
    } else {
      rate = steer !== 0 ? accel : decel;
    }
    this.vx = approach(this.vx, steer * maxSpeed, rate * dt);
    if (this.grounded && this.ground.ledge) {
      // Sloped ledges pull you downhill.
      this.vx += P.slideAccel * (s / Math.hypot(1, s)) * dt;
      this.vx = Math.max(-P.slideMax, Math.min(P.slideMax, this.vx));
    }
    if (steer !== 0 && name !== 'wall') this.facing = steer;
    else if (this.grounded && Math.abs(this.vx) > 40) this.facing = Math.sign(this.vx);

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
    if (this.grounded && this.ground.ledge) this.vy = 0; // riding a ledge
    else this.vy = this.vy < cap ? Math.min(this.vy + gain * dt, cap) : approach(this.vy, cap, brake * dt);

    this.moveAndCollide(dt, steer, world.level.world);
  }

  // Sub-stepped so nothing gets skipped at dive speed.
  moveAndCollide(dt, steer, geo) {
    this.unstick(geo);
    const wasGrounded = this.grounded;
    if (this.ground?.block) this.leaveGround(); // re-found by stepY while we stand on it
    const n = Math.max(1, Math.ceil((Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt) / 6));
    for (let i = 0; i < n; i++) {
      if (this.ground?.ledge) this.slideStep(dt / n, geo);
      else {
        this.stepX((this.vx * dt) / n, geo);
        this.stepY((this.vy * dt) / n, geo, wasGrounded);
      }
      this.clampToWalls(geo);
    }
    this.updateContacts(steer, geo);
  }

  // Riding a ledge: follow its surface; run off an end and you launch along its slope.
  slideStep(dt, geo) {
    const l = this.ground.ledge;
    if (!geo.ledges.includes(l)) return this.leaveGround(); // it broke under us
    this.stepX(this.vx * dt, geo);
    const cx = this.x + this.w / 2;
    if (cx < l.x1 || cx > l.x2) {
      this.leaveGround();
      this.vy = Math.max(0, this.vx * slope(l));
      return;
    }
    this.y = surfaceY(l, cx) - this.h;
    this.grounded = true;
  }

  // The cavern walls can slant (where it narrows or widens): keep us inside them.
  clampToWalls(geo) {
    const { left, right } = geo.wallsOver(this.y, this.h);
    if (this.x < left) {
      this.x = left;
      if (this.vx < 0) this.vx = 0;
    } else if (this.x + this.w > right) {
      this.x = right - this.w;
      if (this.vx > 0) this.vx = 0;
    }
  }

  // Safety net: if we're ever inside a block, pop out to the nearest free spot.
  unstick(geo) {
    this.clampToWalls(geo);
    const inside = (x, y) => geo.blocksIn(x + 0.01, y + 0.01, this.w - 0.02, this.h - 0.02).some((b) => !b.side);
    if (!inside(this.x, this.y)) return;
    for (let d = 2; d <= 48; d += 2) {
      for (const [dx, dy] of [[0, -d], [-d, 0], [d, 0], [0, d]]) {
        if (!inside(this.x + dx, this.y + dy)) {
          this.x += dx;
          this.y += dy;
          return;
        }
      }
    }
  }

  stepX(dx, geo) {
    if (!dx) return;
    this.x += dx;
    const hits = geo.blocksIn(this.x, this.y, this.w, this.h);
    if (!hits.length) return;
    this.x = dx > 0 ? Math.min(...hits.map((b) => b.x)) - this.w : Math.max(...hits.map((b) => b.x + b.w));
    this.vx = 0;
  }

  stepY(dy, geo, wasGrounded) {
    if (!dy) return;
    const prevFoot = this.y + this.h;
    this.y += dy;
    const hits = geo.blocksIn(this.x, this.y, this.w, this.h).filter((b) => !b.side); // walls: clampToWalls
    if (dy < 0) {
      if (!hits.length) return;
      if (this.nudge(geo, hits)) return; // jumped into a corner
      this.y = Math.max(...hits.map((b) => b.y + b.h));
      this.vy = 0;
      this.jumping = false;
      return;
    }

    // Falling: the nearest block top or ledge surface we crossed.
    let top = Infinity;
    let ref = null;
    for (const b of hits) {
      if (b.y < top) {
        top = b.y;
        ref = { block: b };
      }
    }
    const cx = this.x + this.w / 2;
    for (const l of geo.ledges) {
      if (cx < l.x1 || cx > l.x2) continue;
      const sy = surfaceY(l, cx);
      if (prevFoot <= sy + 0.5 && this.y + this.h >= sy && sy < top) {
        top = sy;
        ref = { ledge: l };
      }
    }
    if (!ref) return;
    if (ref.block && !wasGrounded && this.nudge(geo, hits)) return; // slip past a corner
    this.y = top - this.h;

    if (ref.ledge?.kind === 'pad') {
      this.vy = H.padBounce;
      this.padBounced = true;
      return;
    }
    const s = ref.ledge ? slope(ref.ledge) : 0;
    if (!wasGrounded && !this.grounded) {
      // Hitting a slope at an angle softens the impact and turns some of the fall sideways.
      this.land(this.vy / Math.hypot(1, s));
      this.vx += this.vy * (s / (1 + s * s)) * P.landSlideConvert;
    }
    this.ground = ref;
    this.grounded = true;
    this.vy = 0;
  }

  // Corner correction: if we only clip one block by a sliver at our side, shift instead.
  nudge(geo, hits) {
    if (hits.length !== 1 || hits[0].side) return false;
    const b = hits[0];
    const overlapLeft = b.x + b.w - this.x;      // block on our left edge
    const overlapRight = this.x + this.w - b.x;  // block on our right edge
    let shift = 0;
    if (overlapLeft > 0 && overlapLeft <= P.cornerNudge) shift = overlapLeft;
    else if (overlapRight > 0 && overlapRight <= P.cornerNudge) shift = -overlapRight;
    if (!shift || geo.solidAt(this.x + shift, this.y, this.w, this.h)) return false;
    this.x += shift;
    return true;
  }

  updateContacts(steer, geo) {
    const wallAt = (x) => geo.solidAt(x, this.y + 4, 1, this.h - 8);
    const left = wallAt(this.x - 1.5);
    const right = wallAt(this.x + this.w + 0.5);
    this.touchWall = left && (steer < 0 || !right) ? -1 : right ? 1 : 0;
    this.wallContact = this.touchWall && steer === this.touchWall ? this.touchWall : 0;
  }

  land(speed) {
    this.lastImpact = speed;
    this.justLanded = speed;
    this.squash = Math.min(1, speed / P.landSquashSpeed);
  }

  digPhysics(dt, world) {
    const m = this.move;
    this.vx = 0;
    this.vy = M.burrow.digSpeed;
    this.moveAndCollide(dt, 0, world.level.world);
    if (Math.random() < 0.4) world.fx.dirt(this.x + this.w / 2, this.y + this.h, 1);
    if (this.grounded) return this.endMove(world, 'context'); // something solid below the hole
    if (this.y + this.h * 0.5 >= m.edge) this.breakThrough(m, world);
  }

  tunnelPhysics(dt, world) {
    const m = this.move;
    const speed = m.variant === 'wallBurrow' ? C.wallBurrow.speed : m.speed;
    const x0 = this.x;
    this.vx = m.side * speed;
    this.vy = 0;
    this.leaveGround();
    this.moveAndCollide(dt, 0, world.level.world);
    if (Math.random() < 0.5) world.fx.dirt(m.side > 0 ? this.x + this.w : this.x, this.y + this.h / 2, 1);
    if (Math.abs(this.x - x0) < 0.01) return this.endMove(world, 'context'); // blocked
    const past = m.side > 0 ? this.x >= m.edge : this.x + this.w <= m.edge;
    if (past) {
      this.carry = M.burrow.exitCarry;
      this.breakThrough(m, world);
    }
  }

  // Burst out into open space: the perfect window opens now.
  breakThrough(m, world) {
    m.broke = true;
    m.window = [m.t + M.burrow.exitWindow[0], m.t + M.burrow.exitWindow[1]];
    world.fx.dirt(this.x + this.w / 2, this.y + this.h / 2, 14);
  }

  drillPhysics(dt, world) {
    const m = this.move;
    const geo = world.level.world;
    this.vx = 0;
    this.vy = Math.max(this.vy, C.drill.minSpeed * 0.5);
    this.leaveGround();
    const n = Math.max(1, Math.ceil((this.vy * dt) / 6));
    for (let i = 0; i < n; i++) {
      const prevFoot = this.y + this.h;
      const ny = this.y + (this.vy * dt) / n;
      const cx = this.x + this.w / 2;
      // What are we about to hit: a ledge surface or a block?
      let hit = null;
      for (const l of geo.ledges) {
        if (cx < l.x1 || cx > l.x2) continue;
        const sy = surfaceY(l, cx);
        if (prevFoot <= sy + 0.5 && ny + this.h >= sy && (!hit || sy < hit.top)) hit = { ledge: l, top: sy };
      }
      for (const b of geo.blocksIn(this.x, ny, this.w, this.h).filter((o) => !o.side)) {
        if (!hit || b.y < hit.top) hit = { block: b, top: b.y };
      }
      if (!hit) {
        this.y = ny;
        continue;
      }
      if (hit.ledge?.kind === 'pad') {
        this.y = hit.top - this.h;
        this.vy = H.padBounce;
        this.padBounced = true;
        return this.endMove(world, 'context');
      }
      const breakable = hit.ledge ? RULES.drill.ledge(hit.ledge.kind) : RULES.drill.block(hit.block.kind);
      if (!breakable || m.charges <= 0) {
        // Out of power, or rock: stop on top. A drill's own landing never hurts.
        this.y = hit.top - this.h;
        this.vy = 0;
        this.ground = hit.ledge ? { ledge: hit.ledge } : { block: hit.block };
        this.grounded = true;
        return this.endMove(world, 'context');
      }
      if (hit.ledge) geo.carveLedge(hit.ledge, this.x - 6, this.x + this.w + 6);
      else geo.carveBlock(hit.block, { x: this.x - 4, y: hit.block.y - 1, w: this.w + 8, h: hit.block.h + 2 });
      m.charges--;
      this.vy *= C.drill.layerSlowdown;
      this.y = ny;
      world.score?.destroy(1);
      world.fx.dirt(cx, hit.top, 16);
      world.fx.shake(2);
    }
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
        this.requestBurrow(world);
        drilled = this.move?.variant === 'drill';
      }
    }

    // Diving into the opposite wall during a wall jump's flight = Wall Burrow.
    m = this.move;
    if (m?.name === 'dive' && this.jumpFlight > 0 && this.touchWall && this.touchWall !== this.lastJumpFrom) {
      this.move = null; // the dive was just the way in; don't record it
      this.requestBurrow(world);
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
