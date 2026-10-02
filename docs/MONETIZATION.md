# Monetization: cosmetic shop

Players can buy **marker finishes** (gun skins) and **costumes** with a card or with crypto (stablecoins). Everything
sold is cosmetic. Nothing changes damage, hopper, reload, hitboxes or any other gameplay number, and no item is
random (no loot boxes, no gacha). Test mode is the default: no real money moves until you flip `SHOP_MODE=live`.

```
 browser (static client)                     Cloudflare Worker (server/)                  providers
 src/shop/shop-screen.js  --- /shop/* --->   src/shop.js (router, CORS, rate limits)
 src/shop/client.js                          payments/identity.js  anonymous id + tokens + signed claims
 src/shop/cosmetics.js (gate + render)       payments/store.js     entitlements in KV (binding SHOP)
 src/shop/claims.js (verify peers)           payments/providers.js adapter registry
                                             payments/stripe.js    ---- Checkout (card | crypto) ----> Stripe
                                             payments/coinbase.js  ---- hosted charge -------------> Coinbase Commerce
 src/shop/catalog.js  <---- shared, single source of truth (client + worker import the same file) ---->
```

## Files

| File | Role |
|---|---|
| `src/shop/catalog.js` | The catalog: id, name, type `gun`/`costume`, price in USD cents, rarity, skin/look data, preview info. Also `priceCart`, `validateCatalog` (rejects any non-cosmetic field). |
| `src/shop/cosmetics.js` | Applies costumes (outfit colours) and marker finishes (material tint/glow) and `gate()`s what a viewer may see. |
| `src/shop/claims.js` | Verifies other players' signed claims (WebCrypto ES256). |
| `src/shop/client.js` | API client, local cache (`localStorage: breakout.shop`), checkout return handling, recovery. |
| `src/shop/shop-screen.js`, `styles/shop.css` | The SHOP menu screen. |
| `server/src/shop.js` | Routes, CORS allow-list, rate limiting. |
| `server/src/payments/*.js` | Stripe + Coinbase adapters, identity/claims/recovery, KV store and fulfilment. |
| `server/.dev.vars.example` | Names of every secret (placeholders only). |
| `tools/shop-test.mjs`, `tools/shop-keygen.mjs` | Mocked-webhook tests; claim key generator. |

Small additive hooks in existing files: `character.js` (gate + costume + skin, 5 lines), `session.js` (prime claims),
`menus.js` (SHOP screen + main-menu button), `main.js` (boot/return handling), `server/src/index.js` (route `/shop/*`).

## Adding an item

Append to `ITEMS` in `src/shop/catalog.js`. Ids are permanent. A gun needs `skin: { tint:[r,g,b], emissive, glow }`, a
costume needs `look: { shirt, shorts, shoe, sole, sock, strap, pattern }`. Run `npm run shop-test` (it fails if an item
carries a gameplay field). Retire with `retired: true` (owners keep it). The Worker and the client both read the same
file, so redeploy both. A price change only affects new checkouts; an order is verified against the price quoted when it
was created.

## Payment flow

1. Client `POST /shop/checkout { items:[ids], method:'card'|'crypto' }` with its bearer token. **Only ids are sent.**
2. Worker prices the cart from the catalog, refuses owned/unknown/duplicate items, creates a Stripe Checkout Session
   (`line_items[].price_data.unit_amount` from the catalog, `metadata.pid`, `metadata.items`) and records `ord:stripe:<session>`.
3. Browser is redirected to the hosted page. On return (`?shop=return&provider=stripe&ref=cs_...`) the client calls
   `POST /shop/checkout/confirm`, the Worker re-reads the session from Stripe and fulfils. The webhook does the same
   independently; both paths are idempotent, whichever lands first wins.
4. Fulfilment checks currency = usd and amount = quoted total, then writes one `own:<pid>:<item>` key per item.

### Stripe webhook events handled

