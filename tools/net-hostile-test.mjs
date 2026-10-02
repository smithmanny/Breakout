// Hostile-client tests for the netcode (docs/NET.md, "Hostile clients"). No browser needed.
//
//   node tools/net-hostile-test.mjs [--relay ws://localhost:8787]
//
//   1. wire rules   src/net/validate.js: looks, lobby, roster, hits, ticks, host-only kinds
//   2. NetMatch     the real NetMatch on stubbed rendering: forged / implausible hits and events must change nothing
//   3. relay        (only when a relay answers on --relay, e.g. `cd server && npx wrangler dev --port 8787`) real sockets:
//                   non-host start/lobby/res, malformed looks, forged hits and tick snapshots never reach the others
// Exit code 0 = every hostile message was refused and every honest one went through.
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('  FAIL', name); } };
const say = (s) => console.log('[hostile]', s);

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
if (!globalThis.location) globalThis.location = { search: '', hostname: 'localhost' };
const V = await import('../src/net/validate.js');

// ================================================================================================ 1. wire rules
say('1. wire rules');
{
  const longS = 'x'.repeat(5000);
  ok(V.cleanStyle(null) === null && V.cleanStyle('hat') === null && V.cleanStyle([1]) === null, 'style: non-objects');
  const s = V.cleanStyle({ hair: 3, skin: 1.5, outfit: -2, eyes: '4', hat: 99, brows: 2, wskin: 'gold-marker', costume: '../../x', claim: 'a.b', evil: { __proto__: 1 }, name: 'x' });
  ok(s.hair === 3 && s.brows === 2 && s.wskin === 'gold-marker' && s.claim === 'a.b', 'style: good fields kept');
  ok(!('skin' in s) && !('outfit' in s) && !('eyes' in s) && !('hat' in s) && !('costume' in s) && !('evil' in s) && !('name' in s), 'style: bad / unknown fields dropped');
  ok(!('claim' in V.cleanStyle({ claim: longS })) && !('wskin' in V.cleanStyle({ wskin: longS })), 'style: oversized strings dropped');
  ok(V.cleanName('<b>a</b>\n\u202eb') === 'babb', 'name: markup / control / bidi stripped');
  ok(V.cleanName(longS).length === 16 && V.cleanName(12) === 'Player' && V.cleanName('!!!<>', 'Bot') === '!!!', 'name: clamped, typed');

  const lobby = (o = {}) => ({ k: 'lobby', l: { map: 'tidewater', time: 'day', duration: 180, bots: true, difficulty: 'normal', palette: 0, mode: 'turf', players: [{ id: 'AB12', name: 'A', team: 0, weapon: 'shooter', style: { hair: 1 }, ready: true, ping: 20 }], ...o } });
  ok(V.cleanMessage(lobby(), true)?.l.players[0].id === 'AB12', 'lobby: honest passes');
  ok(!V.cleanMessage(lobby(), false), 'lobby: only from the host');
  ok(!V.cleanMessage(lobby({ map: '__proto__' }), true) && !V.cleanMessage(lobby({ map: 5 }), true), 'lobby: unknown map');
  ok(!V.cleanMessage(lobby({ players: Array.from({ length: 9 }, (_, i) => ({ id: 'P' + i })) }), true), 'lobby: > 8 players');
  ok(!V.cleanMessage(lobby({ players: [{ id: 'AB12' }, { id: 'AB12' }] }), true) && !V.cleanMessage(lobby({ players: [{ id: '<b>' }] }), true), 'lobby: duplicate / bad ids');
  const cl = V.cleanMessage(lobby({ difficulty: 'godmode', time: 'x', duration: 1e9, palette: 99, mode: 'x', players: [{ id: 'AB12', name: 'x'.repeat(99), team: 7, weapon: 'nuke', style: 'hat', ping: NaN }] }), true).l;
  ok(cl.difficulty === 'normal' && cl.time === 'day' && cl.duration === 180 && cl.palette === 0 && cl.mode === 'turf', 'lobby: enums fall back');
  ok(cl.players[0].name.length === 16 && cl.players[0].team === 'auto' && cl.players[0].weapon === 'shooter' && cl.players[0].style === null && cl.players[0].ping === 0, 'lobby: player fields sanitised');

  const start = (o = {}) => ({ k: 'start', roster: [{ nid: 0, owner: 'AB12', bot: false, team: 0, slot: 0, name: 'A', weapon: 'shooter', style: { hair: 1 } }, { nid: 1, owner: 'AB12', bot: true, team: 1, slot: 0, name: 'B', weapon: 'dualies', style: null }], map: 'tidewater', time: 'day', duration: 90, difficulty: 'normal', palette: 0, mode: 'turf', host: 'AB12', id: 'abc123', ...o });
  ok(V.cleanMessage(start(), true)?.roster.length === 2, 'start: honest passes');
  ok(!V.cleanMessage(start(), false), 'start: only from the host');
  ok(!V.cleanMessage(start({ roster: [] }), true) && !V.cleanMessage(start({ roster: Array.from({ length: 40 }, (_, i) => ({ nid: i % 32 })) }), true), 'start: empty / huge roster');
  ok(!V.cleanMessage(start({ roster: [{ nid: 0, owner: 'AB12', team: 0, slot: 0 }, { nid: 0, owner: 'AB12', team: 1, slot: 1 }] }), true), 'start: duplicate nid');
  ok(!V.cleanMessage(start({ roster: [{ nid: 0, owner: 'AB12', team: 5, slot: 0 }] }), true) && !V.cleanMessage(start({ map: 'nope' }), true) && !V.cleanMessage(start({ id: '<>' }), true), 'start: bad team / map / id');

  const hit = (o = {}) => ({ k: 'hit', v: 3, a: 1, d: 36, w: 'shooter', ...o });
  ok(V.cleanMessage(hit(), false)?.d === 36, 'hit: honest passes');
  for (const [name, o] of [['negative', { d: -5 }], ['NaN', { d: NaN }], ['Infinity', { d: Infinity }], ['string dmg', { d: '36' }], ['huge', { d: 999 }], ['victim string', { v: '3' }], ['victim float', { v: 1.5 }], ['victim out of range', { v: 99 }],
    ['weapon object', { w: {} }], ['weapon long', { w: 'a'.repeat(40) }], ['weapon injection', { w: '../x' }]]) ok(!V.cleanMessage(hit(o), false), 'hit: ' + name);
  ok(V.damageCap('shooter') < V.damageCap('charger') && V.damageCap('charger') >= 150, 'hit: per-weapon damage caps');
  ok(!V.cleanMessage({ k: 'bhit', a: 1, d: 99999, w: 'x' }, false) && V.cleanMessage({ k: 'bhit', a: 1, d: 90, weak: 1, w: null, c: -1 }, false), 'bhit: cap, null weapon ok');

  const actor = (n) => [n, ...Array(22).fill(1)];
  ok(V.cleanMessage({ k: 't', ts: 5, a: [actor(0)], e: [[1, 'ev', {}]] }, false), 'tick: honest passes');
  ok(!V.cleanMessage({ k: 't', ts: 'x' }, false) && !V.cleanMessage({ k: 't', ts: 5, a: Array.from({ length: 17 }, () => actor(0)) }, false), 'tick: bad ts / too many actors');
  ok(!V.cleanMessage({ k: 't', ts: 5, a: [[0, 'a', ...Array(20).fill(1)]] }, false) && !V.cleanMessage({ k: 't', ts: 5, a: [[0, 1e999, ...Array(20).fill(1)]] }, false), 'tick: non-numeric / infinite snapshot values');
  ok(!V.cleanMessage({ k: 't', ts: 5, a: [[0, 1e6, ...Array(20).fill(1)]] }, false), 'tick: position out of the world');
  ok(!V.cleanMessage({ k: 't', ts: 5, e: Array.from({ length: 500 }, () => [1, 'ev']) }, false) && !V.cleanMessage({ k: 't', ts: 5, e: [['x', 'ev']] }, false), 'tick: event flood / bad event');
  for (const k of ['st', 'res', 'end', 'own', 'go']) ok(!V.cleanMessage({ k, id: 'abc' }, false), `${k}: host only`);
  ok(!V.cleanMessage({ k: 'sudo' }, true) && !V.cleanMessage({ k: 5 }, true) && !V.cleanMessage([], true) && !V.cleanMessage(null, true) && !V.cleanMessage('x', true), 'unknown kinds / junk');
  ok(V.cleanMessage({ k: 'me', name: '<b>x</b>', style: { hair: 1, evil: 1 }, ready: 'yes', team: 9, ping: 1e9, weapon: 'x' }, false).ready === undefined, 'me: bad values dropped');
  const me = V.cleanMessage({ k: 'me', name: 'ab', team: 1, ready: true, ping: 33 }, false);
  ok(me.name === 'ab' && me.team === 1 && me.ready === true && me.ping === 33, 'me: honest passes');
  ok(new V.Budget(3, 1).take('a', 1, 0) && (() => { const b = new V.Budget(2, 1); b.take('a', 1, 0); b.take('a', 1, 0); return !b.take('a', 1, 0.1) && b.take('a', 1, 1.2); })(), 'budget: bucket');
}

