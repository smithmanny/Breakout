// Shop client: talks to the Worker's /shop/* API. The browser never decides ownership or price: it caches what the server
// said (so the game works offline) and sends item ids only.
//   const shop = getShop();  await shop.refresh();  shop.owned.has(id);  await shop.checkout(['gun_ember'], 'card');
// Identity is anonymous: { pid, token } minted by the server and kept in localStorage ('breakout.shop'). The recovery
// code (shop.createRecovery / shop.redeem) moves it to another device or restores it after clearing site data.
import { ITEMS, getItem, SLOTS, sanitizeEquip } from './catalog.js';
import { relayURL } from '../net/transport.js';
import { setOwned } from './cosmetics.js';
import { setKeySource } from './claims.js';
import { G } from '../core/ctx.js';

const LS = 'breakout.shop', PENDING = 'breakout.shop.pending', REC = 'breakout.shop.recovery';
const REQ_TIMEOUT_MS = 12000;
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

/** http(s) base of the Worker, derived from the relay URL (?relay= wins, then local dev relay, then production). */
export function shopBase() {
  const q = new URLSearchParams(location.search).get('shop-api');
  const u = q || relayURL();
  return u.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/+$/, '');
}

export class ShopClient {
  constructor() {
    const s = read(LS) || {};
    this.id = s.pid && s.token ? { pid: s.pid, token: s.token } : null;
    this.owned = new Set(s.owned || []);
    this.equipped = sanitizeEquip(s.equipped || {});
    this.claim = s.claim || null;
    this.items = ITEMS;                      // offline fallback: the bundled catalog (browse + preview, no buying)
    this.methods = [];                       // payment methods the server says are live
    this.mode = 'test';
    this.state = 'idle';                     // idle | loading | ready | offline | unavailable | error
    this.error = null;
    this.notice = null;                      // last checkout outcome to show in the Shop: { kind: cancelled|pending|failed|rejected|error|unknown }
    this.rec = read(REC) || {};              // { code, saved, prompted }: recovery code kept on THIS device + whether the player confirmed saving it
    this.listeners = new Set();
    setOwned(this.owned);
    setKeySource(async () => (await this._req('GET', '/shop/claim-key', null, false)).jwk);
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const f of this.listeners) try { f(this); } catch (e) { console.warn('[shop]', e); } }
  _save() { write(LS, { ...(this.id || {}), owned: [...this.owned], equipped: this.equipped, claim: this.claim }); setOwned(this.owned); }

  async _req(method, path, body, auth = true) {
    const headers = {};
    if (body) headers['content-type'] = 'application/json';
    if (auth) { if (!this.id) await this._identify(); headers.authorization = `Bearer ${this.id.pid}.${this.id.token}`; }
    let r;
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), REQ_TIMEOUT_MS) : 0;
    try { r = await fetch(shopBase() + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ac ? ac.signal : undefined }); }
    catch (e) { clearTimeout(timer); const err = new Error(ac && ac.signal.aborted ? 'timeout' : 'offline'); err.code = ac && ac.signal.aborted ? 'timeout' : 'offline'; throw err; }
    clearTimeout(timer);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const err = new Error(j.error || 'http_' + r.status); err.code = j.error || 'http'; err.status = r.status; throw err; }
    return j;
  }
  async _identify() {
    const j = await this._req('POST', '/shop/identity', null, false);
    this.id = { pid: j.pid, token: j.token }; this._save();
  }
  _fail(e) {
    this.error = e.code || 'error';
    this.state = e.code === 'offline' ? 'offline' : e.code === 'shop_unavailable' ? 'unavailable' : this.state === 'ready' ? 'ready' : 'error';   // 5xx / timeout / rate limit: 'error', not "offline"
    this._emit();
  }

  /** Load catalog (live methods) + what you own. Safe to call any time; failures leave the cached state in place. */
  async refresh() {
    this.state = 'loading'; this.error = null; this._emit();
    try {
      const c = await this._req('GET', '/shop/catalog', null, false);
      this.items = c.items; this.methods = c.methods || []; this.mode = c.mode;
      await this._loadMe();
      const pend = read(PENDING);      // a crypto payment confirmed by the webhook while we were away: it is simply owned now
      if (pend && pend.items && pend.items.every((id) => this.owned.has(id))) { write(PENDING, null); this.notice = null; }
      this.state = 'ready'; this._emit();
    } catch (e) {
      if (e.status === 401 && this.id) { this.id = null; this.rec = {}; write(REC, null); this._save(); return this.refresh(); }   // token no longer valid: start fresh
      this._fail(e);
    }
  }
  async _loadMe() {
    const m = await this._req('GET', '/shop/me');
    this.owned = new Set(m.owned); this.equipped = m.equipped || {}; this.claim = m.claim || null;
    this._save(); this._syncProfile();
  }

  /** Mirror the equipped cosmetics (and their signed claim) into the saved look so the game + lobby use them. */
  _syncProfile() {
    try {
      const p = (G.game && G.game.profile) || null;
      if (!p) return;
      const st = { ...(p.style || {}) };
      for (const slot of Object.values(SLOTS)) delete st[slot];
      delete st.claim;
      Object.assign(st, this.equipped);
      if (this.claim && Object.keys(this.equipped).length) st.claim = this.claim;
      p.style = st;
      write('inkwave.profile', p);
    } catch { /* ignore */ }
  }

  async equip(slot, id) {
    if (id !== null && !this.owned.has(id)) throw new Error('not_owned');
    const r = await this._req('POST', '/shop/equip', { [slot]: id });
    this.equipped = r.equipped || {}; this.claim = r.claim || null; this._save(); this._syncProfile(); this._emit();
  }

  /** Start a purchase: the server prices it from its own catalog and returns a hosted-checkout URL. */
  async checkout(ids, method) {
    const r = await this._req('POST', '/shop/checkout', { items: ids, method });
    write(PENDING, { ref: r.ref, provider: r.provider, items: ids, at: Date.now() });
    return r.url;
  }

  /** Call once at boot: if the page was opened by a checkout redirect, confirm the order. Returns a result for a toast. */
  async handleReturn() {
    const q = new URLSearchParams(location.search);
    if (!q.has('shop')) return null;
    const kind = q.get('shop'), pending = read(PENDING);
    const ref = q.get('ref') || pending?.ref, provider = q.get('provider') || pending?.provider;
    for (const k of ['shop', 'ref', 'provider']) q.delete(k);
    try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch { /* ignore */ }
    if (kind === 'cancel') { write(PENDING, null); return this._note({ status: 'cancelled' }); }
    if (!ref || !provider) return this._note({ status: 'unknown' });
    return this.confirm(provider, ref);
  }

  /** Ask the server to verify the order with the provider. Crypto can take a few minutes: polls briefly, then leaves a note. */
  async confirm(provider, ref, tries = 6) {
    for (let i = 0; i < tries; i++) {
      try {
        const r = await this._req('POST', '/shop/checkout/confirm', { provider, ref });
        if (r.status === 'paid') { write(PENDING, null); await this._loadMe(); this.notice = null; this._emit(); return { status: 'paid', items: r.items }; }
        if (r.status === 'failed' || r.status === 'rejected') { write(PENDING, null); return this._note({ status: r.status }); }
      } catch (e) { if (e.code === 'unknown_order') { write(PENDING, null); return this._note({ status: 'unknown' }); } if (i === tries - 1) return this._note({ status: 'error', error: e.code }); }
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 2000 + i * 1000));
    }
    return this._note({ status: 'pending' });       // the webhook will still fulfil it; the next refresh picks it up
  }
  /** Remember a non-success checkout outcome so the Shop can keep explaining it after the toast is gone. */
  _note(r) { this.notice = { kind: r.status, error: r.error || null, at: Date.now() }; this._emit(); return r; }
  dismissNotice() { this.notice = null; this._emit(); }
  pendingOrder() { const p = read(PENDING); return p && Date.now() - p.at < 864e5 ? p : null; }

  /** The recovery code for this player. Reuses the one already made on this device (a new code would invalidate any copy
   *  the player already wrote down); `fresh` forces a replacement. The code is stored beside the token: clearing site data
   *  loses both, which is exactly why the Shop pushes the player to keep a copy elsewhere. */
  async createRecovery(fresh = false) {
    if (!fresh && this.rec.code) return this.rec.code;
    const code = (await this._req('POST', '/shop/recovery/create')).code;
    this._saveRec({ code, saved: false, prompted: !!this.rec.prompted });
    return code;
  }
  async redeem(code) {
    const clean = String(code || '').trim().toUpperCase();
    const r = await this._req('POST', '/shop/recovery/redeem', { code: clean }, false);
    this.id = { pid: r.pid, token: r.token }; this._save();
    this._saveRec({ code: clean, saved: true, prompted: true });      // they typed it, so they have it
    await this._loadMe(); this._emit();
  }
  _saveRec(r) { this.rec = r; write(REC, r); this._emit(); }
  markRecoverySaved() { this._saveRec({ ...this.rec, saved: true, prompted: true }); }
  markRecoveryPrompted() { if (!this.rec.prompted) this._saveRec({ ...this.rec, prompted: true }); }
  /** True once the player owns something but has not confirmed keeping their recovery code. */
  needsRecoverySave() { return this.owned.size > 0 && !this.rec.saved; }
}

let _shop = null;
export const getShop = () => (_shop ||= new ShopClient());
export { getItem };
