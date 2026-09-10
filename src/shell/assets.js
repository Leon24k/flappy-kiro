/**
 * Asset loader adapter (impure shell).
 *
 * This browser adapter is the only place that touches `Image` and
 * `HTMLAudioElement` to fetch the game's media. It confines those side effects
 * behind a single `loadAssets()` function that reports, per asset, whether the
 * asset loaded successfully. Callers use that report to degrade gracefully:
 * the renderer falls back to a placeholder when the ghost sprite is missing,
 * and the audio player no-ops for any sound that failed to preload.
 *
 * Two distinct policies apply (see design "Asset Loader" and the Error
 * Handling table):
 *
 * - The ghost sprite (`assets/ghosty.png`) is *start-blocking*. If it fails to
 *   load or does not finish within 10 seconds, the shell must stay out of the
 *   Ready state and show an error (Requirement 1.6). The loader reports this
 *   via `imageOk === false`; the caller decides to show the error screen.
 *   Requirement 9.5 additionally lets the renderer draw a placeholder, so the
 *   image handle is still returned even on failure.
 *
 * - The sounds (`assets/jump.wav`, `assets/game_over.wav`) are *non-blocking*.
 *   Each is given up to 5 seconds to preload (Requirement 10.1). A failure or
 *   timeout marks that specific sound unavailable (Requirement 10.2) without
 *   blocking or delaying anything — gameplay input must never wait on audio.
 *
 * `loadAssets()` resolves once every asset has settled (loaded, failed, or
 * timed out) so the caller has a complete report. Because each asset is bounded
 * by its own timeout, the promise is guaranteed to settle: the image within
 * ~10s and the sounds within ~5s, so the overall resolution is bounded by the
 * image's 10s ceiling. The returned promise never rejects; failure is always
 * expressed through the per-asset `*Ok` flags.
 */

/** Source path for the ghost sprite (start-blocking image). */
export const GHOST_SPRITE_SRC = "assets/ghosty.png";
/** Source path for the flap sound effect. */
export const FLAP_AUDIO_SRC = "assets/jump.wav";
/** Source path for the game-over sound effect. */
export const GAME_OVER_AUDIO_SRC = "assets/game_over.wav";

/** Time budget for the start-blocking image, in milliseconds (Requirement 1.6). */
export const IMAGE_TIMEOUT_MS = 10000;
/** Time budget for each preloaded sound, in milliseconds (Requirement 10.1). */
export const AUDIO_TIMEOUT_MS = 5000;

/**
 * Load an image with a bounded timeout.
 *
 * Resolves to `{ element, ok }` where `element` is the `Image` (always
 * returned so the renderer can attempt to draw it or fall back) and `ok` is
 * true only if the image fired `load` before erroring or timing out. Never
 * rejects: a load error or a timeout resolves with `ok: false`.
 *
 * The first of load/error/timeout to fire wins; subsequent events are ignored
 * via the `settled` guard, and the timer is always cleared.
 *
 * @param {string} src - Image source URL.
 * @param {number} timeoutMs - Maximum time to wait before giving up.
 * @returns {Promise<{ element: HTMLImageElement, ok: boolean }>}
 */
function loadImage(src, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    let element;
    try {
      element = new Image();
    } catch {
      // Environment without `Image` (non-browser): report failure, no element.
      resolve({ element: null, ok: false });
      return;
    }

    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      resolve({ element, ok });
    };

    element.onload = () => finish(true);
    element.onerror = () => finish(false);

    timer = setTimeout(() => finish(false), timeoutMs);

    try {
      element.src = src;
    } catch {
      finish(false);
    }
  });
}

/**
 * Preload an audio clip with a bounded timeout.
 *
 * Resolves to `{ element, ok }` where `element` is the `HTMLAudioElement`
 * (returned even on failure so the caller holds a consistent handle) and `ok`
 * is true only if the clip signalled it had buffered enough to play
 * (`canplaythrough`) before erroring or timing out. Never rejects and never
 * blocks: on failure or timeout it resolves with `ok: false` (Requirement
 * 10.2), so preloading a sound can never delay gameplay input.
 *
 * We listen for `canplaythrough` rather than `loadeddata` so a reported
 * success means the clip can play without stalling. `preload = "auto"` asks the
 * browser to begin buffering immediately; calling `.load()` kicks it off.
 *
 * @param {string} src - Audio source URL.
 * @param {number} timeoutMs - Maximum time to wait before marking unavailable.
 * @returns {Promise<{ element: HTMLAudioElement, ok: boolean }>}
 */
function loadAudio(src, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    let element;
    try {
      element = new Audio();
    } catch {
      // Environment without `Audio`: mark unavailable, no element.
      resolve({ element: null, ok: false });
      return;
    }

    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      element.oncanplaythrough = null;
      element.onerror = null;
      resolve({ element, ok });
    };

    element.oncanplaythrough = () => finish(true);
    element.onerror = () => finish(false);

    timer = setTimeout(() => finish(false), timeoutMs);

    try {
      element.preload = "auto";
      element.src = src;
      // `.load()` may be absent under some mocks; guard the call.
      if (typeof element.load === "function") {
        element.load();
      }
    } catch {
      finish(false);
    }
  });
}

/**
 * @typedef {Object} LoadedAssets
 * @property {HTMLImageElement | null} image - The ghost sprite element. Present
 *   even when `imageOk` is false so the renderer can attempt a draw or fall
 *   back to a placeholder (Requirement 9.5).
 * @property {boolean} imageOk - True only if the ghost sprite loaded within the
 *   10s budget. When false, the shell must stay out of Ready and show the error
 *   screen (Requirement 1.6).
 * @property {HTMLAudioElement | null} flapAudio - The flap sound element, or
 *   null if audio is unavailable in this environment.
 * @property {boolean} flapOk - True only if the flap sound preloaded within the
 *   5s budget; when false the flap sound is unavailable (Requirement 10.2).
 * @property {HTMLAudioElement | null} gameOverAudio - The game-over sound
 *   element, or null if audio is unavailable.
 * @property {boolean} gameOverOk - True only if the game-over sound preloaded
 *   within the 5s budget; when false that sound is unavailable (Requirement
 *   10.2).
 */

/**
 * Load every game asset, reporting per-asset success.
 *
 * All three assets are started concurrently. The image is bounded by a 10s
 * timeout (start-blocking); each sound is bounded by an independent 5s timeout
 * and never blocks. The returned promise resolves once all three have settled,
 * giving the caller a complete report. It never rejects — failure is expressed
 * only through the `imageOk` / `flapOk` / `gameOverOk` flags.
 *
 * @returns {Promise<LoadedAssets>} A structured, per-asset load report.
 */
export async function loadAssets() {
  const [image, flap, gameOver] = await Promise.all([
    loadImage(GHOST_SPRITE_SRC, IMAGE_TIMEOUT_MS),
    loadAudio(FLAP_AUDIO_SRC, AUDIO_TIMEOUT_MS),
    loadAudio(GAME_OVER_AUDIO_SRC, AUDIO_TIMEOUT_MS),
  ]);

  return {
    image: image.element,
    imageOk: image.ok,
    flapAudio: flap.element,
    flapOk: flap.ok,
    gameOverAudio: gameOver.element,
    gameOverOk: gameOver.ok,
  };
}
