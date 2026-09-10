/**
 * Physics module for Flappy Kiro.
 *
 * Part of the pure core: imports no browser APIs, reads no globals, and never
 * mutates its inputs (all helpers return new values / new objects).
 *
 * Coordinate convention: vertical velocity is in units/s where POSITIVE is
 * DOWNWARD and NEGATIVE is UPWARD. A Flap therefore produces a negative
 * velocity (-FLAP_VELOCITY). Gravity increases the downward (positive) velocity
 * but is capped at TERMINAL_VELOCITY.
 */

import { GRAVITY, TERMINAL_VELOCITY, FLAP_VELOCITY } from "./constants.js";

/**
 * Integrate gravity over a timestep, capping the resulting downward velocity at
 * the terminal velocity so it never exceeds the cap (Requirements 3.1, 3.2).
 *
 * Gravity increases the downward (positive) velocity by GRAVITY * dt. The
 * result is clamped so it does not exceed TERMINAL_VELOCITY. Upward (negative)
 * velocities are unaffected by the cap since they are always below it.
 *
 * @param {number} velocityY - Current vertical velocity (units/s; + is down).
 * @param {number} dt - Elapsed time in seconds (>= 0).
 * @returns {number} The new vertical velocity, capped at TERMINAL_VELOCITY.
 */
export function applyGravity(velocityY, dt) {
  const next = velocityY + GRAVITY * dt;
  return next > TERMINAL_VELOCITY ? TERMINAL_VELOCITY : next;
}

/**
 * Produce the single fixed velocity applied on a Flap (Requirement 2.2).
 *
 * Returns the fixed upward flap velocity as a negative value (upward), which
 * replaces any prior velocity rather than accumulating.
 *
 * @returns {number} The fixed upward flap velocity (-FLAP_VELOCITY).
 */
export function applyFlap() {
  return -FLAP_VELOCITY;
}

/**
 * Advance a vertical position by its velocity over a timestep (Requirement 3.3).
 *
 * @param {number} y - Current vertical position (top of the bounding box).
 * @param {number} velocityY - Vertical velocity (units/s; + is down).
 * @param {number} dt - Elapsed time in seconds (>= 0).
 * @returns {number} The new vertical position.
 */
export function integratePosition(y, velocityY, dt) {
  return y + velocityY * dt;
}

/**
 * Enforce the top boundary of the Play_Area (Requirements 2.6, 3.4).
 *
 * The ghost's top edge (`y`) must remain at or below the top boundary (y >= 0).
 * If the ghost has risen above the top edge, its position is clamped to 0. When
 * clamping engages the vertical velocity is zeroed so the ghost does not retain
 * upward momentum against the boundary. Returns a new Ghost object; the input
 * is never mutated.
 *
 * @param {import("./constants.js").Ghost} ghost - The ghost to clamp.
 * @returns {import("./constants.js").Ghost} A new ghost clamped to the top edge.
 */
export function clampToTop(ghost) {
  if (ghost.y < 0) {
    return { ...ghost, y: 0, velocityY: 0 };
  }
  return { ...ghost };
}
