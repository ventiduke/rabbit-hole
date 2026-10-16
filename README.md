# Rabbit Hole (working title)

A mobile-first, endless falling game. You are a rabbit tumbling down an infinite underground shaft. Steer, glide, dive, wall-jump and burrow your way past hazards, and **chain moves together** for special effects and big points. Survive as long as possible.

Built as a static web game, deployed via **GitHub Pages**, played in a phone browser.

> This README is both the project overview and the handoff spec for build sessions. Sections marked **[DECIDED]** are settled design; **[PROPOSED]** are starting points to tune or replace; **[OPEN]** need a decision.

## Status & running locally

- **Done:** M0 (scaffold, fixed-timestep loop, FPS counter) and M1 (falling, steering, walls, ledges, look-ahead camera, touch + keyboard). Not yet checked on a real phone.
- **Run locally:** `python3 -m http.server` in the repo root, then open `http://localhost:8000`. ES modules don't load from `file://`.
- **Deploy:** Settings → Pages → *Deploy from a branch* → `main` / `(root)`. `.nojekyll` is included so files are served as-is.
- **Debug:** `?seed=123` replays a run with that seed. **R** restarts the run.

---

## 1. Core pillars

1. **Movement is the game.** Four simple moves that each change one thing (speed, control, surface interaction).
2. **Chains are everything.** Moves combine; specific sequences produce special effects. Players *must* chain to survive deeper.
3. **Timing rewards mastery.** Every move has a limited duration and a "perfect" release window that gives a bonus and carries momentum into the next move.
4. **Endless, escalating survival.** Infinite level, difficulty rises with distance, score accumulates along the way.
5. **Feels great under thumbs.** Portrait, two-thumb touch controls, juicy feedback.

---

## 2. Player moves [DECIDED concept / PROPOSED numbers]

Baseline: while falling, the rabbit can drift left/right, but slowly.

| Move | Trigger context | Effect | Limit | Perfect release |
|---|---|---|---|---|
| **Ears (slow)** | In air | Ears pop out to the sides: fall speed drops sharply, side-to-side steering becomes much faster | Max hold time | Release inside window → bonus + momentum carry |
| **Dive** | In air | Head-down pencil form: fall speed increases, **no** side-to-side control | Max hold time | Release inside window → bonus + speed carry |
| **Wall drag + jump** | Touching a side wall | Feet drag on the wall, slowing the fall; jump launches toward the opposite side | Max drag time | Jump inside window → stronger, faster launch |
| **Burrow** | On a ledge/ground (or wall, via chains) | Dig straight down; may break through to below | Max dig time / depth | Release inside window → bonus, cleaner exit |

### Move lifecycle (all moves)
Every move follows the same state model so chains are easy to build:

```
START → HOLD (limited duration) → RELEASE
                                   ├─ inside perfect window → PERFECT: bonus + cancel straight into next move with momentum
                                   ├─ normal release       → normal exit
                                   └─ timed out            → forced exit + short recovery (can't act)
```

Perfect releases function like fighting-game cancel windows: they are the main way a chain continues cleanly.

---

## 3. Chains [DECIDED: chaining is core / PROPOSED: specific chains]

A **chain** is a sequence of moves where each transition happens inside a perfect window (or within a short link window, see tuning). Specific sequences trigger named effects.

**Defined by design:**
- **Wall burrow:** Wall drag → jump sideways → Burrow into the opposite wall = burrow *sideways* through that wall.

**Proposed starting set:**

| Name | Sequence | Effect |
|---|---|---|
| Parachute Snap | Dive → Ears (perfect) | Near-instant stop in mid-air; shockwave cracks fragile ledges below |
| Drill | Dive → Burrow | Punch through multiple layers, depth scales with dive speed |
| Spear | Wall jump → Dive | Diagonal dive that breaks side walls / destroys hazards |
| Ricochet | Wall jump → Wall jump (perfect) | Speed builds with each consecutive wall jump in narrow shafts |
| Ear Catch | Ears → Wall drag | Longer, controlled wall slide (possible brief wall run) |
| Pop-Up | Burrow exit → Ears | Pop out and float, gain a little height |
| Soft Landing | Dive → Ears (perfect) just before ground | Converts a dangerous landing into a safe one |

Rules of thumb:
- **Momentum carries.** Speed entering a move affects what comes out of it.
- Each named chain gets a first-time-per-run bonus to encourage experimentation.
- Chains are data-driven (see §9) so new ones can be added without touching core physics.

---

## 4. Goal, scoring, health [DECIDED: goal / PROPOSED: specifics]

