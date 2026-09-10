/**
 * Entry point / bootstrap for Flappy Kiro (impure shell).
 *
 * Bootstrapped by `index.html` as an ES module. This is the top-level wiring
 * layer that stands the game up in the browser. It owns the shell-level
 * presentation states (`Loading` and `Error`) that wrap the core `Game_State`
 * (`Ready` / `Playing` / `Game_Over`) described in the design's State Machine:
 * the core simulation only runs once assets resolve; while assets load the
 * shell paints a loading screen, and if a start-blocking asset fails the shell
 * paints an error screen and never enters Ready.
 *
 * Responsibilities (see design "Overview", "Architecture", State Machine):
 *   1. Get the canvas (`#game-canvas`) and its 2D context.
 *   2. Size the canvas to the 9:16 letterbox for the current viewport and keep
 *      it sized on window resize (Requirement 9.3).
 *   3. Paint a "Loading..." screen while `loadAssets()` runs.
 *   4. If the start-blocking image failed/timed out (`imageOk === false`),
 *      paint an error screen and stay out of Ready — do NOT start the loop
 *      (Requirement 1.6).
 *   5. On success: load the persisted high score (Requirement 8.3), build the
 *      initial `Ready` state (Requirement 1.1), instantiate the input, audio,
 *      and loop adapters (passing null for any audio element that failed to
 *      preload), and start the fixed-timestep loop.
 *   6. Surface the pipe-generation error path (Requirement 4.6): if the
 *      Play_Area bounds required to generate a pipe are ever unavailable, retain
 *      the existing pipes unchanged and produce a visible error indication,
 *      without crashing the loop.
 *
 * This module is deliberately thin: all timing, stepping, and drawing live in
 * the loop and renderer; all media, input, and persistence live in the
 * adapters. `bootstrap()` is exported so it can be driven in a test harness; it
 * also auto-runs on import when a DOM document is present.
 */

import { PLAY_AREA } from "./core/constants.js";
import { createRng } from "./core/rng.js";
import { createInitialState } from "./core/state.js";
import { step as coreStep } from "./core/step.js";
import { loadAssets } from "./shell/assets.js";
import { createAudioPlayer } from "./shell/audio.js";
import { createInput } from "./shell/input.js";
import { createLoop } from "./shell/loop.js";
import { render as renderGame, resizeCanvas } from "./shell/renderer.js";
import { loadHighScore, saveHighScore } from "./shell/storage.js";

/* -------------------------------------------------------------------------- */
/* Shell presentation screens (Loading / Error).                              */
/* -------------------------------------------------------------------------- */

const SCREEN_BACKGROUND = "#1a1a2e";
const SCREEN_TEXT = "#ffffff";
const SCREEN_TEXT_SHADOW = "#000000";
const SCREEN_ERROR = "#ff6b6b";

/**
 * Paint a single centered message screen onto the canvas.
 *
 * Used for the shell-level `Loading` and `Error` states, which sit outside the
 * core `Game_State`. The canvas has already been sized to the 9:16 letterbox,
 * so we fill it and center the text. Never throws on a missing context.
 *
 * @param {CanvasRenderingContext2D | null | undefined} ctx - The 2D context.
 * @param {string} title - The primary line (e.g. "Loading...").
 * @param {string} [subtitle] - An optional secondary line.
 * @param {string} [titleColor] - Color for the primary line.
 * @returns {void}
 */
