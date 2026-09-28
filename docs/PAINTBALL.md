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
- `config.js`: `ROUNDS = { toWin: 4, roundTime: 75, preRound: 3.5, postRound: 4, firstPreRound, maxRounds }`, weapon
  `hopper` (balls), `reloadTime` (s), `ammoPerShot` (balls per pull, default 1), `grav` / `drag` (paintball flight),
  `SUB.bomb.count` (grenades per round; `SUB.bomb.inkCost` is 0 and unused). `WEAPON_ORDER` = the five markers
  (shooter, dualies, splatling, charger, blaster); roller / slosher stay defined but retired — use
  `validWeapon(id)` (→ a WEAPON_ORDER id) wherever a weapon is picked for a player or bot. `PLAYER.sprintSpeed`,
  `PLAYER.regenRate = 0`. `PROGRESSION.xpPerElim`, `xpPerRoundWin`. `specialCost` = damage dealt to fill the special.
- `Match` (src/game/match.js): `match.elim` (true for the regular 4v4 mode — historical id `mode: 'turf'`; false for
  attract and Boss Battle, which keep free respawns), `match.round` (1-based), `match.roundWins` ([team0, team1]),
  `match.roundTime` (seconds left in the live round; `match.time` mirrors it), `match.roundPhase` ('pre' | 'live' |
  'post'), `match.rounds` ([{ winner, reason }]), `match.aliveCount(team)`, `match.teamHp(team)`, `match.live()`
  (live round), `match.damageOpen()`, `match.inputFrozen()`, `match.fireLocked()`, `match.canRespawn()` (false in
  elimination). `match.state` keeps its old values: 'intro' → 'playing' (all rounds) → 'finish' → 'judge' → 'results'.
  `match.result = { mode: 'elim', winner, roundWins, rounds: [{ winner, reason }], coverage }` (coverage kept for the
  results screen's percent bars). `teamSummary()` players also carry `out` (eliminated this round).
- Online: the host is authoritative. `match.netRoundState()` → `{ r, p, w, t, lw, lr, n }` (host sends it on every
  `round:*` event and ~2 Hz); followers call `match.applyNetRound(d)`; until the first one arrives a follower runs the
  same round logic locally. `result` sent by `sendResult` should add `roundWins` / `rounds` (followers fall back to their
  own `match.roundWins`). Each client resets the actors it owns at `round:pre` (emitting `respawn` with `round`).
- `Actor`: `ammo`, `ammoMax`, `reloading` (seconds remaining, 0 when not), `reloadFrac()` (0..1 progress),
  `startReload()`, `hasAmmo(n)`, `useAmmo(n)`, `dryFire()`, `grenades`, `sprinting`, `alive`, `stats.damage`,
  `addSpecialPoints(dmg)`. `ink` is kept as a 0..100 getter/setter mirror of the hopper for old readers.
  Intent: `sprint` (hold; `squid` is read as the same thing), `reload` (press), `fire`, `sub`, `special`, `jump`, `move`.
  `anim.sprinting`, `anim.reloading`, `anim.reloadFrac` are passed to the character.
- Events (src/core/ctx.js bus, see docs/EVENTS.md): `round:pre` `{ round }`, `round:count` `{ round, n }`,
  `round:start` `{ round }`, `round:end` `{ round, winner (0|1|-1 draw), reason ('wipe'|'time'), roundWins }`,
  `eliminated` `{ victim, attacker, cause, round }` (emitted by Match right after the existing `splatted`),
  `reload:start` / `reload:end` `{ actor }`, `weapon:dry` `{ actor }` (trigger pulled on an empty hopper),
  `actor:sprint` `{ actor, on }`, `grenade:empty` `{ actor }`.
- HUD frame (main.js `_updateHud` → `hud.update`): adds `ammo`, `ammoMax`, `reloading`, `reloadFrac`, `grenades`,
  `grenadesMax`, `sprinting`, `round: { n, phase, wins: [yours, theirs], toWin, time, alive: [yours, theirs] } | null`.
