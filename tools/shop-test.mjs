// Shop backend tests. No real network calls to payment providers, no real keys.
//
//   node tools/shop-test.mjs                      in-process: imports the Worker's shop handler with an in-memory KV and a
//                                                 mocked Stripe API (fast, used by `npm run shop-test`)
//   node tools/shop-test.mjs --wrangler [url]     black-box: signs sample Stripe / Coinbase events and posts them to a running
//                                                 `wrangler dev` (default http://127.0.0.1:8787). Start the Worker with the
//                                                 test secrets below, e.g.
//                                                   cd server && wrangler dev --var SHOP_RATE_SCALE:100 \
//                                                     --var TOKEN_SECRET:test-token-secret \
//                                                     --var STRIPE_SECRET_KEY:sk_test_dummy --var STRIPE_WEBHOOK_SECRET:whsec_test \
//                                                     --var COINBASE_WEBHOOK_SECRET:cb_test --var COINBASE_COMMERCE_API_KEY:x
//                                                 (checkout creation is skipped there: it would call api.stripe.com)
import { createHmac, webcrypto } from 'node:crypto';
import { validateCatalog, ITEMS, getItem } from '../src/shop/catalog.js';

const WRANGLER = process.argv.includes('--wrangler');
const BASE = process.argv.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8787';
const ORIGIN = 'http://localhost:8490';
const ENV = {
  SHOP_MODE: 'test', TOKEN_SECRET: 'test-token-secret', STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_test',
  COINBASE_WEBHOOK_SECRET: 'cb_test', COINBASE_COMMERCE_API_KEY: 'x', SHOP_RATE_SCALE: '100', SHOP_RETURN_URL: 'http://localhost:8490/',
};

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  FAIL', msg); } };
const section = (s) => console.log('\n' + s);

