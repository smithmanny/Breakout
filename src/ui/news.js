// BREAKOUT — "What's New" launch pop-ups. Shown ONCE per update, the first time the player reaches the main menu
// (never over the title screen, never mid-match). Two sticker cards behind a splat wipe:
//   1. WELCOME TO BREAKOUT (the paintball conversion: elimination rounds, markers) → CONTINUE ▶ · Skip
//   2. NEW FIELD: BREAKPOINT FIELD (speedball field, masks & jerseys) → PLAY NOW (Play › Elimination) · LATER
// Seen state: localStorage['inkwave.news'] = NEWS_ID (bump NEWS_ID for the next update's cards; the key keeps its
// historical name so saves carry over).
// Test flows never see it: ?skipTitle / ?netmock / ?autostart / ?autopilot skip it. ?news=1 re-enables the normal
// once-only logic on those URLs, ?news=force shows it regardless of the seen state, ?news=0 turns it off.
//
// Lives inside the menus: the overlay is the menus' modal (focus trap, pad/keyboard/mouse nav, cursor ring for free),
// hosted in the main screen's element. Hooks in menus.js: constructor, _swap (main mounted → maybeShow), _back (Esc).
import { h, esc, clamp, splatSVG, splatShape, restartAnim, prefersReducedMotion, easeOutCubic, easeInOutCubic, safeCall } from './ui-util.js';
import { GLYPHS, SQUID, WEAPON_ICONS, richText } from './ui-icons.js';
import { splatClip, splatCover, inkBurst } from './menu-art.js';
import { G } from '../core/ctx.js';
import { ROUNDS, WEAPONS, WEAPON_ORDER, mapById } from '../config.js';

export const NEWS_ID = 'breakout-launch-1';
const KEY = 'inkwave.news';
const art = (f) => new URL(`../../assets/${f}`, import.meta.url).href;
const CONFETTI = ['var(--nc)', 'var(--nc-light)', '#ffd23f', '#fff', 'var(--a)', 'var(--b)'];
const K = '#15121c';

export function newsSeen() { try { return localStorage.getItem(KEY) === NEWS_ID; } catch (e) { return false; } }
function markSeen() { try { localStorage.setItem(KEY, NEWS_ID); } catch (e) { /* private mode: it just shows again next time */ } }
/** false · true (normal once-only) · 'force' (ignore the seen state) */
function gate() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const p = q.get('news');
  if (p === '0') return false;
  if (p === 'force') return 'force';
  if (p === '1') return true;
  for (const k of ['skipTitle', 'netmock', 'autostart', 'autopilot']) if (q.has(k)) return false;
  return true;
}

