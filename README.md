# Rabbit Hole (working title)

A mobile-first, endless falling game. You are a rabbit tumbling down an infinite underground shaft. Steer, glide, dive, wall-jump and burrow your way past hazards, and **chain moves together** for special effects and big points. Survive as long as possible.

Built as a static web game, deployed via **GitHub Pages**, played in a phone browser.

> This README is both the project overview and the handoff spec for build sessions. Sections marked **[DECIDED]** are settled design; **[PROPOSED]** are starting points to tune or replace; **[OPEN]** need a decision.

## Status & running locally

- **Done:** M0 (scaffold, loop, FPS), M1 (falling, steering, ledges, camera), M2 (the four moves), M3 (Drill, Parachute Snap, Soft Landing, Wall Burrow), M4 (endless chunk-based level, hazards, health) and M5 (scoring, combo multiplier, high score, start and game-over screens).
- **Open-cavern landscape redesign (after the tunnel playtest):** the game is now landscape. It's a wide, open cavern with long stretches of falling, broken up by long sloped ledges that catch you and slide you left or right, then launch you off their end. Occasional blocks (pillars, overhangs, soft walls) give the wall and burrow moves something to work with. The tile tunnels were too cramped. See §5–§8.
- **Practice mode:** the title screen now has **Endless** and **Practice**. Practice is a menu of 11 drills, one per move or combo: Perfect Dive, Wall Jump, Tunnel, Drill, Soft Landing, Parachute Snap, Pop-Up, Ear Catch, Ricochet, Spear and Wall Burrow.
  - Each drill is a tiny hand-built level with a one-line how-to and a gold-flag goal.
  - A success, a hit, a miss or running out of time shows **NICE!** or **TRY AGAIN** with the reason, then the drill **resets on its own**.
  - The HUD shows successes / attempts and your streak. Cleared drills get a ✓ in the menu, remembered in `localStorage`.
  - Drills are data in `src/practice.js` (`build` lays out the level, `check` judges it), so adding one is a single entry. A headless check confirms every drill can be solved and auto-resets.
  - Keyboard: Enter for Endless, P for Practice, arrows + Enter in the menu, Esc to go back, R to restart a drill.
- **M6 (polish):**
  - Four more chains: Ricochet, Spear, Ear Catch and Pop-Up.
  - Synthesised sound, with a mute button and M key.
  - Depth biomes with name banners.
  - Gems and secret rooms.
  - A rabbit art pass, a vignette, and a performance pass: 60 fps at 6× CPU throttle in headless Chromium.
  - From the playtest: **dive is now a single swipe**, not a hold.
- **Playtest follow-ups:**
  - Wall slides are sticky.
  - The cavern's width now varies: thin shafts, and wide stretches that run past the screen edge with a panning camera (§5, §7).
- *Previous iteration, tunnel redesign:* the open shaft with thin ledges became tile terrain with tunnels that keep turning left and right, soft dirt you can tunnel through, a ground jump, and wall slides where letting go drops you and jumping kicks off. See §5–§7. Tested in a mobile-emulated browser and a headless sim (including a pathfinding bot), but not yet on a real phone.
- **Run locally:** `python3 -m http.server` in the repo root, then open `http://localhost:8000`. ES modules don't load from `file://`.
- **Deploy:** Settings → Pages → *Deploy from a branch* → `main` / `(root)`. `.nojekyll` is included so files are served as-is.
- **Debug:** `?seed=123` replays a run with that seed. **R** restarts the run. `?chunk=secretWall` repeats a single chunk, which is handy when authoring chunks. `?band=narrow` (or `wide` / `normal`) forces every cavern band to that width. `?debug` shows FPS, seed, tier and move state. `window.__game` exposes the player, level, camera and score in the console.

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

**Swipe moves (playtest follow-up):**
- **Dive** starts with a single swipe down; there's nothing to hold. A **tap** ends it early, graded for the gold zone. Otherwise it simply runs out with no "TOO LONG" stumble.
- **Drill:** swiping down again mid-dive arms one ("DRILL READY"), so you drill when you land. Without it, hitting the ground mid-dive is a hard landing.
- **Burrows** (dig, tunnel) are single swipes too. They run on their own, and a tap just as you break out gives the clean-exit burst. Standing on soft dirt for 1.5 s shows "SWIPE ↓ TO DIG".
- On keyboard, X (or Shift) is the tap.

