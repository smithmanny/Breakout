// Shop API (cosmetics only). Mounted by index.js for every /shop/* path.
//   GET  /shop/catalog                 public catalog + which payment methods are live
//   POST /shop/identity                mint an anonymous { pid, token }
//   GET  /shop/me                      (auth) { owned, equipped, claim }
//   POST /shop/equip                   (auth) { wskin?, costume? } -> equipped + fresh claim
//   POST /shop/checkout                (auth) { items:[id], method:'card'|'crypto' } -> { url, ref, provider }
//   POST /shop/checkout/confirm        (auth) { provider, ref } -> fulfils if the provider says it is paid
//   POST /shop/recovery/create         (auth) -> { code } (shown once; only its hash is stored)
//   POST /shop/recovery/redeem         { code } -> { pid, token }
//   GET  /shop/claim-key               public JWK that verifies cosmetic claims
//   POST /shop/webhook/<provider>      provider webhooks (signature verified, idempotent)
// Everything except /webhook needs an allowed Origin (CORS locked down) and is rate limited.
import { ITEMS, CATALOG_VERSION, priceCart, getItem } from '../../src/shop/catalog.js';
import { json, readJson, isLive } from './payments/util.js';
import { ADAPTERS, providerFor, availableMethods } from './payments/providers.js';
import { authenticate, newPid, tokenFor, signClaim, publicJwk, claimsConfigured, newRecoveryCode, hashCode } from './payments/identity.js';
import * as store from './payments/store.js';

// ---------------------------------------------------------------------------------------------- CORS
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local)(:\d+)?$/;
const PAGES = /^https:\/\/([a-z0-9-]+\.)?inkwave-aah\.pages\.dev$/;
/** Allowed browser origins: the game's own site, SHOP_ALLOWED_ORIGINS (comma list), and (test mode only) localhost / LAN. */
export function originAllowed(origin, env) {
  if (!origin) return false;
  if (PAGES.test(origin)) return true;
  if ((env.SHOP_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin)) return true;
  return !isLive(env) && LOCAL.test(origin);
}
const cors = (origin) => ({ 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '600', vary: 'Origin' });

// ---------------------------------------------------------------------------------------------- rate limiting
// Per-isolate sliding counters (cheap first line). If a Workers Rate Limiting binding SHOP_RL is configured it is the
// authoritative global limiter (wrangler.jsonc "ratelimits"). Both are best effort; Stripe is the real abuse backstop.
const WINDOW = 60000, LIMITS = { identity: 6, read: 90, write: 20, checkout: 8, recovery: 8, webhook: 600 };
const buckets = new Map();
async function limited(req, env, group) {
  const ip = req.headers.get('cf-connecting-ip') || 'local', now = Date.now(), k = group + '|' + ip;
  let b = buckets.get(k);
  if (!b || now - b.t > WINDOW) { b = { t: now, n: 0 }; buckets.set(k, b); if (buckets.size > 5000) for (const [kk, v] of buckets) if (now - v.t > WINDOW) buckets.delete(kk); }
  if (++b.n > (+env.SHOP_RATE_SCALE || 1) * LIMITS[group]) return true;
  if (env.SHOP_RL && typeof env.SHOP_RL.limit === 'function') { const r = await env.SHOP_RL.limit({ key: k }); if (!r.success) return true; }
  return false;
}

// ---------------------------------------------------------------------------------------------- handlers
const returnBase = (env, origin) => {
  const base = env.SHOP_RETURN_URL || origin;
  try { const u = new URL(base); return u.origin + u.pathname; } catch { return null; }
};

async function fulfilAndNotify(env, order, waitUntil) {
  const r = await store.fulfil(env, order);
  if (r.status === 'granted') waitUntil(maybeEmailRecovery(env, r).catch(() => {}));
  return r;
}

/** Optional: email the buyer a recovery code once (needs RESEND_API_KEY + MAIL_FROM; skipped silently otherwise). */
async function maybeEmailRecovery(env, r) {
  if (!r.email || !env.RESEND_API_KEY || !env.MAIL_FROM || await env.SHOP.get(`rcp:${r.pid}`)) return;
  const code = newRecoveryCode();
  await store.saveRecovery(env, r.pid, await hashCode(code));
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: r.email, subject: 'Your BREAKOUT purchase and recovery code',
      text: `Thanks for your purchase!\n\nIf you ever lose access on this device, open the Shop, choose Restore, and enter this recovery code:\n\n${code}\n\nKeep it private: anyone with the code can restore your items.` }),
  });
}

async function handleWebhook(req, env, provider, ctx) {
  const adapter = ADAPTERS[provider];
  if (!adapter || !store.kvOk(env)) return new Response('not found', { status: 404 });
  if (await limited(req, env, 'webhook')) return new Response('slow down', { status: 429 });
  const raw = await req.text();
  if (raw.length > 262144) return new Response('too large', { status: 413 });
  const ev = await adapter.parseWebhook(env, raw, req.headers);
  if (!ev.ok) return new Response('bad signature', { status: 400 });
  try {
    if (await store.seenEvent(env, provider, ev.eventId)) return new Response('duplicate', { status: 200 });
    if (ev.refund?.paymentIntent) await store.revokeByPaymentIntent(env, ev.refund.paymentIntent);
    if (ev.order) await fulfilAndNotify(env, ev.order, (p) => ctx.waitUntil(p));
    await store.markEvent(env, provider, ev.eventId);
  } catch (e) {
    return new Response('retry', { status: 500 });          // provider redelivers; fulfilment is idempotent
  }
  return new Response('ok', { status: 200 });
}

