// Ad-hoc probe: boot a match, run an in-page snippet (file or inline) after N seconds of play, print its result.
// usage: node tools/probe.mjs <script.js|inline> [--url ...] [--wait 4] [--low]
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync } from 'node:fs';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const code = existsSync(args[0]) ? readFileSync(args[0], 'utf8') : args[0];
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
if (args.includes('--low')) await page.evaluateOnNewDocument(() => { const k = 'inkwave.settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.quality = 'low'; localStorage.setItem(k, JSON.stringify(s)); });
await page.goto(opt('url', 'http://localhost:8490/?autostart=60&autopilot'));
await page.waitForFunction('window.__inkwave && __inkwave.match && __inkwave.match.state==="playing" && __inkwave.match.local && !__inkwave.match.attract', { timeout: 300000, polling: 200 });
await new Promise((r) => setTimeout(r, +opt('wait', 4) * 1000));
const out = await page.evaluate(`(async () => { ${code} })()`);
console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
browser.process()?.kill('SIGKILL');
process.exit(0);
