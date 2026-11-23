[![](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![](https://make.fun/badge/rank/FYoranda/make-gta-6.svg)](https://make.fun/bounty/gta6-01)
[![](https://make.fun/badge/reward/FYoranda/make-gta-6.svg)](https://make.fun/bounty/gta6-01)

# Solmar Bay — an open-world crime game

A complete open-world crime game that plays offline in a desktop browser
from its own static files. Explore the sun-soaked coastal city of Solmar Bay
on foot and by car, steal cars, dodge the police, and run jobs for cash.

## What is in the game

- A living city: downtown towers, the beach boardwalk, the docks, traffic
  and pedestrians, all with procedural textures and a sunset neon look.
- On foot and driving: third-person walking and running, arcade car physics,
  6 vehicle types, cars to steal and drive.
- Wanted system: 1–5 stars, police cars and foot cops that chase, ram and
  bust you.
- Story missions: 5 playable jobs with cash rewards, a checkpoint street
  race, and a final armored-van score.
- Combat: pistol, SMG and shotgun, with a gun shop and a safehouse for
  repairs, ammo and saving.
- HUD with a live minimap, health, cash, wanted stars, speed and objectives.
- Procedural WebAudio sound: engine, sirens, gunfire and a synthwave loop —
  no audio files, no network requests, 100% offline.

## How to play

Serve `game/` with any static file server and open `index.html` in desktop
Chrome. Click **New Game** to start.

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look (click the game to lock the mouse) |
| Shift | Run / boost |
| Space | Jump / handbrake |
| F | Enter or exit a car |
| E | Interact (pick up, buy, repair, save) |
| R | Reload |
| 1 / 2 / 3 | Pistol / SMG / shotgun |
| Esc | Pause |

## Tech

- Three.js (vendored under `game/vendor/`) with procedural canvas textures.
- No build step: `game/index.html` plus plain ES modules under `game/src/`.
- Entry program: `main.ts` copies `game/` and `screenshots/` to the output
  directory and writes `dossier.json` with `vendor/makefun-game.ts`.
