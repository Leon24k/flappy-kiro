/**
 * Pure canvas sizing helper for Flappy Kiro.
 *
 * Although this module lives in the shell (it computes the on-screen canvas
 * dimensions), it is intentionally pure: it imports no browser APIs, reads no
 * globals, and never mutates its inputs. The caller passes the current viewport
 * size and receives back the dimensions to apply to the canvas element.
 */

/**
 * Fixed aspect ratio of the Play_Area expressed as width / height.
 *
 * The Play_Area is a 9:16 (width:height) space, so width is the narrower
 * dimension. 9 / 16 = 0.5625.
 */
const ASPECT_W = 9;
const ASPECT_H = 16;

/**
 * Compute the largest 9:16 (width:height) canvas that fits entirely within the
 * viewport without cropping or distorting the aspect ratio (Requirement 9.3).
 *
 * The returned dimensions always satisfy width / height === 9 / 16 and never
 * exceed the viewport in either dimension. The result is "letterboxed": the
 * canvas is scaled up to whichever of width- or height-limited is more
 * constraining, so the opposite axis has slack (the surrounding letterbox).
 *
 * A non-positive viewport dimension yields a zero-sized canvas, since no
 * positive 9:16 rectangle can fit within it.
 *
 * @param {number} viewportW - Available viewport width in pixels (>= 0).
 * @param {number} viewportH - Available viewport height in pixels (>= 0).
 * @returns {{ width: number, height: number }} Canvas dimensions at a 9:16
 *   ratio, scaled to the largest size fitting entirely within the viewport.
 */
export function computeCanvasSize(viewportW, viewportH) {
  if (viewportW <= 0 || viewportH <= 0) {
    return { width: 0, height: 0 };
  }

  // Height implied by fully using the viewport width at the fixed ratio.
  const heightIfWidthBound = (viewportW * ASPECT_H) / ASPECT_W;

  if (heightIfWidthBound <= viewportH) {
    // Width is the limiting dimension: use full width, derive height.
    return { width: viewportW, height: heightIfWidthBound };
  }

  // Height is the limiting dimension: use full height, derive width.
  return { width: (viewportH * ASPECT_W) / ASPECT_H, height: viewportH };
}
