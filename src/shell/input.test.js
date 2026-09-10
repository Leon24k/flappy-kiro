import { describe, it, expect, afterEach } from "vitest";
import { createInput } from "./input.js";

/**
 * Unit tests for the input adapter's normalization behavior.
 *
 * Validates Requirements 2.4, 2.5:
 * - A Spacebar keydown enqueues exactly one normalized flap event (2.4).
 * - A pointerdown within the Play_Area (canvas bounds) enqueues exactly one
 *   normalized flap event (2.5).
 * - A pointerdown outside the Play_Area bounds is ignored (2.5).
 *
 * Each queued event must be a normalized `InputEvent { type: 'flap', timestamp }`.
 *
 * These run under jsdom (see vitest.config.js). We dispatch real DOM events at
 * the registered targets so the adapter's own listeners run. jsdom's
 * `getBoundingClientRect()` returns a zero rect by default, so we stub it to
 * give the canvas measurable Play_Area geometry.
 */

/**
 * Create a canvas element with a fixed, measurable bounding rectangle so the
 * in-bounds test in the adapter has real geometry to compare against.
 * @param {{ left: number, top: number, right: number, bottom: number }} rect
 */
function makeCanvas(rect = { left: 100, top: 100, right: 300, bottom: 500 }) {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
  });
  document.body.appendChild(canvas);
  return canvas;
}

/**
 * Build a `pointerdown` DOM event carrying client coordinates.
 *
 * jsdom does not implement the `PointerEvent` constructor, but the adapter only
 * reads `clientX`/`clientY` off the event, and `dispatchEvent` invokes listeners
 * by the event's `type` regardless of the constructor used. A `MouseEvent` typed
 * as `pointerdown` therefore exercises the real pointer listener faithfully.
 * @param {number} clientX
 * @param {number} clientY
 */
function pointerDownEvent(clientX, clientY) {
  return new MouseEvent("pointerdown", { clientX, clientY, bubbles: true });
}

/** Track adapters so we always remove listeners between tests. */
let adapters = [];
function track(adapter) {
  adapters.push(adapter);
  return adapter;
}

afterEach(() => {
  adapters.forEach((a) => a.dispose());
  adapters = [];
  document.body.innerHTML = "";
});

describe("createInput - input normalization (2.4, 2.5)", () => {
  it("throws when no canvas is provided", () => {
    expect(() => createInput({})).toThrow();
  });

  it("starts with an empty queue", () => {
    const canvas = makeCanvas();
    const input = track(createInput({ canvas, keyTarget: window }));
    expect(input.size()).toBe(0);
    expect(input.drain()).toEqual([]);
  });

  it("enqueues exactly one flap for a Spacebar keydown (2.4)", () => {
    const canvas = makeCanvas();
    const input = track(createInput({ canvas, keyTarget: window }));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));

    expect(input.size()).toBe(1);
    const events = input.drain();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("flap");
    expect(typeof events[0].timestamp).toBe("number");
  });

  it("ignores non-Spacebar keydowns (2.4)", () => {
    const canvas = makeCanvas();
    const input = track(createInput({ canvas, keyTarget: window }));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter" }));

    expect(input.size()).toBe(0);
  });

  it("ignores auto-repeat Spacebar keydowns so holding does not flood the queue (2.4)", () => {
    const canvas = makeCanvas();
    const input = track(createInput({ canvas, keyTarget: window }));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", repeat: true }));

    expect(input.size()).toBe(1);
  });

  it("enqueues exactly one flap for an in-bounds pointerdown (2.5)", () => {
    const canvas = makeCanvas({ left: 100, top: 100, right: 300, bottom: 500 });
    const input = track(createInput({ canvas, keyTarget: window }));

    canvas.dispatchEvent(pointerDownEvent(200, 300));

    expect(input.size()).toBe(1);
    const events = input.drain();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("flap");
    expect(typeof events[0].timestamp).toBe("number");
  });

  it("treats pointerdowns on the Play_Area edges as in-bounds (2.5)", () => {
    const canvas = makeCanvas({ left: 100, top: 100, right: 300, bottom: 500 });
    const input = track(createInput({ canvas, keyTarget: window }));

    canvas.dispatchEvent(pointerDownEvent(100, 100));
    canvas.dispatchEvent(pointerDownEvent(300, 500));

    expect(input.size()).toBe(2);
  });

  it("ignores an out-of-bounds pointerdown (2.5)", () => {
    const canvas = makeCanvas({ left: 100, top: 100, right: 300, bottom: 500 });
    const input = track(createInput({ canvas, keyTarget: window }));

    // Left of, above, right of, and below the Play_Area rectangle.
    canvas.dispatchEvent(pointerDownEvent(50, 300));
    canvas.dispatchEvent(pointerDownEvent(200, 50));
    canvas.dispatchEvent(pointerDownEvent(400, 300));
    canvas.dispatchEvent(pointerDownEvent(200, 600));

    expect(input.size()).toBe(0);
    expect(input.drain()).toEqual([]);
  });

  it("normalizes every queued event to { type: 'flap', timestamp } (2.4, 2.5)", () => {
    const canvas = makeCanvas();
    const input = track(createInput({ canvas, keyTarget: window }));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    canvas.dispatchEvent(pointerDownEvent(200, 300));

    const events = input.drain();
    expect(events).toHaveLength(2);
    for (const ev of events) {
      expect(Object.keys(ev).sort()).toEqual(["timestamp", "type"]);
      expect(ev.type).toBe("flap");
      expect(typeof ev.timestamp).toBe("number");
    }
  });

  it("drain empties the queue and preserves arrival order", () => {
    const canvas = makeCanvas();
    const input = track(createInput({ canvas, keyTarget: window }));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    canvas.dispatchEvent(pointerDownEvent(200, 300));

    const first = input.drain();
    expect(first).toHaveLength(2);
    expect(input.size()).toBe(0);
    expect(input.drain()).toEqual([]);
  });

  it("stops enqueuing after dispose removes the listeners", () => {
    const canvas = makeCanvas();
    const input = createInput({ canvas, keyTarget: window });

    input.dispose();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    canvas.dispatchEvent(pointerDownEvent(200, 300));

    expect(input.size()).toBe(0);
  });
});
