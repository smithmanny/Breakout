// Rendering side of the shop: turns catalog items into costume colours and marker finishes, and decides (gate) which
// premium cosmetics a given look is allowed to show. Purely visual: nothing in here touches gameplay.
//
// gate(style): strips style.wskin / style.costume unless that exact item is
//   (a) in this device's server-confirmed entitlement cache (you always see what you own),
//   (b) vouched for by a verified, unexpired signed claim carried in style.claim (other players' items; src/shop/claims.js),
//   (c) temporarily allowed for a shop preview (allowPreview).
// Bots and unknown players therefore never show premium items, and a modified client can only dress itself locally.
import * as THREE from 'three';
import { getItem, SLOTS } from './catalog.js';
import { getPlasticMaterial } from '../game/character-mats.js';
import { verifiedItems } from './claims.js';

const owned = new Set();      // item ids this device owns (set from the server by ShopClient)
const preview = new Set();    // ids shown in the shop's try-on
export const setOwned = (ids) => { owned.clear(); for (const i of ids || []) owned.add(i); };
export const allowPreview = (ids) => { preview.clear(); for (const i of ids || []) preview.add(i); };

/** A style with only the premium cosmetics this viewer may see. Never mutates its input. */
export function gate(style) {
  if (!style || (!style.wskin && !style.costume && !style.claim)) return style;
  const out = { ...style }, vouched = verifiedItems(style.claim);
  for (const [type, slot] of Object.entries(SLOTS)) {
    const id = out[slot], it = getItem(id);
    if (id === undefined) continue;
    if (!it || it.type !== type || !(owned.has(id) || preview.has(id) || vouched.has(id))) delete out[slot];
  }
  return out;
}

/** Costume: overrides the outfit colours + pattern (called right after applyStyleUniforms). */
export function applyCostume(u, style) {
  const it = style && getItem(style.costume);
  if (!it || !it.look) return;
  const l = it.look;
  u.uShirt.value.set(l.shirt); u.uShorts.value.set(l.shorts); u.uShoe.value.set(l.shoe);
  u.uSole.value.set(l.sole); u.uSock.value.set(l.sock); u.uStrap.value.set(l.strap); u.uPattern.value = l.pattern;
}

// Marker finish: a clone of the shared plastic material (same shader program) with a colour multiplier on the body's
// dark vertex colours plus an optional glow. Team-coloured ink parts and lamps are untouched.
const _mats = new Map();
function skinMaterial(it) {
  let m = _mats.get(it.id);
  if (!m) {
    const base = getPlasticMaterial(), s = it.skin;
    m = base.clone();
    m.onBeforeCompile = base.onBeforeCompile;
    m.customProgramCacheKey = base.customProgramCacheKey;
    m.color.setRGB(s.tint[0], s.tint[1], s.tint[2]);
    m.emissive = new THREE.Color(s.emissive); m.emissiveIntensity = s.glow || 0;
    m.name = 'bo-skin-' + it.id;
    _mats.set(it.id, m);
  }
  return m;
}

/** Re-skin one held weapon instance (from Character._weaponInstance). */
export function applyWeaponSkin(w, style) {
  const it = style && getItem(style.wskin);
  if (!it || it.type !== 'gun' || !it.skin) return;
  const m = skinMaterial(it);
  w.body.material = m; w.bodyFar.material = m;
  for (const g of w.partList) if (g.userData.mat === 'body') g.userData.mesh.material = m;
}
