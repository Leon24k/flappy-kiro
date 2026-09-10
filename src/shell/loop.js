/**
 * Game loop (impure shell).
 *
 * Owns the `requestAnimationFrame` cycle and the fixed-timestep accumulator
 * that wires the impure adapters (input, audio, storage, renderer) into the
 * pure {@link step} function each frame. This is the orchestration layer
 * described in the design's "Game Loop" component and "Frame Cycle" sequence.
 *
 * ## Frame cycle (see design "Frame Cycle")
 *
 * Each animation frame the loop:
 *   1. Computes elapsed real time since the previous frame and adds it to a
 *      time accumulator (large elapsed times are clamped to avoid the
 *      "spiral of death" when a tab is backgrounded or the machine stalls).
 *   2. Drains the input queue once, collecting the flap events captured since
 *      the last frame.
 *   3. Runs the pure `step` in fixed `FIXED_DT` increments while the
 *      accumulator holds at least one timestep. Player input is passed to the
 *      FIRST sub-step only; subsequent sub-steps this frame receive an empty
 *      input array so a single flap is not applied multiple times.
 *   4. Detects `Game_State` mode transitions by comparing the mode before and
 *      after each sub-step and fires the corresponding shell side effects:
 *        - Ready -> Playing: `audio.playFlap()` (Requirement 2.3).
 *        - Playing -> Game_Over: `audio.playGameOver()` (Requirement 6.3) and
 *          persist the running-maximum high score via `saveHighScore`
 *          (Requirements 8.1, 8.2). The pure core folds the score into
 *          `highScore` on this transition; the loop persists that value.
 *   5. Renders the resulting state to the canvas (Requirement 9.2 — the loop
 *      is driven by `requestAnimationFrame`).
 *
 * The loop is robust and non-throwing: a throw from any adapter or from `step`
 * is contained so a single bad frame cannot tear down the animation callback.
 *
 * The `requestAnimationFrame` implementation and the time source (`now`) are
 * injectable so the loop can be exercised deterministically in tests; both
 * default to the browser globals.
 *
 * @typedef {import('../core/constants.js').GameState} GameState
 * @typedef {import('../core/constants.js').InputEvent} InputEvent
 * @typedef {import('./assets.js').LoadedAssets} LoadedAssets
 */

import { FIXED_DT } from "../core/constants.js";
import { step as coreStep } from "../core/step.js";
import { render as coreRender } from "./renderer.js";

/**
 * The maximum real elapsed time, in seconds, folded into the accumulator on any
 * single frame. When a frame's true elapsed time exceeds this (e.g. the tab was
 * hidden, or a long GC pause occurred), it is clamped so the loop does not try
 * to catch up with an unbounded number of fixed sub-steps in one frame — the
 * classic "spiral of death". A quarter second (~15 fixed steps at 60fps) keeps
 * catch-up bounded while still smoothing ordinary jitter.
 * @type {number}
 */
const DEFAULT_MAX_FRAME_TIME = 0.25;

/**
 * Resolve the injected or global `requestAnimationFrame`.
 *
 * @param {((cb: (t: number) => void) => number) | undefined} raf
 * @returns {(cb: (t: number) => void) => number}
 */
function resolveRaf(raf) {
  if (typeof raf === "function") {
    return raf;
  }
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame;
  }
  // Fallback for non-browser environments: approximate 60fps via setTimeout.
  return (cb) => setTimeout(() => cb(nowFallback()), 1000 / 60);
}

/**
 * Resolve the injected or global `cancelAnimationFrame`.
 *
 * @param {((handle: number) => void) | undefined} cancelRaf
 * @returns {(handle: number) => void}
 */
function resolveCancelRaf(cancelRaf) {
  if (typeof cancelRaf === "function") {
    return cancelRaf;
  }
  if (typeof cancelAnimationFrame === "function") {
    return cancelAnimationFrame;
  }
  return (handle) => clearTimeout(handle);
}

/**
 * A monotonic-ish time source in milliseconds, used only as the ultimate
 * fallback when neither an injected `now` nor `performance.now` is available.
 * @returns {number}
 */
function nowFallback() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * Resolve the injected or global time source, returning milliseconds.
 *
 * @param {(() => number) | undefined} now
 * @returns {() => number}
 */
