/**
 * The pure step function for Flappy Kiro.
 *
 * Part of the pure core: imports no browser APIs, reads no globals, and never
 * mutates its inputs. `step` is the single deterministic transition function
 * that composes physics, the pipe system, collision, scoring, and the state
 * machine into `(state, dt, inputEvents) -> GameState`.
 *
 * ## Responsibilities by mode
 *
 * - **Ready**: inert unless a Flap is present. Without a flap the ghost's
 *   position and velocity are unchanged (no gravity is applied) — Requirement
 *   1.4. A flap starts the game by transitioning Ready -> Playing (which resets
 *   the session score to 0).
 * - **Playing**: apply a Flap (replacing velocity) when one is present, apply
 *   gravity, integrate the vertical position, clamp to the top boundary,
 *   advance pipes leftward, spawn a new pair when due, cull offscreen pairs,
 *   award scoring for newly passed pairs, then detect a pipe/ground collision
 *   and transition Playing -> Game_Over when one occurs (folding the score into
 *   the running-maximum high score).
 * - **Game_Over**: the pipe field is frozen (no advance, spawn, or cull) and no
 *   scoring occurs; `timeInGameOver` accumulates `dt` for the restart lockout. A
 *   flap after the lockout restarts the game (Game_Over -> Ready).
 *
 * ## Totality
 *
 * The function is total: for any valid `GameState` and `dt >= 0` it returns a
 * new `GameState` and never throws. Input normalization (rejecting malformed
 * events, negative dt, etc.) happens at the adapter boundary; `step` treats a
 * missing or non-array `inputEvents` as "no input" defensively so it stays
 * total.
 *
 * @typedef {import('./constants.js').GameState} GameState
 * @typedef {import('./constants.js').InputEvent} InputEvent
 */

import { PLAY_AREA, PIPE_SPEED, PIPE_SPACING } from "./constants.js";
import { applyGravity, applyFlap, integratePosition, clampToTop } from "./physics.js";
import { advancePipes, shouldSpawn, spawnPipe, cullOffscreen } from "./pipes.js";
import { hitsAnyPipe, hitsGround } from "./collision.js";
import { scorePasses } from "./scoring.js";
import { transition } from "./state.js";

/**
 * Determine whether the input events for this step contain at least one flap.
 *
 * The loop passes player input to the first fixed sub-step only, so a flap this
 * step means at least one `{ type: 'flap' }` event is present. Defensive
 * against a missing/non-array argument so `step` stays total.
 *
 * @param {InputEvent[]} inputEvents - The normalized input events for this step.
 * @returns {boolean} True when a flap is present this step.
 */
function hasFlap(inputEvents) {
  if (!Array.isArray(inputEvents)) {
    return false;
  }
  return inputEvents.some((e) => e && e.type === "flap");
}

/**
 * Advance the game one fixed step.
 *
 * Composes the pure core modules into a single deterministic transition. See
 * the module docblock for the per-mode behavior. Never mutates `state` or
 * `inputEvents`; returns a new `GameState`.
 *
 * @param {GameState} state - The current immutable game state.
 * @param {number} dt - The fixed delta time for this step, in seconds (>= 0).
 * @param {InputEvent[]} [inputEvents] - The normalized input events for this
 *   step (the loop supplies player input on the first sub-step only).
 * @returns {GameState} The next game state.
 */
export function step(state, dt, inputEvents) {
  const flap = hasFlap(inputEvents);

  switch (state.mode) {
    case "Ready":
      // Inert without a flap: no gravity, ghost unchanged (Req 1.4). A flap
      // begins play; `transition` resets the session score to 0 (Req 2.1, 5.3).
      if (flap) {
        return transition(state, { type: "flap" });
      }
      return state;

    case "Playing":
      return stepPlaying(state, dt, flap);

    case "Game_Over":
      return stepGameOver(state, dt, flap);

    default:
      // Total: unknown modes pass through unchanged.
      return state;
  }
}

