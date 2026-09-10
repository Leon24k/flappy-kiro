/**
 * High-score persistence adapter (impure shell).
 *
 * This is a browser adapter: it is the only place that touches `localStorage`
 * for the high score. It confines that side effect behind two total functions
 * so the rest of the game never has to reason about missing keys, malformed
 * values, or storage write failures.
 *
 * Persisted model (see design "Persisted Model"): the high score is stored
 * under the key `flappy-kiro.highScore` as a decimal string.
 *
 * Requirements:
 * - 8.2: persist the high score to local storage when it is updated.
 * - 8.3: load the high score from local storage on startup.
 * - 8.4: a missing, non-numeric, negative, or otherwise unparseable stored
 *   value maps to 0.
 * - 8.5: a failed write is swallowed so gameplay continues uninterrupted.
 */

/** localStorage key under which the high score is persisted. */
export const HIGH_SCORE_KEY = "flappy-kiro.highScore";

/**
 * Read the underlying storage safely.
 *
 * `localStorage` access can throw (e.g. disabled storage, security policies) or
 * be absent (non-browser environments). Any failure is treated as "no stored
 * value" so the caller degrades to the default rather than crashing.
 *
 * @returns {string | null} The raw stored string, or null if unavailable.
 */
function readRaw() {
  try {
    if (typeof localStorage === "undefined" || localStorage === null) {
      return null;
    }
    return localStorage.getItem(HIGH_SCORE_KEY);
  } catch {
    return null;
  }
}

/**
 * Load the persisted high score.
 *
 * Total and safe (Requirement 8.4, Property 21): a valid non-negative integer
 * string parses to its value; a missing, non-numeric, negative, fractional, or
 * otherwise unparseable value yields 0.
 *
 * Parsing is strict: the trimmed string must consist solely of decimal digits
 * (optionally with a leading `+`). This rejects inputs that `parseInt` would
 * otherwise accept leniently, such as `"12abc"`, `"0x1F"`, `"1e3"`, and
 * `"  42px"`, all of which map to 0.
 *
 * @returns {number} A non-negative integer high score, or 0.
 */
export function loadHighScore() {
  const raw = readRaw();
  if (raw === null || raw === undefined) {
    return 0;
  }

  const trimmed = String(raw).trim();
  // Reject anything that is not a run of decimal digits (an optional leading
  // '+' is allowed). This excludes negatives, fractions, scientific notation,
  // hex, and trailing garbage — all of which must map to 0 per Requirement 8.4.
  if (!/^\+?\d+$/.test(trimmed)) {
    return 0;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  // The regex guarantees an integer; normalize just in case (e.g. leading '+').
  return Math.trunc(parsed);
}

/**
 * Persist the high score.
 *
 * Writes the value as a decimal string (Requirement 8.2). Any write failure —
 * quota exceeded, disabled storage, security exception — is swallowed so that
 * gameplay continues without interruption (Requirement 8.5). The in-session
 * high score is the caller's responsibility to retain.
 *
 * @param {number} n - The high score to persist. Expected to be a non-negative
 *   integer; non-finite or negative inputs are not written.
 * @returns {void}
 */
export function saveHighScore(n) {
  if (!Number.isFinite(n) || n < 0) {
    return;
  }

  const value = String(Math.trunc(n));
  try {
    if (typeof localStorage === "undefined" || localStorage === null) {
      return;
    }
    localStorage.setItem(HIGH_SCORE_KEY, value);
  } catch {
    // Swallow write failures (Requirement 8.5): gameplay must not be interrupted.
  }
}
