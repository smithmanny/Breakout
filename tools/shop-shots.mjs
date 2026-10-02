// Shop UI harness: opens the Shop in headless Chrome against a MOCKED /shop API (no Worker needed) and screenshots it.
// usage: node tools/shop-shots.mjs [--out dir] [--sizes 360x640,390x844,...] [--states ready,offline,...] [--check] [--url http://localhost:8490/]
//   states: ready | owned (bought something) | offline | error | pending | unavailable
//   --check also reports overflow / tap-target problems per size (exit 1 if any). Needs `npm start` (port 8490) running.
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { ITEMS } from '../src/shop/catalog.js';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'shop-shots');
const SIZES = opt('sizes', '360x640,390x844,768x1024,1280x720,1600x900').split(',').map((s) => s.split('x').map(Number));
const STATES = opt('states', 'ready').split(',');
const CHECK = args.includes('--check');
const BASE = opt('url', 'http://localhost:8490/');
const ACTARG = opt('act', null), ACT = ACTARG && ACTARG.startsWith('@') ? readFileSync(ACTARG.slice(1), 'utf8') : ACTARG, SUFFIX = opt('suffix', '');   // --act "js": run in the page after the Shop opens (e.g. click a tile); --suffix tags the file name
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 300000,
});
let bad = 0;
for (const state of STATES) for (const [w, h] of SIZES) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, hasTouch: w < 800, isMobile: w < 800 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setRequestInterception(true);
  const owned = state === 'owned' ? ['gun_glacier'] : [];
  page.on('request', (rq) => {
    const u = new URL(rq.url());
    if (!u.pathname.startsWith('/shop/') || u.port !== '8787') return rq.continue();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    const j = (o, s = 200) => rq.respond({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
    if (rq.method() === 'OPTIONS') return rq.respond({ status: 204, headers: cors });
    if (state === 'offline') return rq.abort('internetdisconnected');
    if (state === 'unavailable') return j({ error: 'shop_unavailable' }, 503);
    if (state === 'error') return j({ error: 'server_error' }, 500);
    if (u.pathname === '/shop/identity') return j({ pid: 'p1', token: 't1' });
    if (u.pathname === '/shop/catalog') return j({ items: ITEMS, methods: ['card', 'crypto'], mode: 'live' });
    if (u.pathname === '/shop/me') return j({ owned, equipped: {}, claim: null });
    if (u.pathname === '/shop/recovery/create') return j({ code: 'BRK-7QXM-2K9D-HV4P-ZR8T' });
    if (u.pathname === '/shop/checkout/confirm') return j({ status: 'pending' });
    return j({ error: 'not_found' }, 404);
  });
  await page.evaluateOnNewDocument((state, owned) => {
    try {
      localStorage.removeItem('breakout.shop.recovery'); localStorage.removeItem('breakout.shop.pending');
      localStorage.setItem('breakout.shop', JSON.stringify({ pid: 'p1', token: 't1', owned, equipped: {} }));
      if (state === 'pending') localStorage.setItem('breakout.shop.pending', JSON.stringify({ ref: 'r1', provider: 'coinbase', items: ['gun_glacier'], at: Date.now() }));
    } catch { /* ignore */ }
  }, state, owned);
  await page.goto(BASE + '?skipTitle', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__inkwave && __inkwave.menus', { timeout: 120000, polling: 200 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => { __inkwave.menus.show('shop', { push: true }); });
  await new Promise((r) => setTimeout(r, 2200));
  if (ACT) { const r = await page.evaluate(`(async () => { ${ACT} })()`); if (r !== undefined) console.log(`[act ${state} ${w}x${h}]`, typeof r === 'string' ? r : JSON.stringify(r, null, 1)); await new Promise((r) => setTimeout(r, 1500)); }
  const file = `${OUT}/${state}${SUFFIX}-${w}x${h}.png`;
  await page.screenshot({ path: file });
  let rep = '';
  if (CHECK) {
    const r = await page.evaluate(() => {
      const root = document.querySelector('.bo-shop'); const vw = innerWidth, vh = innerHeight; const out = [];
      if (!root) return ['no shop screen'];
      for (const el of root.querySelectorAll('button, [data-nav]')) {
        const b = el.getBoundingClientRect(); if (!b.width || !b.height || el.closest('.is-leaving')) continue;
        if (el.closest('.bo-shop__grid') && (b.bottom < 0 || b.top > vh)) continue;
        if (b.height < 43.5 || b.width < 43.5) out.push(`small ${el.className.split(' ')[1] || el.className} ${Math.round(b.width)}x${Math.round(b.height)} "${(el.textContent || '').trim().slice(0, 16)}"`);
      }
      for (const el of root.querySelectorAll('.iw-head, .iw-prompts, .iw-lfoot, .bo-shop__detail, .bo-shop__panel')) {
        const b = el.getBoundingClientRect(); if (!b.width) continue;
        const scrolls = root.scrollHeight > root.clientHeight + 1;      // compact layout scrolls vertically: only sideways overflow is a bug there
        if (b.left < -1 || b.right > vw + 1 || (!scrolls && (b.bottom > vh + 1 || b.top < -1))) out.push(`offscreen ${el.className.split(' ')[0]} [${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}]`);
      }
      if (document.documentElement.scrollWidth > vw + 1) out.push('page hscroll');
      return out;
    });
    rep = r.length ? '\n    ' + r.join('\n    ') : ' ok'; bad += r.length;
  }
  console.log(file, errs.length ? 'ERR ' + errs.join('|') : '', rep);
  await page.close();
}
await browser.close();
process.exit(CHECK && bad ? 1 : 0);
