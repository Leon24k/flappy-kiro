/**
 * Scoring module for Flappy Kiro.
 *
 * This module is part of the pure core: it imports no browser APIs, reads no
 * globals, and mutates none of its inputs. It detects when the Ghost has passed
 * a Pipe_Pair's right edge and awards a point exactly once per pair, holding the
 * Score at its saturation cap.
 *
 * A pair is "passed" when the Ghost's left edge (`ghost.x`) has moved beyond the
 * pair's right edge (`pipe.x + pipe.width`). The first time this holds for an
 * as-yet-uncounted pair, the Score increases by exactly 1 and the pair is marked
 * `counted` so it is never scored again (Requirements 5.1, 5.5). The Score never
 * exceeds SCORE_MAX (Requirement 5.4).
 */

import { SCORE_MAX } from "./constants.js";

/**
 * Awards points for any Pipe_Pairs the Ghost has newly passed.
 *
 * For each pair whose right edge the Ghost has passed and which has not yet been
 * counted, the Score increases by exactly 1 and the pair is marked `counted`.
 * Pairs already marked `counted` are ignored, so each pair contributes at most
 * one point (Requirements 5.1, 5.5). The resulting Score is clamped so it never
 * exceeds SCORE_MAX; once at the cap it does not increase further
 * (Requirement 5.4).
 *
 * This function is pure: the input `pipes` array and its elements are not
 * mutated. A new array is returned in which newly passed pairs have `counted`
 * set to `true`.
 *
 * @param {import('./constants.js').Ghost} ghost - The ghost; its left edge is
 *   `ghost.x`.
 * @param {import('./constants.js').Pipe_Pair[]} pipes - The active pipe pairs.
 * @param {number} score - The current session Score.
 * @returns {{ score: number, pipes: import('./constants.js').Pipe_Pair[] }}
 *   The updated Score (clamped at SCORE_MAX) and a new pipes array with newly
 *   passed pairs marked `counted`.
 */
export function scorePasses(ghost, pipes, score) {
  let nextScore = score;
  const nextPipes = pipes.map((pipe) => {
    const passedRightEdge = ghost.x > pipe.x + pipe.width;

    if (passedRightEdge && !pipe.counted) {
      nextScore = Math.min(nextScore + 1, SCORE_MAX);
      return { ...pipe, counted: true };
    }

    return pipe;
  });

  return { score: nextScore, pipes: nextPipes };
}
