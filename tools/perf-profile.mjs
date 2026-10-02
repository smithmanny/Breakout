// Performance baseline: load cost, in-match frame cost, draw calls, GPU memory, and top allocation sites (GC churn).
// usage: node tools/perf-profile.mjs [url] [--low] [--secs 15] [--w 1280 --h 720] [--dpr 1] [--alloc]
//   needs the dev server (npm start). Prints one JSON blob.
import puppeteer from 'puppeteer-core';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const url = (args[0] && !args[0].startsWith('--') ? args[0] : 'http://localhost:8490/?autostart=60&autopilot');
const W = +opt('w', 1280), H = +opt('h', 720), SECS = +opt('secs', 15);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: +opt('dpr', 1) },
  protocolTimeout: 600000,
});
const kill = () => { try { browser.process()?.kill('SIGKILL'); } catch { /* gone */ } };
process.on('exit', kill);
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
if (opt('lat', 0) > 0) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: +opt('lat', 0), downloadThroughput: +opt('mbps', 20) * 125000, uploadThroughput: 125000 * 5 });
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
let bytes = 0, reqs = 0;
cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs++; });
if (args.includes('--low')) await page.evaluateOnNewDocument(() => { const k = 'inkwave.settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.quality = 'low'; localStorage.setItem(k, JSON.stringify(s)); });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
if (args.includes('--cpu')) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
if (args.includes('--cpuplay')) await cdp.send('Profiler.enable');
if (opt('throttle', 0) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +opt('throttle', 1) });
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction('window.__inkwave && __inkwave.match && __inkwave.match.state==="playing" && __inkwave.match.local && !__inkwave.match.attract', { timeout: 300000, polling: 200 });
const toPlay = Date.now() - t0;
let cpu, cpuIncl;
async function stopCpu() {
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas; 
  profile.samples.forEach((id, i) => { const cf = byId.get(id).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.replace(/.*\/(src|vendor)\//, '$1/')}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
  // inclusive time per function (each sample credited once to every distinct function on its stack)
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const incl = new Map();
  profile.samples.forEach((id, i) => { const seen = new Set(); for (let n = id; n; n = parent.get(n)) { const cf = byId.get(n).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.replace(/.*\/(src|vendor)\//, '$1/')}:${cf.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + (dt[i] || 0)); } } });
  cpuIncl = [...incl].filter(([k]) => / src\//.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${(v / 1000).toFixed(0)}ms ${k}`);
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${(v / 1000).toFixed(0)}ms ${k}`);
}
if (args.includes('--cpu')) cpu = await stopCpu();
const boot = await page.evaluate('__inkwave.bootMs');
await new Promise((r) => setTimeout(r, 3000));
if (args.includes('--cpuplay')) { await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start'); }
if (args.includes('--alloc')) await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const m0 = await metrics();
await page.evaluate(() => { window.__ft = []; let l = performance.now(); const f = (t) => { __ft.push(t - l); l = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
// allocation rate: sum of heap growth between samples (drops = GC runs, counted separately)
let allocB = 0, gcs = 0, lastHeap = (await metrics()).JSHeapUsedSize;
const endAt = Date.now() + SECS * 1000;
while (Date.now() < endAt) { await new Promise((r) => setTimeout(r, 50)); const h = (await metrics()).JSHeapUsedSize; if (h >= lastHeap) allocB += h - lastHeap; else gcs++; lastHeap = h; }
const m1 = await metrics();
if (args.includes('--cpuplay')) cpu = await stopCpu();
const res = await page.evaluate(() => {
  const ft = __ft.slice().sort((a, b) => a - b), q = (p) => ft[Math.floor(ft.length * p)];
  const i = window.__inkwave.R.renderer.info;
  return { frames: ft.length, avgMs: ft.reduce((a, b) => a + b, 0) / ft.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: ft[ft.length - 1],
    bootMarks: __inkwave.bootMarks, perf: __inkwave.perf, dyn: __inkwave.R.dynScale, mem: { geometries: i.memory.geometries, textures: i.memory.textures }, programs: i.programs?.length, heapMB: performance.memory.usedJSHeapSize / 1048576 };
});
let alloc;
if (args.includes('--alloc')) {
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const sites = new Map();
  (function walk(n) { const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.replace(/.*\/(src|vendor)\//, '$1/')}:${cf.lineNumber + 1}`; sites.set(k, (sites.get(k) || 0) + n.selfSize); n.children.forEach(walk); })(profile.head);
  alloc = [...sites].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / 1024).toFixed(0)}KB ${k}`);
}
const secs = m1.Timestamp - m0.Timestamp;
console.log(JSON.stringify({ url, toPlayS: toPlay / 1000, bootMs: boot, bytesKB: Math.round(bytes / 1024), reqs,
  taskMsPerSec: (m1.TaskDuration - m0.TaskDuration) / secs * 1000, scriptMsPerSec: (m1.ScriptDuration - m0.ScriptDuration) / secs * 1000,
  allocKBps: Math.round(allocB / 1024 / SECS), gcPer10s: +(gcs / SECS * 10).toFixed(1), ...res, cpu, cpuIncl, alloc, errs: errs.slice(0, 5) }, null, 1));
kill();
process.exit(0);