function resolveNow(now) {
  if (typeof now === "function") {
    return now;
  }
  return nowFallback;
}

/**
 * Create the game loop.
 *
 * The loop keeps the authoritative `GameState` internally. It reads an initial
 * state from `getState()` when `start()` is called (or lazily on the first
 * frame) and writes each frame's resulting state back via `setState` when one
 * is provided, so the bootstrap layer can observe the current state without the
 * loop owning it exclusively.
 *
 * @param {Object} deps - Injected collaborators.
 * @param {() => GameState} deps.getState - Returns the current game state; read
 *   at start and used as the starting state for stepping.
 * @param {(state: GameState) => void} [deps.setState] - Called with each
 *   frame's resulting state so the bootstrap can track it. Optional.
 * @param {(state: GameState, dt: number, inputEvents: InputEvent[]) => GameState} [deps.step]
 *   - The pure step function. Defaults to the core `step`.
 * @param {(ctx: CanvasRenderingContext2D, state: GameState, assets: LoadedAssets) => void} [deps.render]
 *   - The renderer. Defaults to the shell `render`.
 * @param {CanvasRenderingContext2D} deps.ctx - The 2D context to render into.
 * @param {LoadedAssets} [deps.assets] - Loaded assets handed to the renderer.
 * @param {{ drain: () => InputEvent[] }} deps.input - The input adapter; its
 *   queue is drained once per frame.
 * @param {{ playFlap: () => void, playGameOver: () => void }} deps.audio - The
 *   audio player; fired on the relevant transitions.
 * @param {(n: number) => void} deps.saveHighScore - Persists the high score on
 *   the Playing -> Game_Over transition.
 * @param {() => number} [deps.now] - Millisecond time source; defaults to
 *   `performance.now()` (falling back to `Date.now()`).
 * @param {(cb: (t: number) => void) => number} [deps.raf] - The frame scheduler;
 *   defaults to the global `requestAnimationFrame`.
 * @param {(handle: number) => void} [deps.cancelRaf] - Cancels a scheduled
 *   frame; defaults to the global `cancelAnimationFrame`.
 * @param {number} [deps.maxFrameTime] - Max real seconds folded into the
 *   accumulator per frame (spiral-of-death clamp). Defaults to 0.25.
 * @returns {{ start: () => void, stop: () => void, isRunning: () => boolean }}
 *   The loop handle.
 */
