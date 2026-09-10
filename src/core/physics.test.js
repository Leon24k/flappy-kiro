import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { applyGravity, applyFlap, integratePosition } from "./physics.js";
import { GRAVITY, TERMINAL_VELOCITY, FLAP_VELOCITY } from "./constants.js";

/**
 * Property-based tests for the physics module.
 *
 * Feature: flappy-kiro, Property 5: Gravity increases downward velocity below
 * terminal.
 * Validates: Requirements 3.1
 */
describe("physics — applyGravity properties", () => {
  // Feature: flappy-kiro, Property 5: Gravity increases downward velocity below terminal
  it("produces a strictly greater (more downward) velocity below terminal (Requirement 3.1)", () => {
    fc.assert(
      fc.property(
        // Any velocity strictly below terminal. Lower bound is generous: even
        // deep upward (negative) velocities are below terminal.
        fc.double({
          min: -100000,
          max: TERMINAL_VELOCITY - 1e-6,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        // A positive timestep. GRAVITY * dt is the (positive) increment.
        fc.double({
          min: 1e-6,
          max: 1,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (velocityY, dt) => {
          const next = applyGravity(velocityY, dt);
          // Gravity adds a strictly positive increment, so the result must be
          // strictly greater than the prior velocity (subject to the terminal
          // cap, which cannot pull it below the prior sub-terminal value).
          expect(next).toBeGreaterThan(velocityY);
          // And it never exceeds the terminal cap.
          expect(next).toBeLessThanOrEqual(TERMINAL_VELOCITY);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: flappy-kiro, Property 3: Flap sets a single fixed upward velocity
 * Validates: Requirements 2.2
 */
describe("physics — Property 3: Flap sets a single fixed upward velocity", () => {
  // Feature: flappy-kiro, Property 3: Flap sets a single fixed upward velocity
  it("returns the single fixed upward flap velocity independent of prior velocity (replacement, not accumulation)", () => {
    fc.assert(
      fc.property(
        // Arbitrary prior vertical velocities (upward negative, downward
        // positive), including extremes, to prove independence from prior state.
        fc.double({ min: -10000, max: 10000, noNaN: true, noDefaultInfinity: true }),
        (priorVelocityY) => {
          const result = applyFlap(priorVelocityY);
          // Flap replaces velocity with the single fixed upward value.
          expect(result).toBe(-FLAP_VELOCITY);
          // Upward means strictly negative under the +down / -up convention.
          expect(result).toBeLessThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: flappy-kiro, Property 6: Downward velocity is capped at terminal velocity
 * Validates: Requirements 3.2
 *
 * For any starting velocity and any number of repeated applyGravity steps, the
 * resulting downward velocity must never exceed TERMINAL_VELOCITY.
 */
describe("physics — Property 6: Downward velocity is capped at terminal velocity", () => {
  // Feature: flappy-kiro, Property 6: Downward velocity is capped at terminal velocity
  it("never lets downward velocity exceed TERMINAL_VELOCITY across repeated gravity steps (Requirement 3.2)", () => {
    fc.assert(
      fc.property(
        // Any plausible starting velocity: strong upward (negative) through
        // already at/above the cap (positive).
        fc.double({
          min: -TERMINAL_VELOCITY * 2,
          max: TERMINAL_VELOCITY * 2,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        // Any number of repeated gravity applications; enough to drive an
        // uncapped value well past the cap.
        fc.integer({ min: 0, max: 500 }),
        // Any non-negative timestep, spanning the fixed step and larger jumps.
        fc.double({
          min: 0,
          max: 1,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (startVelocity, steps, dt) => {
          let velocity = startVelocity;
          for (let i = 0; i < steps; i++) {
            velocity = applyGravity(velocity, dt);
            // After every gravity application the downward velocity is capped.
            expect(velocity).toBeLessThanOrEqual(TERMINAL_VELOCITY);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: flappy-kiro, Property 7: Position integrates velocity
 * Validates: Requirements 3.3
 */
describe("physics — Property 7: Position integrates velocity", () => {
  // Feature: flappy-kiro, Property 7: Position integrates velocity
  it("integratePosition(y, velocityY, dt) equals y + velocityY * dt (Requirement 3.3)", () => {
    fc.assert(
      fc.property(
        // Arbitrary vertical positions.
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        // Arbitrary vertical velocities (upward negative, downward positive).
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        // Non-negative timesteps.
        fc.double({ min: 0, noNaN: true, noDefaultInfinity: true }),
        (y, velocityY, dt) => {
          // Position advances by exactly velocity * dt from the prior position.
          expect(integratePosition(y, velocityY, dt)).toBe(y + velocityY * dt);
        },
      ),
      { numRuns: 200 },
    );
  });
});