/**
 * Advance the Playing mode one fixed step.
 *
 * Applies flap/gravity to the ghost, integrates and clamps its position,
 * advances/spawns/culls pipes, runs scoring, then detects a collision and, when
 * one occurs, transitions to Game_Over.
 *
 * @param {GameState} state - The current Playing state (not mutated).
 * @param {number} dt - Fixed delta time in seconds (>= 0).
 * @param {boolean} flap - Whether a flap is present this step.
 * @returns {GameState} The next state (Playing, or Game_Over on collision).
 */
function stepPlaying(state, dt, flap) {
  // --- Ghost physics ---------------------------------------------------------
  // A flap replaces the current velocity with the fixed upward flap velocity
  // (Req 2.2); otherwise gravity integrates the downward velocity, capped at
  // terminal velocity (Req 3.1, 3.2).
  const velocityY = flap ? applyFlap() : applyGravity(state.ghost.velocityY, dt);
  const y = integratePosition(state.ghost.y, velocityY, dt);
  // Clamp the ghost to the top boundary (Req 2.6, 3.4); clampToTop zeroes
  // upward momentum when the boundary engages.
  const ghost = clampToTop({ ...state.ghost, y, velocityY });

  // --- Pipe field ------------------------------------------------------------
  // Advance all pairs left at the shared speed (Req 4.1).
  let pipes = advancePipes(state.pipes, dt, PIPE_SPEED);
  // Track distance traveled since the last spawn for state consistency; the
  // spawn decision itself uses `shouldSpawn`, whose generation-point spacing is
  // PIPE_SPACING (Req 4.2).
  let distanceSinceLastSpawn = state.distanceSinceLastSpawn + PIPE_SPEED * dt;
  let rng = state.rng;

  if (shouldSpawn(pipes, PIPE_SPACING, PLAY_AREA.width)) {
    const spawned = spawnPipe(rng, PLAY_AREA);
    pipes = [...pipes, spawned.pipe];
    rng = spawned.rng;
    distanceSinceLastSpawn = 0;
  }

  // Remove pairs that have scrolled fully past the left edge (Req 4.5).
  pipes = cullOffscreen(pipes);

  // --- Scoring ---------------------------------------------------------------
  // Award a point per newly passed pair; saturates at SCORE_MAX (Req 5.1).
  const scored = scorePasses(ghost, pipes, state.score);
  pipes = scored.pipes;

  // --- Collision / transition ------------------------------------------------
  const playing = {
    ...state,
    ghost,
    pipes,
    score: scored.score,
    distanceSinceLastSpawn,
    rng,
  };

  // A pipe or ground collision ends the game (Req 6.1, 6.2). `transition`
  // folds the score into the running-maximum high score and resets the
  // Game_Over timer.
  if (hitsAnyPipe(ghost, pipes, PLAY_AREA) || hitsGround(ghost, PLAY_AREA)) {
    return transition(playing, { type: "collision" });
  }

  return playing;
}

/**
 * Advance the Game_Over mode one fixed step.
 *
 * The pipe field is frozen (no advance/spawn/cull) and no scoring occurs
 * (Req 6.5, 6.6). `timeInGameOver` accumulates `dt` to drive the restart
 * lockout. A flap after the lockout restarts the game to Ready (Req 7.4);
 * a flap during the lockout is ignored (Req 7.5). The Game_Over transition is
 * never re-triggered (Req 6.7).
 *
 * @param {GameState} state - The current Game_Over state (not mutated).
 * @param {number} dt - Fixed delta time in seconds (>= 0).
 * @param {boolean} flap - Whether a flap is present this step.
 * @returns {GameState} The next state (Game_Over, or Ready after a valid restart).
 */
function stepGameOver(state, dt, flap) {
  // Accumulate time in Game_Over first so the restart lockout is measured
  // against the freshly updated timer.
  const accumulated = {
    ...state,
    timeInGameOver: state.timeInGameOver + dt,
  };

  if (flap) {
    // `transition` honors the flap only once the lockout has elapsed; otherwise
    // it returns the state unchanged (Req 7.4, 7.5).
    return transition(accumulated, { type: "flap" });
  }

  return accumulated;
}
