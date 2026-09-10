import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * The pure core (`src/core/`) is environment-agnostic and runs under any
 * environment. The impure shell adapters (`src/shell/`) touch browser APIs
 * (Canvas, HTMLAudioElement, localStorage, DOM input), so tests default to the
 * jsdom environment, which provides a browser-mock DOM for adapter tests.
 */
export default defineConfig({
  test: {
    // jsdom provides window, document, localStorage, and DOM events so the
    // shell adapters can be exercised without a real browser.
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.js"],
  },
});
