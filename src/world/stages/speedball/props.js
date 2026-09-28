// Breakpoint Field — stage prop pack + placements (owner: the speedball stage; see layout.js for the folder contract).
//
// register(D, H): this stage's prop builders (types prefixed 'speedball_'), same contract as the cargo pack: H carries
// THREE + the kit helpers, parts merge into the kit's material buckets, tiny parts go through H.noShadow. PLACEMENTS:
// the set dressing (Alpha's half, mirrored (x,z) → (-x,-z) unless `mirror: false`).
//
// Everything here stands outside the field of play except the netting (its colliders are the field's walls: solid, never
// inkable, an off-limits top) and the start stations (no collider: they stand on the back line inside the spawn).
// Cheap on triangles: flat panels, boxes and low-segment tubes; the net itself is one alpha-tested plane per bay.
import { NET } from './layout.js';

const P = Math.PI;

export function register(D, H) {
  const { THREE, HP, TAU } = H;
  const NS = (m) => (m === 'glow' || m === 'blob' ? m : H.noShadow ? H.noShadow(m) : m);
  const K = {
    net: '#15171b', pole: '#23262b', alu: '#b9c0c6', aluDk: '#8e979f', rubber: '#1d1f23', white: '#eeede8',
    red: '#d4382c', yellow: '#efbd2e', blue: '#2b5cb8', orange: '#e86f25', teal: '#1f9a96', charcoal: '#33363c',
    lamp: '#ffe9bf', amber: '#ffb13b', canvas: '#e9e6dc',
  };
  const plane = (w, h) => new THREE.PlaneGeometry(w, h);
  // square pyramid frustum (canopy roofs): bottom w × w at y = 0, top t × t at y = h, open bottom
  const TPL = new Map();
  const roofGeo = (w, t, h) => {
    const key = `${w}|${t}|${h}`;
    let g = TPL.get(key);
    if (g) return g;
    const p = [], n = [], idx = [];
    const b = [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]], u = b.map(([x, z]) => [(x * t) / w, (z * t) / w]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, mx = (b[i][0] + b[j][0]) / 2, mz = (b[i][1] + b[j][1]) / 2, l = Math.hypot(mx, mz);
      const s = (w - t) / 2, nl = Math.hypot(h, s), ny = s / nl, nh = h / nl;
      const o = p.length / 3;
      for (const [x, y, z] of [[b[i][0], 0, b[i][1]], [b[j][0], 0, b[j][1]], [u[j][0], h, u[j][1]], [u[i][0], h, u[i][1]]]) { p.push(x, y, z); n.push((mx / l) * nh, ny, (mz / l) * nh); }
      idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    }
    const o = p.length / 3;
    for (const [x, z] of u) { p.push(x, h, z); n.push(0, 1, 0); }
    idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((p.length / 3) * 2).fill(0), 2));
    g.setIndex(idx);
    TPL.set(key, g);
    return g;
  };
  // feather flag sail: a tall teardrop (pole side straight, fly side curved), in the local XY plane from x = 0
  const sailGeo = (Hh, W) => {
    const key = `sail|${Hh}|${W}`;
    let g = TPL.get(key);
    if (g) return g;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(0, Hh);
    sh.bezierCurveTo(W * 0.55, Hh * 1.02, W * 1.05, Hh * 0.9, W, Hh * 0.62);
    sh.bezierCurveTo(W * 0.96, Hh * 0.3, W * 0.5, Hh * 0.06, 0, 0);
    g = new THREE.ShapeGeometry(sh, 8);
    TPL.set(key, g);
    return g;
  };

  // ------------------------------------------------------------------------------------------ safety netting
  D.speedball_net = {
    desc: 'Tournament safety netting: black steel poles every ~4.5 m, knotted black net (alpha-tested) to `height`, a top cable and a dark turf skirt. Runs from pos along local +X. Collider: the whole run (solid, off-limits top).',
    params: { length: 'm', height: 'm (5.2)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 10, Hh = o.height ?? NET.h;
      const np = Math.max(1, Math.round(L / 4.5)), pw = L / np;
      for (let i = 0; i <= np; i++) {
        const x = i * pw;
        B.cyl('metal', K.pole, 0.055, Hh + 0.3, x, (Hh + 0.3) / 2, 0, { seg: 8, open: true });
        B.sph(NS('metal'), K.pole, 0.06, x, Hh + 0.3, 0, { ws: 8, hs: 4 });
        B.box(NS('paint'), K.rubber, 0.3, 0.1, 0.3, x, 0.05, 0, { r: 0.02 });
      }
      // one net panel per bay (double-sided alpha-tested diamond mesh), top cable, bottom skirt strip
      for (let j = 0; j < np; j++) {
        const xm = (j + 0.5) * pw;
        B.add('fence', plane(pw, Hh - 0.25), K.net, xm, 0.25 + (Hh - 0.25) / 2, 0, { uvs: [pw / 0.14, (Hh - 0.25) / 0.14] });
        B.add(NS('rubber'), plane(pw, 0.3), K.rubber, xm, 0.15, 0.012, {});
        B.add(NS('rubber'), plane(pw, 0.3), K.rubber, xm, 0.15, -0.012, { ry: P });
      }
      B.cyl(NS('metal'), K.pole, 0.012, L, L / 2, Hh, 0, { rz: HP, seg: 4, open: true });
      B.cyl(NS('metal'), K.pole, 0.01, L, L / 2, Hh * 0.52, 0, { rz: HP, seg: 4, open: true });
      B.col(0, 0, -0.08, L, Hh + 0.3, 0.08, { roof: true });
    },
  };

  // ------------------------------------------------------------------------------------------ start station
  D.speedball_station = {
    desc: 'Start station on the back line: a padded black post with a white hand plate and the team pennant on a whip. Faces +Z. team: 0|1.',
    params: { team: '0|1' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('paint', K.charcoal, 0.42, 1.05, 0.42, 0, 0.525, 0, { round: true, r: 0.12 });
      B.box('paint', K.white, 0.3, 0.22, 0.06, 0, 0.82, 0.2, { r: 0.03 });
      B.box(NS('paint'), K.rubber, 0.62, 0.08, 0.62, 0, 0.04, 0, { r: 0.03 });
      B.cyl(NS('metal'), K.pole, 0.012, 1.6, 0, 1.05 + 0.8, -0.12, { seg: 5, open: true });
      B.flag(0, 2.55, -0.12, { team: o.team ?? 0, s: 0.55 });
      B.blob(0.9, 0.9);
    },
  };

  // ------------------------------------------------------------------------------------------ bleachers
  D.speedball_bleacher = {
    desc: 'Aluminium spectator bleacher: `rows` stepped seat + foot planks on A-frames every ~2.4 m, back + side rails. Centred on pos along local X, seats face +Z.',
    params: { length: 'm (10)', rows: 'count (5)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 10, n = o.rows ?? 5, rise = 0.38, run = 0.72;
      const nf = Math.max(2, Math.round(L / 2.4) + 1);
      const depth = n * run;
      for (let i = 0; i < nf; i++) {
        const x = -L / 2 + 0.15 + (i / (nf - 1)) * (L - 0.3);
        const top = 0.45 + (n - 1) * rise;
        B.push(x, 0, 0);
        // stringer from the front foot up to the back post, back post, cross brace
        const a = [0, 0.1, 0.4], b = [0, top, -depth + 0.4];
        const dx = b[2] - a[2], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        B.box('metal', K.aluDk, 0.06, 0.14, len, 0, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { rx: Math.atan2(dy, -dx), r: 0.015 });
        B.box('metal', K.aluDk, 0.07, top + 1.0, 0.07, 0, (top + 1.0) / 2, -depth + 0.35, { r: 0.015 });
        B.box(NS('metal'), K.aluDk, 0.05, 0.05, depth - 0.4, 0, 0.3, -depth / 2 + 0.2, { rx: -0.42, r: 0.01 });
        B.pop();
      }
      for (let r = 0; r < n; r++) {
        const y = 0.45 + r * rise, z = -r * run;
        B.box('metal', K.alu, L, 0.05, 0.26, 0, y, z - 0.12, { r: 0.015 });
        B.box(NS('metal'), K.alu, L, 0.035, 0.24, 0, y - rise * 0.55, z + 0.18, { r: 0.012 });
      }
      const top = 0.45 + (n - 1) * rise;
      B.box('metal', K.alu, L, 0.05, 0.05, 0, top + 0.95, -depth + 0.35, { r: 0.015 });
      B.box(NS('metal'), K.alu, L, 0.04, 0.04, 0, top + 0.5, -depth + 0.35, { r: 0.012 });
      for (const sx of [-1, 1]) B.box(NS('metal'), K.alu, 0.04, 0.04, depth, sx * L / 2, top * 0.5 + 1.0, -depth / 2 + 0.3, { rx: Math.atan2(top, depth) * 0.9, r: 0.01 });
    },
  };

  // ------------------------------------------------------------------------------------------ pit tent
  D.speedball_tent = {
    desc: 'Pop-up pit canopy (3 × 3 m): four legs, pyramid roof with a valance, a folding table with pods + a gear bag under it. Faces +Z.',
    params: { color: 'canopy', trim: 'valance', size: 'm (3)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const S = o.size ?? 3, c = o.color ?? K.red, tr = o.trim ?? K.white, eave = 2.25;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        B.box('metal', K.alu, 0.05, eave, 0.05, sx * (S / 2 - 0.05), eave / 2, sz * (S / 2 - 0.05), { r: 0.01 });
        B.box(NS('paint'), K.charcoal, 0.14, 0.04, 0.14, sx * (S / 2 - 0.05), 0.02, sz * (S / 2 - 0.05), { r: 0.01 });
      }
      B.add('foliage', roofGeo(S + 0.1, 0.25, 0.75), c, 0, eave, 0, {});   // (double-sided: the roof's underside shows)
      for (let k = 0; k < 4; k++) {
        const a = (k * P) / 2;
        B.push(0, eave - 0.14, 0, a);
        B.box('paint', tr, S + 0.1, 0.28, 0.02, 0, 0, S / 2 + 0.05, { r: 0.008 });
        B.pop();
      }
      // folding table, paint pods, gear bag, a cooler
      B.box('paint', K.white, 1.8, 0.04, 0.7, 0, 0.74, -0.6, { r: 0.015 });
      for (const sx of [-0.8, 0.8]) B.box(NS('metal'), K.aluDk, 0.04, 0.72, 0.6, sx, 0.36, -0.6, { r: 0.01 });
      for (let i = 0; i < 6; i++) B.cyl(NS('gloss'), [K.yellow, K.blue, K.white, K.red][i % 4], 0.035, 0.2, -0.6 + i * 0.13, 0.86, -0.5 + (i % 2) * 0.12, { seg: 6 });
      B.box('paint', K.charcoal, 0.9, 0.38, 0.4, 0.7, 0.19, 0.6, { round: true, r: 0.1, ry: 0.3 });
      B.box('gloss', K.teal, 0.55, 0.38, 0.36, -0.9, 0.19, 0.5, { r: 0.05, ry: -0.2 });
      B.blob(S + 0.6, S + 0.6);
    },
  };

  // ------------------------------------------------------------------------------------------ feather flag
  D.speedball_featherflag = {
    desc: 'Feather flag: a tall teardrop sail on a black whip pole in a ground stake. `color` = sail, `color2` = its edge band.',
    params: { height: 'm (3.6)', color: 'sail', color2: 'band' }, variants: 1, mount: 'ground',
    build(B, o) {
      const Hh = o.height ?? 3.6, c = o.color ?? K.red, c2 = o.color2 ?? K.white;
      B.cyl('metal', K.pole, 0.018, Hh + 0.2, 0, (Hh + 0.2) / 2, 0, { seg: 5, open: true });
      B.add('foliage', sailGeo(Hh - 0.5, 0.75), c, 0.02, 0.5, 0, {});
      B.add(NS('foliage'), sailGeo(Hh - 0.5, 0.75), c2, 0.02, 0.5, 0.004, { sx: 0.2 });   // pole-side band
      B.blob(0.4, 0.4);
    },
  };

  // ------------------------------------------------------------------------------------------ scoreboard
  D.speedball_scoreboard = {
    desc: 'Field scoreboard on two posts: black cabinet, amber 7-segment round clock and the two team scores (glow), a white header band. Faces +Z.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const W = 3.2, Hh = 1.4, y0 = 2.2;
      for (const sx of [-1, 1]) B.box('metal', K.pole, 0.12, y0 + 0.2, 0.12, sx * 1.2, (y0 + 0.2) / 2, -0.1, { r: 0.02 });
      B.box('paint', K.charcoal, W, Hh, 0.25, 0, y0 + Hh / 2, 0, { r: 0.04 });
      B.box('paint', K.white, W - 0.1, 0.26, 0.02, 0, y0 + Hh - 0.2, 0.13, { r: 0.01 });
      // digits: crude 7-segment bars (glow), "0 : 0" either side of a round clock
      const seg = (x, y, w, h) => B.add('glow', plane(w, h), K.amber, x, y, 0.132, { glow: 3.2 });
      const digit = (cx, cy, s, on) => {
        const w = 0.26 * s, h = 0.46 * s, t = 0.05 * s;
        const S7 = [[0, h / 2, w, t], [0, 0, w, t], [0, -h / 2, w, t], [-w / 2, h / 4, t, h / 2], [w / 2, h / 4, t, h / 2], [-w / 2, -h / 4, t, h / 2], [w / 2, -h / 4, t, h / 2]];
        on.forEach((k) => seg(cx + S7[k][0], cy + S7[k][1], S7[k][2], S7[k][3]));
      };
      const ZERO = [0, 2, 3, 4, 5, 6], ONE = [4, 6], SEVEN = [0, 4, 6], FIVE = [0, 1, 2, 3, 6];
      const cy = y0 + 0.55;
      digit(-1.15, cy, 1.4, ZERO); digit(1.15, cy, 1.4, ZERO);
      digit(-0.42, cy, 0.9, ONE); digit(-0.12, cy, 0.9, SEVEN); digit(0.34, cy, 0.9, FIVE);
      seg(0.12, cy + 0.08, 0.04, 0.04); seg(0.12, cy - 0.08, 0.04, 0.04);
      B.blob(3.4, 1.0);
    },
  };

  // ------------------------------------------------------------------------------------------ joint strap (snakes)
  D.speedball_strap = {
    desc: 'Webbing strap over a soft tube bunker (a snake joint): follows the tube\'s rounded section (w × h, corner radius rb) across local X, pegged at both feet. No collider.',
    params: { w: 'm (1.25)', h: 'm (1.0)', rb: 'm (0.44)', color: 'strap' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const w = o.w ?? 1.25, h = o.h ?? 1.0, rb = o.rb ?? 0.44, c = o.color ?? K.charcoal, e = 0.018;
      const pts = [];
      pts.push([-w / 2 - e - 0.12, 0.02, 0], [-w / 2 - e, 0.08, 0], [-w / 2 - e, h - rb, 0]);
      for (let i = 1; i <= 5; i++) { const a = P - (i / 6) * HP; pts.push([-w / 2 + rb + Math.cos(a) * (rb + e), h - rb + Math.sin(a) * (rb + e), 0]); }
      pts.push([-w / 2 + rb, h + e, 0], [w / 2 - rb, h + e, 0]);
      for (let i = 1; i <= 5; i++) { const a = HP - (i / 6) * HP; pts.push([w / 2 - rb + Math.cos(a) * (rb + e), h - rb + Math.sin(a) * (rb + e), 0]); }
      pts.push([w / 2 + e, h - rb, 0], [w / 2 + e, 0.08, 0], [w / 2 + e + 0.12, 0.02, 0]);
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1], len = Math.hypot(bx - ax, by - ay);
        B.box(NS('paint'), c, len + 0.01, 0.008, 0.05, (ax + bx) / 2, (ay + by) / 2, 0, { rz: Math.atan2(by - ay, bx - ax), r: 0.003 });
      }
      for (const sx of [-1, 1]) B.cyl(NS('metal'), K.aluDk, 0.012, 0.06, sx * (w / 2 + e + 0.14), 0.03, 0, { seg: 4 });
    },
  };

  // ------------------------------------------------------------------------------------------ ground stakes (bunker tie-downs)
  D.speedball_stakes = {
    desc: 'Bunker tie-downs: short webbing straps from the bunker skin to steel pegs in the turf (no collider). pos = bunker centre; `r` = distance from centre to the skin, `n` straps.',
    params: { r: 'm (0.7)', n: 'count (4)', color: 'strap' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const r = o.r ?? 0.7, n = o.n ?? 4, c = o.color ?? K.charcoal;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + P / n;
        B.push(Math.cos(a) * r, 0, Math.sin(a) * r, -a);
        B.box(NS('paint'), c, 0.34, 0.012, 0.04, 0.15, 0.13, 0, { rz: -0.72, r: 0.004 });
        B.cyl(NS('metal'), K.aluDk, 0.012, 0.06, 0.3, 0.03, 0, { seg: 4 });
        B.pop();
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------- placements
// (Alpha half; every entry is mirrored (x,z) → (−x,−z), rotY + π unless mirror: false)
export const PLACEMENTS = [
  // safety netting round the field: the back line, and both sidelines from the back corner to the 50
  { type: 'speedball_net', pos: [-NET.x, 0, -NET.z], rotY: 0, length: 2 * NET.x },
  { type: 'speedball_net', pos: [NET.x, 0, -NET.z], rotY: -P / 2, length: NET.z },
  { type: 'speedball_net', pos: [-NET.x, 0, -NET.z], rotY: -P / 2, length: NET.z },
  // start station on the back line (inside the spawn circle, behind the pad)
  { type: 'speedball_station', pos: [0, 0, -23.35], rotY: 0, team: 0 },
  // pits behind the start end: two canopies, feather flags at the pad corners
  { type: 'speedball_tent', pos: [-4.2, 0.04, -29.2], rotY: 0, color: '#d4382c', trim: '#eeede8' },
  { type: 'speedball_tent', pos: [1.0, 0.04, -29.4], rotY: 0.05, color: '#2c2e33', trim: '#efbd2e' },
  { type: 'speedball_tent', pos: [6.0, 0.04, -29.0], rotY: -0.04, color: '#eeede8', trim: '#2b5cb8' },
  { type: 'speedball_featherflag', pos: [-8.6, 0, -26.6], rotY: 0.3, color: '#efbd2e', color2: '#2c2e33' },
  { type: 'speedball_featherflag', pos: [8.6, 0, -26.6], rotY: -0.4, color: '#d4382c', color2: '#eeede8' },
  { type: 'speedball_featherflag', pos: [15.4, 0, -21.5], rotY: -1.2, color: '#2b5cb8', color2: '#eeede8' },
  // spectators' side: a long bleacher outside the net on the snake side (the mirror gives the far side's), scoreboard
  { type: 'speedball_bleacher', pos: [17.3, 0, -8.5], rotY: -P / 2, length: 11, rows: 5 },
  { type: 'speedball_scoreboard', pos: [-16.2, 0, -7.5], rotY: P / 2 },
  // flood lights at the corners (dusk), trees round the park
  { type: 'lightpole', pos: [15.6, 0, -25.8], rotY: -0.55, variant: 0, height: 10, color: '#b9c0c6' },
  { type: 'lightpole', pos: [-15.6, 0, -25.8], rotY: 0.55, variant: 0, height: 10, color: '#b9c0c6' },
  { type: 'tree', pos: [-21.5, 0, -33.5], variant: 0, height: 5.2 },
  { type: 'tree', pos: [-13.5, 0, -36.5], variant: 0, height: 4.6 },
  { type: 'tree', pos: [13.0, 0, -35.8], variant: 0, height: 5.0 },
  { type: 'tree', pos: [24.5, 0, -27.0], variant: 0, height: 4.4 },
  { type: 'tree', pos: [25.5, 0, -2.5], variant: 0, height: 5.4 },
  { type: 'tree', pos: [-25.0, 0, -18.0], variant: 0, height: 4.8 },
  { type: 'bush', pos: [-19.0, 0, -28.5], scale: 1.3 },
  { type: 'bush', pos: [20.0, 0, -18.0], scale: 1.1 },
  { type: 'bench', pos: [-16.4, 0, -14.5], rotY: P / 2 },
  { type: 'cooler', pos: [-16.3, 0, -12.9], rotY: P / 2 },
  // straps over the snake's segment joints
  { type: 'speedball_strap', pos: [10.8, 0, -12.2], w: 1.25, h: 1.0 },
  { type: 'speedball_strap', pos: [10.8, 0, -9.0], w: 1.25, h: 1.0 },
  { type: 'speedball_strap', pos: [10.8, 0, -5.8], w: 1.25, h: 1.0 },
  // tie-downs on the bunkers (the straps are dressing; the bunkers themselves are level blocks — layout.js)
  { type: 'speedball_stakes', pos: [0, 0, -15.6], r: 1.25, n: 4, rotY: 0.2 },
  { type: 'speedball_stakes', pos: [10.1, 0, -18.6], r: 0.72, n: 3 },
  { type: 'speedball_stakes', pos: [6.9, 0, -10.4], r: 0.95, n: 4, rotY: 0.4 },
  { type: 'speedball_stakes', pos: [7.4, 0, -3.0], r: 0.66, n: 3 },
  { type: 'speedball_stakes', pos: [2.8, 0, -7.0], r: 1.08, n: 5 },
  { type: 'speedball_stakes', pos: [4.5, 0, -1.2], r: 0.94, n: 4 },
  { type: 'speedball_stakes', pos: [-4.9, 0, -16.8], r: 0.66, n: 3 },
  { type: 'speedball_stakes', pos: [-6.3, 0, -10.4], r: 1.5, n: 4, rotY: 0.3 },
];
