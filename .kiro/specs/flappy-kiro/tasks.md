# Implementation Plan: Flappy Kiro

## Overview

This plan implements Flappy Kiro as a client-side browser game using vanilla ES modules, HTML5 Canvas 2D, `HTMLAudioElement`, and `localStorage`, exactly as specified in the design. Work proceeds bottom-up: first the project scaffold and test tooling, then the pure deterministic core (RNG, physics, pipes, collision, scoring, state machine, and the `step` function) with property-based tests using fast-check, then the impure shell adapters (asset loader, input, renderer, audio, storage), then the game loop that wires everything together, and finally end-to-end integration and a performance smoke test.

The pure core never imports browser APIs. All randomness is threaded through a seedable PRNG state so `step` stays pure and reproducible in tests. Property tests target the core; adapters and UI use example-based unit, integration (mocked browser APIs), and smoke tests.

Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP.

## Tasks

- [x] 1. Set up project scaffold and test tooling
  - [x] 1.1 Create project structure and entry point
    - Create `index.html` that loads a single Canvas element and bootstraps `src/main.js` as an ES module (`<script type="module">`).
    - Create the `src/` module layout: `src/core/` (pure) and `src/shell/` (adapters), with placeholder index modules so imports resolve.
    - Add `package.json` with Vitest and fast-check as dev dependencies and a `test` script using `vitest --run`.
    - Create a Vitest config with a jsdom-style/browser-mock test environment for adapter tests.
    - _Requirements: 9.1_

  - [x] 1.2 Define core constants and shared type shapes
    - Create `src/core/constants.js` with `FIXED_DT`, `PLAY_AREA` (360x640), `GRAVITY`, `FLAP_VELOCITY` (in [300,600]), `TERMINAL_VELOCITY`, `PIPE_SPEED` (in [100,300]), `PIPE_SPACING` (in [150,400]), `GAP_HEIGHT` (in [0.20,0.35]*height and >= 1.5*ghost height), `GAP_CENTER_MIN`/`GAP_CENTER_MAX`, `GHOST_START`, `SCORE_MAX` (999999), `RESTART_LOCKOUT_MS` (500).
    - Document the `GameState`, `Ghost`, `Pipe_Pair`, `InputEvent`, and `RngState` object shapes as JSDoc typedefs for reference by other modules.
    - _Requirements: 2.2, 3.2, 4.1, 4.2, 4.4, 5.4, 7.4_

- [x] 2. Implement seedable RNG
  - [x] 2.1 Implement mulberry32 PRNG threaded through state
    - Create `src/core/rng.js` exposing `createRng(seed): RngState` and `nextRandom(rng): { value, rng }` returning a value in [0,1) and the advanced state (no mutation of input).
    - _Requirements: 4.3_

  - [x]* 2.2 Write property test for RNG determinism and range
    - **Property support for pipe generation (Properties 10, 11)**
    - Assert values are always in [0,1) and that the same seed reproduces the same sequence; min 100 iterations.
    - Tag: `Feature: flappy-kiro, Property 10: Generated gap center is within vertical bounds` (RNG precondition).
    - _Requirements: 4.3_

- [x] 3. Implement physics module
  - [x] 3.1 Implement gravity, flap, integration, and top clamp
    - Create `src/core/physics.js` with `applyGravity(velocityY, dt)` (capped at terminal velocity), `applyFlap()` (returns fixed upward flap velocity, replacing prior velocity), `integratePosition(y, velocityY, dt)`, and `clampToTop(ghost)` (enforces top boundary).
    - _Requirements: 2.2, 2.6, 3.1, 3.2, 3.3, 3.4_

  - [x]* 3.2 Write property test for flap velocity replacement
    - **Property 3: Flap sets a single fixed upward velocity**
    - **Validates: Requirements 2.2**
    - fast-check over arbitrary prior velocities; min 100 iterations.

  - [x]* 3.3 Write property test for gravity below terminal
    - **Property 5: Gravity increases downward velocity below terminal**
    - **Validates: Requirements 3.1**

  - [x]* 3.4 Write property test for terminal velocity cap
    - **Property 6: Downward velocity is capped at terminal velocity**
    - **Validates: Requirements 3.2**

  - [x]* 3.5 Write property test for position integration
    - **Property 7: Position integrates velocity**
    - **Validates: Requirements 3.3**

