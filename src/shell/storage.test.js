import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import { loadHighScore, saveHighScore, HIGH_SCORE_KEY } from "./storage.js";

/**
 * Tests for the high-score persistence adapter (`src/shell/storage.js`).
 *
 * Two concerns live here, in separate describe blocks:
 *  - Property 21 (Task 10.2): high-score parsing is total and safe (Req 8.4).
 *  - Integration (Task 10.3): load/save/failure against a mocked localStorage
 *    (Req 8.2, 8.3, 8.5).
 *
 * The jsdom environment (see vitest.config.js) provides a real `localStorage`,
 * which we spy on / stub per test rather than mutating global state directly.
 */

// ---------------------------------------------------------------------------
// Task 10.2 — Property 21: High score parsing is total and safe
// Feature: flappy-kiro, Property 21: High score parsing is total and safe
// Validates: Requirements 8.4
// ---------------------------------------------------------------------------
describe("Property 21: High score parsing is total and safe (8.4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a non-negative integer for any arbitrary stored string", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        // Stub getItem to return the generated raw string for the high-score key.
        vi.spyOn(Storage.prototype, "getItem").mockReturnValue(raw);

        const result = loadHighScore();

        // Totality: always a non-negative integer, never throws, never NaN.
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);

        // Correctness of the mapping: a strictly-decimal-digit string (with an
        // optional leading '+') parses to its finite non-negative value; every
        // other shape (whitespace-only, negative, fractional, scientific, hex,
        // trailing garbage, empty, non-numeric) maps to 0.
        const trimmed = raw.trim();
        if (/^\+?\d+$/.test(trimmed)) {
          const expected = Number(trimmed);
          if (Number.isFinite(expected)) {
            expect(result).toBe(Math.trunc(expected));
          } else {
            expect(result).toBe(0);
          }
        } else {
          expect(result).toBe(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("parses valid non-negative integer strings to their value", () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        vi.spyOn(Storage.prototype, "getItem").mockReturnValue(String(n));
        expect(loadHighScore()).toBe(n);
      }),
      { numRuns: 200 },
    );
  });

  it("maps negative integer strings to 0", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: -1 }), (n) => {
        vi.spyOn(Storage.prototype, "getItem").mockReturnValue(String(n));
        expect(loadHighScore()).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 10.3 — Integration tests for storage load/save/failure
// Validates: Requirements 8.2, 8.3, 8.5
// ---------------------------------------------------------------------------
describe("storage adapter integration (8.2, 8.3, 8.5)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("loads the high score from the 'flappy-kiro.highScore' key on init (8.3)", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    localStorage.setItem(HIGH_SCORE_KEY, "42");

    const result = loadHighScore();

    expect(HIGH_SCORE_KEY).toBe("flappy-kiro.highScore");
    expect(getItem).toHaveBeenCalledWith("flappy-kiro.highScore");
    expect(result).toBe(42);
  });

  it("persists the high score as a decimal string to that key on update (8.2)", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    saveHighScore(1234);

    expect(setItem).toHaveBeenCalledWith("flappy-kiro.highScore", "1234");
    expect(localStorage.getItem(HIGH_SCORE_KEY)).toBe("1234");
    // Round-trips back through the loader.
    expect(loadHighScore()).toBe(1234);
  });

  it("tolerates a write failure without throwing (8.5)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => saveHighScore(7)).not.toThrow();
  });
});
