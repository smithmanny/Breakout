// Shared tuning + content definitions. Every module reads from here; nothing here imports anything.

export const GAME_TITLE = 'BREAKOUT';
export const GAME_SUBTITLE = '4v4 Paintball';
export const VERSION = '1.0.0';

// Team ink palettes. Team 0 ("Alpha") is always the local player's team; a palette is picked per match.
export const TEAM_PALETTES = [
  { id: 'tangerine-cobalt', a: '#ff8a14', b: '#2f5bff', names: ['Tangerine', 'Cobalt'] },
  { id: 'bubblegum-mint', a: '#ff3f9e', b: '#18d48c', names: ['Bubblegum', 'Mint'] },
  { id: 'lemon-grape', a: '#f2e312', b: '#8a3cff', names: ['Lemon', 'Grape'] },
  { id: 'aqua-cherry', a: '#10d2e6', b: '#ff4150', names: ['Aqua', 'Cherry'] },
  { id: 'lime-magenta', a: '#a6f01a', b: '#e02cd8', names: ['Lime', 'Magenta'] },
];
// Used instead when settings.colorblind is on (yellow vs blue is safe for all common CVD types).
export const COLORBLIND_PALETTE = { id: 'cb-yellow-blue', a: '#ffd21a', b: '#2a52ff', names: ['Sun', 'Sea'] };

export const TEAM_NAMES = ['Alpha', 'Bravo'];

// ---- Player physics / feel (meters, seconds) ----
export const PLAYER = {
  hp: 100,
  radius: 0.38,
  height: 1.45,          // kid form standing height (feet -> top of head)
  squidHeight: 0.55,
  runSpeed: 5.6,
  sprintSpeed: 8.2,      // Shift / LT held while moving (can't fire while sprinting) — replaces squid form
  sprintAccel: 60, sprintTurn: 9,
  squidDrySpeed: 2.9,    // squid hopping on unpainted ground
  swimSpeed: 11.8,       // squid submerged in own ink
  enemyInkSpeed: 1.9,
  climbSpeed: 7.5,
  accelGround: 42,
  accelAir: 14,
  accelSwim: 60,
  jumpVel: 8.4,
  swimJumpVel: 9.4,
  gravity: 25,
  maxFall: 40,
  inkMax: 100,
  inkRefillSwim: 42,     // per second while submerged
  inkRefillKid: 9,       // per second in kid form after idle delay
  inkRefillDelay: 0.9,
  enemyInkDps: 20,       // damage/s while standing in enemy ink ...
  enemyInkDamageCap: 40, // ... never takes you below (hp - cap) from ink alone
  regenDelay: 1.3,
  regenRate: 0,          // paintball: no health regen (hp only resets between rounds)
  regenRateSwim: 0,
  respawnTime: 5.5,
  spawnInvuln: 1.6,
  fallDeathY: -1.45,  // touching the sea (surface y = -1.6) splats you
  waterY: -1.6,

  // ---- handling (see actor.js _horizontal / _integrate). Measured with tools/measure-handling.mjs.
  // ground run: S-curve accel (ease-in over the first ~1.6 m/s, ease-out over the last 28 % of top speed)
  runAccel: 70, runAccelIn: 0.5, runInKnee: 1.6, runOutKnee: 0.28, runOutMin: 0.22,
  runDecel: 58, runDecelMin: 0.4, runDecelKnee: 2.2,   // brake: strong at speed, eases into the stop (no hard corner)
  reverseDecel: 78, reverseAngle: 2.2,                  // > ~126° input change = plant-and-reverse (vector brake-through)
  turnRate: 15, turnRateSlow: 1.5,                      // velocity heading slew (rad/s); faster when slow → carve, never dip
  airAccel: 20, airDecel: 4, airMinSpeed: 4.6,
  squidAccel: 34, squidDecel: 26, squidTurn: 13,        // squid hopping on dry ground (also the swim-exit glide)
  swimAccel: 64, swimAccelIn: 0.75, swimDecel: 42, swimTurn: 11, swimOutKnee: 0.22,   // 90 % speed in 0.18 s, 1.6 m glide to a stop
  squidAirAccel: 14, squidAirDecel: 3,
  enemyInkDecel: 30, enemyInkAccel: 30,                 // wading into enemy ink: a quick but readable bog-down
  // jumping
  jumpBuffer: 0.13,       // a jump pressed this long before touching down still fires on landing
  coyoteTime: 0.12,       // ... and this long after walking off an edge
  fallGravityMul: 1.2,    // snappier descent
  apexGravityMul: 0.82,   // a hair of hang at the top of the arc (|vy| < apexBand)
  apexBand: 1.6,
  hardLandSpeed: 11.5,    // landings faster than this (falls > ~2.3 m) cost a short recovery
  hardLandSlow: 0.72, hardLandTime: 0.16,
  // character controller
  footRadius: 0.24,       // flat footprint for the ground probe (ledge hold / lips)
  stepUp: 0.35,           // curbs/lips a kid walks straight onto (body capsule is lifted by this much)
  stepDown: 0.45,         // ground stick range while grounded (ramps, steps down)
  squidStepUp: 0.24, squidBodyLift: 0.16,
  ledgeAssist: 0.35,      // falling feet this far below a ledge top still land on it (pop-up, visually smoothed)
  // facing (angular spring with a rate cap: smooth ease-in/out turns, never a snap)
  faceOmega: 20, faceMaxRate: 12.5, faceMaxAcc: 170, squidFaceOmega: 26, squidFaceMaxRate: 17, swimFaceMaxRate: 14, squidFaceMaxAcc: 260,
  aimFaceOmega: 36, aimFaceMaxRate: 24, aimFaceMaxAcc: 380,
  // wall climb
  climbAccel: 46, climbSideSpeed: 5.2, climbAttachDot: 0.5, climbDetachDot: -0.45,
  ledgePopClear: 0.42,    // apex this far above the ledge top when popping over it
  ledgePopCarry: 2.5,     // forward speed onto the ledge
  emergeDelay: 0.09,      // sprint → ready: the marker comes up before the first shot can leave the barrel (the shot is buffered, not lost)
  fireBuffer: 0.16,
};

