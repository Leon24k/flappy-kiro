import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLoop } from "./loop.js";
import { FIXED_DT, PLAY_AREA } from "../core/constants.js";
import { createRng } from "../core/rng.js";
import { createInitialState } from "../core/state.js";
import { step as coreStep } from "../core/step.js";

/**
 * Integration tests for the game loop's transition wiring (task 16.3).
 *
 * These exercise `createLoop` with fully mocked adapters (audio, storage via
 * `saveHighScore`, renderer, and an input queue) and a stubbed
 * `requestAnimationFrame` plus a controllable millisecond clock. The point is
 * to verify the LOOP's orchestration — draining input, detecting mode
 * transitions across fixed sub-steps, and firing the corresponding shell side
 * effects — not the pure physics (which the core property tests cover).
 *
 * Covered:
 *   - Ready -> Playing on a drained flap (Requirement 2.1) — driven through the
 *     REAL core step so the wiring is exercised end-to-end.
 *   - Audio on transitions: playFlap on Ready -> Playing (2.3), playGameOver on
 *     Playing -> Game_Over (6.3).
 *   - High score persisted on Game_Over via saveHighScore (8.1, 8.2).
 *   - Pipe-generation error path retains pipes and surfaces an error (4.6),
 *     driven through the loop with a step that mimics the bootstrap guard.
 */

/* -------------------------------------------------------------------------- */
/* Test harness: a manually-driven RAF and clock.                            */
/* -------------------------------------------------------------------------- */

/**
 * Build a manually-pumped frame scheduler. Each `start()` / scheduled frame is
 * queued rather than run; the test advances the loop by calling `tick(ms)`,
 * which sets the clock to `ms` and invokes the single pending frame callback
 * with that timestamp.
 */
function makeHarness(startMs = 0) {
  let clockMs = startMs;
  /** @type {((t: number) => void) | null} */
  let pending = null;
  let nextHandle = 1;
  const cancelled = [];

  const raf = vi.fn((cb) => {
    pending = cb;
    return nextHandle++;
  });
  const cancelRaf = vi.fn((handle) => {
    cancelled.push(handle);
    pending = null;
  });
  const now = () => clockMs;

  /**
   * Advance the clock to `ms` and run the currently-scheduled frame with that
   * timestamp. The frame body reschedules itself, so a subsequent `tick` runs
   * the next frame.
   */
  const tick = (ms) => {
    clockMs = ms;
    const cb = pending;
    pending = null;
    if (cb) {
      cb(ms);
    }
  };

  return { raf, cancelRaf, now, tick, get cancelled() { return cancelled; }, set clock(v) { clockMs = v; } };
}

/** A mocked audio player. */
function makeAudio() {
  return { playFlap: vi.fn(), playGameOver: vi.fn() };
}

/** A mocked input queue whose drain result is set per-frame by the test. */
function makeInput() {
  let queued = [];
  return {
    drain: vi.fn(() => {
      const out = queued;
      queued = [];
      return out;
    }),
    enqueueFlap(timestamp = 0) {
      queued = [...queued, { type: "flap", timestamp }];
    },
  };
}

/**
 * How many whole FIXED_DT sub-steps a real elapsed of `seconds` produces given
 * a fresh accumulator. Elapsed on the very first frame is 0 (baseline), so
 * tests advance the clock across two ticks: the first establishes the baseline
 * and the second delivers the elapsed time.
 */
const secondsForSteps = (n) => n * FIXED_DT + FIXED_DT / 2; // half a step of slack

