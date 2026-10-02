// First-run quality default check: emulates a 2-core device with and without a saved quality (needs npm start on :8490).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu'] });
process.on('exit', () => { try { browser.process()?.kill('SIGKILL'); } catch { /* gone */ } });
for (const saved of [null, 'ultra']) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((saved) => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    if (saved && !sessionStorage.getItem('seeded')) { localStorage.setItem('inkwave.settings', JSON.stringify({ quality: saved })); sessionStorage.setItem('seeded', '1'); }
  }, saved);
  await page.goto('http://localhost:8490/?autostart=60&autopilot', { waitUntil: 'load' });
  await page.waitForFunction('window.__inkwave && __inkwave.match && __inkwave.match.state==="playing"', { timeout: 300000, polling: 200 });
  console.log('saved', saved, '->', await page.evaluate(() => __inkwave.settings.quality));
  await page.close();
}
await browser.close();
