// Generates the ES256 key pair used to sign cosmetic claims.
//   node tools/shop-keygen.mjs            -> prints CLAIM_PRIVATE_JWK=<one-line JSON> (put in server/.dev.vars, or pipe the
//                                            JSON to `wrangler secret put CLAIM_PRIVATE_JWK`)
//   node tools/shop-keygen.mjs --json     -> prints only the JSON
const { privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey));
console.log(process.argv.includes('--json') ? jwk : 'CLAIM_PRIVATE_JWK=' + jwk);
