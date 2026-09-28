// INKWAVE — in-match HUD (contract: docs/CONTRACTS.md §3).
//   const hud = new HUD(rootEl [, { playSound }]);
//   hud.setVisible(bool) · hud.update(dt, HudFrame) · hud.banner(kind, text) · hud.countdown(n)
//   hud.hitMarker('hit'|'kill') · hud.feed({text,color,kind}) · hud.damage(amount, color, angle?)
//   hud.showSplatted({by, byColor, respawn}) · hud.hideSplatted() · hud.judge({colors, percents, names}) → Promise
// Additive: hud.attachScreenFX(fx) (src/fx/screenfx.js takes over the damage smears + low-HP vignette + splat tint),
//           hud.lab = { local, actors } (ui-lab: drives the event-driven systems without a match).
//
// Systems (all event/frame driven, dirty-checked, transforms/opacity only in per-frame paths):
//   roster top bar (weapon badges, splatted X + respawn ring, special-ready glow, you-caret, state pops) · timer
//   (last-minute / final-10 states) · special gauge (liquid orb, gain pulses, ready flare + rays, active spin) · turf
//   total pill + "+Np" ticker (aggregated 'turf' events) · per-weapon reticles (fire bloom, damage-scaled hit ticks,
//   kill X + ring burst, charge ring + full flash, spawn-shield ring, bomb-aim cost chip) · damage direction arcs ·
//   sloshing canvas ink tank (bubbles on refill, sub-cost line, low/empty states) · kill cards (victim + weapon) ·
//   streak callouts (first/double/triple/quad/wipeout/revenge/streak) · assist cards · ally-down pings in 3D ·
//   ally tags with weapon icons · minimap frame with super-jump beacons (1-4 keys, virtual cursor, click to jump) ·
//   intro team lineup · banners · final countdown · splatted card · judge reveal · feed.
//
// Conventions for frame fields the contract leaves open:
//   map.players[].yaw   radians on the minimap canvas: 0 = pointing up (−y), positive = clockwise.
//   markers[].angle     radians in screen space toward the off-screen ally: 0 = right, positive = clockwise (y down).
//   percents            accepted as 0..100 or 0..1.
// Boss mode (docs/BOSS.md): src/ui/hud-boss.js (hud.boss) adds the boss bar / title card / callouts / damage numbers and
// the endings; the roster slots show the 8-kid squad in squad ink. It switches on match.mode === 'boss' or boss:spawn.
import { h, clamp, colorVars, toHex, fmtTime, fmtInt, splatSVG, splatShape, pct, shade, lerp, easeOutBack, easeOutCubic, restartAnim, prefersReducedMotion } from './ui-util.js';
import { GLYPHS, richText, keycap, specialIcon, weaponIcon, GRENADE_ICON, BALL_ICON, SPRINT_ICON, OUT_ICON, WHISTLE_ICON } from './ui-icons.js';
import { WEAPONS, SPECIALS, TEAM_NAMES, SUB, PLAYER, MATCH, ROUNDS } from '../config.js';
import { on, G } from '../core/ctx.js';
import { BossHud } from './hud-boss.js';
import { installBossAudio } from '../audio/bossAudio.js';
import { bossEmblem, BOSS_NAME, BOSS_EPITHET } from './boss-art.js';

let HUD_ID = 0;
const BUMP = { duration: 320, easing: 'cubic-bezier(.34,1.8,.64,1)' };
// dualies: the ring of the pistol that just fired jabs outward (SVG → Web Animations; the reflow restart trick needs HTML)
const TWIN_KICK = [{ transform: 'scale(1.55)', strokeWidth: '2.6px' }, { transform: 'scale(1)', strokeWidth: '1.8px' }];
const TWIN_KICK_T = { duration: 130, easing: 'cubic-bezier(.2,.8,.3,1)' };
const TAU = Math.PI * 2;
const STREAKS = { 2: 'DOUBLE!', 3: 'TRIPLE!', 4: 'QUAD!' };
const kindOf = (w) => (WEAPONS[w] && WEAPONS[w].kind) || w || 'shooter';

// ------------------------------------------------------------------ HUD-only art
const K = '#15121c';
const SPAWN_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="48" rx="24" ry="9" fill="none" stroke="${K}" stroke-width="8"/><ellipse cx="32" cy="48" rx="24" ry="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 6 L32 36 M20 25 L32 38 L44 25" fill="none" stroke="${K}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 6 L32 36 M20 25 L32 38 L44 25" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DROP_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 C32 5 51 28 51 41 C51 52 42.5 59 32 59 C21.5 59 13 52 13 41 C13 28 32 5 32 5 Z" fill="currentColor" stroke="${K}" stroke-width="4"/><path d="M24 37 Q24 30 29 26" stroke="#fff" stroke-opacity=".7" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
// jersey-crest badge silhouette (roster player pips)
const BADGE_PATH = 'M12 5 L52 5 Q58 5 58 11 L58 38 Q58 50 32 60 Q6 50 6 38 L6 11 Q6 5 12 5 Z';
// paintball hopper: a rounded pod on a feed neck (fill level is a clipped rising block of balls)
const HOPPER_BODY = 'M14 30 C14 14 22 6 36 6 C50 6 58 14 58 30 C58 44 50 52 40 53 L40 60 L32 60 L32 53 C22 52 14 44 14 30 Z';
function arcPath(r0, r1, halfDeg, tip) {
  const a = (halfDeg * Math.PI) / 180;
  const P = (r, t) => `${(Math.sin(t) * r).toFixed(2)} ${(-Math.cos(t) * r).toFixed(2)}`;
  return `M${P(r1, -a)} A${r1} ${r1} 0 0 1 ${P(r1, a)} L${P(r0, a * 0.78)} A${r0} ${r0} 0 0 0 ${P(r0, -a * 0.78)} Z M${P(r1 - 1, -0.16)} L${P(r1 + tip, 0)} L${P(r1 - 1, 0.16)} Z`;
}
const DD_PATH = arcPath(80, 89, 26, 12);

export class HUD {
  constructor(rootEl, opts = {}) {
    this.root = rootEl || document.body;
    this.playSound = opts.playSound || null;
    this.id = ++HUD_ID;
    this._L = {};           // last-written values (dirty checks)
    this._smears = [];
    this._visible = false;
    this.timeScale = 1;     // effect clock multiplier (debug / slow-mo)
    this.paused = false;    // freezes self-driven effects (judge, smears, splatted ring)
    this._fxTime = 0;
    this.fx = null;         // ScreenFX (optional)
    this.lab = null;        // ui-lab driver { local, actors }
    this._t = 0;            // HUD clock (frame driven)
    this._dd = [];          // damage direction indicators
    this._downs = [];       // ally-down pings
    this._turfAcc = 0; this._turfT = 0; this._turfTotal = 0; this._turfShown = 0;
    this._kills = { times: [], streak: 0, first: false, lastKiller: null, dealt: new Map() };
    this._bloom = 0; this._kick = 0; this._hitN = 0; this._hitT = -9;
    this._hop = { level: 1, shown: -1 };
    this._rounds = [];      // BREAKOUT: this match's rounds as the HUD saw them ({ winner, reason, alive })
    this._elim = false;
    this._map = { cx: 0.5, cy: 0.5, hover: -1, open: false, pressed: -1, pressT: 0 };
    this._build();
    this._fxLoop = this._fxLoop.bind(this);
    this._lastFx = 0;
    this._rafId = 0;
    this._onResize = () => this._resizeCanvas();
    addEventListener('resize', this._onResize);
    this._bindBus();
    this.boss = new BossHud(this);
    installBossAudio();   // boss-mode sfx + music director (idle outside boss matches)
  }