- [x] 4. Implement collision module
  - [x] 4.1 Implement AABB overlap and hit tests
    - Create `src/core/collision.js` with `aabbOverlap(a, b)` (overlap of >= 1px), `hitsAnyPipe(ghost, pipes)` (using derived top/bottom pipe rectangles), and `hitsGround(ghost, playArea)`.
    - _Requirements: 6.1, 6.2_

  - [x]* 4.2 Write property test for collision ending the game
    - **Property 15: Any collision ends the game**
    - **Validates: Requirements 6.1, 6.2**
    - Note: exercised at the `step` level in task 8; here validate the pure overlap predicates on generated overlapping/non-overlapping rects. Min 100 iterations.

- [x] 5. Implement pipe system module
  - [x] 5.1 Implement pipe advance, spawn decision, generation, and culling
    - Create `src/core/pipes.js` with `advancePipes(pipes, dt, speed)` (moves all pairs left at shared speed), `shouldSpawn(pipes, spawnSpacing, playAreaWidth)` (true when most recent pair traveled the fixed spacing), `spawnPipe(rng, playArea)` (right-edge pair with randomized gap center in [10%,90%] height and fixed gap height in [20%,35%] height and >= 1.5*ghost height; returns advanced rng), and `cullOffscreen(pipes)`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x]* 5.2 Write property test for uniform leftward scrolling
    - **Property 8: Pipes scroll uniformly leftward**
    - **Validates: Requirements 4.1**

  - [x]* 5.3 Write property test for constant spawn spacing
    - **Property 9: Pipe spawn spacing is constant**
    - **Validates: Requirements 4.2**

  - [x]* 5.4 Write property test for gap center bounds
    - **Property 10: Generated gap center is within vertical bounds**
    - **Validates: Requirements 4.3**

  - [x]* 5.5 Write property test for passable gap
    - **Property 11: Generated gap is passable**
    - **Validates: Requirements 4.4**

  - [x]* 5.6 Write property test for offscreen culling
    - **Property 12: Offscreen pipes are culled**
    - **Validates: Requirements 4.5**

- [x] 6. Implement scoring module
  - [x] 6.1 Implement pass detection and score clamping
    - Create `src/core/scoring.js` with `scorePasses(ghost, pipes, score)` that increments the score by exactly 1 when the ghost passes a pair's right edge, sets that pair's `counted` flag, ignores already-counted pairs, and saturates at 999999. Returns `{ score, pipes }`.
    - _Requirements: 5.1, 5.4, 5.5_

  - [x]* 6.2 Write property test for scoring each pair at most once
    - **Property 13: Each pipe pair is scored at most once**
    - **Validates: Requirements 5.1, 5.5**

  - [x]* 6.3 Write property test for score bounds and saturation
    - **Property 14: Score stays within bounds and saturates**
    - **Validates: Requirements 5.4**

- [x] 7. Implement state machine module and initial state factory
  - [x] 7.1 Implement guarded transitions and Ready-state factory
    - Create `src/core/state.js` with `createInitialState(playArea, highScore, rng)` placing the ghost at 25% width and vertical center with score 0, and `transition(state, event)` implementing pure guarded transitions Ready→Playing (flap), Playing→Game_Over (collision), Game_Over→Ready (flap after 500ms lockout), including the restart-lockout guard and high-score running-maximum update on the Game_Over transition.
    - _Requirements: 1.2, 1.5, 2.1, 2.7, 5.3, 6.5, 6.6, 6.7, 7.4, 7.5, 8.1_

  - [x]* 7.2 Write property test for Ready-state ghost placement
    - **Property 1: Ready state initial ghost placement**
    - **Validates: Requirements 1.2**

  - [x]* 7.3 Write property test for high score running maximum
    - **Property 20: High score is the running maximum**
    - **Validates: Requirements 8.1**

