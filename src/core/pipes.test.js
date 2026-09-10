import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  advancePipes,
  shouldSpawn,
  spawnPipe,
  cullOffscreen,
} from "./pipes.js";
import { createRng } from "./rng.js";
import {
  PIPE_SPEED,
  PIPE_SPACING,
  GAP_HEIGHT,
  GAP_CENTER_MIN,
  GAP_CENTER_MAX,
  PIPE_WIDTH,
  PLAY_AREA,
  GHOST_SIZE,
} from "./constants.js";

/**
 * Property-based tests for the pipe system module.
 *
 * These validate the pure lifecycle helpers in `pipes.js`: uniform leftward
 * scrolling, constant spawn spacing, randomized-but-bounded gap generation,
 * passable gap height, and offscreen culling. Randomness is threaded through
 * the seedable RNG so generation stays deterministic and reproducible.
 *
 * All properties run a minimum of 100 iterations via fast-check.
 */

/** An arbitrary for a single Pipe_Pair with a bounded, finite `x`. */
const pipePairArb = fc.record({
  id: fc.integer({ min: 0, max: 2 ** 31 }),
  x: fc.double({ min: -2000, max: 2000, noNaN: true, noDefaultInfinity: true }),
  width: fc.constant(PIPE_WIDTH),
  gapCenterY: fc.double({
    min: GAP_CENTER_MIN,
    max: GAP_CENTER_MAX,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  gapHeight: fc.constant(GAP_HEIGHT),
  counted: fc.boolean(),
});

/** An arbitrary array of Pipe_Pairs. */
const pipesArb = fc.array(pipePairArb, { minLength: 0, maxLength: 20 });

/**
 * Feature: flappy-kiro, Property 8: Pipes scroll uniformly leftward
 * Validates: Requirements 4.1
 *
 * For any set of pipe pairs and any dt, after advancePipes every pair's x
 * decreases by exactly speed * dt.
 */
describe("pipes — Property 8: Pipes scroll uniformly leftward", () => {
  // Feature: flappy-kiro, Property 8: Pipes scroll uniformly leftward
  it("moves every pair left by exactly speed * dt, uniformly (Requirement 4.1)", () => {
    fc.assert(
      fc.property(
        pipesArb,
        // Non-negative timesteps spanning the fixed step and larger jumps.
        fc.double({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
        // A positive scroll speed within the mandated range and beyond.
        fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (pipes, dt, speed) => {
          const advanced = advancePipes(pipes, dt, speed);
          const delta = speed * dt;

          // Same count, same order preserved.
          expect(advanced).toHaveLength(pipes.length);

          for (let i = 0; i < pipes.length; i++) {
            // Each x decreased by exactly the shared delta.
            expect(advanced[i].x).toBe(pipes[i].x - delta);
            // All other fields are unchanged.
            expect(advanced[i].id).toBe(pipes[i].id);
            expect(advanced[i].width).toBe(pipes[i].width);
            expect(advanced[i].gapCenterY).toBe(pipes[i].gapCenterY);
            expect(advanced[i].gapHeight).toBe(pipes[i].gapHeight);
            expect(advanced[i].counted).toBe(pipes[i].counted);
          }

          // Uniformity: every pair's new x is derived from the same shared
          // delta (asserted exactly above via `pipes[i].x - delta`). We confirm
          // uniformity structurally by re-applying that single delta, avoiding
          // a lossy `x - (x - delta)` re-subtraction that can round for
          // subnormal inputs.
          for (let i = 0; i < pipes.length; i++) {
            expect(advanced[i].x).toBe(pipes[i].x - delta);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: flappy-kiro, Property 9: Pipe spawn spacing is constant
 * Validates: Requirements 4.2
 *
 * A pair is generated at the right edge (its generation point is the Play_Area
 * width). shouldSpawn becomes true exactly once the most-recent pair has
 * traveled the fixed PIPE_SPACING from that generation point. Threading a
 * spawn/scroll cycle, the horizontal distance the previous pair has traveled
 * from its generation point at the moment the next spawn fires equals
 * PIPE_SPACING, so consecutive generation points are a constant PIPE_SPACING
 * apart in world-scroll terms.
 */
describe("pipes — Property 9: Pipe spawn spacing is constant", () => {
  // Feature: flappy-kiro, Property 9: Pipe spawn spacing is constant
  it("triggers the next spawn exactly once a pair travels the fixed PIPE_SPACING from its generation point (Requirement 4.2)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        // A step size that divides the field into many increments.
        fc.double({ min: 0.5, max: 10, noNaN: true, noDefaultInfinity: true }),
        (seed, step) => {
          const playAreaWidth = PLAY_AREA.width;
          let rng = createRng(seed);

          // Seed the first pair at the generation point (right edge).
          const first = spawnPipe(rng, PLAY_AREA);
          rng = first.rng;
          let pipes = [first.pipe];

          // The just-spawned pair has not moved: no spawn is yet due.
          expect(shouldSpawn(pipes, PIPE_SPACING, playAreaWidth)).toBe(false);

          // Scroll left in fixed increments until a spawn becomes due.
          let traveledAtTrigger = null;
          for (let i = 0; i < 100000; i++) {
            pipes = advancePipes(pipes, step, 1); // speed 1 => distance == step
            const recentX = Math.max(...pipes.map((p) => p.x));
            const traveled = playAreaWidth - recentX;
            if (shouldSpawn(pipes, PIPE_SPACING, playAreaWidth)) {
              traveledAtTrigger = traveled;
              break;
            }
            // Before the trigger, the most-recent pair has traveled strictly
            // less than the fixed spacing.
            expect(traveled).toBeLessThan(PIPE_SPACING);
          }

          // A spawn must eventually become due, and at the trigger the distance
          // traveled from the generation point is at least the fixed spacing,
          // and within one step of it (the boundary crossed on the last step).
          expect(traveledAtTrigger).not.toBeNull();
          expect(traveledAtTrigger).toBeGreaterThanOrEqual(PIPE_SPACING);
          expect(traveledAtTrigger).toBeLessThan(PIPE_SPACING + step);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: flappy-kiro, Property 10: Generated gap center is within vertical bounds
 * Validates: Requirements 4.3
 *
 * For any RNG state, a spawned pair's gapCenterY is within
 * [GAP_CENTER_MIN, GAP_CENTER_MAX] (>= 10% from top and bottom).
 */
describe("pipes — Property 10: Generated gap center is within vertical bounds", () => {
  // Feature: flappy-kiro, Property 10: Generated gap center is within vertical bounds
  it("keeps gapCenterY within [GAP_CENTER_MIN, GAP_CENTER_MAX] for any RNG state (Requirement 4.3)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        // Number of times to advance the RNG before spawning, exercising many
        // distinct internal states.
        fc.integer({ min: 0, max: 50 }),
        (seed, advances) => {
          let rng = createRng(seed);
          // Advance the RNG through a range of internal states.
          for (let i = 0; i < advances; i++) {
            rng = spawnPipe(rng, PLAY_AREA).rng;
          }

          const { pipe } = spawnPipe(rng, PLAY_AREA);

          expect(pipe.gapCenterY).toBeGreaterThanOrEqual(GAP_CENTER_MIN);
          expect(pipe.gapCenterY).toBeLessThanOrEqual(GAP_CENTER_MAX);

          // Equivalently: no closer than 10% of the height to either edge.
          const tenPercent = 0.1 * PLAY_AREA.height;
          expect(pipe.gapCenterY).toBeGreaterThanOrEqual(tenPercent);
          expect(pipe.gapCenterY).toBeLessThanOrEqual(
            PLAY_AREA.height - tenPercent,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: flappy-kiro, Property 11: Generated gap is passable
 * Validates: Requirements 4.4
 *
 * For any generated pair, gapHeight is within 20%-35% of play area height and
 * >= 1.5 * ghost height.
 */
describe("pipes — Property 11: Generated gap is passable", () => {
  // Feature: flappy-kiro, Property 11: Generated gap is passable
  it("gives every generated pair a gap height in [20%,35%] of height and >= 1.5x ghost height (Requirement 4.4)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.integer({ min: 0, max: 50 }),
        (seed, advances) => {
          let rng = createRng(seed);
          for (let i = 0; i < advances; i++) {
            rng = spawnPipe(rng, PLAY_AREA).rng;
          }

          const { pipe } = spawnPipe(rng, PLAY_AREA);

          const minByPercent = 0.2 * PLAY_AREA.height;
          const maxByPercent = 0.35 * PLAY_AREA.height;
          const minByGhost = 1.5 * GHOST_SIZE.height;

          // Within 20%-35% of the Play_Area height.
          expect(pipe.gapHeight).toBeGreaterThanOrEqual(minByPercent);
          expect(pipe.gapHeight).toBeLessThanOrEqual(maxByPercent);
          // And large enough for the ghost to pass through.
          expect(pipe.gapHeight).toBeGreaterThanOrEqual(minByGhost);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: flappy-kiro, Property 12: Offscreen pipes are culled
 * Validates: Requirements 4.5
 *
 * For any set of pipe pairs, after cullOffscreen no pair remains whose right
 * edge has passed the left edge of the Play_Area.
 */
describe("pipes — Property 12: Offscreen pipes are culled", () => {
  // Feature: flappy-kiro, Property 12: Offscreen pipes are culled
  it("removes every pair whose right edge has passed the left edge, and keeps only those still onscreen (Requirement 4.5)", () => {
    fc.assert(
      fc.property(pipesArb, (pipes) => {
        const kept = cullOffscreen(pipes);

        // No remaining pair has its right edge past the left edge (x=0).
        for (const pipe of kept) {
          expect(pipe.x + pipe.width).toBeGreaterThanOrEqual(0);
        }

        // Completeness: every input pair still onscreen is retained, and every
        // offscreen pair is dropped.
        const expected = pipes.filter((p) => p.x + p.width >= 0);
        expect(kept).toHaveLength(expected.length);

        // Nothing offscreen survives.
        const survivedOffscreen = kept.filter((p) => p.x + p.width < 0);
        expect(survivedOffscreen).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});
