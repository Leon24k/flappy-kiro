import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { step } from "./step.js";
import { createInitialState } from "./state.js";
import {
  PLAY_AREA,
  GHOST_SIZE,
  GHOST_START,
  PIPE_WIDTH,
  GAP_HEIGHT,
  GAP_CENTER_MIN,
  GAP_CENTER_MAX,
  RESTART_LOCKOUT_MS,
} from "./constants.js";

/**
 * Property-based tests for the pure `step` function.
 *
 * These exercise mode-level behaviors of `step(state, dt, inputEvents)` where
 * `inputEvents` is an array of normalized `InputEvent { type: 'flap',
 * timestamp }`. `timeInGameOver` is expressed in seconds, so the restart
 * lockout window is `RESTART_LOCKOUT_MS / 1000` seconds.
 *
 * All properties run a minimum of 100 iterations.
 */

const RUNS = 100;
const LOCKOUT_S = RESTART_LOCKOUT_MS / 1000;

/** A single flap input event with an arbitrary timestamp. */
const flapEvent = (timestamp = 0) => ({ type: "flap", timestamp });

/** A fresh Ready state seeded deterministically. */
function readyState(highScore = 0, seed = 1) {
  return createInitialState(PLAY_AREA, highScore, { seed });
}

/** Arbitrary non-negative fixed delta time, in seconds. */
const dtArb = fc.double({ min: 0, max: 1, noNaN: true });

/** Arbitrary ghost bounding box within the play area. */
const ghostArb = fc.record({
  x: fc.double({ min: 0, max: PLAY_AREA.width - GHOST_SIZE.width, noNaN: true }),
  y: fc.double({ min: -50, max: PLAY_AREA.height, noNaN: true }),
  width: fc.constant(GHOST_SIZE.width),
  height: fc.constant(GHOST_SIZE.height),
  velocityY: fc.double({ min: -700, max: 700, noNaN: true }),
});

/** Arbitrary pipe pair. */
const pipeArb = fc.record({
  id: fc.integer({ min: 0, max: 1_000_000 }),
  x: fc.double({ min: -100, max: PLAY_AREA.width + 100, noNaN: true }),
  width: fc.constant(PIPE_WIDTH),
  gapCenterY: fc.double({ min: GAP_CENTER_MIN, max: GAP_CENTER_MAX, noNaN: true }),
  gapHeight: fc.constant(GAP_HEIGHT),
  counted: fc.boolean(),
});

