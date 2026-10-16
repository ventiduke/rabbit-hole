# Rabbit Hole (working title)

A mobile-first, endless falling game. You are a rabbit tumbling down an infinite underground shaft. Steer, glide, dive, wall-jump and burrow your way past hazards, and **chain moves together** for special effects and big points. Survive as long as possible.

Built as a static web game, deployed via **GitHub Pages**, played in a phone browser.

> This README is both the project overview and the handoff spec for build sessions. Sections marked **[DECIDED]** are settled design; **[PROPOSED]** are starting points to tune or replace; **[OPEN]** need a decision.

## Status & running locally

- **Done:** M0 (scaffold, loop, FPS), M1 (falling, steering, ledges, camera), M2 (the four moves), M3 (Drill, Parachute Snap, Soft Landing, Wall Burrow), M4 (endless chunk-based level, hazards, health) and M5 (scoring, combo multiplier, high score, start and game-over screens).
- **Tunnel redesign (after the M5 playtest):** the open shaft with thin ledges became tile terrain with tunnels that keep turning left and right, soft dirt you can tunnel through, a ground jump, and wall slides where letting go drops you and jumping kicks off. See §5–§7. Tested in a mobile-emulated browser and a headless sim (including a pathfinding bot), but not yet on a real phone.
- **Run locally:** `python3 -m http.server` in the repo root, then open `http://localhost:8000`. ES modules don't load from `file://`.
- **Deploy:** Settings → Pages → *Deploy from a branch* → `main` / `(root)`. `.nojekyll` is included so files are served as-is.
- **Debug:** `?seed=123` replays a run with that seed. **R** restarts the run. `?chunk=secretWall` repeats a single chunk, which is handy when authoring chunks. `?debug` shows FPS, seed, tier and move state. `window.__game` exposes the player, level, camera and score in the console.

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

**Decisions made while building M2:**
- **Per-move timers** for now (§11 is still open). A **timing bar** above the rabbit shows hold progress, with the perfect window drawn in gold.
- **Cancelling:** starting a move while another is held ends the current one, graded like a release. So cancelling inside the perfect window counts as perfect. On keyboard, holding ↓ and then pressing Space in the gold zone gives Parachute Snap.
- **Perfect release:** gives a flash, particles, a "PERFECT" label, a haptic buzz and 0.6 s of momentum carry (sideways speed from Ears, fall speed from Dive). The chain link window also grows from 0.2 s to 0.35 s.
- **Timeout:** shows "TOO LONG", followed by 0.45 s of recovery with no moves and no steering.
- **Wall drag (wall slide):** starts automatically when steering into any wall in the air. **Letting go drops you straight down; jumping (swipe up / ↑) kicks you off the wall.** The jump is graded like a release, so jumping in the gold zone gives a stronger kick. A wall jump keeps its sideways momentum until it reaches a wall or the ground ("jump flight").
- **Ground jump:** swipe up (hold the finger for full height) or ↑. It reaches about 3.5 tiles, and releasing early gives a short hop. Coyote time (0.09 s after walking off an edge) and jump buffering (0.12 s before landing) make it forgiving. It isn't a lifecycle move (no perfect window).
- **Burrow** picks its direction from context:
  - **Pushing into soft dirt** (wall sliding, or steering into it on the ground): **tunnel sideways**.
  - **Standing on soft dirt or a ledge:** dig down.
  - **Standing on hard dirt or rock:** "TOO HARD".
  - In both burrows, the perfect window opens right after you break into open space ("clean exit": a speed burst). Letting go inside the ground leaves you in the hole you dug.
- **Dive into the ground:** still holding Dive when you land turns into Burrow, which makes it a Drill.
- **Hard landings:** impacts above `hardLandingSpeed` show "OOF" and shake the screen. Damage comes in M4.

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

**How the M3 chains work (as built):**
- **Linking:** a move links to the previous one if it starts within the link window after a release, or at any point during a wall jump's flight. The `CHAINS` table in `src/chains.js` lists each chain's sequence, its perfect-release requirement and its context flag. The first match wins. Effects live in `CHAIN_EFFECTS`.
- **Wall Burrow:** after a wall jump, dive (or swipe down) into the *opposite* wall. The rabbit tunnels sideways through it, through hard dirt too; only rock stops it. A perfect release on breaking out gives a big burst. Outside this chain, only soft dirt can be tunnelled.
- **Drill:** punches down through tile rows, hard dirt included: 1 row + 1 per 120 u/s of impact speed above terminal velocity, up to 6. Rock stops it, a pad bounces it, and its own landing never hurts.
- **Parachute Snap:** stops the fall instantly. Its shockwave breaks **fragile ledges** (cracked, paler) within 320 u below and 6 columns either side.
- **Soft Landing:** same sequence as Parachute Snap, but chosen when ground is within 160 u below. It cuts the fall to a safe speed, so the landing isn't hard.
- The HUD shows **CHAIN xN** while a chain is live, and the first use of each chain in a run shows **NEW!**. Points come in M5.

