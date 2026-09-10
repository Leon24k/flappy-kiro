/**
 * Core constants and shared type shapes for Flappy Kiro.
 *
 * This module is part of the pure core: it imports no browser APIs and reads no
 * globals. All values are expressed in Play_Area logical coordinate units (a
 * fixed 9:16 space); the renderer scales logical units to device pixels.
 *
 * Concrete values are chosen within the ranges mandated by the requirements and
 * design. Where the design suggests a value, that suggestion is used.
 */

/**
 * Fixed simulation timestep, in seconds. The game loop integrates physics in
 * fixed increments of this size so behavior is deterministic and frame-rate
 * independent.
 * @type {number}
 */
export const FIXED_DT = 1 / 60;

/**
 * The logical Play_Area bounds in a fixed 9:16 (width:height) space.
 * @type {{ width: number, height: number }}
 */
export const PLAY_AREA = { width: 360, height: 640 };

/**
 * The ghost's logical size in Play_Area units. Its bounding box is used
 * directly for collision. Kept here so gap-height passability can be validated
 * against it (Requirement 4.4).
 * @type {{ width: number, height: number }}
 */
export const GHOST_SIZE = { width: 34, height: 24 };

/**
 * Constant downward acceleration applied to the Ghost while Playing, in
 * units/s^2 (Requirement 3.1).
 * @type {number}
 */
export const GRAVITY = 1400;

/**
 * The single fixed upward velocity applied on a Flap, in units/s. Replaces any
 * prior velocity rather than accumulating. Must lie in [300, 600]
 * (Requirement 2.2); design suggests ~420.
 * @type {number}
 */
export const FLAP_VELOCITY = 420;

/**
 * The fixed downward velocity cap, in units/s. The Ghost's downward velocity
 * never exceeds this (Requirement 3.2).
 * @type {number}
 */
export const TERMINAL_VELOCITY = 700;

/**
 * The constant horizontal scroll speed shared by all Pipe_Pairs, in units/s.
 * Must lie in [100, 300] (Requirement 4.1); design suggests ~160.
 * @type {number}
 */
export const PIPE_SPEED = 160;

/**
 * The fixed horizontal spacing between consecutive Pipe_Pair generation points,
 * in units. Must lie in [150, 400] (Requirement 4.2); design suggests ~220.
 * @type {number}
 */
export const PIPE_SPACING = 220;

/**
 * The fixed vertical Gap height, in units. Must lie in [0.20, 0.35] * height
 * AND be at least 1.5 * ghost height so the Ghost can pass (Requirement 4.4).
 *
 * With height=640: [0.20, 0.35]*640 = [128, 224]; 1.5*ghost height = 36.
 * 160 (= 0.25 * 640) satisfies both constraints.
 * @type {number}
 */
export const GAP_HEIGHT = 160;

/**
 * The pipe column width in units. Used to derive pipe bounding boxes for
 * collision and rendering.
 * @type {number}
 */
export const PIPE_WIDTH = 60;

/**
 * Minimum vertical position for a generated Gap center: no closer than 10% of
 * the Play_Area height to the top edge (Requirement 4.3).
 * @type {number}
 */
export const GAP_CENTER_MIN = 0.1 * PLAY_AREA.height;

/**
 * Maximum vertical position for a generated Gap center: no closer than 10% of
 * the Play_Area height to the bottom edge (Requirement 4.3).
 * @type {number}
 */
export const GAP_CENTER_MAX = 0.9 * PLAY_AREA.height;

/**
 * The Ghost's fixed starting position: horizontally at 25% of the Play_Area
 * width from the left edge, vertically centered (Requirement 1.2). `y` is the
 * top of the Ghost's bounding box, so it is offset by half the ghost height.
 * @type {{ x: number, y: number }}
 */
export const GHOST_START = {
  x: 0.25 * PLAY_AREA.width,
  y: PLAY_AREA.height / 2 - GHOST_SIZE.height / 2,
};

/**
 * The maximum attainable Score. The Score saturates here without further
 * increase (Requirement 5.4).
 * @type {number}
 */
export const SCORE_MAX = 999999;

/**
 * The restart lockout window, in milliseconds. A Flap provided sooner than this
 * after entering Game_Over is ignored (Requirements 7.4, 7.5).
 * @type {number}
 */
export const RESTART_LOCKOUT_MS = 500;

/* -------------------------------------------------------------------------- */
/* Shared type shapes (JSDoc typedefs for reference by other core modules)    */
/* -------------------------------------------------------------------------- */

/**
 * The current mode of the Game.
 * @typedef {'Ready' | 'Playing' | 'Game_Over'} GameMode
 */

/**
 * The player-controlled character. Its bounding box `{ x, y, width, height }`
 * is used directly for collision.
 * @typedef {Object} Ghost
 * @property {number} x - Left edge of the bounding box; fixed at GHOST_START.x.
 * @property {number} y - Top edge of the bounding box.
 * @property {number} width - Bounding box width.
 * @property {number} height - Bounding box height.
 * @property {number} velocityY - Vertical velocity in units/s; positive is down.
 */

/**
 * A set of two vertically aligned pipes separated by a Gap.
 *
 * Derived rectangles:
 * - Top pipe:    `{ x, y: 0, width, height: gapCenterY - gapHeight/2 }`
 * - Bottom pipe: `{ x, y: gapCenterY + gapHeight/2, width,
 *                   height: PLAY_AREA.height - (gapCenterY + gapHeight/2) }`
 * @typedef {Object} Pipe_Pair
 * @property {number} id - Unique identifier for this pair.
 * @property {number} x - Left edge of the pipe columns; decreases over time.
 * @property {number} width - Pipe column width.
 * @property {number} gapCenterY - Vertical center of the Gap, in
 *   [GAP_CENTER_MIN, GAP_CENTER_MAX].
 * @property {number} gapHeight - Gap height; equals GAP_HEIGHT.
 * @property {boolean} counted - True once this pair has awarded a point.
 */

/**
 * A normalized input event produced by the input adapter and consumed by the
 * pure step function.
 * @typedef {Object} InputEvent
 * @property {'flap'} type - The input action type.
 * @property {number} timestamp - Milliseconds, from the input adapter.
 */

/**
 * The seedable PRNG state (e.g. mulberry32) threaded through GameState so
 * randomness is reproducible and `step` stays pure.
 * @typedef {Object} RngState
 * @property {number} seed - The current 32-bit PRNG state word.
 */

/**
 * The complete, immutable-by-convention game state threaded through `step`.
 * @typedef {Object} GameState
 * @property {GameMode} mode - The current Game_State mode.
 * @property {Ghost} ghost - The player-controlled character.
 * @property {Pipe_Pair[]} pipes - The active pipe pairs.
 * @property {number} score - Current session score, integer 0..SCORE_MAX.
 * @property {number} highScore - Best score, integer 0..SCORE_MAX.
 * @property {number} distanceSinceLastSpawn - Units traveled since the last
 *   Pipe_Pair was generated; drives spawn timing.
 * @property {number} timeInGameOver - Seconds accumulated in Game_Over, used
 *   for the restart lockout.
 * @property {RngState} rng - The seedable PRNG state.
 */

export {};