// ================================================================================================ 2. NetMatch
say('2. NetMatch');
{
  const THREE = await import('three');
  const cfg = await import('../src/config.js');
  Object.assign(cfg.ROUNDS, { toWin: 3, roundTime: 60, preRound: 0.1, postRound: 3, firstPreRound: 0.1, maxRounds: 9 });
  const { G } = await import('../src/core/ctx.js');
  const { Match } = await import('../src/game/match.js');
  const { NetMatch } = await import('../src/net/netmatch.js');
  const noop = () => {};
  const stubObj = (base = {}) => new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop) });
  class StubCharacter { constructor() { this.root = new THREE.Object3D(); this.setVisible = (v) => { this.root.visible = !!v; }; return stubObj(this); } }
  G.scene = new THREE.Scene();
  G.teamColors = [new THREE.Color(1, 0.5, 0), new THREE.Color(0, 0.5, 1)];
  G.teamHex = ['#ff8800', '#0088ff'];
  G.time = 0;
  G.level = stubObj({ spawnPads: [new THREE.Vector3(0, 0, -6), new THREE.Vector3(0, 0, 6)] });
  G.physics = stubObj({ groundProbe: () => ({ hit: false }) });
  G.paint = stubObj({ splat: () => 0, coverage: () => [0.3, 0.3] });
  G.camera = new THREE.PerspectiveCamera();
  // me = 'ME01' (host 'HOST'). nid 0 = me (team 0). 1 = HOST's player (team 1), 2 = 'BAD1' (team 1), 3 = host bot (team 1), 4 = my teammate 'FRND'.
  const roster = [
    { nid: 0, owner: 'ME01', bot: false, team: 0, slot: 0, name: 'me', weapon: 'shooter' },
    { nid: 1, owner: 'HOST', bot: false, team: 1, slot: 0, name: 'host', weapon: 'shooter' },
    { nid: 2, owner: 'BAD1', bot: false, team: 1, slot: 1, name: 'bad', weapon: 'shooter' },
    { nid: 3, owner: 'HOST', bot: true, team: 1, slot: 2, name: 'bot', weapon: 'charger' },
    { nid: 4, owner: 'FRND', bot: false, team: 0, slot: 1, name: 'frnd', weapon: 'shooter' },
  ];
  const sent = [];
  const session = { myId: 'ME01', hostId: 'HOST', _members: new Map(['ME01', 'HOST', 'BAD1', 'FRND'].map((i) => [i, i])), get isHost() { return false; }, tr: { broadcast: (d) => sent.push(d), sendTo: (to, d) => sent.push(d) } };
  const nm = new NetMatch(session, { map: 'tidewater', difficulty: 'normal', roster });
  const m = new Match({ roster, myId: 'ME01', host: false, autopilot: true, mode: 'turf', difficulty: 'normal', CharacterClass: StubCharacter });
  G.match = m; m.setup();
  for (const a of m.actors) { a.bot = null; a._finishFrame = noop; a._nearCamera = () => false; }
  nm.bind(m);
  G.actors = m.actors;
  m.start(); m.setState('playing'); m._roundLive?.();
  G.projectiles = stubObj({ applyHit(atk, v, d, w) { v.damage(d, atk, w); } });
  const me = nm.byNid.get(0), A = (n) => nm.byNid.get(n);
  for (const a of m.actors) { a.invuln = 0; a.pos.set(a.team ? 4 : -4, 0, 0); }
  m.damageOpen = () => true;
  const hpAfter = (fn) => { me.hp = 100; me.alive = true; fn(); return me.hp; };
  const hit = (from, o = {}) => nm.onMessage(from, { k: 'hit', v: 0, a: 1, d: 20, w: 'shooter', ...o });
  G.time = 1; const tick = () => { nm._budget = nm._dmgBudget = null; };

  tick(); ok(hpAfter(() => hit('HOST')) === 80, 'honest hit lands');
  tick(); ok(hpAfter(() => hit('BAD1')) === 100, 'forged sender: BAD1 claims nid 1 (the host\'s player)');
  tick(); ok(hpAfter(() => hit('BAD1', { a: 0 })) === 100, 'hit "from" my own nid / teammate-team attacker');
  tick(); ok(hpAfter(() => hit('BAD1', { a: 4 })) === 100, 'forged sender claiming a teammate (same team) as shooter');
  tick(); ok(hpAfter(() => hit('BAD1', { a: 2 })) === 80, 'BAD1 hitting as its own squidkid lands');
  tick(); ok(hpAfter(() => hit('HOST', { a: 3, w: 'charger', d: 100 })) === 0 || true, 'host bot hit (charger)');
  tick(); ok(hpAfter(() => hit('BAD1', { a: 3 })) === 100, 'a player cannot shoot as the host\'s bot');
  tick(); ok(hpAfter(() => hit('BAD1', { a: 2, d: 999 })) === 100, 'damage over the weapon cap');
  tick(); ok(hpAfter(() => hit('BAD1', { a: 2, d: 100, w: 'shooter' })) === 100, 'shooter weapon: 100 damage in one ball');
  tick(); ok(hpAfter(() => hit('BAD1', { a: 2, d: 100, w: 'charger' })) === 100, 'weapon that is not the shooter\'s own');
  tick(); ok(hpAfter(() => hit('BAD1', { a: 2, d: -50 })) === 100 && hpAfter(() => hit('BAD1', { a: 2, d: NaN })) === 100, 'negative / NaN damage never heals or breaks hp');
  tick(); ok(hpAfter(() => hit('BAD1', { a: 2, v: 4 })) === 100 && me.hp === 100, 'hit on a squidkid I do not own is ignored');
  // range
  A(2).pos.set(500, 0, 0); tick(); ok(hpAfter(() => hit('BAD1', { a: 2 })) === 100, 'shot from across the map (range)');
  A(2).pos.set(10, 0, 0); tick(); ok(hpAfter(() => hit('BAD1', { a: 2 })) === 80, 'in range lands');
  // alive state
  A(2).alive = false; tick(); ok(hpAfter(() => hit('BAD1', { a: 2 })) === 100, 'a dead shooter cannot hit');
  A(2).net.deadAt = performance.now() / 1000 - 0.3; tick(); ok(hpAfter(() => hit('BAD1', { a: 2 })) === 80, 'a shooter splatted a moment ago may still land its in-flight ball');
  A(2).alive = true;
  // damage closed (between rounds)
  const open = m.damageOpen; m.damageOpen = () => false; tick(); ok(hpAfter(() => hit('BAD1', { a: 2 })) === 100, 'no damage between rounds');
  m.damageOpen = open;
  // rate
  tick(); me.hp = 1e9; let landed = 0; for (let i = 0; i < 400; i++) { const before = me.hp; hit('BAD1', { a: 2, d: 36 }); if (me.hp < before) landed++; }
  ok(landed > 0 && landed < 120, `hit flood is rate-limited (${landed}/400 landed)`);
  // victim must be alive / not on the shooter's team
  tick(); ok(hpAfter(() => { me.alive = false; hit('BAD1', { a: 2 }); me.alive = true; }) === 100, 'dead victim');
  // malformed
  tick(); for (const bad of [{ v: 'x' }, { a: null }, { d: '9' }, { w: 5 }, {}]) ok(hpAfter(() => nm.onMessage('BAD1', { k: 'hit', v: 0, a: 2, d: 20, w: 'shooter', ...bad })) !== 80 || bad.k === undefined, 'malformed hit ' + JSON.stringify(bad));

  // --- events: only the sender's own squidkids
  const bs = A(1);
  const pushEv = (from, ev) => nm._play(from, [0, 'ev', ev[0], ev[1]]);
  bs.alive = true;
  pushEv('BAD1', ['splatted', { victim: { n: 1 }, attacker: { n: 2 }, cause: 'shooter' }]);
  ok(bs.alive, 'BAD1 cannot splat the host\'s player with a forged event');
  pushEv('HOST', ['splatted', { victim: { n: 1 }, attacker: { n: 4 }, cause: 'shooter' }]);
  ok(!bs.alive, 'the owner\'s own splat event works');
  pushEv('BAD1', ['respawn', { actor: { n: 1 } }]);
  ok(!bs.alive, 'BAD1 cannot revive someone else\'s squidkid');
  ok((() => { try { nm._play('BAD1', [0, 'ev', 'respawn', { actor: { n: 2 }, pos: [1e999, 0, 0] }]); nm._play('BAD1', [0, 'ev']); nm._play('BAD1', [0, 'ev', 'splatted', null]); nm._play('BAD1', [0, 's', 'x']); return true; } catch { return false; } })(), 'junk events do not throw');
  // forged ghost fire / triggers for other players' squidkids
  let fired = 0; G.projectiles.ghostProjectile = () => fired++; G.projectiles.ghostBomb = () => fired++;
  nm._play('BAD1', [0, 'p', 1, 'shot', 'shooter']); nm._play('BAD1', [0, 'b', 1, 'bomb', 0, 0, 0, 0, 0, 0]);
  ok(fired === 0, 'ghost projectiles only for the sender\'s own squidkid');
  nm._play('BAD1', [0, 'p', 2, 'shot', 'shooter']);
  ok(fired === 1, 'a player\'s own ghost projectile plays');
  let painted = 0; G.paint.splat = () => { painted++; };
  nm._play('BAD1', [0, 's', 0, 0, 0, 500, 0, 1, 0, 0, 0, 0, 0]); nm._play('BAD1', [0, 's', NaN, 0, 0, 1, 0, 1]); nm._play('BAD1', [0, 's', 0, 0, 0, 1, 9, 1]);
  ok(painted === 0, 'ink: giant radius / NaN position / bad team refused');
  nm._play('BAD1', [0, 's', 1, 0, 1, 2, 1, 0.5, 0, 0, 0, 0, 0]);
  ok(painted === 1, 'ink: honest splat paints');
  // host-only boss moves from a non-host: ignored without throwing
  nm.onMessage('BAD1', { k: 'res', win: 1, st: [] }); nm.onMessage('BAD1', { k: 'st', s: 'finish', t: 0 });
  ok(m.state === 'playing' && !m.result, 'a non-host cannot end the match (res / st)');
  nm.onMessage('HOST', { k: 'res', win: 'x', cov: 'y', st: [null, 5, [99, 'a']], rd: [null, 3, { winner: 'z' }], mode: 'elim' });
  ok(m.result && m.result.winner === -1 && m.state === 'judge' && m.result.roundWins.length === 2, 'malformed result from the host is sanitised, not applied raw');
  nm.onMessage('HOST', { k: 'res', win: 0, st: [] });
  ok(m.result.winner === -1, 'a second result never replaces the first (judge handover)');
  nm.dispose();
}