  // ================================================================ build
  _build() {
    const el = this.el = h('div', { class: 'iw-hud is-hidden', 'aria-hidden': 'true' });
    colorVars(el, 'self', '#ff8a14');
    colorVars(el, 'enemy', '#2f5bff');

    this.vig = h('div', { class: 'iw-hud__vig' });
    this.canvas = h('canvas', { class: 'iw-hud__smear' });
    this.ctx = this.canvas.getContext('2d');

    // ---- top bar: roster + timer
    const squad = (side) => h('div', { class: `iw-squad iw-squad--${side}` }, Array.from({ length: 4 }, () => {
      const ring = h('i', { class: 'iw-sq__ring', html: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" pathLength="100"/></svg>' });
      return h('span', { class: 'iw-sq' },
        h('span', { class: 'iw-sq__badge', html: `<svg class="iw-sq__shape" viewBox="0 0 64 64" aria-hidden="true"><path class="o" d="${BADGE_PATH}"/><path class="f" d="${BADGE_PATH}"/><path class="g" d="M17 30 Q20 22 28 19"/></svg>` },
          h('span', { class: 'iw-sq__w' })),
        ring,
        h('i', { class: 'iw-sq__x', html: GLYPHS.close }),
        h('b', { class: 'iw-sq__n' }),
        h('i', { class: 'iw-sq__you' }),
        h('i', { class: 'iw-sq__spark' }));
    }));
    this.squads = [squad('a'), squad('b')];
    this.timerTxt = h('span', { class: 'iw-timer__txt' }, '3:00');
    this.roundLbl = h('span', { class: 'iw-timer__round' }, 'ROUND 1');
    this.timer = h('div', { class: 'iw-timer' }, h('span', { class: 'iw-timer__blob' }), h('span', { class: 'iw-timer__drip' }), this.roundLbl, this.timerTxt);
    // BREAKOUT scoreboard: round wins (big number + pips to ROUNDS.toWin) either side of the round clock
    const wins = (side) => h('div', { class: `bk-wins bk-wins--${side}` },
      h('b', { class: 'bk-wins__n' }, '0'),
      h('span', { class: 'bk-wins__pips' }, Array.from({ length: ROUNDS.toWin || 4 }, () => h('i'))),
      h('span', { class: 'bk-wins__alive' }, h('b', null, '4'), h('small', null, 'LEFT')));
    this.wins = [wins('a'), wins('b')];
    this.mpEl = h('div', { class: 'bk-mp' }, 'MATCH POINT');
    this.top = h('div', { class: 'iw-hud__top' }, this.squads[0], this.wins[0], this.timer, this.wins[1], this.squads[1], this.mpEl);

    // ---- special gauge (liquid orb) + turf total
    const sid = `iwsp${this.id}`;
    const blob = 'M50 6 C72 5 93 20 94 45 C95 70 80 94 52 95 C25 96 6 78 6 51 C6 25 26 7 50 6 Z';
    let wave = 'M-100 0';
    for (let x = -100; x < 200; x += 25) wave += ' q6.25 -5 12.5 0 t12.5 0';
    wave += ' V120 H-100 Z';
    const rays = Array.from({ length: 12 }, (_, i) => h('i', { style: { '--r': `${i * 30}deg`, '--d': `${(i % 3) * 40}ms` } }));
    this.sp = h('div', { class: 'iw-sp' },
      h('div', { class: 'iw-sp__rays' }, rays),
      h('div', { class: 'iw-sp__orb', html: `<svg viewBox="0 0 100 100" aria-hidden="true">
          <defs><clipPath id="${sid}"><path d="${blob}"/></clipPath>
            <radialGradient id="${sid}g" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
          <path class="iw-sp__bg" d="${blob}"/>
          <g clip-path="url(#${sid})"><g class="iw-sp__liquid"><path class="iw-sp__wave2" d="${wave}"/><path class="iw-sp__wave" d="${wave}"/></g>
            <circle class="iw-sp__bub" cx="30" cy="80" r="3"/><circle class="iw-sp__bub b" cx="62" cy="88" r="2.2"/><circle class="iw-sp__bub c" cx="46" cy="92" r="1.6"/>
            <rect x="0" y="0" width="100" height="100" fill="url(#${sid}g)"/>
            <ellipse cx="34" cy="26" rx="15" ry="8" fill="#fff" opacity=".2"/></g>
          <path class="iw-sp__rim" d="${blob}"/>
          <path class="iw-sp__spin" d="${blob}" pathLength="100"/>
        </svg>` }),
      h('i', { class: 'iw-sp__ring' }),
      h('span', { class: 'iw-sp__icon' }),
      h('span', { class: 'iw-sp__pct' }),
      h('div', { class: 'iw-sp__ready' }, h('span', null, 'READY!'), h('span', { html: keycap('F') })));
    this.spLiquid = this.sp.querySelector('.iw-sp__liquid');
    this.spIcon = this.sp.querySelector('.iw-sp__icon');
    this.spPct = this.sp.querySelector('.iw-sp__pct');
    this.turfNum = h('b', null, '0');
    this.turfEl = h('div', { class: 'iw-turf' }, h('i', { html: DROP_ICON }), this.turfNum, h('small', null, 'p'));
    this.feedEl = h('div', { class: 'iw-feed' });

    // ---- crosshair cluster
    this.ret = h('div', { class: 'iw-ret' });
    this.hitEl = h('div', { class: 'iw-hit' }, h('i'), h('i'), h('i'), h('i'));
    this.killEl = h('div', { class: 'iw-kill' }, h('span', { class: 'iw-kill__ring' }), h('span', { class: 'iw-kill__out bk-sport' }, 'OUT'), h('i'), h('i'), h('i'), h('i'));
    this.shield = h('div', { class: 'iw-shield', html: '<svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="36" pathLength="100"/></svg>' });
    this.subChip = h('div', { class: 'iw-subaim' }, h('i', { html: GRENADE_ICON }), h('b', null, '×2'));
    // hopper mini-meter beside the reticle + reload / low / empty status under it
    this.magFill = h('i', { class: 'bk-mag__fill' });
    this.tank = h('div', { class: 'bk-mag' }, h('span', { class: 'bk-mag__tube' }, this.magFill), h('i', { class: 'bk-mag__cap' }));
    this.rlTxt = h('span', { class: 'bk-rl__txt' });
    this.rlBar = h('i', { class: 'bk-rl__bar' });
    this.rlEl = h('div', { class: 'bk-rl' }, this.rlTxt, h('span', { class: 'bk-rl__track' }, this.rlBar));
    this.tpops = h('div', { class: 'iw-tpops' });
    this.xh = h('div', { class: 'iw-xh' }, this.shield, this.ret, this.hitEl, this.killEl, this.tank, this.rlEl, this.subChip, this.tpops);
    // hopper panel (bottom right): ball count, hopper pod filling, reload bar, grenades, sprint
    const hid = `bkhp${this.id}`;
    const balls = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) balls.push(`<circle cx="${(14 + c * 9 + (r % 2) * 4.5).toFixed(1)}" cy="${(56 - r * 8.2).toFixed(1)}" r="4.3"/>`);
    this.hopArt = h('div', { class: 'bk-hop__art', html: `<svg viewBox="0 0 72 64" aria-hidden="true">
        <defs><clipPath id="${hid}"><path d="${HOPPER_BODY}"/></clipPath></defs>
        <path class="bk-hop__bg" d="${HOPPER_BODY}"/>
        <g clip-path="url(#${hid})"><g class="bk-hop__lvl"><rect class="bk-hop__paint" x="0" y="0" width="72" height="70"/><g class="bk-hop__balls">${balls.join('')}</g></g>
          <ellipse cx="27" cy="16" rx="8" ry="4.5" transform="rotate(-25 27 16)" fill="#fff" opacity=".28"/></g>
        <path class="bk-hop__rim" d="${HOPPER_BODY}"/>
        <rect class="bk-hop__lid" x="24" y="2.5" width="24" height="7" rx="3"/></svg>` });
    this.hopLvl = this.hopArt.querySelector('.bk-hop__lvl');
    this.hopN = h('b', { class: 'bk-hop__n' }, '0');
    this.hopMax = h('small', { class: 'bk-hop__max' }, '/ 0');
    this.hopBar = h('i');
    this.hopState = h('span', { class: 'bk-hop__state' });
    this.nadePips = Array.from({ length: Math.max(1, SUB.bomb.count || 2) }, () => h('i', { class: 'bk-nade', html: GRENADE_ICON }));
    this.sprintEl = h('span', { class: 'bk-sprint' }, h('i', { html: SPRINT_ICON }), 'SPRINT');
    this.hop = h('div', { class: 'bk-hop' },
      this.hopArt,
      h('div', { class: 'bk-hop__main' },
        h('div', { class: 'bk-hop__count' }, h('i', { class: 'bk-hop__ball', html: BALL_ICON }), this.hopN, this.hopMax),
        h('div', { class: 'bk-hop__bar' }, this.hopBar),
        h('div', { class: 'bk-hop__row' }, h('span', { class: 'bk-hop__nades' }, this.nadePips), this.sprintEl, this.hopState)));
    this.specEl = h('div', { class: 'bk-spec' }, h('small', null, 'SPECTATING'), h('span', { class: 'bk-spec__w' }), h('b', { class: 'bk-spec__name' }), h('span', { class: 'bk-spec__left' }));
    this.ddLayer = h('div', { class: 'iw-dds' });

    // ---- minimap + super-jump beacons
    this.mapSlot = h('div', { class: 'iw-map__slot' });
    const arrow = '<svg class="iw-mdot__arrow" viewBox="-13 -15 26 30" aria-hidden="true"><path class="o" d="M0 -11 L9 11 L0 5.5 L-9 11 Z"/><path class="i" d="M0 -11 L9 11 L0 5.5 L-9 11 Z"/></svg>';
    this.mapDots = Array.from({ length: 8 }, () => h('i', { class: 'iw-mdot', html: '<b></b>' + arrow }));
    this.mapFrame = h('div', { class: 'iw-map__frame' }, this.mapSlot, h('div', { class: 'iw-map__dots' }, this.mapDots), h('i', { class: 'iw-map__gloss' }));
    this.mapLabel = h('div', { class: 'iw-map__label' }, h('span', { html: keycap('TAB') }), h('span', null, 'MAP'));
    this.beacons = Array.from({ length: 4 }, (_, i) => {
      const b = h('div', { class: 'iw-bcn' + (i === 3 ? ' iw-bcn--home' : '') },
        h('span', { class: 'iw-bcn__stem' }, h('i')),
        h('span', { class: 'iw-bcn__pulse' }),
        h('span', { class: 'iw-bcn__disc' }, h('span', { class: 'iw-bcn__icon', html: i === 3 ? SPAWN_ICON : '' })),
        h('span', { class: 'iw-bcn__key' }, String(i + 1)),
        h('span', { class: 'iw-bcn__label' }, h('small', null, 'SUPER JUMP'), h('b', null, i === 3 ? 'Base' : '')));
      b.addEventListener('pointerenter', () => { if (this._map.open) this._map.hover = i; });
      b.addEventListener('pointerleave', () => { if (this._map.hover === i) this._map.hover = -1; });
      b.addEventListener('click', (e) => { e.stopPropagation(); this._jumpTo(i); });
      return b;
    });
    this.mapCursor = h('div', { class: 'iw-mcur' }, h('i'));
    this.mapJumpLine = h('div', { class: 'iw-map__jline', html: '<svg aria-hidden="true"><path/></svg>' });
    this.legendRows = Array.from({ length: 4 }, (_, i) => {
      const row = h('div', { class: 'iw-lg__row' + (i === 3 ? ' is-home' : '') },
        h('span', { class: 'iw-lg__key', html: keycap(String(i + 1)) }),
        h('span', { class: 'iw-lg__w', html: i === 3 ? SPAWN_ICON : '' }),
        h('span', { class: 'iw-lg__name' }, i === 3 ? 'Base' : '—'),
        h('span', { class: 'iw-lg__st' }));
      row.addEventListener('pointerenter', () => { if (this._map.open) this._map.hover = i; });
      row.addEventListener('pointerleave', () => { if (this._map.hover === i) this._map.hover = -1; });
      row.addEventListener('click', (e) => { e.stopPropagation(); this._jumpTo(i); });
      return row;
    });
    this.mapLegend = h('div', { class: 'iw-map__legend' },
      h('div', { class: 'iw-lg__title iw-display' }, 'SUPER JUMP'),
      h('div', { class: 'iw-lg__sub' }, 'Pick a landing spot'),
      h('div', { class: 'iw-lg__rows' }, this.legendRows),
      h('div', { class: 'iw-lg__foot', html: richText('Press [1] – [4] or click · release [TAB] to cancel') }));
    this.map = h('div', { class: 'iw-map' }, this.mapFrame, this.mapJumpLine, h('div', { class: 'iw-map__bcns' }, this.beacons), this.mapCursor, this.mapLabel, this.mapLegend);
    this.mapDim = h('div', { class: 'iw-map-dim' });
    this._mapT = 0; this._mapV = 0;

    this.markers = Array.from({ length: 8 }, () => h('div', { class: 'iw-mk' }, h('span', { class: 'iw-mk__tag' }, h('i', { class: 'iw-mk__w' }), h('b')), h('i', { class: 'iw-mk__arrow' })));
    this.markerLayer = h('div', { class: 'iw-mks' }, this.markers);
    this.downLayer = h('div', { class: 'iw-downs' });

    this.promptEl = h('div', { class: 'iw-prompt is-out' });
    this.fpsEl = h('div', { class: 'iw-fps' });
    this.bannerLayer = h('div', { class: 'iw-banners' });
    this.countLayer = h('div', { class: 'iw-counts' });
    this.splatLayer = h('div', { class: 'iw-splat-layer' });
    this.kcards = h('div', { class: 'iw-kcards' });
    this.callouts = h('div', { class: 'iw-callouts' });

    el.append(this.vig, this.canvas, this.downLayer, this.markerLayer, this.ddLayer, this.top, this.sp, this.turfEl, this.feedEl, this.xh, this.hop,
      this.kcards, this.callouts, this.promptEl, this.mapDim, this.map, this.fpsEl, this.specEl, this.countLayer, this.bannerLayer, this.splatLayer);
    this.root.appendChild(el);

    // judge + splatted + lineup live outside the hideable HUD so they survive setVisible(false)
    this.overLayer = h('div', { class: 'iw-hud-over' });
    colorVars(this.overLayer, 'self', '#ff8a14');
    colorVars(this.overLayer, 'enemy', '#2f5bff');
    this.root.appendChild(this.overLayer);
    this._resizeCanvas();
  }

  // ================================================================ public
  setVisible(v) {
    v = !!v;
    if (v === this._visible) return;
    this._visible = v;
    this.el.classList.toggle('is-hidden', !v);
    if (v) restartAnim(this.el, 'is-enter');
  }

  /** ScreenFX takes over the lens-ink damage smears, the low-HP vignette and the splatted desaturation. */
  attachScreenFX(fx) {
    this.fx = fx || null;
    this.el.classList.toggle('iw-hud--fx', !!fx);
    this.overLayer.classList.toggle('iw-hud--fx', !!fx);
  }

  update(dt, f) {
    if (!f) return;
    this._t += dt;
    const L = this._L;
    const t0 = f.teams && f.teams[0], t1 = f.teams && f.teams[1];
    const ca = toHex(t0 && t0.color, '#ff8a14'), cb = toHex(t1 && t1.color, '#2f5bff');
    if (ca !== L.ca) { L.ca = ca; colorVars(this.el, 'self', ca); colorVars(this.overLayer, 'self', ca); L.tankCol = null; }
    if (cb !== L.cb) { L.cb = cb; colorVars(this.el, 'enemy', cb); colorVars(this.overLayer, 'enemy', cb); }

    const me = this._local();
    const spect = !!(me && me.alive === false);
    if (spect !== L.spect) { L.spect = spect; this.el.classList.toggle('is-spectating', spect); }
    const elim = !!f.round;
    if (elim !== L.elim) { L.elim = elim; this._elim = elim; this.el.classList.toggle('is-elim', elim); this.overLayer.classList.toggle('is-elim', elim); }
    this._updTimer(f.round ? f.round.time : f.time);
    this._updRound(f.round);
    if (f.teams) this._updSquads(this.boss.on ? this.boss.squadTeams(f.teams) : f.teams);
    this._updCrosshair(f, dt);
    this._updHopper(f, dt);
    this._updSpectate(me, f.round);
    this._updSpecial(f, dt);
    if (!elim) this._updTurf(dt);
    this._updHp(f.hp);
    this._updMap(f.map, dt);
    this._updMarkers(f.markers);
    this._updDamageDirs(dt);
    this._updDowns(dt);
    this._updPrompt(this.boss.on ? this.boss.prompt(f.prompt) : f.prompt);
    this._updFps(f.fps, dt);
    this.boss.update(dt);
  }

  banner(kind = 'custom', text) {
    if (kind === 'timesup' && this.boss.timesUp()) { this.el.classList.remove('is-live'); return; }
    const k = ['ready', 'go', 'one_minute', 'timesup', 'special', 'custom'].includes(kind) ? kind : 'custom';
    const defaults = { ready: 'READY?', go: 'GO!', one_minute: '1 minute left!', timesup: "TIME'S UP!", special: 'SPECIAL!', custom: '' };
    const label = text != null && text !== '' ? String(text) : defaults[k];
    const group = k === 'one_minute' ? 'side' : k === 'special' ? 'low' : 'center';
    this.bannerLayer.querySelectorAll(`.iw-bn[data-g="${group}"]`).forEach((b) => b.remove());
    let el;
    if (k === 'go') {
      const drops = Array.from({ length: 10 }, (_, i) => h('i', { class: 'iw-bn__drop', style: { '--a': `${i * 36 + Math.random() * 20}deg`, '--d': `${0.8 + Math.random() * 0.7}`, '--s': `${0.5 + Math.random() * 0.8}` } }));
      el = h('div', { class: 'iw-bn iw-bn--go' },
        h('div', { class: 'iw-bn__burst' }, drops),
        h('div', { class: 'iw-bn__splat', html: splatSVG({ seed: 21, cls: 'iw-fself', r: 60, arms: 11, drops: 9 }) }),
        h('div', { class: 'iw-bn__text iw-display' }, label));
    } else if (k === 'timesup') {
      el = h('div', { class: 'iw-bn iw-bn--timesup' },
        h('div', { class: 'iw-bn__splat b', html: splatSVG({ seed: 8, cls: 'iw-fenemy', r: 60, arms: 9, drops: 6 }) }),
        h('div', { class: 'iw-bn__splat', html: splatSVG({ seed: 13, cls: 'iw-fself', r: 60, arms: 10, drops: 7 }) }),
        h('div', { class: 'iw-bn__text iw-display' }, label));
    } else if (k === 'one_minute') {
      el = h('div', { class: 'iw-bn iw-bn--minute' }, h('i', { html: GLYPHS.clock }), h('span', { class: 'iw-display' }, label));
    } else if (k === 'special') {
      el = h('div', { class: 'iw-bn iw-bn--special' }, h('div', { class: 'iw-bn__sicon', html: specialIcon(this._specialId()) }), h('div', { class: 'iw-bn__text iw-display' }, label));
    } else if (k === 'ready') {
      el = h('div', { class: 'iw-bn iw-bn--ready' }, h('div', { class: 'iw-bn__text iw-display' }, [...label].map((c, i) => h('span', { style: { '--i': i } }, c === ' ' ? ' ' : c))));
    } else {
      el = h('div', { class: 'iw-bn iw-bn--custom' }, h('div', { class: 'iw-bn__text iw-display' }, label));
    }
    el.dataset.g = group;
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 4000);
    this.bannerLayer.appendChild(el);
    if (k === 'go') this.el.classList.add('is-live');
    if (k === 'timesup') this.el.classList.remove('is-live');
  }

