# E1 result: grid movement in Three.js

**Works.** Step, strafe, 90 degree turns, bump into walls, one buffered
input. Grey boxes with a checker texture and a warm torch light on the
camera.

## Numbers

- Three.js 0.187.0, Vite 8.3.8, Vitest 5.1.0.
- Agent time: about 20 minutes, including tests and screenshots.
- Code: `src/grid.js` (logic, ~90 lines), `src/main.js` (render, ~170 lines).
- 6 logic tests pass (`npm test`). One test was wrong at first (my
  expectation, not the code).
- The fps in screenshots is from a software renderer (SwiftShader), so it
  says nothing about real speed. Real speed is checked in E7.

## Screenshots

`shots/` from `npm run shots`. It builds, serves `dist/` locally, and
drives Playwright's `chrome-headless-shell` (a plain binary, no window,
no app bundle). It walks a fixed route and saves PNGs, including one
mid-turn and one mid-bump. It fails if the page logs errors.

## Agent friendliness

Very good. The agent can:
- unit test logic in Node with no browser,
- take screenshots headless on this Mac without touching the desktop,
- look at the PNGs and fix things.

## Notes for later

- Torch is too bright up close (orange walls next to the camera). That is
  E3's job.
- Door frame is placed by checking which neighbours are walkable. Fine for
  now, a real tile kit (E2) will replace it.

## Try it yourself

```
cd prototypes/e1-grid-threejs
npm run dev
```

Open the printed URL. Keys: W/S or Up/Down move, A/D strafe, Q/E or
Left/Right turn.
