# Contributing to BREAKOUT

Thanks for your interest! BREAKOUT (a 4v4 paintball elimination shooter, formerly INKWAVE) is a plain ES-module three.js project with no build step, so getting started takes a minute.

## Running locally

```bash
git clone https://github.com/jaydendavisnc/inkwave.git
cd inkwave
npm install          # only needed for the headless tools (puppeteer-core)
npm start            # serves http://localhost:8490 (and your LAN address)
```

Open the URL in Chrome, Edge or Firefox. Everything reloads on refresh; there is no bundler.

## Before opening a pull request

```bash
npm run check        # node --check on every module
npm run smoke        # boots the game headlessly and plays 8 s on autopilot (needs Google Chrome installed)
```

Keep pull requests focused. If you change gameplay tuning (round length, hopper sizes, damage — all in `src/config.js`), say what you measured and how (see `tools/measure-handling.mjs` and `tools/film.py` for the deterministic capture helpers).

## Project map

| Path | What lives there |
|---|---|
| `src/core` | renderer + post chain, input, event bus |
| `src/game` | actors, markers (weapons), bots, camera rig, character rig + animation, match + round flow |
| `src/world` | field layouts, level geometry, paint, textures, environment, props |
| `src/fx` | particles, screen effects, event → effect wiring |
| `src/ui` | menus, HUD, map diorama, icons |
| `src/audio` | procedural sound effects and music |
| `docs` | paintball design contract (`PAINTBALL.md`), event contract, module contracts, character rig reference |
| `tools` | dev server, labs, headless capture and measurement scripts, release |

## Code style

Match the surrounding code: 2-space indent, single quotes, no semicolon-free style, comments that explain *why*. No per-frame allocations in hot paths. New fields must keep both halves identical (the layout is mirrored by a 180° rotation).

## Reporting bugs

Open an issue with your browser + GPU, the field, the mode, and steps to reproduce. A screenshot or short clip helps a lot.
