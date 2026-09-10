# Project Structure

## Architecture: functional core, imperative shell

The central design decision is a strict split between a **pure core** and an **impure shell**. The core never imports browser APIs; the shell wires adapters into the core each frame.

```
.
├── index.html            # Entry HTML; loads src/main.js as an ES module, hosts #game-canvas
├── package.json          # Metadata + test script (Vitest)
├── vitest.config.js      # Vitest config (jsdom env, globals, src/**/*.test.js)
├── assets/               # Runtime game assets
│   ├── ghosty.png        # Ghost sprite
│   ├── jump.wav          # Flap sound
│   └── game_over.wav     # Game-over sound
├── img/                  # Screenshots / docs images (not loaded at runtime)
└── src/
    ├── main.js           # Bootstrap: sizing, asset load, initial state, adapters, start loop
    ├── core/             # PURE core (deterministic, testable)
    │   └── index.js      # Barrel: re-exports core modules
    └── shell/            # IMPURE shell (browser adapters + game loop)
        └── index.js      # Barrel: re-exports adapter modules
```

## `src/core/` — pure, deterministic

Never imports Canvas, Audio, `localStorage`, DOM, or `requestAnimationFrame`; reads no globals. Exposes a single transition function:

- `step(state, dt, inputEvents) -> GameState`

Supporting modules (added over the build, re-exported from `core/index.js`): constants, rng, physics, pipes, collision, scoring, and the state machine. All of these are pure functions with universal invariants suited to property-based testing.

## `src/shell/` — impure adapters

The only place browser-specific side effects live. Adapters (re-exported from `shell/index.js`):

- **Asset Loader** – loads sprite + audio, resolves when ready, times out to an error screen.
- **Input Adapter** – normalizes keyboard/pointer into a queued flap `InputEvent`; never mutates game state.
- **Renderer** – `render(ctx, state, assets)`; draws everything and maintains 9:16 letterboxed sizing.
- **Audio Player** – `playFlap()` / `playGameOver()`; no-ops if the asset failed to load.
- **Storage Adapter** – `loadHighScore()` / `saveHighScore(n)`; tolerates parse/write failures.
- **Game Loop** – owns `requestAnimationFrame`, the fixed-timestep accumulator, transition detection, and adapter orchestration.

## Rules of the boundary

- Logic that decides *what happens* to game state belongs in `core/`. Logic that touches the browser belongs in `shell/`.
- The shell computes real elapsed time, drains queued input, and calls `step` in fixed increments; it fires side effects (audio, persistence) by comparing previous vs. new state.
- Adapter failures degrade gracefully where gameplay can continue; only start-blocking asset failures show the error screen.

## Tests

- Co-located with source, named `*.test.js`, matched by `src/**/*.test.js` (e.g. `src/scaffold.test.js`).

## Specs

- Feature specs live in `.kiro/specs/<feature>/` as `requirements.md`, `design.md`, and `tasks.md`. Consult the design doc for constants, data models, and the numbered correctness properties.
