// Provider registry. A provider adapter implements:
//   id, methods[], configured(env, method) -> bool
//   createCheckout(env, { pid, items, total, method, successUrl, cancelUrl, email }) -> { url, ref }
//   parseWebhook(env, rawBody, headers) -> { ok:false } | { ok:true, eventId, order|null, refund? }
//   retrieve(env, ref) -> order           (order = { provider, ref, pid, itemIds, amount, currency, email, status })
// To add a provider (PayPal, Lemon Squeezy, ...): write an adapter file and register it here. Nothing else changes.
import { stripeAdapter } from './stripe.js';
import { coinbaseAdapter } from './coinbase.js';

export const ADAPTERS = { stripe: stripeAdapter, coinbase: coinbaseAdapter };

/** Which adapter serves a payment method ('card' | 'crypto'). Crypto prefers Stripe's own stablecoin support. */
export function providerFor(env, method) {
  if (method === 'card') return stripeAdapter;
  if (method === 'crypto') {
    const want = (env.CRYPTO_PROVIDER || 'stripe').toLowerCase();
    return ADAPTERS[want] || stripeAdapter;
  }
  return null;
}

/** Methods the shop can offer right now (a method is hidden until its provider has its secrets configured). */
export function availableMethods(env) {
  return ['card', 'crypto'].filter((m) => { const p = providerFor(env, m); return p && p.configured(env, m); });
}