// ---- illustrated heroes (used when there is no render for the card, or it fails to load)
const maskAt = (x, y, sc, color, flip = false) => `<g transform="translate(${x} ${y}) scale(${flip ? -sc : sc} ${sc})" style="color:${color}">${SQUID.replace('class="iw-ico iw-squid"', 'x="0" y="0" width="64" height="64"')}</g>`;
const splatAt = (cls, x, y, r, seed) => { const s = splatShape(x, y, r, { seed, arms: 9, drops: 5, armLen: 0.5 }); return `<path class="${cls}" d="${s.core}"/>${s.drops.map((d) => `<circle class="${cls}" cx="${d.x}" cy="${d.y}" r="${d.r}"/>`).join('')}`; };
/** Two masked players face off across a crosshair, paint everywhere. */
function heroFaceoff() {
  return `<svg viewBox="0 0 320 180" aria-hidden="true">
    <defs><radialGradient id="nwfo" cx=".5" cy=".6" r=".7"><stop offset="0" stop-color="#3a2d62"/><stop offset="1" stop-color="#150f26"/></radialGradient></defs>
    <rect width="320" height="180" fill="url(#nwfo)"/>
    ${splatAt('iw-fa', 92, 96, 44, 11)}${splatAt('iw-fb', 232, 90, 42, 23)}${splatAt('iw-fa', 250, 30, 12, 5)}${splatAt('iw-fb', 60, 150, 11, 8)}
    ${maskAt(46, 50, 1.3, 'var(--a)')}${maskAt(274, 50, 1.3, 'var(--b)', true)}
    <g transform="translate(160 88)" fill="none" stroke-linecap="round">
      <circle r="26" stroke="${K}" stroke-width="9"/><path d="M0 -40 V-18 M0 18 V40 M-40 0 H-18 M18 0 H40" stroke="${K}" stroke-width="9"/>
      <circle r="26" stroke="#fff" stroke-width="4"/><path d="M0 -40 V-18 M0 18 V40 M-40 0 H-18 M18 0 H40" stroke="#fff" stroke-width="4"/>
      <circle r="4" fill="#ff3d5e" stroke="none"/>
    </g>
    ${[[128, 70], [118, 80], [196, 104], [206, 96]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4" class="${i < 2 ? 'iw-fa' : 'iw-fb'}" stroke="${K}" stroke-width="1.8"/>`).join('')}
  </svg>`;
}
/** A top-down speedball field: net, inflatable snakes / doritos / cans, both start boxes. */
function heroField() {
  const bunk = (x, y, w, hh, r = 8, cls = 'nwb') => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${r}" class="${cls}"/>`;
  const dor = (x, y, s, rot) => `<path class="nwb" transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 -10 L9 7 L-9 7 Z"/>`;
  return `<svg viewBox="0 0 320 180" aria-hidden="true">
    <style>.nwb{fill:#f5f1e6;stroke:${K};stroke-width:2.2;stroke-linejoin:round}</style>
    <rect width="320" height="180" fill="#2c7a3f"/>
    <path d="M0 0 H320 V180 H0 Z" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="10" stroke-dasharray="2 6"/>
    ${Array.from({ length: 8 }, (_, i) => `<rect x="${i * 40}" y="0" width="20" height="180" fill="#fff" opacity=".04"/>`).join('')}
    <path d="M160 14 V166" stroke="#fff" stroke-opacity=".7" stroke-width="2.5" stroke-dasharray="6 6"/>
    ${splatAt('iw-fa', 40, 90, 16, 3)}${splatAt('iw-fb', 280, 90, 16, 9)}${splatAt('iw-fa', 132, 48, 9, 14)}${splatAt('iw-fb', 196, 130, 10, 21)}
    <rect x="10" y="70" width="22" height="40" rx="4" class="iw-fa" stroke="${K}" stroke-width="2.2"/><rect x="288" y="70" width="22" height="40" rx="4" class="iw-fb" stroke="${K}" stroke-width="2.2"/>
    ${bunk(60, 24, 70, 14, 7)}${bunk(190, 142, 70, 14, 7)}
    ${bunk(150, 80, 20, 20, 10)}${bunk(96, 128, 16, 16, 8)}${bunk(208, 36, 16, 16, 8)}
    ${dor(118, 96, 1.4, 0)}${dor(202, 84, 1.4, 180)}${dor(70, 60, 1.1, 20)}${dor(250, 120, 1.1, 200)}
    ${bunk(236, 64, 12, 26, 6)}${bunk(72, 90, 12, 26, 6)}
    ${maskAt(116, 116, 0.34, 'var(--a)')}${maskAt(192, 44, 0.34, 'var(--b)')}
  </svg>`;
}

const markerNames = () => WEAPON_ORDER.map((id) => WEAPONS[id] && WEAPONS[id].name).filter(Boolean);
const FIELD = () => (mapById('speedball') || { id: 'speedball', name: 'Breakpoint Field' });

const PAGES = [
  {
    id: 'launch', tone: 'a', kicker: 'WELCOME TO', title: ['BREAKOUT'], img: 'news/breakout.webp', fallback: heroFaceoff,
    stamp: { text: 'NEW!', cls: 'is-new' },
    lede: 'Same harbour crew, brand-new game: masks on, markers up — it’s 4v4 paintball.',
    bullets: [
      [GLYPHS.flag, 'Elimination rounds', `one life per round, no respawns — first team to ${ROUNDS.toWin} rounds takes the match`],
      [WEAPON_ICONS.shooter, `${WEAPON_ORDER.length} markers`, () => markerNames().join(' · ')],
      [GLYPHS.bolt, 'Sprint · Reload · Grenades', 'hold [SHIFT] to sprint, [R] to reload your hopper, two Paint Grenades a round'],
    ],
  },
  {
    id: 'field', tone: 'b', kicker: 'NEW FIELD', title: () => FIELD().name.toUpperCase().split(' '), img: 'stages/speedball-day.webp', fallback: heroField,
    tape: 'SPEEDBALL · 4 V 4',
    lede: () => FIELD().blurb || 'A tournament speedball field of inflatable bunkers.',
    bullets: [
      [GLYPHS.map, 'Speedball layout', 'snakes, doritos and cans — break fast, then fight for the wire'],
      [GLYPHS.hanger, 'Masks & jerseys', 'pro masks, team jerseys and camo kits in the Locker'],
      [GLYPHS.target, 'Referee’s call', 'take the hits and you’re OUT — spectate your team until the next whistle'],
    ],
  },
];
const val = (v) => (typeof v === 'function' ? v() : v);