`checkout.session.completed` (grants only if `payment_status=paid`), `checkout.session.async_payment_succeeded` (grants),
`checkout.session.async_payment_failed` and `checkout.session.expired` (marks failed, grants nothing), `charge.refunded`
(full refund revokes the order and unequips). Signature: `Stripe-Signature` HMAC-SHA256 over `t.body`, 5-minute tolerance,
constant-time compare, via Web Crypto. Event ids are remembered 35 days (duplicates return 200 "duplicate"). A KV failure
returns 500 so Stripe retries.

### Crypto

Preferred path is **Stripe's own stablecoin payments** in Checkout (`payment_method_types[]=crypto`; USDC on Ethereum,
Solana, Polygon, Base and Tempo, USD presentment; settles to your Stripe balance in fiat). Per Stripe's docs
(docs.stripe.com/payments/stablecoin-payments, checked while building this) it is generally available to US businesses,
private preview for EU/HK/MX/CH; no chargebacks; refunds go back as stablecoin to the original wallet; $10,000 per
transaction cap. Confirmation can be asynchronous, which is why the async events are handled. **Re-verify availability and
terms for your business location before launch.**

Fallback: set `CRYPTO_PROVIDER=coinbase` for Coinbase Commerce (hosted charge, `X-CC-Webhook-Signature` HMAC). That adapter
is written to Coinbase's documented API but is untested against the live service; verify the current Coinbase Commerce /
Business API and webhook format first. To add another provider, write an adapter in `server/src/payments/` implementing
`createCheckout`, `parseWebhook`, `retrieve`, `configured` and register it in `providers.js`.

## Setup (owner checklist)

1. **Stripe account**, test mode first. Dashboard > Developers > API keys: copy the *secret* test key.
2. **Enable payment methods**: Settings > Payment methods: Cards (default) and *Stablecoins and crypto* (if eligible).
3. **KV namespace**: `cd server && npx wrangler kv namespace create SHOP`, then put the printed id in `server/wrangler.jsonc`
   under `kv_namespaces[0]` (`"id": "..."`). (`wrangler dev` uses a local one automatically.)
4. **Secrets** (each via `npx wrangler secret put NAME` from `server/`):
   - `TOKEN_SECRET`: `openssl rand -base64 32`
   - `STRIPE_SECRET_KEY`: `sk_test_...`
   - `STRIPE_WEBHOOK_SECRET`: from step 6
   - `CLAIM_PRIVATE_JWK`: `node tools/shop-keygen.mjs --json | npx wrangler secret put CLAIM_PRIVATE_JWK`
   - optional: `COINBASE_COMMERCE_API_KEY`, `COINBASE_WEBHOOK_SECRET`, `RESEND_API_KEY` + `MAIL_FROM` (emails the buyer a recovery code)
