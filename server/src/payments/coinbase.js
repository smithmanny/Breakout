// Coinbase Commerce adapter (fallback crypto provider, selected with CRYPTO_PROVIDER=coinbase).
// Hosted charge page; webhook "X-CC-Webhook-Signature" = hex HMAC-SHA256(rawBody, shared secret).
// NOTE: verify the current Coinbase Commerce / Coinbase Business API and webhook format before launch (see docs/MONETIZATION.md).
import { hmacHex, safeEqual } from './util.js';
import { CURRENCY } from '../../../src/shop/catalog.js';

const API = 'https://api.commerce.coinbase.com';

export function normaliseCharge(c, eventId = null, type = '') {
  const items = String(c.metadata?.items || '').split(',').filter(Boolean);
  const local = c.pricing?.local || {};
  const status = /charge:(confirmed|resolved)$/.test(type) ? 'paid' : /charge:failed$/.test(type) ? 'failed' : 'pending';
  return {
    eventId, provider: 'coinbase', ref: c.code, pid: c.metadata?.pid || null, itemIds: items,
    amount: local.amount != null ? Math.round(parseFloat(local.amount) * 100) : null,
    currency: String(local.currency || '').toLowerCase(), email: null, status,
  };
}

export const coinbaseAdapter = {
  id: 'coinbase',
  methods: ['crypto'],
  configured: (env) => !!(env.COINBASE_COMMERCE_API_KEY && env.COINBASE_WEBHOOK_SECRET),

  async createCheckout(env, { pid, items, total, successUrl, cancelUrl }) {
    const r = await fetch(API + '/charges', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cc-api-key': env.COINBASE_COMMERCE_API_KEY, 'x-cc-version': '2018-03-22' },
      body: JSON.stringify({
        name: 'BREAKOUT cosmetics', description: items.map((i) => i.name).join(', ').slice(0, 200),
        pricing_type: 'fixed_price', local_price: { amount: (total / 100).toFixed(2), currency: CURRENCY.toUpperCase() },
        metadata: { pid, items: items.map((i) => i.id).join(',') }, redirect_url: successUrl, cancel_url: cancelUrl,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('coinbase: ' + (j.error?.message || r.status));
    return { url: j.data.hosted_url, ref: j.data.code };
  },

  async parseWebhook(env, rawBody, headers) {
    const want = await hmacHex(env.COINBASE_WEBHOOK_SECRET || '', rawBody);
    if (!env.COINBASE_WEBHOOK_SECRET || !safeEqual(headers.get('x-cc-webhook-signature') || '', want)) return { ok: false };
    let b; try { b = JSON.parse(rawBody); } catch { return { ok: false }; }
    const ev = b.event || {};
    if (!ev.data || !/^charge:/.test(ev.type || '')) return { ok: true, eventId: ev.id, order: null };
    return { ok: true, eventId: ev.id, order: normaliseCharge(ev.data, ev.id, ev.type) };
  },

  async retrieve(env, ref) {
    if (!/^[A-Z0-9]{6,16}$/.test(ref)) throw new Error('bad ref');
    const r = await fetch(API + '/charges/' + ref, { headers: { 'x-cc-api-key': env.COINBASE_COMMERCE_API_KEY, 'x-cc-version': '2018-03-22' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('coinbase: ' + (j.error?.message || r.status));
    const c = j.data, tl = c.timeline || [];
    const last = tl.length ? tl[tl.length - 1].status : 'NEW';
    const type = last === 'COMPLETED' || last === 'RESOLVED' ? 'charge:confirmed' : last === 'EXPIRED' || last === 'CANCELED' ? 'charge:failed' : 'charge:pending';
    return normaliseCharge(c, null, type);
  },
};
