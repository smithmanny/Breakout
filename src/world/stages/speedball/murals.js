// Breakpoint Field — the painted field lines, drawn into the stage region of the mural atlas (src/world/murals.js).
//
// drawMurals(g, R, kit) draws into R = { x, y, w, h } (2048 × 1008 px) and returns the table for mural ids 4…11.
// The turf is two slabs in the layout's `single` list (not mirrored), one per half, each with its own id:
//   4  Alpha half  (x ±13.8, z −24.4 … 0)      5  Bravo half (x ±13.8, z 0 … 24.4)
// A top face has u = −x, v = +z with its origin at the slab's (maxX, minZ) corner (see cargo/murals.js), so both are drawn
// with the same world-metre transform and the whole field is painted once in world coordinates, clipped per slab.
import { FIELD } from './layout.js';

const PI = Math.PI;
const TURF = { hx: 13.8, hz: 24.4 };
const PPM = 36;   // px per metre (27.6 × 24.4 m → 994 × 878 px per half)
const LINE = 'rgba(244,244,236,0.92)', LINE_SOFT = 'rgba(244,244,236,0.55)';

function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// text lying on the ground, readable from −Z looking toward +Z (rot turns it further), cap height h
function groundText(g, str, x, z, h, color, rot = 0) {
  g.save();
  g.translate(x, z); g.rotate(PI + rot);
  g.scale(h / 100, h / 100);
  g.font = '800 138px Rubik, "Arial Black", sans-serif';
  g.textBaseline = 'alphabetic';
  g.fillStyle = color;
  if ('letterSpacing' in g) g.letterSpacing = '8px';
  const w = g.measureText(str).width;
  g.fillText(str, -w / 2, 50);
  g.restore();
}

// the whole field in world metres (painted with chalk-white turf paint)
function field(g) {
  const { hx, hz } = FIELD, lw = 0.12;
  g.fillStyle = LINE;
  // boundary + centre line
  g.fillRect(-hx - lw / 2, -hz - lw / 2, 2 * hx + lw, lw); g.fillRect(-hx - lw / 2, hz - lw / 2, 2 * hx + lw, lw);
  g.fillRect(-hx - lw / 2, -hz, lw, 2 * hz); g.fillRect(hx - lw / 2, -hz, lw, 2 * hz);
  g.fillRect(-hx, -0.08, 2 * hx, 0.16);
  // 5 m marks along both sidelines, longer at the 10s, and a small cross at the centre
  for (let z = -20; z <= 20; z += 5) {
    if (!z) continue;
    const len = z % 10 ? 0.6 : 1.1;
    for (const sx of [-1, 1]) g.fillRect(sx > 0 ? hx - len : -hx, z - 0.05, len, 0.1);
  }
  g.fillRect(-0.6, -0.05, 1.2, 0.1);
  for (const s of [-1, 1]) {
    // start box at each end: an open rectangle round the start station, the station's foot mark, START
    const z0 = s * hz, z1 = s * (hz - 3.4);
    g.fillRect(-2.6, Math.min(z0, z1), 0.1, 3.4); g.fillRect(2.5, Math.min(z0, z1), 0.1, 3.4);
    g.fillRect(-2.6, z1 - 0.05, 5.2, 0.1);
    g.beginPath(); g.arc(0, s * (hz - 0.9), 0.45, 0, PI * 2); g.lineWidth = 0.08; g.strokeStyle = LINE; g.stroke();
    groundText(g, 'START', 0, s * (hz - 2.3), 0.62, LINE_SOFT, s > 0 ? PI : 0);
    // 10 m line: a dashed cross-field line each side of the 50
    for (let x = -hx + 0.4; x < hx - 0.4; x += 1.6) g.fillRect(x, s * 10 - 0.04, 0.8, 0.08);
    // the field name, big and faint, in each end zone (reads from that end's start box)
    groundText(g, 'BREAKPOINT', 0, s * 16.2, 1.25, 'rgba(244,244,236,0.28)', s > 0 ? PI : 0);
  }
  // "50" beside the centre line on both sidelines
  groundText(g, '50', hx - 1.4, 1.0, 0.8, LINE_SOFT, -PI / 2);
  groundText(g, '50', -hx + 1.4, -1.0, 0.8, LINE_SOFT, PI / 2);
}

// knock flecks + scuffs out of the paint (worn by cleats and dragged bunkers)
function wear(g, r, seed) {
  const R = rng(seed);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 5200; i++) {
    const x = r.x + R() * r.w, y = r.y + R() * r.h, rad = 0.5 + R() * R() * 1.8;
    g.fillStyle = `rgba(0,0,0,${0.3 + 0.6 * R()})`;
    g.beginPath(); g.ellipse(x, y, rad * (0.6 + R()), rad * (0.6 + R()), R() * PI, 0, PI * 2); g.fill();
  }
  for (let i = 0; i < 90; i++) {
    const x = r.x + R() * r.w, y = r.y + R() * r.h, rad = 8 + R() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(0,0,0,${0.2 + 0.3 * R()})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.restore();
}

export function drawMurals(g, R) {
  const out = [];
  const w = Math.round(2 * TURF.hx * PPM), h = Math.round(TURF.hz * PPM);
  [[4, -TURF.hz, 0], [5, 0, TURF.hz]].forEach(([id, minZ], k) => {
    const r = { x: R.x + k * (w + 8), y: R.y, w, h };
    const sx = r.w / (2 * TURF.hx), sz = r.h / TURF.hz;
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    // canvas x = r.x + (maxX − x)·sx, canvas y = r.y + r.h − (z − minZ)·sz
    g.setTransform(-sx, 0, 0, -sz, r.x + TURF.hx * sx, r.y + r.h + minZ * sz);
    field(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.restore();
    wear(g, r, 71 + id);
    out.push({ id, ...r, place: [0, 2 * TURF.hx, 0, TURF.hz], fx: [0.5, 0.6] });
  });
  return out;
}
