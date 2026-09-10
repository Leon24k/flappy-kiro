import { describe, it, expect, vi } from "vitest";
import { createAudioPlayer } from "./audio.js";

/**
 * Unit tests for the audio player adapter.
 *
 * These exercise the side-effecting adapter against fake audio elements
 * (spies), per the design's Testing Strategy ("Audio adapter: playFlap on flap
 * (2.3), playGameOver on game over (6.3, 6.4), restart-from-start via
 * currentTime = 0 (10.4)"). No real HTMLAudioElement is required.
 */

/**
 * Build a fake one-shot audio element with a spied `play()`.
 * @param {{ reject?: boolean, throws?: boolean }} [opts]
 */
function fakeAudio(opts = {}) {
  const { reject = false, throws = false } = opts;
  return {
    currentTime: 12.5,
    play: vi.fn(() => {
      if (throws) throw new Error("play threw");
      return reject ? Promise.reject(new Error("blocked")) : Promise.resolve();
    }),
  };
}

describe("createAudioPlayer", () => {
  it("exposes playFlap and playGameOver", () => {
    const player = createAudioPlayer({});
    expect(typeof player.playFlap).toBe("function");
    expect(typeof player.playGameOver).toBe("function");
  });

  it("plays the flap sound from the start (2.3, 10.3, 10.4)", () => {
    const flapAudio = fakeAudio();
    const player = createAudioPlayer({ flapAudio });

    player.playFlap();

    expect(flapAudio.currentTime).toBe(0);
    expect(flapAudio.play).toHaveBeenCalledTimes(1);
  });

  it("plays the game-over sound from the start (6.3, 10.5, 10.4)", () => {
    const gameOverAudio = fakeAudio();
    const player = createAudioPlayer({ gameOverAudio });

    player.playGameOver();

    expect(gameOverAudio.currentTime).toBe(0);
    expect(gameOverAudio.play).toHaveBeenCalledTimes(1);
  });

  it("restarts an already-playing sound from the beginning on re-trigger (10.4)", () => {
    const flapAudio = fakeAudio();
    const player = createAudioPlayer({ flapAudio });

    player.playFlap();
    flapAudio.currentTime = 0.8; // simulate playback progressing
    player.playFlap();

    expect(flapAudio.currentTime).toBe(0);
    expect(flapAudio.play).toHaveBeenCalledTimes(2);
  });

  it("no-ops silently when the flap sound is unavailable (10.2)", () => {
    const player = createAudioPlayer({ flapAudio: null });
    expect(() => player.playFlap()).not.toThrow();
  });

  it("no-ops silently when the game-over sound is unavailable, transition still completes (6.4, 10.2)", () => {
    const player = createAudioPlayer({ gameOverAudio: null });
    expect(() => player.playGameOver()).not.toThrow();
  });

  it("defaults both sounds to unavailable when no elements are provided", () => {
    const player = createAudioPlayer();
    expect(() => {
      player.playFlap();
      player.playGameOver();
    }).not.toThrow();
  });

  it("swallows a rejected play() promise so input is never blocked (6.4, 10.2)", async () => {
    const flapAudio = fakeAudio({ reject: true });
    const player = createAudioPlayer({ flapAudio });

    expect(() => player.playFlap()).not.toThrow();
    // Give the rejected promise a tick; it must not surface as unhandled.
    await Promise.resolve();
    expect(flapAudio.play).toHaveBeenCalledTimes(1);
  });

  it("swallows a synchronous throw from play() (6.4, 10.2)", () => {
    const gameOverAudio = fakeAudio({ throws: true });
    const player = createAudioPlayer({ gameOverAudio });

    expect(() => player.playGameOver()).not.toThrow();
    expect(gameOverAudio.play).toHaveBeenCalledTimes(1);
  });

  it("tolerates play() returning undefined (no promise)", () => {
    const flapAudio = { currentTime: 3, play: vi.fn(() => undefined) };
    const player = createAudioPlayer({ flapAudio });

    expect(() => player.playFlap()).not.toThrow();
    expect(flapAudio.currentTime).toBe(0);
    expect(flapAudio.play).toHaveBeenCalledTimes(1);
  });
});
