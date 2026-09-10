/**
 * Canvas 2D renderer adapter (impure shell).
 *
 * This browser adapter draws the current {@link GameState} onto a Canvas 2D
 * context each frame. It is the only place the game touches `CanvasRenderingContext2D`
 * drawing calls. It performs no simulation: it is a pure function of
 * `(ctx, state, assets)` in the sense that it reads state and draws, never
 * mutating game state.
 *
 * The renderer works in the fixed logical Play_Area space (360x640, a 9:16
 * ratio) and scales those logical coordinates onto the actual canvas via a
 * uniform scale derived from `ctx.canvas.width / PLAY_AREA.width`. Because the
 * canvas itself is sized to a 9:16 rectangle by {@link computeCanvasSize} /
 * {@link resizeCanvas}, the horizontal and vertical scale factors match and the
 * aspect ratio is preserved (Requirement 9.3).
 *
 * Draw order each frame:
 *   1. background fill
 *   2. all pipe pairs (top + bottom columns) — Playing/Game_Over always, and
 *      Ready if pipes happen to be present (Requirement 9.4)
 *   3. the ghost — sprite from `assets/ghosty.png`, or a solid-colored
 *      placeholder of equivalent size when the sprite failed to load
 *      (Requirements 9.1, 9.5, 1.2)
 *   4. the current score (Requirement 5.2)
 *   5. the state-appropriate overlay — Ready start instruction naming the flap
 *      input (Requirement 1.3), or the Game_Over panel with final score, high
 *      score, and restart instruction (Requirements 7.1, 7.2, 7.3)
 *
 * The renderer is robust: it never throws on missing or failed assets. A null
 * `ctx` is a no-op so the loop can call it defensively.
 *
 * @typedef {import('../core/constants.js').GameState} GameState
 * @typedef {import('../core/constants.js').Pipe_Pair} Pipe_Pair
 * @typedef {import('./assets.js').LoadedAssets} LoadedAssets
 */

import { PLAY_AREA, PIPE_WIDTH } from "../core/constants.js";
import { computeCanvasSize } from "./sizing.js";

/* -------------------------------------------------------------------------- */
/* Retro color palette (logical, resolution-independent).                     */
/* -------------------------------------------------------------------------- */

const COLOR_BACKGROUND = "#1a1a2e";
const COLOR_PIPE = "#4ec04e";
const COLOR_PIPE_EDGE = "#2f7d2f";
const COLOR_GHOST_PLACEHOLDER = "#e8e8f0";
const COLOR_TEXT = "#ffffff";
const COLOR_TEXT_SHADOW = "#000000";
const COLOR_PANEL = "rgba(0, 0, 0, 0.6)";

/* -------------------------------------------------------------------------- */
/* Canvas sizing (resize handling, Requirement 9.3).                          */
/* -------------------------------------------------------------------------- */

/**
 * Apply the 9:16 letterboxed sizing to a canvas element for the current
 * viewport, returning the dimensions that were applied (Requirement 9.3).
 *
 * The largest 9:16 rectangle that fits entirely within the viewport is computed
 * via {@link computeCanvasSize}; its dimensions are written to both the canvas
 * backing store (`canvas.width` / `canvas.height`, in device pixels) and the
 * CSS box (`canvas.style.width` / `canvas.style.height`) so the drawing surface
 * and the displayed element stay in sync. Callers hook this to the window
 * `resize` event and once on startup.
 *
 * The canvas backing store is rounded to whole pixels to avoid fractional
 * device-pixel dimensions; the aspect ratio remains 9:16 within sub-pixel
 * rounding.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element to size.
 * @param {number} viewportW - Available viewport width in pixels.
 * @param {number} viewportH - Available viewport height in pixels.
 * @returns {{ width: number, height: number }} The dimensions applied to the
 *   canvas backing store.
 */
export function resizeCanvas(canvas, viewportW, viewportH) {
  const { width, height } = computeCanvasSize(viewportW, viewportH);
  const w = Math.round(width);
  const h = Math.round(height);

  if (canvas) {
    canvas.width = w;
    canvas.height = h;
    if (canvas.style) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
  }

  return { width: w, height: h };
}