function paintScreen(ctx, title, subtitle, titleColor = SCREEN_TEXT) {
  if (!ctx || !ctx.canvas) {
    return;
  }
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.fillStyle = SCREEN_BACKGROUND;
  ctx.fillRect(0, 0, w, h);

  const scale = w > 0 ? w / PLAY_AREA.width : 1;
  const centerX = w / 2;
  const centerY = h / 2;

  const draw = (text, y, fontPx, color) => {
    const size = Math.max(1, fontPx);
    ctx.font = `${size}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const shadow = Math.max(1, size * 0.05);
    ctx.fillStyle = SCREEN_TEXT_SHADOW;
    ctx.fillText(text, centerX + shadow, y + shadow);
    ctx.fillStyle = color;
    ctx.fillText(text, centerX, y);
  };

  draw(title, centerY - (subtitle ? 16 * scale : 0), 28 * scale, titleColor);
  if (subtitle) {
    draw(subtitle, centerY + 24 * scale, 16 * scale, SCREEN_TEXT);
  }
}

/* -------------------------------------------------------------------------- */
/* Pipe-generation error guard (Requirement 4.6).                             */
/* -------------------------------------------------------------------------- */

/**
 * Validate that the Play_Area bounds required to generate a pipe are available.
 *
 * The core `spawnPipe` is total and always receives {@link PLAY_AREA}, so under
 * normal operation this always holds. Requirement 4.6 nonetheless mandates a
 * defined behavior should those bounds ever be unavailable (e.g. a corrupted or
 * missing constant): retain the existing pipes unchanged and produce an error
 * indication rather than crashing.
 *
 * @param {{ width: number, height: number } | null | undefined} playArea
 * @returns {boolean} True when both width and height are finite and positive.
 */
function playAreaBoundsAvailable(playArea) {
  return (
    !!playArea &&
    Number.isFinite(playArea.width) &&
    Number.isFinite(playArea.height) &&
    playArea.width > 0 &&
    playArea.height > 0
  );
}

/**
 * Wrap the pure `step` with the pipe-generation guard (Requirement 4.6).
 *
 * Before delegating to `coreStep`, it checks whether the Play_Area bounds are
 * available. When they are not, and the state is one where a new pipe could be
 * generated (`Playing`), it retains the existing pipes unchanged — returning a
 * copy whose `pipes` array is untouched — and records a generation-failure
 * error indication via `onGenerationError` so the shell can surface it. On the
 * happy path it simply delegates to the core step, clearing any prior error.
 *
 * @param {(state: any, dt: number, inputs: any[]) => any} step - The pure step.
 * @param {() => boolean} boundsAvailable - Returns whether bounds are available.
 * @param {(active: boolean) => void} onGenerationError - Called with true when a
 *   generation failure is detected this step, false otherwise.
 * @returns {(state: any, dt: number, inputs: any[]) => any} The guarded step.
 */
function guardPipeGeneration(step, boundsAvailable, onGenerationError) {
  return function guardedStep(state, dt, inputs) {
    if (state && state.mode === "Playing" && !boundsAvailable()) {
      // Bounds unavailable: a new Pipe_Pair cannot be generated. Retain the
      // existing pipes unchanged and produce an error indication (Req 4.6).
      onGenerationError(true);
      return { ...state, pipes: state.pipes };
    }
    onGenerationError(false);
    return step(state, dt, inputs);
  };
}

/* -------------------------------------------------------------------------- */
/* Bootstrap.                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Stand up the game in the browser.
 *
 * Resolves the canvas and context, wires resize handling, shows the loading
 * screen, loads assets, and then either shows the error screen (start-blocking
 * asset failed — Requirement 1.6) or builds the initial state and starts the
 * loop (Requirements 1.1, 8.3). Returns a handle exposing the loop and a
 * `dispose` for tests/teardown; returns null when the canvas or a 2D context is
 * unavailable.
 *
 * @param {Object} [options] - Optional injected collaborators (for testing).
 * @param {Document} [options.doc] - Document to query for the canvas.
 * @param {Window} [options.win] - Window for viewport size and resize events.
 * @param {() => Promise<import('./shell/assets.js').LoadedAssets>} [options.load]
 *   - Asset loader override; defaults to `loadAssets`.
 * @param {() => number} [options.loadHigh] - High-score loader override.
 * @param {() => number} [options.seed] - Seed source; defaults to `Date.now`.
 * @returns {Promise<null | {
 *   loop: { start: () => void, stop: () => void, isRunning: () => boolean },
 *   dispose: () => void,
 * }>}
 */
export async function bootstrap(options = {}) {
  const doc = options.doc || (typeof document !== "undefined" ? document : null);
  const win = options.win || (typeof window !== "undefined" ? window : null);
  const load = options.load || loadAssets;
  const loadHigh = options.loadHigh || loadHighScore;
  const seed = options.seed || Date.now;

  if (!doc || typeof doc.getElementById !== "function") {
    console.error("Flappy Kiro: no document available to bootstrap into.");
    return null;
  }

  const canvas = doc.getElementById("game-canvas");
  if (!canvas) {
    console.error("Flappy Kiro: #game-canvas element not found.");
    return null;
  }

  const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  if (!ctx) {
    console.error("Flappy Kiro: unable to obtain a 2D rendering context.");
    return null;
  }

  /* --- Canvas sizing + resize handling (Requirement 9.3). --------------- */

  const viewportW = () => (win && Number.isFinite(win.innerWidth) ? win.innerWidth : PLAY_AREA.width);
  const viewportH = () => (win && Number.isFinite(win.innerHeight) ? win.innerHeight : PLAY_AREA.height);

  /**
   * Recompute the 9:16 canvas size for the current viewport. Re-run on every
   * resize so the letterbox always fits the window (Requirement 9.3). After a
   * resize we also repaint the current screen/state so the newly sized backing
   * store is not left blank until the next animation frame.
   */
  const applySize = () => {
    resizeCanvas(canvas, viewportW(), viewportH());
  };

  applySize();

  // The screen to repaint on resize; updated as the shell moves through
  // Loading -> Error, or handed off to the loop once Ready.
  let repaint = () => paintScreen(ctx, "Loading...");

  const onResize = () => {
    applySize();
    repaint();
  };
  if (win && typeof win.addEventListener === "function") {
    win.addEventListener("resize", onResize);
  }

  /* --- Loading screen while assets resolve. ----------------------------- */

  repaint = () => paintScreen(ctx, "Loading...");
  repaint();

  /* --- Load assets. ----------------------------------------------------- */

  let assets;
  try {
    assets = await load();
  } catch {
    // loadAssets is documented never to reject, but be defensive: treat any
    // unexpected failure as a start-blocking asset failure.
    assets = { image: null, imageOk: false, flapAudio: null, flapOk: false, gameOverAudio: null, gameOverOk: false };
  }

  /* --- Error screen when a start-blocking asset failed (Req 1.6). ------- */

  if (!assets || !assets.imageOk) {
    // The ghost sprite is start-blocking. Stay out of Ready and show the error
    // (Requirement 1.6). The loop is never started.
    repaint = () => paintScreen(ctx, "Loading failed", "Please refresh to try again", SCREEN_ERROR);
    repaint();

    return {
      loop: { start() {}, stop() {}, isRunning: () => false },
      dispose() {
        if (win && typeof win.removeEventListener === "function") {
          win.removeEventListener("resize", onResize);
        }
      },
    };
  }

  /* --- Success: build initial state and adapters (Req 1.1, 8.3). -------- */

  const highScore = loadHigh(); // Requirement 8.3
  const initialState = createInitialState(PLAY_AREA, highScore, createRng(seed())); // Req 1.1 (mode Ready)

  let state = initialState;
  const getState = () => state;
  const setState = (next) => {
    state = next;
  };

  const input = createInput({ canvas, keyTarget: win || undefined }); // Req 2.4, 2.5

  // Pass null for any audio element that failed to preload so the audio player
  // no-ops that sound (Requirement 10.2).
  const audio = createAudioPlayer({
    flapAudio: assets.flapOk ? assets.flapAudio : null,
    gameOverAudio: assets.gameOverOk ? assets.gameOverAudio : null,
  });

  /* --- Pipe-generation error path (Requirement 4.6). -------------------- */

  // Tracks whether the most recent step hit the generation-failure guard.
  let pipeGenerationError = false;
  const stepWithGuard = guardPipeGeneration(
    coreStep,
    () => playAreaBoundsAvailable(PLAY_AREA),
    (active) => {
      pipeGenerationError = active;
    },
  );

  /* --- Renderer wrapper that surfaces the generation error indication. -- */

  const render = (context, s, a) => {
    renderGame(context, s, a);
    if (pipeGenerationError && context && context.canvas) {
      // Produce a visible error indication without disturbing gameplay (Req 4.6).
      const scale = context.canvas.width > 0 ? context.canvas.width / PLAY_AREA.width : 1;
      context.font = `${Math.max(1, 14 * scale)}px monospace`;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillStyle = SCREEN_ERROR;
      context.fillText("Pipe generation error", context.canvas.width / 2, 8 * scale);
    }
  };

  /* --- Loop. ------------------------------------------------------------ */

  const loop = createLoop({
    getState,
    setState,
    step: stepWithGuard,
    render,
    ctx,
    assets,
    input,
    audio,
    saveHighScore, // Persist the running-maximum high score (Req 8.1, 8.2).
    now: win && win.performance && typeof win.performance.now === "function" ? () => win.performance.now() : undefined,
    raf: win && typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame.bind(win) : undefined,
    cancelRaf: win && typeof win.cancelAnimationFrame === "function" ? win.cancelAnimationFrame.bind(win) : undefined,
  });

  // Once the loop is driving frames, resize repaints are handled by the next
  // animation frame; keep a repaint that renders the current state so a resize
  // between frames is not left blank.
  repaint = () => render(ctx, state, assets);

  loop.start(); // Enters the render/step cycle; core state is already Ready (Req 1.1).

  return {
    loop,
    dispose() {
      loop.stop();
      if (input && typeof input.dispose === "function") {
        input.dispose();
      }
      if (win && typeof win.removeEventListener === "function") {
        win.removeEventListener("resize", onResize);
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Auto-run on import in a browser.                                           */
/* -------------------------------------------------------------------------- */

// Run automatically when loaded as a page module. Guarded so importing this
// module in a non-DOM test environment does not spuriously start the game.
if (typeof document !== "undefined" && typeof window !== "undefined") {
  // Fire and forget; bootstrap swallows its own recoverable failures.
  bootstrap().catch((err) => {
    console.error("Flappy Kiro: bootstrap failed.", err);
  });
}
