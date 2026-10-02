// BREAKOUT shop catalog: the ONE data file shared by the client (menus, rendering) and the Cloudflare Worker (prices,
// fulfilment, claim signing: server/src/payments imports this file directly). Pure data + tiny helpers, no imports.
//
// RULES (enforced by validateCatalog, run by tools/shop-test.mjs):
//   * Everything here is COSMETIC. A gun item is a paint job / finish for whichever marker you already hold: it never
//     changes WEAPONS stats, hopper, damage, hitboxes or projectile behaviour. No item may carry gameplay fields.
//   * Prices are USD cents and live here only. The client displays them; the server charges from this table and never
//     accepts a price (or item name) from a request.
//   * Ids are permanent (they are stored in entitlements and in other players' style payloads): never rename or reuse.
//     To retire an item set `retired: true` (owners keep it, the shop stops selling it).
//
// type 'gun'     -> slot 'wskin'   (style.wskin = id)   : { skin: { tint:[r,g,b] multiplier on the marker's dark body,
//                                                           emissive:'#hex', glow: 0..2 } }
// type 'costume' -> slot 'costume' (style.costume = id) : { look: { shirt, shorts, shoe, sole, sock, strap, pattern } }
//                                                         (same fields as OUTFITS in game/character-style.js)
// preview: { weapon: marker to show a gun skin on, style: partial look for a costume preview, accent: '#hex' for tiles }

export const CATALOG_VERSION = 1;
export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const SLOTS = { gun: 'wskin', costume: 'costume' };
/** Currency is fixed: USD cents. */
export const CURRENCY = 'usd';
/** Min / max a single checkout may total (cents): Stripe's own minimum is 50c; crypto per-tx limit is $10,000. */
export const MIN_ORDER_CENTS = 99, MAX_ORDER_CENTS = 50000, MAX_CART_ITEMS = 12;

