import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createRng, nextRandom } from "./rng.js";

/**
 * Property-based tests for the seedable RNG (Task 2.2).
 *
 * The RNG is the randomness source for pipe generation, so its two guarantees
 * are preconditions for the pipe-generation properties:
 *  - every drawn value lies in [0, 1), which lets pipe generation map draws
 *    into the mandated gap-center and gap-height ranges (Properties 10, 11);
 *  - the same seed reproduces the same sequence, which makes seeded pipe
 *    generation reproducible in tests.
 *
 * Feature: flappy-kiro, Property 10: Generated gap center is within vertical
 * bounds (RNG precondition).
 *
 * _Requirements: 4.3_
 */
describe("rng", () => {
  // Drawing N values by threading the advanced state forward.
  function drawSequence(seed, count) {
    const values = [];
    let rng = createRng(seed);
    for (let i = 0; i < count; i++) {
      const next = nextRandom(rng);
      values.push(next.value);
      rng = next.rng;
    }
    return values;
  }

  it("always produces values in [0, 1)", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 200 }), (seed, n) => {
        for (const value of drawSequence(seed, n)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("reproduces the same sequence for the same seed (determinism)", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 200 }), (seed, n) => {
        const first = drawSequence(seed, n);
        const second = drawSequence(seed, n);
        expect(second).toEqual(first);
      }),
      { numRuns: 100 },
    );
  });

  it("does not mutate the input state when drawing", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rng = createRng(seed);
        const before = rng.seed;
        nextRandom(rng);
        expect(rng.seed).toBe(before);
      }),
      { numRuns: 100 },
    );
  });
});
