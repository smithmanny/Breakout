# Game event bus

`import { on, emit, G } from '../core/ctx.js'` — `on(name, fn)` returns an unsubscribe function. Effects, HUD and
screen-FX modules should subscribe to these instead of editing gameplay code.

## Emitted today
| event | payload | where |
|---|---|---|
| `hit` | `{ attacker, victim, damage, killed, weaponId }` | weapons.js applyHit / storm |
| `damage` | `{ victim, attacker, amount, source }` | actor.damage |
| `splatted` | `{ victim, attacker, cause }` (cause: weapon id, 'water', …) | actor.splat |
| `respawn` | `{ actor, round? }` | actor.respawn; also match.js when it resets an actor to base for a new round (`round` set) |
| `special:ready` | `{ actor }` | actor.addSpecialPoints (the special fills from damage dealt) |
| `special:use` | `{ actor, id }` ('slam' / 'storm') | actor._startSpecial |
| `superjump` | `{ actor, phase: 'charge' \| 'flight', to? }` | actor.superJump |
| `shake` | `{ amount, pos? }` | camera trauma requests |
| `recoil` | `{ amount }` | local-player visual recoil |
| `lowink` | `{ actor }` | weapons — old name, still fired (local player only) on a dry trigger, next to `weapon:dry` |
| `match:state` | `{ state, match }` ('intro','playing','finish','judge','results') | match.js |
| `match:oneminute` / `match:count` | `{}` / `{ n }` | match.js (elimination: `match:count` = the last 10 s of each live round; no `match:oneminute`) |

## BREAKOUT (paintball elimination — docs/PAINTBALL.md)
| event | payload | where |
|---|---|---|
| `round:pre` | `{ round, match }` — everyone at base, frozen; countdown follows | match.js |
| `round:count` | `{ round, n }` — pre-round countdown 3, 2, 1 | match.js |
| `round:start` | `{ round, match }` — live (GO) | match.js |
| `round:end` | `{ round, winner (0 \| 1 \| -1 draw), reason ('wipe' \| 'time'), roundWins: [t0, t1], match }` | match.js |
| `eliminated` | `{ victim, attacker, cause, round }` — emitted right after every `splatted` during an elimination match (local and remote victims) | match.js |
| `reload:start` / `reload:end` | `{ actor }` | actor.startReload / reload finished |
| `weapon:dry` | `{ actor }` — trigger pulled on an empty hopper (an auto reload starts right after) | actor.dryFire |
| `grenade:empty` | `{ actor }` — local player cocked a grenade with none left this round | weapons.js |
| `actor:sprint` | `{ actor, on }` — sprint started / stopped | actor.js |
Round flow: `match:state playing` → `round:pre` → `round:count`×3 → `round:start` → … `eliminated` … → `round:end` → (post
banner, `ROUNDS.postRound` s) → next `round:pre`, or `match:state finish` → `judge` → `results`.
| `actor:<name>` | `{ actor, surface, ...data }` — re-emitted from `character.onEvent(name, data)`; surface 0 dry · 1 own ink · 2 enemy ink | actor.js wiring |

## To add
| event | payload |
|---|---|
| `actor:jump` | `{ actor, surface, swim }` |
| `actor:land` | `{ actor, speed, surface, pos }` |
| `actor:form` | `{ actor, form: 'kid' \| 'squid', surface }` (BREAKOUT: only the Boss Battle super jump still changes form) |
| `actor:dive` / `actor:emerge` | `{ actor, pos, speed }` (retired: no swimming in BREAKOUT) |
| `actor:climb` | `{ actor, on }` (retired: no wall climb) |
| `actor:enemyInk` | `{ actor, on }` (retired: enemy paint is cosmetic) |
| `weapon:fire` | `{ actor, weapon, muzzle, dir, charge? }` |
| `weapon:impact` | `{ pos, normal, team, kind, radius }` (kind: 'shot','blast','drop','charger','roll') |
| `bomb:throw` / `bomb:arm` / `bomb:explode` | `{ actor?, pos, team, radius? }` |
| `special:slam` | `{ actor, pos, radius }` |
| `storm:start` / `storm:end` | `{ pos, team }` |
| `superjump:land` | `{ actor, pos }` |
| `turf` | `{ actor, area }` (every claimed chunk; aggregate yourself — cosmetic in BREAKOUT, decides nothing) |

## Character → actor` inside character.js)
| name | data |
|---|---|
| `footstep` | `{ foot: 'L' \| 'R', pos: THREE.Vector3 (world, copy it) , speed }` at each foot plant |
| `handplant` (optional) | `{ pos }` roller/charger heavy moments |

## Audio (lead-owned, src/audio/audio.js)
- The lead plays footstep sounds on `actor:footstep` (surface-aware: `step_dry`, `step_ink`, `step_enemy`) and runs the
  harbour ambience (`harbor_ambience` loop + random `gull` cries). Don't duplicate these.
- Extra SFX names available to everyone via `G.audio.play(name, { pos, volume, pitch })`: `step_dry`, `step_ink`,
  `step_enemy`, `ink_drip`, `gull`, `harbor_ambience` (loop) — plus the full list in docs/CONTRACTS.md §2.
- Need a new sound? Add a def in src/audio/audio.js and list it in SFX_GROUPS.
