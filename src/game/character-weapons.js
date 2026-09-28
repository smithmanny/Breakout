// BREAKOUT — procedural paintball markers held by the players (kinds keep their INKWAVE ids).
// Weapon space: grip centre at the origin, +Z = barrel forward, +Y = up, character's right = -X.
// Each weapon: body (vertex-coloured physical plastic with per-vertex surface class aMat — satin, gloss, rubber,
// metal, lens, LED, print), ink (team gloss), optional glow (charger coil) and drum (roller).
//
// Moving parts (character.js drives them from the firing state): def.parts = { name: { geo, pivot, mat, lamp? } } —
// each part's geometry is re-centred on its pivot (the part's Group sits at the pivot and slides / turns / scales
// about it); mat 'body' = shared plastic, 'ink' = team gloss, 'lamp' = a per-instance emissive (makeLampMaterial).
// def.bodyStatic / def.inkStatic = everything that never moves; def.body / def.ink stay the complete merged weapon
// (parts included, at rest) for tools that just want the static model. Parts per weapon:
//   shooter  trigger · bolt (cocking knob, cycles per shot) · can (ink canister, pulses per shot) · led (status lamp)
//   blaster  trigger · pump (foregrip slide — the left hand rides it) · needle (pressure gauge) · bulb (ink bulb)
//   charger  trigger · bolt (charging handle, draws back with the charge) · lens / eyepiece (scope glow) · ports
//            (muzzle-brake heat) · glow = coil rings with a per-vertex aSeg threshold (makeCoilMaterial lights them in order)
//   roller   led (reservoir lamp) · drum (spins; character.js gives it inertia)
//
// Hands: the squidkid fist is modelled around a Ø 2.8 cm handle whose axis passes through HAND.hole (character-geo).
// A grip spec { pos, handZ, handY } says where that handle axis passes (pos), which way it runs toward the thumb
// (handZ) and which way the wrist lies (handY). Handles held by a hand are ≤ 1.5 cm in radius around that axis.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { superEllipsoid, lathe, smoothProfile, sweep, finalize, torus as torusG, HAND } from './character-geo.js';
import { WMAT } from './character-mats.js';

const V3 = THREE.Vector3;
const M = WMAT;
const C = {
  cream: '#f2ede1', white: '#eef0f3', bone: '#e4ddcc', dark: '#2a2e37', darker: '#1b1e25', gray: '#8f98a6', metal: '#c3c9d2',
  gunmetal: '#5b616c', rubber: '#26282e', lens: '#0b0f16', red: '#ff3b30', green: '#3dff7a', amber: '#ffb000', decal: '#f7f7f5', hazard: '#ffcf33',
};

class Parts {
  constructor() { this.list = []; }
  add(geo, color, mat = M.satin) {
    const g = geo.index ? geo : finalize(geo);
    const n = g.attributes.position.count; const col = new Float32Array(n * 3); const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position.clone());
    out.setAttribute('normal', g.attributes.normal.clone());
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setAttribute('aMat', new THREE.Float32BufferAttribute(new Float32Array(n).fill(mat), 1));
    out.setIndex(g.index.clone());
    this.list.push(out); return this;
  }
  build() { return this.list.length ? mergeGeometries(this.list, false) : null; }
}

// ---------------------------------------------------------------------------------------------- helpers
/** Lathe along +Z from [r, z] profile. */
function latheZ(profile, seg = 16) { const g = lathe(profile, seg); g.rotateX(Math.PI / 2); return g; }
function torus(R, r, rs = 6, ts = 16, arc = Math.PI * 2) { return torusG(R, r, rs, ts, arc); }
function at(g, x, y, z) { g.translate(x, y, z); return g; }
/** Rounded box (w, h, d = full sizes), squareness e (smaller = boxier). */
function rbox(w, h, d, e = 0.3, ws = 12, hs = 8, deform) { return superEllipsoid(w / 2, h / 2, d / 2, e, e, ws, hs, deform); }
/** Orient geometry authored along +Y so that +Y → dir, then place at p. */
function orient(g, dir, p) { g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize())); return at(g, p.x, p.y, p.z); }
/** Small screw head (dome with a slot) facing n at p. */
function screw(P, p, n, r = 0.0032, col = C.metal) {
  const h = lathe([[0, 0], [r, 0], [r, 0.0006], [r * 0.72, 0.0014], [0, 0.0017]], 6);
  P.add(orient(h, n, p), col, M.metal);
}
/** Thin extruded decal from a 2D shape (in the XY plane), placed with basis (x, y) at p. */
function decal(shape, depth = 0.0006) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 5 });
  return finalize(g);
}
function placeXY(g, xAxis, yAxis, p) {
  const x = xAxis.clone().normalize(), y = yAxis.clone().addScaledVector(x, -yAxis.dot(x)).normalize(), z = new V3().crossVectors(x, y);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p));
  return g;
}
/** Squid glyph (mantle arrow + head + eyes cut out) as a Shape of height ~1 (scale it). */
function squidShape(s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.62 * s); sh.lineTo(0.42 * s, 0.1 * s); sh.quadraticCurveTo(0.38 * s, -0.08 * s, 0.26 * s, -0.12 * s);
  sh.lineTo(0.26 * s, -0.42 * s); sh.lineTo(0.14 * s, -0.42 * s); sh.lineTo(0.12 * s, -0.2 * s);
  sh.lineTo(0.05 * s, -0.2 * s); sh.lineTo(0.05 * s, -0.46 * s); sh.lineTo(-0.05 * s, -0.46 * s); sh.lineTo(-0.05 * s, -0.2 * s);
  sh.lineTo(-0.12 * s, -0.2 * s); sh.lineTo(-0.14 * s, -0.42 * s); sh.lineTo(-0.26 * s, -0.42 * s); sh.lineTo(-0.26 * s, -0.12 * s);
  sh.quadraticCurveTo(-0.38 * s, -0.08 * s, -0.42 * s, 0.1 * s); sh.lineTo(0, 0.62 * s);
  for (const ex of [0.12, -0.12]) { const e = new THREE.Path(); e.absellipse(ex * s, 0.02 * s, 0.055 * s, 0.07 * s, 0, Math.PI * 2, false); sh.holes.push(e); }
  return sh;
}
/** An animated sub-part built from its own Parts, authored in weapon space; re-centred on `pivot` in getWeaponDef. */
function part(P, pivot, mat = 'body', lamp = null) { return { src: P.build(), pivot: pivot.clone(), mat, lamp }; }

/** Per-instance glowing material for lamp parts (LEDs, scope lenses, hot muzzle ports). */
export function makeLampMaterial(spec = {}) {
  const m = new THREE.MeshStandardMaterial({ color: spec.color ?? 0x222222, emissive: spec.emissive ?? spec.color ?? 0xffffff, emissiveIntensity: spec.intensity ?? 1, roughness: spec.roughness ?? 0.25, metalness: 0 });
  m.name = 'iw-lamp';
  return m;
}

/** Charger coil: the rings light one after another as the charge passes their aSeg threshold (rear → muzzle), the ring
 *  being filled flickers hot, full charge ripples along the coil, the release flashes white. userData.u = uniforms
 *  { uCharge, uFull, uFlash, uTime }; emissive = team colour. */
