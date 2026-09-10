/**
 * Impure shell barrel module.
 *
 * The shell holds the browser adapters (asset loader, input, renderer, audio
 * player, storage) and the game loop that wires them into the pure core each
 * frame. These modules are the only place browser-specific side effects live.
 *
 * Adapter modules are added by later tasks and re-exported here.
 */

export * from "./input.js";
export * from "./audio.js";
export * from "./sizing.js";
export * from "./storage.js";
export * from "./assets.js";
export * from "./renderer.js";
export * from "./loop.js";
