/**
 * Pipe system module for Flappy Kiro.
 *
 * This module is part of the pure core: it imports no browser APIs, reads no
 * globals, and mutates none of its inputs. It handles the lifecycle of
 * Pipe_Pairs: scrolling them leftward at a shared speed (Requirement 4.1),
 * deciding when a new pair should be generated (Requirement 4.2), generating a
 * pair at the right edge with a randomized Gap center (Requirements 4.3, 4.4),
 * and culling pairs that have scrolled past the left edge (Requirement 4.5).
 *
 * Randomness is threaded through the seedable {@link RngState} so generation is
 * deterministic and reproducible in tests; `spawnPipe` returns the advanced
 * state rather than mutating its input.
 *
 * @typedef {import('./constants.js').Pipe_Pair} Pipe_Pair
 * @typedef {import('./constants.js').RngState} RngState
 */

import { nextRandom } from "./rng.js";
import {
  GAP_CENTER_MIN,
  GAP_CENTER_MAX,
  GAP_HEIGHT,
  PIPE_WIDTH,
} from "./constants.js";

/**
 * Moves every Pipe_Pair horizontally left by the shared scroll distance for
 * this step (Requirement 4.1).
 *
 * All pairs move at the same `speed`, so each pair's `x` decreases by exactly
 * `speed * dt`. The input array and its elements are not mutated; a new array
 * of new pair objects is returned.
 *
 * @param {Pipe_Pair[]} pipes - The active pipe pairs.
 * @param {number} dt - Delta time for this step, in seconds.
 * @param {number} speed - The shared horizontal scroll speed, in units/s.
 * @returns {Pipe_Pair[]} A new array of advanced pipe pairs.
 */
export function advancePipes(pipes, dt, speed) {
  const delta = speed * dt;
  return pipes.map((pipe) => ({ ...pipe, x: pipe.x - delta }));
}

/**
 * Finds the most recently generated Pipe_Pair.
 *
 * New pairs are generated at the right edge (the largest `x`) and scroll left,
 * so the most recent pair is the one with the greatest `x`.
 *
 * @param {Pipe_Pair[]} pipes - The active pipe pairs.
 * @returns {Pipe_Pair | null} The most recent pair, or null when empty.
 */
function mostRecentPipe(pipes) {
  if (pipes.length === 0) {
    return null;
  }
  let recent = pipes[0];
  for (const pipe of pipes) {
    if (pipe.x > recent.x) {
      recent = pipe;
    }
  }
  return recent;
}

/**
 * Decides whether a new Pipe_Pair should be generated this step
 * (Requirement 4.2).
 *
 * A pair is generated at the right edge (`x = playAreaWidth`) and its
 * generation point is therefore `playAreaWidth`. A new pair is due once the
 * most recently generated pair has traveled the fixed `spawnSpacing` from its
 * generation point, i.e. once `playAreaWidth - mostRecent.x >= spawnSpacing`.
 * When no pairs exist yet, a spawn is due immediately so the field can seed.
 *
 * @param {Pipe_Pair[]} pipes - The active pipe pairs.
 * @param {number} spawnSpacing - The fixed horizontal spacing between
 *   consecutive generation points, in units.
 * @param {number} playAreaWidth - The Play_Area width; the generation point of
 *   every pair.
 * @returns {boolean} True when a new pair should be generated.
 */
export function shouldSpawn(pipes, spawnSpacing, playAreaWidth) {
  const recent = mostRecentPipe(pipes);
  if (recent === null) {
    return true;
  }
  return playAreaWidth - recent.x >= spawnSpacing;
}

/**
 * Generates a new Pipe_Pair at the right edge of the Play_Area with a randomly
 * selected Gap center and the fixed Gap height (Requirements 4.3, 4.4).
 *
 * The Gap center is drawn uniformly in `[GAP_CENTER_MIN, GAP_CENTER_MAX]`
 * (10%–90% of the Play_Area height) using the threaded PRNG, so the center is
 * never closer than 10% of the height to either edge. The Gap height is the
 * fixed `GAP_HEIGHT`, which lies in 20%–35% of the height and is at least
 * 1.5x the ghost height (both guaranteed by the constant's definition).
 *
 * The `id` is derived from the advanced PRNG seed so it is unique per spawn and
 * deterministic for a given starting state. The input `rng` is not mutated; the
 * advanced state is returned alongside the new pair.
 *
 * @param {RngState} rng - The current PRNG state (not mutated).
 * @param {{ width: number, height: number }} playArea - The Play_Area bounds.
 * @returns {{ pipe: Pipe_Pair, rng: RngState }} The new pair and the advanced
 *   PRNG state.
 */
export function spawnPipe(rng, playArea) {
  const { value, rng: nextRng } = nextRandom(rng);
  const gapCenterY = GAP_CENTER_MIN + value * (GAP_CENTER_MAX - GAP_CENTER_MIN);

  const pipe = {
    id: nextRng.seed,
    x: playArea.width,
    width: PIPE_WIDTH,
    gapCenterY,
    gapHeight: GAP_HEIGHT,
    counted: false,
  };

  return { pipe, rng: nextRng };
}

/**
 * Removes every Pipe_Pair whose right edge (`x + width`) has moved past the
 * left edge of the Play_Area (Requirement 4.5).
 *
 * A pair is culled once its right edge is fully to the left of `x = 0`, i.e.
 * `x + width < 0`. The input array is not mutated; a new filtered array is
 * returned.
 *
 * @param {Pipe_Pair[]} pipes - The active pipe pairs.
 * @returns {Pipe_Pair[]} A new array with offscreen pairs removed.
 */
export function cullOffscreen(pipes) {
  return pipes.filter((pipe) => pipe.x + pipe.width >= 0);
}
