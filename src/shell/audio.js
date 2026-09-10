/**
 * Audio player adapter (impure shell).
 *
 * This is a browser adapter: it is the only place that touches
 * `HTMLAudioElement.play()`. The game has exactly two short one-shot sound
 * effects (flap and game-over), so a plain `HTMLAudioElement` restarted via
 * `currentTime = 0` is sufficient (see design "Technology Choices").
 *
 * The player is built from a factory that receives the already-loaded audio
 * elements (or `null` when a sound failed to load / timed out). This decouples
 * the adapter from the asset loader (task 13): the loader owns preloading and
 * failure detection, and simply hands the resulting elements — or `null` — to
 * `createAudioPlayer`.
 *
 * Requirements:
 * - 2.3: play `assets/jump.wav` on a flap while Playing.
 * - 6.3: play `assets/game_over.wav` when Game_State becomes Game_Over.
 * - 6.4: if the game-over sound cannot play, the transition still completes and
 *   the state remains Game_Over (this adapter never throws).
 * - 10.2: a sound that failed to load / timed out is `null`; the corresponding
 *   `play*` call no-ops silently and never blocks input.
 * - 10.3, 10.5: begin playback promptly (a synchronous `play()` call) for flap
 *   and game-over respectively.
 * - 10.4: restart an already-playing one-shot from the beginning by setting
 *   `currentTime = 0` before `play()`.
 */

/**
 * Play a single one-shot audio element from its beginning.
 *
 * Total and non-blocking: if `el` is null/undefined (asset unavailable per
 * Requirement 10.2) the call is a silent no-op. Otherwise `currentTime` is
 * reset to 0 so a re-triggered sound restarts from the start (Requirement
 * 10.4), then `play()` is invoked.
 *
 * `HTMLAudioElement.play()` returns a promise that can reject (e.g. autoplay
 * policy, decode error, or the element being unplayable). That rejection is
 * swallowed so a failed play never surfaces as an unhandled rejection and never
 * blocks or delays gameplay input (Requirements 6.4, 10.2). Any synchronous
 * throw from touching `currentTime`/`play()` is likewise contained.
 *
 * @param {HTMLAudioElement | null | undefined} el - The audio element to play,
 *   or a nullish value when the sound is unavailable.
 * @returns {void}
 */
function playOneShot(el) {
  if (el === null || el === undefined) {
    return;
  }

  try {
    // Restart from the beginning so a rapid re-trigger replays the full sound
    // rather than continuing from wherever it currently is (Requirement 10.4).
    el.currentTime = 0;
    const result = el.play();
    // Older/edge implementations may return undefined; guard before `.catch`.
    if (result && typeof result.catch === "function") {
      // Swallow rejection: a sound that cannot play must not interrupt the
      // game (Requirements 6.4, 10.2).
      result.catch(() => {});
    }
  } catch {
    // Swallow any synchronous failure for the same reason.
  }
}

/**
 * Create an audio player bound to a pair of one-shot sound elements.
 *
 * The elements are supplied by the asset loader. Either may be `null` when its
 * asset failed to load or exceeded the preload timeout (Requirement 10.2), in
 * which case the matching `play*` method becomes a silent no-op.
 *
 * @param {{
 *   flapAudio?: HTMLAudioElement | null,
 *   gameOverAudio?: HTMLAudioElement | null,
 * }} [elements] - The loaded audio elements (or null when unavailable).
 * @returns {{ playFlap: () => void, playGameOver: () => void }} The audio
 *   player. Both methods are total and never block input.
 */
export function createAudioPlayer(elements = {}) {
  const { flapAudio = null, gameOverAudio = null } = elements;

  return {
    /**
     * Play the flap sound from its beginning (Requirements 2.3, 10.3, 10.4).
     * No-ops silently if the flap sound is unavailable (Requirement 10.2).
     * @returns {void}
     */
    playFlap() {
      playOneShot(flapAudio);
    },

    /**
     * Play the game-over sound from its beginning (Requirements 6.3, 10.5,
     * 10.4). No-ops silently if unavailable, so the Game_Over transition still
     * completes without audio (Requirements 6.4, 10.2).
     * @returns {void}
     */
    playGameOver() {
      playOneShot(gameOverAudio);
    },
  };
}