**Goal:** survive as long as possible in an infinite level that goes down and/or sideways, collecting points along the way. Difficulty increases with distance traveled.

**Scoring (proposed):**
- Base points for distance traveled.
- **Combo multiplier:** grows with chain length and perfect releases; resets on taking a hit or a bad landing.
- Bonus points: named chains (extra on first use per run), close calls (skimming hazards), hazard destruction, clean escapes from rockfalls.

**Health (proposed):** 3 hits, short invulnerability after each hit. Rare pickup (carrot) restores 1.

---

## 5. Hazards & level elements [DECIDED list / PROPOSED interactions]

| Element | Behavior | Combo interaction (proposed) |
|---|---|---|
| Ledges / platforms | Land on them; burrow through them | Fragile variants break under Drill / Parachute Snap shockwave |
| Spiked ledges | Damage on contact | Perfect Ears skim = close-call bonus |
| Harmful objects | Damage on contact | Spear can destroy some |
| Rockfalls (side walls) | Player can trigger them; rocks fall | Outrun with dive, dodge, or use falling rocks to break ledges below |
| Hard landings | Hitting ground too fast without the right combo hurts | Soft Landing or Drill convert impact into a safe outcome |
| Bouncers | Bounce the player | Down-bouncers can send you down faster (into a dive = speed burst); up-bouncers give breathing room |
| Sideways sections | Level goes horizontal | Wall burrow, Ricochet, hidden tunnels behind walls (shortcuts / bonus rooms) |

**Landing damage (proposed):** impact damage scales with vertical speed at contact; above a threshold it hurts unless the landing is part of a protective chain.

---

## 6. Controls (mobile-first) [PROPOSED]

Portrait orientation, two thumbs. Moves are context-sensitive so there are only a few gestures:

| Input | Result |
|---|---|
| Hold left / right half of screen | Steer |
| Hold both halves | Ears (lift one thumb to steer while gliding) |
| Swipe down + hold | **In air:** Dive. **On ledge or wall:** Burrow |
| Steer into a wall on contact | Wall drag (automatic) |
| Swipe away from wall, or lift | Wall jump |
| Lift finger(s) | Release the current move (perfect timing = lift in window) |

Desktop fallback for testing: arrow keys / A-D to steer, Space = ears, S/Down = dive/burrow, W/Up = wall jump.

Feedback for perfect releases: screen flash, particle burst, sound sting, and haptic buzz (`navigator.vibrate` where supported).

---

## 7. Level generation [PROPOSED]

- **Hand-authored chunks stitched procedurally.** Each chunk is a small data-defined section (shaft, ledge field, narrow wall-jump chimney, sideways tunnel, rockfall corridor, bouncer gauntlet…).
- Each chunk has: entry/exit edges (so chunks connect), a difficulty rating, and hazard spawn slots.
- A **difficulty curve** keyed to distance controls which chunks can appear, hazard density, and speed pressure.
- Every chunk must be survivable from its entry with the baseline moves; harder chunks reward chains rather than require pixel-perfect play early on.
- Chunks are recycled (spawn ahead, despawn behind) to keep memory flat for an infinite run.
- Seeded RNG so a run can be replayed for debugging.

---

## 8. Camera & presentation

- Portrait, the rabbit sits in the **upper third** of the screen so the player sees what's coming.
- Camera pulls further ahead as fall speed increases (critical during Dive).
- Smooth follow on horizontal sections.
- Art: start with simple shapes/placeholder sprites; style decision is [OPEN].

---

## 9. Technical plan [PROPOSED]

**Stack:** plain JavaScript (ES modules) + HTML5 Canvas 2D. No build step, so GitHub Pages serves the repo directly. (Swap to Phaser via CDN only if custom code becomes a burden. [OPEN])

**Key architecture choices:**
- **Fixed-timestep game loop** (e.g., 60 updates/sec, render interpolated) for consistent physics and timing windows across devices.
- **Player state machine** following the move lifecycle in §2.
- **Chain detector:** a short history buffer of recent move transitions (move, release quality, timestamp) matched against a data table of chain definitions.
- **All tuning values in one config file** (`src/config.js`) for fast iteration.
- **Chunks as data** (`src/levels/chunks.js`).
- Simple AABB collision for player vs. world/hazards.

