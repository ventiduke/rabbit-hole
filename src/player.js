// Player physics. M1: gravity, slow air steering, running on ledges,
// solid side walls. The move state machine (§2) plugs in here in M2.

import { CONFIG } from './config.js';

const P = CONFIG.player;

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
    this.x = (CONFIG.world.width - this.w) / 2;
    this.y = P.startY;
    this.vx = 0;
    this.vy = 0;
    this.prevX = this.x;
    this.prevY = this.y;
    this.grounded = false;
    this.wallContact = 0;   // -1 left wall, 1 right wall, 0 none
    this.lastImpact = 0;    // vertical speed at last landing (for hard landings in M4)
    this.squash = 0;        // 0..1 visual squash after landing
    this.facing = 1;
  }

  update(dt, input, ledges) {
    this.prevX = this.x;
    this.prevY = this.y;

    // --- Horizontal: accelerate toward the steer target.
    const steer = input.steer;
    const maxSpeed = this.grounded ? P.groundSteerSpeed : P.airSteerSpeed;
    const accel = steer !== 0
      ? (this.grounded ? P.groundSteerAccel : P.airSteerAccel)
      : (this.grounded ? P.groundSteerDecel : P.airSteerDecel);
    this.vx = approach(this.vx, steer * maxSpeed, accel * dt);
    if (steer !== 0) this.facing = steer;

    // --- Vertical: gravity with a terminal cap.
    this.vy = Math.min(this.vy + P.gravity * dt, P.terminalVelocity);

    // --- Move + collide, one axis at a time.
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
        if (!wasGrounded) this.land(this.vy);
        this.grounded = true;
      } else {
        this.y = l.y + l.h;
      }
      this.vy = 0;
    }

    this.squash = Math.max(0, this.squash - dt * 5);
  }

  collideWalls(steer) {
    const t = CONFIG.world.wallThickness;
    const right = CONFIG.world.width - t - this.w;
    this.wallContact = 0;
    if (this.x <= t) {
      this.x = t;
      if (this.vx < 0) this.vx = 0;
      if (steer < 0) this.wallContact = -1;
    } else if (this.x >= right) {
      this.x = right;
      if (this.vx > 0) this.vx = 0;
      if (steer > 0) this.wallContact = 1;
    }
  }

  land(speed) {
    this.lastImpact = speed;
    this.squash = Math.min(1, speed / P.landSquashSpeed);
  }
}
