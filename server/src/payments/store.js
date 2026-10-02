// Entitlement storage on Workers KV (binding SHOP). Key layout (see docs/MONETIZATION.md):
//   own:<pid>:<itemId>  -> {ref, provider, at}        one key per owned item: grants are idempotent, no read-modify-write races
//   eq:<pid>            -> {wskin?, costume?}          equipped cosmetics
//   ord:<provider>:<ref>-> {pid, items[], total, status, at, email?}   created at checkout, finalised by fulfilment
//   evt:<provider>:<id> -> 1 (TTL 35d)                 webhook event ids already processed
//   pi:<paymentIntent>  -> "<provider>:<ref>"          lets a refund webhook find its order
//   rc:<sha256(code)>   -> pid ; rcp:<pid> -> hash     recovery code (hash only) and the player's current one
import { getItem, priceCart, sanitizeEquip, SLOTS } from '../../../src/shop/catalog.js';

const J = (v) => JSON.stringify(v);
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export const kvOk = (env) => !!(env.SHOP && typeof env.SHOP.get === 'function');

export async function getOwned(env, pid) {
  const out = []; let cursor;
  do {
    const r = await env.SHOP.list({ prefix: `own:${pid}:`, cursor });
    for (const k of r.keys) out.push(k.name.slice(`own:${pid}:`.length));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out.filter((id) => getItem(id));
}
export const owns = async (env, pid, id) => !!(await env.SHOP.get(`own:${pid}:${id}`));

export async function getEquipped(env, pid) {
  const eq = sanitizeEquip(parse(await env.SHOP.get(`eq:${pid}`)) || {});
  // drop anything no longer owned (refund / revoke)
  for (const slot of Object.values(SLOTS)) if (eq[slot] && !(await owns(env, pid, eq[slot]))) delete eq[slot];
  return eq;
}
/** Equip: each slot value must be an owned item of the matching type, or null to unequip. */
export async function setEquipped(env, pid, req) {
  const cur = await getEquipped(env, pid);
  for (const [type, slot] of Object.entries(SLOTS)) {
    if (!(slot in req)) continue;
    if (req[slot] === null) { delete cur[slot]; continue; }
    const it = getItem(req[slot]);
    if (!it || it.type !== type || !(await owns(env, pid, it.id))) throw new Error('not owned');
    cur[slot] = it.id;
  }
  await env.SHOP.put(`eq:${pid}`, J(cur));
  return cur;
}

export async function createOrder(env, provider, ref, rec) {
  await env.SHOP.put(`ord:${provider}:${ref}`, J({ ...rec, status: 'created', at: Date.now() }), { expirationTtl: 60 * 60 * 24 * 90 });
}
export async function getOrder(env, provider, ref) { return parse(await env.SHOP.get(`ord:${provider}:${ref}`)); }

/**
 * Apply a normalised provider order. Idempotent: safe to call from the webhook, from a retried webhook, and from the
 * return-page confirm at once. Never trusts amounts or items blindly: the paid amount must equal the catalog price of
 * the items we created the checkout for.
 * Returns { status: 'granted'|'already'|'pending'|'failed'|'rejected', items? }.
 */
export async function fulfil(env, order) {
  const key = `ord:${order.provider}:${order.ref}`;
  const rec = parse(await env.SHOP.get(key));
  if (order.status === 'failed') { if (rec && rec.status === 'created') await env.SHOP.put(key, J({ ...rec, status: 'failed' }), { expirationTtl: 60 * 60 * 24 * 90 }); return { status: 'failed' }; }
  if (order.status !== 'paid') return { status: 'pending' };
  if (rec && rec.status === 'paid') return { status: 'already', items: rec.items };
  if (rec && rec.status === 'refunded') return { status: 'rejected' };

  const pid = rec?.pid || order.pid;
  const ids = rec?.items || order.itemIds;
  if (!pid || !/^p_[0-9a-f]{32}$/.test(pid)) return { status: 'rejected' };
  let cart; try { cart = priceCart(ids); } catch { return { status: 'rejected' }; }
  // price tampering / currency mismatch / wrong-session guard
  // (expected = the total we quoted at checkout creation when we have that record, else today's catalog price)
  if (order.currency !== 'usd' || order.amount !== (rec ? rec.total : cart.total)) return { status: 'rejected' };
  if (rec && order.pid && rec.pid !== order.pid) return { status: 'rejected' };

  const at = Date.now();
  for (const it of cart.items) await env.SHOP.put(`own:${pid}:${it.id}`, J({ ref: order.ref, provider: order.provider, at }));
  await env.SHOP.put(key, J({ pid, items: cart.items.map((i) => i.id), total: cart.total, status: 'paid', at, email: order.email || null }), { expirationTtl: 60 * 60 * 24 * 365 * 7 });
  if (order.paymentIntent) await env.SHOP.put(`pi:${order.paymentIntent}`, `${order.provider}:${order.ref}`, { expirationTtl: 60 * 60 * 24 * 365 * 2 });
  return { status: 'granted', items: cart.items.map((i) => i.id), pid, email: order.email || null };
}

/** Refund: revoke the order's items (and unequip). */
export async function revokeByPaymentIntent(env, pi) {
  const link = await env.SHOP.get(`pi:${pi}`);
  if (!link) return false;
  const [provider, ref] = link.split(':');
  const rec = await getOrder(env, provider, ref);
  if (!rec || rec.status === 'refunded') return false;
  for (const id of rec.items) await env.SHOP.delete(`own:${rec.pid}:${id}`);
  await env.SHOP.put(`ord:${provider}:${ref}`, J({ ...rec, status: 'refunded' }));
  return true;
}

export async function seenEvent(env, provider, id) { return id ? !!(await env.SHOP.get(`evt:${provider}:${id}`)) : false; }
export async function markEvent(env, provider, id) { if (id) await env.SHOP.put(`evt:${provider}:${id}`, '1', { expirationTtl: 60 * 60 * 24 * 35 }); }

export async function saveRecovery(env, pid, hash) {
  const old = await env.SHOP.get(`rcp:${pid}`);
  if (old) await env.SHOP.delete(`rc:${old}`);
  await env.SHOP.put(`rc:${hash}`, pid);
  await env.SHOP.put(`rcp:${pid}`, hash);
}
export const pidForRecovery = (env, hash) => env.SHOP.get(`rc:${hash}`);