// ------------------------------------------------------------------------------------------ in-process harness
class MemKV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, String(v)); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
}
let call, ctxWait = [];
const stripeCalls = [];
if (!WRANGLER) {
  const { handleShop } = await import('../server/src/shop.js');
  const env = { ...ENV, SHOP: new MemKV(), CLAIM_PRIVATE_JWK: JSON.stringify(await webcrypto.subtle.exportKey('jwk', (await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])).privateKey)) };
  env.SHOP_RATE_SCALE = '1';          // real limits for the rate-limit test; raised after
  globalThis.__env = env;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {                         // mocked Stripe API
    if (String(url).startsWith('https://api.stripe.com/')) {
      const body = Object.fromEntries(new URLSearchParams(String(init.body || '')));
      stripeCalls.push({ url: String(url), body, headers: init.headers });
      return new Response(JSON.stringify({ id: 'cs_test_' + stripeCalls.length, url: 'https://checkout.stripe.test/c/cs_test_' + stripeCalls.length }), { status: 200 });
    }
    return realFetch(url, init);
  };
  call = async (method, path, { headers = {}, body, raw } = {}) => {
    const req = new Request('https://worker.test' + path, { method, headers: { origin: ORIGIN, 'cf-connecting-ip': headers['x-ip'] || '1.2.3.4', ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const res = await handleShop(req, env, { waitUntil: (p) => ctxWait.push(p) });
    const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json: j, text, headers: res.headers };
  };
} else {
  call = async (method, path, { headers = {}, body, raw } = {}) => {
    const res = await fetch(BASE + path, { method, headers: { origin: ORIGIN, ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json: j, text, headers: res.headers };
  };
}

// ------------------------------------------------------------------------------------------ signing helpers
const stripeSig = (body, t = Math.floor(Date.now() / 1000), secret = ENV.STRIPE_WEBHOOK_SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const stripeEvent = (id, type, obj) => JSON.stringify({ id, type, data: { object: obj } });
const session = (pid, ids, o = {}) => ({
  id: o.id || 'cs_test_' + Math.random().toString(36).slice(2), object: 'checkout.session', payment_status: 'paid', status: 'complete', currency: 'usd',
  amount_total: ids.reduce((s, i) => s + (getItem(i)?.price ?? 100), 0), client_reference_id: pid, metadata: { pid, items: ids.join(',') },
  customer_details: { email: 'buyer@example.com' }, payment_intent: o.pi || 'pi_' + Math.random().toString(36).slice(2), ...o,
});
const postStripe = (body, sig) => call('POST', '/shop/webhook/stripe', { raw: body, headers: { 'stripe-signature': sig ?? stripeSig(body) } });
const authH = (id) => ({ authorization: `Bearer ${id.pid}.${id.token}` });
const newId = async () => (await call('POST', '/shop/identity', { headers: { 'x-ip': '9.9.9.' + Math.floor(Math.random() * 250) } })).json;
const owned = async (id) => (await call('GET', '/shop/me', { headers: authH(id) })).json?.owned || [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------ tests
section('catalog');
{
  ok(validateCatalog().length === 0, 'catalog validates: ' + validateCatalog().join('; '));
  ok(validateCatalog([{ ...ITEMS[0], damage: 99 }]).some((p) => /non-cosmetic/.test(p)), 'gameplay fields are rejected');
  const r = await call('GET', '/shop/catalog');
  ok(r.status === 200 && r.json.items.length === ITEMS.length, 'GET /shop/catalog lists items');
  ok((await call('GET', '/shop/catalog', { headers: { origin: 'https://evil.example' } })).status === 403, 'foreign Origin refused');
  ok((await call('GET', '/shop/catalog', { headers: { origin: '' } })).status === 403, 'missing Origin refused');
}

section('identity + auth');
const A = await newId(), B = await newId();
ok(/^p_[0-9a-f]{32}$/.test(A.pid) && A.token.length === 43, 'identity minted');
ok((await call('GET', '/shop/me')).status === 401, 'me without token: 401');
ok((await call('GET', '/shop/me', { headers: { authorization: `Bearer ${A.pid}.${B.token}` } })).status === 401, "someone else's token: 401");
ok((await call('GET', '/shop/me', { headers: authH(A) })).json.owned.length === 0, 'new player owns nothing');

if (!WRANGLER) {
  section('checkout (mocked Stripe API)');
  const r = await call('POST', '/shop/checkout', { headers: authH(A), body: { items: ['gun_goldrush', 'costume_midnight'], method: 'card', price: 1, total: 1, unit_amount: 1 } });
  ok(r.status === 200 && r.json.url.startsWith('https://checkout.stripe.test/'), 'checkout returns a hosted URL: ' + r.text);
  const c = stripeCalls.at(-1);
  ok(c.body['line_items[0][price_data][unit_amount]'] === String(getItem('gun_goldrush').price), 'charged the CATALOG price, ignoring client price fields');
  ok(c.body['line_items[1][price_data][unit_amount]'] === String(getItem('costume_midnight').price), 'second line item priced from catalog');
  ok(c.body['payment_method_types[0]'] === 'card' && c.body.mode === 'payment', 'card payment session');
  ok(c.body['metadata[pid]'] === A.pid && c.body.success_url.includes('{CHECKOUT_SESSION_ID}'), 'metadata + return url set');
  const rc = await call('POST', '/shop/checkout', { headers: authH(A), body: { items: ['gun_ember'], method: 'crypto' } });
  ok(rc.status === 200 && stripeCalls.at(-1).body['payment_method_types[0]'] === 'crypto', 'crypto uses Stripe stablecoin payment method');
  ok((await call('POST', '/shop/checkout', { headers: authH(A), body: { items: ['nope'], method: 'card' } })).status === 400, 'unknown item rejected');
  ok((await call('POST', '/shop/checkout', { headers: authH(A), body: { items: ['gun_ember', 'gun_ember'], method: 'card' } })).status === 400, 'duplicate item rejected');
  ok((await call('POST', '/shop/checkout', { headers: authH(A), body: { items: ['gun_ember'], method: 'paypal' } })).status === 503, 'unknown method rejected');
  ok((await call('POST', '/shop/checkout', { body: { items: ['gun_ember'], method: 'card' } })).status === 401, 'checkout needs auth');
}

section('stripe webhook: signature');
{
  const ev = stripeEvent('evt_sig', 'checkout.session.completed', session(A.pid, ['gun_goldrush']));
  ok((await postStripe(ev, 't=1,v1=deadbeef')).status === 400, 'garbage signature rejected');
  ok((await postStripe(ev, stripeSig(ev, undefined, 'whsec_other'))).status === 400, 'wrong secret rejected');
  ok((await postStripe(ev, stripeSig(ev, Math.floor(Date.now() / 1000) - 3600))).status === 400, 'stale timestamp (replay) rejected');
  ok((await postStripe(ev + ' ', stripeSig(ev))).status === 400, 'tampered body rejected');
  ok(!(await owned(A)).includes('gun_goldrush'), 'nothing granted by bad webhooks');
}

section('stripe webhook: fulfilment + idempotency');
{
  const sess = session(A.pid, ['gun_goldrush', 'costume_midnight'], { id: 'cs_test_full', pi: 'pi_full' });
  const ev = stripeEvent('evt_1', 'checkout.session.completed', sess);
  ok((await postStripe(ev)).status === 200, 'valid completed event accepted');
  const o = await owned(A);
  ok(o.includes('gun_goldrush') && o.includes('costume_midnight'), 'items granted to the right player');
  ok((await postStripe(ev)).text === 'duplicate', 'same event id replayed: ignored');
  const ev2 = stripeEvent('evt_1b', 'checkout.session.completed', sess);
  ok((await postStripe(ev2)).status === 200 && (await owned(A)).length === 2, 'same session, new event id: no double grant');
  ok(!(await owned(B)).length, 'other players unaffected');

  // price tampering: session total does not match the catalog
  const bad = session(B.pid, ['gun_ember'], { amount_total: 100 });
  await postStripe(stripeEvent('evt_bad', 'checkout.session.completed', bad));
  ok(!(await owned(B)).includes('gun_ember'), 'underpaid session is NOT fulfilled');
  const wrongCur = session(B.pid, ['gun_ember'], { currency: 'jpy' });
  await postStripe(stripeEvent('evt_cur', 'checkout.session.completed', wrongCur));
  ok(!(await owned(B)).includes('gun_ember'), 'wrong currency is NOT fulfilled');
  await postStripe(stripeEvent('evt_unk', 'checkout.session.completed', session(B.pid, ['totally_fake'], { amount_total: 100 })));
  ok(!(await owned(B)).length, 'unknown item id is NOT fulfilled');
  ok((await postStripe(stripeEvent('evt_other', 'customer.created', {}))).status === 200, 'unrelated events acknowledged');
}

section('stripe webhook: async payments (crypto)');
{
  const pending = session(B.pid, ['gun_toxic'], { id: 'cs_test_async', payment_status: 'unpaid' });
  await postStripe(stripeEvent('evt_a1', 'checkout.session.completed', pending));
  ok(!(await owned(B)).includes('gun_toxic'), 'completed-but-unpaid grants nothing');
  await postStripe(stripeEvent('evt_a2', 'checkout.session.async_payment_succeeded', { ...pending, payment_status: 'paid' }));
  ok((await owned(B)).includes('gun_toxic'), 'async_payment_succeeded grants');
  const pend2 = session(B.pid, ['gun_glacier'], { id: 'cs_test_async2', payment_status: 'unpaid' });
  await postStripe(stripeEvent('evt_a3', 'checkout.session.completed', pend2));
  await postStripe(stripeEvent('evt_a4', 'checkout.session.async_payment_failed', pend2));
  ok(!(await owned(B)).includes('gun_glacier'), 'async_payment_failed grants nothing');
}

section('refund');
{
  await postStripe(stripeEvent('evt_r1', 'charge.refunded', { id: 'ch_1', refunded: true, payment_intent: 'pi_full' }));
  const o = await owned(A);
  ok(!o.includes('gun_goldrush') && !o.includes('costume_midnight'), 'full refund revokes the order');
}

section('equip + signed claims');
{
  await postStripe(stripeEvent('evt_e1', 'checkout.session.completed', session(A.pid, ['gun_ember'], { id: 'cs_test_eq' })));
  ok((await call('POST', '/shop/equip', { headers: authH(A), body: { wskin: 'gun_toxic' } })).status === 403, 'cannot equip an item you do not own');
  ok((await call('POST', '/shop/equip', { headers: authH(A), body: { costume: 'gun_ember' } })).status === 403, 'cannot equip a gun in the costume slot');
  const r = await call('POST', '/shop/equip', { headers: authH(A), body: { wskin: 'gun_ember' } });
  ok(r.status === 200 && r.json.equipped.wskin === 'gun_ember', 'equip owned item');
  if (!WRANGLER) {
    const { verifyClaim } = await import('../server/src/payments/identity.js');
    const jwk = (await call('GET', '/shop/claim-key')).json.jwk;
    const claim = await verifyClaim(r.json.claim, jwk);
    ok(claim && claim.eq.wskin === 'gun_ember', 'claim verifies with the public key');
    const [p, s] = r.json.claim.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claim, eq: { wskin: 'gun_toxic' } })).toString('base64url') + '.' + s;
    ok(!(await verifyClaim(forged, jwk)), 'forged claim fails verification');
    ok(!(await verifyClaim(r.json.claim, jwk, claim.exp + 10)), 'expired claim fails');
    ok(!(await call('GET', '/shop/claim-key')).text.includes('"d"'), 'private key never exposed');
  }
  const un = await call('POST', '/shop/equip', { headers: authH(A), body: { wskin: null } });
  ok(un.json.equipped.wskin === undefined, 'unequip');
}

section('recovery');
{
  const code = (await call('POST', '/shop/recovery/create', { headers: authH(A) })).json.code;
  ok(/^BRK(-[A-Z0-9]{4}){4}$/.test(code), 'recovery code format');
  const r = await call('POST', '/shop/recovery/redeem', { body: { code: code.toLowerCase().replace(/-/g, ' ') } });
  ok(r.status === 200 && r.json.pid === A.pid, 'redeem restores identity (case/format tolerant)');
  ok((await owned(r.json)).includes('gun_ember'), 'restored identity owns its items');
  ok((await call('POST', '/shop/recovery/redeem', { body: { code: 'BRK-AAAA-AAAA-AAAA-AAAA' } })).status === 404, 'wrong code: 404');
  const code2 = (await call('POST', '/shop/recovery/create', { headers: authH(A) })).json.code;
  ok((await call('POST', '/shop/recovery/redeem', { body: { code } })).status === 404 && code2 !== code, 'issuing a new code retires the old one');
}

section('coinbase webhook (swappable provider)');
{
  const body = JSON.stringify({ event: { id: 'cb_evt_1', type: 'charge:confirmed', data: { code: 'ABCD1234', metadata: { pid: B.pid, items: 'costume_tropic' }, pricing: { local: { amount: (getItem('costume_tropic').price / 100).toFixed(2), currency: 'USD' } } } } });
  const sig = createHmac('sha256', ENV.COINBASE_WEBHOOK_SECRET).update(body).digest('hex');
  ok((await call('POST', '/shop/webhook/coinbase', { raw: body, headers: { 'x-cc-webhook-signature': 'bad' } })).status === 400, 'bad coinbase signature rejected');
  ok((await call('POST', '/shop/webhook/coinbase', { raw: body, headers: { 'x-cc-webhook-signature': sig } })).status === 200, 'good coinbase signature accepted');
  ok((await owned(B)).includes('costume_tropic'), 'coinbase confirmed charge grants');
  ok((await call('POST', '/shop/webhook/nope', { raw: '{}' })).status === 404, 'unknown provider: 404');
}

if (!WRANGLER) {
  section('rate limiting');
  globalThis.__env.SHOP_RATE_SCALE = '1';
  let last = 0; for (let i = 0; i < 9; i++) last = (await call('POST', '/shop/identity', { headers: { 'x-ip': '7.7.7.7' } })).status;
  ok(last === 429, 'identity minting is rate limited per IP');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
