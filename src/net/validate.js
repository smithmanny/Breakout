// Wire validation for everything a peer can send (docs/NET.md "Hostile clients"). Pure functions, no DOM / three.js:
// the Cloudflare relay (server/src/index.js) and the clients (session.js, netmatch.js) run the SAME rules, so a hacked
// client cannot push a malformed lobby, roster, look or hit past either side.
//
// Every clean*() returns a fresh, sanitised object (unknown keys dropped, strings clamped, numbers finite and in
// range, enums checked) or null when the message is unusable. Nothing here trusts the sender.
import { MAPS, WEAPONS, WEAPON_ORDER, validWeapon, TEAM_PALETTES, SUB, SPECIALS } from '../config.js';

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const MAP_IDS = new Set(MAPS.map((m) => m.id));
const DIFFS = new Set(['easy', 'normal', 'hard']);
export const NAME_RE = /[^\p{L}\p{N} ._\-!?']/gu;

export const cleanName = (s, fb = 'Player') => (typeof s === 'string' ? s.replace(NAME_RE, '').slice(0, 16) : '') || fb;
export const isPlayerId = (s) => typeof s === 'string' && /^[A-Z0-9]{1,8}$/.test(s);
const isCfgId = (s) => typeof s === 'string' && /^[a-z0-9]{1,16}$/.test(s);

// ---------------------------------------------------------------------------------------------- looks
// Locker look: six small indices plus the shop's premium slots. The signed claim (src/shop/claims.js) is only passed on
// as an opaque, length-capped token string: gate() still refuses any premium item it does not vouch for.
const STYLE_IDX = ['hair', 'skin', 'outfit', 'eyes', 'hat', 'brows'];
const ITEM_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/i, CLAIM_RE = /^[A-Za-z0-9_.-]{1,600}$/;
export function cleanStyle(st) {
  if (!isObj(st)) return null;
  const o = {};
  for (const k of STYLE_IDX) if (int(st[k], 0, 63)) o[k] = st[k];
  for (const k of ['wskin', 'costume']) if (typeof st[k] === 'string' && ITEM_RE.test(st[k])) o[k] = st[k];
  if (typeof st.claim === 'string' && CLAIM_RE.test(st.claim)) o.claim = st.claim;
  return o;
}

// ---------------------------------------------------------------------------------------------- lobby / session
export function cleanMe(d) {
  const o = { k: 'me' };
  if (typeof d.name === 'string') o.name = cleanName(d.name);
  if (typeof d.weapon === 'string' && WEAPONS[d.weapon]) o.weapon = validWeapon(d.weapon);
  const st = cleanStyle(d.style); if (st) o.style = st;
  if (typeof d.ready === 'boolean') o.ready = d.ready;
  if (d.team === 0 || d.team === 1 || d.team === 'auto') o.team = d.team;
  if (num(d.ping, 0, 9999)) o.ping = d.ping;
  return o;
}

function cleanPlayer(p) {
  if (!isObj(p) || !isPlayerId(p.id)) return null;
  return { id: p.id, name: cleanName(p.name), team: p.team === 0 || p.team === 1 ? p.team : 'auto', weapon: validWeapon(p.weapon), style: cleanStyle(p.style) || null, ready: p.ready === true, ping: num(p.ping, 0, 9999) ? p.ping : 0 };
}

/** Host → everyone: the lobby. `l` is d.l. */
export function cleanLobby(l) {
  if (!isObj(l) || !Array.isArray(l.players) || l.players.length > 8) return null;
  if (!MAP_IDS.has(l.map)) return null;
  const players = [], seen = new Set();
  for (const p of l.players) { const c = cleanPlayer(p); if (!c || seen.has(c.id)) return null; seen.add(c.id); players.push(c); }
  return {
    map: l.map, time: l.time === 'dusk' ? 'dusk' : 'day', duration: num(l.duration, 30, 600) ? Math.round(l.duration) : 180, bots: l.bots === true,
    difficulty: DIFFS.has(l.difficulty) ? l.difficulty : 'normal', palette: int(l.palette, 0, TEAM_PALETTES.length - 1) ? l.palette : 0, mode: l.mode === 'boss' ? 'boss' : 'turf', players,
  };
}

/** Host → everyone: the match start config (roster included). */
export function cleanStart(d) {
  if (!isObj(d) || !Array.isArray(d.roster) || d.roster.length < 1 || d.roster.length > 16 || !MAP_IDS.has(d.map) || !isCfgId(d.id) || !isPlayerId(d.host)) return null;
  const roster = [], nids = new Set();
  for (const r of d.roster) {
    if (!isObj(r) || !int(r.nid, 0, 31) || nids.has(r.nid) || !isPlayerId(r.owner) || !(r.team === 0 || r.team === 1) || !int(r.slot, 0, 15)) return null;
    nids.add(r.nid);
    roster.push({ nid: r.nid, owner: r.owner, bot: r.bot === true, team: r.team, slot: r.slot, name: cleanName(r.name, 'Bot'), weapon: validWeapon(r.weapon), style: cleanStyle(r.style) || null });
  }
  return {
    k: 'start', roster, map: d.map, time: d.time === 'dusk' ? 'dusk' : 'day', duration: num(d.duration, 10, 600) ? d.duration : 180,
    difficulty: DIFFS.has(d.difficulty) ? d.difficulty : 'normal', palette: int(d.palette, 0, TEAM_PALETTES.length - 1) ? d.palette : 0, mode: d.mode === 'boss' ? 'boss' : 'turf', host: d.host, id: d.id,
  };
}

export const cleanEmote = (d) => ({ k: 'emote', n: typeof d.n === 'string' ? d.n.replace(/[^a-z]/gi, '').slice(0, 16) : '' });

// ---------------------------------------------------------------------------------------------- hits
// Largest single hit any weapon / grenade / special can deal, per weapon id (with slack for lerped values).
const maxOf = (w) => Math.max(0, ...['damage', 'damageMax', 'damageHead', 'splashDamage', 'splashDamageMax', 'directDamage', 'rollDamage'].map((k) => +w[k] || 0));
const DMG_CAP = { bomb: SUB.bomb.damageMax, slam: SPECIALS.slam.damageMax, storm: 40 };
for (const id of Object.keys(WEAPONS)) DMG_CAP[id] = maxOf(WEAPONS[id]);
export const HIT_ANY_MAX = Math.ceil(Math.max(...Object.values(DMG_CAP)) * 1.1);
const WID_RE = /^[a-z]{1,16}$/;
/** Largest plausible damage for weapon id `w` (unknown ids: the global cap). */
export const damageCap = (w) => (DMG_CAP[w] ? Math.ceil(DMG_CAP[w] * 1.1) + 1 : HIT_ANY_MAX);
/** How far (m) a hit by weapon `w` can plausibly land from the shooter, before network slack. */
export function reachOf(w) {
  const c = WEAPONS[w];
  if (!c) return 40;
  return Math.max(c.range || 0, c.rangeMax || 0, c.projSpeed && c.life ? c.projSpeed * c.life * 0.5 : 0, 12);
}

export function cleanHit(d) {
  if (!int(d.v, 0, 31) || !int(d.a, 0, 31) || !num(d.d, 0, HIT_ANY_MAX) || typeof d.w !== 'string' || !WID_RE.test(d.w)) return null;
  return { k: 'hit', v: d.v, a: d.a, d: d.d, w: d.w };
}
export function cleanBossHit(d) {
  if (!int(d.a, 0, 31) || !num(d.d, 0, 600) || !(d.c === undefined || int(d.c, -1, 4095)) || !(d.w == null || (typeof d.w === 'string' && WID_RE.test(d.w)))) return null;
  return { k: 'bhit', a: d.a, d: d.d, weak: d.weak ? 1 : 0, w: d.w || null, c: d.c === undefined ? -1 : d.c };
}

/** Token bucket per key (attacker nid): `take(key, cost, now)` → false when the shooter exceeds what its weapon can do. */
export class Budget {
  constructor(cap, perSec) { this.cap = cap; this.perSec = perSec; this.m = new Map(); }
  take(key, cost, t) {
    let b = this.m.get(key);
    if (!b) this.m.set(key, (b = { v: this.cap, t }));
    b.v = Math.min(this.cap, b.v + Math.max(0, t - b.t) * this.perSec); b.t = t;
    if (b.v < cost) return false;
    b.v -= cost;
    return true;
  }
}

// ---------------------------------------------------------------------------------------------- ticks
const ACTOR_LEN = [20, 32];
/** Structure + finiteness of a 20 Hz tick (cheap: runs on every incoming tick). Returns d or null. */
export function checkTick(d) {
  if (!num(d.ts, 0, 1e9)) return null;
  if (d.a !== undefined) {
    if (!Array.isArray(d.a) || d.a.length > 16) return null;
    for (const s of d.a) {
      if (!Array.isArray(s) || s.length < ACTOR_LEN[0] || s.length > ACTOR_LEN[1] || !int(s[0], 0, 31)) return null;
      for (let i = 1; i < s.length; i++) {
        const v = s[i];
        if (v === null || v === undefined) continue;
        if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 5000) return null;
      }
    }
  }
  if (d.e !== undefined) {
    if (!Array.isArray(d.e) || d.e.length > 400) return null;
    for (const e of d.e) if (!Array.isArray(e) || e.length < 2 || e.length > 40 || !num(e[0], 0, 1e9) || typeof e[1] !== 'string' || e[1].length > 16) return null;
  }
  if (d.c !== undefined && !(Array.isArray(d.c) && d.c.length === 2 && typeof d.c[0] === 'string' && d.c[0].length <= 12 && num(d.c[1], -1e4, 1e4))) return null;
  return d;
}