export function makeCoilMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x1b1c22, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.3, metalness: 0.25 });
  const U = { uCharge: { value: 0 }, uFull: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 } };
  m.userData.u = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSeg;\nvarying float vSeg;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeg = aSeg;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCharge, uFull, uFlash, uTime;\nvarying float vSeg;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float lit = smoothstep(vSeg - 0.1, vSeg + 0.01, uCharge);
          float edge = exp(-pow((uCharge - vSeg + 0.05) * 11.0, 2.0)) * (1.0 - uFull);
          float I = 0.05 + lit * (0.9 + 1.7 * uCharge) + edge * (1.3 + 0.9 * sin(uTime * 57.0))
                  + uFull * (1.1 + 1.0 * (0.5 + 0.5 * sin(uTime * 34.0 - vSeg * 14.0))) + uFlash * 6.0;
          totalEmissiveRadiance = emissive * I + vec3(uFlash * 2.0);
        }`);
  };
  m.customProgramCacheKey = () => 'iw-coil-1';
  return m;
}

function chevronShape(w, h, n = 3, gap = 0.4) {
  const sh = []; const step = w / n;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Shape(); const x0 = i * step, t = step * (1 - gap);
    s.moveTo(x0, 0); s.lineTo(x0 + t, 0); s.lineTo(x0 + t + h * 0.5, h * 0.5); s.lineTo(x0 + t, h); s.lineTo(x0, h); s.lineTo(x0 + h * 0.5, h * 0.5); s.lineTo(x0, 0);
    sh.push(s);
  }
  return sh;
}

// ---------------------------------------------------------------------------------------------- hands
/** Grip-hole axis point relative to the hand bone (right hand = mirror of the modelled left hand). */
export const GRIP_HOLE_L = HAND.hole.clone();
export const GRIP_HOLE_R = new V3(-HAND.hole.x, HAND.hole.y, HAND.hole.z);
/** Twirl pivot: the right fist's grip axis (so spins happen around the handle the kid is holding). */
export const FIST_OFFSET = GRIP_HOLE_R.clone();

/** Pistol grip around the handle axis A through the origin: rubber-paneled, finger-grooved front strap,
 *  beavertail over the web of the hand, trigger + guard for the index finger, flared base plate. */
const GRIP_AXIS = new V3(0, 1, 0.25).normalize();
function pistolGrip(P, opt = {}) {
  const A = GRIP_AXIS;
  const tilt = Math.atan2(A.z, A.y);
  // core: slim oval handle, finger grooves on the front strap
  const core = superEllipsoid(0.0118, 0.056, 0.0152, 0.62, 0.7, 12, 12, (q) => {
    if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos(((q.y + 0.0006) / 0.0122) * Math.PI * 2); q.z -= 0.0016 * f * (1 - Math.abs(q.x) / 0.0118) * (q.y < 0.03 ? 1 : 0); }
    if (q.y < -0.046) { q.x *= 1.08; q.z *= 1.06; }
  });
  core.rotateX(tilt); P.add(at(core, 0, -0.008, -0.002), C.darker, M.satin);
  // rubber side panels (knurled)
  for (const sx of [1, -1]) {
    const pn = superEllipsoid(0.003, 0.038, 0.0118, 0.5, 0.55, 5, 8);
    pn.rotateX(tilt); P.add(at(pn, sx * 0.0104, -0.012, -0.004), C.rubber, M.rubber);
  }
  // beavertail + back strap
  const bt = superEllipsoid(0.0118, 0.012, 0.016, 0.5, 0.6, 8, 5, (q) => { if (q.z < 0) q.y -= 0.006 * (q.z / 0.016) ** 2; });
  bt.rotateX(tilt - 0.35); P.add(at(bt, 0, 0.042, -0.018), C.darker, M.satin);
  // base plate (flared magazine foot)
  const base = superEllipsoid(0.0138, 0.0048, 0.0188, 0.45, 0.5, 10, 4);
  base.rotateX(tilt); P.add(at(base, 0, -0.062, -0.018), opt.baseCol || C.dark, M.gloss);
  // trigger guard (loop in front of the index finger) + trigger blade
  const g0 = new V3(0, 0.03, 0.012), g1 = new V3(0, 0.018, 0.043), g2 = new V3(0, 0.002, 0.05), g3 = new V3(0, -0.006, 0.028);
  const guard = sweep([g0, g1, g2, g3], { seg: 8, radial: 5, capSteps: 2, radius: () => 0.0032, flat: 1.9, outward: (Pp, o) => o.set(1, 0, 0) });
  P.add(guard.geo, C.dark, M.satin);
  const trig = superEllipsoid(0.0034, 0.0105, 0.0034, 0.7, 0.7, 6, 6, (q) => { q.z += 16 * q.y * q.y; });
  trig.rotateX(-0.25); (opt.T || P).add(at(trig, 0, 0.0215, 0.0305), C.metal, M.metal);
}
const GRIP_PISTOL = { pos: new V3(0, 0, 0), handZ: GRIP_AXIS.clone(), handY: new V3(0, 0.25, -1) };
/** Trigger blade hinge (top of the blade, inside the frame): the trigger part squeezes back about +X here. */
const TRIGGER_PIVOT = new V3(0, 0.0315, 0.0282);

// ---------------------------------------------------------------------------------------------- roller
function buildRoller() {
  const P = new Parts(), I = new Parts(), LED = new Parts();
  const L = 0.84; // grip -> drum axis
  // shaft: brushed tube, ferrules, two knurled rubber grips (top = right hand, mid = left hand)
  P.add(latheZ([[0, -0.072], [0.0098, -0.072], [0.0098, 0.715], [0, 0.715]], 10), C.metal, M.metal);
  const topGrip = latheZ(smoothProfile([[0, -0.094], [0.0112, -0.094], [0.0148, -0.086], [0.0142, -0.07], [0.0136, -0.03], [0.0138, 0.02], [0.0142, 0.052], [0.0158, 0.06], [0.0118, 0.066]], 10), 12);
  P.add(topGrip, C.rubber, M.rubber);
  const cap = latheZ([[0, -0.1], [0.0118, -0.0985], [0.0142, -0.094], [0, -0.094]], 12); P.add(cap, C.dark, M.gloss);
  I.add(at(torus(0.0142, 0.0028, 5, 14), 0, 0, 0.066));
  const midGrip = latheZ(smoothProfile([[0.0098, 0.13], [0.0136, 0.136], [0.0142, 0.15], [0.0138, 0.2], [0.0142, 0.235], [0.0136, 0.25], [0.0098, 0.256]], 8), 10);
  P.add(midGrip, C.rubber, M.rubber);
  for (const z of [0.128, 0.258]) I.add(at(torus(0.0118, 0.0022, 4, 12), 0, 0, z));
  // hazard band + squid decal wrapped on the shaft
  for (let k = 0; k < 5; k++) { const band = latheZ([[0.0101, 0], [0.0101, 0.008]], 8); P.add(at(band, 0, 0, 0.34 + k * 0.016), k % 2 ? C.dark : C.hazard, M.print); }
  // yoke: cast hub, twin swept arms, bearing bosses with bolt circles, ink reservoir with a window
  const hub = superEllipsoid(0.026, 0.024, 0.036, 0.5, 0.6, 12, 8); P.add(at(hub, 0, 0, 0.716), C.dark, M.satin);
  const collar = latheZ([[0.0098, 0.69], [0.0162, 0.692], [0.0168, 0.702], [0.0098, 0.704]], 12); P.add(collar, C.metal, M.metal);
  for (const sx of [1, -1]) {
    const arm = sweep([new V3(0, 0, 0.712), new V3(0.13 * sx, -0.004, 0.734), new V3(0.285 * sx, -0.012, 0.768), new V3(0.328 * sx, -0.02, 0.808), new V3(0.334 * sx, -0.022, L)], {
      seg: 12, radial: 7, capSteps: 2, radius: (t) => 0.0122 - 0.002 * t, flat: 0.62, outward: (Pp, o) => o.set(0, 1, 0),
    });
    P.add(arm.geo, C.gunmetal, M.metal);
    const boss = latheZ([[0, -0.014], [0.0262, -0.014], [0.0282, -0.01], [0.0284, 0.008], [0.025, 0.013], [0, 0.013]], 12);
    boss.rotateY(Math.PI / 2); P.add(at(boss, 0.322 * sx, -0.022, L), C.dark, M.gloss);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; screw(P, new V3(0.3355 * sx, -0.022 + Math.cos(a) * 0.017, L + Math.sin(a) * 0.017), new V3(sx, 0, 0), 0.0024); }
  }
  const res = superEllipsoid(0.056, 0.026, 0.036, 0.55, 0.6, 12, 7); I.add(at(res, 0, 0.03, 0.738));
  const resFrame = superEllipsoid(0.06, 0.009, 0.04, 0.4, 0.5, 14, 4); P.add(at(resFrame, 0, 0.052, 0.738), C.dark, M.gloss);
  const resBase = superEllipsoid(0.06, 0.008, 0.04, 0.4, 0.5, 14, 4); P.add(at(resBase, 0, 0.008, 0.738), C.dark, M.satin);
  for (const sx of [1, -1]) for (const sz of [1, -1]) { const post = superEllipsoid(0.004, 0.02, 0.004, 0.7, 0.7, 5, 5); P.add(at(post, sx * 0.05, 0.03, 0.738 + sz * 0.028), C.dark, M.satin); }
  const vcap = lathe([[0, 0], [0.009, 0], [0.0098, 0.004], [0.0082, 0.0085], [0, 0.009]], 10); P.add(at(vcap, 0.028, 0.06, 0.738), C.metal, M.metal);
  const led = superEllipsoid(0.0036, 0.0022, 0.0036, 1, 1, 8, 4); LED.add(at(led, -0.03, 0.062, 0.738), C.amber, M.led);
  const sq = decal(squidShape(0.032)); placeXY(sq, new V3(1, 0, 0), new V3(0, 0.3, -1), new V3(0, 0.0605, 0.738)); P.add(sq, C.decal, M.print);
  // drum (separate spinning mesh): axis along X, centred at origin; lumpy wet ink with raised tread ribs
  const drumProf = smoothProfile([[0.0, -0.3], [0.07, -0.3], [0.09, -0.296], [0.099, -0.283], [0.1015, -0.25], [0.1015, 0.25], [0.099, 0.283], [0.09, 0.296], [0.07, 0.3], [0.0, 0.3]], 16);
  const drum = lathe(drumProf, 26, (v) => {
    const a = Math.atan2(v.z, v.x); const rr = Math.hypot(v.x, v.z);
    if (rr > 0.085) {
      let k = 1 + 0.03 * Math.sin(a * 7 + v.y * 21) * Math.sin(a * 3 - v.y * 13);
      k += 0.018 * Math.max(0, Math.cos(v.y * 42)) * (Math.abs(v.y) < 0.26 ? 1 : 0);   // tread ribs
      v.x *= k; v.z *= k;
    }
  });
  drum.rotateZ(Math.PI / 2);
  const caps = new Parts();
  for (const sx of [1, -1]) {
    const c = latheZ([[0, -0.007], [0.074, -0.007], [0.081, -0.002], [0.081, 0.003], [0.064, 0.008], [0.03, 0.009], [0.018, 0.013], [0, 0.013]], 16);
    c.rotateY(sx * Math.PI / 2); caps.add(at(c, 0.302 * sx, 0, 0), C.dark, M.gloss);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; const b = lathe([[0, 0], [0.0042, 0], [0.0042, 0.002], [0, 0.0028]], 5); caps.add(orient(b, new V3(sx, 0, 0), new V3(0.3085 * sx + 0.002 * sx, Math.cos(a) * 0.05, Math.sin(a) * 0.05)), C.metal, M.metal); }
    const hubC = latheZ([[0, 0], [0.016, 0], [0.018, 0.006], [0.012, 0.012], [0, 0.013]], 10); hubC.rotateY(sx * Math.PI / 2); caps.add(at(hubC, 0.309 * sx, 0, 0), C.metal, M.metal);
  }
  return {
    kind: 'roller', body: P.build(), ink: I.build(), drum, drumCaps: caps.build(), drumAt: new V3(0, -0.022, L), drumR: 0.1,
    parts: { led: part(LED, new V3(-0.03, 0.062, 0.738), 'lamp', { color: '#3a2600', emissive: '#ffb000', intensity: 0.6 }) },
    muzzle: new V3(0, -0.022, L),
    gripR: { pos: new V3(0, 0, -0.022), handZ: new V3(0, 0, 1), handY: new V3(-0.3, 1, 0) },
    gripL: { pos: new V3(0, 0, 0.19), handZ: new V3(0, 0, 1), handY: new V3(0.5, 1, 0) },
    twirl: new V3(0, 0, 0),
  };
}

// ---------------------------------------------------------------------------------------------- slosher
// "Tidebucket Slosher": a thick-walled pail on a pitcher handle (right hand), a rubber carry bar under the front of the
// base (left hand, let go for the throw), hoops, a team-ink band, a pour lip, and the ink inside: a static fill plus a
// free surface disc (part 'surface' — kept level against the swing, rippling, drawn down by each throw). Thumb lever on
// the handle ('lever') trips as the ink leaves. Bucket axis = +Y; the throw goes out over the lip (+Z).
function buildSlosher() {
  const P = new Parts(), I = new Parts(), SURF = new Parts(), LEV = new Parts();
  const BZ = 0.148, BY = 0.012;
  const shell = lathe(smoothProfile([[0.0, -0.078], [0.074, -0.078], [0.083, -0.071], [0.1, 0.07], [0.106, 0.088], [0.112, 0.094]], 10)
    .concat([[0.1135, 0.0985], [0.1085, 0.1025], [0.1005, 0.098], [0.0945, 0.085], [0.0785, -0.06], [0.0, -0.062]]), 28);
  P.add(at(shell, 0, BY, BZ), C.cream, M.gloss);
  const wallR = (y) => 0.083 + (0.1 - 0.083) * ((y + 0.071) / 0.141);   // outer wall radius of the shell profile
  for (const y of [-0.045, 0.058]) { const h = torus(wallR(y) + 0.0035, 0.0042, 5, 30); h.rotateX(Math.PI / 2); P.add(at(h, 0, BY + y, BZ), C.dark, M.gloss); }
  const band = lathe([[wallR(-0.022) + 0.0005, -0.024], [wallR(-0.02) + 0.0028, -0.02], [wallR(0.03) + 0.0028, 0.03], [wallR(0.034) + 0.0005, 0.034]], 28); I.add(at(band, 0, BY, BZ));
  // ink run down the outside from the pour lip: three drips hugging the wall, fattest at their tips
  for (const [a, len] of [[0.12, 0.05], [-0.22, 0.034], [0.42, 0.024]]) {
    const y0 = 0.094, y1 = y0 - len, pts = [];
    for (let i = 0; i <= 4; i++) { const y = y0 - (y0 - y1) * (i / 4), r = wallR(y) + 0.0022; pts.push(new V3(Math.sin(a) * r, y, Math.cos(a) * r)); }
    const dr = sweep(pts, { seg: 8, radial: 6, capSteps: 2, radius: (t) => 0.0034 + 0.0032 * t * t, flat: 0.75, outward: (Pp, o) => o.set(Pp.x, 0, Pp.z).normalize() });
    I.add(at(dr.geo, 0, BY, BZ));
  }
  // pour lip at the front of the rim
  const lip = superEllipsoid(0.034, 0.006, 0.02, 0.5, 0.7, 10, 5, (q) => { q.y += 0.18 * q.z; q.x *= 1 - 0.4 * Math.max(0, q.z / 0.02); });
  P.add(at(lip, 0, BY + 0.097, BZ + 0.112), C.cream, M.gloss);
  // the ink: static fill + the free surface (part)
  const fill = lathe([[0.0, -0.059], [0.0775, -0.058], [0.0905, 0.048], [0.0, 0.048]], 24); I.add(at(fill, 0, BY, BZ));
  const surf = superEllipsoid(0.0905, 0.0045, 0.0905, 1, 0.9, 26, 5, (q) => { const r = Math.hypot(q.x, q.z); q.y += 0.0022 * Math.sin(r * 140) * Math.max(0, 1 - r / 0.09); });
  SURF.add(at(surf, 0, BY + 0.05, BZ));
  // pitcher handle: grooved vertical grip on two swept brackets
  const core = superEllipsoid(0.0118, 0.05, 0.0138, 0.62, 0.7, 12, 12, (q) => { if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos((q.y / 0.0125) * Math.PI * 2); q.z -= 0.0015 * f * (Math.abs(q.y) < 0.04 ? 1 : 0); } });
  P.add(core, C.darker, M.satin);
  for (const sx of [1, -1]) { const pn = superEllipsoid(0.0028, 0.036, 0.0105, 0.5, 0.55, 5, 8); P.add(at(pn, sx * 0.0104, 0, -0.002), C.rubber, M.rubber); }
  for (const [y0, y1, z1] of [[0.045, BY + 0.062, BZ - wallR(0.05) + 0.004], [-0.046, BY - 0.05, BZ - wallR(-0.062) + 0.004]]) {
    const br = sweep([new V3(0, y0, 0.002), new V3(0, (y0 + y1) / 2 + (y0 > 0 ? 0.012 : -0.008), z1 * 0.5), new V3(0, y1, z1)], { seg: 8, radial: 6, capSteps: 2, radius: () => 0.0085, flat: 1.5, outward: (Pp, o) => o.set(1, 0, 0) });
    P.add(br.geo, C.dark, M.gloss);
  }
  P.add(at(superEllipsoid(0.0138, 0.0046, 0.0165, 0.45, 0.5, 10, 4), 0, -0.053, -0.001), C.dark, M.gloss);   // pommel
  // thumb lever on top of the handle (trips on the throw)
  const lev = superEllipsoid(0.0072, 0.0026, 0.016, 0.5, 0.6, 6, 4, (q) => { q.y += 0.12 * q.z; }); LEV.add(at(lev, 0, 0.0555, -0.004), C.metal, M.metal);
  // carry bar under the front of the base (left hand): rubber sleeve on two struts
  const bar = latheZ(smoothProfile([[0, -0.036], [0.0104, -0.035], [0.0112, -0.028], [0.0112, 0.028], [0.0104, 0.035], [0, 0.036]], 6), 12);
  bar.rotateY(Math.PI / 2); P.add(at(bar, 0, BY - 0.1, BZ + 0.052), C.rubber, M.rubber);
  for (const sx of [1, -1]) P.add(at(superEllipsoid(0.0045, 0.012, 0.0065, 0.6, 0.6, 5, 5), sx * 0.03, BY - 0.088, BZ + 0.05), C.dark, M.satin);
  // decals: squid glyph on the left flank, wave chevrons on the right
  const sq = decal(squidShape(0.045)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0.06), new V3(0.097, BY + 0.012, BZ)); P.add(sq, C.dark, M.print);
  for (const s of chevronShape(0.05, 0.014, 3, 0.4)) { const g = decal(s); placeXY(g, new V3(0, 0, 1), new V3(0, 1, 0.06), new V3(-0.0975, BY + 0.005, BZ - 0.025)); P.add(g, C.dark, M.print); }
  return {
    kind: 'slosher', body: P.build(), ink: I.build(),
    parts: {
      surface: part(SURF, new V3(0, BY + 0.05, BZ), 'ink'),
      lever: part(LEV, new V3(0, 0.0555, 0.012)),
    },
    muzzle: new V3(0, BY + 0.1, BZ + 0.03),
    gripR: { pos: new V3(0, 0, 0), handZ: new V3(0, 1, 0.1), handY: new V3(0, 0.12, -1) },
    gripL: { pos: new V3(0, BY - 0.1, BZ + 0.052), handZ: new V3(-1, 0, 0), handY: new V3(0.25, -0.85, 0.45) },
    twirl: new V3(0, 0.02, 0.08),
  };
}

// ---------------------------------------------------------------------------------------------- BREAKOUT markers
// Paintball markers keyed by the old weapon kinds (weapons.js reads muzzles / grips from these defs):
//   shooter   "Vector" electro marker: milled receiver, vertical feed neck + rounded hopper, ported barrel, air tank as stock
//   dualies   compact magazine-fed paintball pistols (one per hand)
//   splatling "Stormline" full-auto: bigger receiver, big hopper with the rate meter on its back, long shrouded barrel
//   charger   pump sniper: long barrel, scope, pump sleeve, side 10-round feed tube, tank stock, charge LEDs down the shroud
//   blaster   stubby paint-grenade launcher: fat launch tube (grenade nose visible in the muzzle), pump + pressure gauge
// Colours: dark anodised body, the team colour on the ink material (hopper dome, panels, rings, pods).
const MK = { body: '#24272e', body2: '#31353e', anod: '#3b404a', tank: '#2c2f35', carbon: '#1d1f24' };

/** Rounded paintball loader on top of a feed neck: dark lower shell, team (ink) dome, seam ring, speed-feed lid.
 *  (cx, cy, cz) = hopper centre; (hx, hy, hz) = half sizes; neck from y0 (receiver top) up into the shell. */
function hopper(P, D, cx, cy, cz, hx, hy, hz, y0, opt = {}) {
  const shell = superEllipsoid(hx, hy * 0.62, hz, 0.8, 0.85, 18, 10, (q) => { if (q.y > 0) q.y *= 0.4; q.z *= 1 + 0.12 * (q.z < 0 ? 1 : 0); });
  P.add(at(shell, cx, cy - hy * 0.25, cz), opt.shellCol || MK.body, M.gloss);
  const dome = superEllipsoid(hx * 0.95, hy * 0.78, hz * 0.95, 0.85, 0.9, 20, 10, (q) => { if (q.y < 0) q.y *= 0.3; q.z *= 1 + 0.1 * (q.z < 0 ? 1 : 0); });
  D.add(at(dome, cx, cy - hy * 0.12, cz));
  // seam band + front speed-feed flap + a couple of grip ribs on the sides
  const seam = torus(1, 0.035, 4, 28); seam.rotateX(Math.PI / 2); seam.scale(hx * 1.0, 1, hz * 1.04 * 1.06); seam.scale(1, 0.1, 1);
  P.add(at(seam, cx, cy - hy * 0.12, cz - hz * 0.03), C.darker, M.satin);
  const flap = superEllipsoid(hx * 0.42, 0.005, hz * 0.28, 0.4, 0.5, 10, 4, (q) => { q.y += 0.25 * q.z * (q.z > 0 ? 1 : 0); });
  P.add(at(flap, cx, cy + hy * 0.62, cz + hz * 0.55), C.darker, M.satin);
  for (const sx of [1, -1]) P.add(at(superEllipsoid(0.0022, hy * 0.28, hz * 0.4, 0.6, 0.6, 4, 6), cx + sx * hx * 0.97, cy - hy * 0.2, cz - hz * 0.2), C.rubber, M.rubber);
  // feed neck + clamp
  const nh = cy - hy * 0.55 - y0;
  P.add(at(latheZ([[0.0118, 0], [0.0118, nh]], 12).rotateX(-Math.PI / 2), cx, y0, cz + (opt.neckZ || 0)), C.gunmetal, M.metal);
  const clamp = torus(0.0135, 0.0032, 4, 14); clamp.rotateX(Math.PI / 2); P.add(at(clamp, cx, y0 + nh * 0.35, cz + (opt.neckZ || 0)), C.darker, M.satin);
  P.add(at(superEllipsoid(0.004, 0.005, 0.004, 0.6, 0.6, 5, 4), cx - 0.015, y0 + nh * 0.35, cz + (opt.neckZ || 0)), C.metal, M.metal);
}
/** Compressed-air bottle lying along -Z from z0 (regulator end) at height y: carbon wrap, team label band, gauge. */
function airTank(P, I, y, z0, len, r, opt = {}) {
  const z1 = z0 - len;
  P.add(latheZ(smoothProfile([[0, z1 - 0.004], [r * 0.7, z1 - 0.002], [r * 0.97, z1 + r * 0.45], [r, z1 + r * 0.9], [r, z0 - 0.018], [r * 0.82, z0 - 0.006], [0.012, z0], [0, z0]], 12), 16).translate(0, y, 0), MK.carbon, M.satin);
  I.add(at(latheZ([[r + 0.0012, z1 + len * 0.42], [r + 0.0012, z1 + len * 0.58]], 16), 0, y, 0));
  for (const zz of [z1 + len * 0.4, z1 + len * 0.6]) P.add(at(torus(r + 0.0006, 0.0014, 3, 16), 0, y, zz), C.decal, M.print);
  // regulator + pin valve + gauge
  P.add(latheZ([[0, z0 - 0.004], [0.0125, z0 - 0.004], [0.0132, z0 + 0.006], [0.0118, z0 + 0.03], [0, z0 + 0.03]], 12).translate(0, y, 0), C.metal, M.metal);
  const g = lathe([[0, 0], [0.0078, 0], [0.0082, 0.004], [0.0074, 0.006], [0, 0.006]], 10);
  P.add(orient(g, new V3(0.7, 0.7, 0).normalize(), new V3(0.009, y + 0.009, z0 + 0.012)), C.metal, M.metal);
  P.add(orient(superEllipsoid(0.0062, 0.0062, 0.0006, 1, 1, 10, 3), new V3(0.7, 0.7, 0).normalize(), new V3(0.0133, y + 0.0133, z0 + 0.012)), C.white, M.gloss);
  if (opt.butt) P.add(at(superEllipsoid(r * 1.05, r * 1.05, 0.006, 0.6, 0.8, 14, 5), 0, y, z1 - 0.004), C.rubber, M.rubber);
}
/** Ported paintball barrel along +Z from z0 to z1 at height y: back section, porting holes near the tip, team tip ring. */
function markerBarrel(P, I, y, z0, z1, r, opt = {}) {
  const L = z1 - z0;
  P.add(latheZ(smoothProfile([[0, z0], [r * 1.35, z0], [r * 1.35, z0 + 0.03], [r * 1.12, z0 + 0.04], [r, z0 + 0.06]], 6).concat([[r, z1 - 0.012], [r * 1.12, z1 - 0.006], [r * 1.12, z1], [r * 0.72, z1], [0, z1 - 0.004]]), 14).translate(0, y, 0), opt.col || C.gunmetal, M.metal);
  // porting: rows of small dark holes over the last third
  const nP = opt.ports ?? 5;
  for (let k = 0; k < nP; k++) for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2 + (k % 2) * Math.PI / 4, zz = z1 - 0.02 - k * 0.013;
    const h = superEllipsoid(0.0024, 0.0024, 0.0016, 1, 1, 6, 4);
    P.add(orient(h, new V3(Math.cos(ang), Math.sin(ang), 0), new V3(Math.cos(ang) * r, y + Math.sin(ang) * r, zz)), C.darker, M.satin);
  }
  I.add(at(torus(r * 1.14, 0.0022, 4, 14), 0, y, z1 - 0.0035));
  I.add(at(latheZ([[r * 1.36, z0 + 0.004], [r * 1.36, z0 + 0.02]], 14), 0, y, 0));
  if (L > 0.2) P.add(at(torus(r * 1.05, 0.0012, 3, 12), 0, y, z0 + L * 0.5), C.darker, M.satin);
}
/** Milled marker receiver: rounded box, side milling grooves, team (ink) side panels. */
function receiver(P, I, y, z, hw, hh, hd, opt = {}) {
  const rec = superEllipsoid(hw, hh, hd, 0.3, 0.42, 14, 10, (q) => { if (q.z > hd * 0.6) q.y *= 1 - 0.25 * (q.z - hd * 0.6) / (hd * 0.4); });
  P.add(at(rec, 0, y, z), opt.col || MK.body, M.satin);
  for (const sx of [1, -1]) {
    const pan = superEllipsoid(0.0012, hh * 0.55, hd * 0.62, 0.35, 0.4, 4, 8, (q) => { q.y += (q.z / hd) * hh * 0.25; });
    I.add(at(pan, sx * (hw + 0.0002), y + hh * 0.1, z - hd * 0.05));
    for (let k = 0; k < 3; k++) P.add(at(superEllipsoid(0.0007, 0.0007, hd * 0.2, 1, 1, 4, 5), sx * (hw + 0.0006), y - hh * 0.55, z + hd * (0.2 + 0.2 * k) - hd * 0.1), C.darker, M.print);
    screw(P, new V3(sx * (hw + 0.0003), y + hh * 0.55, z - hd * 0.75), new V3(sx, 0, 0), 0.0024);
    screw(P, new V3(sx * (hw + 0.0003), y + hh * 0.55, z + hd * 0.75), new V3(sx, 0, 0), 0.0024);
  }
}

// ---------------------------------------------------------------------------------------------- shooter
function buildShooter() {
  const P = new Parts(), I = new Parts(), T = new Parts(), BOLT = new Parts(), CAN = new Parts(), LED = new Parts();
  pistolGrip(P, { T });
  const RY = 0.07;
  receiver(P, I, RY, 0.03, 0.0172, 0.026, 0.078);
  // lower frame (trigger frame) + front grip frame
  P.add(at(superEllipsoid(0.0145, 0.011, 0.07, 0.35, 0.45, 10, 5), 0, 0.04, 0.03), MK.body2, M.satin);
  // hopper on a vertical feed neck (the team dome = 'can', it jolts as each ball drops)
  hopper(P, CAN, 0, 0.158, 0.012, 0.045, 0.04, 0.066, RY + 0.024, { neckZ: 0.012 });
  // barrel
  markerBarrel(P, I, RY, 0.105, 0.3, 0.0098);
  // bolt / cocking pin at the back
  const knob = latheZ([[0, -0.012], [0.0062, -0.012], [0.0068, -0.008], [0.0068, 0.0], [0, 0.0]], 10); BOLT.add(at(knob, 0, RY + 0.006, -0.05), C.metal, M.metal);
  for (let k = 0; k < 3; k++) BOLT.add(at(torus(0.0069, 0.0006, 3, 10), 0, RY + 0.006, -0.059 + k * 0.003), C.gunmetal, M.metal);
  // air tank as the stock, on a stock-thru adapter
  P.add(at(superEllipsoid(0.014, 0.017, 0.012, 0.4, 0.5, 8, 6), 0, RY + 0.006, -0.054), MK.body2, M.satin);
  airTank(P, I, RY + 0.006, -0.064, 0.17, 0.024, { butt: true });
  // status LED on the left (player-facing) flank + eye cover
  const led = superEllipsoid(0.0028, 0.0028, 0.0014, 1, 1, 8, 4); LED.add(orient(led, new V3(-1, 0, 0), new V3(-0.0178, RY + 0.012, -0.035)), C.green, M.led);
  P.add(orient(torus(0.0032, 0.0008, 3, 10).rotateX(Math.PI / 2), new V3(-1, 0, 0), new V3(-0.0176, RY + 0.012, -0.035)), C.darker, M.satin);
  // support foregrip (vertical, under the nose) + the macroline hose to the grip
  const fg = superEllipsoid(0.0118, 0.028, 0.0132, 0.55, 0.65, 10, 8, (q) => { if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos((q.y / 0.0125) * Math.PI * 2); q.z -= 0.0012 * f; } });
  fg.rotateX(-0.12); P.add(at(fg, 0, 0.016, 0.07), C.darker, M.satin);
  const fgr = superEllipsoid(0.0124, 0.0175, 0.0095, 0.5, 0.55, 8, 6); fgr.rotateX(-0.12); P.add(at(fgr, 0, 0.012, 0.069), C.rubber, M.rubber);
  P.add(at(superEllipsoid(0.0134, 0.0042, 0.0152, 0.5, 0.5, 10, 4), 0, -0.0125, 0.074), C.dark, M.gloss);
  const hose = sweep([new V3(-0.009, -0.01, 0.06), new V3(-0.013, -0.03, 0.04), new V3(-0.012, -0.045, 0.012), new V3(-0.009, -0.058, -0.008)], { seg: 8, radial: 5, capSteps: 1, radius: () => 0.0026 });
  P.add(hose.geo, C.gunmetal, M.metal);
  // sight rail on the receiver
  P.add(at(superEllipsoid(0.0062, 0.0035, 0.034, 0.4, 0.5, 6, 4), 0, RY + 0.027, 0.075), C.darker, M.satin);
  return {
    kind: 'shooter', body: P.build(), ink: I.build(),
    parts: {
      trigger: part(T, TRIGGER_PIVOT),
      bolt: part(BOLT, new V3(0, RY + 0.006, -0.05)),
      can: part(CAN, new V3(0, 0.158, 0.012), 'ink'),
      led: part(LED, new V3(-0.0178, RY + 0.012, -0.035), 'lamp', { color: '#0f2a18', emissive: '#3dff7a', intensity: 1.3 }),
    },
    muzzle: new V3(0, RY, 0.302),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.02, 0.0705), handZ: new V3(0, 1, -0.12), handY: new V3(0.45, -0.05, -1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- charger
function buildCharger() {
  const P = new Parts(), I = new Parts(), G = new Parts(), T = new Parts(), BOLT = new Parts(), LENS = new Parts(), EYE = new Parts(), PORTS = new Parts();
  pistolGrip(P, { T });
  const RY = 0.058;
  receiver(P, I, 0.062, 0.035, 0.0185, 0.03, 0.105);
  P.add(at(superEllipsoid(0.016, 0.011, 0.1, 0.4, 0.5, 12, 5), 0, 0.034, 0.04), MK.body2, M.satin);
  // cocking handle on the right flank (draws back with the charge)
  const slot = superEllipsoid(0.0014, 0.0034, 0.0215, 0.5, 0.5, 6, 6); P.add(at(slot, -0.0192, 0.079, -0.0255), C.darker, M.satin);
  const stem = latheZ([[0, 0], [0.0024, 0], [0.0024, 0.011], [0, 0.011]], 8); stem.rotateY(-Math.PI / 2); BOLT.add(at(stem, -0.0185, 0.079, -0.008), C.metal, M.metal);
  const cap = superEllipsoid(0.0034, 0.0052, 0.0052, 0.6, 0.7, 8, 6); BOLT.add(at(cap, -0.0312, 0.079, -0.008), C.dark, M.gloss);
  // tank stock
  P.add(at(superEllipsoid(0.014, 0.018, 0.014, 0.4, 0.5, 8, 6), 0, 0.066, -0.075), MK.body2, M.satin);
  airTank(P, I, 0.066, -0.087, 0.17, 0.024, { butt: true });
  P.add(at(superEllipsoid(0.0128, 0.006, 0.04, 0.5, 0.6, 8, 4), 0, 0.093, -0.14), C.rubber, M.rubber);   // cheek pad on the tank
  // long barrel: back section, shroud with the charge LEDs, ported tip (ports = hot-glow part)
  markerBarrel(P, I, RY, 0.14, 0.684, 0.0105, { ports: 0 });
  for (let k = 0; k < 3; k++) { const port = superEllipsoid(0.0118, 0.0022, 0.0034, 0.6, 0.6, 8, 4); PORTS.add(at(port, 0, RY, 0.636 + k * 0.014), C.darker, M.satin); }
  const guard = superEllipsoid(0.0178, 0.02, 0.1, 0.42, 0.56, 12, 8); P.add(at(guard, 0, 0.05, 0.23), MK.body, M.satin);
  for (let i = 0; i < 4; i++) { const c = torus(0.0158, 0.0036, 5, 14); G.add(at(c, 0, RY, 0.365 + i * 0.047), '#ffffff'); }
  P.add(at(latheZ([[0.0128, 0.343], [0.0134, 0.35], [0.0134, 0.522], [0.0128, 0.53]], 12), 0, RY, 0), C.darker, M.metal);
  // pump sleeve under the barrel (left hand)
  P.add(at(latheZ(smoothProfile([[0.0, 0.176], [0.0112, 0.178], [0.0132, 0.186], [0.0134, 0.236], [0.0128, 0.252], [0.0, 0.256]], 8), 12), 0, 0.004, 0), C.rubber, M.rubber);
  for (let k = 0; k < 5; k++) P.add(at(torus(0.0135, 0.0011, 3, 12), 0, 0.004, 0.19 + k * 0.011), C.darker, M.satin);
  P.add(at(superEllipsoid(0.008, 0.012, 0.03, 0.5, 0.6, 6, 5), 0, 0.018, 0.216), C.dark, M.satin);
  // scope: tube, turrets, lens + sunshade, mounts
  const scope = latheZ(smoothProfile([[0, -0.052], [0.0182, -0.051], [0.0196, -0.038], [0.0162, -0.022], [0.0162, 0.104], [0.021, 0.124], [0.0225, 0.158], [0.0205, 0.162], [0.0, 0.16]], 9), 14);
  P.add(at(scope, 0, 0.122, 0), MK.body, M.satin);
  LENS.add(at(superEllipsoid(0.0192, 0.0192, 0.003, 1, 1, 12, 4), 0, 0.122, 0.1605), C.lens, M.lens);
  EYE.add(at(superEllipsoid(0.0158, 0.0158, 0.0024, 1, 1, 10, 4), 0, 0.122, -0.0525), C.lens, M.lens);
  I.add(at(torus(0.0212, 0.0022, 3, 14), 0, 0.122, 0.157));
  for (const [dir, p] of [[new V3(0, 1, 0), new V3(0, 0.1375, 0.04)], [new V3(1, 0, 0), new V3(0.0155, 0.122, 0.04)]]) {
    const t = lathe([[0, 0], [0.0074, 0], [0.0076, 0.006], [0.0066, 0.0085], [0, 0.009]], 10); P.add(orient(t, dir, p), C.metal, M.metal);
  }
  for (const z of [-0.005, 0.085]) P.add(at(superEllipsoid(0.0092, 0.0162, 0.0105, 0.5, 0.6, 6, 5), 0, 0.102, z), C.dark, M.satin);
  // 10-round feed tube angled up off the left flank (team cap)
  {
    const d = new V3(0.62, 0.78, 0).normalize(), base = new V3(0.012, 0.084, 0.098);
    P.add(orient(lathe([[0, 0], [0.0112, 0], [0.0112, 0.075], [0, 0.075]], 12), d, base), C.gunmetal, M.metal);
    I.add(orient(lathe([[0, 0], [0.0138, 0], [0.0142, 0.012], [0.0112, 0.016], [0, 0.017]], 12), d, base.clone().addScaledVector(d, 0.072)));
    P.add(orient(torus(0.0122, 0.0026, 4, 12).rotateX(Math.PI / 2), d, base.clone().addScaledVector(d, 0.012)), C.darker, M.satin);
  }
  const glow = G.build();
  {
    const pz = glow.attributes.position, seg = new Float32Array(pz.count), TH = [0.22, 0.47, 0.72, 0.96];
    for (let i = 0; i < pz.count; i++) seg[i] = TH[Math.max(0, Math.min(3, Math.round((pz.getZ(i) - 0.365) / 0.047)))];
    glow.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  }
  return {
    kind: 'charger', body: P.build(), ink: I.build(), glow,
    parts: {
      trigger: part(T, TRIGGER_PIVOT),
      bolt: part(BOLT, new V3(-0.0185, 0.079, -0.008)),
      lens: part(LENS, new V3(0, 0.122, 0.1605), 'lamp', { color: '#0b0f16', emissive: '#ffffff', intensity: 0.2, roughness: 0.06 }),
      eyepiece: part(EYE, new V3(0, 0.122, -0.0525), 'lamp', { color: '#0b0f16', emissive: '#ffffff', intensity: 0.05, roughness: 0.06 }),
      ports: part(PORTS, new V3(0, RY, 0.65), 'lamp', { color: '#1b1e25', emissive: '#ffffff', intensity: 0, roughness: 0.5 }),
    },
    muzzle: new V3(0, RY, 0.686),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.004, 0.214), handZ: new V3(0, 0, 1), handY: new V3(0.75, -0.62, -0.1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- blaster
function buildBlaster() {
  const P = new Parts(), I = new Parts(), T = new Parts(), PUMP = new Parts(), NEEDLE = new Parts(), BULB = new Parts();
  pistolGrip(P, { baseCol: C.dark, T });
  const TY = 0.092;
  // receiver block under the tube
  P.add(at(superEllipsoid(0.02, 0.022, 0.07, 0.3, 0.4, 10, 6), 0, 0.05, 0.02), MK.body2, M.satin);
  // fat launch tube with reinforcing rings, team bands and a flared, lipped muzzle
  P.add(latheZ(smoothProfile([[0, -0.052], [0.036, -0.052], [0.043, -0.044], [0.044, -0.03]], 6).concat([[0.044, 0.25], [0.047, 0.262], [0.05, 0.29], [0.049, 0.302], [0.044, 0.304], [0.039, 0.296], [0.038, 0.26], [0.0, 0.258]]), 22).translate(0, TY, 0), MK.body, M.satin);
  for (const z of [0.02, 0.1, 0.18]) P.add(at(torus(0.0448, 0.003, 4, 22), 0, TY, z), MK.anod, M.metal);
  for (const z of [0.06, 0.14]) I.add(at(latheZ([[0.0452, z - 0.012], [0.0452, z + 0.012]], 22), 0, TY, 0));
  I.add(at(torus(0.049, 0.0035, 5, 22), 0, TY, 0.3));
  // the paint grenade's nose seated in the muzzle ('bulb': squeezes / rebounds on each shot)
  BULB.add(at(superEllipsoid(0.034, 0.034, 0.03, 0.9, 1, 16, 10, (q) => { if (q.z < 0) q.z *= 0.4; }), 0, TY, 0.272));
  P.add(at(torus(0.034, 0.0028, 4, 18), 0, TY, 0.268), C.darker, M.satin);
  // rear cap with the pressure gauge (needle part)
  P.add(at(superEllipsoid(0.04, 0.04, 0.012, 0.6, 0.9, 16, 7), 0, TY, -0.05), MK.body2, M.satin);
  const gauge = latheZ([[0, -0.006], [0.0128, -0.006], [0.0132, 0.0], [0.011, 0.002], [0, 0.002]], 14); P.add(at(gauge, 0, TY, -0.058), C.metal, M.metal);
  P.add(at(superEllipsoid(0.0105, 0.0105, 0.001, 1, 1, 12, 4), 0, TY, -0.0605), C.white, M.gloss);
  for (let k = 0; k < 9; k++) {
    const a = -2.18 + (k / 8) * 4.36, major = k % 2 === 0, len = major ? 0.0028 : 0.0017;
    const tk = superEllipsoid(major ? 0.00055 : 0.0004, len / 2, 0.0003, 1, 1, 4, 4);
    tk.translate(0, 0.0083 - len / 2, 0); tk.rotateZ(a); P.add(at(tk, 0, TY, -0.0617), C.darker, M.print);
  }
  const red = torus(0.0079, 0.0007, 3, 10, 0.7); red.rotateZ(Math.PI / 2 + 1.5); P.add(at(red, 0, TY, -0.0617), C.red, M.print);
  const needle = superEllipsoid(0.00085, 0.0046, 0.00045, 0.7, 0.8, 5, 5, (q) => { q.x *= 1 - 0.75 * Math.max(0, q.y / 0.0046); });
  needle.translate(0, 0.0036, 0); NEEDLE.add(at(needle, 0, TY, -0.0621), C.red, M.gloss);
  const hub = lathe([[0, 0], [0.0014, 0], [0.0013, 0.0007], [0, 0.0011]], 8); hub.rotateX(-Math.PI / 2); NEEDLE.add(at(hub, 0, TY, -0.0619), C.dark, M.gloss);
  // ladder sight + carry rail on top, hazard chevrons on the flanks
  P.add(at(superEllipsoid(0.0078, 0.006, 0.07, 0.5, 0.6, 8, 5), 0, TY + 0.047, 0.1), MK.body2, M.satin);
  const ladder = superEllipsoid(0.012, 0.014, 0.003, 0.35, 0.4, 8, 5, (q) => { if (Math.abs(q.x) < 0.007 && q.y > -0.006) q.z *= 0.3; });
  P.add(at(ladder, 0, TY + 0.06, 0.03), C.darker, M.satin);
  P.add(at(superEllipsoid(0.0035, 0.009, 0.004, 0.5, 0.5, 6, 4), 0, TY + 0.056, 0.2), C.darker, M.satin);
  for (const sx of [1, -1]) for (const s of chevronShape(0.04, 0.012, 3, 0.45)) { const g = decal(s); placeXY(g, new V3(0, 0, sx), new V3(0, 1, 0), new V3(sx * 0.0447, TY - 0.006, sx > 0 ? 0.2 : 0.16)); P.add(g, C.hazard, M.print); }
  // pump foregrip for the left hand + slide tube
  P.add(at(latheZ([[0, 0.04], [0.0092, 0.04], [0.0092, 0.19], [0, 0.19]], 10), 0, 0.012, 0), C.metal, M.metal);
  P.add(at(latheZ([[0.0092, 0.188], [0.0118, 0.19], [0.0118, 0.196], [0.0092, 0.198]], 12), 0, 0.012, 0), C.dark, M.gloss);
  PUMP.add(at(latheZ(smoothProfile([[0.0, 0.118], [0.0118, 0.12], [0.0138, 0.128], [0.0138, 0.176], [0.0126, 0.186], [0.0, 0.188]], 8), 12), 0, 0.012, 0), C.rubber, M.rubber);
  for (let k = 0; k < 4; k++) PUMP.add(at(torus(0.0139, 0.0012, 3, 12), 0, 0.012, 0.134 + k * 0.012), C.darker, M.satin);
  PUMP.add(at(superEllipsoid(0.007, 0.018, 0.012, 0.5, 0.6, 6, 6), 0, 0.03, 0.152), C.dark, M.satin);
  return {
    kind: 'blaster', body: P.build(), ink: I.build(),
    parts: {
      trigger: part(T, TRIGGER_PIVOT),
      pump: part(PUMP, new V3(0, 0.012, 0.152)),
      needle: part(NEEDLE, new V3(0, TY, -0.062)),
      bulb: part(BULB, new V3(0, TY, 0.272), 'ink'),
    },
    muzzle: new V3(0, TY, 0.305),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.012, 0.152), handZ: new V3(0, 0, 1), handY: new V3(0.8, -0.55, -0.1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- dualies (one pistol)
// Compact magazine-fed paintball pistol per hand: polymer frame + rail, dark slide that snaps back on every shot of its
// own hand (team stripes ride on it), threaded ported barrel, team magazine base plate under the grip, rear LED.
function buildDualies() {
  const P = new Parts(), I = new Parts(), T = new Parts(), SL = new Parts(), SLI = new Parts(), LED = new Parts();
  pistolGrip(P, { T, baseCol: C.dark });
  const frame = superEllipsoid(0.0165, 0.0105, 0.072, 0.4, 0.5, 12, 6, (q) => { if (q.z > 0.05) q.y *= 1 - 0.25 * (q.z - 0.05) / 0.022; });
  P.add(at(frame, 0, 0.041, 0.034), MK.body2, M.satin);
  P.add(at(superEllipsoid(0.0095, 0.0035, 0.034, 0.4, 0.4, 8, 4), 0, 0.0282, 0.086), C.darker, M.satin);
  for (let k = 0; k < 4; k++) P.add(at(superEllipsoid(0.0102, 0.0012, 0.0022, 0.6, 0.6, 6, 4), 0, 0.0252, 0.072 + k * 0.009), C.gunmetal, M.metal);
  // magazine: extended base plate (team) below the grip + the CO2 key at the back
  const magBase = superEllipsoid(0.0148, 0.0085, 0.021, 0.4, 0.45, 10, 5); magBase.rotateX(Math.atan2(GRIP_AXIS.z, GRIP_AXIS.y));
  I.add(at(magBase, 0, -0.074, -0.021));
  P.add(at(superEllipsoid(0.0125, 0.008, 0.0175, 0.5, 0.5, 8, 4).rotateX(0.245), 0, -0.066, -0.019), MK.body, M.satin);
  // barrel (threaded, ported) + team tip ring
  P.add(at(latheZ([[0.0, 0.098], [0.0098, 0.098], [0.0098, 0.15], [0.0108, 0.153], [0.0108, 0.165], [0.0072, 0.166], [0.0, 0.162]], 12), 0, 0.0645, 0), C.gunmetal, M.metal);
  for (let k = 0; k < 3; k++) for (const sx of [1, -1]) P.add(at(superEllipsoid(0.001, 0.0022, 0.0022, 1, 1, 4, 4), sx * 0.0098, 0.0645, 0.14 - k * 0.011), C.darker, M.satin);
  I.add(at(torus(0.0106, 0.0022, 4, 14), 0, 0.0645, 0.162));
  // slide (moving): dark shell, serrations, sights, team side stripes (ink, rides along)
  const slide = superEllipsoid(0.0182, 0.0158, 0.078, 0.36, 0.52, 14, 8, (q) => { if (q.z > 0.05) q.y *= 1 - 0.22 * (q.z - 0.05) / 0.028; if (q.y > 0) q.x *= 1 - 0.1 * q.y / 0.0158; });
  SL.add(at(slide, 0, 0.0645, 0.03), MK.body, M.satin);
  for (const sx of [1, -1]) for (let k = 0; k < 5; k++) SL.add(at(superEllipsoid(0.0007, 0.0098, 0.0011, 0.8, 0.8, 4, 4), sx * 0.0178, 0.066, -0.043 + k * 0.0048), C.darker, M.satin);
  SL.add(at(superEllipsoid(0.0085, 0.0048, 0.0042, 0.4, 0.4, 6, 4, (q) => { if (q.y > 0.0015 && Math.abs(q.x) < 0.0024) q.y = 0.0015; }), 0, 0.0818, -0.036), C.darker, M.satin);
  SL.add(at(superEllipsoid(0.0018, 0.0048, 0.003, 0.6, 0.6, 5, 4), 0, 0.0806, 0.097), C.darker, M.satin);
  for (const sx of [1, -1]) SLI.add(at(superEllipsoid(0.0007, 0.0032, 0.042, 0.7, 0.7, 5, 6), sx * 0.018, 0.068, 0.04));
  SLI.add(at(superEllipsoid(0.0042, 0.0008, 0.03, 0.7, 0.7, 6, 3), 0, 0.0802, 0.03));
  for (const sx of [1, -1]) screw(P, new V3(sx * 0.0166, 0.043, 0.07), new V3(sx, 0, 0), 0.0022);
  // status LED on the back of the slide (faces the player)
  LED.add(at(superEllipsoid(0.0028, 0.0028, 0.0014, 1, 1, 8, 4), 0.009, 0.074, -0.049), C.green, M.led);
  P.add(at(torus(0.0032, 0.0008, 3, 10), 0.009, 0.074, -0.0484), C.darker, M.satin);
  return {
    kind: 'dualies', body: P.build(), ink: I.build(),
    parts: {
      trigger: part(T, TRIGGER_PIVOT),
      slide: part(SL, new V3(0, 0.0645, 0.03)),
      slideInk: part(SLI, new V3(0, 0.0645, 0.03), 'ink'),
      led: part(LED, new V3(0.009, 0.074, -0.049), 'lamp', { color: '#0f2a18', emissive: '#3dff7a', intensity: 1.3 }),
    },
    muzzle: new V3(0, 0.0645, 0.167),
    gripR: GRIP_PISTOL,
    gripL: GRIP_PISTOL,          // dual: the left hand holds its own pistol by the same grip (see getWeaponDef → dual)
    dual: true,
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- splatling
// "Stormline" full-auto marker: long receiver, big hopper whose back face carries the 8-segment rate meter (aSeg →
// makeCoilMaterial, faces the player, fills during spin-up), a long shrouded barrel ('barrels': recoils each ball),
// vertical foregrip, big air tank as the stock.
function buildSplatling() {
  const P = new Parts(), I = new Parts(), T = new Parts(), BAR = new Parts(), G = new Parts();
  pistolGrip(P, { T });
  const AX = 0.07;
  receiver(P, I, AX, 0.06, 0.0205, 0.03, 0.105);
  P.add(at(superEllipsoid(0.017, 0.012, 0.1, 0.4, 0.5, 12, 5), 0, 0.036, 0.06), MK.body2, M.satin);
  // big hopper + rate meter ring on its back
  const HY = 0.178, HZ = 0.035;
  hopper(P, I, 0, HY, HZ, 0.056, 0.05, 0.08, AX + 0.03, { neckZ: 0.02 });
  for (let i = 0; i < 8; i++) {
    const a0 = Math.PI / 2 - (i / 8) * Math.PI * 2 - 0.06, seg = torus(0.022, 0.0036, 4, 6, (Math.PI * 2) / 8 - 0.12);
    seg.rotateZ(a0 - (Math.PI * 2) / 8 + 0.12); G.add(at(seg, 0, HY - 0.004, HZ - 0.092), '#ffffff');
  }
  P.add(at(superEllipsoid(0.03, 0.03, 0.006, 0.7, 1, 16, 5), 0, HY - 0.004, HZ - 0.086), C.darker, M.satin);
  // long barrel + cooling shroud (one part: nudged back by every ball)
  markerBarrel(BAR, I, AX, 0.16, 0.466, 0.0108, { ports: 6 });
  BAR.add(at(latheZ(smoothProfile([[0.02, 0.165], [0.022, 0.17], [0.022, 0.3], [0.019, 0.31]], 6), 16), 0, AX, 0), MK.body2, M.satin);
  for (let k = 0; k < 6; k++) BAR.add(at(superEllipsoid(0.0224, 0.0026, 0.0085, 0.6, 0.6, 10, 4), 0, AX, 0.185 + k * 0.021), C.darker, M.satin);
  // vertical foregrip for the left hand
  const fg = superEllipsoid(0.0118, 0.03, 0.0132, 0.55, 0.65, 10, 8, (q) => { if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos((q.y / 0.0125) * Math.PI * 2); q.z -= 0.0012 * f; } });
  fg.rotateX(-0.12); P.add(at(fg, 0, 0.0, 0.152), C.darker, M.satin);
  P.add(at(superEllipsoid(0.0124, 0.019, 0.0095, 0.5, 0.55, 8, 6).rotateX(-0.12), 0, -0.004, 0.151), C.rubber, M.rubber);
  P.add(at(superEllipsoid(0.0134, 0.0042, 0.0152, 0.5, 0.5, 10, 4), 0, -0.031, 0.155), C.dark, M.gloss);
  // tank stock
  P.add(at(superEllipsoid(0.015, 0.019, 0.013, 0.4, 0.5, 8, 6), 0, AX + 0.004, -0.05), MK.body2, M.satin);
  airTank(P, I, AX + 0.004, -0.062, 0.19, 0.027, { butt: true });
  const glow = G.build();
  {
    const pz = glow.attributes.position, seg = new Float32Array(pz.count);
    for (let i = 0; i < pz.count; i++) {
      let a = Math.atan2(pz.getY(i) - (HY - 0.004), pz.getX(i)); let u = (Math.PI / 2 - a) / (Math.PI * 2); u -= Math.floor(u);
      seg[i] = (Math.floor(u * 8) + 1) / 8 - 0.02;
    }
    glow.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  }
  return {
    kind: 'splatling', body: P.build(), ink: I.build(), glow,
    parts: { trigger: part(T, TRIGGER_PIVOT), barrels: part(BAR, new V3(0, AX, 0.3)) },
    muzzle: new V3(0, AX, 0.468),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.0, 0.1515), handZ: new V3(0, 1, -0.12), handY: new V3(0.45, -0.05, -1) },
    twirl: new V3(0, 0.03, 0.05),
  };
}

const _cache = new Map();
const BUILDERS = { shooter: buildShooter, roller: buildRoller, charger: buildCharger, blaster: buildBlaster, dualies: buildDualies, slosher: buildSlosher, splatling: buildSplatling };
export const WEAPON_KINDS = Object.keys(BUILDERS);

/** Hand bone frame (wrist origin) expressed in weapon space, from a grip spec and that hand's grip-hole offset. */
function handInWeapon(grip, hole) {
  const Y = grip.handY.clone().normalize();
  const Z = grip.handZ.clone().addScaledVector(Y, -grip.handZ.dot(Y)).normalize();
  const X = new V3().crossVectors(Y, Z).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const pos = grip.pos.clone().sub(hole.clone().applyQuaternion(q));
  return { pos, quat: q };
}

// ---------------------------------------------------------------------------------------------- part animation
// Arsenal owns how weapon parts move; character.js owns the body. character.js calls animateWeapon(w, st) once per
// frame per held weapon instance (the main one, and the left-hand one for dual wield):
//   w  = the instance it built (def, parts, body/ink/bodyFar/inkFar, drum, coil, lamps; state lives on it)
//   st = { t, dt, color, near,                      // clock, frame dt, team colour, near-LOD flag (false → merged far mesh)
//          hand,                                    // 0 = main (right) instance, 1 = left-hand instance (dual wield)
//          runner,                                  // the actor's WeaponRunner (null in labs/menus) — read-only (charging, streaming,
//                                                   //   burstFrac, sinceHand[2], dodge, lockT … see weapons.js)
//          sinceShoot, sinceFlick, sinceRelease,    // seconds since trigger 'shoot' / 'flick' / 'charge_release'
//          charge, full, chargeFlash, lowInk,       // smoothed charge 0..1, at-full flag, release flash 0..1, low-ink weight 0..1
//          firing, rolling, grounded, groundSpeed,  // AnimState bits (rolling = roller push weight 0..1)
//          worldQuat }                              // world quaternion of the weapon (w.off) — liquid surfaces stay level
// Writes: part transforms, lamp/coil uniforms, LOD visibility, and w.pump (0..1 blaster pump stroke — the body's left
// hand should ride it) + w.trig (0..1 trigger squeeze — the index finger can follow).
const _aq = new THREE.Quaternion(), _aq2 = new THREE.Quaternion(), _av = new V3(), _av2 = new V3(), _aw = new THREE.Color(1, 1, 1);
const _UPV = new V3(0, 1, 0);
const pulseE = (t, atk, dec) => (t < 0 ? 0 : t < atk ? t / atk : Math.exp(-(t - atk) * dec));
const mjE = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * t * (10 + t * (6 * t - 15)); };
const dampE = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
function sprE(S, i, target, hz, zeta, dt) {   // exact damped spring (stable for any damping / step)
  const w = Math.PI * 2 * hz, x0 = S[i] - target, v0 = S[i + 1];
  let x, v;
  if (zeta < 0.999) {
    const wd = w * Math.sqrt(1 - zeta * zeta), e = Math.exp(-zeta * w * dt), c = Math.cos(wd * dt), sn = Math.sin(wd * dt), B = (v0 + zeta * w * x0) / wd;
    x = e * (x0 * c + B * sn); v = e * ((-zeta * w * x0 + wd * B) * c + (-zeta * w * B - wd * x0) * sn);
  } else { const e = Math.exp(-w * dt), B = v0 + w * x0; x = e * (x0 + B * dt); v = e * (v0 - w * B * dt); }
  S[i] = x + target; S[i + 1] = v; return S[i];
}

export function animateWeapon(w, st) {
  const d = w.def, P = w.parts || {}, kind = d.kind, t = st.t, dt = Math.min(0.1, Math.max(0, st.dt || 0)), col = st.color;
  if (!w.ps) { w.ps = new Float32Array(12); w.ps[0] = 1.3; w.pump = 0; w.trig = 0; w.heat = 0; w.drumW = 0; w.drumA = 0; w.spinW = 0; w.spinA = 0; w.near = true; }
  const ps = w.ps, R = st.runner;
  // per-instance shot clock: dual wield keeps one per hand (runner.sinceHand = [right, left] seconds since that hand fired)
  let ts = st.sinceShoot ?? 99;
  if (d.dual && R && R.sinceHand) ts = R.sinceHand[st.hand || 0];
  // near/far LOD
  const near = st.near !== false;
  if (near !== w.near) {
    w.near = near;
    if (w.body) w.body.visible = near; if (w.ink) w.ink.visible = near;
    if (w.bodyFar) w.bodyFar.visible = !near; if (w.inkFar) w.inkFar.visible = !near;
    for (const g of w.partList || []) g.visible = near;
  }
  // roller drum: rolls with the ground, coasts down, gets flung round by the flick
  if (w.drum) {
    if ((st.rolling || 0) > 0.3 && st.grounded) w.drumW = (st.groundSpeed || 0) / (d.drumR || 0.1);
    else w.drumW *= Math.exp(-dt * 2.2);
    const ft = st.sinceFlick ?? 99;
    if (ft >= 0.15 && ft - dt < 0.15) w.drumW += 34;
    w.drumA += w.drumW * dt;
    w.drum.rotation.x = w.drumA;
  }
  const u = st.sinceShoot ?? 99;
  if (kind === 'blaster') {   // pump stroke — computed at every distance (the body's left hand rides it)
    let pk = 0;
    if (u < 0.6) pk = u < 0.14 ? 0 : u < 0.29 ? mjE((u - 0.14) / 0.15) : u < 0.33 ? 1 : u < 0.46 ? 1 - mjE((u - 0.33) / 0.13) : -0.1 * Math.sin(Math.PI * Math.min(1, (u - 0.46) / 0.12));
    w.pump = pk;
  }
  if (w.coil) {                 // charger coil / splatling meter (always drawn — a charging weapon is a tell at any range)
    const cu = w.coil.userData.u;
    let ch = st.charge || 0, full = st.full ? 1 : 0;
    if (kind === 'splatling' && R) { ch = R.charging ? R.charge : R.streaming ? R.burstFrac : 0; full = R.charging && R.charge >= 0.999 ? 1 : 0; }
    cu.uCharge.value = ch; cu.uFull.value = full; cu.uFlash.value = st.chargeFlash || 0; cu.uTime.value = t;
  }
  if (!near) return;
  const shotK = pulseE(ts, 0.006, 30);
  if (P.trigger) {
    const want = kind === 'charger' ? ((st.charge || 0) > 0.01 ? 1 : 0) : kind === 'splatling' ? (R ? (R.charging || R.streaming ? 1 : 0) : (st.firing ? 1 : 0))
      : kind === 'blaster' || kind === 'dualies' ? (ts < 0.07 ? 1 : 0) : (st.firing && u < 0.16 ? 1 : 0);
    w.trig = dampE(w.trig, want, want > w.trig ? 45 : 22, dt);
    P.trigger.rotation.x = 0.42 * w.trig;
  }
  if (kind === 'shooter') {
    P.bolt.position.z = P.bolt.userData.rest.z - 0.0095 * shotK;
    const ck = pulseE(ts, 0.01, 18);
    P.can.scale.set(1 + 0.02 * ck, 1 - 0.03 * ck, 1 + 0.02 * ck);   // hopper dome: balls drop into the neck
    ledShot(P.led, st, shotK, t);
  } else if (kind === 'dualies') {
    // each pistol's slide snaps back 13 mm on its own shot and rides home; LED blinks per shot / red when low
    const k = pulseE(ts, 0.005, 26);
    P.slide.position.z = P.slide.userData.rest.z - 0.013 * k;
    P.slideInk.position.z = P.slideInk.userData.rest.z - 0.013 * k;
    ledShot(P.led, st, k, t);
  } else if (kind === 'blaster') {
    P.pump.position.z = P.pump.userData.rest.z - 0.036 * w.pump;
    const dep = u < 0.36;
    const needle = sprE(ps, 0, dep ? -1.95 : 1.3, dep ? 9 : 4.2, dep ? 0.55 : 0.28, dt);
    P.needle.rotation.z = needle + 0.018 * Math.sin(t * 41) * (u > 0.6 ? 1 : 0.3);
    if (ts < dt * 1.5) ps[3] -= 7;
    if (u >= 0.33 && u - dt < 0.33) ps[3] += 4.5;
    const bq = Math.max(-0.3, Math.min(0.3, sprE(ps, 2, 0, 7, 0.22, dt)));
    P.bulb.scale.set(1 - 0.35 * bq, 1 - 0.35 * bq, 1 + 0.9 * bq);
  } else if (kind === 'charger') {
    const ch = st.charge || 0, full = st.full ? 1 : 0;
    const btg = -0.03 * Math.min(1, Math.max(0, ch));
    const bolt = sprE(ps, 4, btg, btg < ps[4] ? 5 : 16, 0.32, dt);
    P.bolt.position.z = P.bolt.userData.rest.z + Math.min(0.004, Math.max(-0.034, bolt));
    const lm = P.lens.userData.mesh.material;
    lm.emissive.copy(col).lerp(_aw, 0.25 * full);
    lm.emissiveIntensity = 0.12 + 3.2 * ch * ch + full * (1.2 + 0.8 * Math.sin(t * 31)) + 5 * (st.chargeFlash || 0);
    const em = P.eyepiece.userData.mesh.material;
    em.emissive.copy(col); em.emissiveIntensity = 0.04 + 0.9 * ch * ch + 0.6 * full;
    const rel = st.sinceRelease ?? 99;
    if (rel < dt * 1.5) w.heat = 1;
    w.heat *= Math.exp(-dt * 3.2);
    const pm = P.ports.userData.mesh.material;
    pm.emissive.copy(col).lerp(_aw, 0.5 * w.heat); pm.emissiveIntensity = 6 * w.heat * w.heat;
  } else if (kind === 'roller') {
    const m = P.led.userData.mesh.material;
    m.emissiveIntensity = (st.rolling || 0) > 0.3 ? 0.5 + 2.6 * (Math.sin(t * Math.PI * 8) > 0 ? 1 : 0.15) : 0.45;
  } else if (kind === 'slosher') {
    // the ink surface stays level against the swing (a lagging, ringing liquid, clamped to the rim), dips as each
    // throw empties the bucket and wells back up; the thumb lever trips as the ink leaves
    const s = P.surface;
    if (st.worldQuat) {
      _av.copy(_UPV).applyQuaternion(st.worldQuat);                     // bucket axis in world
      _aq.setFromUnitVectors(_av, _UPV);                                 // world tilt that would level the surface
      _aq2.copy(st.worldQuat).invert().multiply(_aq).multiply(st.worldQuat);   // … expressed in bucket space
      _av2.set(_aq2.x, _aq2.y, _aq2.z); const sn = _av2.length();
      let ang = 2 * Math.atan2(sn, _aq2.w); if (ang > Math.PI) ang -= Math.PI * 2;
      const lim = 0.6, a = Math.max(-lim, Math.min(lim, ang));
      if (sn > 1e-5) _av2.multiplyScalar(1 / sn); else _av2.set(1, 0, 0);
      sprE(ps, 6, _av2.x * a, 2.2, 0.16, dt); sprE(ps, 8, _av2.z * a, 2.2, 0.16, dt);
    }
    s.rotation.set(ps[6], 0, ps[8]);
    const drain = u < 0.6 ? (u < 0.16 ? mjE(u / 0.16) : 1 - mjE((u - 0.16) / 0.44)) : 0;
    s.position.y = s.userData.rest.y - 0.034 * drain + 0.002 * Math.sin(t * 7.3);
    const rip = 1 + 0.02 * Math.sin(t * 11 + 1.3) * (0.3 + drain);
    s.scale.set(rip * (1 - 0.1 * drain), 1, (2 - rip) * (1 - 0.1 * drain));
    P.lever.rotation.x = -0.4 * (u < 0.3 ? 1 - mjE(Math.max(0, u - 0.18) / 0.12) : 0);
  } else if (kind === 'splatling') {
    // barrel cluster: spins up with the charge, screams while it streams, spins down with inertia
    let want = 0;
    if (R) want = R.charging ? 14 + 46 * R.charge : R.streaming ? 64 : 0;
    else want = st.firing ? 30 + 30 * (st.charge || 0) : 0;
    w.spinW = dampE(w.spinW, want, want > w.spinW ? 5 : 1.6, dt);
    w.spinA = (w.spinA + w.spinW * dt) % (Math.PI * 2);   // (BREAKOUT: single barrel — the spin only feeds the buzz)
    P.barrels.rotation.z = 0;
    P.barrels.position.z = P.barrels.userData.rest.z - 0.004 * shotK;   // each round nudges the cluster back
  }
}
function ledShot(g, st, k, t) {
  if (!g) return;
  const m = g.userData.mesh.material;
  if ((st.lowInk || 0) > 0.5) { m.emissive.setRGB(1, 0.16, 0.1); m.emissiveIntensity = 0.4 + 2.2 * (0.5 + 0.5 * Math.sin(t * Math.PI * 6.4)); }
  else { m.emissive.setRGB(0.24, 1, 0.48); m.emissiveIntensity = 1.1 + 4 * k; }
}

// ---------------------------------------------------------------------------------------------- sub: splat bomb prop
/** Hand-held splat bomb (held by its knurled cap in the LEFT fist while the sub is aimed).
 *  Bomb space: cap handle axis along +Y through the origin; ink bulb hangs below. */
function buildBomb() {
  const P = new Parts(), I = new Parts();
  P.add(lathe(smoothProfile([[0, -0.014], [0.0118, -0.014], [0.0128, -0.008], [0.0128, 0.009], [0.0104, 0.0145], [0, 0.0155]], 8), 14), C.rubber, M.rubber);
  P.add(lathe([[0, 0.015], [0.0048, 0.015], [0.0048, 0.021], [0.0062, 0.0225], [0, 0.024]], 8), C.metal, M.metal);
  P.add(lathe(smoothProfile([[0, -0.03], [0.022, -0.029], [0.0215, -0.019], [0.0142, -0.0145], [0, -0.014]], 6), 16), C.dark, M.gloss);
  const bulb = lathe(smoothProfile([[0, -0.118], [0.03, -0.114], [0.047, -0.098], [0.052, -0.074], [0.046, -0.05], [0.031, -0.034], [0.0185, -0.027], [0, -0.026]], 14), 20);
  I.add(bulb);
  // paint grenade: a taped bladder — two dark retaining bands and a pull-ring at the cap (BREAKOUT)
  for (const y of [-0.052, -0.09]) P.add(at(torus(0.05, 0.0035, 5, 20), 0, 0, 0).rotateX(Math.PI / 2).translate(0, y, 0), C.darker, M.satin);
  P.add(at(torus(0.009, 0.0016, 4, 12), 0.012, 0.012, 0).rotateY(Math.PI / 2), C.metal, M.metal);
  const led = superEllipsoid(0.0028, 0.0028, 0.0028, 1, 1, 8, 5); P.add(at(led, 0, -0.022, 0.0205), C.red, M.led);
  return { kind: 'bomb', body: P.build(), ink: I.build(), grip: { pos: new V3(0, 0, 0), handZ: new V3(0, 1, 0), handY: new V3(0.3, 0.1, -1) } };
}
const _subCache = new Map();
/** Sub-weapon prop for the LEFT hand: { body, ink, handL:{pos,quat} (hand in prop space), inHandL:{pos,quat} (prop in hand space) }.
 *  Attach like a weapon: prop group under handL at inHandL (plastic body + team ink material). */
export function getSubDef(kind = 'bomb') {
  if (!_subCache.has(kind)) {
    const d = buildBomb();
    d.handL = handInWeapon(d.grip, GRIP_HOLE_L);
    const inv = new THREE.Matrix4().compose(d.handL.pos, d.handL.quat, new V3(1, 1, 1)).invert();
    d.inHandL = { pos: new V3(), quat: new THREE.Quaternion() };
    inv.decompose(d.inHandL.pos, d.inHandL.quat, new V3());
    _subCache.set(kind, d);
  }
  return _subCache.get(kind);
}

/** Split a builder's output: bodyStatic/inkStatic (never move), parts re-centred on their pivots, and body/ink = the
 *  complete weapon at rest (static + parts merged in place) for tools that render it whole. */
function finishParts(d) {
  d.bodyStatic = d.body; d.inkStatic = d.ink;
  const body = [d.body], ink = [d.ink];
  const parts = d.parts || {};
  for (const k in parts) {
    const p = parts[k];
    if (!p.src) continue;
    (p.mat === 'ink' ? ink : body).push(p.src);
    p.geo = p.src.clone().translate(-p.pivot.x, -p.pivot.y, -p.pivot.z);
    delete p.src;
  }
  d.body = body.length > 1 ? mergeGeometries(body.filter(Boolean), false) : d.body;
  d.ink = ink.length > 1 ? mergeGeometries(ink.filter(Boolean), false) : d.ink;
  d.parts = parts;
  return d;
}

export function getWeaponDef(kind) {
  if (!_cache.has(kind)) {
    const d = finishParts((BUILDERS[kind] || buildShooter)());
    d.handR = handInWeapon(d.gripR, GRIP_HOLE_R);
    d.handL = handInWeapon(d.gripL, GRIP_HOLE_L);
    // weapon relative to right hand bone
    const inv = new THREE.Matrix4().compose(d.handR.pos, d.handR.quat, new V3(1, 1, 1)).invert();
    d.inHand = { pos: new V3(), quat: new THREE.Quaternion() };
    inv.decompose(d.inHand.pos, d.inHand.quat, new V3());
    // dual wield: a second instance of the same weapon sits in the LEFT fist — inHandL = that weapon in left-hand space
    // (d.handL = the left hand frame in its own weapon's space). Attach like the main one, under handL.
    if (d.dual) {
      const invL = new THREE.Matrix4().compose(d.handL.pos, d.handL.quat, new V3(1, 1, 1)).invert();
      d.inHandL = { pos: new V3(), quat: new THREE.Quaternion() };
      invL.decompose(d.inHandL.pos, d.inHandL.quat, new V3());
    }
    _cache.set(kind, d);
  }
  return _cache.get(kind);
}
