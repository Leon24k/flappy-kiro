/**
 * Collision module for Flappy Kiro.
 *
 * This module is part of the pure core: it imports no browser APIs, reads no
 * globals, and mutates none of its inputs. It provides axis-aligned bounding
 * box (AABB) overlap testing and the derived hit tests used by the step
 * function to detect Game_Over conditions.
 *
 * All rectangles are `{ x, y, width, height }` in Play_Area logical coordinate
 * units, where `x`/`y` is the top-left corner and the box extends right/down.
 */

/**
 * A simple axis-aligned rectangle. `x`/`y` is the top-left corner.
 * @typedef {Object} Rect
 * @property {number} x - Left edge.
 * @property {number} y - Top edge.
 * @property {number} width - Width, extending rightward from `x`.
 * @property {number} height - Height, extending downward from `y`.
 */

/**
 * Tests whether two axis-aligned bounding boxes overlap by at least one pixel
 * (Requirement 6.1).
 *
 * The overlap must be a genuine area overlap of >= 1px on both axes; boxes that
 * merely touch edge-to-edge (zero-width shared boundary) do not count as an
 * overlap. Concretely, the overlap extent on each axis must be >= 1.
 *
 * @param {Rect} a - The first bounding box.
 * @param {Rect} b - The second bounding box.
 * @returns {boolean} True when the boxes overlap by at least 1px on both axes.
 */
export function aabbOverlap(a, b) {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;

  const overlapX = Math.min(aRight, bRight) - Math.max(a.x, b.x);
  const overlapY = Math.min(aBottom, bBottom) - Math.max(a.y, b.y);

  return overlapX >= 1 && overlapY >= 1;
}

/**
 * Derives the top pipe's bounding rectangle for a Pipe_Pair.
 *
 * The top pipe extends from the top edge of the Play_Area down to the top of
 * the Gap: `{ x, y: 0, width, height: gapCenterY - gapHeight / 2 }`.
 *
 * @param {import('./constants.js').Pipe_Pair} pipe - The pipe pair.
 * @returns {Rect} The top pipe's bounding rectangle.
 */
function topPipeRect(pipe) {
  return {
    x: pipe.x,
    y: 0,
    width: pipe.width,
    height: pipe.gapCenterY - pipe.gapHeight / 2,
  };
}

/**
 * Derives the bottom pipe's bounding rectangle for a Pipe_Pair.
 *
 * The bottom pipe extends from the bottom of the Gap down to the bottom edge of
 * the Play_Area: `{ x, y: gapCenterY + gapHeight / 2, width,
 * height: playAreaHeight - (gapCenterY + gapHeight / 2) }`.
 *
 * @param {import('./constants.js').Pipe_Pair} pipe - The pipe pair.
 * @param {number} playAreaHeight - The Play_Area height in logical units.
 * @returns {Rect} The bottom pipe's bounding rectangle.
 */
function bottomPipeRect(pipe, playAreaHeight) {
  const bottomTop = pipe.gapCenterY + pipe.gapHeight / 2;
  return {
    x: pipe.x,
    y: bottomTop,
    width: pipe.width,
    height: playAreaHeight - bottomTop,
  };
}

/**
 * Tests whether the ghost's bounding box overlaps the top or bottom pipe of any
 * Pipe_Pair by at least one pixel (Requirement 6.1).
 *
 * @param {import('./constants.js').Ghost} ghost - The ghost; its bounding box
 *   is `{ x, y, width, height }`.
 * @param {import('./constants.js').Pipe_Pair[]} pipes - The active pipe pairs.
 * @param {{ height: number }} playArea - The Play_Area bounds; `height` is used
 *   to derive the bottom pipe rectangle.
 * @returns {boolean} True when the ghost hits any pipe.
 */
export function hitsAnyPipe(ghost, pipes, playArea) {
  const ghostRect = {
    x: ghost.x,
    y: ghost.y,
    width: ghost.width,
    height: ghost.height,
  };

  for (const pipe of pipes) {
    if (aabbOverlap(ghostRect, topPipeRect(pipe))) {
      return true;
    }
    if (aabbOverlap(ghostRect, bottomPipeRect(pipe, playArea.height))) {
      return true;
    }
  }

  return false;
}

/**
 * Tests whether the ghost has hit the ground: its bottom edge (y + height)
 * reaches or crosses the Play_Area's ground boundary (Requirement 6.2).
 *
 * @param {import('./constants.js').Ghost} ghost - The ghost; its bottom edge is
 *   `ghost.y + ghost.height`.
 * @param {{ height: number }} playArea - The Play_Area bounds; `height` is the
 *   ground boundary.
 * @returns {boolean} True when the ghost's bottom edge reaches or crosses the
 *   ground.
 */
export function hitsGround(ghost, playArea) {
  return ghost.y + ghost.height >= playArea.height;
}