/* -------------------------------------------------------------------------- */
/* Rendering.                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Render one frame of the game to a Canvas 2D context.
 *
 * Draws the background, every pipe, the ghost (sprite or placeholder), the
 * current score, and the overlay appropriate to `state.mode`. All logical
 * Play_Area coordinates are scaled onto the canvas using the uniform scale
 * `ctx.canvas.width / PLAY_AREA.width`. Never throws on a null context or on
 * missing/failed assets.
 *
 * @param {CanvasRenderingContext2D | null | undefined} ctx - The 2D context.
 * @param {GameState} state - The current game state to render.
 * @param {LoadedAssets} [assets] - Loaded assets; `{ image, imageOk }` drive
 *   the ghost sprite vs. placeholder decision. Optional/partial is tolerated.
 * @returns {void}
 */
export function render(ctx, state, assets) {
  if (!ctx || !ctx.canvas) {
    return;
  }

  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;
  // Uniform logical->device scale. The canvas is a 9:16 box, matching the
  // logical Play_Area ratio, so a single scale factor preserves the aspect.
  const scale = canvasW > 0 ? canvasW / PLAY_AREA.width : 0;

  drawBackground(ctx, canvasW, canvasH);

  if (scale <= 0) {
    // Zero-sized canvas: nothing meaningful to draw beyond the (empty) fill.
    return;
  }

  const pipes = Array.isArray(state.pipes) ? state.pipes : [];

  // Pipes are always drawn while Playing or Game_Over (Req 9.4); if a Ready
  // state carries pipes (unusual but valid), draw them too.
  if (state.mode === "Playing" || state.mode === "Game_Over" || pipes.length > 0) {
    for (const pipe of pipes) {
      drawPipePair(ctx, pipe, scale);
    }
  }

  drawGhost(ctx, state.ghost, scale, assets);
  drawScore(ctx, state.score, scale);

  if (state.mode === "Ready") {
    drawReadyOverlay(ctx, canvasW, canvasH, scale);
  } else if (state.mode === "Game_Over") {
    drawGameOverOverlay(ctx, state, canvasW, canvasH, scale);
  }
}

/**
 * Fill the entire canvas with the retro background color.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW
 * @param {number} canvasH
 */
function drawBackground(ctx, canvasW, canvasH) {
  ctx.fillStyle = COLOR_BACKGROUND;
  ctx.fillRect(0, 0, canvasW, canvasH);
}

/**
 * Draw a single Pipe_Pair's top and bottom columns.
 *
 * The derived rectangles mirror the collision module and the data model:
 * - Top pipe:    `{ x, y: 0, width, height: gapCenterY - gapHeight/2 }`
 * - Bottom pipe: `{ x, y: gapCenterY + gapHeight/2, width,
 *                   height: PLAY_AREA.height - (gapCenterY + gapHeight/2) }`
 * All coordinates are logical and scaled to device pixels here.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Pipe_Pair} pipe
 * @param {number} scale - Logical -> device scale factor.
 */
function drawPipePair(ctx, pipe, scale) {
  const width = (pipe.width ?? PIPE_WIDTH) * scale;
  const x = pipe.x * scale;

  const gapTop = (pipe.gapCenterY - pipe.gapHeight / 2) * scale;
  const gapBottom = (pipe.gapCenterY + pipe.gapHeight / 2) * scale;
  const areaBottom = PLAY_AREA.height * scale;

  // Top column: from the top edge down to the top of the gap.
  const topHeight = Math.max(0, gapTop);
  // Bottom column: from the bottom of the gap down to the ground.
  const bottomHeight = Math.max(0, areaBottom - gapBottom);

  ctx.fillStyle = COLOR_PIPE;
  ctx.fillRect(x, 0, width, topHeight);
  ctx.fillRect(x, gapBottom, width, bottomHeight);

  // Thin edge accents for a bit of retro depth (purely cosmetic).
  ctx.fillStyle = COLOR_PIPE_EDGE;
  const edge = Math.max(1, 2 * scale);
  if (topHeight > 0) {
    ctx.fillRect(x, topHeight - edge, width, edge);
  }
  if (bottomHeight > 0) {
    ctx.fillRect(x, gapBottom, width, edge);
  }
}

/**
 * Draw the ghost as its sprite, or a solid-colored placeholder of equivalent
 * size when the sprite is unavailable (Requirements 9.1, 9.5, 1.2).
 *
 * The ghost bounding box `{ x, y, width, height }` is in logical units; it is
 * scaled to device pixels. When `assets.imageOk` is true and `assets.image` is
 * present, the sprite is drawn to fill that box. Otherwise a filled rectangle
 * of the same box is drawn. A drawImage failure (e.g. an incomplete image under
 * some environments) falls back to the placeholder without throwing.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../core/constants.js').Ghost} ghost
 * @param {number} scale - Logical -> device scale factor.
 * @param {LoadedAssets} [assets]
 */