// ---- Weapons ----
// Paintball markers. The ids / kinds are the old INKWAVE ones (shooter, dualies, splatling, charger, blaster) so the
// weapon runners, rigs and net code keep working; names / classes / stats are BREAKOUT's.
// stats.* are 0..1 display bars for the loadout screen. hopper = balls per load, reloadTime = seconds to swap a pod,
// ammoPerShot = balls per trigger pull (default 1). specialCost = damage dealt to fill the special.
// Projectile flight: projSpeed (m/s), straightTime (s before gravity), grav (m/s²), drag (1/s). No flight trail.
export const WEAPONS = {
  shooter: {
    id: 'shooter', name: 'Rec Marker', kind: 'shooter', class: 'Marker', sub: 'bomb',
    blurb: 'Reliable all-rounder. Steady semi-auto stream, three clean hits to put someone out.',
    stats: { range: 0.6, damage: 0.5, rate: 0.7, mobility: 0.7, paint: 0.6 },
    fireInterval: 0.125, damage: 36, ammoPerShot: 1, hopper: 90, reloadTime: 1.6,
    projSpeed: 58, straightTime: 0.12, grav: 9, drag: 0.2, range: 19,
    spreadGround: 2.4, spreadAir: 6.5,   // degrees
    impactRadius: 0.42, trailRadius: 0, trailEvery: 0,
    moveSpeedFiring: 4.5,
    special: 'slam', specialCost: 300,
  },
  roller: {
    // retired (not in WEAPON_ORDER): kept so an old profile / roster entry never crashes before it is remapped
    id: 'roller', name: 'Swell Roller', kind: 'roller', class: 'Roller', sub: 'bomb',
    blurb: 'Retired.',
    stats: { range: 0.35, damage: 0.95, rate: 0.3, mobility: 0.55, paint: 0.95 },
    rollSpeed: 4.4, rollWidth: 1.9, rollInkPerMeter: 1.1, rollDamage: 140,
    flickInterval: 0.62, flickWindup: 0.22, flickInk: 9, flickDrops: 9,
    flickDamageNear: 125, flickDamageFar: 30, flickSpeed: 17, flickSpreadDeg: 34,
    impactRadius: 1.0, hopper: 60, reloadTime: 1.8, ammoPerShot: 3,
    moveSpeedFiring: 4.4,
    special: 'slam', specialCost: 300,
  },
  charger: {
    id: 'charger', name: 'Longshot Pump', kind: 'charger', class: 'Sniper', sub: 'bomb',
    blurb: 'Hold to pump up pressure, release for a laser-straight shot. A full charge is a one-hit elimination.',
    stats: { range: 1.0, damage: 1.0, rate: 0.25, mobility: 0.35, paint: 0.3 },
    chargeTime: 0.95, rangeMin: 14, rangeMax: 34, damageMin: 34, damageMax: 150, ammoPerShot: 1, hopper: 12, reloadTime: 2.0,
    inkFull: 18, lineSplatEvery: 0, lineRadius: 0.4, impactRadius: 0.5,
    moveSpeedFiring: 1.9,
    special: 'storm', specialCost: 260,
  },
  blaster: {
    id: 'blaster', name: 'Popper Launcher', kind: 'blaster', class: 'Launcher', sub: 'bomb',
    blurb: 'Lobs fat paint rounds that burst on impact. Direct hits hurt; the splash catches anyone behind cover.',
    stats: { range: 0.55, damage: 0.85, rate: 0.3, mobility: 0.6, paint: 0.7 },
    fireInterval: 0.82, directDamage: 70, splashDamageMax: 55, splashDamageMin: 20,
    splashRadius: 2.4, ammoPerShot: 1, hopper: 16, reloadTime: 2.1,
    projSpeed: 22, grav: 16, range: 17, life: 2.2,
    impactRadius: 1.1, burstRadius: 1.8,
    moveSpeedFiring: 4.0,
    special: 'storm', specialCost: 280,
  },
  dualies: {
    id: 'dualies', name: 'Twin Pistols', kind: 'dualies', class: 'Pistols', sub: 'bomb',
    blurb: 'A pistol in each hand, alternating fire. Jump while firing to dive-roll, then plant and unload.',
    stats: { range: 0.42, damage: 0.4, rate: 0.95, mobility: 0.95, paint: 0.5 },
    fireInterval: 0.09, damage: 26, ammoPerShot: 1, hopper: 80, reloadTime: 1.3,   // hands alternate: 11 shots/s, 4 hits to eliminate
    projSpeed: 52, straightTime: 0.1, grav: 10, drag: 0.25, range: 14,
    spreadGround: 3.6, spreadAir: 8, spreadFirst: 0.5, bloomPerShot: 0.25, spreadLock: 1.6,
    impactRadius: 0.38, trailRadius: 0, trailEvery: 0,
    moveSpeedFiring: 5.0,
    rollInk: 0, rollTime: 0.3, rollDist: 2.8, rolls: 2, lockTime: 0.5, lockInterval: 0.075,   // dive roll → locked turret
    special: 'slam', specialCost: 280,
  },
  slosher: {
    // retired (not in WEAPON_ORDER): kept so an old profile / roster entry never crashes before it is remapped
    id: 'slosher', name: 'Tidebucket Slosher', kind: 'slosher', class: 'Slosher', sub: 'bomb',
    blurb: 'Retired.',
    stats: { range: 0.58, damage: 0.8, rate: 0.4, mobility: 0.6, paint: 0.78 },
    fireInterval: 0.62, windup: 0.13, inkPerShot: 7.5, ammoPerShot: 2, hopper: 40, reloadTime: 1.8,
    projSpeed: 15, grav: 22, range: 9.5, drops: 8,
    damageHead: 70, damageTail: 34, splashRadius: 1.1, splashDamage: 26,
    impactRadius: 1.05, trailRadius: 0.5, trailEvery: 0,
    moveSpeedFiring: 4.2,
    special: 'slam', specialCost: 300,
  },
  splatling: {
    id: 'splatling', name: 'Hailstorm Ramp', kind: 'splatling', class: 'Auto Marker', sub: 'bomb',
    blurb: 'Hold to spin up the ramping trigger, then it hoses paint for as long as you hold on. Big hopper, slow reload.',
    stats: { range: 0.78, damage: 0.45, rate: 1.0, mobility: 0.4, paint: 0.7 },
    chargeTime: 0.45, fireInterval: 0.07, damage: 22, ammoPerShot: 1, hopper: 120, reloadTime: 2.2,
    projSpeed: 62, straightTime: 0.14, grav: 9, drag: 0.2, range: 21,
    spreadGround: 2.8, spreadAir: 7, spreadFirst: 0.6, bloomPerShot: 0.05,
    impactRadius: 0.4, trailRadius: 0, trailEvery: 0,
    moveSpeedCharging: 3.0, moveSpeedFiring: 3.3,
    special: 'storm', specialCost: 320,
  },
};
// The playable markers, in loadout order. roller / slosher are retired: use validWeapon() for anything that picks a
// weapon for a player or bot (an old saved profile, a stale lobby roster).
export const WEAPON_ORDER = ['shooter', 'dualies', 'splatling', 'charger', 'blaster'];
export const validWeapon = (id) => (WEAPON_ORDER.includes(id) ? id : WEAPON_ORDER[0]);