**Decisions made while building M2:**
- **Per-move timers** for now (§11 is still open). A **timing bar** above the rabbit shows hold progress, with the perfect window drawn in gold.
- **Ears are a toggle** (playtest follow-up): tap both halves together, or press Space, to open them. Steer normally while gliding, and tap both again to close them. The two presses must land within 0.18 s of each other, so overlapping thumbs while switching steering direction don't trigger it. If you leave them open past 1.8 s, they close with a short recovery.
- **Cancelling:** starting a move while another is held ends the current one, graded like a release. So cancelling inside the perfect window counts as perfect. On keyboard, holding ↓ and then pressing Space in the gold zone gives Parachute Snap.
- **Perfect release:** gives a flash, particles, a "PERFECT" label, a haptic buzz and 0.6 s of momentum carry (sideways speed from Ears, fall speed from Dive). The chain link window also grows from 0.2 s to 0.35 s.
- **Timeout:** shows "TOO LONG", followed by 0.45 s of recovery with no moves and no steering.
- **Wall drag (wall slide):** starts automatically when steering into any wall in the air, and it's **sticky**: you keep sliding with no input. **Jumping (swipe up / ↑, anywhere on screen) kicks you off the wall. A tap anywhere, or steering away for a quarter-second, drops you off.** The delay is there so the finger that starts a swipe-up on the far half doesn't drop you before the jump registers. If it runs out (1.8 s) you slip off with a short recovery. The jump is graded like a release, so jumping in the gold zone gives a stronger kick. A wall jump keeps its sideways momentum until it reaches a wall or the ground ("jump flight").
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
- **M6 chains:**
  - **Ricochet** (wall jump → grab another wall during the flight): each one in a row adds 18% to the next wall jump, up to 4. Resets on landing.
  - **Spear** (wall jump → dive during the flight): a diagonal dive that keeps its sideways speed, **skewers thorns** (+150, "SKEWER"), and smashes through soft blocks and fragile ledges. Dive into the far wall and it still becomes a Wall Burrow.
  - **Ear Catch** (ears → wall slide): a much slower and longer slide (55 u/s, 3 s).
  - **Pop-Up** (burrow → ears): pops you up out of the hole and floats you.
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

**As built (open cavern, `src/level/world.js`):**
- **Ledges** are one-way slabs that can be sloped. Land on one and it pulls you downhill (`slideAccel`, with low friction), then launches you off its end along the slope. Landing on a slope turns part of the fall into sideways speed and softens the impact. You can run uphill against it, jump up through ledges from below, and dig down through them.
  - *Fragile* (pale, cracked): broken by Parachute Snap, rocks or digging.
  - *Spikes*: landing on top costs 1 HP and throws you off downhill, or toward the nearer end. Drill goes through safely.
  - *Pad* (pink): bounces you up with no landing damage.
- **Blocks** are solid rectangles.
  - *Dirt*: only Drill or Wall Burrow get through.
  - *Soft* (tan, dashed outline): dig down or tunnel sideways through it, so it's a wall you can punch through.
  - *Rock*: unbreakable.
  - Burrowing cuts a slot through a block, and the pieces either side stay.
- **Cavern walls** follow a width profile that changes with depth. You can wall slide on them or on block sides. Width comes in bands, with 380 u slanted transitions between them (`level.bands`):
  - **Normal:** the full screen, about 950 u.
  - **Narrow:** a 380–540 u shaft with earth on both sides. Only sections that fit get placed, and some are narrow-only (zigzag, soft plug, shaft thorns).
  - **Wide:** extends 500–900 u past one screen edge, or half past each. The camera pans to follow you and stops where the wall comes into view, so you can see there's more out there. The normal-width section sits somewhere in the band, and the off-screen side space gets a ledge sloping back toward the middle with a carrot or ring on it, sometimes guarded by a thorn.
  - After a normal band, the next is normal, narrow or wide by weight. Narrow and wide always return to normal, and the first 2400 u are always normal.
- **Rockfalls** are loose rocks hanging under an overhang. Pass beneath and they drop in a staggered burst with a blinking "▼ ! ▼" warning. They smash fragile ledges and shatter on anything else.
- **Gems** (blue): +300 × combo. They're in **secret rooms**: a soft-walled box you dig into from the roof, tunnel into through a wall, or dig out of through the floor. They also appear off-screen in wide caverns.
- **Entities:** thorn balls (still or patrolling, faster deeper down), down-rings (diving through one is a **SPEED BURST**) and carrots (+1 HP, rare).
- **Safety nets:** you're popped out if you ever end up inside a block, and clipping a block corner by up to 6 u slides you past it.