---

## 4. Goal, scoring, health [DECIDED: goal / PROPOSED: specifics]

**Goal:** survive as long as possible in an infinite level that goes down and/or sideways, collecting points along the way. Difficulty increases with distance traveled.

**Scoring (proposed):**
- Base points for distance traveled.
- **Combo multiplier:** grows with chain length and perfect releases; resets on taking a hit or a bad landing.
- Bonus points: named chains (extra on first use per run), close calls (skimming hazards), hazard destruction, clean escapes from rockfalls.

**Scoring as built (M5):** all numbers are in `config.score`, and every bonus is multiplied by the combo multiplier.
- **Distance:** 10 points per meter of new depth.
- **Multiplier:** +0.25 per perfect release, +0.5 × (chain length − 1) per named chain and +0.1 per close call, capped at x8. After 4 s without a boost it decays at 0.5/s back toward x1, and the HUD bar under the multiplier shows the time left. Any hit (including a hard landing) resets it to x1.
- **Bonuses:**
  - Perfect release: 50.
  - Chain: its `points` (in the `CHAINS` table, 200–400) + 50 per move in the chain, plus 500 the first time you use that chain in a run.
  - Close call (a thorn or rock within 14 u that misses you) and **SKIM** (passing just above spikes without landing): 100.
  - SMASH: 25 per ledge broken by Drill or Parachute Snap.
  - CLEAN ESCAPE: 200 when every rock of a rockfall falls past you without a hit.
  - Speed burst: 50. Carrot: 100.
- **High score:** best score and best depth are saved in `localStorage`. If storage is blocked they just don't persist.
- **Screens:** the start screen shows your best. The game-over screen shows score, NEW BEST, and the run's depth, max combo, chains, perfects and close calls. Tap after 0.5 s to dig again, or press **R** at any time.
- **HUD:** hearts, score with the multiplier and its bar, depth, recent bonuses and the chain counter. FPS moved behind `?debug`.

**Health (proposed):** 3 hits, short invulnerability after each hit. Rare pickup (carrot) restores 1.

**As built (M4):**
- **Health:** 3 HP and 1.3 s of blinking invulnerability after each hit. A hit also knocks you back, ends the current move and cancels momentum carry.
- **Hard landings:** impacts above `hardLandingSpeed` (560 u/s) cost 1 HP. Baseline falling (340) is always safe. Releasing a Dive too late hurts unless you Drill (keep holding into the ledge) or Soft Landing.
- **Game over:** at 0 HP you see a minimal "Knocked out" screen with your depth. Tap to retry. The full game-over and high-score screens come in M5.

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

**As built (tile terrain):** the world is a grid of 18-unit tiles, 20 across the screen (`src/level/tiles.js`).

| Tile | Behaviour |
|---|---|
| Dirt (brown, grass on top) | Solid. Only Drill or Wall Burrow get through it. |
| **Soft dirt** (tan, speckled) | Solid. Dig down into it or tunnel sideways through it. Used for shortcuts, secret pockets and walls you can punch through. |
| Rock (grey) | Unbreakable. The two border columns are rock. |
| Ledge (thin slab) | One-way: land on it, jump up through it, dig down through it. |
| Fragile ledge (pale, cracked) | One-way. Broken by Parachute Snap, rocks or digging. |
| Spikes | Solid. Landing on top costs 1 HP and throws you toward the nearer end of the strip. Drill goes through safely. |
| Pad (pink mushroom) | Solid. Bounces you up with no landing damage. |
| Loose rocks (grey, cracked) | A rockfall source: when you pass beneath it (within 4 columns), it crumbles and drops a staggered burst of rocks, with a blinking "▼ ! ▼" warning. Rocks smash fragile ledges and shatter on anything else. |