export const SUB = {
  bomb: {
    // Paint grenade: a fixed count per round (not ammo). inkCost is 0 and kept only for old readers.
    id: 'bomb', name: 'Paint Grenade', count: 2, inkCost: 0, throwSpeed: 13.5, fuse: 0.95,
    radius: 3.1, damageMax: 150, damageMin: 30, paintRadius: 2.4,
  },
};

// Specials charge from damage dealt (weapon.specialCost damage points).
export const SPECIALS = {
  slam: { id: 'slam', name: 'Breach Slam', blurb: 'Leap up and slam down in a huge paint shockwave.', rise: 0.55, hang: 0.25, radius: 5.2, killRadius: 3.2, damageMax: 180, damageMin: 55 },
  storm: { id: 'storm', name: 'Paint Barrage', blurb: 'Hurl a marker beacon that calls down a rain of paint on the area.', duration: 6.5, radius: 3.4, dps: 34, throwSpeed: 16, driftSpeed: 1.1 },
};

// ---- Rounds (elimination) ----
// First team to toWin round wins takes the match. One life per round. preRound = frozen at the bases with a countdown,
// roundTime = live round length (s), postRound = result banner before the next round. maxRounds is a safety cap
// (draws give nobody a point): at the cap the team with more round wins takes it (then the paint coverage).
export const ROUNDS = { toWin: 4, roundTime: 75, preRound: 3.5, postRound: 4, firstPreRound: 1.6, maxRounds: 11 };

