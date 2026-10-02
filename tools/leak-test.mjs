// GPU-leak check: cycles quality/shadow settings many times and prints renderer.info.memory before/after,
// then forces a WebGL context loss/restore and reports any GL warnings (e.g. "object does not belong to this context").
// usage: node tools/leak-test.mjs [cycles=6]   (needs npm start on :8490)
import puppeteer from 'puppeteer-core';
const cycles = +(process.argv[2] || 6);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 960, height: 540 },
});
const kill = () => { try { browser.process()?.kill('SIGKILL'); } catch { /* gone */ } };
process.on('exit', kill);
const page = await browser.newPage();
const warns = [];
page.on('console', (m) => { const t = m.text(); if (/does not belong|WebGL|INVALID/i.test(t)) warns.push(t.slice(0, 160)); });
await page.goto('http://localhost:8490/?autostart=60&autopilot', { waitUntil: 'load' });
await page.waitForFunction('window.__inkwave && __inkwave.match && __inkwave.match.state==="playing" && !__inkwave.match.attract', { timeout: 300000, polling: 200 });
const mem = () => page.evaluate(() => { const i = __inkwave.R.renderer.info; return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length }; });
const set = (q, sh) => page.evaluate((q, sh) => { const g = __inkwave; g.settings.quality = q; g.settings.shadows = sh; g.R.applySettings(g.settings); }, q, sh);
await set('high', true); await wait(500);
const before = await mem();
const seq = [['low', true], ['medium', false], ['ultra', true], ['high', true]];
for (let i = 0; i < cycles; i++) for (const [q, s] of seq) { await set(q, s); await wait(150); }
await wait(500);
const after = await mem();
console.log(JSON.stringify({ cycles, before, after }));
warns.length = 0;
await page.evaluate(() => { const e = __inkwave.R.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lc = e; e.loseContext(); });
await wait(500);
await page.evaluate(() => window.__lc.restoreContext());
await wait(4000);
console.log('warnings after restore (before any setting change):', warns.length);
await set('medium', true); await wait(1000);
console.log('context-restore warnings:', warns.length, [...new Set(warns)].slice(0, 5));
await browser.close();