export const HOST_ONLY = new Set(['lobby', 'start', 'go', 'st', 'res', 'end', 'own']);
export const KINDS = new Set([...HOST_ONLY, 't', 'me', 'ready', 'emote', 'hit', 'bhit']);

/**
 * Relay-side / client-side gate for one decoded payload from `from`. Returns the (possibly rewritten) message to forward /
 * apply, or null to drop it. `isHost` = the sender is the room's host.
 */
export function cleanMessage(d, isHost) {
  if (!isObj(d) || typeof d.k !== 'string' || !KINDS.has(d.k)) return null;
  if (HOST_ONLY.has(d.k) && !isHost) return null;
  switch (d.k) {
    case 't': return checkTick(d);
    case 'me': return cleanMe(d);
    case 'emote': return cleanEmote(d);
    case 'hit': return cleanHit(d);
    case 'bhit': return cleanBossHit(d);
    case 'start': return cleanStart(d);
    case 'lobby': { const l = cleanLobby(d.l); return l && { k: 'lobby', l }; }
    case 'ready': return isCfgId(d.id) ? { k: 'ready', id: d.id } : null;
    case 'go': return isCfgId(d.id) ? { k: 'go', id: d.id } : null;
    default: return d;   // st / res / end / own: host-only, shape-checked where they are applied (netmatch.js)
  }
}

export { WEAPON_ORDER };