export async function handleShop(req, env, ctx) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const wh = /^\/shop\/webhook\/([a-z]+)$/.exec(path);
  if (wh && req.method === 'POST') return handleWebhook(req, env, wh[1], ctx);

  const origin = req.headers.get('Origin') || '';
  if (!originAllowed(origin, env)) return json({ error: 'forbidden' }, 403);
  const C = cors(origin);
  const reply = (obj, status = 200) => json(obj, status, C);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: C });
  if (!store.kvOk(env) || !env.TOKEN_SECRET) return reply({ error: 'shop_unavailable' }, 503);

  const GET = req.method === 'GET', POST = req.method === 'POST';
  try {
    if (GET && path === '/shop/catalog') {
      if (await limited(req, env, 'read')) return reply({ error: 'rate_limited' }, 429);
      return reply({ version: CATALOG_VERSION, items: ITEMS.filter((i) => !i.retired), methods: availableMethods(env), mode: isLive(env) ? 'live' : 'test', claims: claimsConfigured(env) });
    }
    if (GET && path === '/shop/claim-key') return reply({ jwk: publicJwk(env) });
    if (POST && path === '/shop/identity') {
      if (await limited(req, env, 'identity')) return reply({ error: 'rate_limited' }, 429);
      const pid = newPid();
      return reply({ pid, token: await tokenFor(env, pid) });
    }
    if (POST && path === '/shop/recovery/redeem') {
      if (await limited(req, env, 'recovery')) return reply({ error: 'rate_limited' }, 429);
      const b = await readJson(req); if (!b || typeof b.code !== 'string' || b.code.length > 40) return reply({ error: 'bad_request' }, 400);
      const pid = await store.pidForRecovery(env, await hashCode(b.code));
      if (!pid) return reply({ error: 'invalid_code' }, 404);
      return reply({ pid, token: await tokenFor(env, pid) });
    }

    // ---- authenticated
    const pid = await authenticate(req, env);
    if (!pid) return reply({ error: 'unauthorized' }, 401);
    const group = POST && path !== '/shop/checkout/confirm' ? (path === '/shop/checkout' ? 'checkout' : path.startsWith('/shop/recovery') ? 'recovery' : 'write') : 'read';
    if (await limited(req, env, group)) return reply({ error: 'rate_limited' }, 429);
    const mine = async () => { const equipped = await store.getEquipped(env, pid); return { equipped, claim: Object.keys(equipped).length ? await signClaim(env, pid, equipped) : null }; };

    if (GET && path === '/shop/me') return reply({ pid, owned: await store.getOwned(env, pid), ...(await mine()) });

    if (POST && path === '/shop/equip') {
      const b = await readJson(req); if (!b) return reply({ error: 'bad_request' }, 400);
      const want = {}; for (const k of ['wskin', 'costume']) if (k in b) want[k] = b[k] === null ? null : String(b[k]);
      try { await store.setEquipped(env, pid, want); } catch { return reply({ error: 'not_owned' }, 403); }
      return reply(await mine());
    }

    if (POST && path === '/shop/checkout') {
      const b = await readJson(req); if (!b) return reply({ error: 'bad_request' }, 400);
      const method = b.method === 'crypto' ? 'crypto' : b.method === 'card' ? 'card' : null;
      const adapter = method && providerFor(env, method);
      if (!adapter || !adapter.configured(env, method)) return reply({ error: 'method_unavailable' }, 503);
      let cart; try { cart = priceCart(b.items); } catch (e) { return reply({ error: 'bad_cart' }, 400); }   // ids only: prices are ours
      const owned = new Set(await store.getOwned(env, pid));
      if (cart.items.some((i) => owned.has(i.id))) return reply({ error: 'already_owned' }, 409);
      const base = returnBase(env, origin); if (!base) return reply({ error: 'bad_return_url' }, 500);
      const { url: payUrl, ref } = await adapter.createCheckout(env, {
        pid, items: cart.items, total: cart.total, method,
        successUrl: `${base}?shop=return&provider=${adapter.id}` + (adapter.id === 'stripe' ? '&ref={CHECKOUT_SESSION_ID}' : ''),
        cancelUrl: `${base}?shop=cancel`,
      });
      await store.createOrder(env, adapter.id, ref, { pid, items: cart.items.map((i) => i.id), total: cart.total, method });
      return reply({ url: payUrl, ref, provider: adapter.id });
    }

    if (POST && path === '/shop/checkout/confirm') {
      const b = await readJson(req); if (!b || typeof b.ref !== 'string' || typeof b.provider !== 'string') return reply({ error: 'bad_request' }, 400);
      const adapter = ADAPTERS[b.provider]; if (!adapter) return reply({ error: 'bad_request' }, 400);
      const rec = await store.getOrder(env, b.provider, b.ref);
      if (!rec || rec.pid !== pid) return reply({ error: 'unknown_order' }, 404);        // you can only confirm your own orders
      if (rec.status === 'paid') return reply({ status: 'paid', items: rec.items });
      const order = await adapter.retrieve(env, b.ref);
      const r = await fulfilAndNotify(env, order, (p) => ctx.waitUntil(p));
      return reply({ status: r.status === 'granted' || r.status === 'already' ? 'paid' : r.status, items: r.items || [] });
    }

    if (POST && path === '/shop/recovery/create') {
      const code = newRecoveryCode();
      await store.saveRecovery(env, pid, await hashCode(code));
      return reply({ code });
    }
  } catch (e) {
    return reply({ error: 'server_error' }, 500);
  }
  return reply({ error: 'not_found' }, 404);
}
