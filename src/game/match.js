// Match: BREAKOUT elimination rules, lifecycle (intro → playing [rounds] → finish → judge → results), team setup.
//
// Elimination (docs/PAINTBALL.md): while state is 'playing' the match runs rounds. Each round has a phase:
//   'pre'  everyone stands frozen at their base (countdown; round:pre, round:count)
//   'live' one life each, the round clock (roundTime, mirrored into match.time) runs; round:start
//   'post' the result banner (round:end); then the next round, or 'finish' once a team has ROUNDS.toWin round wins.
// A round ends on a wipe (a team with nobody alive) or when the clock runs out (more alive wins, then more total HP,
// else a draw). Online the host is authoritative on round transitions: followers apply netRoundState() snapshots via
// applyNetRound() (until the first one arrives they run the same logic locally).
// Attract mode (menu backdrop) and Boss Battle keep free respawns and no rounds.
import * as THREE from 'three';
import { G, emit, on, clamp } from '../core/ctx.js';
import { MATCH, PLAYER, WEAPON_ORDER, BOT_NAMES, TEAM_NAMES, ROUNDS, validWeapon } from '../config.js';
import { Actor } from './actor.js';
import { BotBrain } from './bots.js';
import { randomStyle } from './character-style.js';
import { PlayerController } from './player.js';
import { BossMode, BOSS_MODE } from '../boss/bossMode.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Match {
  constructor(opts) {
    this.opts = opts;          // { duration, difficulty, attract, playerName, weapon, CharacterClass, input, rig, mode }
    this.attract = !!opts.attract;
    // 'turf' is the historical id of the regular 4v4 mode, which is now elimination rounds; boss: one squad vs HULLBREAKER
    this.mode = opts.mode === 'boss' && !this.attract ? 'boss' : 'turf';
    this.elim = this.mode !== 'boss' && !this.attract;
    this.duration = this.elim ? ROUNDS.roundTime : (opts.duration || (this.mode === 'boss' ? BOSS_MODE.duration : MATCH.defaultDuration));
    this.time = this.duration;
    // rounds (elimination only; stay at their defaults otherwise)
    this.round = 0;                  // 1-based once the first round begins
    this.roundWins = [0, 0];
    this.roundTime = ROUNDS.roundTime;
    this.roundPhase = 'pre';         // 'pre' | 'live' | 'post'
    this.phaseT = 0;
    this.rounds = [];                // [{ winner (0|1|-1), reason ('wipe'|'time') }]
    this._netRoundSeen = false;
    this.state = 'init';
    this.stateT = 0;
    this.actors = [];
    this.controller = null;
    this.result = null;
    this.paused = false;
    this.lastMinuteFired = false;
    this.lastCount = 99;
    this.events = [];
  }

  playing() { return this.state === 'playing' && !this.paused; }
  // one life per round in elimination; attract / boss respawn freely
  canRespawn() { return this.state === 'playing' && !this.elim; }
  live() { return this.state === 'playing' && (!this.elim || this.roundPhase === 'live'); }
  /** Can anyone be hurt right now? (between rounds nobody is) */
  damageOpen() { return !this.elim || (this.state === 'playing' && this.roundPhase === 'live'); }
  /** Movement / shooting locked (pre-round freeze at the bases). */
  inputFrozen() { return this.elim && this.state === 'playing' && this.roundPhase === 'pre'; }
  /** Shooting locked (pre-round and the post-round banner). */
  fireLocked() { return this.elim && (this.state !== 'playing' || this.roundPhase !== 'live'); }
  superJumpOk() { return !this.elim; }
  aliveCount(team) { let n = 0; for (const a of this.actors) if (a.team === team && a.alive) n++; return n; }
  teamHp(team) { let n = 0; for (const a of this.actors) if (a.team === team && a.alive) n += Math.max(0, a.hp); return n; }

  setup() {
    const o = this.opts;
    const CharacterClass = o.CharacterClass;
    if (o.roster) { this._setupRoster(o, CharacterClass); return; }
    // weapons: each team gets a balanced mix
    const pickTeam = (first) => {
      const pool = [...WEAPON_ORDER];
      const out = [];
      if (first) { first = validWeapon(first); out.push(first); pool.splice(pool.indexOf(first), 1); }
      while (out.length < MATCH.teamSize) {
        if (!pool.length) pool.push(...WEAPON_ORDER);
        out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
      }
      return out;
    };
    const names = shuffle([...BOT_NAMES]);
    let ni = 0;
    const boss = this.mode === 'boss';
    // humans-only stage (config noBots) offline: a match is just you (the ?devstage walk), the attract backdrop nobody
    // (o.mannequins: idle, brainless kids for the render audits)
    const noBots = !!o.noBots;
    for (let team = 0; team < (boss ? 1 : 2); team++) {
      const weapons = pickTeam(team === 0 && !this.attract ? o.weapon : null);
      if (boss) weapons.push(...pickTeam(null));   // the whole squad on one side: 8 kids, every weapon kind
      for (let s = 0; s < (boss ? BOSS_MODE.squad : MATCH.teamSize); s++) {
        const isLocal = team === 0 && s === 0 && !this.attract;
        if (noBots && !isLocal && !(this.attract && o.mannequins)) continue;
        const a = new Actor({
          team, slot: s, weapon: weapons[s], isLocal, isBot: !isLocal,
          name: isLocal ? (o.playerName || 'You') : names[ni++ % names.length],
          // the local player wears their locker look; everyone else is rolled (outfit/eyes derive from the name seed)
          style: isLocal && o.style ? { ...o.style } : randomStyle(), CharacterClass,
        });
        G.scene.add(a.character.root);
        if ((!isLocal || o.autopilot) && !(noBots && !isLocal)) a.bot = new BotBrain(a, o.difficulty);
        this.actors.push(a);
      }
    }
    G.actors = this.actors;
    this.local = this.actors.find((a) => a.isLocal) || null;
    G.local = this.local;
    if (this.local && !o.autopilot) this.controller = new PlayerController(this.local, o.rig, o.input);
    // initial placement on the spawn decks (standing, no drop)
    for (const a of this.actors) {
      const pad = G.level.spawnPads[a.team];
      const ang = (a.slot / (this.mode === 'boss' ? BOSS_MODE.squad : 4)) * Math.PI * 2 + 0.6, rr = this.mode === 'boss' ? 1.7 : 1.2;
      _v.set(pad.x + Math.cos(ang) * rr, pad.y, pad.z + Math.sin(ang) * rr);
      a.spawnAt(_v, a.team === 0 ? 0 : Math.PI);
      a.invuln = 0;
      if (a.bot) { a.bot.aimYaw = a.yaw; a.bot.aimPitch = 0; }
    }
    this.unsubs = [
      on('splatted', (e) => this._onSplatted(e)),
    ];
    if (this.mode === 'boss') { this.bossMode = new BossMode(this); this.boss = this.bossMode.boss; }
  }

  // Online: the host's roster — who owns which squidkid (players their own, the host the bots).
  _setupRoster(o, CharacterClass) {
    const me = o.myId;
    this.follower = !o.host;
    for (const r of o.roster) {
      const mine = r.owner === me;
      const a = new Actor({ team: r.team, slot: r.slot, weapon: r.weapon, isLocal: mine && !r.bot, isBot: r.bot, name: r.name, style: r.style || undefined, CharacterClass });
      a.nid = r.nid; a.owner = r.owner; a.remote = !mine;
      G.scene.add(a.character.root);
      if (mine && (r.bot || o.autopilot)) a.bot = new BotBrain(a, o.difficulty);
      this.actors.push(a);
    }
    G.actors = this.actors;
    this.local = this.actors.find((a) => a.isLocal) || null;
    G.local = this.local;
    if (this.local && !o.autopilot) this.controller = new PlayerController(this.local, o.rig, o.input);
    for (const a of this.actors) {
      const pad = G.level.spawnPads[a.team];
      const ang = (a.slot / (this.mode === 'boss' ? BOSS_MODE.squad : 4)) * Math.PI * 2 + 0.6, rr = this.mode === 'boss' ? 1.7 : 1.2;
      _v.set(pad.x + Math.cos(ang) * rr, pad.y, pad.z + Math.sin(ang) * rr);
      a.spawnAt(_v, a.team === 0 ? 0 : Math.PI);
      a.invuln = 0;
      if (a.bot) { a.bot.aimYaw = a.yaw; a.bot.aimPitch = 0; }
    }
    this.unsubs = [on('splatted', (e) => this._onSplatted(e))];
    if (this.mode === 'boss') { this.bossMode = new BossMode(this); this.boss = this.bossMode.boss; }
  }

  start() {
    this.setState(this.attract ? 'playing' : 'intro');
  }

  setState(s) {
    this.state = s; this.stateT = 0;
    // the first round's pre-round begins with play (the intro already was the long look at the stage)
    if (s === 'playing' && this.elim && this.round === 0) this._roundPre(1, true);
    emit('match:state', { state: s, match: this });
  }

  // ---------------------------------------------------------------------------------------------- rounds
  _roundPre(n, first = false) {
    this.round = n;
    this.roundPhase = 'pre'; this.phaseT = 0;
    this.roundTime = ROUNDS.roundTime; this.time = this.roundTime;
    this.lastCount = 99; this._preCount = 99;
    this._preLen = first ? (ROUNDS.firstPreRound ?? ROUNDS.preRound) : ROUNDS.preRound;
    if (!first) {
      // everyone back to base: full HP, full hopper, full grenades (paint on the field stays). Each client resets the
      // actors it owns; remote ones arrive with their owner's 'respawn'.
      G.projectiles?.clear?.();
      for (const a of this.actors) if (!a.remote) this._resetActor(a);
    }
    // teams that exist at all this round (a humans-only dev walk has nobody on one side: never an instant "wipe")
    this._sides = [this.actors.some((a) => a.team === 0), this.actors.some((a) => a.team === 1)];
    emit('round:pre', { round: n, match: this });
  }

  _resetActor(a) {
    const pad = G.level.spawnPads[a.team];
    const ang = (a.slot / 4) * Math.PI * 2 + 0.6, rr = 1.2;
    _v.set(pad.x + Math.cos(ang) * rr, pad.y, pad.z + Math.sin(ang) * rr);
    a.superJumpState = null; a.specialActive = null;
    a.spawnAt(_v, a.team === 0 ? 0 : Math.PI);
    a.invuln = 0;
    a.netTp = (a.netTp || 0) + 1;    // online: a genuine teleport — proxies snap instead of gliding back to base
    a.stats.roundSurvived = false;
    if (a.bot) { a.bot.aimYaw = a.yaw; a.bot.aimPitch = 0; a.bot.onRoundReset?.(); }
    emit('respawn', { actor: a, round: this.round });
  }

  _roundLive() {
    this.roundPhase = 'live'; this.phaseT = 0;
    this.roundTime = ROUNDS.roundTime; this.time = this.roundTime;
    emit('round:start', { round: this.round, match: this });
  }

  _roundEnd(winner, reason) {
    if (this.roundPhase !== 'live') return;
    this.roundPhase = 'post'; this.phaseT = 0;
    if (winner === 0 || winner === 1) this.roundWins[winner]++;
    this.rounds.push({ winner, reason });
    for (const a of this.actors) if (a.alive) a.stats.roundsSurvived = (a.stats.roundsSurvived || 0) + 1;
    emit('round:end', { round: this.round, winner, reason, roundWins: [...this.roundWins], match: this });
  }

  // who takes a round the clock ran out on: more players alive, then more total HP, else a draw
  _timeWinner() {
    const a0 = this.aliveCount(0), a1 = this.aliveCount(1);
    if (a0 !== a1) return a0 > a1 ? 0 : 1;
    const h0 = this.teamHp(0), h1 = this.teamHp(1);
    if (Math.abs(h0 - h1) > 0.5) return h0 > h1 ? 0 : 1;
    return -1;
  }

  _matchOver() {
    return this.roundWins[0] >= ROUNDS.toWin || this.roundWins[1] >= ROUNDS.toWin || this.round >= (ROUNDS.maxRounds || 99);
  }

  _updateRounds(dt) {
    this.phaseT += dt;
    // online followers wait for the host's calls once the host has spoken (applyNetRound)
    const auth = !this.follower || !this._netRoundSeen;
    switch (this.roundPhase) {
      case 'pre': {
        this.time = this.roundTime = ROUNDS.roundTime;
        const left = this._preLen - this.phaseT;
        const c = Math.ceil(left);
        if (c !== this._preCount && c > 0 && c <= 3) { this._preCount = c; emit('round:count', { round: this.round, n: c }); }
        if (left <= 0 && auth) this._roundLive();
        break;
      }
      case 'live': {
        this.roundTime = Math.max(0, this.roundTime - dt);
        this.time = this.roundTime;
        const c = Math.ceil(this.roundTime);
        if (this.roundTime <= MATCH.finalCountdown && c !== this.lastCount && c > 0) { this.lastCount = c; emit('match:count', { n: c }); }
        if (!auth) break;
        const s = this._sides || [true, true];
        // online grace: a follower's round-reset respawn reaches the host ~one round-trip late, so right after going
        // live a lagging team can look empty. Damage only opens at live, so no real wipe can happen this fast.
        const grace = G.netm && this.phaseT < 1.5;
        const w0 = !grace && s[0] && this.aliveCount(0) === 0, w1 = !grace && s[1] && this.aliveCount(1) === 0;
        if (w0 || w1) this._roundEnd(w0 && w1 ? -1 : w0 ? 1 : 0, 'wipe');
        else if (this.roundTime <= 0) this._roundEnd(this._timeWinner(), 'time');
        break;
      }
      case 'post':
        if (this.phaseT >= ROUNDS.postRound && auth) {
          if (this._matchOver()) { if (!this.follower) this.setState('finish'); }
          else this._roundPre(this.round + 1);
        }
        break;
    }
  }

  /** Online (host → followers): a compact snapshot of the round state; send it on every round:* event and ~2 Hz. */
  netRoundState() {
    const last = this.rounds[this.rounds.length - 1];
    return { r: this.round, p: this.roundPhase, w: [...this.roundWins], t: Math.round(this.roundTime * 100) / 100, lw: last ? last.winner : null, lr: last ? last.reason : null, n: this.rounds.length };
  }
  /** Online (followers): follow the host's round state — runs the same transitions (and events) locally. */
  applyNetRound(d) {
    if (!d || !this.elim || !this.follower) return;
    this._netRoundSeen = true;
    if (this.state !== 'playing') return;
    if (d.r > this.round) this._roundPre(d.r);
    if (d.r === this.round) {
      if (d.p === 'live' && this.roundPhase === 'pre') this._roundLive();
      if (d.p === 'post' && this.roundPhase === 'pre') this._roundLive();
      if (d.p === 'post' && this.roundPhase === 'live') {
        this.roundWins = [d.w[0] - (d.lw === 0 ? 1 : 0), d.w[1] - (d.lw === 1 ? 1 : 0)];
        this._roundEnd(d.lw ?? -1, d.lr || 'time');
      }
      if (this.roundPhase === 'live' && typeof d.t === 'number' && Math.abs(this.roundTime - d.t) > 0.3) { this.roundTime = d.t; this.time = d.t; }
    }
    this.roundWins = [d.w[0] | 0, d.w[1] | 0];
  }

  dispose() {
    this.bossMode?.dispose(); this.bossMode = null; this.boss = null;
    for (const a of this.actors) { G.scene.remove(a.character.root); a.weaponRunner.reset(); a.character.dispose?.(); }
    this.unsubs?.forEach((u) => u());
    G.actors = [];
    G.local = null;
  }

  // Online, humans-only stage (config noBots): a player left, and nobody takes over their squidkid — it bursts into its
  // own ink and is gone. HUD squads, the minimap, specials / weapons and the judge all read this.actors (G.actors is the
  // same array), so dropping it here is all they need.
  removeActor(a) {
    const i = this.actors.indexOf(a);
    if (i < 0) return;
    if (a.alive && a.character.root.visible) {
      _v.copy(a.pos); _v.y += 0.6;
      G.fx?.splatted(_v, a.color);
      G.fx?.burst?.(_v, _up, a.color, { count: 18, speed: 5, size: 0.1 });
      G.audio?.play?.('splat_big', { pos: a.pos, volume: 0.6 });
    }
    this.actors.splice(i, 1);
    if (G.rig?.spectate?.actor === a) G.rig.spectate.actor = null;   // a death cam watching them looks on at the spot
    G.scene.remove(a.character.root); a.weaponRunner.reset(); a.character.dispose?.();
    emit('actor:removed', { actor: a });
  }

  _onSplatted({ victim, attacker, cause }) {
    this.events.push({ t: this.duration - this.time, round: this.round, victim, attacker, cause });
    // elimination: out for the rest of the round (also for remote victims, whose splat arrives from their owner)
    if (this.elim) emit('eliminated', { victim, attacker, cause, round: this.round });
  }

  update(dt) {
    if (this.paused) return;
    this.stateT += dt;
    switch (this.state) {
      case 'intro':
        if (this.stateT > (this.bossMode ? BOSS_MODE.intro : 4.2)) this.setState('playing');
        break;
      case 'playing': {
        if (this.elim) { this._updateRounds(dt); break; }
        this.time -= dt;
        if (!this.attract) {
          if (!this.lastMinuteFired && this.time <= 60 && this.duration > 60) { this.lastMinuteFired = true; emit('match:oneminute', {}); }
          const c = Math.ceil(this.time);
          if (this.time <= MATCH.finalCountdown && c !== this.lastCount && c > 0) { this.lastCount = c; emit('match:count', { n: c }); }
        }
        if (this.time <= 0) {
          this.time = 0;
          if (!this.follower) this.setState('finish');   // online: the host calls time
        }
        break;
      }
      case 'finish':
        if (this.stateT > (this.bossMode ? (this.bossMode.boss.dead ? BOSS_MODE.finishWin : BOSS_MODE.finishLose) : 2.6) && !this.follower && !this.result) this._judge();
        break;
    }
    // actors (the local controller runs once per rendered frame via updateController)
    const live = this.live();
    for (const a of this.actors) {
      if (a.bot) {
        if (live) a.bot.update(dt);
        else clearIntent(a);
      }
    }
    // elimination freeze: pre-round nobody moves or shoots (the local player can still look around); post-round nobody
    // shoots. (The local controller already wrote this frame's intent in updateController.)
    if (this.elim && this.state === 'playing' && this.roundPhase !== 'live') {
      for (const a of this.actors) {
        if (a.remote) continue;
        if (this.roundPhase === 'pre') clearIntent(a);
        else { a.intent.fire = a.intent.sub = a.intent.special = false; }
      }
    }
    const nm = G.netm;
    for (const a of this.actors) { if (a.remote && nm) nm.applyRemote(a, dt); else a.update(dt); }
    this.bossMode?.update(dt);
    // soft push between actors
    for (let i = 0; i < this.actors.length; i++) for (let j = i + 1; j < this.actors.length; j++) {
      const a = this.actors[i], b = this.actors[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = b.pos.y - a.pos.y;
      const d2 = dx * dx + dz * dz;
      const r = PLAYER.radius * 1.7;
      if (d2 < r * r && Math.abs(dy) < 1.2 && d2 > 1e-5) {
        // online: other players' squidkids are where their owners say — only your own side gives way
        const ka = a.remote ? 0 : b.remote ? 1 : 0.5, kb = b.remote ? 0 : a.remote ? 1 : 0.5;
        const d = Math.sqrt(d2), push = (r - d);
        a.pos.x -= (dx / d) * push * ka; a.pos.z -= (dz / d) * push * ka;
        b.pos.x += (dx / d) * push * kb; b.pos.z += (dz / d) * push * kb;
      }
    }
  }

  updateController(dt) {
    if (!this.controller) return;
    this.controller.enabled = this.state === 'playing' && !this.paused && this.local.alive;
    this.controller.update(dt);
  }

  _judge() {
    if (this.bossMode) {
      this.result = this.bossMode.result();
      G.netm?.sendResult(this.result);
      this.setState('judge');
      return;
    }
    // round wins decide it; (only at the maxRounds safety cap with level round wins does the paint coverage)
    const cov = G.paint.coverage();
    const rw = this.roundWins;
    const win = rw[0] !== rw[1] ? (rw[0] > rw[1] ? 0 : 1) : cov[0] === cov[1] ? (Math.random() < 0.5 ? 0 : 1) : cov[0] > cov[1] ? 0 : 1;
    this.result = { mode: 'elim', winner: win, roundWins: [...rw], rounds: this.rounds.map((r) => ({ ...r })), coverage: cov };
    G.netm?.sendResult(this.result);        // online: every client shows the host's count
    this.setState('judge');
  }

  teamSummary() {
    return [0, 1].map((t) => ({
      color: G.teamHex[t],
      players: this.actors.filter((a) => a.team === t).map((a) => ({
        name: a.name, weapon: a.weaponId, alive: a.alive, respawn: a.alive || this.elim ? 0 : Math.max(0, a.respawnTimer), out: !a.alive, specialReady: a.specialReady(), isSelf: a.isLocal,
      })),
    }));
  }
}

function clearIntent(a) {
  const it = a.intent;
  it.move.set(0, 0, 0); it.fire = it.squid = it.sprint = it.sub = it.jump = it.special = it.reload = false;
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
