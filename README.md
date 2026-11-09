# Type Dash

**Type fast. Jump faster.** Type Dash is an endless, neon typing arcade game in the Snake Typer repository. Type the highlighted word before its timing bar empties. The cube automatically jumps when it reaches the obstacle.

## Run locally

Use Node.js 22.18 or newer. Run these commands from the project directory.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. A physical keyboard is recommended.

| Control | Action |
| --- | --- |
| A–Z | Type the highlighted word. Mistakes count against accuracy and leave your typing progress in place. |
| Escape | Pause or resume. Switching tabs also pauses a run. |
| Enter | Start from the main menu or retry from the results screen. |

**How to Play** includes a three-obstacle practice run that waits at the typing deadline. Statistics and the top 10 completed runs are saved in the current browser. Audio and motion can be adjusted in Settings.

## Build and test

```sh
npm run build
npm test
npm run preview
```

The production build is written to `dist/`. Serve that directory with a static HTTP server.

## Architecture

- `src/game/run.ts` advances the simulation at 120 Hz and owns the obstacle queue, difficulty, word progress, and score.
- `src/game/physics.ts` predicts takeoff windows and shares swept collision checks with the live simulation. The generator reserves landing space and estimates typing time from the stage's target WPM.
- `src/game/renderer.ts` draws a 1280 × 720 logical Canvas scene at the display's pixel density. Rendering interpolates between simulation ticks.
- `src/main.ts` manages the screen states and keyboard controls. `src/ui.ts` renders the HTML menus and HUD, `src/audio.ts` synthesizes music and effects, and `src/storage.ts` validates and persists the versioned save.

Automated tests cover typing, timing, collision, obstacle spacing, frame-rate independence, scoring, and save validation.
