// Follow camera. Vertically it keeps the rabbit in the upper third and looks
// further ahead the faster it falls. Horizontally the view is always one world
// width (W.width) wide: narrow caverns are centred, wide ones pan with the
// rabbit, stopping where the cavern wall comes into view.

import { CONFIG } from './config.js';

const C = CONFIG.camera;
const WALL = CONFIG.world.wallThickness;
const VIEW_W = CONFIG.world.width;

export class Camera {
  constructor() {
    this.y = 0;
    this.prevY = 0;
    this.x = 0;
    this.prevX = 0;
    this.look = 0;
    this.viewH = 600; // world units visible vertically; set by resize
  }

  snapTo(player, geo) {
    this.look = 0;
    this.y = this.target(player);
    this.prevY = this.y;
    this.x = geo ? this.targetX(player, geo) : 0;
    this.prevX = this.x;
  }

  targetX(player, geo) {
    // Walls a little below the rabbit too, so a widening shows up before you reach it.
    const a = geo.wallsAt(player.y + player.h / 2);
    const b = geo.wallsAt(player.y + this.viewH * 0.5);
    const L = Math.min(a.left, b.left) - WALL;
    const R = Math.max(a.right, b.right) + WALL;
    if (R - L <= VIEW_W) return (L + R) / 2 - VIEW_W / 2;
    const cx = player.x + player.w / 2;
    return Math.max(L, Math.min(R - VIEW_W, cx - VIEW_W / 2));
  }

  target(player) {
    return player.y + player.h / 2 - this.viewH * C.anchor + this.look;
  }

  update(dt, player, geo) {
    this.prevY = this.y;
    this.prevX = this.x;
    if (geo) this.x += (this.targetX(player, geo) - this.x) * (1 - Math.exp(-C.followRateX * dt));
    const speedFrac = Math.max(0, Math.min(C.maxLookFrac, player.vy / CONFIG.player.terminalVelocity));
    const maxLook = this.viewH * (C.anchor - C.minScreenY);
    const want = Math.min(speedFrac * C.lookAhead, maxLook);
    this.look += (want - this.look) * (1 - Math.exp(-C.lookAheadRate * dt));
    this.y += (this.target(player) - this.y) * (1 - Math.exp(-C.followRate * dt));
  }
}