  countdown(n) {
    if (n == null || n < 0) return;
    this.countLayer.querySelectorAll('.iw-count').forEach((c) => c.classList.add('is-old'));
    const el = h('div', { class: 'iw-count' + (n <= 3 ? ' is-hot' : '') }, h('i', { class: 'iw-count__ring' }), h('span', { class: 'iw-display' }, String(n)));
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 1600);
    this.countLayer.appendChild(el);
  }

  hitMarker(kind = 'hit') {
    this.hitEl.classList.remove('is-weak');
    const dmg = this._lastHitDmg || 36;
    this._lastHitDmg = 0;
    // consecutive hits escalate (ticks grow, fly further and warm toward your ink colour); heavy hits get fat ticks
    const now = this._fxTime;
    this._hitN = now - (this._hitT ?? -9) < 0.55 ? Math.min((this._hitN || 0) + 1, 6) : 0;
    this._hitT = now;
    const s = clamp(0.8 + dmg / 90, 0.8, 1.6) * (1 + this._hitN * 0.06);
    this.hitEl.style.setProperty('--hs', s.toFixed(2));
    this.hitEl.style.setProperty('--hn', String(this._hitN));
    this.hitEl.classList.toggle('is-heavy', dmg >= 60);
    if (kind === 'kill') { this._restart(this.killEl, 'is-on'); this._restart(this.hitEl, 'is-on'); this._restart(this.ret, 'is-killflash'); }
    else { this._restart(this.hitEl, 'is-on'); this._restart(this.ret, 'is-hitflash'); }
  }

  feed({ text = '', color = '#ffffff', kind = 'info' } = {}) {
    // your own splats get the big kill card (below the crosshair) — don't repeat them as a feed pill
    if (kind === 'kill' && this._live() && !this.lab) return;
    const icon = kind === 'kill' || kind === 'death' || kind === 'ally' ? OUT_ICON : GLYPHS.flag;
    const el = h('div', { class: `iw-feed__item iw-feed__item--${kind}` },
      h('span', { class: 'iw-feed__icon', html: icon }),
      h('span', { class: 'iw-feed__text', html: richText(text) }));
    colorVars(el, 'c', toHex(color, '#ffffff'));
    this.feedEl.prepend(el);
    const items = [...this.feedEl.querySelectorAll('.iw-feed__item:not(.is-out)')];
    for (let i = 5; i < items.length; i++) this._expireFeed(items[i], true);
    el._t = setTimeout(() => this._expireFeed(el), 4200);
  }

  // angle (optional): screen-space direction toward the attacker (0 = right, +clockwise, y down). Without ScreenFX the
  // smears land on that edge; with ScreenFX the lens ink does the smear and the HUD only draws direction arcs.
  damage(amount = 0.3, color = '#2f5bff', angle = null) {
    if (this.fx) return;
    amount = clamp(+amount || 0);
    const hex = toHex(color, '#2f5bff');
    const n = 1 + Math.round(amount * 2.2 + Math.random() * 0.8);
    for (let i = 0; i < n; i++) this._spawnSmear(amount, hex, angle);
    while (this._smears.length > 12) this._smears.shift();
    this._addFx('smear', (dt) => this._tickSmears(dt));
  }

  showSplatted({ by = null, byColor = '#2f5bff', respawn = 5, out = false } = {}) {
    this.hideSplatted(true);
    if (out || (respawn <= 0 && this._elim)) { this._showOut({ by, byColor }); return; }
    const C = 2 * Math.PI * 44;
    const num = h('b', { class: 'iw-spl__num' }, String(Math.ceil(respawn)));
    const ring = h('div', { class: 'iw-spl__ring', html: `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="fg" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${C.toFixed(1)};animation-duration:${Math.max(0.1, respawn)}s"/></svg>` }, num, h('small', null, 'RESPAWN'));
    const tint = h('div', { class: 'iw-spl__tint' });
    this.el.prepend(tint);
    const killer = this._kills.lastKiller;
    const kw = killer && killer.weaponId ? h('span', { class: 'iw-spl__w', html: weaponIcon(kindOf(killer.weaponId)) }) : null;
    const el = h('div', { class: 'iw-spl' },
      h('div', { class: 'iw-spl__card' },
        h('div', { class: 'iw-spl__splat', html: splatSVG({ seed: 64, cls: 'iw-fby', r: 62, arms: 11, drops: 5, viewBox: 240 }) }),
        kw,
        h('div', { class: 'iw-spl__text' },
          h('div', { class: 'iw-spl__by' }, by ? 'SPLATTED BY' : 'SPLATTED!'),
          by ? h('div', { class: 'iw-spl__name iw-display' }, String(by)) : null,
          killer && killer.weaponId ? h('div', { class: 'iw-spl__wn' }, (WEAPONS[killer.weaponId] || {}).name || '') : null),
        ring),
      G.match && G.match.superJumpOk && !G.match.superJumpOk() ? null : h('div', { class: 'iw-spl__hint', html: richText('Hold [TAB] to plan a Super Jump') }));
    colorVars(el, 'by', toHex(byColor, '#2f5bff'));
    this.splatLayer.appendChild(el);
    const st = { el, tint, end: this._fxTime + Math.max(0, respawn), num, last: Math.ceil(respawn) };
    this._splatted = st;
    this._addFx('splatted', () => {
      if (this._splatted !== st) return false;
      st.t = st.end - this._fxTime;
      const n = Math.max(0, Math.ceil(st.t));
      if (n !== st.last) {
        st.last = n;
        num.textContent = n > 0 ? String(n) : 'GO';
        num.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], BUMP);
        if (n > 0 && n <= 3) this._snd('countdown_tick', { volume: 0.5 });
      }
      return st.t > -0.5;
    });
  }

  // elimination: one life per round — "OUT!" with who marked you (no respawn countdown), then it docks away while the
  // camera moves on to a teammate (the SPECTATING bar takes over)
  _showOut({ by, byColor }) {
    const tint = h('div', { class: 'iw-spl__tint' });
    this.el.prepend(tint);
    const killer = this._kills.lastKiller;
    const wid = killer && killer.weaponId;
    const el = h('div', { class: 'iw-spl bk-out' },
      h('div', { class: 'bk-out__card' },
        h('div', { class: 'bk-out__stamp bk-sport' }, 'OUT!'),
        h('div', { class: 'bk-out__by' },
          wid ? h('span', { class: 'bk-out__w', html: weaponIcon(kindOf(wid)) }) : h('span', { class: 'bk-out__w', html: OUT_ICON }),
          h('span', { class: 'bk-out__txt' },
            h('small', null, by ? 'MARKED BY' : 'ELIMINATED'),
            h('b', null, by ? String(by) : 'OUT OF BOUNDS'),
            wid ? h('em', null, (WEAPONS[wid] || {}).name || '') : null)),
        h('div', { class: 'bk-out__note' }, 'Out for the round — back in next round')));
    colorVars(el, 'by', toHex(byColor, '#2f5bff'));
    this.splatLayer.appendChild(el);
    const st = { el, tint, out: true };
    this._splatted = st;
    setTimeout(() => { if (this._splatted === st) el.classList.add('is-docked'); }, 3400);
  }

  hideSplatted(instant = false) {
    const st = this._splatted;
    if (!st) return;
    this._splatted = null;
    if (instant) { st.el.remove(); st.tint.remove(); return; }
    st.el.classList.add('is-out'); st.tint.classList.add('is-out');
    setTimeout(() => { st.el.remove(); st.tint.remove(); }, 380);
  }

  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES } = {}) {
    return new Promise((resolve) => {
      const [pa, pb] = pct(percents[0], percents[1]);
      const ca = toHex(colors[0], '#ff8a14'), cb = toHex(colors[1], '#2f5bff');
      const share = pa + pb > 0 ? pa / (pa + pb) : 0.5;
      const winner = Math.abs(pa - pb) < 0.05 ? -1 : pa > pb ? 0 : 1;
      const numA = h('b', { class: 'iw-jd__num' }, '0.0%'), numB = h('b', { class: 'iw-jd__num' }, '0.0%');
      const barA = h('div', { class: 'iw-jd__bar a' });
      const barB = h('div', { class: 'iw-jd__bar b' });
      const edgeA = h('i', { class: 'iw-jd__edge a' }), edgeB = h('i', { class: 'iw-jd__edge b' });
      const clash = h('div', { class: 'iw-jd__clash', html: splatSVG({ seed: 99, fill: '#fff', r: 50, arms: 10, drops: 8 }) });
      const wText = winner < 0 ? "IT'S A TIE!" : `${(names[winner] || TEAM_NAMES[winner] || '').toUpperCase()} WINS!`;
      const win = h('div', { class: 'iw-jd__win' + (winner === 1 ? ' is-b' : winner === 0 ? ' is-a' : ' is-tie') },
        h('div', { class: 'iw-jd__winsplat', html: splatSVG({ seed: 5, cls: 'iw-fwin', r: 58, arms: 11, drops: 5 }) }),
        h('div', { class: 'iw-jd__wintext iw-display' }, wText));
      const el = h('div', { class: 'iw-jd' },
        h('div', { class: 'iw-jd__bg' }),
        h('div', { class: 'iw-jd__title iw-display' }, h('span', null, 'JUDGING'), h('span', { class: 'iw-jd__dots' }, h('i'), h('i'), h('i'))),
        h('div', { class: 'iw-jd__arena' },
          h('div', { class: 'iw-jd__labels' },
            h('div', { class: 'iw-jd__side a' }, h('span', { class: 'iw-jd__name' }, names[0] || TEAM_NAMES[0]), numA),
            h('div', { class: 'iw-jd__side b' }, numB, h('span', { class: 'iw-jd__name' }, names[1] || TEAM_NAMES[1]))),
          h('div', { class: 'iw-jd__track' }, h('div', { class: 'iw-jd__clip' }, barA, barB), edgeA, edgeB, clash)),
        win);
      colorVars(el, 'ja', ca); colorVars(el, 'jb', cb);
      colorVars(el, 'jw', winner === 1 ? cb : ca);
      this.overLayer.appendChild(el);
      const snd = (n) => this._snd(n);

      let t = 0, drum = false, reveal = false, punched = false, finished = false;
      const t0 = this._fxTime;
      let rollT = 0;
      const R = { a: 0, b: 0 };
      const fmt = (v) => `${v.toFixed(1)}%`;
      let trackW = 0;
      const setBars = (a, b) => {
        barA.style.transform = `scaleX(${a.toFixed(4)})`;
        barB.style.transform = `scaleX(${b.toFixed(4)})`;
        if (!trackW) trackW = barA.parentNode.offsetWidth;
        edgeA.style.transform = `translateX(${(a * trackW).toFixed(1)}px)`;
        edgeB.style.transform = `translateX(${(-b * trackW).toFixed(1)}px)`;
      };
      setBars(0, 0);
      let revealFrom = { a: 0, b: 0 };
      this._addFx('judge', (dt) => {
        t = this._fxTime - t0;
        if (t < 0.8) return true;
        if (!drum) { drum = true; snd('judge_drumroll'); el.classList.add('is-racing'); }
        if (t < 3.45) {
          const k = easeOutCubic(clamp((t - 0.8) / 1.5));
          const jitter = t > 2.3 ? Math.sin(t * 38) * 0.006 + Math.sin(t * 23) * 0.004 : 0;
          R.a = 0.43 * k + jitter; R.b = 0.43 * k - jitter;
          setBars(R.a, R.b);
          rollT += dt;
          if (rollT > 0.05) {
            rollT = 0;
            if (t > 2.3) { numA.textContent = '??.?%'; numB.textContent = '??.?%'; el.classList.add('is-drum'); }
            else { numA.textContent = fmt(10 + Math.random() * 60); numB.textContent = fmt(10 + Math.random() * 60); }
          }
          return true;
        }
        if (!reveal) {
          reveal = true; snd('judge_reveal');
          el.classList.remove('is-drum'); el.classList.add('is-reveal');
          revealFrom = { a: R.a, b: R.b };
          clash.style.left = `${(share * 100).toFixed(2)}%`;
        }
        const rk = clamp((t - 3.45) / 0.55);
        const e = easeOutBack(rk, 2.2);
        setBars(lerp(revealFrom.a, share, e), lerp(revealFrom.b, 1 - share, e));
        const nk = easeOutCubic(clamp((t - 3.45) / 0.45));
        numA.textContent = fmt(pa * nk); numB.textContent = fmt(pb * nk);
        if (!punched && t > 3.75) { punched = true; el.classList.add('is-winner', winner === 1 ? 'is-win-b' : winner === 0 ? 'is-win-a' : 'is-tie'); }
        if (!finished && t > 5.1) {
          finished = true;
          resolve({ winner });
          el.classList.add('is-out');
          setTimeout(() => el.remove(), 650);
          return false;
        }
        return true;
      });
    });
  }

  /**
   * BREAKOUT full-time card (elimination results): final round score, WIN/LOSE, a strip of every round (who took it and
   * how) and the per-player table (eliminations, damage, outs, rounds survived). Resolves after ~7 s (or a key / click
   * once it has landed), then fades out under the menus' results screen.
   *   data: { colors, names, myTeam, roundWins, rounds: [{ winner, reason, alive? }], players: [{ name, team, weapon,
   *           elims, damage, deaths, survived, isSelf }], win, mapName }
   */
  finalScore(data = {}) {
    return new Promise((resolve) => {
      this.overLayer.querySelectorAll('.bk-fs').forEach((e) => e.remove());
      const my = data.myTeam === 1 ? 1 : 0, th = 1 - my;
      const cols = (data.colors || ['#ff8a14', '#2f5bff']).map((c, i) => toHex(c, i ? '#2f5bff' : '#ff8a14'));
      const names = data.names || TEAM_NAMES;
      const nm = (t) => String(names[t] || TEAM_NAMES[t] || '').toUpperCase();
      const w = data.roundWins || [0, 0];
      const win = data.win != null ? !!data.win : w[my] > w[th];
      const draw = w[my] === w[th] && data.win == null;
      const rounds = (data.rounds || []).map((r, i) => ({ ...(this._rounds[i] || {}), ...(r || {}) }));
      const players = data.players || [];
      // MVP: most eliminations, then damage
      let mvp = null;
      for (const p of players) if (!mvp || (p.elims || 0) > (mvp.elims || 0) || ((p.elims || 0) === (mvp.elims || 0) && (p.damage || 0) > (mvp.damage || 0))) mvp = p;
      if (mvp && !(mvp.elims || mvp.damage)) mvp = null;
      const numA = h('b', { class: 'bk-fs__num' }, '0'), numB = h('b', { class: 'bk-fs__num' }, '0');
      const chip = (r, i) => {
        const t = r.winner === my ? 'my' : r.winner === th ? 'th' : 'draw';
        const how = r.reason === 'wipe' ? 'WIPE' : 'TIME';
        const left = r.alive && r.winner >= 0 ? `${r.alive[r.winner]} LEFT` : r.winner < 0 ? 'DRAW' : '';
        return h('div', { class: `bk-rc is-${t}`, style: { '--i': i } },
          h('small', null, `R${i + 1}`),
          h('i', { html: r.reason === 'wipe' ? OUT_ICON : WHISTLE_ICON }),
          h('b', null, how),
          left ? h('em', null, left) : null);
      };
      const table = (t) => {
        const rows = players.filter((p) => p.team === t).sort((a, b) => (b.elims || 0) - (a.elims || 0) || (b.damage || 0) - (a.damage || 0));
        return h('div', { class: `bk-ft bk-ft--${t === my ? 'my' : 'th'}` },
          h('div', { class: 'bk-ft__head' },
            h('span', { class: 'bk-ft__team' }, h('i'), nm(t), w[t] > w[1 - t] ? h('em', null, 'WINNERS') : null),
            h('span', null, 'ELIMS'), h('span', null, 'DMG'), h('span', null, 'OUTS'), h('span', null, 'SURV')),
          rows.map((p, i) => h('div', { class: 'bk-ft__row' + (p.isSelf ? ' is-self' : '') + (p === mvp ? ' is-mvp' : ''), style: { '--i': i } },
            h('span', { class: 'bk-ft__name' }, h('i', { html: weaponIcon(kindOf(p.weapon)) }), h('b', null, p.name), p.isSelf ? h('em', null, 'YOU') : null, p === mvp ? h('strong', null, 'MVP') : null),
            h('span', { class: 'bk-ft__n' }, String(p.elims ?? p.splats ?? 0)),
            h('span', { class: 'bk-ft__n' }, fmtInt(p.damage || 0)),
            h('span', { class: 'bk-ft__n' }, String(p.deaths || 0)),
            h('span', { class: 'bk-ft__n' }, String(p.survived || 0)))));
      };
      const el = h('div', { class: 'bk-fs' + (draw ? ' is-draw' : win ? ' is-win' : ' is-lose') },
        h('div', { class: 'bk-fs__bg' }),
        h('div', { class: 'bk-fs__card' },
          h('div', { class: 'bk-fs__kicker' }, `FULL TIME${data.mapName ? ' · ' + String(data.mapName).toUpperCase() : ''} · ELIMINATION`),
          h('div', { class: 'bk-fs__board' },
            h('div', { class: 'bk-fs__side is-my' }, h('span', null, nm(my)), numA),
            h('i', { class: 'bk-fs__dash' }, '—'),
            h('div', { class: 'bk-fs__side is-th' }, numB, h('span', null, nm(th)))),
          h('div', { class: 'bk-fs__verdict bk-sport' }, draw ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT'),
          h('div', { class: 'bk-fs__rounds' }, rounds.map(chip)),
          h('div', { class: 'bk-fs__tables' }, table(my), table(th)),
          h('div', { class: 'bk-fs__foot' }, 'Press any key to continue')));
      colorVars(el, 'my', cols[my]); colorVars(el, 'th', cols[th]);
      this.overLayer.appendChild(el);
      this._snd('ui_confirm', { volume: 0.6 });
      const t0 = this._fxTime;
      let shownA = -1, shownB = -1, done = false, ready = false;
      const finish = () => {
        if (done) return; done = true;
        removeEventListener('keydown', onKey, true); el.removeEventListener('pointerdown', onKey);
        resolve({ winner: draw ? -1 : win ? my : th });
        el.classList.add('is-out');
        setTimeout(() => el.remove(), 700);
      };
      const onKey = () => { if (ready) finish(); };
      addEventListener('keydown', onKey, true); el.addEventListener('pointerdown', onKey);
      this._addFx('finalscore', () => {
        if (done || !el.isConnected) return false;
        const t = this._fxTime - t0;
        const k = easeOutCubic(clamp((t - 0.35) / 0.8));
        const a = Math.round(w[my] * k), b = Math.round(w[th] * k);
        if (a !== shownA) { shownA = a; numA.textContent = String(a); }
        if (b !== shownB) { shownB = b; numB.textContent = String(b); }
        if (t > 1.2 && !el.classList.contains('is-landed')) { el.classList.add('is-landed'); this._snd(win ? 'special_ready' : 'ui_error', { volume: 0.55 }); }
        if (t > 2) ready = true;
        if (t > 7.5) { finish(); return false; }
        return true;
      });
    });
  }

  dispose() {
    removeEventListener('resize', this._onResize);
    cancelAnimationFrame(this._rafId);
    this._unsubs?.forEach((u) => u());
    this.boss?.dispose();
    this.el.remove(); this.overLayer.remove();
  }

  // ================================================================ bus: event-driven systems
  _snd(name, o) { try { this.playSound && this.playSound(name, o); } catch (e) { /* optional */ } }
  _live() { if (this.lab) return true; const m = G.match; return !!(m && !m.attract && G.mode === 'match'); }
  _local() { return this.lab ? this.lab.local : G.match?.local || null; }
  _actors() { return this.lab ? this.lab.actors || [] : G.match?.actors || G.actors || []; }
  _now() { return this._fxTime; }
  _specialId() { const a = this._local(); const w = a && WEAPONS[a.weaponId]; return w ? w.special : 'slam'; }

  _bindBus() {
    this._unsubs = [
      on('turf', ({ actor, area }) => { if (area > 0 && actor && actor === this._local() && this._live() && !G.match?.elim) { this._turfAcc += area * (MATCH.pointsPerM2 || 1); this._turfTotal += area * (MATCH.pointsPerM2 || 1); } }),
      on('hit', ({ attacker, victim, damage }) => {
        if (!this._live() || !attacker || attacker !== this._local()) return;
        this._lastHitDmg = damage || 0;
        if (victim) this._kills.dealt.set(victim, this._now());
      }),
      on('damage', ({ victim, attacker }) => {
        if (!this._live() || !victim || victim !== this._local() || !attacker || attacker === victim) return;
        this._addDamageDir(attacker);
      }),
      on('splatted', (e) => this._onSplatted(e)),
      on('respawn', ({ actor }) => { if (actor && actor === this._local()) { this._clearDamageDirs(); this._restart(this.shield, 'is-on'); } }),
      on('recoil', ({ amount }) => { if (this._live()) this._bloom = Math.min(1, this._bloom + 0.18 + (amount || 0) * 6); }),
      on('weapon:fire', ({ actor, hand }) => {
        if (!actor || actor !== this._local() || !this._live()) return;
        this._kick = 1;
        if (this._L.kind === 'dualies' && this._twin) { const el = this._twin[hand ? 1 : 0]; if (el && el.animate) el.animate(TWIN_KICK, TWIN_KICK_T); }
      }),
      on('weapon:dry', ({ actor }) => { if (actor === this._local() && this._live()) { this._restart(this.tank, 'is-dry'); this._restart(this.rlEl, 'is-dry'); this._restart(this.hop, 'is-dry'); } }),
      on('reload:start', ({ actor }) => { if (actor === this._local() && this._live()) this._restart(this.hop, 'is-reload'); }),
      on('reload:end', ({ actor }) => { if (actor === this._local() && this._live()) { this._restart(this.hop, 'is-loaded'); this._restart(this.tank, 'is-loaded'); } }),
      on('grenade:empty', ({ actor }) => { if (actor === this._local() && this._live()) { this._restart(this.subChip, 'is-short'); this._restart(this.hop, 'is-nonade'); } }),
      // ---- BREAKOUT rounds (docs/PAINTBALL.md): banners, countdown, round log, eliminations
      on('round:pre', (e) => this._onRoundPre(e)),
      on('round:count', (e) => this._onRoundCount(e)),
      on('round:start', (e) => this._onRoundStart(e)),
      on('round:end', (e) => this._onRoundEnd(e)),
      on('eliminated', (e) => this._onEliminated(e)),
      on('special:ready', ({ actor }) => { if (actor === this._local() && this._live()) this._restart(this.sp, 'is-flare'); }),
      on('superjump', ({ actor, phase, to }) => { if (actor === this._local() && phase === 'charge' && this._live()) this._snd('ui_confirm', { volume: 0.6 }); void to; }),
      on('match:state', ({ state, match }) => {
        if (!match || match.attract) return;
        if (state === 'intro') this._startMatchHud(match);
        if (state === 'playing') this.el.classList.add('is-live');
        if (state === 'finish' || state === 'judge') { this.el.classList.remove('is-live'); this._clearDamageDirs(); }
        if (state === 'finish' && match.elim) this._matchOverBanner(match);
      }),
    ];
  }

  _startMatchHud(match) {
    this._turfAcc = 0; this._turfTotal = 0; this._turfShown = 0; this._turfT = 0;
    this._kills = { times: [], streak: 0, first: false, lastKiller: null, dealt: new Map(), perActor: new Map() };
    this._clearDamageDirs();
    this.kcards.innerHTML = ''; this.callouts.innerHTML = ''; this.tpops.innerHTML = ''; this.downLayer.innerHTML = ''; this._downs = [];
    this.el.classList.remove('is-live');
    this._L.turfTxt = null;
    this.turfNum.textContent = '0';
    this.boss.setMode(!!match && match.mode === 'boss', match && match.boss);
    this._rounds = [];
    this._elim = !!(match && match.elim);
    this.el.classList.toggle('is-elim', this._elim); this.overLayer.classList.toggle('is-elim', this._elim);
    this._L.elim = this._elim; this._L.rkey = null;
    this.feedEl.innerHTML = '';
    this.bannerLayer.innerHTML = '';
    this.overLayer.querySelectorAll('.bk-fs').forEach((e) => e.remove());
    this._lineup(match);
  }

  // ================================================================ BREAKOUT: rounds, banners, eliminations
  _myT(match) { const l = (match && match.local) || this._local(); return l && l.team === 1 ? 1 : 0; }
  _teamName(t) { const n = (G.game && G.game.palette && G.game.palette.names) || TEAM_NAMES; return String(n[t] || TEAM_NAMES[t] || '').toUpperCase(); }
  _roundLive(match) { return !!(match && !match.attract && match === G.match && (this._live() || this.lab)); }

  /** Round-flow card (pre-round / round result / match over). tone: neutral | hot | win | lose | draw */
  _roundCard({ kind = 'pre', title = '', sub = '', score = null, tag = null, tone = 'neutral', hold = false, ms = 3400 }) {
    this.bannerLayer.querySelectorAll('.bk-bn').forEach((b) => { b.classList.add('is-out'); setTimeout(() => b.remove(), 320); });
    this.bannerLayer.querySelectorAll('.iw-bn[data-g="center"]').forEach((b) => b.remove());
    const scoreEl = score ? h('div', { class: 'bk-bn__score' },
      h('b', { class: 'bk-bn__sa' }, String(score[0])), h('i', null, '—'), h('b', { class: 'bk-bn__sb' }, String(score[1]))) : null;
    const count = kind === 'pre' ? h('div', { class: 'bk-bn__count' }) : null;
    const el = h('div', { class: `bk-bn bk-bn--${kind} is-${tone}` },
      h('div', { class: 'bk-bn__band' }, h('i'), h('i')),
      tag ? h('div', { class: 'bk-bn__tag' }, tag) : null,
      h('div', { class: 'bk-bn__title bk-sport' }, title),
      scoreEl,
      sub ? h('div', { class: 'bk-bn__sub' }, sub) : null,
      count);
    this.bannerLayer.appendChild(el);
    el._count = count;
    if (!hold) setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 380); }, ms);
    else setTimeout(() => { if (el.isConnected) { el.classList.add('is-out'); setTimeout(() => el.remove(), 380); } }, 9000);   // failsafe
    return el;
  }

  _onRoundPre({ round, match }) {
    if (!this._roundLive(match)) return;
    this.hideSplatted(true);
    this._clearDamageDirs();
    const my = this._myT(match), w = match.roundWins || [0, 0], tw = ROUNDS.toWin || 4;
    const mpMe = w[my] === tw - 1, mpThem = w[1 - my] === tw - 1;
    const tag = mpMe && mpThem ? 'DECIDER' : mpMe ? 'MATCH POINT' : mpThem ? `MATCH POINT · ${this._teamName(1 - my)}` : null;
    this._preCard = this._roundCard({ kind: 'pre', title: `ROUND ${round}`, score: round > 1 ? [w[my], w[1 - my]] : null,
      sub: round > 1 ? null : `FIRST TO ${tw} ROUNDS · ONE LIFE EACH`, tag, tone: mpMe || mpThem ? 'hot' : 'neutral', hold: true });
  }

  _onRoundCount({ n }) {
    if (!this._live()) return;
    const c = this._preCard && this._preCard.isConnected ? this._preCard._count : null;
    if (!c) { this.countdown(n); return; }
    c.textContent = String(n);
    this._restart(c, 'is-pop');
  }

  _onRoundStart({ match }) {
    if (!this._roundLive(match)) return;
    if (this._preCard) { const p = this._preCard; this._preCard = null; p.classList.add('is-out'); setTimeout(() => p.remove(), 320); }
    this.banner('go', 'BREAK!');
  }

  _onRoundEnd({ round, winner, reason, roundWins, match }) {
    if (!this._roundLive(match)) return;
    const my = this._myT(match), w = roundWins || match.roundWins || [0, 0], tw = ROUNDS.toWin || 4;
    const alive = [match.aliveCount ? match.aliveCount(0) : 0, match.aliveCount ? match.aliveCount(1) : 0];
    this._rounds[round - 1] = { winner, reason, alive };
    const won = winner === my, draw = winner < 0;
    let sub;
    if (reason === 'wipe') sub = draw ? 'BOTH TEAMS ELIMINATED' : won ? 'ENEMY TEAM ELIMINATED' : 'TEAM ELIMINATED';
    else if (alive[my] !== alive[1 - my]) sub = `TIME · ${alive[my]} v ${alive[1 - my]} LEFT`;
    else sub = draw ? 'TIME · DEAD EVEN' : `TIME · ${won ? 'MORE' : 'LESS'} HP LEFT`;
    const over = w[0] >= tw || w[1] >= tw;
    const mp = !over && (w[my] === tw - 1 || w[1 - my] === tw - 1);
    const tag = over ? (w[my] >= tw ? 'MATCH WON' : 'MATCH LOST') : mp ? 'MATCH POINT' : null;
    this._roundCard({ kind: 'end', title: draw ? 'DRAW' : won ? 'ROUND WON' : 'ROUND LOST', sub, score: [w[my], w[1 - my]], tag, tone: draw ? 'draw' : won ? 'win' : 'lose', ms: 3300 });
    this._preCard = null;
  }

  _matchOverBanner(match) {
    const my = this._myT(match), w = match.roundWins || [0, 0];
    this._roundCard({ kind: 'over', title: 'MATCH OVER', score: [w[my], w[1 - my]], tone: w[my] > w[1 - my] ? 'win' : w[my] < w[1 - my] ? 'lose' : 'draw', ms: 2600 });
  }

  _onEliminated({ victim, attacker, cause }) {
    if (!victim || !this._live() || !G.match || !G.match.elim) return;
    const me = this._local();
    const col = (t) => toHex(G.teamHex?.[t], t === this._myTeam() ? (this._L.ca || '#ff8a14') : (this._L.cb || '#2f5bff'));
    const by = attacker && attacker !== victim ? attacker : null;
    const mine = !!(by && by === me), mineOut = victim === me;
    const el = h('div', { class: 'bk-kf' + (mine ? ' is-mine' : '') + (mineOut ? ' is-me' : '') + (victim.team === this._myTeam() ? ' is-ally-out' : '') },
      by ? h('span', { class: 'bk-kf__a' }, by === me ? 'YOU' : by.name) : null,
      h('span', { class: 'bk-kf__w', html: by ? weaponIcon(kindOf(by.weaponId)) : OUT_ICON }),
      h('span', { class: 'bk-kf__v' }, victim === me ? 'YOU' : victim.name),
      h('em', { class: 'bk-kf__out' }, by ? 'OUT' : cause === 'water' ? 'OUT OF BOUNDS' : 'OUT'));
    colorVars(el, 'a', by ? col(by.team) : '#ffffff');
    colorVars(el, 'v', col(victim.team));
    this.feedEl.prepend(el);
    const items = [...this.feedEl.children].filter((c) => !c._out);
    for (let i = 5; i < items.length; i++) this._expireFeed(items[i], true);
    el._t = setTimeout(() => this._expireFeed(el), 5200);
  }

  _updRound(r) {
    if (!r) return;
    const L = this._L, tw = r.toWin || ROUNDS.toWin || 4;
    const key = `${r.n}|${r.wins[0]}|${r.wins[1]}|${r.alive[0]}|${r.alive[1]}|${r.phase}`;
    if (key === L.rkey) return;
    const prev = L.rstate;
    L.rkey = key; L.rstate = { wins: [...r.wins], alive: [...r.alive] };
    this.roundLbl.textContent = `ROUND ${Math.max(1, r.n)}`;
    for (let s = 0; s < 2; s++) {
      const box = this.wins[s];
      const n = r.wins[s] | 0;
      box.firstChild.textContent = String(n);
      const pips = box.children[1].children;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('is-on', i < n);
      box.classList.toggle('is-mp', n === tw - 1);
      box.lastChild.firstChild.textContent = String(r.alive[s] | 0);
      box.classList.toggle('is-down', (r.alive[s] | 0) === 0);
      if (prev && prev.wins[s] !== n && n > prev.wins[s]) this._restart(box, 'is-bump');
      if (prev && prev.alive[s] > r.alive[s]) this._restart(box.lastChild, 'is-drop');
    }
    const mp = r.phase !== 'post' && (r.wins[0] === tw - 1 || r.wins[1] === tw - 1);
    this.mpEl.classList.toggle('is-on', mp);
    this.mpEl.textContent = r.wins[0] === tw - 1 && r.wins[1] === tw - 1 ? 'DECIDER' : 'MATCH POINT';
    this.timer.classList.toggle('is-pre', r.phase === 'pre');
    this.timer.classList.toggle('is-post', r.phase === 'post');
  }

  _updSpectate(me, r) {
    const L = this._L;
    let tgt = null;
    if (r && me && me.alive === false && G.match && G.match.state === 'playing') {
      const s = G.rig && G.rig.spectate;
      const a = s && s.actor;
      if (a && a !== me && a.team === me.team && a.alive) tgt = a;
    }
    const key = tgt ? `${tgt.name}|${tgt.weaponId}|${r.alive[0]}` : '';
    if (key === L.spec) return;
    const was = !!L.spec;
    L.spec = key;
    this.specEl.classList.toggle('is-on', !!tgt);
    if (!tgt) return;
    this.specEl.querySelector('.bk-spec__name').textContent = tgt.name;
    this.specEl.querySelector('.bk-spec__w').innerHTML = weaponIcon(kindOf(tgt.weaponId));
    this.specEl.querySelector('.bk-spec__left').textContent = `${r.alive[0]} LEFT`;
    colorVars(this.specEl, 'c', toHex(G.teamHex?.[tgt.team], this._L.ca || '#ff8a14'));
    if (was) this._restart(this.specEl, 'is-switch');
    if (this._splatted && this._splatted.out) this._splatted.el.classList.add('is-docked');
  }

  _onSplatted({ victim, attacker }) {
    if (!this._live() || !victim) return;
    const me = this._local();
    const K = this._kills;
    const now = this._now();
    // per-actor streaks (for "shutdown" / revenge bookkeeping)
    if (!K.perActor) K.perActor = new Map();
    const vStreak = K.perActor.get(victim) || 0;
    K.perActor.set(victim, 0);
    if (attacker && attacker !== victim) K.perActor.set(attacker, (K.perActor.get(attacker) || 0) + 1);
    if (victim === me) {
      K.lastKiller = attacker || null;
      K.streak = 0;
      this._clearDamageDirs();
      return;
    }
    if (attacker && attacker === me) {
      K.times = K.times.filter((t) => now - t < 4.2);
      K.times.push(now);
      K.streak++;
      const multi = K.times.length;
      this._killCard(victim, 'kill');
      // callouts, most important first
      let call = null, sub = null;
      const enemies = this._actors().filter((a) => a.team !== me.team);
      if (enemies.length >= 4 && enemies.every((a) => !a.alive)) { call = 'WIPEOUT!'; sub = 'Their whole team is out'; }
      else if (multi >= 2) call = STREAKS[Math.min(4, multi)];
      else if (!K.first) { call = 'FIRST ELIM!'; }
      else if (K.lastKiller && victim === K.lastKiller) { call = 'REVENGE!'; K.lastKiller = null; }
      else if (vStreak >= 3) { call = 'SHUTDOWN!'; sub = `Ended ${victim.name}'s streak`; }
      else if (K.streak >= 3 && K.streak % 2 === 1) { call = `STREAK ×${K.streak}`; }
      K.first = true;
      if (call) this._callout(call, sub, multi >= 3 || call === 'WIPEOUT!');
      return;
    }
    if (me && attacker && attacker.team === me.team && K.dealt.has(victim) && now - K.dealt.get(victim) < 4) {
      this._killCard(victim, 'assist');
      K.dealt.delete(victim);
    }
    if (me && victim.team === me.team) this._allyDown(victim, attacker);
  }

  // ---------------------------------------------------------------- kill / assist cards + callouts
  _killCard(victim, kind) {
    const col = toHex(G.teamHex?.[victim.team], kind === 'assist' ? '#ffffff' : (this._L.cb || '#2f5bff'));
    const card = h('div', { class: `iw-kcard iw-kcard--${kind}` },
      h('span', { class: 'iw-kcard__splat', html: splatSVG({ seed: 30 + ((Math.random() * 40) | 0), cls: 'iw-fself', r: 56, arms: 9, drops: 4 }) }),
      h('span', { class: 'iw-kcard__w', html: weaponIcon(kindOf(victim.weaponId)) }),
      h('span', { class: 'iw-kcard__txt' },
        h('small', null, kind === 'assist' ? 'ASSIST' : 'ELIMINATED'),
        h('b', null, victim.name || 'Player')));
    colorVars(card, 'v', col);
    this.kcards.prepend(card);
    const cards = [...this.kcards.children].filter((c) => !c._out);
    for (let i = 2; i < cards.length; i++) this._dropCard(cards[i], true);
    card._t = setTimeout(() => this._dropCard(card), kind === 'assist' ? 1700 : 2200);
    this.el.classList.add('has-cards');
    if (kind === 'assist') this._snd('hit_marker', { volume: 0.4, pitch: 1.3 });
  }
  _dropCard(card, fast) {
    if (card._out) return;
    card._out = true;
    clearTimeout(card._t);
    card.classList.add('is-out');
    setTimeout(() => { card.remove(); if (!this.kcards.children.length) this.el.classList.remove('has-cards'); }, fast ? 200 : 420);
  }
  _callout(text, sub, big) {
    this.callouts.querySelectorAll('.iw-call').forEach((c) => c.remove());
    const el = h('div', { class: 'iw-call' + (big ? ' is-big' : '') },
      h('span', { class: 'iw-call__ribbon' }),
      h('span', { class: 'iw-call__txt iw-display' }, text),
      sub ? h('small', { class: 'iw-call__sub' }, sub) : null);
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 3200);
    this.callouts.appendChild(el);
    this._snd(big ? 'special_ready' : 'ui_confirm', { volume: big ? 0.7 : 0.55 });
  }

  // ---------------------------------------------------------------- intro lineup
  _lineup(match) {
    this.overLayer.querySelectorAll('.iw-lineup').forEach((e) => e.remove());
    const actors = (match && match.actors) || this._actors();
    if (!actors.length) return;
    const names = (G.game && G.game.palette && G.game.palette.names) || TEAM_NAMES;
    const col = (t) => toHex(G.teamHex?.[t], t ? '#2f5bff' : '#ff8a14');
    const side = (t) => {
      const list = actors.filter((a) => a.team === t);
      const wrap = h('div', { class: `iw-lu__team iw-lu__team--${t ? 'b' : 'a'}` },
        h('div', { class: 'iw-lu__name iw-display' }, (names[t] || TEAM_NAMES[t] || '').toUpperCase()),
        list.map((a, i) => h('div', { class: 'iw-lu__card' + (a.isLocal ? ' is-self' : ''), style: { '--i': i } },
          h('span', { class: 'iw-lu__w', html: weaponIcon(kindOf(a.weaponId)) }),
          h('span', { class: 'iw-lu__txt' }, h('b', null, a.name), h('small', null, (WEAPONS[a.weaponId] || {}).name || '')),
          a.isLocal ? h('em', null, 'YOU') : null)));
      colorVars(wrap, 't', col(t));
      return wrap;
    };
    if (this.boss.on) {
      // boss mode: the whole squad (two columns) vs HULLBREAKER
      const squad = side(0);
      squad.classList.add('is-squad');
      squad.querySelector('.iw-lu__name').textContent = 'YOUR SQUAD';
      const foe = h('div', { class: 'iw-lu__team iw-lu__team--b iw-lu__foe' },
        h('div', { class: 'iw-lu__name iw-display' }, BOSS_NAME),
        h('div', { class: 'iw-lu__bosscard' }, h('span', { class: 'iw-lu__bossart', html: bossEmblem() }), h('small', null, BOSS_EPITHET)));
      colorVars(foe, 't', col(1));
      const bel = h('div', { class: 'iw-lineup is-boss' }, squad,
        h('div', { class: 'iw-lu__vs' }, h('span', { class: 'iw-lu__vsplat', html: splatSVG({ seed: 77, fill: '#fff', r: 56, arms: 10, drops: 6 }) }), h('span', { class: 'iw-display' }, 'VS')),
        foe);
      this.overLayer.appendChild(bel);
      // out before HULLBREAKER bursts up (boss time 1.8 s) so the title card has the stage
      setTimeout(() => bel.classList.add('is-out'), 1650);
      setTimeout(() => bel.remove(), 2200);
      return;
    }
    const el = h('div', { class: 'iw-lineup' },
      side(this._myTeam()),
      h('div', { class: 'iw-lu__vs' }, h('span', { class: 'iw-lu__vsplat', html: splatSVG({ seed: 77, fill: '#fff', r: 56, arms: 10, drops: 6 }) }), h('span', { class: 'iw-display' }, 'VS')),
      side(1 - this._myTeam()));
    this.overLayer.appendChild(el);
    [0, 1, 2, 3].forEach((i) => setTimeout(() => { if (el.isConnected) this._snd('ui_hover', { volume: 0.5, pitch: 0.9 + i * 0.08 }); }, 250 + i * 90));
    setTimeout(() => el.classList.add('is-out'), 2900);
    setTimeout(() => el.remove(), 3500);
  }

  // ---------------------------------------------------------------- damage direction arcs
  _addDamageDir(attacker) {
    let d = this._dd.find((x) => x.a === attacker);
    if (!d) {
      if (this._dd.length >= 6) { const old = this._dd.shift(); old.el.remove(); }
      const el = h('div', { class: 'iw-dd', html: `<svg viewBox="-110 -110 220 220" aria-hidden="true"><path class="o" d="${DD_PATH}"/><path class="f" d="${DD_PATH}"/></svg>` });
      colorVars(el, 'c', toHex(G.teamHex?.[attacker.team], this._L.cb || '#2f5bff'));
      this.ddLayer.appendChild(el);
      d = { a: attacker, el, t: 0, ang: null, px: 0, pz: 0 };
      this._dd.push(d);
    }
    d.t = 0;
    if (attacker.pos) { d.px = attacker.pos.x; d.pz = attacker.pos.z; }
    this._restart(d.el, 'is-hit');
  }
  _clearDamageDirs() { for (const d of this._dd) d.el.remove(); this._dd = []; }
  _updDamageDirs(dt) {
    if (!this._dd.length) return;
    const cam = G.camera;
    let fx = 0, fz = 1, rx = 1, rz = 0, cx = 0, cz = 0;
    if (cam && cam.matrixWorld) {
      const e = cam.matrixWorld.elements;
      fx = -e[8]; fz = -e[10]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      rx = e[0]; rz = e[2]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      cx = cam.position.x; cz = cam.position.z;
    }
    for (let i = this._dd.length - 1; i >= 0; i--) {
      const d = this._dd[i];
      d.t += dt;
      if (d.t > 1.6) { d.el.remove(); this._dd.splice(i, 1); continue; }
      if (d.a && d.a.pos && d.a.alive !== false) { d.px = d.a.pos.x; d.pz = d.a.pos.z; }
      const vx = d.px - cx, vz = d.pz - cz;
      const ang = Math.atan2(vx * rx + vz * rz, vx * fx + vz * fz);
      const o = d.t < 1.0 ? 1 : 1 - (d.t - 1.0) / 0.6;
      d.el.style.transform = `rotate(${ang.toFixed(3)}rad)`;
      d.el.style.opacity = o.toFixed(2);
    }
  }

  // ---------------------------------------------------------------- ally-down pings
  _allyDown(victim, attacker) {
    if (!victim.pos) return;
    const el = h('div', { class: 'iw-down' }, h('i', { html: OUT_ICON }), h('span', null, victim.name));
    colorVars(el, 'c', toHex(G.teamHex?.[victim.team], this._L.ca || '#ff8a14'));
    this.downLayer.appendChild(el);
    this._downs.push({ el, x: victim.pos.x, y: victim.pos.y + 1.2, z: victim.pos.z, t: 0 });
    if (this._downs.length > 4) this._downs.shift().el.remove();
    void attacker;
  }
  _updDowns(dt) {
    if (!this._downs.length) return;
    const cam = G.camera;
    const W = innerWidth, H = innerHeight;
    for (let i = this._downs.length - 1; i >= 0; i--) {
      const d = this._downs[i];
      d.t += dt;
      if (d.t > 3 || !cam) { d.el.remove(); this._downs.splice(i, 1); continue; }
      const p = this._project(cam, d.x, d.y, d.z);
      const vis = p && p.z < 1 && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1;
      if (!vis) { d.el.style.opacity = '0'; continue; }
      const o = d.t < 2.4 ? 1 : 1 - (d.t - 2.4) / 0.6;
      d.el.style.opacity = o.toFixed(2);
      d.el.style.transform = `translate3d(${((p.x * 0.5 + 0.5) * W).toFixed(1)}px,${((-p.y * 0.5 + 0.5) * H).toFixed(1)}px,0)`;
    }
  }
  _project(cam, x, y, z) {
    // world → NDC without three.js (camera matrices are plain arrays)
    const v = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
    const ex = v[0] * x + v[4] * y + v[8] * z + v[12], ey = v[1] * x + v[5] * y + v[9] * z + v[13], ez = v[2] * x + v[6] * y + v[10] * z + v[14];
    const cx = p[0] * ex + p[4] * ey + p[8] * ez + p[12], cy = p[1] * ex + p[5] * ey + p[9] * ez + p[13], cz = p[2] * ex + p[6] * ey + p[10] * ez + p[14], cw = p[3] * ex + p[7] * ey + p[11] * ez + p[15];
    if (Math.abs(cw) < 1e-6) return null;
    return { x: cx / cw, y: cy / cw, z: cw < 0 ? 2 : cz / cw };
  }

  // ================================================================ per-frame pieces
  _updTimer(time) {
    if (time == null) return;
    const L = this._L;
    const txt = fmtTime(time);
    if (txt !== L.timer) {
      L.timer = txt;
      this.timerTxt.textContent = txt;
      if (time <= 10.001 && time > 0) this.timer.animate([{ transform: 'scale(1.3) rotate(-4deg)' }, { transform: 'scale(1)' }], BUMP);
    }
    const fin = time <= 10.001;
    if (fin !== L.fin) { L.fin = fin; this.timer.classList.toggle('is-final', fin); }
    const last = time <= 60.001 && !fin && !this._elim;
    if (last !== L.lastMin) { L.lastMin = last; this.timer.classList.toggle('is-last', last); }
  }

  // online you can be on Bravo: the HUD is drawn from your side (your squad left, your colour as "self")
  _myTeam() { return G.local && G.local.team === 1 ? 1 : 0; }
  _actorFor(side, i) {
    const team = side ^ this._myTeam();
    const list = this._actors().filter((a) => a.team === team);
    return list[i] || null;
  }

  _updSquads(teams) {
    const L = this._L;
    for (let t = 0; t < 2; t++) {
      const ps = (teams[t] && teams[t].players) || [];
      const icons = this.squads[t].children;
      for (let i = 0; i < 4; i++) {
        const p = ps[i];
        const el = icons[i];
        const k = `sq${t}${i}`;
        if (!p) { if (L[k] !== 'none') { L[k] = 'none'; el.classList.add('is-empty'); } continue; }
        const w = p.weapon || (this._actorFor(t, i) || {}).weaponId || 'shooter';
        const key = `${p.alive ? 1 : 0}|${p.alive ? 0 : Math.ceil(p.respawn || 0)}|${p.specialReady ? 1 : 0}|${p.isSelf ? 1 : 0}|${w}`;
        if (L[k] === key) continue;
        const prev = L[k];
        L[k] = key;
        el.classList.remove('is-empty');
        if (el._w !== w) { el._w = w; el.querySelector('.iw-sq__w').innerHTML = weaponIcon(kindOf(w)); }
        const wasAlive = prev && prev !== 'none' ? prev[0] === '1' : true;
        const wasReady = prev && prev !== 'none' ? prev.split('|')[2] === '1' : false;
        el.classList.toggle('is-dead', !p.alive);
        el.classList.toggle('is-ready', !!p.specialReady && !!p.alive);
        el.classList.toggle('is-self', !!p.isSelf);
        el.querySelector('.iw-sq__n').textContent = p.alive ? '' : this._elim ? 'OUT' : String(Math.max(0, Math.ceil(p.respawn || 0)) || '');
        el.classList.toggle('is-out', !p.alive && this._elim);
        if (wasAlive && !p.alive && this._elim) {
          el.animate([{ transform: 'scale(1.35) rotate(-10deg)' }, { transform: 'scale(.9) rotate(3deg)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34,1.6,.64,1)' });
        } else if (wasAlive && !p.alive) {
          el.animate([{ transform: 'scale(1.4) rotate(-14deg)' }, { transform: 'scale(.92) rotate(4deg)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34,1.6,.64,1)' });
          const ring = el.querySelector('.iw-sq__ring circle');
          ring.style.animationDuration = `${Math.max(0.2, p.respawn || PLAYER.respawnTime)}s`;
          this._restart(el, 'is-dying');
        } else if (!wasAlive && p.alive) {
          el.animate([{ transform: 'translateY(-10px) scale(1.25)' }, { transform: 'none' }], BUMP);
          el.classList.remove('is-dying');
        }
        if (!wasReady && p.specialReady && p.alive) this._restart(el, 'is-readyflash');
      }
    }
  }

  _buildReticle(kind) {
    const r = this.ret;
    r.className = `iw-ret iw-ret--${kind}`;
    if (kind === 'charger') {
      const C = 2 * Math.PI * 25;
      r.innerHTML = `<i class="iw-ret__dot"></i><i class="iw-ret__line l"></i><i class="iw-ret__line r"></i><i class="iw-ret__line d"></i>
        <svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true"><circle r="25" class="iw-ret__track"/><circle r="25" class="iw-ret__charge" style="stroke-dasharray:${C.toFixed(2)};stroke-dashoffset:${C.toFixed(2)}"/>
        <g class="iw-ret__notch"><path d="M0 -31 L0 -36"/><path d="M31 0 L36 0"/><path d="M0 31 L0 36"/><path d="M-31 0 L-36 0"/></g></svg>`;
      this._chargeC = C;
      this._chargeEl = r.querySelector('.iw-ret__charge');
    } else if (kind === 'blaster') {
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <circle r="23" class="iw-ret__ring" pathLength="100" style="stroke-dasharray:19 6;stroke-dashoffset:9.5"/><circle r="9" class="iw-ret__ring thin"/></svg>`;
    } else if (kind === 'roller') {
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg wide" viewBox="-80 -40 160 80" aria-hidden="true">
        <path class="iw-ret__ring" d="M-46 -15 L-56 -15 Q-60 -15 -60 -11 L-60 11 Q-60 15 -56 15 L-46 15"/>
        <path class="iw-ret__ring" d="M46 -15 L56 -15 Q60 -15 60 -11 L60 11 Q60 15 56 15 L46 15"/>
        <path class="iw-ret__ring thin" d="M-30 22 Q0 30 30 22"/></svg>`;
    } else if (kind === 'dualies') {
      // twin reticle: one ring per pistol (each kicks on its own shot), spread ticks, and a lock diamond after a roll
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <circle cx="-10.5" r="6.2" class="iw-ret__ring thin iw-ret__twin l"/><circle cx="10.5" r="6.2" class="iw-ret__ring thin iw-ret__twin r"/>
        <path class="iw-ret__lock" d="M0 -19 L19 0 L0 19 L-19 0 Z"/></svg>
        <i class="iw-ret__tick" style="--a:0deg"></i><i class="iw-ret__tick" style="--a:90deg"></i><i class="iw-ret__tick" style="--a:180deg"></i><i class="iw-ret__tick" style="--a:270deg"></i>`;
      this._twin = [r.querySelector('.iw-ret__twin.r'), r.querySelector('.iw-ret__twin.l')];
    } else if (kind === 'slosher') {
      // the lob: an arch over the aim point and a landing "bucket" bracket under it
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <path class="iw-ret__ring iw-ret__arch" d="M-24 6 Q0 -26 24 6"/><path class="iw-ret__ring thin" d="M-10 13 L-6 18 L6 18 L10 13"/>
        <path class="iw-ret__ring thin" d="M-24 6 L-27 1 M24 6 L27 1"/></svg>`;
    } else if (kind === 'splatling') {
      // spin-up meter (8 segments) that fills while charging and drains while the stream runs + spread ticks
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true"><circle r="21" class="iw-ret__track"/>
        <circle r="21" class="iw-ret__charge" pathLength="100" style="stroke-dasharray:100;stroke-dashoffset:100"/>
        <g class="iw-ret__segs">${Array.from({ length: 8 }, (_, i) => `<path d="M0 -17 L0 -25" transform="rotate(${i * 45})"/>`).join('')}</g></svg>
        <i class="iw-ret__tick" style="--a:90deg"></i><i class="iw-ret__tick" style="--a:270deg"></i>`;
      this._chargeEl = r.querySelector('.iw-ret__charge'); this._chargeC = 100;
    } else {
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true"><circle r="15" class="iw-ret__ring thin"/></svg>
        <i class="iw-ret__tick" style="--a:0deg"></i><i class="iw-ret__tick" style="--a:90deg"></i><i class="iw-ret__tick" style="--a:180deg"></i><i class="iw-ret__tick" style="--a:270deg"></i>`;
    }
    this._L.spread = null; this._L.charge = null; this._L.full = null;
  }

  _updCrosshair(f, dt) {
    const L = this._L;
    const w = f.weapon || 'shooter';
    if (w !== L.weapon) {
      L.weapon = w;
      const W = WEAPONS[w];
      const kind = (W && W.kind) || w;
      this._buildReticle(kind);
      L.kind = kind;
      this.xh.className = `iw-xh iw-xh--${kind}` + (L.tgt ? ' is-target' : '') + (L.far ? ' is-far' : '');
      this.spIcon.innerHTML = specialIcon(W ? W.special : 'slam');
    }
    // per-shot kick (recoil events) on top of the live cone the engine reports in screen px (already includes bloom)
    this._bloom = Math.max(0, this._bloom - dt * 5);
    this._kick = Math.max(0, (this._kick || 0) - dt * 16);   // per-shot reticle kick (~60 ms), on top of the live spread
    const ch = f.crosshair || {};
    if (L.kind === 'shooter' || L.kind === 'blaster' || L.kind === 'dualies' || L.kind === 'splatling') {
      const kk = L.kind === 'blaster' ? 0 : this._kick * this._kick * (L.kind === 'splatling' ? 4 : 7);
      const sp = clamp((+ch.spread || 0) + this._bloom * (L.kind === 'blaster' ? 5 : 2.5) + kk, 0, 90);
      if (L.spread == null || Math.abs(sp - L.spread) > 0.25) { L.spread = sp; this.ret.style.setProperty('--sp', sp.toFixed(1)); }
    } else {
      const b = this._bloom;
      if (L.bl == null || Math.abs(b - L.bl) > 0.02) { L.bl = b; this.ret.style.setProperty('--bl', b.toFixed(2)); }
    }
    const tgt = ch.onTarget === 'enemy';
    if (tgt !== L.tgt) { L.tgt = tgt; this.xh.classList.toggle('is-target', tgt); }
    const far = ch.inRange === false && !tgt;
    if (far !== L.far) { L.far = far; this.xh.classList.toggle('is-far', far); }
    if (L.kind === 'charger') {
      const c = clamp(+f.charge || 0);
      if (L.charge == null || Math.abs(c - L.charge) > 0.004) {
        L.charge = c;
        this._chargeEl.style.strokeDashoffset = (this._chargeC * (1 - c)).toFixed(2);
        this.ret.style.setProperty('--ch', c.toFixed(3));
      }
      const full = c >= 0.999;
      if (full !== L.full) { L.full = full; this.ret.classList.toggle('is-full', full); if (full) this._restart(this.ret, 'is-flash'); }
      const charging = c > 0.001;
      if (charging !== L.charging) { L.charging = charging; this.ret.classList.toggle('is-charging', charging); }
    } else if (L.kind === 'splatling') {
      const lr = this._local()?.weaponRunner;
      const c = clamp(+f.charge || 0), streaming = !!(lr && lr.streaming);
      if (L.charge == null || Math.abs(c - L.charge) > 0.004) { L.charge = c; this._chargeEl.style.strokeDashoffset = (100 * (1 - c)).toFixed(2); this.ret.style.setProperty('--ch', c.toFixed(3)); }
      if (streaming !== L.streaming) { L.streaming = streaming; this.ret.classList.toggle('is-streaming', streaming); }
      const full = !streaming && c >= 0.999;
      if (full !== L.full) { L.full = full; this.ret.classList.toggle('is-full', full); if (full) this._restart(this.ret, 'is-flash'); }
    } else if (L.kind === 'dualies') {
      const lr = this._local()?.weaponRunner;
      const lock = !!(lr && lr.lockT > 0), roll = !!(lr && lr.dodge);
      if (lock !== L.lock) { L.lock = lock; this.ret.classList.toggle('is-lock', lock); }
      if (roll !== L.roll) { L.roll = roll; this.ret.classList.toggle('is-roll', roll); }
    }
    if (L.kind === 'slosher') {
      const k = this._kick;
      if (L.bk == null || Math.abs(k - L.bk) > 0.02) { L.bk = k; this.ret.style.setProperty('--kk', k.toFixed(2)); }
    }
    // spawn shield + bomb aim (read straight off the local actor; absent in the lab unless mocked)
    const a = this._local();
    const inv = !!(a && a.alive && a.invuln > 0.05);
    if (inv !== L.inv) { L.inv = inv; this.shield.classList.toggle('is-up', inv); }
    const aim = !!(a && a.alive && a.weaponRunner && a.weaponRunner.aimingSub) || !!f.subAim;
    if (aim !== L.aim) { L.aim = aim; this.subChip.classList.toggle('is-on', aim); if (aim) this._snd('ui_toggle', { volume: 0.35 }); }
    if (aim) {
      const n = f.grenades ?? (a && a.grenades) ?? 0;
      const ok = n > 0;
      if (ok !== L.aimOk) { L.aimOk = ok; this.subChip.classList.toggle('is-short', !ok); }
      const txt = `×${n}`;
      if (txt !== L.aimTxt) { L.aimTxt = txt; this.subChip.lastChild.textContent = txt; }
    }
  }

  // ---------------------------------------------------------------- hopper (paintball ammo): panel + reticle meter
  _updHopper(f, dt) {
    const L = this._L, T = this._hop;
    const max = Math.max(1, f.ammoMax || 100);
    const ammo = Math.max(0, Math.round(f.ammo ?? (f.ink ?? 1) * max));
    const frac = clamp(ammo / max);
    const reloading = !!f.reloading, rf = clamp(+f.reloadFrac || 0);
    const empty = ammo <= 0 && !reloading, low = !empty && !reloading && frac < 0.25;
    // the pod visibly refills while the reload runs
    const target = reloading ? lerp(frac, 1, rf) : frac;
    T.level += (target - T.level) * (1 - Math.exp(-dt * 18));
    if (Math.abs(T.level - target) < 0.002) T.level = target;
    if (Math.abs(T.level - T.shown) > 0.002) {
      T.shown = T.level;
      this.hopLvl.setAttribute('transform', `translate(0 ${(3 + (1 - T.level) * 57).toFixed(2)})`);
      this.magFill.style.transform = `scaleY(${T.level.toFixed(3)})`;
    }
    const txt = String(ammo);
    if (txt !== L.ammoTxt) {
      const dropped = L.ammoTxt != null && ammo < +L.ammoTxt;
      L.ammoTxt = txt; this.hopN.textContent = txt;
      if (!dropped) this.hopN.animate([{ scale: '1.25' }, { scale: '1' }], { duration: 220, easing: 'cubic-bezier(.34,1.8,.64,1)' });
    }
    const mtxt = `/ ${max}`;
    if (mtxt !== L.ammoMaxTxt) { L.ammoMaxTxt = mtxt; this.hopMax.textContent = mtxt; }
    const bar = reloading ? rf : frac;
    if (L.hopBar == null || Math.abs(bar - L.hopBar) > 0.003) { L.hopBar = bar; this.hopBar.style.transform = `scaleX(${bar.toFixed(3)})`; }
    const st = reloading ? 'rl' : empty ? 'empty' : low ? 'low' : 'ok';
    if (st !== L.hopSt) {
      L.hopSt = st;
      for (const el of [this.hop, this.tank, this.rlEl]) {
        el.classList.toggle('is-reloading', st === 'rl'); el.classList.toggle('is-empty', st === 'empty'); el.classList.toggle('is-low', st === 'low');
      }
      this.hopState.textContent = st === 'rl' ? 'RELOADING' : st === 'empty' ? 'EMPTY' : st === 'low' ? 'LOW' : '';
      const pad = G.input && G.input.lastDevice === 'pad';
      const key = pad ? '{X}' : '[R]';
      this.rlTxt.innerHTML = st === 'rl' ? 'RELOADING' : st === 'empty' ? richText(`EMPTY — ${key} RELOAD`) : st === 'low' ? richText(`${key} — RELOAD`) : '';
      this.rlEl.classList.toggle('is-on', st !== 'ok');
    }
    if (reloading && (L.rlF == null || Math.abs(rf - L.rlF) > 0.004)) { L.rlF = rf; this.rlBar.style.transform = `scaleX(${rf.toFixed(3)})`; }
    // reticle meter fades when the hopper is full and idle
    L.fullT = frac >= 0.999 && !reloading && !L.aim ? (L.fullT || 0) + dt : 0;
    const idle = L.fullT > 1.4;
    if (idle !== L.idle) { L.idle = idle; this.tank.classList.toggle('is-idle', idle); }
    // grenades + sprint
    const gMax = f.grenadesMax ?? this.nadePips.length, g = Math.max(0, f.grenades ?? gMax);
    const gk = `${g}|${gMax}`;
    if (gk !== L.nades) {
      const prevG = L.nadesN;
      L.nades = gk; L.nadesN = g;
      this.nadePips.forEach((p, i) => { p.style.display = i < gMax ? '' : 'none'; p.classList.toggle('is-on', i < g); });
      if (prevG != null && g < prevG && this.nadePips[g]) this._restart(this.nadePips[g], 'is-used');
    }
    const spr = !!f.sprinting;
    if (spr !== L.sprint) { L.sprint = spr; this.sprintEl.classList.toggle('is-on', spr); this.hop.classList.toggle('is-sprint', spr); }
  }

  // ---------------------------------------------------------------- special gauge
  _updSpecial(f, dt) {
    const L = this._L;
    const s = clamp(+f.special || 0);
    if (L.special == null || Math.abs(s - L.special) > 0.002) {
      if (L.special != null && s > L.special + 0.035 && s < 0.999) {
        this.sp.animate([{ scale: '1.08' }, { scale: '1' }], { duration: 260, easing: 'cubic-bezier(.34,1.8,.64,1)' });
        this._restart(this.sp, 'is-gain');
      }
      L.special = s;
      this.spLiquid.style.transform = `translateY(${(100 - s * 92 - 4).toFixed(2)}px)`;
      const pt = s >= 0.999 ? '' : `${Math.floor(s * 100)}%`;
      if (pt !== L.spTxt) { L.spTxt = pt; this.spPct.textContent = pt; }
    }
    const ready = !!f.specialReady;
    if (ready !== L.ready) {
      L.ready = ready;
      this.sp.classList.toggle('is-ready', ready);
      if (ready) {
        this.sp.animate([{ transform: 'scale(1.35) rotate(-10deg)' }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.34,1.9,.64,1)' });
        this._restart(this.sp, 'is-flare');
      }
    }
    const act = !!f.specialActive;
    if (act !== L.active) { L.active = act; this.sp.classList.toggle('is-active', act); }
    void dt;
  }

  // ---------------------------------------------------------------- turf ticker
  _updTurf(dt) {
    this._turfT += dt;
    if (this._turfAcc > 0 && (this._turfT > 0.4 || this._turfAcc > 40)) {
      const n = Math.round(this._turfAcc);
      if (n >= 1) this._turfPop(n);
      this._turfAcc -= n;
      if (this._turfAcc < 0) this._turfAcc = 0;
      this._turfT = 0;
    }
    // total counts up toward the real value
    const tgt = this._turfTotal;
    if (this._turfShown < tgt) this._turfShown = Math.min(tgt, this._turfShown + Math.max(6, (tgt - this._turfShown) * 7) * dt);
    const txt = fmtInt(Math.floor(this._turfShown));
    if (txt !== this._L.turfTxt) {
      this._L.turfTxt = txt; this.turfNum.textContent = txt;
    }
  }
  _turfPop(n) {
    const pops = this.tpops.children;
    if (pops.length >= 4) pops[0].remove();
    const big = n >= 25;
    const el = h('span', { class: 'iw-tpop' + (big ? ' is-big' : ''), style: { '--x': `${(Math.random() * 16 - 8).toFixed(1)}px` } }, `+${n}`, h('small', null, 'p'));
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    this.tpops.appendChild(el);
    this._restart(this.turfEl, 'is-tick');
  }

  _updHp(hp) {
    const L = this._L;
    const v = clamp(hp == null ? 1 : +hp);
    const o = this.fx ? 0 : clamp((0.42 - v) / 0.32);
    if (L.vig == null || Math.abs(o - L.vig) > 0.01) { L.vig = o; this.vig.style.opacity = o.toFixed(3); }
    const crit = v < 0.2 && !this.fx;
    if (crit !== L.crit) { L.crit = crit; this.vig.classList.toggle('is-crit', crit); }
  }

  // ---------------------------------------------------------------- minimap + super jump
  _updMap(m, dt) {
    const L = this._L, M = this._map;
    const show = !!(m && m.canvas);
    if (show !== L.mapShow) { L.mapShow = show; this.map.style.display = show ? '' : 'none'; if (!show) { this.mapDim.classList.remove('is-on'); M.open = false; } }
    if (!show) return;
    if (m.canvas !== this._mapCanvas) {
      this._mapCanvas = m.canvas;
      this.mapSlot.innerHTML = '';
      this.mapSlot.appendChild(m.canvas);
      m.canvas.classList.add('iw-map__canvas');
      L.mapBox = null;
    }
    // the big map only opens during live play (the controller's TAB state can stay latched through time's up)
    const target = m.expanded && (this.lab || !G.match || G.match.state === 'playing') ? 1 : 0;
    if (target !== L.mapExp) {
      L.mapExp = target;
      this.mapDim.classList.toggle('is-on', !!target);
      this.map.classList.toggle('is-expanded', !!target);
      this.el.classList.toggle('is-mapopen', !!target);
      M.open = !!target;
      if (M.open) { M.cx = M.sx ?? 0.5; M.cy = M.sy ?? 0.8; M.hover = -1; this._snd('ui_click', { volume: 0.5 }); this.map.style.pointerEvents = 'auto'; }
      else { this.map.style.pointerEvents = ''; }
    }
    const k = 190, c = 21;
    const a = k * (target - this._mapT) - c * this._mapV;
    this._mapV += a * Math.min(dt, 0.05); this._mapT += this._mapV * Math.min(dt, 0.05);
    if (Math.abs(target - this._mapT) < 0.001 && Math.abs(this._mapV) < 0.001) { this._mapT = target; this._mapV = 0; }
    const W = innerWidth, H = innerHeight;
    const u = Math.min(W / 100, (H * 1.7778) / 100);
    const asp = (m.canvas.width || 1) / (m.canvas.height || 1);
    const fit = (sz) => (asp >= 1 ? [sz, sz / asp] : [sz * asp, sz]);
    const [w0, h0] = fit(14.5 * u), [w1, h1] = fit(Math.min(H * 0.78, W * 0.6));
    const t = this._mapT;
    const bw = lerp(w0, w1, t), bh = lerp(h0, h1, t);
    const x = lerp(2.2 * u, (W - w1) / 2, t), y = lerp(H - 2.2 * u - h0, (H - h1) / 2 + u * 1.2, t);
    const inside = (W - w1) / 2 < 22 * u;
    if (inside !== L.lgIn) { L.lgIn = inside; this.mapLegend.classList.toggle('is-inside', inside); }
    const box = `${x.toFixed(1)},${y.toFixed(1)},${bw.toFixed(1)},${bh.toFixed(1)}`;
    if (box !== L.mapBox) {
      L.mapBox = box;
      const st = this.map.style;
      st.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      st.width = bw.toFixed(1) + 'px'; st.height = bh.toFixed(1) + 'px';
    }
    // dots
    const ps = m.players || [];
    const ca = L.ca || '#ff8a14', cb = L.cb || '#2f5bff';
    for (let i = 0; i < this.mapDots.length; i++) {
      const d = this.mapDots[i], p = ps[i];
      const dk = `md${i}`;
      if (!p) { if (L[dk] !== 'x') { L[dk] = 'x'; d.style.display = 'none'; } continue; }
      const px = clamp(+p.x || 0) * bw, py = clamp(+p.y || 0) * bh;
      if (p.isSelf) { M.sx = clamp(+p.x || 0); M.sy = clamp(+p.y || 0); }
      const key = `${px.toFixed(1)}|${py.toFixed(1)}|${(+p.yaw || 0).toFixed(2)}|${p.alive === false ? 0 : 1}|${p.isSelf ? 1 : 0}|${p.team}`;
      if (L[dk] === key) continue;
      const prev = L[dk] || '';
      L[dk] = key;
      if (prev === 'x' || !prev) d.style.display = '';
      const sk = `${p.isSelf ? 1 : 0}|${p.alive === false ? 0 : 1}|${p.team}`;
      if (d._sk !== sk) {
        d._sk = sk;
        d.className = 'iw-mdot' + (p.isSelf ? ' is-self' : '') + (p.alive === false ? ' is-dead' : '') + (p.team !== this._myTeam() ? ' is-enemy' : '');
        d.style.setProperty('--c', p.team !== this._myTeam() ? cb : ca);
      }
      d.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) rotate(${p.isSelf ? (+p.yaw || 0).toFixed(3) : 0}rad)`;
    }
    this._updBeacons(bw, bh, dt, u);
  }

  // beacon targets: allies in actor order (same numbering as the player controller), then the base spawn pad
  _beaconTargets() {
    const me = this._local();
    const out = [null, null, null, null];
    if (this.lab && this.lab.beacons) return this.lab.beacons;
    if (!me) return out;
    const allies = (G.actors || []).filter((o) => o.team === me.team && o !== me);
    const mm = G.game && G.game.minimap;
    const tc = { x: 0, y: 0 };
    for (let i = 0; i < 3; i++) {
      const o = allies[i];
      if (!o || !mm) continue;
      mm.toCanvas(o.pos.x, o.pos.z, tc);
      out[i] = { x: tc.x / mm.w, y: tc.y / mm.h, name: o.name, weapon: o.weaponId, ok: !!(o.alive && !o.superJumpState), respawn: o.alive ? 0 : Math.ceil(o.respawnTimer || 0), actor: o };
    }
    const pad = G.level && G.level.spawnPads && G.level.spawnPads[me.team];
    if (pad && mm) { mm.toCanvas(pad.x, pad.z, tc); out[3] = { x: tc.x / mm.w, y: tc.y / mm.h, name: 'Base', ok: true, home: true, pad }; }
    return out;
  }

  _updBeacons(bw, bh, dt, u = 16) {
    const M = this._map, L = this._L;
    const vis = this._mapT > 0.02;
    if (vis !== L.bcnVis) { L.bcnVis = vis; this.map.classList.toggle('has-beacons', vis); }
    if (!vis) return;
    const tg = this._beaconTargets();
    const me = this._local();
    const canJump = this.lab ? true : !!(me && me.canSuperJump && me.canSuperJump());
    // virtual cursor (pointer is locked in-game: steer with mouse deltas; magnet toward beacons)
    const inp = G.input;
    if (M.open && inp && inp.locked) {
      M.cx = clamp(M.cx + (inp.mouse.dx || 0) / Math.max(80, bw), 0.02, 0.98);
      M.cy = clamp(M.cy + (inp.mouse.dy || 0) / Math.max(80, bh), 0.02, 0.98);
      let best = -1, bd = 0.09;
      for (let i = 0; i < 4; i++) {
        const b = tg[i]; if (!b) continue;
        const d = Math.hypot((b.x - M.cx) * bw, (b.y - M.cy) * bh) / Math.max(bw, bh);
        if (d < bd) { bd = d; best = i; }
      }
      if (best !== M.hover) { M.hover = best; if (best >= 0) this._snd('ui_hover', { volume: 0.45 }); }
      if (inp.mouse.leftPressed && M.hover >= 0) this._jumpTo(M.hover);
      this.mapCursor.style.transform = `translate3d(${(M.cx * bw).toFixed(1)}px,${(M.cy * bh).toFixed(1)}px,0)`;
      this.mapCursor.classList.toggle('is-snap', M.hover >= 0);
    }
    if (M.open !== L.curOn) { L.curOn = M.open; this.mapCursor.classList.toggle('is-on', !!(M.open && inp && inp.locked)); }
    // number keys pressed this frame → flash the matching beacon (the controller performs the jump)
    if (M.open && inp) for (let i = 0; i < 4; i++) if (inp.wasPressed && inp.wasPressed('Digit' + (i + 1))) { M.pressed = i; M.pressT = 0.5; this._restart(this.beacons[i], 'is-press'); }
    M.pressT = Math.max(0, M.pressT - dt);
    // spread overlapping beacons apart (allies often stand together at spawn); stems point at the true spots
    const P = this._bcnP || (this._bcnP = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, ox: 0, oy: 0, on: false })));
    const minD = u * 3.4 * 1.3 * (this._mapT > 0.5 ? 1 : 0.6);
    for (let i = 0; i < 4; i++) { const b = tg[i], p = P[i]; p.on = !!b; if (b) { p.x = p.ox = b.x * bw; p.y = p.oy = b.y * bh; } }
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const a = P[i], c = P[j]; if (!a.on || !c.on) continue;
        let dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
        if (d >= minD) continue;
        if (d < 0.5) { const ang = (i * 2.1 + j * 1.3); dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
        const push = (minD - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push; c.x += (dx / d) * push; c.y += (dy / d) * push;
      }
    }
    for (let i = 0; i < 4; i++) {
      const el = this.beacons[i], b = tg[i], p = P[i];
      const key = b ? `${p.x.toFixed(0)}|${p.y.toFixed(0)}|${p.ox.toFixed(0)}|${p.oy.toFixed(0)}|${b.ok ? 1 : 0}|${b.respawn || 0}|${M.hover === i ? 1 : 0}|${canJump ? 1 : 0}|${b.name}` : 'x';
      this._updLegendRow(i, b, canJump);
      if (el._key === key) continue;
      el._key = key;
      if (!b) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;
      const sx = p.ox - p.x, sy = p.oy - p.y, sl = Math.hypot(sx, sy);
      const stem = el.firstChild;
      if (sl > 3) { stem.style.display = ''; stem.style.width = sl.toFixed(1) + 'px'; stem.style.transform = `rotate(${Math.atan2(sy, sx).toFixed(3)}rad)`; }
      else stem.style.display = 'none';
      el.classList.toggle('is-off', !b.ok || !canJump);
      el.classList.toggle('is-hover', M.hover === i && b.ok && canJump);
      if (!b.home) {
        if (el._w !== b.weapon) { el._w = b.weapon; el.querySelector('.iw-bcn__icon').innerHTML = weaponIcon(kindOf(b.weapon)); }
        el.querySelector('.iw-bcn__label b').textContent = b.ok ? b.name : `${b.name} · ${b.respawn || '…'}`;
      }
    }
    // dashed jump arc from you to the hovered beacon
    const hb = M.hover >= 0 ? tg[M.hover] : null;
    const showLine = !!(hb && hb.ok && canJump && M.sx != null);
    if (showLine !== L.jl) { L.jl = showLine; this.mapJumpLine.classList.toggle('is-on', showLine); }
    if (showLine) {
      const x0 = M.sx * bw, y0 = M.sy * bh, x1 = hb.x * bw, y1 = hb.y * bh;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.35;
      const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      if (d !== L.jlD) { L.jlD = d; const svg = this.mapJumpLine.firstChild; svg.setAttribute('width', bw.toFixed(0)); svg.setAttribute('height', bh.toFixed(0)); svg.firstChild.setAttribute('d', d); }
    }
  }

  _updLegendRow(i, b, canJump) {
    const row = this.legendRows[i], M = this._map;
    const key = b ? `${b.name}|${b.weapon || ''}|${b.ok ? 1 : 0}|${b.respawn || 0}|${M.hover === i ? 1 : 0}|${canJump ? 1 : 0}` : 'x';
    if (row._key === key) return;
    row._key = key;
    row.classList.toggle('is-empty', !b);
    if (!b) return;
    if (!b.home && row._w !== b.weapon) { row._w = b.weapon; row.querySelector('.iw-lg__w').innerHTML = weaponIcon(kindOf(b.weapon)); }
    row.querySelector('.iw-lg__name').textContent = b.name;
    const st = !canJump ? '—' : b.ok ? 'READY' : b.respawn ? `${b.respawn}s` : 'BUSY';
    row.querySelector('.iw-lg__st').textContent = st;
    row.classList.toggle('is-off', !b.ok || !canJump);
    row.classList.toggle('is-hover', M.hover === i && b.ok && canJump);
  }

  _jumpTo(i) {
    const tg = this._beaconTargets()[i];
    if (!tg || !tg.ok) { this._snd('ui_error', { volume: 0.5 }); return; }
    this._restart(this.beacons[i], 'is-press');
    if (this.lab) { this.lab.onJump?.(i); this._snd('ui_confirm'); return; }
    const me = this._local();
    if (!me || !me.canSuperJump || !me.canSuperJump()) { this._snd('ui_error', { volume: 0.5 }); return; }
    const ok = tg.home ? me.superJump(tg.pad.clone()) : me.superJump(tg.actor);
    if (!ok) this._snd('ui_error', { volume: 0.5 });
  }

  _updMarkers(ms) {
    const L = this._L;
    ms = ms || [];
    let byName = this._byName;
    const actors = this._actors();
    if (!byName || this._byNameN !== actors.length || this._byNameA !== actors[0]) {
      byName = this._byName = new Map(actors.map((a) => [a.name, a]));
      this._byNameN = actors.length; this._byNameA = actors[0];
    }
    for (let i = 0; i < this.markers.length; i++) {
      const el = this.markers[i], m = ms[i];
      const k = `mk${i}`;
      if (!m) { if (L[k] !== 'x') { L[k] = 'x'; el.style.display = 'none'; } continue; }
      const on = !!m.onScreen;
      const ac = byName.get(m.name);
      const ready = !!(ac && ac.specialReady && ac.specialReady());
      const far = m.dist != null ? clamp((m.dist - 14) / 20, 0, 1) : 0;
      const key = `${(+m.x).toFixed(0)}|${(+m.y).toFixed(0)}|${on ? 1 : 0}|${on ? 0 : (+m.angle || 0).toFixed(2)}|${m.name}|${m.color}|${ready ? 1 : 0}|${far.toFixed(1)}`;
      if (L[k] === key) continue;
      const prev = L[k];
      L[k] = key;
      if (prev === 'x' || !prev) el.style.display = '';
      if (el._name !== m.name) {
        el._name = m.name;
        el.querySelector('.iw-mk__tag b').textContent = m.name || '';
        const w = (ac && ac.weaponId) || m.weapon;
        el.querySelector('.iw-mk__w').innerHTML = w ? weaponIcon(kindOf(w)) : '';
      }
      const col = toHex(m.color, '#ffffff');
      if (el._col !== col) { el._col = col; colorVars(el, 'c', col); }
      if (el._on !== on) { el._on = on; el.classList.toggle('is-off', !on); }
      if (el._ready !== ready) { el._ready = ready; el.classList.toggle('is-ready', ready); }
      el.style.setProperty('--far', far.toFixed(2));
      el.style.transform = `translate3d(${(+m.x).toFixed(1)}px,${(+m.y).toFixed(1)}px,0)`;
      if (!on) el.lastChild.style.transform = `rotate(${(+m.angle || 0).toFixed(3)}rad)`;
    }
  }

  _updPrompt(p) {
    const L = this._L;
    const v = p || null;
    if (v === L.prompt) return;
    L.prompt = v;
    if (!v) { this.promptEl.classList.add('is-out'); return; }
    this.promptEl.innerHTML = richText(v);
    this.promptEl.classList.remove('is-out');
    this.promptEl.animate([{ transform: 'translateX(-50%) translateY(12px) scale(.85)', opacity: 0 }, { transform: 'translateX(-50%) translateY(0) scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  _updFps(fps, dt) {
    const L = this._L;
    const has = fps != null && isFinite(fps);
    if (has !== L.fpsOn) { L.fpsOn = has; this.fpsEl.style.display = has ? '' : 'none'; }
    if (!has) return;
    L.fpsT = (L.fpsT || 0) + dt;
    if (L.fpsT < 0.25 && L.fpsTxt) return;
    L.fpsT = 0;
    const txt = `${Math.round(fps)} FPS`;
    if (txt !== L.fpsTxt) { L.fpsTxt = txt; this.fpsEl.textContent = txt; this.fpsEl.classList.toggle('is-bad', fps < 45); }
  }

  // ================================================================ effects loop (self-driven so it works while paused / after the match)
  _addFx(name, fn) {
    this._fxMap = this._fxMap || new Map();
    this._fxMap.set(name, fn);
    if (!this._rafId) { this._lastFx = performance.now(); this._rafId = requestAnimationFrame(this._fxLoop); }
  }
  _fxLoop(t) {
    const raw = Math.min(0.25, Math.max(0, (t - this._lastFx) / 1000));
    this._lastFx = t;
    if (this.paused) { this._rafId = requestAnimationFrame(this._fxLoop); return; }
    const dt = raw * this.timeScale;
    this._fxTime += dt;
    for (const [name, fn] of this._fxMap) { let keep = true; try { keep = fn(dt) !== false; } catch (e) { console.error('[hud]', e); keep = false; } if (!keep) this._fxMap.delete(name); }
    this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0;
  }
  _restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // eslint-disable-line no-void
    el.classList.add(cls);
  }
  _expireFeed(el, fast) {
    if (el._out) return;
    el._out = true;
    clearTimeout(el._t);
    el.classList.add('is-out');
    const hgt = el.offsetHeight;
    const a = el.animate([
      { transform: 'translateX(0)', opacity: 1, height: hgt + 'px', marginBottom: getComputedStyle(el).marginBottom },
      { transform: 'translateX(40%)', opacity: 0, height: hgt + 'px', offset: 0.55 },
      { transform: 'translateX(60%)', opacity: 0, height: '0px', marginBottom: '0px' },
    ], { duration: fast ? 220 : 420, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
    a.onfinish = () => el.remove();
  }

  // ---------------------------------------------------------------- damage smears (fallback when ScreenFX is absent)
  _resizeCanvas() {
    const s = 0.6;
    const w = Math.max(2, Math.round(innerWidth * s)), hh = Math.max(2, Math.round(innerHeight * s));
    if (this.canvas.width !== w || this.canvas.height !== hh) { this.canvas.width = w; this.canvas.height = hh; }
    this._cs = s;
  }
  _spawnSmear(amount, hex, angle = null) {
    const W = this.canvas.width, H = this.canvas.height, m = Math.min(W, H);
    const r = m * (0.06 + Math.random() * 0.045) * (0.7 + amount * 0.75);
    let x, y;
    const depth = r * (0.1 + Math.random() * 0.7);
    if (angle !== null && Number.isFinite(angle)) {
      const a = angle + (Math.random() - 0.5) * 0.5;
      const cx = W / 2, cy = H / 2, ca = Math.cos(a), sa = Math.sin(a);
      const k = Math.min((W / 2) / Math.max(1e-3, Math.abs(ca)), (H / 2) / Math.max(1e-3, Math.abs(sa)));
      x = cx + ca * k; y = cy + sa * k;
      x = Math.min(W - depth, Math.max(depth, x - Math.sign(ca) * depth * (Math.abs(ca) > 0.3 ? 1 : 0)));
      y = Math.min(H - depth, Math.max(depth, y - Math.sign(sa) * depth * (Math.abs(sa) > 0.3 ? 1 : 0)));
    } else {
      const side = Math.random();
      if (side < 0.36) { x = depth; y = H * (0.12 + Math.random() * 0.76); }
      else if (side < 0.72) { x = W - depth; y = H * (0.12 + Math.random() * 0.76); }
      else if (side < 0.9) { x = W * (0.08 + Math.random() * 0.84); y = depth; }
      else { x = W * (0.1 + Math.random() * 0.8); y = H - depth; }
    }
    if (y > H * 0.55 && Math.abs(x - W / 2) < W * 0.2) x = W / 2 + Math.sign(x - W / 2 || (Math.random() - 0.5)) * W * (0.2 + Math.random() * 0.08);
    const S = Math.ceil(r * 3.4);
    const oc = document.createElement('canvas');
    oc.width = oc.height = S;
    const c = oc.getContext('2d');
    const shape = splatShape(S / 2, S / 2, r, { seed: (Math.random() * 1e6) | 0, arms: 7 + ((Math.random() * 5) | 0), drops: 5 + ((Math.random() * 4) | 0), armLen: 0.35 + Math.random() * 0.3 });
    const core = new Path2D(shape.core);
    c.fillStyle = shade(hex, -0.28);
    c.save(); c.translate(1.5, 2.5); c.fill(core); c.restore();
    c.fillStyle = hex; c.fill(core);
    for (const d of shape.drops) { c.beginPath(); c.arc(d.x, d.y, Math.max(1.5, d.r), 0, Math.PI * 2); c.fill(); }
    c.save(); c.clip(core);
    const g = c.createRadialGradient(S / 2 - r * 0.35, S / 2 - r * 0.4, 0, S / 2 - r * 0.35, S / 2 - r * 0.4, r * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.35, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    c.fillStyle = 'rgba(255,255,255,.75)';
    c.beginPath(); c.ellipse(S / 2 - r * 0.42, S / 2 - r * 0.45, r * 0.13, r * 0.08, -0.6, 0, Math.PI * 2); c.fill();
    c.restore();
    const drips = [];
    const nd = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < nd; i++) drips.push({ dx: (Math.random() - 0.5) * r * 1.1, len: 0, max: r * (0.6 + Math.random() * 1.4), sp: r * (0.35 + Math.random() * 0.6), w: r * (0.09 + Math.random() * 0.08) });
    this._smears.push({ x, y, r, img: oc, S, hex, drips, age: 0, life: 1.35 + amount * 0.6 + Math.random() * 0.3, rot: 0 });
  }
  _tickSmears(dt) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    for (let i = this._smears.length - 1; i >= 0; i--) {
      const s = this._smears[i];
      s.age += dt;
      if (s.age >= s.life) { this._smears.splice(i, 1); continue; }
      const fadeStart = s.life - 0.65;
      const a = s.age < fadeStart ? 1 : clamp(1 - (s.age - fadeStart) / 0.65);
      const pop = s.age < 0.16 ? easeOutBack(s.age / 0.16, 2.4) : 1;
      const sc = 0.55 + 0.45 * pop;
      c.globalAlpha = a * 0.94;
      c.fillStyle = s.hex;
      for (const d of s.drips) {
        d.len = Math.min(d.max, d.len + d.sp * dt * (1 - d.len / (d.max * 1.15)));
        const x0 = s.x + d.dx * sc, y0 = s.y + s.r * 0.2 * sc;
        c.fillRect(x0 - d.w / 2, y0, d.w, d.len);
        c.beginPath(); c.arc(x0, y0 + d.len, d.w * 0.78, 0, Math.PI * 2); c.fill();
      }
      c.save();
      c.translate(s.x, s.y); c.scale(sc, sc);
      c.drawImage(s.img, -s.S / 2, -s.S / 2);
      c.restore();
    }
    c.globalAlpha = 1;
    return this._smears.length > 0 || (c.clearRect(0, 0, W, H), false);
  }
}

// reduced motion: the CSS handles most of it; expose for callers that want to skip heavy one-shots
export const hudReducedMotion = prefersReducedMotion;
