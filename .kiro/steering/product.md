# Product

Flappy Kiro is a browser-based, retro-style endless side-scroller inspired by Flappy Bird.

The player guides a ghost sprite through gaps in scrolling pipe pairs. The ghost continuously falls under gravity; flapping applies a fixed upward velocity. The player earns one point per pipe pair cleared, and the game ends when the ghost collides with a pipe or the ground.

## Key traits

- Runs entirely client-side in the browser. There is no backend.
- Single-canvas HTML5 arcade game using provided sprite and audio assets.
- High score persists across sessions in the same browser via `localStorage`.

## Game states

- **Ready** – ghost stationary, start instruction shown, no gravity.
- **Playing** – gravity, pipe scrolling, scoring, and collision are active.
- **Game_Over** – field freezes, final score and high score shown, flap restarts after a 500ms lockout.

(`Loading` and `Error` are shell-level presentation states around the core states above.)
