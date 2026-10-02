// Online elimination rounds without a browser: every client is a worker thread running the real Match (src/game/
// match.js) and NetMatch (src/net/netmatch.js) against stubbed rendering / physics, wired through an in-process relay
// with latency + jitter (JSON on the wire, like the real one). Scripted hits decide the rounds, so the whole flow is
// exercised in seconds: round:pre → live → wipe → post → next round (owners reset their squidkids, proxies reappear
// at base), a player dropping mid-round while eliminated (the host adopts it: it must stay out until the next round),
// the host's final result (roundWins / rounds) on every screen.
//
// usage: node tools/net-rounds-sim.mjs [--lag 40] [--jitter 25] [--clients 3] [--drop guest|host]
//   exit code 0 = host and followers agreed on round, phase, round wins, alive states and the result at every check
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

// test round rules (shared by every client)
const RULES = { toWin: 3, roundTime: 6, preRound: 3, postRound: 3, firstPreRound: 0.8, maxRounds: 9 };

if (isMainThread) await main(); else await client();

// ================================================================================================= main: the relay
async function main() {
  const DROP = opt('drop', 'guest');
  const N = Math.max(2, +opt('clients', 3)), LAG = +opt('lag', 40), JIT = +opt('jitter', 25);
  const ids = Array.from({ length: N }, (_, i) => 'C' + i);
  // roster: C0 (host) owns its player + the bots; everyone else their own squidkid. 2 v 2 plus a bot per side.
  const roster = [];
  let nid = 0;
  const slots = [0, 0];
  ids.forEach((id, i) => { const team = i % 2; roster.push({ nid: nid++, owner: id, bot: false, team, slot: slots[team]++, name: 'P' + i, weapon: 'shooter' }); });
  for (const team of [0, 1]) roster.push({ nid: nid++, owner: ids[0], bot: true, team, slot: slots[team]++, name: 'Bot' + team, weapon: 'shooter' });
  const say = (...a) => console.log('[rounds-sim]', ...a);
  say(`${N} clients, lag ${LAG} ± ${JIT} ms, roster ${roster.map((r) => `${r.nid}:${r.owner}${r.bot ? '/bot' : ''}:t${r.team}`).join(' ')}`);

  const workers = new Map(), views = new Map(), last = new Map(), queues = new Map();
  let hostId = ids[0];
  const gone = new Set();
  let readyN = 0;
  const deliver = (to, from, json, raw = null) => {
    if (gone.has(to)) return;
    // in order per link (like TCP): the jitter never reorders messages between the same two sockets — and the relay's
    // 'leave' for a player reaches everyone after whatever that player sent before it went
    // (a per-link queue: two timers due in the same millisecond but armed with different delays may fire in either
    // order, so each timer flushes everything queued on its link up to and including its own message)
    const k = from + '>' + to, t = Math.max(last.get(k) || 0, Date.now() + LAG + Math.random() * JIT);
    last.set(k, t);
    const q = queues.get(k) || (queues.set(k, []), queues.get(k));
    const item = { msg: raw || { t: 'msg', from, json } };
    q.push(item);
    setTimeout(() => {
      const i = q.indexOf(item);
      if (i < 0) return;
      for (const it of q.splice(0, i + 1)) if (!gone.has(to)) workers.get(to)?.postMessage(it.msg);
    }, t - Date.now());
  };
  let done;
  const finished = new Promise((r) => (done = r));
  for (const id of ids) {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { id, hostId, roster, ids, rules: RULES } });
    workers.set(id, w);
    w.on('message', (m) => {
      if (m.t === 'b') { for (const o of ids) if (o !== id) deliver(o, id, m.json); }
      else if (m.t === 's') deliver(m.to, id, m.json);
      else if (m.t === 'view') views.set(id, m.v);
      else if (m.t === 'log') { say(`${id}: ${m.s}`); if (++readyN === N) for (const x of workers.values()) x.postMessage({ t: 'go' }); }
    });
    w.on('online', () => {});
    w.on('error', (e) => { say(`${id} crashed`, e.stack || e.message); process.exitCode = 1; done(); });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const live = () => ids.filter((i) => !gone.has(i));
  let checks = 0, bad = 0;
  // (followers trail the host by the link + their playback delay: a disagreement must persist to count)
  const check = async (tag, keys) => {
    const t0 = Date.now();
    let d = diffs(keys);
    while (d.length && Date.now() - t0 < 1500) { await sleep(50); d = diffs(keys); }
    const h = views.get(hostId);
    checks++;
    if (d.length) { bad++; say(`!! ${tag}: ${d.join(' · ')}`); }
    else say(`ok ${tag}: ${h.state} round ${h.r} ${h.p} wins ${h.w.join('-')} alive ${h.alive}${Date.now() - t0 > 60 ? ` (converged after ${Date.now() - t0} ms)` : ''}`);
  };
  const diffs = (keys = ['state', 'r', 'p', 'w', 'n', 'alive']) => {
    const vs = live().map((i) => [i, views.get(i)]).filter(([, v]) => v);
    const h = vs.find(([i]) => i === hostId)?.[1];
    if (!h) return ['no host view'];
    const diff = [];
    for (const [i, v] of vs) for (const k of keys) if (JSON.stringify(v[k]) !== JSON.stringify(h[k])) diff.push(`${i}.${k}=${JSON.stringify(v[k])} (host ${JSON.stringify(h[k])})`);
    // an eliminated squidkid is never drawn; every standing one is (a round-reset hand-over is over by now)
    for (const [i, v] of vs) for (const [n, alive, vis] of v.vis) if (alive !== vis) diff.push(`${i} nid ${n} alive ${alive} drawn ${vis}`);
    return diff;
  };
  // hits are validated: a hit only counts when it comes from the client that owns the attacking squidkid
  const ownerOf = (nid) => { const o = hv().actors?.find((a) => a.nid === nid)?.owner; return live().includes(o) ? o : hostId; };
  const cmd = (id, c) => workers.get(id)?.postMessage({ t: 'cmd', ...c });
  const hv = () => views.get(hostId) || {};
  const waitFor = async (pred, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(50); } return false; };
  const settle = () => sleep(LAG + JIT + 450);   // the followers' playback delay + the link

  try {
    await waitFor(() => ids.every((i) => views.get(i)?.state === 'playing'));
    // ---- round 1: team 1 is wiped (the host's bot shoots everyone on team 1: its own bot locally, remote players by hit)
    for (let round = 1; ; round++) {
      if (!(await waitFor(() => hv().r === round && hv().p === 'live'))) throw new Error(`round ${round} never went live`);
      await settle(); await check(`round ${round} live`);
      const loser = round % 2;                      // alternate which team gets wiped
      const byTeam = hv().actors.filter((a) => a.team === loser && a.alive);
      const shooter = hv().actors.find((a) => a.team !== loser && a.alive);
      if (round === 2 && DROP !== 'judge' && (N > 2 || DROP === 'host')) {
        // mid-round drop-out while eliminated: kill the leaver's squidkid first, then drop that client — its squidkid
        // is adopted by the host (--drop host: the host itself leaves; the next client becomes host and adopts its
        // squidkid, the bots, and the round authority) and must stay out until the next round, on every screen
        const leaver = DROP === 'host' ? ids[0] : ids[N - 1];
        const victim = roster.find((r) => r.owner === leaver && !r.bot);
        const atk = hv().actors.find((a) => a.team !== victim.team && a.alive);
        cmd(ownerOf(atk.nid), { c: 'hit', a: atk.nid, v: victim.nid, d: 999 });
        // (dropped once its own screen has it out and its tick has gone: its splat may still be in flight / queued on
        // the others' playback timelines — they must all end up agreeing)
        await waitFor(() => views.get(leaver)?.actors.find((a) => a.nid === victim.nid)?.alive === false, 5000);
        await sleep(70);
        gone.add(leaver); workers.get(leaver).terminate();
        if (leaver === hostId) hostId = live()[0];
        for (const i of live()) deliver(i, leaver, null, { t: 'cmd', c: 'leave', id: leaver, host: hostId });
        say(`${leaver} dropped out right after being eliminated (nid ${victim.nid}); host ${hostId}`);
        await settle(); await sleep(300);
        await check('after the drop-out');
        const v = hv().actors.find((a) => a.nid === victim.nid);
        if (v.alive) { bad++; say(`!! adopted nid ${victim.nid} came back mid-round`); }
        const sh = hv().actors.find((a) => a.team !== loser && a.alive);
        if (sh) shooter.nid = sh.nid;
        byTeam.splice(0, byTeam.length, ...hv().actors.filter((a) => a.team === loser && a.alive));
      }
      // one partial hit first (HP only), then the kills, each fired from a client that doesn't own the victim when possible
      // round 3: only one kill — the round clock runs out and the side with more players standing takes it
      if (round === 3) byTeam.splice(1);
      for (const v of byTeam) {
        const from = ownerOf(shooter.nid);
        cmd(from, { c: 'hit', a: shooter.nid, v: v.nid, d: 999 });
        await sleep(150);
      }
      if (!(await waitFor(() => hv().p === 'post' || hv().state !== 'playing', (RULES.roundTime + 4) * 1000))) throw new Error(`round ${round} did not end`);
      await settle(); await check(`round ${round} over`);
      if (hv().w[0] >= RULES.toWin || hv().w[1] >= RULES.toWin) break;
      if (!(await waitFor(() => hv().r === round + 1 && hv().p === 'pre'))) throw new Error(`round ${round + 1} never started`);
      await settle(); await sleep(250); await check(`round ${round + 1} pre-round (everyone back at base)`);
      await waitFor(() => live().every((i) => views.get(i).actors.every((a) => !a.alive || a.baseDist <= 3)), 1500);
      const far = live().map((i) => [i, views.get(i).actors.filter((a) => a.alive && a.baseDist > 3).map((a) => a.nid)]).filter(([, l]) => l.length);
      if (far.length) { bad++; say(`!! not back at base after the reset: ${JSON.stringify(far)}`); }
    }
    if (DROP === 'judge') {
      // the host calls the match (state 'finish', followers follow via its 'st') and dies before its result reaches anyone:
      // the next client must take the judge over and every remaining client must still get exactly one result
      if (!(await waitFor(() => views.get(hostId)?.state === 'finish', 15000))) throw new Error('host never called the match');
      const leaver = hostId;
      await sleep(+opt('judgeDelay', 150));   // (the host's result goes out ~2.6 s after the call: 0, 150, 2500 …)
      gone.add(leaver); workers.get(leaver).terminate();
      hostId = live()[0];
      for (const i of live()) deliver(i, leaver, null, { t: 'cmd', c: 'leave', id: leaver, host: hostId });
      say(`host ${leaver} died in the judge phase; new host ${hostId}`);
    }
    // ---- the result
    if (!(await waitFor(() => live().every((i) => views.get(i)?.result), 20000))) throw new Error('no result on every client');
    await sleep(100);
    await check('result', ['result']);
    for (const i of live()) say(`result on ${i}`, JSON.stringify(views.get(i).result));
  } catch (e) { bad++; say('FAIL', e.message); }
  say(`${checks} checks, ${bad ? bad + ' PROBLEMS' : 'host and followers agree on round, phase, round wins, alive states and the result'}`);
  for (const w of workers.values()) w.terminate();
  process.exit(bad ? 1 : process.exitCode || 0);
}