describe("createLoop transitions and wiring (task 16.3)", () => {
  let harness;
  let audio;
  let input;
  let saveHighScore;
  let render;
  let setState;

  beforeEach(() => {
    harness = makeHarness(1000);
    audio = makeAudio();
    input = makeInput();
    saveHighScore = vi.fn();
    render = vi.fn();
    setState = vi.fn();
  });

  /**
   * Wire a loop around the given initial state and step, using the shared
   * harness/adapters. Returns the loop plus a `getLast` reading the most recent
   * state handed to setState.
   */
  function wire({ initial, step }) {
    let current = initial;
    const getState = () => initial;
    const trackSetState = vi.fn((s) => {
      current = s;
      setState(s);
    });
    const loop = createLoop({
      getState,
      setState: trackSetState,
      step,
      render,
      ctx: { canvas: { width: 360, height: 640 } },
      assets: {},
      input,
      audio,
      saveHighScore,
      now: harness.now,
      raf: harness.raf,
      cancelRaf: harness.cancelRaf,
    });
    return { loop, getLast: () => current };
  }

  /* --- Requirement 2.1: Ready -> Playing on flap (real core step). ------ */

  it("transitions Ready -> Playing when a flap is drained (2.1), driven by the real core step", () => {
    const initial = createInitialState(PLAY_AREA, 0, createRng(1));
    expect(initial.mode).toBe("Ready");

    const { loop, getLast } = wire({ initial, step: coreStep });
    loop.start();

    // Frame 1 establishes the timing baseline (elapsed 0, no sub-steps).
    harness.tick(1000);
    expect(getLast().mode).toBe("Ready");

    // Queue a flap, then run a frame with enough elapsed time for >= 1 sub-step.
    input.enqueueFlap(1010);
    harness.tick(1000 + secondsForSteps(1) * 1000);

    expect(getLast().mode).toBe("Playing");
  });

  /* --- Requirement 2.3: playFlap on Ready -> Playing. ------------------- */

  it("fires audio.playFlap exactly once on the Ready -> Playing transition (2.3)", () => {
    const initial = createInitialState(PLAY_AREA, 0, createRng(1));
    const { loop } = wire({ initial, step: coreStep });
    loop.start();

    harness.tick(1000); // baseline
    input.enqueueFlap(1010);
    harness.tick(1000 + secondsForSteps(1) * 1000);

    expect(audio.playFlap).toHaveBeenCalledTimes(1);
    expect(audio.playGameOver).not.toHaveBeenCalled();
    expect(saveHighScore).not.toHaveBeenCalled();
  });

  it("does not fire playFlap again while already Playing (single transition)", () => {
    const initial = createInitialState(PLAY_AREA, 0, createRng(1));
    const { loop } = wire({ initial, step: coreStep });
    loop.start();

    harness.tick(1000);
    input.enqueueFlap(1010);
    harness.tick(1000 + secondsForSteps(1) * 1000);
    expect(audio.playFlap).toHaveBeenCalledTimes(1);

    // A second flap while Playing is a gameplay flap, not a mode transition:
    // the loop must not re-fire playFlap.
    input.enqueueFlap(1050);
    harness.tick(1000 + secondsForSteps(2) * 1000);
    expect(audio.playFlap).toHaveBeenCalledTimes(1);
  });

  /* --- Requirements 6.3, 8.1, 8.2: Playing -> Game_Over side effects. --- */

  it("fires playGameOver and persists the high score on Playing -> Game_Over (6.3, 8.1, 8.2)", () => {
    // A Playing state that the fake step will turn into Game_Over on the first
    // sub-step, folding the running-maximum high score to 7.
    const playing = {
      mode: "Playing",
      ghost: { x: 90, y: 100, width: 34, height: 24, velocityY: 0 },
      pipes: [],
      score: 7,
      highScore: 3,
      distanceSinceLastSpawn: 0,
      timeInGameOver: 0,
      rng: createRng(1),
    };

    // Fake step: Playing -> Game_Over, folding highScore = max(score, highScore).
    const step = vi.fn((s) => {
      if (s.mode === "Playing") {
        return { ...s, mode: "Game_Over", highScore: Math.max(s.score, s.highScore), timeInGameOver: 0 };
      }
      return s;
    });

    const { loop, getLast } = wire({ initial: playing, step });
    loop.start();

    harness.tick(1000); // baseline
    harness.tick(1000 + secondsForSteps(1) * 1000);

    expect(getLast().mode).toBe("Game_Over");
    expect(audio.playGameOver).toHaveBeenCalledTimes(1);
    expect(audio.playFlap).not.toHaveBeenCalled();
    // The loop persists next.highScore (the running maximum folded by the core).
    expect(saveHighScore).toHaveBeenCalledTimes(1);
    expect(saveHighScore).toHaveBeenCalledWith(7);
  });

  it("persists the existing high score when it already exceeds the session score (8.1, 8.2)", () => {
    const playing = {
      mode: "Playing",
      ghost: { x: 90, y: 100, width: 34, height: 24, velocityY: 0 },
      pipes: [],
      score: 2,
      highScore: 40,
      distanceSinceLastSpawn: 0,
      timeInGameOver: 0,
      rng: createRng(1),
    };
    const step = vi.fn((s) =>
      s.mode === "Playing" ? { ...s, mode: "Game_Over", highScore: Math.max(s.score, s.highScore) } : s,
    );

    const { loop } = wire({ initial: playing, step });
    loop.start();
    harness.tick(1000);
    harness.tick(1000 + secondsForSteps(1) * 1000);

    expect(saveHighScore).toHaveBeenCalledWith(40);
  });

  it("does not re-fire playGameOver or re-persist once already in Game_Over (idempotent wiring)", () => {
    const playing = {
      mode: "Playing",
      ghost: { x: 90, y: 100, width: 34, height: 24, velocityY: 0 },
      pipes: [],
      score: 5,
      highScore: 1,
      distanceSinceLastSpawn: 0,
      timeInGameOver: 0,
      rng: createRng(1),
    };
    const step = vi.fn((s) =>
      s.mode === "Playing"
        ? { ...s, mode: "Game_Over", highScore: Math.max(s.score, s.highScore), timeInGameOver: 0 }
        : { ...s, timeInGameOver: s.timeInGameOver + FIXED_DT },
    );

    const { loop, getLast } = wire({ initial: playing, step });
    loop.start();
    harness.tick(1000);
    // Run several frames worth of sub-steps; only the first crosses into Game_Over.
    harness.tick(1000 + secondsForSteps(3) * 1000);
    harness.tick(1000 + secondsForSteps(6) * 1000);

    expect(getLast().mode).toBe("Game_Over");
    expect(audio.playGameOver).toHaveBeenCalledTimes(1);
    expect(saveHighScore).toHaveBeenCalledTimes(1);
  });

  /* --- Requirement 4.6: pipe-generation error path retains pipes. ------- */

  it("retains existing pipes and surfaces an error when pipe generation fails (4.6)", () => {
    // Mirror the bootstrap's guardPipeGeneration: when bounds are unavailable
    // while Playing, retain the pipes unchanged and flag an error, WITHOUT
    // advancing the core step. Wired through the loop with mocked adapters.
    const existingPipes = [
      { id: 1, x: 200, width: 60, gapCenterY: 300, gapHeight: 160, counted: false },
      { id: 2, x: 420, width: 60, gapCenterY: 260, gapHeight: 160, counted: false },
    ];
    const playing = {
      mode: "Playing",
      ghost: { x: 90, y: 100, width: 34, height: 24, velocityY: 0 },
      pipes: existingPipes,
      score: 0,
      highScore: 0,
      distanceSinceLastSpawn: 0,
      timeInGameOver: 0,
      rng: createRng(1),
    };

    let generationError = false;
    let boundsAvailable = false; // simulate Play_Area bounds unavailable
    const innerStep = vi.fn(() => {
      throw new Error("core step should not run when bounds are unavailable");
    });
    const guardedStep = (s, dt, inputs) => {
      if (s && s.mode === "Playing" && !boundsAvailable) {
        generationError = true;
        return { ...s, pipes: s.pipes }; // retain existing pipes unchanged
      }
      generationError = false;
      return innerStep(s, dt, inputs);
    };

    // Renderer records whether the error indication would be surfaced.
    const errorRenders = [];
    const errorAwareRender = vi.fn((ctx, s) => {
      errorRenders.push(generationError);
    });

    const loop = createLoop({
      getState: () => playing,
      setState,
      step: guardedStep,
      render: errorAwareRender,
      ctx: { canvas: { width: 360, height: 640 } },
      assets: {},
      input,
      audio,
      saveHighScore,
      now: harness.now,
      raf: harness.raf,
      cancelRaf: harness.cancelRaf,
    });

    loop.start();
    harness.tick(1000); // baseline
    harness.tick(1000 + secondsForSteps(2) * 1000);

    // The core step never ran (guard short-circuited it).
    expect(innerStep).not.toHaveBeenCalled();
    // The last rendered state retained the original pipes, unchanged.
    const last = setState.mock.calls.at(-1)[0];
    expect(last.pipes).toEqual(existingPipes);
    expect(last.pipes).toHaveLength(2);
    // An error indication was active on render.
    expect(errorRenders.some((flag) => flag === true)).toBe(true);
    // The loop stayed alive and did not crash the frame.
    expect(loop.isRunning()).toBe(true);
  });

  it("clears the pipe-generation error once bounds are restored (4.6 recovery)", () => {
    const existingPipes = [{ id: 1, x: 200, width: 60, gapCenterY: 300, gapHeight: 160, counted: false }];
    const playing = {
      mode: "Playing",
      ghost: { x: 90, y: 100, width: 34, height: 24, velocityY: 0 },
      pipes: existingPipes,
      score: 0,
      highScore: 0,
      distanceSinceLastSpawn: 0,
      timeInGameOver: 0,
      rng: createRng(1),
    };

    let generationError = false;
    let boundsAvailable = false;
    const guardedStep = (s) => {
      if (s && s.mode === "Playing" && !boundsAvailable) {
        generationError = true;
        return { ...s, pipes: s.pipes };
      }
      generationError = false;
      return s; // bounds available: pass through (no-op step for this test)
    };

    const errorRenders = [];
    const errorAwareRender = vi.fn(() => errorRenders.push(generationError));

    const loop = createLoop({
      getState: () => playing,
      setState,
      step: guardedStep,
      render: errorAwareRender,
      ctx: { canvas: { width: 360, height: 640 } },
      assets: {},
      input,
      audio,
      saveHighScore,
      now: harness.now,
      raf: harness.raf,
      cancelRaf: harness.cancelRaf,
    });

    loop.start();
    harness.tick(1000);
    harness.tick(1000 + secondsForSteps(1) * 1000);
    expect(generationError).toBe(true);

    // Restore bounds; a subsequent frame clears the error indication.
    boundsAvailable = true;
    harness.tick(1000 + secondsForSteps(2) * 1000);
    expect(generationError).toBe(false);
  });

  /* --- General wiring sanity: input drained, render invoked. ------------ */

  it("drains the input queue and renders once per frame with sub-steps", () => {
    const initial = createInitialState(PLAY_AREA, 0, createRng(1));
    const { loop } = wire({ initial, step: coreStep });
    loop.start();

    harness.tick(1000); // baseline frame: still drains + renders
    harness.tick(1000 + secondsForSteps(1) * 1000);

    expect(input.drain).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });
});
