import { describe, it, expect, vi } from "vitest";
import { render } from "./renderer.js";
import {
  PLAY_AREA,
  PIPE_WIDTH,
  GAP_HEIGHT,
  GHOST_SIZE,
} from "../core/constants.js";

/**
 * Integration tests for the Canvas 2D renderer against a mocked 2D context.
 *
 * Per the design Testing Strategy ("Renderer: score display reflects state
 * (5.2, 7.1), all pipes rendered while Playing/Game_Over (9.1, 9.4)"), these
 * exercise the side-effecting draw path against spies on the context drawing
 * methods (drawImage, fillRect, fillText, ...). No real canvas is required.
 *
 * A canvas width equal to PLAY_AREA.width (360) is used so the logical->device
 * scale is exactly 1 and logical coordinates map directly to device pixels,
 * keeping the assertions readable.
 *
 * Validates: Requirements 1.3, 5.2, 7.1, 7.2, 7.3, 9.1, 9.4, 9.5
 */

/**
 * Build a fake CanvasRenderingContext2D that records every draw call. The
 * mutable style/font/align/baseline setters are captured at call time so we can
 * inspect what was drawn and with what attributes.
 *
 * @param {{ width?: number, height?: number }} [opts]
 */
function makeMockCtx(opts = {}) {
  const width = opts.width ?? PLAY_AREA.width;
  const height = opts.height ?? PLAY_AREA.height;

  const calls = {
    fillRect: [],
    fillText: [],
    drawImage: [],
  };

  const ctx = {
    canvas: { width, height },
    // mutable drawing attributes
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    // spied methods that snapshot the relevant attributes at call time
    fillRect: vi.fn(function (x, y, w, h) {
      calls.fillRect.push({ x, y, w, h, fillStyle: this.fillStyle });
    }),
    fillText: vi.fn(function (text, x, y) {
      calls.fillText.push({
        text,
        x,
        y,
        fillStyle: this.fillStyle,
        font: this.font,
        align: this.textAlign,
        baseline: this.textBaseline,
      });
    }),
    drawImage: vi.fn(function (image, x, y, w, h) {
      calls.drawImage.push({ image, x, y, w, h });
    }),
  };

  return { ctx, calls };
}

/** Concatenate all drawn text into one string for substring assertions. */
function allText(calls) {
  return calls.fillText.map((c) => c.text).join("\n");
}

/** Build a valid ghost bounding box at the given position. */
function makeGhost(x = 90, y = 308) {
  return { x, y, width: GHOST_SIZE.width, height: GHOST_SIZE.height, velocityY: 0 };
}

/** Build a valid pipe pair. */
function makePipe(id, x, gapCenterY = 320) {
  return {
    id,
    x,
    width: PIPE_WIDTH,
    gapCenterY,
    gapHeight: GAP_HEIGHT,
    counted: false,
  };
}

/** A loaded-assets stand-in with a usable sprite. */
function okAssets() {
  return { image: { nodeName: "IMG" }, imageOk: true };
}

/** A loaded-assets stand-in whose sprite failed to load (Req 9.5). */
function failedAssets() {
  return { image: { nodeName: "IMG" }, imageOk: false };
}

/* -------------------------------------------------------------------------- */
/* Score display reflects state (5.2, 7.1).                                   */
/* -------------------------------------------------------------------------- */

