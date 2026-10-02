<p align="center">
  <img src="assets/stages/halyard-day.webp" alt="Halyard Marina at golden hour" width="100%">
</p>

<h1 align="center">BREAKOUT</h1>

<p align="center">
  An original 4v4 paintball elimination shooter that runs in your browser.<br>
  Mask up, break for the bunkers, and be the last team standing.
</p>

<p align="center">
  <a href="https://inkwave-aah.pages.dev"><b>▶ Play now</b></a> ·
  <a href="#controls">Controls</a> ·
  <a href="#playing-online">Online</a> ·
  <a href="#running-locally">Run locally</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/jaydendavisnc/inkwave/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/jaydendavisnc/inkwave/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="three.js r186" src="https://img.shields.io/badge/three.js-r186-000000?logo=three.js&logoColor=white">
  <img alt="No build step" src="https://img.shields.io/badge/build-none%20needed-2ea44f">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

---

## Features

- **Elimination, 4 v 4.** One life per round and no health regen: take enough hits and you're OUT until the next
  whistle. Wipe out the other team to take the round; if the 75-second clock runs out, the team with more players
  standing wins it (then the team with more HP left). First team to 4 rounds takes the match. Play against bots on
  three difficulty levels.
- **Five markers**, each with its own feel: the Rec Marker (all-rounder), Twin Pistols (dive roll while firing),
  Hailstorm Ramp (spin-up auto marker with a big hopper), Longshot Pump (charge sniper, one-hit eliminations) and the
  Popper Launcher (splash rounds that reach behind cover). Every marker has a limited hopper you reload by hand, two
  Paint Grenades a round and a special (Breach Slam or Paint Barrage) that charges as you deal damage.
- **Breakpoint Field.** A tournament speedball field on the waterfront: inflatable snakes, doritos and cans inside the
  net. The harbour stages (Tidewater Plaza, Kelpline Terminal, Halyard Marina, and the online-only Cargo Terminal) are
  all still in the rotation, day or dusk.
- **Online with friends.** Create a private room, share the five-character code, and up to eight players line up in
  the lobby with their loadouts and looks. Empty slots fill with bots; if someone drops, a bot takes over their player
  mid-match.
- **Paint that behaves like paint.** Paintballs fly with a little drop and burst into splats; the field gets messier
  with every round because the paint stays. Hits leave marks on players, too.
- **Locker.** Pick a player and make them yours: paintball masks and headgear, hair, face, and team jerseys or camo.
- **Shop (cosmetics only).** Marker finishes and costumes, bought with a card or stablecoin crypto through Stripe. Nothing
  affects gameplay. See [`docs/MONETIZATION.md`](docs/MONETIZATION.md).
- **Boss Battle (bonus mode, beta).** Everyone on one squad against HULLBREAKER, a giant hermit crab living in a
  rusted shipping container.
- **A map you can actually read.** Hold <kbd>Tab</kbd> and the camera cranes up into a tilt-shift diorama of the live
  field with pins for your team.
- **Everything procedural.** Characters, animation, markers, textures, props, sound effects and music are all
  generated in code. There are no downloaded assets except two fonts.

<p align="center">
  <img src="assets/stages/tidewater-day.webp" width="49%" alt="Tidewater Plaza">
  <img src="assets/stages/kelpline-dusk.webp" width="49%" alt="Kelpline Terminal at dusk">
</p>

## Controls

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Left stick |
| Aim | Mouse | Right stick |
| Fire | Left click | RT |
| Sprint (hold; no firing) | <kbd>Shift</kbd> | LT |
| Reload | <kbd>R</kbd> | X |
| Jump (Twin Pistols: dive roll while firing) | <kbd>Space</kbd> | A |
| Paint grenade (hold to aim, release to throw) | Right click / <kbd>E</kbd> | RB |
| Special | <kbd>F</kbd> / <kbd>Q</kbd> | Y |
| Map | Hold <kbd>Tab</kbd> or <kbd>M</kbd> | View |
| Pause | <kbd>Esc</kbd> | Start |

The hopper also reloads by itself if you pull the trigger on empty. Gamepads work on the hosted (https) version. On a
plain `http://` LAN address browsers block the Gamepad API.

## Playing online

