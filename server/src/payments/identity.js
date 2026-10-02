// Anonymous player identity + signed cosmetic claims. No passwords, no emails required.
//   pid   : "p_" + 32 hex (random, minted by POST /shop/identity)
//   token : base64url(HMAC-SHA256(TOKEN_SECRET, "v1." + pid)); the client sends "Authorization: Bearer <pid>.<token>".
//           Possession of the token == owning the account. Lose it and you need the recovery code.
//   claim : ES256-signed { v, sub, eq, exp } that other players verify with the public key (GET /shop/claim-key) before
//           drawing your premium cosmetics. The relay never sees ownership; peers check the signature client-side.
import { b64u, unb64u, hmac, safeEqual, randomHex, sha256Hex } from './util.js';

const enc = new TextEncoder();
const PID = /^p_[0-9a-f]{32}$/;
export const CLAIM_TTL_S = 24 * 3600;

export const newPid = () => 'p_' + randomHex(16);
export async function tokenFor(env, pid) { return b64u(await hmac(env.TOKEN_SECRET, 'v1.' + pid)); }

/** Authorization header -> pid, or null. */
export async function authenticate(req, env) {
  if (!env.TOKEN_SECRET) return null;
  const m = /^Bearer (p_[0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/.exec(req.headers.get('authorization') || '');
  if (!m || !PID.test(m[1])) return null;
  return safeEqual(await tokenFor(env, m[1]), m[2]) ? m[1] : null;
}

// ---------------------------------------------------------------------------------------------- claims (ES256)
async function privateKey(env) {
  const jwk = JSON.parse(env.CLAIM_PRIVATE_JWK);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
export const claimsConfigured = (env) => { try { return !!JSON.parse(env.CLAIM_PRIVATE_JWK).d; } catch { return false; } };

/** Public JWK for verification (private part stripped). null when claims are not configured. */
export function publicJwk(env) {
  if (!claimsConfigured(env)) return null;
  const { kty, crv, x, y } = JSON.parse(env.CLAIM_PRIVATE_JWK);
  return { kty, crv, x, y, alg: 'ES256', use: 'sig' };
}

export async function signClaim(env, pid, eq, nowS = Math.floor(Date.now() / 1000)) {
  if (!claimsConfigured(env)) return null;
  const payload = b64u(enc.encode(JSON.stringify({ v: 1, sub: (await sha256Hex(pid)).slice(0, 12), eq, exp: nowS + CLAIM_TTL_S })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await privateKey(env), enc.encode(payload));
  return payload + '.' + b64u(sig);
}

/** Verify a claim (used by tests; the browser does the same with SubtleCrypto in src/shop/claims.js). */
export async function verifyClaim(claim, jwk, nowS = Math.floor(Date.now() / 1000)) {
  const [p, s] = String(claim || '').split('.');
  if (!p || !s) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(s), enc.encode(p)))) return null;
  const c = JSON.parse(new TextDecoder().decode(unb64u(p)));
  return c.exp > nowS ? c : null;
}

// ---------------------------------------------------------------------------------------------- recovery codes
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';    // no 0/O/1/I/L
/** "BRK-XXXX-XXXX-XXXX-XXXX": 16 chars of a 31-letter alphabet (~79 bits). Stored only as a SHA-256 hash. */
export function newRecoveryCode() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const c = [...b].map((x) => ALPHA[x % ALPHA.length]).join('');
  return 'BRK-' + c.match(/.{4}/g).join('-');
}
export const normaliseCode = (s) => 'BRK-' + String(s || '').toUpperCase().replace(/^BRK/, '').replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join('-');
export const hashCode = (code) => sha256Hex('rc1.' + normaliseCode(code));