describe("renderer — score display (5.2, 7.1)", () => {
  it("draws the current score via fillText while Playing (5.2)", () => {
    const { ctx, calls } = makeMockCtx();
    const state = {
      mode: "Playing",
      ghost: makeGhost(),
      pipes: [],
      score: 7,
      highScore: 42,
    };

    render(ctx, state, okAssets());

    // The current score value appears as its own drawn string.
    const scoreDraws = calls.fillText.filter((c) => c.text === "7");
    expect(scoreDraws.length).toBeGreaterThan(0);
  });

  it("reflects a changed score in the drawn output (5.2)", () => {
    const base = {
      mode: "Playing",
      ghost: makeGhost(),
      pipes: [],
      highScore: 0,
    };

    const a = makeMockCtx();
    render(a.ctx, { ...base, score: 3 }, okAssets());
    expect(a.calls.fillText.some((c) => c.text === "3")).toBe(true);
    expect(a.calls.fillText.some((c) => c.text === "12")).toBe(false);

    const b = makeMockCtx();
    render(b.ctx, { ...base, score: 12 }, okAssets());
    expect(b.calls.fillText.some((c) => c.text === "12")).toBe(true);
    expect(b.calls.fillText.some((c) => c.text === "3")).toBe(false);
  });

  it("shows the final score in the Game_Over panel (7.1)", () => {
    const { ctx, calls } = makeMockCtx();
    const state = {
      mode: "Game_Over",
      ghost: makeGhost(),
      pipes: [],
      score: 15,
      highScore: 20,
    };

    render(ctx, state, okAssets());

    const text = allText(calls);
    expect(text).toMatch(/15/);
    // The final score is labeled so it reads as the session result.
    expect(text.toLowerCase()).toContain("score");
  });
});

/* -------------------------------------------------------------------------- */
/* All pipes rendered while Playing / Game_Over (9.1, 9.4).                   */
/* -------------------------------------------------------------------------- */