5. **Vars** in `server/wrangler.jsonc`: `SHOP_RETURN_URL` (the game's public URL), `SHOP_ALLOWED_ORIGINS` (extra origins, comma list),
   `CRYPTO_PROVIDER` (`stripe` | `coinbase`), `SHOP_MODE` (`test` until launch).
6. **Webhook**: Stripe Dashboard > Developers > Webhooks > add endpoint `https://<worker>/shop/webhook/stripe` with events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `checkout.session.expired`, `charge.refunded`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
   Coinbase: webhook `https://<worker>/shop/webhook/coinbase`, shared secret into `COINBASE_WEBHOOK_SECRET`.
7. **Deploy**: `npm run deploy-relay` (runs `wrangler deploy` in `server/`), then deploy the static client as usual.
8. **Test**: with Stripe test mode and test card `4242 4242 4242 4242`, buy an item in the Shop; confirm it shows OWNED and
   equips. Locally: `stripe listen --forward-to localhost:8787/shop/webhook/stripe` and copy its `whsec_` into `server/.dev.vars`.
9. Go live only after the launch checklist below: set live keys, a live webhook, `SHOP_MODE=live` (live keys are refused otherwise).

Secrets live only in Wrangler secrets / `server/.dev.vars` (git-ignored). `server/.dev.vars.example` lists the names.

## Local development and tests

```bash
cp server/.dev.vars.example server/.dev.vars     # fill TOKEN_SECRET (+ test keys if you want real test checkouts)
npm run relay                                    # wrangler dev on :8787 (serves the relay and /shop/*)
npm start                                        # game on :8490; localhost origins are allowed in test mode
npm run shop-test                                # in-process: in-memory KV + mocked Stripe API, 55 checks
node tools/shop-test.mjs --wrangler http://127.0.0.1:8787   # signs sample events and posts them to a running wrangler dev
```

The `--wrangler` mode needs the Worker started with the test secrets (see the header of `tools/shop-test.mjs`); it skips
checkout creation because that would call api.stripe.com. No test touches a real provider.

## Data model (Workers KV, binding `SHOP`)

| Key | Value | Notes |
|---|---|---|
| `own:<pid>:<itemId>` | `{ref, provider, at}` | one key per owned item: grants are idempotent and race free |
| `eq:<pid>` | `{wskin?, costume?}` | equipped; re-validated against ownership on every read |
| `ord:<provider>:<ref>` | `{pid, items[], total, status, at, email?}` | `created` -> `paid`/`failed`/`refunded` |
| `evt:<provider>:<eventId>` | `1` (35 d TTL) | processed webhook events |
| `pi:<paymentIntent>` | `<provider>:<ref>` | refund lookup |
| `rc:<sha256(code)>`, `rcp:<pid>` | pid / hash | recovery code, stored hashed; one active code per player |

Identity: `pid` = `p_` + 32 hex (random). Token = `HMAC-SHA256(TOKEN_SECRET, "v1." + pid)`, sent as
`Authorization: Bearer <pid>.<token>`. No passwords, no email needed. Rotating `TOKEN_SECRET` logs everyone out (recovery
codes then restore them: `redeem` returns a fresh token).

KV is eventually consistent across regions (up to ~60 s). Fulfilment through `/shop/checkout/confirm` and the post-checkout
refresh make it feel immediate; if you outgrow KV, the same functions in `store.js` map onto D1 or a Durable Object.

## Recovery

- In the Shop: RESTORE PURCHASES > GET MY CODE shows a one-time code (`BRK-XXXX-XXXX-XXXX-XXXX`, about 79 bits, stored only
  as a hash). Entering it on a new device or after clearing site data restores the identity (`/shop/recovery/redeem`, rate limited).
- Optional: with `RESEND_API_KEY` + `MAIL_FROM` the buyer's checkout email gets a code automatically after their first purchase.
  (Stripe also emails receipts if enabled in the Dashboard.)
- Lost token and no code: support can look up the order by Stripe session / payment id (`ord:` key holds the `pid`).

## Cosmetics over the relay

The relay never parses game payloads, so ownership is not checked there. Instead: when you equip, the Worker returns a
**claim**: `ES256` signature over `{ v, sub, eq, exp }` (24 h). The claim rides inside your look (`style.claim`) through the
lobby. Other clients verify it with the public key from `GET /shop/claim-key` (WebCrypto) and `gate()` strips any
premium item that is not vouched for by a verified, unexpired claim, or owned locally. Result: a hacked client can dress
itself on its own screen but cannot show anyone else an item it does not own. Bots never show premium items.
Limits: a claim can be copied by another player for its lifetime (24 h) and it is not bound to a name; if no
`CLAIM_PRIVATE_JWK` is set, other players' premium items simply do not render.

## Security notes

- Prices and item names come only from the catalog; request bodies carry ids. Totals are re-verified at fulfilment.
- CORS: only the game's pages.dev origin, `SHOP_ALLOWED_ORIGINS`, and localhost/LAN **in test mode only**. Webhooks are
  server-to-server and authenticated by signature, not origin.
- Rate limits: per-IP per-route counters in each isolate plus an optional global Workers Rate Limiting binding (`SHOP_RL`).
- Live Stripe keys are refused unless `SHOP_MODE=live`. The checkout `confirm` endpoint only works for your own orders.
- Tokens are bearer secrets kept in localStorage: an XSS on the game's origin could steal them. Keep the CSP tight and add no
  third-party scripts to the page.

## Launch checklist (owner to review; I am not a lawyer, none of this is legal advice)

**Business / legal**
- [ ] Terms of Service and Privacy Policy published and linked in the game (purchase flow collects an email via Stripe; the game stores an anonymous id).
- [ ] Refund policy written and shown before purchase. Digital goods: many regions (EU/UK 14-day withdrawal right, waived only with explicit consent to immediate delivery) have mandatory rules. Decide the policy and have the checkout state it. Refunds issued in Stripe revoke the items automatically.
- [ ] Sales tax / VAT: enable Stripe Tax or register where required (US state economic nexus, EU/UK VAT on digital goods). The prices here are tax-exclusive, adjust the display if you need tax-inclusive pricing.
- [ ] Merchant of record decision. Stripe is *not* a merchant of record: you are the seller and carry tax and compliance. A MoR (Paddle, Lemon Squeezy) is an alternative; the adapter interface makes that a drop-in.
- [ ] Business entity, bank account and Stripe account activation (KYC), statement descriptor, support email, and a way for players to reach support.
- [ ] Chargeback/dispute process (card disputes cost fees; stablecoin payments have no disputes but refunds go back as stablecoin).
- [ ] Sanctions / restricted-business screening is handled by Stripe, but review Stripe's restricted businesses list for games.

**Age and loot-box considerations**
- [ ] Children's privacy: if the game is directed at, or knowingly collected from, under-13s (COPPA) or minors in the EU/UK (GDPR-K, UK Children's Code), purchases need parental consent/age gating. Paintball themes skew young; decide your audience and add an age gate or parent notice if needed. Players under 18 can usually void purchases in some jurisdictions.
- [ ] No random rewards were built: every item is bought directly at a visible price. Keep it that way, because loot boxes are restricted or banned in several countries (Belgium, Netherlands rules, others). If you ever add randomized items, get legal advice first.
- [ ] Platform rules if you wrap the game for app stores (they require their own in-app purchase systems for digital goods).