describe("Feature: flappy-kiro, Property 2: Ready state is inert", () => {
  it("leaves ghost y and velocityY unchanged when stepping without a flap", () => {
    fc.assert(
      fc.property(dtArb, fc.double({ min: -700, max: 700, noNaN: true }), (dt, velocityY) => {
        const base = readyState();
        const state = { ...base, ghost: { ...base.ghost, velocityY } };

        const next = step(state, dt, []);

        expect(next.mode).toBe("Ready");
        expect(next.ghost.y).toBe(state.ghost.y);
        expect(next.ghost.velocityY).toBe(state.ghost.velocityY);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("Feature: flappy-kiro, Property 4: Ghost never rises above the top boundary", () => {
  it("keeps the ghost top edge at or below the top boundary after a Playing step", () => {
    fc.assert(
      fc.property(
        ghostArb,
        dtArb,
        fc.array(pipeArb, { maxLength: 4 }),
        fc.boolean(),
        (ghost, dt, pipes, flap) => {
          const base = readyState();
          const state = {
            ...base,
            mode: "Playing",
            ghost,
            pipes,
          };

          const next = step(state, dt, flap ? [flapEvent()] : []);

          // The ghost's top edge (y) must remain at or below the top edge.
          expect(next.ghost.y).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("Feature: flappy-kiro, Property 15: Any collision ends the game", () => {
  it("transitions Playing to Game_Over when the ghost overlaps a pipe or reaches the ground", () => {
    // Generate states guaranteed to collide: either a pipe overlapping the
    // ghost by >= 1px, or a ghost whose bottom reaches/crosses the ground.
    const collidingState = fc.oneof(
      // Ground collision: place ghost so bottom edge reaches/crosses ground.
      fc.record({ kind: fc.constant("ground") }),
      // Pipe collision: place a pipe column horizontally over the ghost with a
      // gap far from the ghost so both pipes overlap it vertically.
      fc.record({ kind: fc.constant("pipe") }),
    );

    fc.assert(
      fc.property(collidingState, fc.integer({ min: 0, max: 5 }), (variant, seed) => {
        const base = readyState(0, seed + 1);
        const ghost = {
          x: GHOST_START.x,
          y: GHOST_START.y,
          width: GHOST_SIZE.width,
          height: GHOST_SIZE.height,
          velocityY: 0,
        };

        let state;
        if (variant.kind === "ground") {
          // Bottom edge at or below the ground boundary.
          state = {
            ...base,
            mode: "Playing",
            ghost: { ...ghost, y: PLAY_AREA.height - GHOST_SIZE.height },
            pipes: [],
          };
        } else {
          // A pipe column spanning the ghost's x-range, with a gap centered at
          // the top so the bottom pipe overlaps the ghost by well over 1px.
          const pipe = {
            id: 1,
            x: GHOST_START.x - 5,
            width: PIPE_WIDTH,
            gapCenterY: GAP_CENTER_MIN,
            gapHeight: GAP_HEIGHT,
            counted: false,
          };
          state = {
            ...base,
            mode: "Playing",
            ghost,
            pipes: [pipe],
          };
        }

        // Use dt = 0 so physics does not move the ghost out of the collision.
        const next = step(state, 0, []);

        expect(next.mode).toBe("Game_Over");
      }),
      { numRuns: RUNS },
    );
  });
});

describe("Feature: flappy-kiro, Property 16: Game_Over freezes the pipe field", () => {
  it("adds no new pipes and changes no pipe x-position when stepping", () => {
    fc.assert(
      fc.property(
        fc.array(pipeArb, { maxLength: 6 }),
        dtArb,
        fc.boolean(),
        (pipes, dt, flap) => {
          const base = readyState();
          const state = {
            ...base,
            mode: "Game_Over",
            pipes,
            timeInGameOver: 0,
          };

          const next = step(state, dt, flap ? [flapEvent()] : []);

          // No new pipes were added and no x-position changed.
          expect(next.pipes.length).toBe(pipes.length);
          for (let i = 0; i < pipes.length; i++) {
            expect(next.pipes[i].x).toBe(pipes[i].x);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("Feature: flappy-kiro, Property 17: Game_Over transition is idempotent", () => {
  it("does not re-trigger the Game_Over transition when stepping again", () => {
    fc.assert(
      fc.property(
        fc.array(pipeArb, { maxLength: 6 }),
        dtArb,
        fc.integer({ min: 0, max: 999999 }),
        fc.integer({ min: 0, max: 999999 }),
        (pipes, dt, score, highScore) => {
          const base = readyState();
          const state = {
            ...base,
            mode: "Game_Over",
            pipes,
            score,
            highScore,
            timeInGameOver: 0.1,
          };

          const next = step(state, dt, []);

          // Still Game_Over; the high score is not re-folded (would change only
          // on a fresh Playing->Game_Over transition).
          expect(next.mode).toBe("Game_Over");
          expect(next.highScore).toBe(highScore);
          expect(next.score).toBe(score);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("Feature: flappy-kiro, Property 18: Flap during the restart lockout is a no-op", () => {
  it("keeps mode Game_Over and ghost position/velocity unchanged for a flap before lockout elapses", () => {
    fc.assert(
      fc.property(
        // timeInGameOver strictly below the lockout window (in seconds), split
        // into a starting time and an added dt whose sum stays below the window
        // so the flap is ignored after accumulation.
        fc.double({ min: 0, max: LOCKOUT_S, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        ghostArb,
        (total, split, ghost) => {
          fc.pre(total < LOCKOUT_S);
          // total = t0 + dt, both < LOCKOUT_S guaranteed since total < LOCKOUT_S.
          const t0 = total * split;
          const dt = total - t0;

          const base = readyState();
          const state = {
            ...base,
            mode: "Game_Over",
            ghost,
            timeInGameOver: t0,
          };

          const next = step(state, dt, [flapEvent()]);

          expect(next.mode).toBe("Game_Over");
          expect(next.ghost.x).toBe(ghost.x);
          expect(next.ghost.y).toBe(ghost.y);
          expect(next.ghost.velocityY).toBe(ghost.velocityY);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("Feature: flappy-kiro, Property 19: Flap after lockout restarts to Ready", () => {
  it("resets the ghost to start, sets score 0, and sets mode Ready for a flap after lockout", () => {
    fc.assert(
      fc.property(
        // Accumulated time at or beyond the lockout window (in seconds).
        fc.double({ min: LOCKOUT_S, max: LOCKOUT_S + 10, noNaN: true }),
        dtArb,
        ghostArb,
        fc.integer({ min: 0, max: 999999 }),
        (t0, dt, ghost, score) => {
          const base = readyState();
          const state = {
            ...base,
            mode: "Game_Over",
            ghost,
            score,
            // Ensure timeInGameOver + dt is still >= lockout; t0 already is.
            timeInGameOver: t0,
          };

          const next = step(state, dt, [flapEvent()]);

          expect(next.mode).toBe("Ready");
          expect(next.score).toBe(0);
          expect(next.ghost.x).toBe(GHOST_START.x);
          expect(next.ghost.y).toBe(GHOST_START.y);
          expect(next.ghost.velocityY).toBe(0);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