- [x] 8. Implement the pure step function (integrates core modules)
  - [x] 8.1 Implement step(state, dt, inputEvents)
    - Create `src/core/step.js` composing physics, pipes, collision, scoring, and state transitions into a single deterministic `(state, dt, inputEvents) -> GameState`. Apply flap/gravity only while Playing, integrate and clamp position, advance/spawn/cull pipes while Playing, run scoring, detect collisions to enter Game_Over, freeze the pipe field in Game_Over, accumulate `timeInGameOver`, and keep the function total (never throws for valid state and dt >= 0).
    - _Requirements: 1.4, 2.2, 2.6, 3.1, 3.3, 3.4, 4.1, 4.2, 4.5, 5.1, 6.1, 6.2, 6.5, 6.6, 6.7, 7.4, 7.5_

  - [x]* 8.2 Write property test for Ready inertness
    - **Property 2: Ready state is inert**
    - **Validates: Requirements 1.4**

  - [x]* 8.3 Write property test for top-boundary clamp after step
    - **Property 4: Ghost never rises above the top boundary**
    - **Validates: Requirements 2.6, 3.4**

  - [x]* 8.4 Write property test for collision transition via step
    - **Property 15: Any collision ends the game**
    - **Validates: Requirements 6.1, 6.2**

  - [x]* 8.5 Write property test for Game_Over freezing the pipe field
    - **Property 16: Game_Over freezes the pipe field**
    - **Validates: Requirements 6.5, 6.6**

  - [x]* 8.6 Write property test for idempotent Game_Over transition
    - **Property 17: Game_Over transition is idempotent**
    - **Validates: Requirements 6.7**

  - [x]* 8.7 Write property test for flap during restart lockout
    - **Property 18: Flap during the restart lockout is a no-op**
    - **Validates: Requirements 2.7, 7.5**

  - [x]* 8.8 Write property test for flap after lockout restarts
    - **Property 19: Flap after lockout restarts to Ready**
    - **Validates: Requirements 7.4**

- [x] 9. Checkpoint - Ensure all core tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement storage adapter
  - [x] 10.1 Implement high-score load/save with safe parsing
    - Create `src/shell/storage.js` with `loadHighScore()` (reads key `flappy-kiro.highScore`, returns a non-negative integer; missing/non-numeric/negative/unparseable → 0) and `saveHighScore(n)` (writes decimal string, swallows write failures so gameplay continues).
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x]* 10.2 Write property test for total, safe high-score parsing
    - **Property 21: High score parsing is total and safe**
    - **Validates: Requirements 8.4**
    - Generate arbitrary strings (whitespace, negative, huge, non-numeric); min 100 iterations.

  - [x]* 10.3 Write integration tests for storage load/save/failure
    - Load on init (8.3), persist on update (8.2), tolerate write failure (8.5) against a mocked `localStorage`.
    - _Requirements: 8.2, 8.3, 8.5_

- [x] 11. Implement canvas sizing helper and renderer
  - [x] 11.1 Implement pure canvas sizing helper
    - Create `src/shell/sizing.js` with `computeCanvasSize(viewportW, viewportH)` returning dimensions at a fixed 9:16 ratio scaled to the largest size fitting within the viewport without cropping or distortion.
    - _Requirements: 9.3_

  - [x]* 11.2 Write property test for aspect-ratio-preserving sizing
    - **Property 22: Canvas sizing preserves aspect ratio and fits the viewport**
    - **Validates: Requirements 9.3**

  - [x] 11.3 Implement Canvas 2D renderer
    - Create `src/shell/renderer.js` with `render(ctx, state, assets)` drawing background, all pipes, the ghost (sprite from `assets/ghosty.png` or a solid-colored placeholder of equivalent size on sprite-load failure), the current score, and the state-appropriate overlay: Ready start instruction naming the flap input, and the Game_Over panel showing final score, high score, and restart instruction. Apply the 9:16 letterboxed sizing on resize.
    - _Requirements: 1.2, 1.3, 5.2, 7.1, 7.2, 7.3, 9.1, 9.4, 9.5_

  - [x]* 11.4 Write integration tests for renderer output
    - Score display reflects state (5.2, 7.1); all pipes rendered while Playing/Game_Over (9.1, 9.4); placeholder drawn on sprite failure (9.5); Ready/Game_Over overlay text present (1.3, 7.2, 7.3) against a mocked 2D context.
    - _Requirements: 1.3, 5.2, 7.1, 7.2, 7.3, 9.1, 9.4, 9.5_

- [x] 12. Implement audio player adapter
  - [x] 12.1 Implement one-shot audio playback
    - Create `src/shell/audio.js` with `playFlap()` and `playGameOver()` that restart a one-shot by setting `currentTime = 0` before `play()` and no-op silently if the corresponding asset failed to load, never blocking input.
    - _Requirements: 2.3, 6.3, 6.4, 10.2, 10.3, 10.4, 10.5_

  - [x]* 12.2 Write integration tests for audio behavior
    - `playFlap` on flap (2.3, 10.3); `playGameOver` on game over (6.3, 10.5); restart-from-start via `currentTime = 0` (10.4); no-op and non-blocking when a sound is unavailable, and Game_Over completes without audio (6.4, 10.2) using audio-element spies.
    - _Requirements: 2.3, 6.3, 6.4, 10.2, 10.3, 10.4, 10.5_

