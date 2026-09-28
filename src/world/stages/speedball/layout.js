// Breakpoint Field — stage layout (src/world/stages/speedball/). The stage owns every file in this folder:
//   layout.js    level geometry (this file)        props.js    prop pack + placements (netting, bleachers, pits …)
//   surfaces.js  stage surface materials (texlib)  murals.js   the painted field lines (mural atlas)
import { PATTERN, B, O } from '../../mapkit.js';
import { SURF } from './surfaces.js';

// Breakpoint Field — a tournament speedball field on the waterfront park: 27 × 48 m of artificial turf inside tall
// black safety netting, dressed with inflatable bunkers. Each team starts at its start station at the back of its end
// (Alpha −Z, Bravo +Z); the field is a 180° turn of itself, so each team has its snake on its own left (+X for Alpha)
// and the dorito side on its right, and meets the other team's dorito side across the 50.
//   • snake side (+X, Alpha): a long low snake (3 pinched segments, 1.0 m — hop on, or play it low) from the corner
//     can to near the 50, a tall brick behind it and the "50 can" at the end
//   • centre lane: the home brick in front of the start station, a mini-A, a wide low cake (climbable), the centre X
//     (a 1.5 m tube crossed by two 1.25 m arms you can hop onto) with a low cake either side of it
//   • dorito side (−X, Alpha): two doritos along the wire, the stepped temple (1.0 m deck + a 1.2 m wall on it: climb
//     it and shoot over the doritos), the dorito 50, a mini-A and a tall can at the back
// Heights: 0 turf · 1.0 snake / cakes / temple deck (jump 1.4 m) · 1.2 doritos / mini-As · 1.25 / 1.5 X · 1.75–2.2 tall
// cover (home brick, cans, the brick, the temple wall).
// Every bunker is a level block (so it collides, stops shots and takes paint) with the nylon surface and a soft body
// (level.js `round`: bevels up to 88 % of the half size), so the boxes read as inflatables.

// field (turf inside the lines), the net line and the park around it
export const FIELD = { hx: 12.5, hz: 22.5 };      // painted boundary lines
export const NET = { x: 13.6, z: 24.2, h: 5.2 };  // netting (props.js) — the colliders stand on this line
const TURF = { hx: 13.8, hz: 24.4 };              // turf slabs (a little past the net)
const PARK = { hx: 30, hz: 40 };                  // park lawn around the field (outside the net: not inkable)

const K = {
  turf: '#4f9a3f', lawn: '#6a9446', path: '#d3cbb9',
  red: '#d4382c', yellow: '#efbd2e', blue: '#2b5cb8', white: '#ecebe5', black: '#2c2e33', orange: '#e86f25', teal: '#1f9a96',
};

// ---- bunker kit (every piece: nylon surface, max bevel, tagged for props.js / the thumbnail)
const nylon = (color, tag, o = {}) => ({ color, pattern: SURF.nylon, bevel: 9, round: true, tag, ...o });
// rounded box ("brick" / "snake" segment / "temple"): centre (cx, cz), w across (local x), d along (local z)
const pillow = (cx, cz, w, d, h, deg, color, tag = 'bunker', o = {}) => O(cx, cz, w, d, 0, h, deg, nylon(color, tag, o));
// ... sitting on another cushion (y0 = that one's top). Soft blocks only round the edges that nothing else touches, so
// stacked pieces sit ON each other (never sunk into one another: an edge that passes through a neighbour stays sharp).
const cushion = (cx, cz, w, d, y0, y1, deg, color, tag, o = {}) => O(cx, cz, w, d, y0, y1, deg, nylon(color, tag, o));
// "can" / "cake": one soft box rounded to a near-cylinder (level.js `round`: the bevel reaches 88 % of the radius,
// so the square footprint reads as a circle and the top domes over)
function can(cx, cz, r, h, color, tag = 'can', o = {}) {
  return [O(cx, cz, 2 * r, 2 * r, 0, h, 45, nylon(color, tag, o))];
}
// "dorito": a triangular bunker (side s, height h) — three rounded slabs, one along each side of the triangle, cut back
// from the tips (inflatable doritos have blunt, round tips); `deg` turns it (0 = one flat side facing +Z, i.e. the
// enemy for Alpha). Tops step down 3 cm slab to slab (no shared planes).
function dorito(cx, cz, s, h, deg, color, tag = 'dorito') {
  const r = s / (2 * Math.sqrt(3)), L = s * 0.64, d = r * 1.02;
  const out = [];
  for (let k = 0; k < 3; k++) {
    const a = ((deg + k * 120) * Math.PI) / 180;               // outward normal of side k (0 → +Z)
    const nx = Math.sin(a), nz = Math.cos(a), c = r - d / 2;
    out.push(O(cx + nx * c, cz + nz * c, L, d, 0, h - k * 0.03, deg + k * 120, nylon(color, tag)));
  }
  return out;
}
// "mini-A": a low, tent-shaped bunker (ridge along x): a wide 0.6 m base cushion under a narrower 1.2 m ridge
// cushion — with the big bevels the two read as one soft A. (Tilted ramp slabs can't close an A: their ends poke
// through each other.) The base's 0.4 m ledges are too narrow to stand on: no nav nodes up there.
function miniA(cx, cz, w, h, color, tag = 'minia') {
  return [
    pillow(cx, cz, w, 1.7, h * 0.5, 0, color, tag),
    cushion(cx, cz, w - 0.3, 0.8, h * 0.5, h, 0, color, tag),
  ];
}
// "snake": a straight run of tube segments laid end to end along z (low, narrow: no nav route runs along its top).
// Butted segments of one height join into one continuous soft tube (their end caps are buried in each other); the
// segment joints show as seams in the skin and as the tie-down straps (props.js).
function snake(x, z0, z1, n, w, h, color) {
  const out = [], L = (z1 - z0) / n;
  for (let i = 0; i < n; i++) out.push(pillow(x, z0 + (i + 0.5) * L, w, L, h, 0, color, 'snake', { noNav: true }));
  return out;
}

