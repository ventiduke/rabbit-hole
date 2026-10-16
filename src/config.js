// Every tunable number lives here. Never hard-code feel values in logic.
// Units: world units (u) and seconds. The world is WORLD.width units wide and
// y grows downward (deeper).

export const CONFIG = {
  world: {
    width: 360,           // shaft width incl. walls; the screen always shows the full width
    wallThickness: 18,
    unitsPerMeter: 24,    // for the depth readout
    maxAspect: 0.62,      // max width/height of the play area (portrait letterbox on desktop)
  },

  loop: {
    stepHz: 60,           // fixed physics rate
    maxStepsPerFrame: 5,  // avoid spiral of death after a stall
  },

  player: {
    width: 22,
    height: 26,
    startY: 40,
    gravity: 900,             // u/s^2
    terminalVelocity: 340,    // u/s, baseline fall cap
    airSteerSpeed: 95,        // u/s, baseline drift is slow on purpose
    airSteerAccel: 520,       // u/s^2
    airSteerDecel: 380,       // u/s^2 when no input
    groundSteerSpeed: 150,    // u/s, running on a ledge
    groundSteerAccel: 1400,
    groundSteerDecel: 1800,
    landSquashSpeed: 200,     // impact speed that gives a full squash (visual only for now)
  },

  camera: {
    anchor: 0.33,         // player sits at this fraction of screen height
    lookAhead: 150,       // extra units shown below at terminal velocity
    lookAheadRate: 3,     // how fast look-ahead eases in/out (1/s)
    followRate: 10,       // vertical follow stiffness (1/s)
  },

  ledges: {
    firstY: 380,          // first ledge depth
    gapMin: 170,          // vertical spacing between ledge rows
    gapMax: 300,
    widthMin: 70,
    widthMax: 190,
    thickness: 14,
    minHole: 64,          // narrowest passable opening next to a ledge
    wallAttachedChance: 0.65,
    spawnAhead: 300,      // generate this far below the bottom of the screen
    despawnBehind: 300,   // remove this far above the top of the screen
  },

  input: {
    // Placeholder for M2 gestures (swipe thresholds etc.)
  },

  ui: {
    hintSeconds: 4,       // how long touch-zone hints show after starting
  },
};
