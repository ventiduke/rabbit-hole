// Every tunable number lives here. Never hard-code feel values in logic.
// Units: world units (u) and seconds. The world is WORLD.width units wide and
// y grows downward (deeper).

export const CONFIG = {
  world: {
    width: 360,           // world width; the screen always shows the full width
    tile: 18,             // terrain tile size (20 tiles across)
    wallThickness: 18,    // the unbreakable border column (also the HUD margin)
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
    groundSteerSpeed: 160,    // u/s, running on the ground
    groundSteerAccel: 1400,
    groundSteerDecel: 1800,
    landSquashSpeed: 300,     // impact speed that gives a full squash
    hardLandingSpeed: 560,    // impacts above this hurt (unless cushioned by a chain)
    jumpSpeed: 330,           // ground jump (~3.5 tiles high)
    jumpCut: 0.45,            // releasing jump early multiplies upward speed by this
    coyoteTime: 0.09,         // can still jump this long after walking off an edge
    jumpBuffer: 0.12,         // a jump pressed this early before landing still happens
    cornerNudge: 6,           // slide past a tile corner overlapping by this much instead of catching on it
    wallDropPush: 30,         // letting go of a wall pushes you off it this fast
    maxHp: 3,
    invulnTime: 1.3,          // seconds of invulnerability after a hit
    hitBounce: -220,          // vy after taking a hit
    hitKnock: 180,            // vx away from what hit you
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
      digSpeed: 70,           // u/s down through soft dirt / ledges
      tunnelSpeed: 140,       // u/s sideways through soft dirt
      exitWindow: [0.04, 0.22],// perfect window, measured from the moment you break through
      perfectExitBoost: 160,  // dig down: extra downward speed on a clean exit
      perfectBurstVx: 300,    // tunnel: sideways burst on a clean exit
      burstVy: -120,
      exitCarry: 0.5,         // seconds a tunnel exit keeps its sideways momentum
    },
  },

  chains: {
    historySize: 8,
    drill: {
      maxHold: 1.2,
      perfect: [0.55, 0.7],
      minSpeed: 420,
      speedPerLayer: 120,     // each 120 u/s above terminal = one more row of tiles
      maxLayers: 6,
      layerSlowdown: 0.9,     // speed multiplier per row punched
    },
    wallBurrow: {
      maxHold: 1.2,
      speed: 260,             // sideways through anything but rock (dirt too)
      perfectBurstVx: 400,
      burstVy: -140,
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

  level: {
    startRows: 8,         // open rows above and below the start
    spawnAhead: 400,      // generate chunks this far below the bottom of the screen
    despawnBehind: 300,   // remove things this far above the top of the screen
    runHeight: 3,         // rows in a connector's sideways tunnel
    runThornMin: 7,       // connector runs at least this many tiles long can get a thorn
    shockCols: 6,         // Parachute Snap breaks fragile tiles this many columns either side
  },

  // Difficulty d goes 0 -> 1 with depth; [a, b] pairs are lerped by d.
  difficulty: {
    maxDepth: 1500,             // meters at which d reaches 1
    tierDepths: [0, 100, 300, 650], // meters at which chunk tiers 0..3 unlock
    newestTierWeight: 2.5,      // chunks of the highest unlocked tier are this much more likely
    hazardScale: [0.5, 1.3],    // multiplies optional spike/fragile chances in chunks
    slotChance: [0.2, 0.75],    // chance an optional hazard slot gets filled
    carrotChance: 0.12,         // chance a carrot slot gets a carrot
    connectorDrop: [3, 1],      // rows of straight drop before each connector tunnel
    runThornChance: 0.6,        // x d: chance a long connector run gets a patrolling thorn
    thornSpeed: [1, 1.7],       // patrol speed multiplier
    rockSpeed: [1, 1.35],
  },

  hazards: {
    thornRadius: 10,
    spikeBounce: -300,          // vy when bounced off spikes
    spikeKnock: 190,            // vx toward the nearer end of the spike strip
    spikeKnockCarry: 0.8,       // seconds the knock keeps its momentum
    padBounce: -480,            // up-bouncer launch speed
    ringBoost: 520,             // down-ring sets fall speed to at least this
    ringDiveMult: 1.3,          // diving through a ring: dive speed x this (speed burst)
    carrotHeal: 1,
    rock: {
      size: [16, 26],
      gravity: 900,
      maxSpeed: 430,            // faster than baseline fall: dive or dodge
      count: [3, 5],
      stagger: 0.28,            // seconds between rocks
      warn: 0.6,                // warning before the first rock
      triggerCols: 4,           // fires when you pass beneath within this many columns
      triggerRows: 22,          // ...and within this many rows below it
    },
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
    hitShake: 8,
    shakeDecay: 30,       // shake units lost per second
    flashDecay: 2.5,      // flash alpha lost per second
    textLife: 0.9,
    hapticPerfect: 18,    // ms
    hapticChain: [25, 40, 25],
    hapticHit: 40,
  },

  // Every bonus is multiplied by the combo multiplier.
  score: {
    perMeter: 10,             // base points per meter of new depth
    perfect: 50,
    perfectMult: 0.25,        // multiplier gained per perfect release
    chainMult: 0.5,           // multiplier gained per chain, x (chain length - 1)
    chainLengthBonus: 50,     // extra points per move in the chain
    firstChainBonus: 500,     // first use of each chain per run
    closeCall: 100,
    closeCallMult: 0.1,
    closeCallMargin: 14,      // a hazard within this many units counts as a close call
    destroy: 25,              // per ledge broken (Drill, Parachute Snap)
    cleanEscape: 200,         // every rock of a rockfall missed you
    speedBurst: 50,
    carrot: 100,
    maxMult: 8,
    multHold: 4,              // seconds after the last boost before the multiplier decays
    multDecay: 0.5,           // multiplier lost per second once decaying
    storageKey: 'rabbit-hole.best',
  },

  ui: {
    hintSeconds: 4,       // how long touch-zone hints show after starting
    retryDelay: 0.5,      // seconds before a tap on the game-over screen restarts
    popupLife: 1.4,       // seconds a score popup stays under the score
  },
};
