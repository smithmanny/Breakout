// Breakpoint Field — stage surface materials (texlib layers `speedball:<name>`), on this stage's reserved PATTERN slots
// (see src/world/stages/cargo/surfaces.js for the contract: SURF → slot ids for layout.js, SURFACES → texlib MATERIALS).
// All three are `mask` layers: albedo.a = where the block colour applies, albedo.rgb = the layer's own colours.
//
//   turf    tournament artificial turf: dense blade tufts in the block colour, black rubber-crumb infill showing
//           between them, bleached / flattened patches — the white field lines are murals on top of it (murals.js)
//   nylon   inflatable bunker skin: PVC-coated nylon in the block colour, welded panel seams every metre (a darker,
//           glossier doubled band with stitch rows), soft pressure wrinkles and a satin sheen
//   lawn    the park's natural grass outside the net: patchy, clover clumps, bare dry earth in places
import { PATTERN } from '../../mapkit.js';

// (slots 31–33 belong to this stage: stages/surfaces.js STAGE_SLOTS)
export const SURF = { turf: 31, nylon: 32, lawn: 33 };

const GRID = 1, HEX = 2;

export const SURFACES = [
  {
    slot: 31, name: 'turf', onWall: PATTERN.concrete,
    mat: {
      detail: 0.4, scale: 1.0, tint: true, mask: true, alpha: false, mode: HEX, sym: 7, hr: [-0.004, 0.005], ao: 0.55,
      prep: `f[0] = FB(uv, ivec2(2), 4, 0.5, 3401u); f[1] = FB(uv, ivec2(9), 3, 0.5, 3403u); f[2] = FB(uv, ivec2(120), 1, 0.5, 3407u);
  f[3] = FB(uv, ivec2(3), 3, 0.55, 3409u); w[0] = WO(uv, ivec2(70), 1.0, 3411u); w[1] = WO(uv, ivec2(140), 1.0, 3413u);`,
      surf: /* glsl */`
  // blade tufts: two worley scales (tuft tips bright, roots dark), blade streaks, black crumb infill between tufts
  vec4 t1 = c[0], t2 = c[1];
  float tip = 1.0 - smoothstep(0.0, 0.62, t1.x);
  float tip2 = 1.0 - smoothstep(0.0, 0.55, t2.x);
  float blades = max(tip, tip2 * 0.85);
  float streak = 0.5 + 0.5 * n[2];
  float tone = 0.58 + 0.34 * blades + 0.1 * streak;
  tone *= 1.0 + 0.1 * n[0] + 0.05 * n[1] + 0.06 * (fract(t1.z * 7.3) - 0.5);
  float bleach = smoothstep(0.25, 0.75, n[3]);
  float trod = smoothstep(0.35, 0.8, -n[0]);                           // trampled: blades lie down, flatter + brighter
  float infill = (1.0 - smoothstep(0.08, 0.42, blades)) * (0.55 + 0.45 * smoothstep(-0.3, 0.4, n[1])) * (1.0 - 0.6 * trod);
  vec3 own = vec3(0.028, 0.027, 0.025) * (1.0 + 0.6 * streak);
  float cov = 1.0 - infill * 0.8;
  s.alb = own * (1.0 - cov) + vec3(0.035, 0.03, 0.0) * bleach * cov;
  s.a = cov * clamp(tone * (1.0 + 0.12 * bleach + 0.08 * trod), 0.0, 1.0);
  s.h = (0.0035 * blades * (1.0 - 0.5 * trod) - 0.0025 * infill) + 0.0004 * n[1];
  s.rough = 0.8 - 0.12 * trod * blades + 0.1 * infill;
  s.cav = 0.72 + 0.28 * blades;`,
    },
  },
  {
    slot: 32, name: 'nylon', onWall: 32,
    mat: {
      detail: 0.2, scale: 2.0, tint: true, mask: true, alpha: false, mode: GRID, sym: 7, hr: [-0.003, 0.004], ao: 0.3,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.5, 3501u); f[1] = FB(uv, ivec2(10), 3, 0.5, 3503u); f[2] = FB(uv, ivec2(5, 2), 3, 0.5, 3507u);
  f[3] = FB(uv, ivec2(160), 1, 0.5, 3509u);`,
      surf: /* glsl */`
  // welded panel seams on a 1 m grid (the face frame runs from the bunker's edges, so seams follow its shape)
  float dx = jd(P.x, 1.0), dy = jd(P.y, 1.0);
  float dS = min(dx, dy);
  float band = 1.0 - aa(0.014, dS);                                   // the doubled seam tape
  float stitch = (1.0 - aa(0.0022, abs(dS - 0.024))) * step(0.45, fract((dx < dy ? P.y : P.x) * 55.0));
  float ridge = exp(-dS * dS / 0.0012);                               // the fabric puffs up between seams
  // soft pressure wrinkles: creases where a low-frequency field crosses zero, plus a gentle quilting swell
  float wr = n[0], wr2 = n[1];
  float crease = (1.0 - smoothstep(0.0, 0.16, abs(n[2]))) * smoothstep(-0.2, 0.5, n[0]);
  float tone = 0.87 + 0.03 * wr + 0.02 * wr2 - 0.025 * crease + 0.01 * n[3];
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, vec3(0.05), band * 0.25); cov *= 1.0 - band * 0.25;
  own = mix(own, vec3(0.02), stitch * 0.5); cov *= 1.0 - stitch * 0.5;
  s.alb = own;
  s.a = cov * tone * (1.0 - 0.06 * band);
  s.h = 0.0012 * wr + 0.0005 * wr2 - 0.0009 * crease - 0.0016 * ridge + 0.0007 * band - 0.0004 * stitch;
  s.rough = 0.42 + 0.06 * wr2 + 0.08 * crease - 0.08 * band;
  s.cav = 1.0 - 0.08 * crease - 0.25 * stitch;`,
    },
  },
  {
    slot: 33, name: 'lawn', onWall: PATTERN.concrete,
    mat: {
      detail: 0.5, scale: 3.0, tint: true, mask: true, alpha: false, mode: HEX, sym: 7, hr: [-0.006, 0.004], ao: 0.5,
      prep: `f[0] = FB(uv, ivec2(3), 5, 0.55, 3601u); f[1] = FB(uv, ivec2(12), 3, 0.5, 3603u); f[2] = FB(uv, ivec2(150), 1, 0.5, 3607u);
  f[3] = FB(uv, ivec2(6), 3, 0.5, 3609u); w[0] = WO(uv, ivec2(120), 1.0, 3611u); w[1] = WO(uv, ivec2(14), 0.9, 3613u);`,
      surf: /* glsl */`
  vec4 bl = c[0], cl = c[1];
  float blade = 1.0 - smoothstep(0.0, 0.7, bl.x);
  float clover = (1.0 - smoothstep(0.2, 0.45, cl.x)) * step(0.8, cl.z) * smoothstep(-0.2, 0.3, n[1]);
  float bare = smoothstep(0.42, 0.72, n[0] + 0.25 * n[3]);            // dry earth patches
  float tone = (0.66 + 0.26 * blade + 0.08 * n[2]) * (1.0 + 0.12 * n[1] + 0.08 * n[3]) * (1.0 - 0.14 * clover);
  vec3 earth = vec3(0.3, 0.22, 0.13) * (0.85 + 0.3 * n[2]);
  float cov = 1.0 - bare * (0.75 - 0.35 * blade);
  s.alb = earth * (1.0 - cov) + vec3(0.04, 0.035, 0.0) * smoothstep(0.1, 0.6, n[3]) * cov;
  s.a = cov * clamp(tone, 0.0, 1.0);
  s.h = 0.003 * blade * (1.0 - bare) + 0.0015 * clover - 0.002 * bare + 0.0006 * n[1];
  s.rough = 0.88 - 0.05 * blade;
  s.cav = 0.75 + 0.25 * blade;`,
    },
  },
];
