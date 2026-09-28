# BREAKOUT: 4v4 paintball conversion (design contract)

The game (formerly INKWAVE, a Splatoon-style turf war) is being converted into **BREAKOUT**, a 4v4 paintball
elimination shooter. This file is the shared contract between everyone working on the conversion.

## Feel
- Grounded, tactical, snappy. Paint is still everywhere (the paint system stays and is the whole look), but ground
  paint is **cosmetic**: no turf points, no swimming, no enemy-paint slowdown/damage, no refill from paint.
- Paintballs: small, fast, visible balls with a slight gravity drop. They splat on impact (small splat decal), no
  continuous paint trail along the flight path. Hits on players leave paint marks on the body.
- Referee flavour: whistles at round start/end, "OUT!" when a player is eliminated.

## Rules: Elimination
- 4 v 4. A match is rounds; **first team to 4 round wins** takes the match (config `ROUNDS`).
- Each player has **one life per round**. Eliminated players spectate teammates until the round ends.
- A round ends when a team is wiped out, or when the round timer (75 s) runs out: then the team with more players alive
  wins; if equal, the team with more total HP left wins; if still equal it is a draw (no point to anyone).
- Between rounds everyone resets to their spawn bases, full HP, full hopper, full grenades. Paint on the field persists
  across rounds (the field gets messier as the match goes on).
- HP 100, **no health regen**. Most markers take 2 to 3 hits; the sniper is one hit.

## Controls
- Shift / LT: **sprint** (faster run, cannot fire while sprinting). Replaces squid form.
- R / X (gamepad): **reload** (swap a pod into the hopper). Auto-reload when empty and fire is pressed.
- Right click / E / RB: throw a **paint grenade** (limited count per round, not ammo-based).
- F / Y: special (charged by dealing damage instead of painting turf).
- Space: jump (Pistols: dive roll while firing).

## Interfaces (the core-gameplay owner implements these; everyone else reads them)
- `config.js`: `ROUNDS = { toWin, roundTime, preRound, postRound }`, weapon `hopper` (balls), `reloadTime`, `SUB.bomb.count`.
- `Match` (src/game/match.js): `match.round` (1-based), `match.roundWins` ([team0, team1]), `match.roundTime`
  (seconds left in the live round), `match.roundPhase` ('pre' | 'live' | 'post'), `match.aliveCount(team)`.
  `match.result = { winner, roundWins, rounds: [{ winner, reason }] }`.
- `Actor`: `ammo`, `ammoMax`, `reloading` (seconds remaining, 0 when not), `reloadFrac()` (0..1 progress),
  `grenades`, `sprinting`, `alive`.
- Events (src/core/ctx.js bus, see docs/EVENTS.md): `round:pre` `{ round }`, `round:start` `{ round }`,
  `round:end` `{ round, winner (0|1|-1 draw), reason ('wipe'|'time') , roundWins }`, `eliminated`
  `{ victim, attacker, cause }` (emitted together with the existing `splatted`), `reload:start` / `reload:end`
  `{ actor }`, `weapon:dry` `{ actor }` (trigger pulled on an empty hopper).
