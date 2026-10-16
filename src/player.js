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
// The world is tile terrain (level/tiles.js): solid tiles block from every
// side, ledges are one-way platforms, and burrowing removes tiles.

import { CONFIG } from './config.js';
import { ChainTracker, CHAIN_EFFECTS } from './chains.js';
import { T, TILE, isSolid, isWall, props, DIG_RULES } from './level/tiles.js';

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
    this.x = (W.width - this.w) / 2;
    this.y = P.startY;
    this.vx = 0;
    this.vy = 0;
    this.prevX = this.x;
    this.prevY = this.y;
    this.time = 0;
    this.grounded = false;
    this.groundTypes = new Set(); // tile types under our feet
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
    else if (m.name === 'wall' && input.steer !== m.side) this.endMove(world, 'release');
  }

  groundJump(world) {
    this.vy = -P.jumpSpeed;
    this.grounded = false;
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
  //   Wall Burrow chain (wall jump -> burrow into the opposite wall): sideways through anything but rock
  //   pushing into a soft wall (wall drag or on the ground): tunnel sideways
  //   standing on diggable ground: dig down (or Drill, as a chain)
  //   otherwise in the air: dive
  requestBurrow(world) {
    if (this.recover > 0 || this.move?.name === 'burrow') return;
    const map = world.level.map;
    const side = this.pushSide();
    if (this.move) this.endMove(world, 'cancel');
    const chain = this.chains.match('burrow', this.time, this.context(world));

    if (chain?.id === 'wallBurrow') return this.startMove('burrow', chain, world);
    const tunnelY = side ? this.tunnelY(map, side) : null;
    if (tunnelY !== null) {
      this.y = tunnelY;
      return this.startMove('burrow', null, world, {
        variant: 'tunnel', side, rule: DIG_RULES.tunnel, speed: M.burrow.tunnelSpeed, window: null,
      });
    }
    if (this.grounded) {
      if (chain?.id === 'drill') return this.startMove('burrow', chain, world);
      if (this.probe(map, 0, DIG_RULES.dig)) {
        return this.startMove('burrow', chain, world, { variant: 'dig', rule: DIG_RULES.dig, window: null });
      }
      world.fx.clunk(this);
      return;
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

  // A height at which we can tunnel sideways into soft dirt: where we are, or
  // snapped to the tile rows (so a mid-air wall drag doesn't catch a dirt corner).
  tunnelY(map, side) {
    const y0 = this.y;
    const feet = Math.floor((this.y + this.h) / TILE);
    const candidates = [y0, (feet + 1) * TILE - this.h, feet * TILE - this.h];
    let found = null;
    for (const y of candidates) {
      this.y = y;
      const ok = this.probe(map, side, DIG_RULES.tunnel) && !map.anyInBox(this.x, y, this.w, this.h, isWall);
      if (ok && found === null) found = y;
    }
    this.y = y0;
    return found;
  }

  // Is there something `rule` can burrow into next to us (side -1/1) or below (side 0)?
  probe(map, side, rule) {
    const box = side === 0
      ? { x: this.x, y: this.y + this.h, w: this.w, h: 2 }
      : { x: side > 0 ? this.x + this.w : this.x - 2, y: this.y + 1, w: 2, h: this.h - 2 };
    let any = false;
    let blocked = false;
    map.forBox(box.x, box.y, box.w, box.h, (c, r, t) => {
      if (!isSolid(t)) return;
      if (rule(t)) any = true;
      else blocked = true;
    });
    return any && !blocked;
  }

  context(world) {
    return {
      inJumpFlight: this.jumpFlight > 0,
      onGround: this.grounded,
      onOppositeWall: this.touchWall !== 0 && this.touchWall !== this.lastJumpFrom,
      nearGround: !this.grounded && this.distanceToGround(world.level.map) < C.softLanding.range,
    };
  }

  distanceToGround(map) {
    const bottom = this.y + this.h;
    const r0 = Math.floor(bottom / TILE);
    const rows = Math.ceil(C.softLanding.range / TILE) + 1;
    for (let r = r0; r <= r0 + rows; r++) {
      let hit = false;
      map.forBox(this.x, r * TILE, this.w, 1, (c, rr, t) => {
        if (isSolid(t)) hit = true;
      });
      if (hit && r * TILE >= bottom - 0.5) return r * TILE - bottom;
    }
    return Infinity;
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
      else if (reason === 'release') this.vx = -m.side * P.wallDropPush; // let go: drop straight down
      else if (reason === 'timeout') this.vx = -m.side * M.wall.timeoutPush;
    }
    if (m.name === 'burrow') this.exitBurrow(m, quality, world);

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

  exitBurrow(m, quality, world) {
    if (!m.broke) return; // let go inside the ground: you stay in the hole you dug
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
    const map = world.level.map;
    if (m?.variant === 'drill') return this.drillPhysics(dt, world);
    if (m?.variant === 'dig' && !m.broke) return this.digPhysics(dt, world);
    if ((m?.variant === 'tunnel' || m?.variant === 'wallBurrow') && !m.broke) return this.tunnelPhysics(dt, world);

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

    this.moveAndCollide(dt, steer, map);
  }

  // Sub-stepped so nothing tunnels through a tile at dive speed.
  moveAndCollide(dt, steer, map) {
    this.unstick(map);
    const wasGrounded = this.grounded;
    this.grounded = false;
    const n = Math.max(1, Math.ceil((Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt) / 8));
    for (let i = 0; i < n; i++) {
      this.stepX((this.vx * dt) / n, map);
      this.stepY((this.vy * dt) / n, map, wasGrounded);
    }
    this.updateContacts(steer, map);
  }

  // Safety net: if we're ever inside a wall (e.g. after a snap or a carve),
  // pop out to the nearest free spot.
  unstick(map) {
    const inside = (x, y) => map.anyInBox(x + 0.01, y + 0.01, this.w - 0.02, this.h - 0.02, isWall);
    if (!inside(this.x, this.y)) return;
    for (let d = 2; d <= TILE * 2; d += 2) {
      for (const [dx, dy] of [[0, -d], [-d, 0], [d, 0], [0, d]]) {
        if (!inside(this.x + dx, this.y + dy)) {
          this.x += dx;
          this.y += dy;
          return;
        }
      }
    }
  }

  stepX(dx, map) {
    if (!dx) return;
    this.x += dx;
    let edge = null;
    map.forBox(this.x, this.y, this.w, this.h, (c, r, t) => {
      if (!isWall(t)) return;
      const e = dx > 0 ? c * TILE : (c + 1) * TILE;
      edge = edge === null ? e : dx > 0 ? Math.min(edge, e) : Math.max(edge, e);
    });
    if (edge !== null) {
      this.x = dx > 0 ? edge - this.w : edge;
      this.vx = 0;
    }
  }

  stepY(dy, map, wasGrounded) {
    if (!dy) return;
    const prevBottom = this.y + this.h;
    this.y += dy;
    if (dy > 0) {
      let top = null;
      const cols = new Set();
      map.forBox(this.x, this.y, this.w, this.h, (c, r, t) => {
        if (!isSolid(t)) return;
        if (props(t).oneWay && prevBottom > r * TILE + 0.01) return; // only from above
        if (top === null || r * TILE < top) top = r * TILE;
        cols.add(c);
      });
      if (top === null) return;
      if (!wasGrounded && this.nudge(map, cols)) return; // slip past a corner into a gap
      this.y = top - this.h;
      if (this.feetOn(map, T.PAD)) {
        this.vy = H.padBounce;
        this.padBounced = true;
        return;
      }
      if (!wasGrounded && !this.grounded) this.land(this.vy);
      this.grounded = true;
      this.vy = 0;
    } else {
      let bottom = null;
      const cols = new Set();
      map.forBox(this.x, this.y, this.w, this.h, (c, r, t) => {
        if (!isWall(t)) return;
        bottom = bottom === null ? (r + 1) * TILE : Math.max(bottom, (r + 1) * TILE);
        cols.add(c);
      });
      if (bottom === null) return;
      if (this.nudge(map, cols)) return; // jumped into a ceiling corner
      this.y = bottom;
      this.vy = 0;
      this.jumping = false;
    }
  }

  // Corner correction: if we only clip one tile column by a sliver, shift
  // sideways instead of catching on it.
  nudge(map, cols) {
    if (cols.size !== 1) return false;
    const c = [...cols][0];
    const overlapLeft = (c + 1) * TILE - this.x;   // tile is on our left edge
    const overlapRight = this.x + this.w - c * TILE; // tile is on our right edge
    let shift = 0;
    if (overlapLeft > 0 && overlapLeft <= P.cornerNudge) shift = overlapLeft;
    else if (overlapRight > 0 && overlapRight <= P.cornerNudge) shift = -overlapRight;
    if (!shift) return false;
    if (map.anyInBox(this.x + shift, this.y, this.w, this.h, isSolid)) return false;
    this.x += shift;
    return true;
  }

  feetOn(map, type) {
    return map.anyInBox(this.x, this.y + this.h, this.w, 1, (t) => t === type);
  }

  updateContacts(steer, map) {
    const wallAt = (x) => map.anyInBox(x, this.y + 4, 1, this.h - 8, isWall);
    const left = wallAt(this.x - 1);
    const right = wallAt(this.x + this.w);
    this.touchWall = left && (steer < 0 || !right) ? -1 : right ? 1 : 0;
    this.wallContact = this.touchWall && steer === this.touchWall ? this.touchWall : 0;
    this.groundTypes.clear();
    if (this.grounded) {
      map.forBox(this.x, this.y + this.h, this.w, 1, (c, r, t) => {
        if (isSolid(t)) this.groundTypes.add(t);
      });
    }
  }

  land(speed) {
    this.lastImpact = speed;
    this.justLanded = speed;
    this.squash = Math.min(1, speed / P.landSquashSpeed);
  }

  // Move by (dx, dy), removing the tiles we enter. Returns the removed cells,
  // or null if something `rule` can't dig is in the way (and we don't move).
  burrowStep(dx, dy, rule, world) {
    const { blocked, cells } = world.level.map.carveBox(this.x + dx, this.y + dy, this.w, this.h, rule);
    if (blocked) return null;
    this.x += dx;
    this.y += dy;
    for (const { c, r } of cells) world.fx.dirt(c * TILE + TILE / 2, r * TILE + TILE / 2, 6);
    return cells;
  }

  digPhysics(dt, world) {
    const m = this.move;
    const cells = this.burrowStep(0, M.burrow.digSpeed * dt, m.rule, world);
    if (!cells) return this.endMove(world, 'context'); // hit something too hard: stand on it
    this.vx = 0;
    this.vy = M.burrow.digSpeed;
    this.grounded = false;
    for (const { r } of cells) m.edge = Math.max(m.edge ?? 0, (r + 1) * TILE);
    if (Math.random() < 0.4) world.fx.dirt(this.x + this.w / 2, this.y + this.h, 1);
    const below = world.level.map.anyInBox(this.x, this.y + this.h, this.w, 1, isSolid);
    if (m.edge !== undefined && this.y + this.h >= m.edge && !below) this.breakThrough(m, world);
  }

  tunnelPhysics(dt, world) {
    const m = this.move;
    const cells = this.burrowStep(m.side * m.speed * dt, 0, m.rule, world);
    if (!cells) return this.endMove(world, 'context');
    this.vx = m.side * m.speed;
    this.vy = 0;
    this.grounded = false;
    this.touchWall = m.side;
    for (const { c } of cells) {
      const e = m.side > 0 ? (c + 1) * TILE : c * TILE;
      m.edge = m.edge === undefined ? e : m.side > 0 ? Math.max(m.edge, e) : Math.min(m.edge, e);
    }
    if (Math.random() < 0.5) world.fx.dirt(m.side > 0 ? this.x + this.w : this.x, this.y + this.h / 2, 1);
    if (m.edge === undefined) return;
    const past = m.side > 0 ? this.x >= m.edge : this.x + this.w <= m.edge;
    const ahead = world.level.map.anyInBox(m.side > 0 ? this.x + this.w : this.x - 1, this.y, 1, this.h, isWall);
    if (past && !ahead) {
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
    const map = world.level.map;
    this.vx = 0;
    this.vy = Math.max(this.vy, C.drill.minSpeed * 0.5);
    this.grounded = false;
    const n = Math.max(1, Math.ceil((this.vy * dt) / 8));
    for (let i = 0; i < n; i++) {
      const ny = this.y + (this.vy * dt) / n;
      const hits = [];
      map.forBox(this.x, ny, this.w, this.h, (c, r, t) => {
        if (isSolid(t)) hits.push({ c, r, t });
      });
      if (!hits.length) {
        this.y = ny;
        continue;
      }
      const top = Math.min(...hits.map((h) => h.r)) * TILE;
      const rows = new Set(hits.map((h) => h.r)).size;
      if (hits.some((h) => h.t === T.PAD)) {
        this.y = top - this.h;
        this.vy = H.padBounce;
        this.padBounced = true;
        return this.endMove(world, 'context');
      }
      if (hits.some((h) => !DIG_RULES.drill(h.t)) || rows > m.charges) {
        // Out of power, or rock: stop on top. A drill's own landing never hurts.
        this.y = top - this.h;
        this.vy = 0;
        this.grounded = true;
        return this.endMove(world, 'context');
      }
      for (const h of hits) map.set(h.c, h.r, T.EMPTY);
      m.charges -= rows;
      this.vy *= C.drill.layerSlowdown ** rows;
      this.y = ny;
      world.score?.destroy(rows);
      world.fx.dirt(this.x + this.w / 2, top, 16);
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