- [x] 13. Implement asset loader adapter
  - [x] 13.1 Implement asset loading with timeout and per-asset failure reporting
    - Create `src/shell/assets.js` that loads `assets/ghosty.png`, `assets/jump.wav`, `assets/game_over.wav`, resolves when all load, times out at 10s for the start-blocking image, preloads audio within 5s (marking a sound unavailable on failure/timeout without blocking), and reports per-asset failure so the sprite can fall back and audio can degrade.
    - _Requirements: 1.6, 9.5, 10.1, 10.2_

  - [x]* 13.2 Write integration tests for asset loading paths
    - Failing/slow required asset yields error state and blocks Ready (1.6); sprite-load failure flagged for placeholder (9.5); audio preload success and failure handling (10.1, 10.2) against mocked Image/Audio.
    - _Requirements: 1.6, 9.5, 10.1, 10.2_

- [x] 14. Implement input adapter
  - [x] 14.1 Implement keyboard and pointer input queue
    - Create `src/shell/input.js` registering `keydown` (Spacebar) and `pointerdown` (click/tap within the Play_Area) listeners, normalizing both into a queued `InputEvent { type: 'flap', timestamp }`. The adapter never mutates game state; the loop drains the queue.
    - _Requirements: 2.4, 2.5_

  - [x]* 14.2 Write unit tests for input normalization
    - Spacebar and in-bounds pointer events each enqueue exactly one flap event; out-of-bounds pointer events are ignored.
    - _Requirements: 2.4, 2.5_

- [x] 15. Checkpoint - Ensure all adapter tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement game loop and wire everything together
  - [x] 16.1 Implement the fixed-timestep game loop
    - Create `src/shell/loop.js` owning the `requestAnimationFrame` cycle and fixed-timestep accumulator: accumulate real dt, drain the input queue, run `step` in `FIXED_DT` increments (input on the first sub-step only), detect Ready→Playing / Playing→Game_Over transitions to fire audio (`playFlap`, `playGameOver`) and persist the high score on Game_Over, then `render` the resulting state.
    - _Requirements: 2.1, 2.3, 6.3, 8.1, 8.2, 9.2_

  - [x] 16.2 Implement bootstrap in main.js
    - Create/complete `src/main.js` to size the canvas, run the asset loader, show loading/error screens around the core `Game_State`, build the initial state (loading the high score), instantiate adapters, and start the loop once assets resolve. Handle resize by recomputing canvas size. Handle the pipe-generation error path (retain existing pipes, produce an error indication) surfaced from the core.
    - _Requirements: 1.1, 1.6, 4.6, 8.3, 9.3_

  - [x]* 16.3 Write integration tests for loop transitions and wiring
    - Ready→Playing on flap (2.1), audio fired on transitions (2.3, 6.3), high score persisted on Game_Over (8.1, 8.2), and the pipe-generation error path retaining pipes (4.6) using mocked adapters and a stubbed RAF/timer.
    - _Requirements: 2.1, 2.3, 4.6, 6.3, 8.1, 8.2_

- [x] 17. Add performance smoke test
  - [x]* 17.1 Write a Playing-loop frame-rate smoke test
    - Measure a representative Playing loop run and assert it sustains at least 55 fps against the 60 fps target.
    - _Requirements: 9.2_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability; property test tasks additionally reference the design's numbered correctness properties.
- Property-based tests use fast-check with a minimum of 100 iterations and are tagged `Feature: flappy-kiro, Property N: ...` for traceability.
- The pure core (`src/core/`) never imports browser APIs; all randomness is threaded through the seedable RNG state so `step` is deterministic and reproducible in tests.
- Adapters, UI, audio, storage I/O, asset-load timing, and frame rate are covered by unit/integration/smoke tests rather than property tests.
- Checkpoints ensure incremental validation at the core, adapter, and final integration boundaries.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 3, "tasks": ["2.2", "3.2", "3.3", "3.4", "3.5", "4.2", "5.1", "6.1", "7.1", "10.1", "11.1", "12.1", "13.1", "14.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "6.2", "6.3", "7.2", "7.3", "8.1", "10.2", "10.3", "11.2", "11.3", "12.2", "13.2", "14.2"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "11.4", "16.1"] },
    { "id": 6, "tasks": ["16.2"] },
    { "id": 7, "tasks": ["16.3", "17.1"] }
  ]
}
```
