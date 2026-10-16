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
    overspeedFallDecel: 1400, // how fast vy above the current cap bleeds off
    carryFallDecel: 220,      // ...while momentum carry is active (after a perfect release)
    airSteerSpeed: 95,        // u/s, baseline drift is slow on purpose
    airSteerAccel: 520,       // u/s^2
    airSteerDecel: 380,       // u/s^2 when no input
    momentumDrag: 50,          // horizontal decel during jump flight / momentum carry
    overspeedDecel: 260,      // steering with vx above the steer cap bleeds it at this rate
    groundSteerSpeed: 150,    // u/s, running on a ledge
    groundSteerAccel: 1400,
    groundSteerDecel: 1800,
    landSquashSpeed: 300,     // impact speed that gives a full squash
    hardLandingSpeed: 560,    // impacts above this are "hard" (feedback only; damage in M4)
  },

  // Shared move lifecycle: START -> HOLD (maxHold) -> RELEASE.
  // `perfect` is the [start, end] release window in seconds since the move began.
  moves: {
    linkWindow: 0.2,          // a normal release still links into a chain within this time
    perfectLinkWindow: 0.35,  // a perfect release links for a bit longer
    carryTime: 0.6,           // momentum carry after a perfect release
    recoveryTime: 0.45,       // can't act after a move times out

    ears: {
      maxHold: 1.3,
      perfect: [0.85, 1.0],
      fallSpeed: 100,         // ~0.3x terminal
      brake: 1700,            // how hard ears slow the fall
      steerSpeed: 240,        // ~2.5x air steer
      steerAccel: 1300,
    },
    dive: {
      maxHold: 1.2,
      perfect: [0.75, 0.9],
      speed: 850,             // ~2.5x terminal
      accel: 2400,
      vxDrag: 140,            // no steering; existing sideways speed bleeds off at this rate
    },
    wall: {
      maxHold: 1.2,
      perfect: [0.7, 0.85],
      minFallSpeed: -40,      // can grab once vy is above this
      fallSpeed: 135,         // ~0.4x terminal
      brake: 1800,
      jumpVx: 330,
      jumpVy: -170,
      perfectJumpVx: 430,
      perfectJumpVy: -250,
      jumpFlight: 1.4,        // max seconds a wall jump counts as "in flight" for chains
      timeoutPush: 60,        // slip away from the wall on timeout
    },
    burrow: {
      maxHold: 1.4,
      digSpeed: 80,           // u/s through a ledge
      exitWindow: [0.04, 0.2],// perfect window, measured from the moment you break through
      perfectExitBoost: 160,  // extra downward speed on a clean exit
    },
  },

  chains: {
    historySize: 8,
    drill: {
      maxHold: 1.2,
      perfect: [0.55, 0.7],
      minSpeed: 420,
      speedPerLayer: 140,     // each 140 u/s above terminal = one more layer
      maxLayers: 5,
      layerSlowdown: 0.88,    // speed multiplier per layer punched
    },
    wallBurrow: {
      maxHold: 1.2,
      perfect: [0.6, 0.78],
      speed: 230,             // downward tunnelling speed inside the wall
      burstVx: 260,
      perfectBurstVx: 380,
      burstVy: -60,
    },
    parachuteSnap: {
      shockwaveRange: 320,    // breaks fragile ledges this far below
    },
    softLanding: {
      range: 160,             // ground must be within this distance below
      maxSpeed: 40,           // fall speed is cut to this
    },
  },

  camera: {
    anchor: 0.33,         // player sits at this fraction of screen height
    lookAhead: 130,       // extra units shown below per terminal velocity of fall speed
    maxLookFrac: 2.5,     // look-ahead grows up to this many terminal velocities
    minScreenY: 0.12,     // never push the player above this fraction of the screen
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
    fragileChance: 0.25,
    minPiece: 10,         // carved pieces narrower than this disappear
    spawnAhead: 300,      // generate this far below the bottom of the screen
    despawnBehind: 300,   // remove this far above the top of the screen
  },

  input: {
    swipeDistance: 24,    // CSS px a finger must travel to count as a swipe
    swipeTime: 0.22,      // seconds after touch-down a swipe can still be detected
    swipeAxisBias: 1.2,   // dominant axis must be this much larger than the other
  },

  fx: {
    perfectFlash: 0.22,
    chainFlash: 0.35,
    chainShake: 5,
    hardLandingShake: 7,
    shakeDecay: 30,       // shake units lost per second
    flashDecay: 2.5,      // flash alpha lost per second
    textLife: 0.9,
    hapticPerfect: 18,    // ms
    hapticChain: [25, 40, 25],
    hapticHit: 40,
  },

  ui: {
    hintSeconds: 4,       // how long touch-zone hints show after starting
  },
};
