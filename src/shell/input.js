/**
 * Input adapter (impure shell).
 *
 * This browser adapter is the only place that listens to DOM input events. It
 * registers `keydown` (Spacebar) and `pointerdown` (click/tap within the
 * Play_Area) listeners and normalizes both into a single internal queue of
 * `InputEvent { type: 'flap', timestamp }` values.
 *
 * The adapter never mutates game state directly and never runs the core: it
 * only accumulates flap events. The game loop drains the queue each frame via
 * `drain()` and feeds the events into the pure `step` function. When the
 * adapter is no longer needed, `dispose()` removes the listeners so it leaves
 * no lingering side effects.
 *
 * See design "Input Adapter" and the `InputEvent` data model.
 *
 * Requirements:
 * - 2.4: accept a keyboard Spacebar press as a Flap input.
 * - 2.5: accept a pointer click or tap within the Play_Area as a Flap input;
 *   pointer events outside the Play_Area (canvas) bounds are ignored.
 */

/**
 * A normalized input event, as consumed by the pure core.
 *
 * @typedef {Object} InputEvent
 * @property {'flap'} type - The kind of input; only 'flap' exists today.
 * @property {number} timestamp - Milliseconds, from the DOM event's
 *   `timeStamp` when available, else `performance.now()`.
 */

/**
 * The input adapter handle returned by {@link createInput}.
 *
 * @typedef {Object} InputAdapter
 * @property {() => InputEvent[]} drain - Remove and return all queued events in
 *   arrival order. The internal queue is left empty.
 * @property {() => number} size - The number of currently queued events (useful
 *   for tests and diagnostics); does not modify the queue.
 * @property {() => void} dispose - Remove all registered DOM listeners. Safe to
 *   call more than once.
 */

/**
 * Resolve a monotonic-ish timestamp for a normalized event.
 *
 * Prefers the DOM event's own `timeStamp` (already relative to a page origin
 * and set by the browser at dispatch time). Falls back to `performance.now()`,
 * and finally to `Date.now()` in environments lacking `performance`.
 *
 * @param {Event} [domEvent] - The originating DOM event, if any.
 * @returns {number} A timestamp in milliseconds.
 */
function resolveTimestamp(domEvent) {
  if (domEvent && typeof domEvent.timeStamp === "number" && domEvent.timeStamp > 0) {
    return domEvent.timeStamp;
  }
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * Determine whether a pointer event fell within the Play_Area.
 *
 * The Play_Area is represented on screen by the canvas element, which is
 * letterboxed to a fixed 9:16 ratio (see sizing helper). A pointer is
 * considered in-bounds when its client coordinates lie within the canvas'
 * bounding rectangle. Events on the surrounding letterbox are ignored.
 *
 * @param {HTMLElement} canvas - The Play_Area canvas element.
 * @param {PointerEvent} event - The pointer event to test.
 * @returns {boolean} True when the pointer is within the canvas bounds.
 */
function isWithinPlayArea(canvas, event) {
  if (!canvas || typeof canvas.getBoundingClientRect !== "function") {
    // Without measurable bounds we cannot confirm the pointer is in-bounds, so
    // conservatively treat it as outside (Requirement 2.5).
    return false;
  }
  const rect = canvas.getBoundingClientRect();
  const { clientX, clientY } = event;
  if (typeof clientX !== "number" || typeof clientY !== "number") {
    return false;
  }
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

/**
 * Create the input adapter, wiring up keyboard and pointer flap listeners.
 *
 * A Spacebar `keydown` anywhere enqueues one flap. A `pointerdown` whose client
 * coordinates fall within the canvas bounds enqueues one flap; out-of-bounds
 * pointer events are ignored. Each enqueued event is
 * `{ type: 'flap', timestamp }`.
 *
 * @param {Object} options - Configuration.
 * @param {HTMLElement} options.canvas - The Play_Area canvas element, used both
 *   as the pointer target and to derive in-bounds Play_Area geometry.
 * @param {EventTarget} [options.keyTarget] - Where to listen for keyboard
 *   events. Defaults to `window` (falling back to `document`) so a Spacebar
 *   press is captured regardless of focus.
 * @returns {InputAdapter} The adapter handle with `drain`, `size`, and
 *   `dispose`.
 */
export function createInput({ canvas, keyTarget } = {}) {
  if (!canvas) {
    throw new Error("createInput requires a canvas element");
  }

  /** @type {InputEvent[]} */
  const queue = [];

  const resolvedKeyTarget =
    keyTarget ||
    (typeof window !== "undefined"
      ? window
      : typeof document !== "undefined"
        ? document
        : null);

  /**
   * Push a normalized flap event onto the queue.
   * @param {Event} [domEvent]
   */
  const enqueueFlap = (domEvent) => {
    queue.push({ type: "flap", timestamp: resolveTimestamp(domEvent) });
  };

  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    // Match Spacebar across browsers: modern `code`, modern `key` (a space
    // character), and the legacy keyCode 32. Ignore auto-repeat so holding the
    // key does not flood the queue.
    const isSpace =
      event.code === "Space" || event.key === " " || event.key === "Spacebar" || event.keyCode === 32;
    if (!isSpace) {
      return;
    }
    if (event.repeat) {
      return;
    }
    // Prevent the default page-scroll that Spacebar triggers.
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    enqueueFlap(event);
  };

  /** @param {PointerEvent} event */
  const onPointerDown = (event) => {
    if (!isWithinPlayArea(canvas, event)) {
      return;
    }
    enqueueFlap(event);
  };

  if (resolvedKeyTarget && typeof resolvedKeyTarget.addEventListener === "function") {
    resolvedKeyTarget.addEventListener("keydown", onKeyDown);
  }
  if (typeof canvas.addEventListener === "function") {
    canvas.addEventListener("pointerdown", onPointerDown);
  }

  return {
    drain() {
      // Return the accumulated events in arrival order and reset the queue in
      // place so any references the caller holds see it emptied.
      return queue.splice(0, queue.length);
    },
    size() {
      return queue.length;
    },
    dispose() {
      if (resolvedKeyTarget && typeof resolvedKeyTarget.removeEventListener === "function") {
        resolvedKeyTarget.removeEventListener("keydown", onKeyDown);
      }
      if (typeof canvas.removeEventListener === "function") {
        canvas.removeEventListener("pointerdown", onPointerDown);
      }
    },
  };
}