export function createLoop({
  getState,
  setState,
  step = coreStep,
  render = coreRender,
  ctx,
  assets,
  input,
  audio,
  saveHighScore,
  now,
  raf,
  cancelRaf,
  maxFrameTime = DEFAULT_MAX_FRAME_TIME,
} = {}) {
  const clock = resolveNow(now);
  const schedule = resolveRaf(raf);
  const cancel = resolveCancelRaf(cancelRaf);
  const clampSeconds = Number.isFinite(maxFrameTime) && maxFrameTime > 0 ? maxFrameTime : DEFAULT_MAX_FRAME_TIME;

  /** Authoritative current state, seeded from getState() at start. */
  let state = null;
  /** Accumulated real time (seconds) not yet consumed by fixed sub-steps. */
  let accumulator = 0;
  /** Timestamp (ms) of the previous frame, or null before the first frame. */
  let lastMs = null;
  /** The handle returned by the frame scheduler, for cancellation. */
  let rafHandle = null;
  /** Whether the loop is currently running. */
  let running = false;

  /**
   * Read the latest state, preferring the internally tracked value once the
   * loop has begun stepping, otherwise the injected `getState`.
   * @returns {GameState | null}
   */
  const currentState = () => {
    if (state !== null) {
      return state;
    }
    if (typeof getState === "function") {
      return getState();
    }
    return null;
  };

  /**
   * Fire the shell side effects for a single mode transition.
   *
   * @param {GameState} prev - State before the sub-step.
   * @param {GameState} next - State after the sub-step.
   */
  const handleTransition = (prev, next) => {
    if (!prev || !next || prev.mode === next.mode) {
      return;
    }

    // Ready -> Playing: the flap that started play plays the flap sound.
    if (prev.mode === "Ready" && next.mode === "Playing") {
      safeInvoke(() => audio && audio.playFlap());
      return;
    }

    // Playing -> Game_Over: play the game-over sound and persist the high score.
    // The pure core already folded the session score into `next.highScore` as a
    // running maximum on this transition, so we persist that value.
    if (prev.mode === "Playing" && next.mode === "Game_Over") {
      safeInvoke(() => audio && audio.playGameOver());
      safeInvoke(() => {
        if (typeof saveHighScore === "function") {
          saveHighScore(next.highScore);
        }
      });
    }
  };

  /**
   * Advance the simulation for one animation frame and render the result.
   *
   * @param {number} timestampMs - The frame timestamp in milliseconds.
   */
  const frame = (timestampMs) => {
    if (!running) {
      return;
    }

    // Schedule the next frame up-front so a throw mid-frame still keeps the
    // loop alive (the frame body below is additionally guarded).
    rafHandle = schedule(frame);

    try {
      const tMs = typeof timestampMs === "number" && Number.isFinite(timestampMs) ? timestampMs : clock();

      if (lastMs === null) {
        // First frame: establish the baseline; no elapsed time to integrate.
        lastMs = tMs;
      }

      // Elapsed real time since the previous frame, in seconds. Clamp to guard
      // against the spiral of death after long stalls / hidden tabs, and floor
      // at 0 in case a non-monotonic clock hands back a smaller timestamp.
      let elapsed = (tMs - lastMs) / 1000;
      lastMs = tMs;
      if (!Number.isFinite(elapsed) || elapsed < 0) {
        elapsed = 0;
      }
      if (elapsed > clampSeconds) {
        elapsed = clampSeconds;
      }
      accumulator += elapsed;

      // Drain the input queue once per frame; the drained flap events are fed
      // to the FIRST fixed sub-step only.
      const drained = input && typeof input.drain === "function" ? input.drain() : [];
      let inputForStep = Array.isArray(drained) ? drained : [];

      let s = currentState();

      // Run fixed sub-steps while a full timestep remains in the accumulator.
      while (s && accumulator >= FIXED_DT) {
        const prev = s;
        const next = step(prev, FIXED_DT, inputForStep);
        // Input applies to the first sub-step only; later sub-steps this frame
        // see no player input.
        inputForStep = EMPTY_INPUT;
        accumulator -= FIXED_DT;

        handleTransition(prev, next);
        s = next;
      }

      if (s) {
        state = s;
        if (typeof setState === "function") {
          safeInvoke(() => setState(s));
        }
        // Render the resulting state for this frame (Requirement 9.2).
        safeInvoke(() => render(ctx, s, assets));
      }
    } catch {
      // Contain any unexpected error so a single bad frame does not tear down
      // the animation callback; the next frame is already scheduled.
    }
  };

  return {
    /**
     * Start the loop. Seeds the internal state from `getState()`, resets the
     * accumulator and timing baseline, and schedules the first frame. Calling
     * `start` while already running is a no-op.
     * @returns {void}
     */
    start() {
      if (running) {
        return;
      }
      running = true;
      accumulator = 0;
      lastMs = null;
      state = typeof getState === "function" ? getState() : null;
      rafHandle = schedule(frame);
    },

    /**
     * Stop the loop and cancel any scheduled frame. Safe to call when not
     * running.
     * @returns {void}
     */
    stop() {
      running = false;
      if (rafHandle !== null && rafHandle !== undefined) {
        safeInvoke(() => cancel(rafHandle));
        rafHandle = null;
      }
    },

    /**
     * @returns {boolean} Whether the loop is currently running.
     */
    isRunning() {
      return running;
    },
  };
}

/**
 * Shared frozen empty input array reused for non-first sub-steps to avoid
 * allocating a new array each iteration. `step` never mutates its input.
 * @type {InputEvent[]}
 */
const EMPTY_INPUT = Object.freeze([]);

/**
 * Invoke a side-effecting callback, swallowing any throw so the loop stays
 * robust (no adapter can crash the frame).
 * @param {() => void} fn
 */
function safeInvoke(fn) {
  try {
    fn();
  } catch {
    // Intentionally ignored: adapters must never break the loop.
  }
}
