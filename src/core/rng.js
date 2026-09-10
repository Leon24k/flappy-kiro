/**
 * Seedable pseudo-random number generator for the pure core.
 *
 * This module is part of the pure core: it imports no browser APIs and reads no
 * globals. Randomness is threaded through an immutable-by-convention
 * {@link RngState} carried in the game state so that `step` and pipe generation
 * stay pure and reproducible in tests (Requirement 4.3). Production code seeds
 * from a time source (e.g. `Date.now()`); tests seed with fixed values.
 *
 * The algorithm is mulberry32: a fast 32-bit generator with a single 32-bit
 * state word. It produces well-distributed values in [0, 1) and is fully
 * deterministic for a given seed.
 *
 * @typedef {import('./constants.js').RngState} RngState
 */

/**
 * Coerce an arbitrary numeric seed into a 32-bit unsigned integer state word.
 * Non-finite inputs collapse to 0 so the generator remains total.
 *
 * @param {number} seed
 * @returns {number} A 32-bit unsigned integer.
 */
function toStateWord(seed) {
  if (!Number.isFinite(seed)) {
    return 0;
  }
  // `>>> 0` truncates to a 32-bit unsigned integer.
  return Math.trunc(seed) >>> 0;
}

/**
 * Create an initial PRNG state from a seed.
 *
 * The input is not mutated; a fresh {@link RngState} is returned.
 *
 * @param {number} seed - Any number; coerced to a 32-bit state word.
 * @returns {RngState} A new PRNG state.
 */
export function createRng(seed) {
  return { seed: toStateWord(seed) };
}

/**
 * Draw the next pseudo-random value and advance the generator.
 *
 * Pure: the input `rng` is not mutated. Returns the drawn value in [0, 1) and a
 * new, advanced {@link RngState}. Threading the returned state forward yields a
 * deterministic sequence for a given starting seed.
 *
 * @param {RngState} rng - The current PRNG state (not mutated).
 * @returns {{ value: number, rng: RngState }} The value in [0, 1) and the
 *   advanced state.
 */
export function nextRandom(rng) {
  // mulberry32: advance the 32-bit state, then hash it into a float in [0, 1).
  let a = (rng.seed + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: { seed: a } };
}