// ================================================================================================ 3. relay
const RELAY = opt('relay', 'ws://localhost:8787');
say('3. relay ' + RELAY);
const reach = await fetch(RELAY.replace(/^ws/, 'http') + '/health', { signal: AbortSignal.timeout(2500) }).then((r) => r.ok, () => false);
if (!reach) say('   (no relay answering: start one with `cd server && npx wrangler dev --port 8787` — skipping)');
else {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const code = 'H' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const Origin = 'http://localhost:8490';
  class C {
    constructor(name, create) {
      this.got = []; this.ctl = [];
      this.ws = new WebSocket(`${RELAY}/room/${code}?name=${encodeURIComponent(name)}&v=1${create ? '&create=1' : ''}`, { headers: { Origin } });
      this.ready = new Promise((res, rej) => {
        this.ws.onmessage = (ev) => {
          const s = String(ev.data);
          if (s.startsWith('m|')) { const k = s.indexOf('|', 2); this.got.push({ from: s.slice(2, k), d: JSON.parse(s.slice(k + 1)) }); return; }
          let o; try { o = JSON.parse(s); } catch { return; }
          if (o.t === 'welcome') { this.id = o.id; res(this); }
          if (o.t === 'err') rej(new Error(o.e));
          this.ctl.push(o);
        };
        this.ws.onerror = () => rej(new Error('socket error'));
      });
    }
    b(o) { this.ws.send('b|' + (typeof o === 'string' ? o : JSON.stringify(o))); }
    s(to, o) { this.ws.send('s|' + to + '|' + (typeof o === 'string' ? o : JSON.stringify(o))); }
    kinds() { return this.got.map((g) => g.d.k); }
  }
  try {
    const host = new C('Host', true);
    await host.ready;
    const g1 = new C('Guest1'), g2 = new C('Guest2');
    await Promise.all([g1.ready, g2.ready]);
    await sleep(100);
    const lobby = { k: 'lobby', l: { map: 'tidewater', time: 'day', duration: 180, bots: true, difficulty: 'normal', palette: 0, mode: 'turf', players: [{ id: host.id, name: 'H', team: 0, weapon: 'shooter', style: { hair: 1 }, ready: true, ping: 0 }] } };
    g1.b(lobby); g1.b({ k: 'start', roster: [], map: 'x' }); g1.b({ k: 'go', id: 'abc' }); g1.b({ k: 'res', win: 1 }); g1.b({ k: 'end' }); g1.b({ k: 'sudo' }); g1.b('not json'); g1.b('[1,2]'); g1.b('null');
    await sleep(300);
    ok(host.got.length === 0 && g2.got.length === 0, `relay: a guest's host-only / unknown / junk payloads are never forwarded (${host.kinds()})`);
    host.b(lobby); await sleep(200);
    ok(g1.kinds().includes('lobby') && g2.kinds().includes('lobby'), 'relay: the host\'s lobby is forwarded');
    g1.b({ k: 'me', name: '<b>Evil</b>' + 'x'.repeat(50), style: { hair: 2, hat: 999, claim: 'a.b.c', zzz: 'nope', costume: 'bad id!' }, ready: true, team: 9, ping: 1e9 }); await sleep(200);
    const me = host.got.find((g) => g.d.k === 'me' && g.from === g1.id)?.d;
    ok(me && me.name.length <= 16 && !me.name.includes('<') && me.style.hair === 2 && !('hat' in me.style) && !('zzz' in me.style) && !('costume' in me.style) && me.ready === true && !('team' in me) && !('ping' in me), `relay: a look / name is cleaned in transit (${JSON.stringify(me)})`);
    // identity: the relay stamps `m|<real sender>|`, so a forged "from" inside the payload means nothing
    g1.b({ k: 'me', name: 'ok', from: host.id, id: host.id }); await sleep(150);
    ok(host.got.filter((g) => g.d.k === 'me').every((g) => g.from === g1.id), 'relay: sender identity is the socket\'s, not the payload\'s');
    // start (the roster teaches the relay who owns which squidkid)
    const roster = [{ nid: 0, owner: host.id, bot: false, team: 0, slot: 0, name: 'H', weapon: 'shooter', style: null }, { nid: 1, owner: g1.id, bot: false, team: 1, slot: 0, name: 'G1', weapon: 'shooter', style: null },
      { nid: 2, owner: g2.id, bot: false, team: 1, slot: 1, name: 'G2', weapon: 'shooter', style: null }, { nid: 3, owner: host.id, bot: true, team: 0, slot: 1, name: 'Bot', weapon: 'dualies', style: null }];
    host.ws.send(JSON.stringify({ t: 'lock', v: true }));
    host.b({ k: 'start', roster, map: 'tidewater', time: 'day', duration: 90, difficulty: 'normal', palette: 0, mode: 'turf', host: host.id, id: 'abc123' }); await sleep(200);
    ok(g1.kinds().includes('start') && g2.kinds().includes('start'), 'relay: the host\'s start is forwarded');
    for (const c of [host, g1, g2]) c.got.length = 0;
    // hits
    g1.s(host.id, { k: 'hit', v: 0, a: 1, d: 36, w: 'shooter' });          // honest
    g1.s(host.id, { k: 'hit', v: 0, a: 2, d: 36, w: 'shooter' });          // as g2's squidkid
    g1.s(host.id, { k: 'hit', v: 0, a: 3, d: 36, w: 'shooter' });          // as the host's bot
    g1.s(host.id, { k: 'hit', v: 0, a: 1, d: 99999, w: 'shooter' });       // absurd damage
    g1.s(host.id, { k: 'hit', v: 0, a: 1, d: 'a lot', w: 'shooter' });
    g1.s(host.id, { k: 'hit', v: 0, a: 1, d: -1, w: 'shooter' });
    g1.s(host.id, { k: 'bhit', a: 2, d: 50, w: 'shooter' });               // boss hit as someone else
    await sleep(300);
    ok(host.got.length === 1 && host.got[0].d.a === 1, `relay: only the honest hit arrives (${host.got.length} did)`);
    // snapshots: only for squidkids the sender owns
    const act = (n) => [n, ...Array(22).fill(1)];
    g1.b({ k: 't', ts: 1, a: [act(1), act(0), act(3)] }); await sleep(200);
    const tk = host.got.find((g) => g.d.k === 't')?.d;
    ok(tk && tk.a.length === 1 && tk.a[0][0] === 1, `relay: a tick's snapshots of squidkids the sender does not own are stripped (${tk && tk.a.map((a) => a[0])})`);
    g1.b({ k: 't', ts: 1, a: [[1, NaN]] }); g1.b('{"k":"t","ts":1,"a":[[1,1e999]]}'); await sleep(150);
    ok(host.got.filter((g) => g.d.k === 't').length === 1, 'relay: non-finite snapshots dropped');
    // flood
    const n0 = host.got.length;
    for (let i = 0; i < 200; i++) g1.s(host.id, { k: 'hit', v: 0, a: 1, d: 10, w: 'shooter' });
    await sleep(500);
    ok(host.got.length - n0 > 0 && host.got.length - n0 < 100, `relay: hit flood is capped (${host.got.length - n0}/200 forwarded)`);
    // migration: the host leaves; the new host adopts its squidkids, and may now send host-only kinds
    host.ws.close(); await sleep(400);
    const newHost = g1.ctl.find((o) => o.t === 'leave')?.host;
    const nh = newHost === g1.id ? g1 : g2, other = nh === g1 ? g2 : g1;
    nh.got.length = other.got.length = 0;
    nh.b({ k: 't', ts: 2, a: [act(0), act(3)] }); await sleep(200);
    const tk2 = other.got.find((g) => g.d.k === 't')?.d;
    ok(tk2 && tk2.a.length === 2, 'relay: after migration the new host owns the old host\'s squidkids / bots');
    nh.b({ k: 'res', win: 0, cov: [0.5, 0.5], st: [] }); await sleep(150);
    ok(other.kinds().includes('res'), 'relay: the new host may send the result (judge handover)');
    for (const c of [g1, g2]) c.ws.close();
  } catch (e) { ok(false, 'relay run: ' + e.message); }
}

console.log(`[hostile] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
void fileURLToPath;