export class WhatsNew {
  constructor(menus) {
    this.M = menus;
    this.el = null;
    this.page = 0;
    this._t = 0;
    this._tweens = [];
    this._raf = 0;
    this._busy = false;
  }

  get open() { return !!this.el; }

  /** menus.js: the main screen just mounted. Opens once the menu's own wipe has settled. */
  maybeShow() {
    if (this.el) return;
    const g = gate();
    if (!g || (g !== 'force' && newsSeen())) return;
    if (g === 'force' && this._shownForce) return;
    clearTimeout(this._t);
    // fetch both hero renders now: the card waits (briefly) for its image instead of opening on an empty frame
    if (!this._pre) this._pre = PAGES.map((P) => { const im = new Image(); im.decoding = 'async'; im.src = art(P.img); return im; });
    this._waitFrom = performance.now();
    this._t = setTimeout(() => this._tryOpen(0), 700);
  }
  _tryOpen(n) {
    const M = this.M;
    if (this.el || M.current !== 'main' || !M._scr || G.mode === 'match') return;
    if (M._modal || (M.wipe && M.wipe.busy) || M._starting) {
      if (n < 60) this._t = setTimeout(() => this._tryOpen(n + 1), 150);
      return;
    }
    const hero = this._pre && this._pre[0];
    if (hero && !hero.complete && performance.now() - this._waitFrom < 4000) { this._t = setTimeout(() => this._tryOpen(n), 150); return; }
    this.show();
  }

