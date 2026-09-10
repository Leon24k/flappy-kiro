# Tech Stack

## Language & runtime

- Vanilla JavaScript using native ES modules (`"type": "module"`). No framework, no bundler.
- The game runs by opening `index.html` directly in a modern browser; `index.html` loads `src/main.js` as `<script type="module">`.

## Browser APIs (confined to the shell)

- **Rendering:** HTML5 Canvas 2D (`#game-canvas`, pixelated rendering, 9:16 letterboxed).
- **Audio:** `HTMLAudioElement` for one-shot sound effects (restart via `currentTime = 0`).
- **Persistence:** `localStorage` (key `flappy-kiro.highScore`).
- **Game loop:** `requestAnimationFrame` with a fixed-timestep accumulator (`FIXED_DT = 1/60`).
- **Input:** `keydown` (Spacebar) and `pointerdown` (click/tap) normalized into a queued flap event.

## Testing

- **Test runner:** [Vitest](https://vitest.dev) with `globals: true` and the `jsdom` environment (provides `window`, `document`, `localStorage`, DOM events for shell adapter tests).
- **Property-based testing:** [fast-check](https://github.com/dubzzz/fast-check) for the pure core. Each property test runs a minimum of 100 iterations and is tagged with a comment: `Feature: flappy-kiro, Property {number}: {property_text}`.
- Test files live next to source and match `src/**/*.test.js`.
- The pure core is tested primarily with property-based tests; browser adapters/UI use example-based unit, integration (mocked browser APIs), and a performance smoke test.

## Common commands

```bash
# Install dev dependencies
npm install

# Run the full test suite once (no watch mode)
npm test
```

There is no build/compile step. To play, open `index.html` in a browser (or serve the folder over a static file server so ES module imports resolve).

## Conventions

- Keep the core deterministic: no browser APIs, no globals, no `Date.now()` inside the core. Thread randomness through a seedable PRNG (e.g. mulberry32) carried in the game state.
- Core data is plain, immutable-by-convention JavaScript objects.
- Prefer clear JSDoc-style module and function comments, matching the existing files.
