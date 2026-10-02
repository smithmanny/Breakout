// Stripe adapter: Checkout Sessions (card, and Stripe's own stablecoin / "crypto" payment method) + webhooks.
// Uses fetch + Web Crypto only (no SDK). Test mode by default: a live key is refused unless SHOP_MODE=live.
//
// Crypto: Stripe Checkout supports stablecoin payments (USDC on Ethereum/Solana/Polygon/Base/Tempo, USD) via
// payment_method_types[]=crypto, for businesses in supported regions (US, plus private preview elsewhere). It must be
// enabled in the Dashboard (Settings > Payment methods). Payments settle to your Stripe balance in fiat. Confirmation can
// be asynchronous, so we handle checkout.session.async_payment_succeeded / _failed as well as .completed.
import { hmacHex, safeEqual, isLive } from './util.js';
import { CURRENCY } from '../../../src/shop/catalog.js';

const API = 'https://api.stripe.com/v1';
const TOLERANCE_S = 300;

export function configured(env, method) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return false;
  if (env.STRIPE_SECRET_KEY.startsWith('sk_live') && !isLive(env)) return false;   // never charge real money by accident
  if (method === 'crypto' && env.STRIPE_CRYPTO === 'off') return false;
  return true;
}

/** Stripe-Signature check: header "t=<unix>,v1=<hmac>[,v1=...]"; signed payload `${t}.${rawBody}`. */
export async function verifySignature(rawBody, header, secret, nowS = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  let t = null; const sigs = [];
  for (const part of String(header).split(',')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = v; else if (k === 'v1') sigs.push(v);
  }
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(nowS - +t) > TOLERANCE_S) return false;               // replay protection
  const want = await hmacHex(secret, `${t}.${rawBody}`);
  let ok = false; for (const s of sigs) if (safeEqual(s, want)) ok = true;
  return ok;
}

const form = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) p.append(k, String(v));
  return p;
};

async function call(env, method, path, body, idem) {
  const r = await fetch(API + path, {
    method,
    headers: {
      authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'content-type': 'application/x-www-form-urlencoded',
      ...(idem ? { 'idempotency-key': idem } : {}),
    },
    body: body ? form(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('stripe: ' + (j.error?.message || r.status));
  return j;
}

/** Normalise a Checkout Session into our order shape. */
export function normaliseSession(s, eventId = null) {
  const items = String(s.metadata?.items || '').split(',').filter(Boolean);
  const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
  return {
    eventId, provider: 'stripe', ref: s.id, pid: s.metadata?.pid || s.client_reference_id || null, itemIds: items,
    amount: s.amount_total, currency: s.currency, email: s.customer_details?.email || s.customer_email || null,
    paymentIntent: typeof s.payment_intent === 'string' ? s.payment_intent : null,
    status: paid ? 'paid' : s.status === 'expired' ? 'failed' : 'pending',
  };
}

export const stripeAdapter = {
  id: 'stripe',
  methods: ['card', 'crypto'],
  configured,

  /** -> { url, ref } */
  async createCheckout(env, { pid, items, total, method, successUrl, cancelUrl, email }) {
    const body = {
      mode: 'payment',
      client_reference_id: pid,
      'metadata[pid]': pid,
      'metadata[items]': items.map((i) => i.id).join(','),
      'metadata[total]': total,
      'payment_intent_data[metadata][pid]': pid,
      success_url: successUrl,
      cancel_url: cancelUrl,
      'payment_method_types[0]': method === 'crypto' ? 'crypto' : 'card',
      customer_creation: undefined,
      customer_email: email || undefined,
    };
    items.forEach((it, n) => {
      body[`line_items[${n}][quantity]`] = 1;
      body[`line_items[${n}][price_data][currency]`] = CURRENCY;
      body[`line_items[${n}][price_data][unit_amount]`] = it.price;          // from the server catalog, never the client
      body[`line_items[${n}][price_data][product_data][name]`] = it.name;
      body[`line_items[${n}][price_data][product_data][description]`] = 'Cosmetic item - no gameplay advantage';
      body[`line_items[${n}][price_data][product_data][metadata][item]`] = it.id;
    });
    const s = await call(env, 'POST', '/checkout/sessions', body, `bo-${pid}-${items.map((i) => i.id).join('+')}-${Math.floor(Date.now() / 600000)}-${method}`);
    return { url: s.url, ref: s.id };
  },

  /** Verify + parse a webhook. Returns { ok:false } on bad signature, { ok:true, order|null, eventId, refund? }. */
  async parseWebhook(env, rawBody, headers) {
    if (!(await verifySignature(rawBody, headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) return { ok: false };
    let ev; try { ev = JSON.parse(rawBody); } catch { return { ok: false }; }
    const o = ev.data?.object || {};
    switch (ev.type) {
      case 'checkout.session.completed':                  // card: paid now. Async methods (some crypto flows): unpaid
      case 'checkout.session.async_payment_succeeded':    // -> arrives later as paid
        return { ok: true, eventId: ev.id, order: normaliseSession(o, ev.id) };
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        return { ok: true, eventId: ev.id, order: { ...normaliseSession(o, ev.id), status: 'failed' } };
      case 'charge.refunded':
        if (o.refunded) return { ok: true, eventId: ev.id, refund: { paymentIntent: o.payment_intent } };
        return { ok: true, eventId: ev.id, order: null };
      default:
        return { ok: true, eventId: ev.id, order: null };   // acknowledged, ignored
    }
  },

  /** Fetch current state of a session (return-page confirm). */
  async retrieve(env, ref) {
    if (!/^cs_[A-Za-z0-9_]+$/.test(ref)) throw new Error('bad ref');
    return normaliseSession(await call(env, 'GET', '/checkout/sessions/' + ref));
  },
};