From the main menu choose **Online**, then **Create a room** and send your friends the code (or **Join a room** and
type theirs). The host picks the mode, field, time of day, team colours and whether bots fill empty slots; everyone
else picks a team, marker and look and readies up. The lineup, emotes and ready state are live for everyone in the
room.

Rooms run on a tiny relay (a Cloudflare Worker with one Durable Object per room, in [`server/`](server)). It only
forwards messages: every player simulates their own character and streams it, and everyone else draws it through the
same animation system on a smoothed timeline about a tenth of a second behind. The host is authoritative for the
round flow (round start, eliminations tally, round and match results). How that works, and the tools used to measure
it, are in [`docs/NET.md`](docs/NET.md).

To play online on your own network, run the relay next to the game:

```bash
npm install      # once: the relay runs on wrangler
npm run relay    # ws://<this machine>:8787
```

A page opened from `localhost` or a LAN address uses that relay automatically; `?relay=wss://…` points it anywhere else.

## Running locally

There is no build step. Any static file server works; the included one also serves to your LAN and sends no-cache headers so module updates are never stale.

```bash
git clone https://github.com/jaydendavisnc/inkwave.git
cd inkwave
npm start        # http://localhost:8490
```

Useful URL parameters: `?map=speedball&time=dusk` picks a field, `&autostart` skips the menus straight into a match
(`&mode=boss` for a Boss Battle), `&autopilot` lets a bot drive you, `?skipTitle` opens on the main menu.

```bash
npm install      # once, for the headless tools
npm run check    # syntax-check every module
npm run smoke    # boot + 8 s of autopilot in headless Chrome, fails on console errors
npm run build    # assemble dist/ (game + only the three.js addons it imports)
```

With the relay running, `npm run net-test` plays a real match between headless clients and reports what each
screen drew (see [`docs/NET.md`](docs/NET.md#how-the-netcode-works-srcnetnetmatchjs)).

## How it works

- **Rules are a small state machine.** The match runs rounds (`pre` → `live` → `post`) with one life each; see
  [`src/game/match.js`](src/game/match.js) and the design contract in [`docs/PAINTBALL.md`](docs/PAINTBALL.md). All the
  tuning (round length, rounds to win, hopper sizes, reload times, damage) lives in [`src/config.js`](src/config.js).
- **Paint is painted in texture space.** Every paintable face owns a region of one 4K atlas; splats are drawn into it on
  the GPU, and the level shader layers the paint over the surface with its own height, gloss and wetness. In BREAKOUT
  ground paint is cosmetic: it decides nothing, it just piles up. See [`src/world/paint.js`](src/world/paint.js) and
  [`src/world/inkShading.js`](src/world/inkShading.js).
- **Fields are data.** A layout is a list of boxes, ramps and bunkers for one half of the arena; the other half is the
  180° rotation, so both teams always get an identical field. Breakpoint Field lives in
  [`src/world/stages/speedball`](src/world/stages/speedball). Ambient occlusion is baked offline
  (`tools/bake-ao.mjs`). See [`src/world/maps.js`](src/world/maps.js).
- **Characters are fully procedural.** Geometry, materials, a 60-bone rig and every animation (locomotion, sprinting,
  reloads, marker poses, secondary motion) are code, driven by a spring-based pose system. See
  [`docs/RIG.md`](docs/RIG.md).
- **Systems talk through events.** Markers, actors and the match emit typed events (`round:start`, `eliminated`,
  `reload:start`, …); effects, HUD and audio subscribe. The contract is documented in
  [`docs/EVENTS.md`](docs/EVENTS.md) and [`docs/CONTRACTS.md`](docs/CONTRACTS.md).
- **Deterministic tooling.** The game exposes a freeze/step debug interface so filmstrips, handling measurements and bot simulations are reproducible frame by frame (`tools/film.py`, `tools/measure-handling.mjs`).

Rendering is three.js r186 (vendored, plain ES modules with an import map) with GTAO, bloom and a custom grade pass.

## Browser support

Chrome and Edge are the target; Firefox works. Safari runs but is slower. A discrete or recent integrated GPU is recommended for the High preset; the settings menu has Medium and Low tiers.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and the checks to run first.

## License

[MIT](LICENSE) © 2026 Jayden Davis. BREAKOUT is an independent project. It started life as INKWAVE, a turf-war shooter,
and keeps that name in its repository, save keys and debug hooks.
