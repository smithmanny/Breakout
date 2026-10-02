// Verification of signed cosmetic claims carried in other players' looks (style.claim).
// The Worker signs { v, sub, eq:{wskin,costume}, exp } with ES256 after checking real ownership; anyone can verify with
// the public key from GET /shop/claim-key. WebCrypto verification is async, so the lobby "primes" each claim as soon as
// it arrives (session.js) and the synchronous renderer just reads the cache (verifiedItems).
// Without a configured key the cache stays empty and other players' premium items simply do not show.
const keyJwk = { v: null, p: null };
const cache = new Map();       // claim string -> Set(item ids) once verified (empty set = invalid / expired)
const pending = new Set();
const dec = new TextDecoder(), enc = new TextEncoder();
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
const EMPTY = new Set();

/** Where the verification key comes from (set by ShopClient once it knows the API base). */
let fetchKey = async () => null;
export const setKeySource = (fn) => { fetchKey = fn; keyJwk.v = null; keyJwk.p = null; };

async function publicKey() {
  if (keyJwk.v) return keyJwk.v;
  if (!keyJwk.p) keyJwk.p = (async () => {
    const jwk = await fetchKey();
    if (!jwk) return null;
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  })().catch(() => null).then((k) => { keyJwk.v = k; if (!k) keyJwk.p = null; return k; });
  return keyJwk.p;
}

export async function verifyClaim(claim, now = Date.now() / 1000) {
  try {
    const [p, s] = String(claim).split('.');
    const key = await publicKey();
    if (!p || !s || !key) return null;
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(s), enc.encode(p)))) return null;
    const c = JSON.parse(dec.decode(unb64u(p)));
    return c && c.v === 1 && c.exp > now ? c : null;
  } catch { return null; }
}

/** Fire-and-forget: verify a look's claim so a later synchronous gate() can trust it. */
export function prime(style) {
  const claim = style && style.claim;
  if (typeof claim !== 'string' || claim.length > 600 || cache.has(claim) || pending.has(claim)) return;
  pending.add(claim);
  verifyClaim(claim).then((c) => { cache.set(claim, c ? new Set(Object.values(c.eq || {})) : EMPTY); }, () => {}).finally(() => pending.delete(claim));
}

/** Sync: the item ids a claim vouches for (empty until primed + verified). */
export function verifiedItems(claim) { return (typeof claim === 'string' && cache.get(claim)) || EMPTY; }
