import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { aabbOverlap } from "./collision.js";

/**
 * Property-based tests for the collision module's pure overlap predicate.
 *
 * Feature: flappy-kiro, Property 15: Any collision ends the game
 * Validates: Requirements 6.1, 6.2
 *
 * At this task level we validate the pure AABB overlap predicate directly (the
 * step-level transition to Game_Over is covered by task 8.4). The contract from
 * `aabbOverlap` (Requirement 6.1) is that boxes count as overlapping only when
 * the overlap extent on BOTH axes is at least 1px; boxes that merely touch
 * edge-to-edge do not overlap.
 *
 * `aabbOverlap` computes, on each axis, `overlap = min(aEnd, bEnd) - max(aStart, bStart)`
 * and returns `overlapX >= 1 && overlapY >= 1`. The generators below construct
 * rectangle pairs with a chosen per-axis overlap extent so we can assert the
 * exact boolean expected, driving the >= 1px boundary in both directions.
 */

/**
 * Build a second rectangle relative to a base rectangle `a` such that the
 * signed overlap extent on each axis equals `overlapX` / `overlapY`.
 *
 * Given base span [aStart, aStart + aLen] and a desired overlap extent `ov`,
 * place b's start at `aStart + aLen - ov` with a length large enough that the
 * intersection extent is exactly `ov` (b extends past a's end, so the
 * intersection is bounded by a's end on the right and b's start on the left).
 */
function rectFromOverlaps(a, overlapX, overlapY) {
  const bWidth = a.width + 10; // long enough that a's end bounds the overlap
  const bHeight = a.height + 10;
  return {
    x: a.x + a.width - overlapX,
    y: a.y + a.height - overlapY,
    width: bWidth,
    height: bHeight,
  };
}

describe("collision — Property 15: Any collision ends the game (aabbOverlap predicate)", () => {
  // Feature: flappy-kiro, Property 15: Any collision ends the game
  it("returns true for rectangles overlapping by >= 1px on both axes (Requirement 6.1)", () => {
    fc.assert(
      fc.property(
        // A base rectangle with positive dimensions.
        fc.record({
          x: fc.integer({ min: -500, max: 500 }),
          y: fc.integer({ min: -500, max: 500 }),
          width: fc.integer({ min: 1, max: 400 }),
          height: fc.integer({ min: 1, max: 400 }),
        }),
        // Overlap extents on each axis, constrained to be at least 1px and no
        // larger than the base span (so the intersection is genuinely bounded).
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 1, max: 400 }),
        (a, ovXRaw, ovYRaw) => {
          const overlapX = Math.min(ovXRaw, a.width);
          const overlapY = Math.min(ovYRaw, a.height);
          const b = rectFromOverlaps(a, overlapX, overlapY);
          expect(aabbOverlap(a, b)).toBe(true);
          // Overlap is symmetric.
          expect(aabbOverlap(b, a)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: flappy-kiro, Property 15: Any collision ends the game
  it("returns false when the overlap extent on either axis is < 1px, including edge-touching (Requirement 6.1)", () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer({ min: -500, max: 500 }),
          y: fc.integer({ min: -500, max: 500 }),
          width: fc.integer({ min: 1, max: 400 }),
          height: fc.integer({ min: 1, max: 400 }),
        }),
        // A qualifying (>= 1px) overlap on the "good" axis, so failure is
        // attributable solely to the deficient axis.
        fc.integer({ min: 1, max: 400 }),
        // A sub-1px overlap extent (<= 0 means separated or edge-touching).
        fc.integer({ min: -400, max: 0 }),
        // Which axis is deficient.
        fc.boolean(),
        (a, goodOvRaw, badOv, deficientIsX) => {
          const goodOv = deficientIsX
            ? Math.min(goodOvRaw, a.height)
            : Math.min(goodOvRaw, a.width);
          const b = deficientIsX
            ? rectFromOverlaps(a, badOv, goodOv)
            : rectFromOverlaps(a, goodOv, badOv);
          expect(aabbOverlap(a, b)).toBe(false);
          expect(aabbOverlap(b, a)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: flappy-kiro, Property 15: Any collision ends the game
  it("agrees with a reference overlap computation for arbitrary rectangle pairs (Requirement 6.1)", () => {
    const rectArb = fc.record({
      x: fc.integer({ min: -1000, max: 1000 }),
      y: fc.integer({ min: -1000, max: 1000 }),
      width: fc.integer({ min: 0, max: 800 }),
      height: fc.integer({ min: 0, max: 800 }),
    });
    fc.assert(
      fc.property(rectArb, rectArb, (a, b) => {
        const overlapX =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        const expected = overlapX >= 1 && overlapY >= 1;
        expect(aabbOverlap(a, b)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });
});
