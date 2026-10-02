// Small Web Crypto + HTTP helpers shared by the shop modules (no dependencies, runs in Workers and Node 20+).
const enc = new TextEncoder();

export const b64u = (buf) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64u = (s) => {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
export const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const randomHex = (bytes = 16) => hex(crypto.getRandomValues(new Uint8Array(bytes)));

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
/** HMAC-SHA256 -> ArrayBuffer. */
export async function hmac(secret, data) { return crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)); }
export async function hmacHex(secret, data) { return hex(await hmac(secret, data)); }
export async function sha256Hex(data) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(data))); }

/** Constant-time string compare (equal length hex / base64url strings). */
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

/** JSON response with the given extra headers. */
export const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

/** Read a JSON request body with a hard size cap. Returns null on bad / oversized input. */
export async function readJson(req, max = 4096) {
  const text = await req.text();
  if (text.length > max) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

/** Test mode is the default: live keys are refused unless SHOP_MODE=live. */
export const isLive = (env) => env.SHOP_MODE === 'live';
