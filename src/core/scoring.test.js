import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { scorePasses } from "./scoring.js";
import { SCORE_MAX } from "./constants.js";

/**
 * Property-based tests for the scoring module.
 *
 * These exercise `scorePasses(ghost, pipes, score)` (returning
 * `{ score, pipes }`) across many inputs, per the design's Testing Strategy.
 * Each test runs at least 100 iterations. Generators are constrained to the
 * relevant input space so the properties exercise meaningful scenarios.
 */

/** Number of fast-check iterations (minimum 100 per task). */
const RUNS = 100;

/**
 * Generate a pipe pair positioned relative to a reference ghost x. The pipe's
 * right edge is `x + width`; the ghost passes it when `ghost.x > x + width`.
 *
 * @param {number} id - Unique identifier for the pair.
 */
function pipeArb(id) {
  return fc.record({
    id: fc.constant(id),
    x: fc.integer({ min: -500, max: 500 }),
    width: fc.integer({ min: 1, max: 100 }),
    gapCenterY: fc.integer({ min: 64, max: 576 }),
    gapHeight: fc.constant(160),
    counted: fc.boolean(),
  });
}

describe("scorePasses (property-based)", () => {
  // Feature: flappy-kiro, Property 13: Each pipe pair is scored at most once
  it("scores each pipe pair at most once (Property 13)", () => {
    // **Validates: Requirements 5.1, 5.5**
    fc.assert(
      fc.property(
        // A single uncounted pair the ghost is guaranteed to have passed.
        fc.record({
          id: fc.constant(1),
          x: fc.integer({ min: -500, max: 500 }),
          width: fc.integer({ min: 1, max: 100 }),
          gapCenterY: fc.integer({ min: 64, max: 576 }),
          gapHeight: fc.constant(160),
          counted: fc.constant(false),
        }),
        fc.integer({ min: 0, max: SCORE_MAX - 2 }),
        (pipe, startScore) => {
          // Place the ghost strictly past the pair's right edge so it counts.
          const ghost = { x: pipe.x + pipe.width + 1 };

          // First pass: uncounted pair -> score increases by exactly 1 and the
          // pair becomes counted.
          const first = scorePasses(ghost, [pipe], startScore);
          expect(first.score).toBe(startScore + 1);
          expect(first.pipes[0].counted).toBe(true);

          // Second pass of the same (now already-counted) pair: score unchanged.
          const second = scorePasses(ghost, first.pipes, first.score);
          expect(second.score).toBe(first.score);
          expect(second.pipes[0].counted).toBe(true);

          // Any further passes also leave the score unchanged.
          const third = scorePasses(ghost, second.pipes, second.score);
          expect(third.score).toBe(second.score);
        },
      ),
      { numRuns: RUNS },
    );
  });

  // Feature: flappy-kiro, Property 14: Score stays within bounds and saturates
  it("keeps score within 0..SCORE_MAX and saturates at the cap (Property 14)", () => {
    // **Validates: Requirements 5.4**
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SCORE_MAX }),
        // A sequence of scoring events, each an independent uncounted pair the
        // ghost has passed. Each event can add at most 1 to the score.
        fc.array(pipeArb(0), { minLength: 0, maxLength: 30 }),
        (startScore, pipes) => {
          let score = startScore;
          let previous = score;

          for (let i = 0; i < pipes.length; i += 1) {
            // Force this pair to be a fresh, passed, uncounted scoring event.
            const pipe = { ...pipes[i], id: i, counted: false };
            const ghost = { x: pipe.x + pipe.width + 1 };

            const result = scorePasses(ghost, [pipe], score);
            score = result.score;

            // Score never leaves the inclusive bounds.
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(SCORE_MAX);

            // Once at the cap, it never increases further.
            if (previous === SCORE_MAX) {
              expect(score).toBe(SCORE_MAX);
            }

            previous = score;
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});