// ---- the park: turf field (two slabs, each with its own painted lines — murals 4 / 5) and the lawn outside the net
const ground = [
  B(-TURF.hx, TURF.hx, -1.2, 0, -TURF.hz, 0, { tag: 'turf', color: K.turf, pattern: SURF.turf, mural: [{ n: [0, 1, 0], id: 4 }] }),
  B(-TURF.hx, TURF.hx, -1.2, 0, 0, TURF.hz, { tag: 'turf', color: K.turf, pattern: SURF.turf, mural: [{ n: [0, 1, 0], id: 5 }] }),
];
const lawn = (o = {}) => ({ tag: 'lawn', color: K.lawn, pattern: SURF.lawn, paint: false, ...o });

const SPEEDBALL = {
  id: 'speedball',
  bounds: { minX: -15, maxX: 15, minZ: -26, maxZ: 26 },
  spawnPads: [[0, 0, -21.2], [0, 0, 21.2]],
  spawnBarrier: 4.2,
  // fly in over the Bravo pits and down the snake side, ending behind your start station
  intro: { from: [-20, 14, 30], lookFrom: [0, 1.5, 4], toBack: 3.0 },
  art: { from: [24, 11, -34], look: [-2, 0.5, 2], fov: 58 },
  single: [
    ...ground,
    // centre X: one 1.5 m tube, crossed by two 1.25 m half-tubes butting into its sides (hop onto the low arms)
    O(0, 0, 1.1, 5.0, 0, 1.5, 45, nylon(K.red, 'x')),
    O(-1.078, 1.078, 1.1, 1.95, 0, 1.25, -45, nylon(K.red, 'x-arm')),
    O(1.078, -1.078, 1.1, 1.95, 0, 1.25, -45, nylon(K.red, 'x-arm')),
  ],
  half: [
    // ================= park lawn outside the net (not inkable; the bleachers, pits and staging area stand on it)
    B(-PARK.hx, PARK.hx, -1.2, 0, -PARK.hz, -TURF.hz, lawn()),
    B(TURF.hx, PARK.hx, -1.2, 0, -TURF.hz, 0, lawn()),
    B(-PARK.hx, -TURF.hx, -1.2, 0, -TURF.hz, 0, lawn()),
    // gravel walk + pit pad behind the start end (outside the net), a hair above the lawn
    B(-9, 9, 0, 0.04, -31.5, -26.5, { tag: 'pits-pad', color: K.path, pattern: PATTERN.pavers, paint: false }),

    // ================= start: the home brick in front of the start station
    pillow(0, -15.6, 2.8, 1.0, 1.75, 0, K.blue, 'home'),

    // ================= snake side (+X for Alpha)
    ...can(10.1, -18.6, 0.7, 1.75, K.yellow, 'can'),                                       // snake corner can
    ...snake(10.8, -15.4, -2.6, 4, 1.25, 1.0, K.blue),
    pillow(6.9, -10.4, 1.7, 1.2, 1.9, 0, K.white, 'brick'),                                  // tall brick behind the snake
    ...can(7.4, -3.0, 0.62, 1.8, K.yellow, 'can'),                                           // the 50 can

    // ================= centre lane
    ...miniA(3.6, -12.4, 2.3, 1.2, K.red),
    ...can(2.8, -7.0, 1.05, 1.0, K.white, 'cake'),                                           // wide low cake (hop up)
    ...can(4.5, -1.2, 0.9, 1.0, K.yellow, 'cake'),                                           // cake beside the X

    // ================= dorito side (−X for Alpha)
    ...dorito(-10.4, -14.4, 2.5, 1.2, 0, K.yellow),
    ...dorito(-10.7, -5.9, 2.5, 1.2, 180, K.yellow),
    // stepped temple: a 1.0 m deck with a 1.2 m wall standing on its enemy side (climb the deck: the wall covers you to
    // the shoulders, shoot over it or round it)
    pillow(-6.3, -10.4, 2.6, 2.4, 1.0, 0, K.red, 'temple'),
    cushion(-6.3, -10.1, 1.6, 0.8, 1.0, 2.2, 0, K.white, 'temple-top'),
    ...dorito(-6.9, -2.4, 2.2, 1.2, 60, K.red),                                              // dorito 50
    ...miniA(-8.4, -18.6, 2.2, 1.2, K.blue),
    ...can(-4.9, -16.8, 0.62, 1.8, K.red, 'can'),                                            // tall can at the back
  ],
  decor: {
    lamps: [],
    palms: [],
    // team flags on the net line behind the start station
    flags: [[-3.4, 0, -23.7], [3.4, 0, -23.7]],
  },
};

export const LAYOUT = SPEEDBALL;