// ================================================================================================= a client
async function client() {
  const { id, hostId, roster, ids, rules } = workerData;
  // a DOM-less browser: just enough for the modules to load
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  if (!globalThis.location) globalThis.location = { search: '', hostname: 'localhost' };
  const THREE = await import('three');
  const cfg = await import('../src/config.js');
  Object.assign(cfg.ROUNDS, rules);
  const { G, on } = await import('../src/core/ctx.js');
  const { Match } = await import('../src/game/match.js');
  const { NetMatch } = await import('../src/net/netmatch.js');
  const log = (s) => parentPort.postMessage({ t: 'log', s });

  // ---- stubs: rendering, physics, paint, fx, audio
  const noop = () => {};
  const stubObj = (base = {}) => new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop) });
  class StubCharacter {
    constructor() {
      this.root = new THREE.Object3D();
      this.root.visible = true;
      this.setVisible = (v) => { this.root.visible = !!v; };
      return stubObj(this);
    }
  }
  G.scene = new THREE.Scene();
  G.teamColors = [new THREE.Color(1, 0.5, 0), new THREE.Color(0, 0.5, 1)];
  G.teamHex = ['#ff8800', '#0088ff'];
  G.time = 0;
  G.level = stubObj({ spawnPads: [new THREE.Vector3(0, 0, -6), new THREE.Vector3(0, 0, 6)] });
  G.physics = stubObj({ groundProbe: () => ({ hit: false }) });
  G.paint = stubObj({ splat: () => 0, coverage: () => [0.31, 0.27] });
  G.camera = new THREE.PerspectiveCamera();
  G.projectiles = stubObj({ applyHit(atk, v, d, w) { v.damage(d, atk, w); } });

  // ---- session + transport to the relay above
  const members = new Map(ids.map((i) => [i, i]));
  const session = {
    myId: id, hostId, _members: members,
    get isHost() { return this.myId === this.hostId; },
    tr: {
      broadcast: (d) => parentPort.postMessage({ t: 'b', json: JSON.stringify(d) }),
      sendTo: (to, d) => parentPort.postMessage({ t: 's', to, json: JSON.stringify(d) }),
    },
  };
  const netCfg = { map: 'tidewater', difficulty: 'normal', roster };
  const nm = new NetMatch(session, netCfg);
  const m = new Match({ roster, myId: id, host: id === hostId, autopilot: true, mode: 'turf', difficulty: 'normal', CharacterClass: StubCharacter });
  G.match = m;
  m.setup();
  for (const a of m.actors) {
    a.bot = null;                                   // scripted: no brains, no physics
    a._finishFrame = noop;
    a._nearCamera = () => false;
    const t0 = Math.random() * 6;
    // owned squidkids wander a little away from base while a round is live (so a reset is a visible teleport)
    a.update = function (dt) {
      if (!this.alive) { this.respawnTimer -= dt; if (this.respawnTimer <= 0 && G.match.canRespawn()) this.respawn(); return; }
      this.invuln = Math.max(0, this.invuln - dt);
      if (m.live()) { this.pos.x += Math.sin(G.time + t0) * dt * 3; this.pos.z += (this.team ? -1 : 1) * dt * 2; this.vel.set(Math.sin(G.time + t0) * 3, 0, this.team ? -2 : 2); }
      else this.vel.set(0, 0, 0);
    };
  }
  nm.bind(m);
  // an adopted squidkid gets a real BotBrain (no navmesh here): keep it brainless like the rest
  const adopt = nm._adopt.bind(nm);
  nm._adopt = (a) => { adopt(a); a.bot = null; };
  G.actors = m.actors;

  let result = null;
  on('match:state', ({ state }) => { if (state === 'judge') setTimeout(() => { result = m.result; }, 0); });

  parentPort.on('message', (msg) => {
    if (msg.t === 'msg') nm.onMessage(msg.from, JSON.parse(msg.json));
    else if (msg.t === 'cmd') {
      if (msg.c === 'hit') {
        const atk = nm.byNid.get(msg.a), v = nm.byNid.get(msg.v);
        if (!atk || !v) return;
        // the shooter's screen decides (it may be a proxy here): route like weapons.js applyHit does
        if (v.remote) { for (let n = 0; n < 3 && n * 36 < msg.d; n++) nm.sendHit(atk, v, Math.min(36, msg.d), 'shooter'); } else   // (real hits are validated: one shooter ball is <= 36)
          v.damage(msg.d, atk, 'shooter');
      } else if (msg.c === 'leave') {
        members.delete(msg.id);
        const hostChanged = msg.host !== session.hostId;
        session.hostId = msg.host;
        nm.onLeave(msg.id, hostChanged);
      }
    }
  });

  log(`ready (${id === hostId ? 'host' : 'follower'})`);
  // everyone starts on the relay's word once all clients are up (the game: the host's 'go')
  await new Promise((r) => parentPort.on('message', (msg) => { if (msg.t === 'go') r(); }));
  // (like main.netMatchGo: a follower whose host 'st' messages beat the relay's 'go' is already under way — starting
  // again would drop it back into a 4 s intro behind everyone else)
  if (m.state === 'init') { m.start(); m.setState('playing'); }   // (skip the 4 s intro)
  let prev = performance.now(), viewT = 0;
  setInterval(() => {
    const t = performance.now(), dt = Math.min(0.05, (t - prev) / 1000);
    prev = t;
    G.time += dt;
    nm.update(dt);
    m.update(dt);
    viewT -= dt;
    if (viewT <= 0) {
      viewT = 0.05;
      const pads = G.level.spawnPads;
      parentPort.postMessage({ t: 'view', v: {
        state: m.state, r: m.round, p: m.roundPhase, w: [...m.roundWins], n: m.rounds.length,
        alive: m.actors.slice().sort((a, b) => a.nid - b.nid).map((a) => (a.alive ? 1 : 0)).join(''),
        actors: m.actors.map((a) => ({ nid: a.nid, team: a.team, alive: a.alive, owner: a.owner, baseDist: Math.hypot(a.pos.x - pads[a.team].x, a.pos.z - pads[a.team].z) })),
        vis: m.actors.map((a) => [a.nid, a.alive, a.character.root.visible]),
        result: result && { mode: result.mode, winner: result.winner, roundWins: result.roundWins, rounds: result.rounds },
      } });
    }
  }, 16);
}