**Crypto**
- [ ] Confirm Stripe stablecoin payments are available to your entity/location and read the current terms. Stripe settles to fiat, which keeps you out of holding crypto, but check with an accountant.
- [ ] Money-transmitter / VASP / MiCA obligations if you ever custody or convert crypto yourself (the Coinbase fallback settles per Coinbase's terms, check them). Tax treatment of crypto receipts and refunds (refunds return the stablecoin to the original wallet).
- [ ] Consumer messaging: payments are final in the wallet, wrong-network sends can be lost, state refund handling plainly.

**Technical**
- [ ] `SHOP_MODE=live`, live keys, live webhook endpoint and secret, KV id set, `CLAIM_PRIVATE_JWK` set, `TOKEN_SECRET` strong and backed up.
- [ ] Complete a real small purchase and a refund end to end; confirm the items appear, equip, show on a second device, and are revoked on refund.
- [ ] Add monitoring/alerts on webhook failures (Stripe Dashboard shows delivery errors) and Worker error rate; consider enabling `observability`.
- [ ] Decide a backup/export plan for KV (`wrangler kv key list/get`) so purchases can be rebuilt from Stripe if needed.
- [ ] Review the Worker's rate limits against real traffic; add Cloudflare WAF rules for `/shop/*`.

## Open risks

- Anonymous identity: a player who clears site data and has no recovery code loses access (support must restore by order lookup). Encourage getting a code after the first purchase.
- Claims are replayable for 24 h and the preview of other players' items in the lobby depends on async verification finishing before the character is built.
- KV eventual consistency; concurrent checkouts are safe (per-item keys) but reads can briefly lag in other regions.
- The Coinbase adapter and the `--wrangler` end-to-end checkout path were not exercised against live services.
- The shop UI was checked in headless Chrome only; gamepad navigation reuses the menu system but was not hand-tested.