**Decisions made while building M0–M1:**
- World units: the shaft is always 360 units wide and scaled to the screen width, so every phone sees the same width. Height varies with aspect ratio. On desktop the play area is letterboxed to portrait (`world.maxAspect`).
- `src/rng.js` holds the seeded RNG and `src/render.js` the world drawing (these files weren't in the original structure).
- M1 ledges come from a simple seeded row generator (`src/level/generator.js`). The data-driven chunk system replaces it in M4.
- Ledges are solid on all sides. The rabbit lands on them and runs faster on the ground than it drifts in the air (`groundSteerSpeed`).
- A "Tap to drop" title screen keeps the run from starting before the player is ready.
- Holding both halves of the screen cancels steering for now. It becomes Ears in M2.

**Proposed structure:**

```
/
├── index.html
├── style.css
├── README.md
└── src/
    ├── main.js          # boot, loop, scene switching
    ├── config.js        # all tunable numbers
    ├── input.js         # touch zones, swipes, keyboard fallback
    ├── player.js        # physics + move state machine
    ├── chains.js        # chain history + detection + effects
    ├── camera.js
    ├── level/
    │   ├── generator.js # chunk stitching, difficulty curve, seeded RNG
    │   └── chunks.js    # chunk definitions
    ├── entities/        # ledges, spikes, rockfalls, bouncers, pickups
    ├── score.js         # distance, multiplier, bonuses, high score (localStorage)
    ├── fx.js            # particles, flashes, haptics
    └── ui.js            # HUD, start/game-over screens
```

### Tuning starting points (all in `config.js`)

| Value | Starting guess |
|---|---|
| Baseline fall speed / gravity | moderate, capped terminal velocity |
| Baseline steer speed | slow |
| Ears: fall speed multiplier / steer multiplier | ~0.3× fall, ~2.5× steer |
| Dive: fall speed multiplier | ~2.5×, steer disabled |
| Wall drag: fall speed multiplier | ~0.4× |
| Max hold durations | ~0.8–1.5 s per move |
| Perfect window | ~100–150 ms, placed late in the hold |
| Chain link window (non-perfect transitions) | ~200 ms |
| Hard-landing damage threshold | tune by feel |

---

## 10. Milestones

Each milestone should end with a playable build on GitHub Pages, tested on a real phone.

**M0: Repo + scaffold**
- `index.html`, canvas filling a portrait viewport, fixed-timestep loop, Pages deployment working.
- ✅ Done when: a blank scene with an FPS counter loads on a phone via the Pages URL.

**M1: Falling + steering + feel**
- Rabbit (placeholder rect) falls, slow steering, side walls, static ledges, camera with look-ahead.
- Touch zones + keyboard fallback.
- ✅ Done when: falling and steering feel responsive on a phone.

**M2: The four moves**
- Ears, Dive, Wall drag/jump, Burrow with hold limits, perfect windows, and timeout recovery.
- Visual + haptic feedback for perfect releases.
- ✅ Done when: each move works alone and perfect releases are clearly felt.

**M3: Chains**
- Chain history buffer + data-driven chain table.
- Implement Wall burrow (required), Parachute Snap, Drill, Soft Landing first.
- Momentum carry between moves.
- ✅ Done when: the four chains trigger reliably and feel distinct.

**M4: Endless level + hazards**
- Chunk generator, recycling, seeded RNG, difficulty curve.
- Spiked ledges, harmful objects, rockfalls, bouncers, hard-landing damage, health.
- ✅ Done when: a run can go indefinitely and gets harder with distance.

**M5: Scoring + game loop**
- Distance score, combo multiplier, chain bonuses, close calls, local high score.
- Start screen, HUD, game over, instant restart.
- ✅ Done when: a full run → death → restart loop feels complete.

**M6: Polish**
- Remaining chains (Spear, Ricochet, Ear Catch, Pop-Up), sideways sections, hidden tunnels.
- Art pass, sound, particles, screen shake.
- Performance check on mid-range phones.

---

## 11. Open questions

- [OPEN] Per-move timers vs. one shared stamina meter refilled by perfect releases?
- [OPEN] How often does the level turn sideways, and is that tied to difficulty?
- [OPEN] Art style and final title.
- [OPEN] Vanilla Canvas vs. Phaser (default: vanilla).
- [OPEN] Any meta-progression (unlockable skins, chain codex) or pure arcade?

---

## 12. Notes for build sessions

- Work milestone by milestone; don't start the next until the current one is playable on a phone.
- Keep every tunable number in `config.js`; never hard-code feel values in logic.
- Add new chains and chunks as data, not special-case code.
- Commit at each working state; keep `main` deployable since Pages serves it.
- When a design choice isn't covered here, pick the simplest option, note it in this README under the relevant section, and keep moving.
