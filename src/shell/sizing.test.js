import { describe, it } from "vitest";
import fc from "fast-check";

import { computeCanvasSize } from "./sizing.js";

/**
 * Property-based test for aspect-ratio-preserving canvas sizing.
 *
 * Feature: flappy-kiro, Property 22: Canvas sizing preserves aspect ratio and
 * fits the viewport.
 *
 * **Validates: Requirements 9.3**
 *
 * For any viewport width and height, computeCanvasSize returns dimensions with
 * a 9:16 width:height ratio (within a small float tolerance) that fit entirely
 * within the viewport, with neither dimension exceeding the viewport.
 */

/** Number of fast-check iterations (minimum 100 per task). */
const RUNS = 100;

/** Target ratio width / height = 9 / 16. */
const RATIO = 9 / 16;

describe("Feature: flappy-kiro, Property 22: Canvas sizing preserves aspect ratio and fits the viewport", () => {
  it("returns a 9:16 canvas that fits entirely within any positive viewport (Requirement 9.3)", () => {
    fc.assert(
      fc.property(
        // Positive viewport dimensions spanning tiny to large screens.
        fc.double({ min: 1, max: 100000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1, max: 100000, noNaN: true, noDefaultInfinity: true }),
        (viewportW, viewportH) => {
          const { width, height } = computeCanvasSize(viewportW, viewportH);

          // Fits entirely within the viewport (small epsilon for float slack).
          const fitEps = 1e-6;
          if (width > viewportW + fitEps) return false;
          if (height > viewportH + fitEps) return false;

          // Positive canvas expected for a positive viewport.
          if (!(width > 0) || !(height > 0)) return false;

          // Preserves the 9:16 ratio within a small tolerance relative to the
          // magnitude of the dimensions.
          const ratioTolerance = 1e-6 * (1 + height);
          return Math.abs(width - height * RATIO) <= ratioTolerance;
        },
      ),
      { numRuns: RUNS },
    );
  });
});