export const ITEMS = [
  // ---- marker finishes -------------------------------------------------------------------------------------------
  { id: 'gun_bubblegum', type: 'gun', name: 'Bubblegum Pop', rarity: 'common', price: 299,
    blurb: 'Candy-pink enamel with a glossy clear coat.',
    skin: { tint: [3.2, 0.9, 1.9], emissive: '#ff3f9e', glow: 0.05 }, preview: { weapon: 'shooter', accent: '#ff5fae' } },
  { id: 'gun_glacier', type: 'gun', name: 'Glacier', rarity: 'common', price: 299,
    blurb: 'Frosted ice-blue finish. Cold hands, warm trigger.',
    skin: { tint: [1.5, 2.6, 3.6], emissive: '#6fd8ff', glow: 0.05 }, preview: { weapon: 'dualies', accent: '#79d6ff' } },
  { id: 'gun_goldrush', type: 'gun', name: 'Gold Rush', rarity: 'rare', price: 599,
    blurb: 'Brushed gold plating for the field champion.',
    skin: { tint: [4.6, 3.3, 0.9], emissive: '#ffb21a', glow: 0.08 }, preview: { weapon: 'charger', accent: '#ffc83d' } },
  { id: 'gun_toxic', type: 'gun', name: 'Toxic Glow', rarity: 'epic', price: 899,
    blurb: 'Radioactive green that hums in the dark.',
    skin: { tint: [1.4, 3.8, 0.8], emissive: '#7bff1a', glow: 0.55 }, preview: { weapon: 'blaster', accent: '#8dff2a' } },
  { id: 'gun_ember', type: 'gun', name: 'Emberforge', rarity: 'legendary', price: 1299,
    blurb: 'Molten-core finish that smoulders between rounds.',
    skin: { tint: [4.2, 1.5, 0.5], emissive: '#ff4a0a', glow: 1.1 }, preview: { weapon: 'splatling', accent: '#ff6a1f' } },
  // ---- costumes (kits) -------------------------------------------------------------------------------------------
  { id: 'costume_harbor_pilot', type: 'costume', name: 'Harbor Pilot', rarity: 'common', price: 399,
    blurb: 'Hi-vis orange vest kit, built for the docks.',
    look: { shirt: '#ff7a1a', shorts: '#1f2430', shoe: '#1b1d22', sole: '#f2f2ef', sock: '#1f2430', strap: '#f2e312', pattern: 2 },
    preview: { style: { outfit: 0 }, accent: '#ff7a1a' } },
  { id: 'costume_midnight', type: 'costume', name: 'Midnight Ink', rarity: 'rare', price: 599,
    blurb: 'Deep violet blackout kit with neon sash.',
    look: { shirt: '#1d1433', shorts: '#120c22', shoe: '#120c22', sole: '#8a3cff', sock: '#120c22', strap: '#8a3cff', pattern: 1 },
    preview: { style: { outfit: 1 }, accent: '#8a3cff' } },
  { id: 'costume_tropic', type: 'costume', name: 'Tropic Camo', rarity: 'epic', price: 799,
    blurb: 'Splat camo in lagoon teal and coral.',
    look: { shirt: '#1aa89a', shorts: '#0e4f58', shoe: '#0b2f36', sole: '#ff7f6b', sock: '#0e4f58', strap: '#ff7f6b', pattern: 3 },
    preview: { style: { outfit: 3 }, accent: '#1ad2c0' } },
  { id: 'costume_champion', type: 'costume', name: 'Champion Gold', rarity: 'legendary', price: 1199,
    blurb: 'White and gold tournament kit with a trophy yoke.',
    look: { shirt: '#f7f1de', shorts: '#2b2417', shoe: '#f7f1de', sole: '#d8a62a', sock: '#2b2417', strap: '#d8a62a', pattern: 2 },
    preview: { style: { outfit: 7 }, accent: '#e0b030' } },
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const getItem = (id) => (typeof id === 'string' ? BY_ID.get(id) || null : null);
export const isSellable = (it) => !!it && !it.retired;
export const slotOf = (it) => SLOTS[it.type];
export const fmtUSD = (c) => '$' + (c / 100).toFixed(2);

/** Cart -> { items, total } from item ids ONLY (prices come from this table). Throws on unknown / retired / duplicate. */
export function priceCart(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_CART_ITEMS) throw new Error('bad cart');
  const seen = new Set(), items = [];
  for (const id of ids) {
    const it = getItem(id);
    if (!isSellable(it)) throw new Error('unknown item');
    if (seen.has(id)) throw new Error('duplicate item');
    seen.add(id); items.push(it);
  }
  const total = items.reduce((s, i) => s + i.price, 0);
  if (total < MIN_ORDER_CENTS || total > MAX_ORDER_CENTS) throw new Error('order total out of range');
  return { items, total };
}

/** Catalog self-check (cosmetic-only guard, unique ids, sane prices). Returns an array of problems ([] = ok). */
export function validateCatalog(items = ITEMS) {
  const bad = [], ids = new Set();
  const ALLOWED = new Set(['id', 'type', 'name', 'rarity', 'price', 'blurb', 'skin', 'look', 'preview', 'retired']);
  for (const it of items) {
    if (!/^[a-z0-9_]{3,40}$/.test(it.id || '')) bad.push(`bad id ${it.id}`);
    if (ids.has(it.id)) bad.push(`dup id ${it.id}`);
    ids.add(it.id);
    if (!SLOTS[it.type]) bad.push(`${it.id}: bad type`);
    if (!RARITIES.includes(it.rarity)) bad.push(`${it.id}: bad rarity`);
    if (!Number.isInteger(it.price) || it.price < MIN_ORDER_CENTS || it.price > MAX_ORDER_CENTS) bad.push(`${it.id}: bad price`);
    for (const k of Object.keys(it)) if (!ALLOWED.has(k)) bad.push(`${it.id}: non-cosmetic field ${k}`);
    if (it.type === 'gun' && !it.skin) bad.push(`${it.id}: gun needs skin`);
    if (it.type === 'costume' && !it.look) bad.push(`${it.id}: costume needs look`);
  }
  return bad;
}

/** What the client may send / peers may see for an equipped set: { wskin?: id, costume?: id } (ids validated by type). */
export function sanitizeEquip(eq) {
  const out = {};
  for (const [type, slot] of Object.entries(SLOTS)) {
    const it = getItem(eq && eq[slot]);
    if (it && it.type === type) out[slot] = it.id;
  }
  return out;
}
