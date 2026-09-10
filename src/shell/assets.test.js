import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadAssets,
  GHOST_SPRITE_SRC,
  FLAP_AUDIO_SRC,
  GAME_OVER_AUDIO_SRC,
  IMAGE_TIMEOUT_MS,
  AUDIO_TIMEOUT_MS,
} from "./assets.js";

/**
 * Integration tests for the asset loader adapter (task 13.2).
 *
 * These exercise `loadAssets()` against fake `Image` / `Audio` constructors
 * installed on the global scope, driving the loader's real 10s image and 5s
 * audio timeouts with fake timers, per the design's Testing Strategy:
 * "Asset loader: failing/slow asset yields error state and blocks Ready (1.6);
 * sprite-load failure yields placeholder (9.5); audio preload and failure
 * handling (10.1, 10.2)". Behavior is verified with 1-3 representative examples.
 *
 * The fakes capture every constructed element so a test can deterministically
 * fire `load` / `error` / `canplaythrough`, or leave an element hanging to let
 * the loader's timeout fire under fake timers.
 */

/** Fake Image element that records its assigned src and exposes event hooks. */
class FakeImage {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this._src = "";
    FakeImage.instances.push(this);
  }
  set src(value) {
    this._src = value;
  }
  get src() {
    return this._src;
  }
  /** Simulate a successful load. */
  fireLoad() {
    if (this.onload) this.onload();
  }
  /** Simulate a load error. */
  fireError() {
    if (this.onerror) this.onerror();
  }
}
FakeImage.instances = [];

/** Fake Audio element mirroring the browser preload surface used by the loader. */
class FakeAudio {
  constructor() {
    this.oncanplaythrough = null;
    this.onerror = null;
    this.preload = "";
    this._src = "";
    this.load = vi.fn();
    FakeAudio.instances.push(this);
  }
  set src(value) {
    this._src = value;
  }
  get src() {
    return this._src;
  }
  /** Simulate the clip buffering enough to play. */
  fireCanPlayThrough() {
    if (this.oncanplaythrough) this.oncanplaythrough();
  }
  /** Simulate a load error. */
  fireError() {
    if (this.onerror) this.onerror();
  }
}
FakeAudio.instances = [];

/** Find the fake audio element created for a given source path. */
function audioFor(src) {
  return FakeAudio.instances.find((a) => a.src === src);
}

describe("loadAssets", () => {
  beforeEach(() => {
    FakeImage.instances = [];
    FakeAudio.instances = [];
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("Audio", FakeAudio);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports success for every asset when all load in time (1.6, 9.5, 10.1)", async () => {
    const promise = loadAssets();

    // All three assets signal success before their budgets elapse.
    FakeImage.instances[0].fireLoad();
    audioFor(FLAP_AUDIO_SRC).fireCanPlayThrough();
    audioFor(GAME_OVER_AUDIO_SRC).fireCanPlayThrough();

    const result = await promise;

    expect(result.imageOk).toBe(true);
    expect(result.image).toBe(FakeImage.instances[0]);
    expect(result.image.src).toBe(GHOST_SPRITE_SRC);
    expect(result.flapOk).toBe(true);
    expect(result.gameOverOk).toBe(true);
    expect(result.flapAudio.src).toBe(FLAP_AUDIO_SRC);
    expect(result.gameOverAudio.src).toBe(GAME_OVER_AUDIO_SRC);
  });

  it("preloads audio with preload='auto' and kicks off buffering via load() (10.1)", async () => {
    const promise = loadAssets();

    const flap = audioFor(FLAP_AUDIO_SRC);
    const gameOver = audioFor(GAME_OVER_AUDIO_SRC);
    expect(flap.preload).toBe("auto");
    expect(gameOver.preload).toBe("auto");
    expect(flap.load).toHaveBeenCalledTimes(1);
    expect(gameOver.load).toHaveBeenCalledTimes(1);

    FakeImage.instances[0].fireLoad();
    flap.fireCanPlayThrough();
    gameOver.fireCanPlayThrough();
    await promise;
  });

  it("marks the sprite failed on image load error so a placeholder can be used, without blocking resolution (1.6, 9.5)", async () => {
    const promise = loadAssets();

    // Ghost sprite errors; sounds still succeed.
    FakeImage.instances[0].fireError();
    audioFor(FLAP_AUDIO_SRC).fireCanPlayThrough();
    audioFor(GAME_OVER_AUDIO_SRC).fireCanPlayThrough();

    const result = await promise;

    // imageOk=false is the signal to stay out of Ready / draw a placeholder.
    expect(result.imageOk).toBe(false);
    // The image handle is still returned so the renderer can fall back (9.5).
    expect(result.image).toBe(FakeImage.instances[0]);
    expect(result.flapOk).toBe(true);
    expect(result.gameOverOk).toBe(true);
  });

  it("marks the sprite failed when the image does not load within 10s (1.6)", async () => {
    const promise = loadAssets();

    // Let the sounds resolve so only the image is outstanding.
    audioFor(FLAP_AUDIO_SRC).fireCanPlayThrough();
    audioFor(GAME_OVER_AUDIO_SRC).fireCanPlayThrough();

    // Just before the deadline the image is still not ok; the promise is pending.
    await vi.advanceTimersByTimeAsync(IMAGE_TIMEOUT_MS - 1);
    // Crossing the 10s deadline resolves the image as failed.
    await vi.advanceTimersByTimeAsync(1);

    const result = await promise;
    expect(result.imageOk).toBe(false);
    expect(result.image).toBe(FakeImage.instances[0]);
  });

  it("marks a sound unavailable on audio load error without blocking the others (10.2)", async () => {
    const promise = loadAssets();

    FakeImage.instances[0].fireLoad();
    audioFor(FLAP_AUDIO_SRC).fireError();
    audioFor(GAME_OVER_AUDIO_SRC).fireCanPlayThrough();

    const result = await promise;

    expect(result.imageOk).toBe(true);
    expect(result.flapOk).toBe(false);
    // A consistent handle is still returned even for the failed sound.
    expect(result.flapAudio).toBe(audioFor(FLAP_AUDIO_SRC));
    expect(result.gameOverOk).toBe(true);
  });

  it("marks a sound unavailable when it does not preload within 5s, others unaffected (10.2)", async () => {
    const promise = loadAssets();

    // Image and one sound succeed immediately; the flap sound is left hanging.
    FakeImage.instances[0].fireLoad();
    audioFor(GAME_OVER_AUDIO_SRC).fireCanPlayThrough();

    // Advancing past the 5s audio budget resolves the hung sound as unavailable.
    await vi.advanceTimersByTimeAsync(AUDIO_TIMEOUT_MS);

    const result = await promise;

    expect(result.imageOk).toBe(true);
    expect(result.gameOverOk).toBe(true);
    expect(result.flapOk).toBe(false);
  });

  it("resolves (never rejects) even when every asset fails or times out (1.6, 10.2)", async () => {
    const promise = loadAssets();

    FakeImage.instances[0].fireError();
    audioFor(FLAP_AUDIO_SRC).fireError();
    // Leave the game-over sound to time out.
    await vi.advanceTimersByTimeAsync(AUDIO_TIMEOUT_MS);

    const result = await promise;

    expect(result.imageOk).toBe(false);
    expect(result.flapOk).toBe(false);
    expect(result.gameOverOk).toBe(false);
    // Handles are still present for graceful degradation.
    expect(result.image).not.toBeNull();
    expect(result.flapAudio).not.toBeNull();
    expect(result.gameOverAudio).not.toBeNull();
  });
});