function drawGhost(ctx, ghost, scale, assets) {
  if (!ghost) {
    return;
  }

  const x = ghost.x * scale;
  const y = ghost.y * scale;
  const w = ghost.width * scale;
  const h = ghost.height * scale;

  const image = assets ? assets.image : null;
  const imageOk = assets ? assets.imageOk : false;

  if (imageOk && image) {
    try {
      ctx.drawImage(image, x, y, w, h);
      return;
    } catch {
      // Fall through to placeholder on any draw failure (Req 9.5).
    }
  }

  ctx.fillStyle = COLOR_GHOST_PLACEHOLDER;
  ctx.fillRect(x, y, w, h);
}

/**
 * Draw the current score in the top area of the Play_Area (Requirement 5.2).
 *
 * The score is coerced to a non-negative integer for display. Font size scales
 * with the canvas so the readout stays proportional at any letterboxed size.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} score
 * @param {number} scale - Logical -> device scale factor.
 */
function drawScore(ctx, score, scale) {
  const value = Math.max(0, Math.floor(Number(score) || 0));
  const centerX = (PLAY_AREA.width / 2) * scale;
  const y = 48 * scale;

  drawText(ctx, String(value), centerX, y, {
    fontPx: 40 * scale,
    align: "center",
    baseline: "middle",
  });
}

/**
 * Draw the Ready-state start instruction naming the flap input (Requirement
 * 1.3). The message names both the keyboard and pointer flap inputs.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {number} scale - Logical -> device scale factor.
 */
function drawReadyOverlay(ctx, canvasW, canvasH, scale) {
  const centerX = canvasW / 2;
  const baseY = canvasH * 0.72;

  drawText(ctx, "FLAPPY KIRO", centerX, baseY - 44 * scale, {
    fontPx: 32 * scale,
    align: "center",
    baseline: "middle",
  });
  drawText(ctx, "Press Space or tap to flap", centerX, baseY, {
    fontPx: 20 * scale,
    align: "center",
    baseline: "middle",
  });
}

/**
 * Draw the Game_Over panel: final score, high score, and a restart instruction
 * naming the flap input (Requirements 7.1, 7.2, 7.3).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {GameState} state
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {number} scale - Logical -> device scale factor.
 */
function drawGameOverOverlay(ctx, state, canvasW, canvasH, scale) {
  const finalScore = Math.max(0, Math.floor(Number(state.score) || 0));
  const highScore = Math.max(0, Math.floor(Number(state.highScore) || 0));

  const centerX = canvasW / 2;
  const centerY = canvasH / 2;

  // Semi-transparent panel behind the text.
  const panelW = 260 * scale;
  const panelH = 200 * scale;
  ctx.fillStyle = COLOR_PANEL;
  ctx.fillRect(centerX - panelW / 2, centerY - panelH / 2, panelW, panelH);

  drawText(ctx, "GAME OVER", centerX, centerY - 64 * scale, {
    fontPx: 30 * scale,
    align: "center",
    baseline: "middle",
  });
  drawText(ctx, `Score: ${finalScore}`, centerX, centerY - 16 * scale, {
    fontPx: 22 * scale,
    align: "center",
    baseline: "middle",
  });
  drawText(ctx, `Best: ${highScore}`, centerX, centerY + 16 * scale, {
    fontPx: 22 * scale,
    align: "center",
    baseline: "middle",
  });
  drawText(ctx, "Press Space or tap to restart", centerX, centerY + 64 * scale, {
    fontPx: 16 * scale,
    align: "center",
    baseline: "middle",
  });
}

/**
 * Draw a line of text with a subtle drop shadow for readability against any
 * background. Font metrics are set on the context before drawing.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {{ fontPx: number, align?: CanvasTextAlign, baseline?: CanvasTextBaseline }} opts
 */
function drawText(ctx, text, x, y, opts) {
  const fontPx = Math.max(1, opts.fontPx);
  ctx.font = `${fontPx}px monospace`;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = opts.baseline ?? "alphabetic";

  const shadowOffset = Math.max(1, fontPx * 0.05);
  ctx.fillStyle = COLOR_TEXT_SHADOW;
  ctx.fillText(text, x + shadowOffset, y + shadowOffset);
  ctx.fillStyle = COLOR_TEXT;
  ctx.fillText(text, x, y);
}