---

## 6. Controls (mobile-first) [PROPOSED]

**Landscape** orientation (as built), two thumbs. Moves are context-sensitive so there are only a few gestures:

| Input | Result |
|---|---|
| Hold left / right half of screen | Steer / run |
| Swipe up (hold for full height) | Jump; on a wall, wall jump |
| Tap both halves together | Ears on / off. While gliding, steer normally with one thumb. Closing them in the gold zone is a perfect release |
| Swipe down + hold | **In air:** Dive. **On the ground:** dig down. **Pushing into soft dirt:** tunnel sideways |
| Steer into a wall in the air | Wall slide (automatic) |
| Tap (or steer away) while sliding | Drop off the wall (the slide sticks without holding) |
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

**As built (open cavern):**
- **Sections** are hand-authored data in `src/level/chunks.js`: 18 sections across tiers 0–3. Coordinates use a fraction of the cavern width for x and units for y.
  - Helpers: `ledge(x1, y1, x2, y2, {kind | spikes | fragile})`, `block(x, y, w, h, kind)`, `thorn`, `ring`, `rockfall`, and `slot` (an optional thorn or carrot).
  - Examples: deflect (one long slope), funnel, cascade (zig-zag slopes), drift (just rings), soft shelf, spike landing, pad pop, pillars, thorn gate, fragile stack, overhang (rockfall), spike pit, thorn field, soft wall, gauntlet, chute and rock slide.
- **Gaps:** sections are separated by **long open falls**, 520–820 u at the surface shrinking to 300–520 u at full difficulty (`difficulty.gap`). A gap sometimes holds a drifting thorn (more likely deeper) or a down-ring. Sections are mirrored at random and never repeat back to back.
- **Difficulty:** `d` goes from 0 to 1 by 2500 m. Tiers unlock at 0, 150, 450 and 1000 m, and the newest unlocked tier is weighted 2.5× more likely. Chance-based spikes and fragile ledges, slot fills, thorn speed and rock speed all scale with `d`.
- **Randomness:** layout uses the seeded RNG; runtime randomness (rocks) uses a second one. Everything more than 400 u above the screen is recycled.
- **Testing:**
  - 19 scripted physics scenarios pass: slope slide and launch, landing on a slope, jump-through, wall drop vs jump, dig, too hard, tunnel from the ground and from a wall slide, Drill, Wall Burrow, spikes, pad, hard landing and rockfall.
  - A random-input bot spends about 75–80% of its time airborne and reaches about 2,800–3,100 m in 5 minutes. With damage on, it dies at 400–1,100 m.

---

## 8. Camera & presentation

- Portrait, the rabbit sits in the **upper third** of the screen so the player sees what's coming.
- *As built (M6 art pass):*
  - **Depth biomes** change the cavern's colours every 700 m, cycling Topsoil → Slate Caves → Mossy Hollows → Ember Depths, with a name banner as you enter each one (`config.art`).
  - The rabbit has a tail, nose, outline and belly shading.
  - The edge vignette is a CSS overlay (`#stage::after`). Drawing it on the canvas every frame was the single biggest cost on slow devices.
- **Sound** (`src/audio.js`): every effect is synthesised with WebAudio, so there are no asset files. That covers jump, landings, dive, ears, dig, smash, perfect, chain arpeggio, hurt, pad, ring, carrot, gem, rumble, skewer and game over. The speaker button (title and game-over screens) or M mutes, and mute is remembered.
- **Performance check:** in headless Chromium with the CPU throttled 4× and 6× (standing in for mid-range phones), the game holds 60 fps once the vignette moved to CSS. Before that it ran at about 17–27 fps. Pixel density is capped at 3.
- *As built:* **landscape**. The whole 1000-unit cavern width always fits the screen, and the aspect ratio is clamped to 1.45–2.3, letterboxed outside that. The rabbit sits 30% down the screen. Holding the phone upright shows "Turn your phone sideways", and on Android the first tap tries fullscreen plus a landscape lock. Parallax rock shapes and dust drift past behind the cavern to sell the speed of the fall.
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
- World units: the world has a fixed width (360 in M0–M5 portrait, now 1000 in landscape), scaled to the screen width so every device sees the same width. Visible height varies with aspect ratio.
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
