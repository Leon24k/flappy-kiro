/**
 * State machine module for Flappy Kiro.
 *
 * Part of the pure core: imports no browser APIs, reads no globals, and never
 * mutates its inputs. It provides the initial-state factory and the guarded
 * transition function between the three core `Game_State` modes: `Ready`,
 * `Playing`, and `Game_Over`.
 *
 * ## Event shape (coordination note for the step function, task 8)
 *
 * `transition` consumes a single normalized game event:
 *
 *   Event = { type: 'flap' | 'collision' }
 *
 * - `{ type: 'flap' }`     — a normalized player Flap input. Drives the
 *                            Ready -> Playing start and the Game_Over -> Ready
 *                            restart (subject to the restart lockout).
 * - `{ type: 'collision' }` — a collision was detected this step (pipe or
 *                            ground). Drives the Playing -> Game_Over end.
 *
 * The step function (task 8) is responsible for deciding *when* a collision
 * event exists (via the collision module) and for draining player flap events;
 * it then calls `transition` to advance the mode. `transition` handles ONLY the
 * mode changes and the state resets that accompany them (score reset, high-score
 * running maximum, ghost reset, lockout timer reset). Per-frame physics, pipe
 * movement, spawning, and scoring live in the other core modules and in `step`.
 *
 * Extra properties on the event object are ignored, so the input adapter's
 * richer `InputEvent { type: 'flap', timestamp }` (see constants) is accepted
 * as-is.
 */

import { GHOST_START, GHOST_SIZE, RESTART_LOCKOUT_MS } from "./constants.js";

/**
 * @typedef {import('./constants.js').GameState} GameState
 * @typedef {import('./constants.js').Ghost} Ghost
 * @typedef {import('./constants.js').RngState} RngState
 */

/**
 * A normalized game event consumed by {@link transition}.
 * @typedef {Object} GameEvent
 * @property {'flap' | 'collision'} type - The event kind.
 */

/**
 * The restart lockout window expressed in seconds, to match the units of
 * `GameState.timeInGameOver` (seconds accumulated in Game_Over). A Flap during
 * Game_Over is only honored once at least this much time has elapsed
 * (Requirements 7.4, 7.5).
 * @type {number}
 */
const RESTART_LOCKOUT_S = RESTART_LOCKOUT_MS / 1000;

/**
 * Build a fresh Ghost positioned at its fixed starting placement.
 *
 * Horizontally the ghost sits at 25% of the Play_Area width; vertically it is
 * centered. `y` is the top of the bounding box, so it is offset upward by half
 * the ghost height from the vertical center (Requirements 1.2). Velocity is 0
 * so the ghost is stationary until the game starts.
 *
 * @param {{ width: number, height: number }} playArea - The Play_Area bounds.
 * @returns {Ghost} A new ghost at the starting position with zero velocity.
 */
function makeStartingGhost(playArea) {
  return {
    x: 0.25 * playArea.width,
    y: playArea.height / 2 - GHOST_SIZE.height / 2,
    width: GHOST_SIZE.width,
    height: GHOST_SIZE.height,
    velocityY: 0,
  };
}

/**
 * Create the initial game state in `Ready` mode.
 *
 * The ghost is placed at its fixed starting position (25% width, vertically
 * centered) with zero velocity, the score starts at 0 (Requirements 1.2, 1.5),
 * there are no pipes, spawn distance and Game_Over time are 0, and the supplied
 * high score and RNG state are carried through. Nothing is mutated; a fresh
 * state object is returned.
 *
 * @param {{ width: number, height: number }} playArea - The Play_Area bounds.
 * @param {number} highScore - The high score loaded for this session.
 * @param {RngState} rng - The seedable PRNG state to thread through the game.
 * @returns {GameState} A new `Ready` game state.
 */
export function createInitialState(playArea, highScore, rng) {
  return {
    mode: "Ready",
    ghost: makeStartingGhost(playArea),
    pipes: [],
    score: 0,
    highScore,
    distanceSinceLastSpawn: 0,
    timeInGameOver: 0,
    rng,
  };
}

/**
 * Apply a pure guarded transition to the game state.
 *
 * The transitions mirror the state machine:
 * - `Ready` + flap  -> `Playing`: begin play and reset the session score to 0
 *   (Requirements 2.1, 5.3).
 * - `Playing` + collision -> `Game_Over`: end the game, fold the current score
 *   into the running-maximum high score, and reset the Game_Over timer to 0
 *   (Requirements 6.5, 6.6, 8.1).
 * - `Game_Over` + flap, once `timeInGameOver >= RESTART_LOCKOUT_S` -> `Ready`:
 *   reset the ghost to the starting position and the score to 0 (Requirement
 *   7.4). A flap sooner than the lockout is ignored (Requirements 2.7, 7.5).
 * - `Game_Over` + collision -> unchanged: the Game_Over transition does not
 *   re-trigger (Requirement 6.7).
 *
 * Any event that does not match a guarded transition returns the input state
 * unchanged. The function is total and never mutates its inputs; when a
 * transition occurs it returns a new state object. The Play_Area used for the
 * restart ghost reset is derived from the current ghost's fixed geometry so the
 * function needs no external dimensions.
 *
 * @param {GameState} state - The current game state (not mutated).
 * @param {GameEvent} event - The normalized game event.
 * @returns {GameState} The next game state (a new object when the mode changes,
 *   otherwise the input state unchanged).
 */
export function transition(state, event) {
  switch (state.mode) {
    case "Ready":
      // Begin play on a flap; reset the session score (Req 2.1, 5.3).
      if (event.type === "flap") {
        return { ...state, mode: "Playing", score: 0 };
      }
      return state;

    case "Playing":
      // A detected collision ends the game. Fold the current score into the
      // running-maximum high score and reset the Game_Over timer (Req 6.5,
      // 6.6, 8.1).
      if (event.type === "collision") {
        return {
          ...state,
          mode: "Game_Over",
          highScore: Math.max(state.score, state.highScore),
          timeInGameOver: 0,
        };
      }
      return state;

    case "Game_Over":
      // A flap restarts to Ready only after the lockout window has elapsed;
      // otherwise it is ignored (Req 2.7, 7.4, 7.5). A repeat collision does
      // not re-trigger the transition (Req 6.7).
      if (event.type === "flap" && state.timeInGameOver >= RESTART_LOCKOUT_S) {
        return {
          ...state,
          mode: "Ready",
          ghost: resetGhostToStart(state.ghost),
          score: 0,
        };
      }
      return state;

    default:
      return state;
  }
}

/**
 * Reset a ghost to its fixed starting position and zero velocity, preserving
 * its size. Used on the Game_Over -> Ready restart (Requirement 7.4).
 *
 * The starting placement is derived from the shared `GHOST_START` constant
 * (25% width, vertically centered), keeping the restart placement identical to
 * the initial placement. A new ghost object is returned; the input is not
 * mutated.
 *
 * @param {Ghost} ghost - The ghost to reset (not mutated).
 * @returns {Ghost} A new ghost at the starting position with zero velocity.
 */
function resetGhostToStart(ghost) {
  return {
    ...ghost,
    x: GHOST_START.x,
    y: GHOST_START.y,
    velocityY: 0,
  };
}
