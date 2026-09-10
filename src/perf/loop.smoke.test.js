import { describe, it, expect } from "vitest";
import { createInitialState } from "../core/state.js";
import { step } from "../core/step.js";
import { createRng } from "../core/rng.js";
import { PLAY_AREA, FIXED_DT, PIPE_SPEED, GAP_HEIGHT, PIPE_WIDTH } from "../core/constants.js";

/**
 * Performance smoke test for the Playing loop (Requirement 9.2).
 *
 * Per the design's Testing Strategy ("Performance Smoke Test"): a single
 * measured run verifies the Playing loop sustains at least 55 fps against the
 * 60 fps target. This is a smoke/performance check, not a property test.
 *
 * ## What is measured
 *
 * The real game loop is driven by `requestAnimationFrame`, whose cadence cannot
 * be measured meaningfully in a headless test runner (RAF/vsync is provided by
 * the browser, not the code under test). What the code under test actually
 * controls is the per-frame work: the pure `step` transition plus a render.
 * So this test measures the *throughput* of that per-frame work — how many
 * frames of Playing simulation + render the machine can complete per second of
 * wall-clock time — and asserts it comfortably exceeds the 55 fps floor.
 *
 * A representative Playing state is used: an active ghost falling under gravity
 * with several on-screen pipe pairs, matching a mid-game frame. The per-frame
 * work mirrors the loop: run `step(state, FIXED_DT, input)` then a render. The
 * render is a lightweight stand-in that touches the same state a real renderer
 * would (ghost + every pipe) so the measured work is representative without a
 * real Canvas.
 *
 * A generous margin keeps the test non-flaky on slower CI machines: the pure
 * core step is very cheap, so effective throughput is far above 55 fps.
 */

/**
 * Build a representative mid-game Playing state: an active ghost plus several
 * pipe pairs spread across the Play_Area at various gap centers.
 *
 * @returns {import('../core/constants.js').GameState}
 */
function makeRepresentativePlayingState() {
  const base = createInitialState(PLAY_AREA, 0, createRng(12345));

  // Five pipe pairs spaced across the Play_Area, as would exist mid-game.
  const pipes = [];
  for (let i = 0; i < 5; i++) {
    pipes.push({
      id: i + 1,
      x: PLAY_AREA.width - i * 80,
      width: PIPE_WIDTH,
      gapCenterY: 160 + (i % 3) * 120,
      gapHeight: GAP_HEIGHT,
      counted: false,
    });
  }

  return {
    ...base,
    mode: "Playing",
    ghost: { ...base.ghost, y: PLAY_AREA.height / 2, velocityY: 120 },
    pipes,
    distanceSinceLastSpawn: 40,
  };
}

/**
 * A lightweight stand-in for the renderer's per-frame cost. It reads the same
 * fields a real renderer touches (ghost box + every pipe's derived rects) so
 * the measured per-frame work is representative, without a real Canvas.
 *
 * The accumulator is returned so the JIT cannot eliminate the "draw" work as
 * dead code.
 *
 * @param {import('../core/constants.js').GameState} state
 * @returns {number}
 */
function mockRender(state) {
  let acc = 0;
  const g = state.ghost;
  acc += g.x + g.y + g.width + g.height + g.velocityY;
  for (const p of state.pipes) {
    const topHeight = p.gapCenterY - p.gapHeight / 2;
    const bottomY = p.gapCenterY + p.gapHeight / 2;
    const bottomHeight = PLAY_AREA.height - bottomY;
    acc += p.x + p.width + topHeight + bottomY + bottomHeight;
  }
  return acc;
}

describe("Playing-loop frame-rate smoke test (Req 9.2)", () => {
  it("sustains at least 55 fps of Playing step+render throughput", () => {
    const FPS_TARGET = 60;
    const FPS_FLOOR = 55;
    // Simulate ~2 seconds of frames at the 60 fps target so the sample is
    // meaningful while still running quickly.
    const FRAMES = FPS_TARGET * 2;

    // A single flap on the first frame; remaining frames fall under gravity —
    // representative of an ongoing Playing session.
    const firstFrameInput = [{ type: "flap", timestamp: 0 }];
    const noInput = [];

    let state = makeRepresentativePlayingState();
    // Guard against dead-code elimination of the render work.
    let renderSink = 0;

    // Warm-up (not measured): let the JIT settle so the measured window is
    // representative of steady-state throughput.
    for (let i = 0; i < FPS_TARGET; i++) {
      state = step(state, FIXED_DT, i === 0 ? firstFrameInput : noInput);
      if (state.mode !== "Playing") {
        // Re-seed if a collision ended the run during warm-up.
        state = makeRepresentativePlayingState();
      }
      renderSink += mockRender(state);
    }

    // Measured window: FRAMES iterations of step + render.
    let frameState = makeRepresentativePlayingState();
    const startMs = performance.now();
    for (let i = 0; i < FRAMES; i++) {
      frameState = step(frameState, FIXED_DT, i === 0 ? firstFrameInput : noInput);
      if (frameState.mode !== "Playing") {
        // Keep measuring representative Playing work even if the ghost dies.
        frameState = makeRepresentativePlayingState();
      }
      renderSink += mockRender(frameState);
    }
    const elapsedMs = performance.now() - startMs;

    // Prevent the whole measured loop from being optimized away.
    expect(Number.isFinite(renderSink)).toBe(true);

    const elapsedSeconds = elapsedMs / 1000;
    // If the machine is so fast the elapsed time rounds to ~0, throughput is
    // effectively unbounded and trivially clears the floor.
    const effectiveFps = elapsedSeconds > 0 ? FRAMES / elapsedSeconds : Infinity;

    expect(effectiveFps).toBeGreaterThanOrEqual(FPS_FLOOR);
  });
});
