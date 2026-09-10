import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createInitialState, transition } from "./state.js";
import { GHOST_SIZE } from "./constants.js";

/**
 * Property-based tests for the state machine module.
 *
 * Feature: flappy-kiro, Property 1: Ready state initial ghost placement
 * Validates: Requirements 1.2
 *
 * For any Play_Area dimensions, createInitialState places the ghost
 * horizontally at 25% of the width and centered vertically (y is the top of
 * the bounding box, so it sits half the ghost height above the vertical
 * center). The initial mode is Ready.
 */
describe("state — Property 1: Ready state initial ghost placement", () => {
  // Feature: flappy-kiro, Property 1: Ready state initial ghost placement
  it("places the ghost at 25% width and vertically centered for any Play_Area (Requirement 1.2)", () => {
    fc.assert(
      fc.property(
        // Arbitrary positive Play_Area dimensions, spanning small to large.
        fc.double({ min: 1, max: 100000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1, max: 100000, noNaN: true, noDefaultInfinity: true }),
        // Any non-negative high score carried through.
        fc.integer({ min: 0, max: 999999 }),
        // Any RNG state threaded through.
        fc.integer({ min: 0, max: 0xffffffff }),
        (width, height, highScore, seed) => {
          const playArea = { width, height };
          const rng = { seed };

          const state = createInitialState(playArea, highScore, rng);

          // Fresh Ready state with a stationary ghost.
          expect(state.mode).toBe("Ready");
          // Horizontal placement: 25% of the Play_Area width.
          expect(state.ghost.x).toBe(0.25 * width);
          // Vertical placement: centered, offset up by half the ghost height
          // because y is the top of the bounding box.
          expect(state.ghost.y).toBe(height / 2 - GHOST_SIZE.height / 2);
          expect(state.ghost.velocityY).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: flappy-kiro, Property 20: High score is the running maximum
 * Validates: Requirements 8.1
 *
 * For any current score and stored high score, the Playing -> Game_Over
 * transition (a collision event) yields a high score equal to
 * max(currentScore, priorHighScore).
 */
describe("state — Property 20: High score is the running maximum", () => {
  // Feature: flappy-kiro, Property 20: High score is the running maximum
  it("sets high score to max(currentScore, priorHighScore) on the Game_Over transition (Requirement 8.1)", () => {
    fc.assert(
      fc.property(
        // Any current session score within bounds.
        fc.integer({ min: 0, max: 999999 }),
        // Any prior stored high score within bounds.
        fc.integer({ min: 0, max: 999999 }),
        (currentScore, priorHighScore) => {
          // A Playing state carrying the given score and high score.
          const playing = {
            mode: "Playing",
            ghost: { x: 0, y: 0, width: 34, height: 24, velocityY: 0 },
            pipes: [],
            score: currentScore,
            highScore: priorHighScore,
            distanceSinceLastSpawn: 0,
            timeInGameOver: 0,
            rng: { seed: 1 },
          };

          const next = transition(playing, { type: "collision" });

          // The collision ends the game and folds the score into the
          // running-maximum high score.
          expect(next.mode).toBe("Game_Over");
          expect(next.highScore).toBe(Math.max(currentScore, priorHighScore));
          // The high score never decreases below the prior value nor below
          // the achieved score.
          expect(next.highScore).toBeGreaterThanOrEqual(priorHighScore);
          expect(next.highScore).toBeGreaterThanOrEqual(currentScore);
        },
      ),
      { numRuns: 100 },
    );
  });
});