  // ================================================================ build
  show() {
    const M = this.M;
    if (this.el || !M._scr) return;
    if (gate() === 'force') this._shownForce = true;
    markSeen();   // shown once: even a reload mid-sequence won't bring it back
    this.reduced = prefersReducedMotion();
    this.page = 0;
    this.inkHost = h('div', { class: 'iw-news__inks' });
    this.card = h('div', { class: 'iw-news__card' });
    this.confetti = h('div', { class: 'iw-news__confetti' });
    const el = this.el = h('div', { class: 'iw-news' + (this.reduced ? ' is-reduced' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': 'What’s new' },
      h('div', { class: 'iw-news__dim' }), this.inkHost, this.confetti, h('div', { class: 'iw-news__stage' }, this.card));
    el._onBack = () => this.close('back');
    el.dataset.keys = '1';
    M._scr.el.appendChild(el);
    M._modalPrev = M._focus;
    M._modal = el;
    M._sfx('splat_big');
    this._render(0, true);
    const r = el.getBoundingClientRect();
    this._ink(PAGES[0].tone, r.width * 0.5, r.height * 0.52, 0.62, false);
  }

  _render(i, first) {
    const M = this.M, P = PAGES[i];
    this.page = i;
    this.el.dataset.page = P.id;
    this.el.style.setProperty('--nc', `var(--${P.tone})`);
    this.el.style.setProperty('--nc-light', `var(--${P.tone}-light)`);
    this.el.style.setProperty('--nc-dark', `var(--${P.tone}-dark)`);
    this.el.style.setProperty('--nc-ink', `var(--${P.tone}-ink)`);
    this.el.style.setProperty('--nc-rgb', `var(--${P.tone}-rgb)`);
    // hero: the render, framed like a ticket, taped to the card
    const img = h('img', { class: 'iw-news__img', alt: '', draggable: 'false' });
    const frame = h('div', { class: 'iw-news__frame' }, img, h('i', { class: 'iw-news__glare' }));
    img.addEventListener('load', () => frame.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => {
      img.remove();
      frame.classList.add('is-loaded', 'is-fallback');
      frame.prepend(h('div', { class: 'iw-news__fb' + (P.fallback ? ' is-art' : ''), html: P.fallback ? P.fallback() : `<span class="iw-news__fbsquid">${SQUID}</span>` }));
    }, { once: true });
    img.src = art(P.img);
    const hero = h('div', { class: 'iw-news__hero' },
      h('span', { class: 'iw-news__herosplat', html: splatSVG({ seed: 17 + i * 11, fill: 'var(--nc)', r: 58, arms: 9, drops: 5 }) }),
      frame,
      h('i', { class: 'iw-news__tapebit is-tl' }), h('i', { class: 'iw-news__tapebit is-br' }),
      P.stamp ? h('span', { class: `iw-news__stamp ${P.stamp.cls}` }, P.stamp.text) : null,
      P.tape ? h('span', { class: 'iw-news__tape' }, h('span', null, P.tape)) : null);
    // body
    const list = h('ul', { class: 'iw-news__list' }, P.bullets.map(([ic, b, t, thumb], k) => {
      const li = h('li', { style: { '--i': k } }, h('i', { class: 'iw-news__bico', html: ic }), h('span', { html: `<b>${esc(b)}</b> — ${richText(val(t))}` }));
      if (thumb) {
        const im = h('img', { class: 'iw-news__thumb', alt: '', draggable: 'false' });
        im.addEventListener('error', () => im.remove(), { once: true });
        im.src = art(thumb);
        li.appendChild(im);
      }
      return li;
    }));
    const btns = [];
    if (i === 0) {
      const go = M._btn({ id: 'news-continue', label: 'CONTINUE', cls: 'iw-btn--primary iw-btn--wide iw-news__go', sound: 'ui_confirm', accept: () => this.next() });
      go.append(h('span', { class: 'iw-news__chev', html: GLYPHS.next }));
      const skip = M._btn({ id: 'news-skip', label: 'Skip', cls: 'iw-btn--small iw-btn--ghost iw-news__skip', sound: 'ui_back', accept: () => this.close('skip') });
      skip.appendChild(h('span', { class: 'iw-news__skipkey' }, M._hint('Esc', 'B')));
      btns.push(go, skip);
    } else {
      const go = M._btn({ id: 'news-try', label: 'PLAY NOW', icon: GLYPHS.play, cls: 'iw-btn--primary iw-btn--wide iw-news__go', sound: 'ui_confirm', accept: () => this.close('try') });
      const later = M._btn({ id: 'news-later', label: 'LATER', cls: 'iw-btn--wide iw-btn--ghost iw-news__later', sound: 'ui_back', accept: () => this.close('later') });
      btns.push(go, later);
    }
    btns[0].appendChild(h('span', { class: 'iw-news__key' }, M._hint('Enter', 'A')));
    const dots = h('span', { class: 'iw-news__dots' }, PAGES.map((_, k) => h('i', { class: k === i ? 'is-on' : '' })));
    const title = val(P.title);
    const body = h('div', { class: 'iw-news__body' },
      h('div', { class: 'iw-news__kicker' }, h('i', { html: GLYPHS.sparkle }), P.kicker),
      h('div', { class: 'iw-news__title iw-display' + (title.length === 1 ? ' is-one' : '') }, title.map((t, k) => h('span', { style: { '--i': k } }, t))),
      h('p', { class: 'iw-news__lede' }, val(P.lede)),
      list,
      h('div', { class: 'iw-news__btns' }, btns),
      h('div', { class: 'iw-news__foot' }, dots, h('span', { class: 'iw-news__count' }, `${i + 1} / ${PAGES.length}`)));
    this.card.innerHTML = '';
    this.card.append(hero, body);
    restartAnim(this.card, first ? 'is-in' : 'is-swap');
    M._setFocus(btns[0], { snap: true });
    if (!this.reduced) {
      this._confetti();
      setTimeout(() => { if (this.el && this.el.isConnected) inkBurst(this.M._scr.el, { ...this._center(body.querySelector('.iw-news__title')), color: 'var(--nc)', count: 14, dist: 12, size: 1.5, ring: true }); }, first ? 520 : 260);
    }
  }
  _center(node) {
    if (!node) return { x: innerWidth / 2, y: innerHeight / 2 };
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width * 0.35, y: r.top + r.height / 2 };
  }

  _confetti() {
    const host = this.confetti;
    host.innerHTML = '';
    for (let i = 0; i < 34; i++) {
      const x = ((i * 0.618034 + 0.07) % 1) * 100;
      host.appendChild(h('i', { style: {
        left: `${x.toFixed(1)}%`, '--c': CONFETTI[i % CONFETTI.length], '--d': `${(0.05 + ((i * 0.37) % 1) * 0.5).toFixed(2)}s`,
        '--t': `${(1.5 + ((i * 0.53) % 1) * 1.1).toFixed(2)}s`, '--r': `${Math.round(((i * 0.71) % 1) * 720 - 360)}deg`,
        '--x': `${(((i * 0.29) % 1) - 0.5) * 12}vw`, '--w': `${(0.5 + ((i * 0.43) % 1) * 0.7).toFixed(2)}`, '--k': i % 3 ? '0' : '1',
      } }));
    }
    restartAnim(host, 'is-on');
  }

  // ================================================================ ink wipes (splat clip-path grown by JS)
  /** A full-screen layer of `tone` ink revealed by a splat growing from (x, y). */
  _ink(tone, x, y, dur, fromPrev) {
    const layer = h('div', { class: `iw-news__ink is-${tone}` }, h('i', { class: 'iw-news__halftone' }));
    this.inkHost.appendChild(layer);
    const W = this.el.clientWidth || innerWidth, H = this.el.clientHeight || innerHeight;
    const R = splatCover(x, y, W, H), seed = 7 + this.inkHost.childElementCount * 13;
    if (this.reduced) { layer.style.clipPath = ''; layer.classList.add('is-fade'); this._pruneInks(layer); return layer; }
    layer.style.clipPath = splatClip(x, y, 0.01, seed);
    this._tween(dur, (k) => { layer.style.clipPath = splatClip(x, y, R * easeOutCubic(k), seed); }, () => { layer.style.clipPath = ''; if (fromPrev) this._pruneInks(layer); });
    layer._splat = { x, y, R, seed };
    return layer;
  }
  _pruneInks(keep) { for (const n of [...this.inkHost.children]) if (n !== keep) n.remove(); }

  _tween(dur, step, done) {
    const o = { t: 0, dur: Math.max(0.01, dur), step, done };
    this._tweens.push(o);
    step(0);
    if (!this._raf) { this._last = performance.now(); this._raf = requestAnimationFrame((t) => this._tick(t)); }
    return o;
  }
  _tick(t) {
    const dt = Math.min(0.1, (t - this._last) / 1000) * (this.M.timeScale ?? 1);   // slow frames still finish the wipe on time
    this._last = t;
    for (let i = this._tweens.length - 1; i >= 0; i--) {
      const o = this._tweens[i];
      o.t += dt;
      const k = clamp(o.t / o.dur);
      safeCall(o.step, k);
      if (k >= 1) { this._tweens.splice(i, 1); if (o.done) safeCall(o.done); }
    }
    this._raf = this._tweens.length ? requestAnimationFrame((tt) => this._tick(tt)) : 0;
  }

  // ================================================================ flow
  next() {
    if (!this.el || this._busy || this.page >= PAGES.length - 1) return;
    this._busy = true;
    const btn = this.card.querySelector('.iw-news__go');
    const c = btn ? this._center(btn) : { x: innerWidth * 0.7, y: innerHeight * 0.7 };
    const r = this.el.getBoundingClientRect();
    this.card.classList.add('is-out');
    this.M._sfx('splat_big', 0.05);
    this._ink(PAGES[1].tone, c.x - r.left, c.y - r.top, this.reduced ? 0.01 : 0.55, true);
    setTimeout(() => { if (!this.el) return; this.card.classList.remove('is-out'); this._render(1, false); this._busy = false; }, this.reduced ? 0 : 300);
  }

  /** how: 'skip' | 'later' | 'back' | 'try' */
  close(how = 'later') {
    const M = this.M, el = this.el;
    if (!el || el._closing) return;
    el._closing = true;
    clearTimeout(this._t);
    if (M._modal === el) M._modal = null;
    el.classList.add('is-leaving');
    this.card.classList.add('is-out');
    if (how === 'back') M._sfx('ui_back');
    const finish = () => { el.remove(); if (this.el === el) this.el = null; };
    if (how === 'try') { finish(); this._tryPlay(); return; }
    // the splat drains back into the card's centre, the menu underneath comes back
    const last = this.inkHost.lastElementChild;
    if (!this.reduced && last && last._splat) {
      const s = last._splat, r = el.getBoundingClientRect(), cr = this.card.getBoundingClientRect();
      const x = cr.left + cr.width / 2 - r.left, y = cr.top + cr.height / 2 - r.top, R = splatCover(x, y, r.width, r.height);
      this._pruneInks(last);
      this._tween(0.5, (k) => { last.style.clipPath = splatClip(x, y, Math.max(0.01, R * (1 - easeInOutCubic(k))), s.seed + 1); }, finish);
    } else setTimeout(finish, this.reduced ? 200 : 450);
    const prev = M._modalPrev;
    if (prev && prev.isConnected) M._setFocus(prev, { snap: true });
  }

  /** PLAY NOW: Play › Elimination stage select on the new field, with Back leading to the mode cards. */
  _tryPlay() {
    const M = this.M;
    const st = M._setup || (M._setup = { times: {} });
    st.mode = 'turf';   // (historical id of the regular 4v4 mode — Elimination)
    M._setSetting('lastMode', 'turf');
    if (mapById('speedball')) { st.mapId = 'speedball'; M._setSetting('lastStage', 'speedball'); }
    M._stack = ['main', 'mode'];
    M.show('setup', { push: true });
  }

  dispose() { clearTimeout(this._t); cancelAnimationFrame(this._raf); this._raf = 0; if (this.el) this.el.remove(); this.el = null; }
}