describe("renderer — pipes (9.1, 9.4)", () => {
  it("produces draw calls for each pipe pair while Playing (9.4)", () => {
    const { ctx, calls } = makeMockCtx();
    const pipes = [makePipe(1, 300), makePipe(2, 180), makePipe(3, 60)];
    const state = {
      mode: "Playing",
      ghost: makeGhost(),
      pipes,
      score: 0,
      highScore: 0,
    };

    render(ctx, state, okAssets());

    // Each pipe pair draws its top and bottom columns as green rects. Count the
    // pipe-colored fills at each pipe's x position.
    for (const pipe of pipes) {
      const fillsAtPipe = calls.fillRect.filter(
        (c) => c.x === pipe.x && c.w === PIPE_WIDTH,
      );
      expect(fillsAtPipe.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("renders pipes while Game_Over as well (9.4)", () => {
    const { ctx, calls } = makeMockCtx();
    const pipes = [makePipe(1, 200), makePipe(2, 40)];
    const state = {
      mode: "Game_Over",
      ghost: makeGhost(),
      pipes,
      score: 5,
      highScore: 9,
    };

    render(ctx, state, okAssets());

    for (const pipe of pipes) {
      const fillsAtPipe = calls.fillRect.filter(
        (c) => c.x === pipe.x && c.w === PIPE_WIDTH,
      );
      expect(fillsAtPipe.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("draws every pipe in the list (9.1)", () => {
    const { ctx, calls } = makeMockCtx();
    const pipes = Array.from({ length: 5 }, (_, i) => makePipe(i, 320 - i * 60));
    const state = {
      mode: "Playing",
      ghost: makeGhost(),
      pipes,
      score: 0,
      highScore: 0,
    };

    render(ctx, state, okAssets());

    const distinctPipeXs = new Set(
      calls.fillRect.filter((c) => c.w === PIPE_WIDTH).map((c) => c.x),
    );
    for (const pipe of pipes) {
      expect(distinctPipeXs.has(pipe.x)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Placeholder on sprite failure (9.5).                                       */
/* -------------------------------------------------------------------------- */

describe("renderer — ghost sprite / placeholder (9.5)", () => {
  it("draws the sprite via drawImage when the asset loaded", () => {
    const { ctx, calls } = makeMockCtx();
    const assets = okAssets();
    const ghost = makeGhost(90, 300);
    const state = {
      mode: "Playing",
      ghost,
      pipes: [],
      score: 0,
      highScore: 0,
    };

    render(ctx, state, assets);

    expect(calls.drawImage.length).toBe(1);
    const draw = calls.drawImage[0];
    expect(draw.image).toBe(assets.image);
    expect(draw.x).toBe(ghost.x);
    expect(draw.y).toBe(ghost.y);
    expect(draw.w).toBe(ghost.width);
    expect(draw.h).toBe(ghost.height);
  });

  it("draws a solid-colored placeholder rect instead of drawImage on sprite failure (9.5)", () => {
    const { ctx, calls } = makeMockCtx();
    const ghost = makeGhost(90, 300);
    const state = {
      mode: "Playing",
      ghost,
      pipes: [],
      score: 0,
      highScore: 0,
    };

    render(ctx, state, failedAssets());

    // No sprite draw at all.
    expect(calls.drawImage.length).toBe(0);
    // A filled rect matching the ghost's box stands in for the sprite.
    const placeholder = calls.fillRect.find(
      (c) =>
        c.x === ghost.x &&
        c.y === ghost.y &&
        c.w === ghost.width &&
        c.h === ghost.height,
    );
    expect(placeholder).toBeTruthy();
    // The placeholder is a solid (non-empty) color.
    expect(placeholder.fillStyle).toBeTruthy();
  });

  it("falls back to the placeholder when drawImage throws (9.5)", () => {
    const { ctx, calls } = makeMockCtx();
    ctx.drawImage = vi.fn(() => {
      throw new Error("broken image");
    });
    const ghost = makeGhost(90, 300);
    const state = {
      mode: "Playing",
      ghost,
      pipes: [],
      score: 0,
      highScore: 0,
    };

    expect(() => render(ctx, state, okAssets())).not.toThrow();

    const placeholder = calls.fillRect.find(
      (c) =>
        c.x === ghost.x &&
        c.y === ghost.y &&
        c.w === ghost.width &&
        c.h === ghost.height,
    );
    expect(placeholder).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Ready / Game_Over overlay text (1.3, 7.2, 7.3).                            */
/* -------------------------------------------------------------------------- */

describe("renderer — overlays (1.3, 7.2, 7.3)", () => {
  it("Ready overlay names the flap input (1.3)", () => {
    const { ctx, calls } = makeMockCtx();
    const state = {
      mode: "Ready",
      ghost: makeGhost(),
      pipes: [],
      score: 0,
      highScore: 0,
    };

    render(ctx, state, okAssets());

    const text = allText(calls).toLowerCase();
    // The start instruction should mention the flap inputs (space and tap).
    expect(text).toContain("space");
    expect(text).toContain("tap");
  });

  it("Game_Over panel shows final score, high score, and a restart instruction (7.1, 7.2, 7.3)", () => {
    const { ctx, calls } = makeMockCtx();
    const state = {
      mode: "Game_Over",
      ghost: makeGhost(),
      pipes: [],
      score: 8,
      highScore: 25,
    };

    render(ctx, state, okAssets());

    const text = allText(calls);
    const lower = text.toLowerCase();

    // Final score (7.1) and high score (7.2) both surfaced.
    expect(text).toMatch(/8/);
    expect(text).toMatch(/25/);
    expect(lower).toContain("score");
    // High-score label (best) present (7.2).
    expect(lower).toContain("best");
    // Restart instruction naming the flap input (7.3).
    expect(lower).toContain("restart");
    expect(lower).toContain("space");
    expect(lower).toContain("tap");
  });

  it("does not draw the Game_Over panel while Ready", () => {
    const { ctx, calls } = makeMockCtx();
    const state = {
      mode: "Ready",
      ghost: makeGhost(),
      pipes: [],
      score: 0,
      highScore: 3,
    };

    render(ctx, state, okAssets());

    const lower = allText(calls).toLowerCase();
    expect(lower).not.toContain("game over");
    expect(lower).not.toContain("restart");
  });
});

/* -------------------------------------------------------------------------- */
/* Robustness.                                                                */
/* -------------------------------------------------------------------------- */

describe("renderer — robustness", () => {
  it("is a no-op on a null context", () => {
    expect(() => render(null, { mode: "Ready", ghost: makeGhost(), pipes: [] })).not.toThrow();
  });

  it("tolerates missing assets by drawing the placeholder", () => {
    const { ctx, calls } = makeMockCtx();
    const state = {
      mode: "Playing",
      ghost: makeGhost(90, 300),
      pipes: [],
      score: 0,
      highScore: 0,
    };

    expect(() => render(ctx, state, undefined)).not.toThrow();
    expect(calls.drawImage.length).toBe(0);
    expect(calls.fillRect.length).toBeGreaterThan(0);
  });
});
