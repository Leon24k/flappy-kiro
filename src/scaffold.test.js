import { describe, it, expect } from "vitest";

/**
 * Scaffold smoke test.
 *
 * Verifies the test tooling (Vitest + fast-check) runs and that the jsdom-style
 * browser-mock environment is available for the adapter tests added later.
 */
describe("test scaffold", () => {
  it("runs Vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("exposes a browser-mock DOM environment (jsdom)", () => {
    expect(typeof document).toBe("object");
    expect(typeof window).toBe("object");
    expect(typeof localStorage).toBe("object");

    const canvas = document.createElement("canvas");
    expect(canvas.tagName).toBe("CANVAS");
  });

  it("loads fast-check for property-based tests", async () => {
    const fc = await import("fast-check");
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
    );
    expect(typeof fc.property).toBe("function");
  });
});