- **Entities:** thorn balls (still, or patrolling their row; faster deeper down), down-rings (diving through one is a **SPEED BURST**) and carrots (+1 HP, rare).
- **Safety net:** if the rabbit ever ends up inside a wall, it's popped out to the nearest free spot. Clipping a tile corner by up to 6 u slides you past it instead of catching.

---

## 6. Controls (mobile-first) [PROPOSED]

Portrait orientation, two thumbs. Moves are context-sensitive so there are only a few gestures:

| Input | Result |
|---|---|
| Hold left / right half of screen | Steer / run |
| Swipe up (hold for full height) | Jump; on a wall, wall jump |
| Hold both halves | Ears (lift one thumb to steer while gliding) |
| Swipe down + hold | **In air:** Dive. **On the ground:** dig down. **Pushing into soft dirt:** tunnel sideways |
| Steer into a wall in the air | Wall slide (automatic) |
| Lift the steering finger while sliding | Drop straight down |
| Lift finger(s) | Release the current move (perfect timing = lift in window) |

As built: a swipe is 24 CSS px within 0.22 s (`config.input`). A finger that swipes down holds Dive/Burrow, and a finger that swipes up holds the jump; either way it stops steering until it's lifted. Ears stay open while any steering finger is still down. (The earlier "swipe sideways to wall jump" gesture was removed.)

Desktop fallback for testing: arrow keys / A-D to steer, W/Up = jump, Space = ears, S/Down = dive/burrow.

Feedback for perfect releases: screen flash, particle burst, sound sting, and haptic buzz (`navigator.vibrate` where supported).

---

## 7. Level generation [PROPOSED]

- **Hand-authored chunks stitched procedurally.** Each chunk is a small data-defined section (shaft, ledge field, narrow wall-jump chimney, sideways tunnel, rockfall corridor, bouncer gauntlet…).
- Each chunk has: entry/exit edges (so chunks connect), a difficulty rating, and hazard spawn slots.
- A **difficulty curve** keyed to distance controls which chunks can appear, hazard density, and speed pressure.
- Every chunk must be survivable from its entry with the baseline moves; harder chunks reward chains rather than require pixel-perfect play early on.
- Chunks are recycled (spawn ahead, despawn behind) to keep memory flat for an infinite run.
- Seeded RNG so a run can be replayed for debugging.

**As built (tunnel redesign):**
- **Chunks as ASCII maps** in `src/level/chunks.js`: 19 chunks across tiers 0–3, each row 18 characters (the shaft between the rock borders). The legend is at the top of the file: `#` dirt, `S` soft, `=` ledge, `~` fragile, `^` spikes, `P` pad, `K` loose rocks, `o`/`O` thorn (still/patrolling), `v` ring, `c`/`?` carrot/thorn slots, and `!`/`%` spikes/fragile by chance.
- **Connectors:** the top row's openings are the entry and the bottom row's openings are the exit. Between two chunks the generator carves a short drop out of the exit, then a 3-row sideways tunnel spanning both openings. So chunks never need to line up, and the route keeps turning left and right. Long connector runs can get a patrolling thorn.
- **Authoring rules:**
  - Passages must be at least 2 tiles wide and 2 tall (the rabbit is 22×26).
  - Rooms you're meant to jump in need about 5 rows of height.
  - Spikes need room to steer around.
  - Chunks are mirrored at random, and the same chunk never appears twice in a row.
- **Difficulty:** `d` goes from 0 to 1 by 1500 m. Tiers unlock at 0, 100, 300 and 650 m, and the newest unlocked tier is weighted 2.5× more likely. As `d` rises, so do chance-tile and slot odds, thorn and rock speed, and connector-run thorns, while the straight drop before each connector shrinks from 3 rows to 1.
- **Randomness:** layout uses the seeded RNG. Runtime randomness, such as rocks, uses a second RNG, so player behaviour never changes the layout.
- **Recycling:** rows and entities more than 300 u above the screen are dropped.
- **Testing:**
  - A flood-fill check (with room for the rabbit) confirms 200 generated levels each connect for 2,400 rows.
  - A pathfinding bot that walks, jumps, digs and tunnels reaches about 1,000–1,450 m in 5–6 minutes on every seed tried. Its remaining stalls are spots that need human air-control or jump timing (bouncing off `padPit`'s pad, jumping spike strips).

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
- Ledges were solid on all sides in M1 (now one-way tiles; see §5). The rabbit runs faster on the ground than it drifts in the air (`groundSteerSpeed`).
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
