/**
 * Pure core barrel module.
 *
 * The pure core is deterministic and testable: it never imports browser APIs
 * (Canvas, Audio, localStorage, DOM, requestAnimationFrame) and reads no
 * globals. Randomness is threaded through a seedable PRNG state carried in the
 * game state.
 *
 * Core modules (constants, rng, physics, pipes, collision, scoring, state, and
 * the `step` function) are added by later tasks and re-exported here so the
 * shell can import them from a single entry point.
 */

export * from "./constants.js";
export * from "./collision.js";
export * from "./physics.js";
export * from "./pipes.js";
export * from "./rng.js";
export * from "./state.js";
export * from "./scoring.js";
export * from "./step.js";