// ---- Match ----
export const MATCH = {
  durations: [90, 180],     // seconds
  defaultDuration: 180,
  finalCountdown: 10,
  teamSize: 4,
  pointsPerM2: 1.0,          // (cosmetic) paint points per square metre newly inked — no longer decides anything
};

export const DIFFICULTY = {
  // aimOmega / aimTurn: bot aim spring stiffness (rad/s) and turn-rate cap (rad/s) — see bots.js
  easy:   { id: 'easy',   name: 'Chill',  reaction: 0.55, aimError: 0.11, fireDiscipline: 0.55, awareness: 16, aimOmega: 9,  aimTurn: 7 },
  normal: { id: 'normal', name: 'Fresh',  reaction: 0.32, aimError: 0.06, fireDiscipline: 0.8,  awareness: 21, aimOmega: 13, aimTurn: 10 },
  hard:   { id: 'hard',   name: 'Fierce', reaction: 0.17, aimError: 0.03, fireDiscipline: 0.95, awareness: 26, aimOmega: 18, aimTurn: 14 },
};

// Every stage can be played by day or at dusk: `times` maps the time of day to an environment theme (`theme` is the
// stage's day look, kept for older callers). Pick with mapTheme(map, time).
export const TIMES = ['day', 'dusk'];
export const mapTheme = (map, time = 'day') => (map && map.times && map.times[time]) || (map && map.theme) || 'day';
export const MAPS = [
  // (src/world/stages/speedball) — the BREAKOUT default: a tournament speedball field of inflatable bunkers
  { id: 'speedball', name: 'Breakpoint Field', blurb: 'A tournament speedball field on the waterfront: inflatable snakes, doritos and cans inside the net. Break fast.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'tidewater', name: 'Tidewater Plaza', blurb: 'A sun-bleached harbor plaza on the edge of the sea.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'kelpline', name: 'Kelpline Terminal', blurb: 'Container yard with grate catwalks, a sunken trench and a steel gantry deck.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'halyard', name: 'Halyard Marina', blurb: 'Floating docks, a tug on blocks and a car ferry moored across the middle. Mind the water.', theme: 'golden', times: { day: 'golden', dusk: 'sunset' } },
  // (src/world/stages/cargo, ported from PR #8's rebuilt Kelpline) — online only, humans only, never a Boss Battle
  { id: 'cargo', name: 'Cargo Terminal', blurb: 'A container terminal at shift change: a gantry crane straddles the pier between two moored box ships.', theme: 'day', times: { day: 'day', dusk: 'sunset' }, onlineOnly: true, noBots: true, noBoss: true },
];
// Stage rules (a MAPS entry's flags), enforced by the lobby host (net/session.js, net/mock.js), the menus and main.js:
//   onlineOnly  only in the online lobby's stage picker — never the offline Play flow (Turf War or Boss Battle)
//   noBots      humans only: "fill with bots" is forced off, a match needs 2+ players with one on each side, and a player
//               who leaves mid-match is removed instead of handed to a bot; the menu backdrop runs without bots too
//   noBoss      never a Boss Battle stage (a boss room switches away from it)
export const mapById = (id) => MAPS.find((m) => m.id === id) || null;
export const mapNoBots = (id) => !!mapById(id)?.noBots;
export const mapBossOk = (id) => !!mapById(id) && !mapById(id).noBoss;
export const mapOfflineOk = (id) => !!mapById(id) && !mapById(id).onlineOnly;
export const OFFLINE_MAPS = MAPS.filter((m) => !m.onlineOnly);
// a boss-eligible stage to fall back to (the preferred one if it qualifies)
export const bossFallbackMap = (prefer) => (mapBossOk(prefer) ? prefer : (MAPS.find((m) => !m.noBoss && !m.onlineOnly) || MAPS[0]).id);
// Why a humans-only room can't start yet (null when it can, or when the stage allows bots): lobby = { map, players }
export function noBotsStartBlock(lobby) {
  if (!lobby || !mapNoBots(lobby.map)) return null;
  const ps = lobby.players || [];
  if (ps.length < 2) return 'Needs 2+ players — no bots on this stage';
  if (!ps.some((p) => p.team === 0) || !ps.some((p) => p.team === 1)) return 'Needs a player on each team';
  return null;
}

export const BOT_NAMES = [
  'Hopper', 'Splatcat', 'Rook', 'Viper', 'Tango', 'Blitz', 'Mags', 'Sarge', 'Nova', 'Deadeye',
  'Pip', 'Ratchet', 'Juno', 'Bandit', 'Echo', 'Moxie', 'Dash', 'Knox', 'Wasabi', 'Rally',
]

// ---- Progression ----
export const PROGRESSION = {
  xpForLevel: (lvl) => 800 + lvl * 350,
  xpWin: 1200, xpLose: 500, xpPerElim: 60, xpPerRoundWin: 150,
  xpPerSplat: 60, xpPerTurfPoint: 0,   // (old names: xpPerSplat = xpPerElim; turf gives no xp)
};

// ---- Settings defaults (persisted in localStorage 'inkwave.settings') ----
export const DEFAULT_SETTINGS = {
  sensitivity: 1.0,         // mouse multiplier 0.2..3
  padSensitivity: 1.0,
  invertY: false,
  fov: 82,                  // horizontal FOV at 16:9, 65..100
  quality: 'high',          // 'low' | 'medium' | 'high' | 'ultra'
  shadows: true,
  bloom: true,
  cameraShake: 1.0,         // 0..1
  showFps: false,
  master: 0.8, music: 0.6, sfx: 0.85,
  colorblind: false,
  minimap: true,
  matchLength: 180,
  difficulty: 'normal',
  rumble: 1.0,              // gamepad vibration 0..1 (only while the pad is the last-used device)
  aimAssist: 1.0,           // gamepad aim assist 0..1
  aimAssistMouse: false,    // optional aim assist for mouse
};

// Quality presets consumed by the renderer + fx.
export const QUALITY = {
  // pixelRatio = cap on devicePixelRatio (Retina screens render at up to this density)
  low:    { pixelRatio: 0.75, shadowSize: 1024, msaa: 0, bloom: false, ao: false, paintAtlas: 2048, particles: 0.4 },
  medium: { pixelRatio: 1.0,  shadowSize: 2048, msaa: 2, bloom: true,  ao: false, paintAtlas: 2048, particles: 0.7 },
  high:   { pixelRatio: 1.5,  shadowSize: 4096, msaa: 4, bloom: true,  ao: true,  paintAtlas: 4096, particles: 1.0 },
  ultra:  { pixelRatio: 2.0,  shadowSize: 4096, msaa: 4, bloom: true,  ao: true,  paintAtlas: 4096, particles: 1.0 },
};
