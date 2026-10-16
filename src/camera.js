// Vertical follow camera: keeps the rabbit in the upper third and looks
// further ahead the faster it falls.

import { CONFIG } from './config.js';

const C = CONFIG.camera;

export class Camera {
  constructor() {
    this.y = 0;
    this.prevY = 0;
    this.look = 0;
    this.viewH = 600; // world units visible vertically; set by resize
  }

  snapTo(player) {
    this.look = 0;
    this.y = this.target(player);
    this.prevY = this.y;
  }

  target(player) {
    return player.y + player.h / 2 - this.viewH * C.anchor + this.look;
  }

  update(dt, player) {
    this.prevY = this.y;
    const speedFrac = Math.max(0, Math.min(1, player.vy / CONFIG.player.terminalVelocity));
    this.look += (speedFrac * C.lookAhead - this.look) * (1 - Math.exp(-C.lookAheadRate * dt));
    this.y += (this.target(player) - this.y) * (1 - Math.exp(-C.followRate * dt));
  }
}
