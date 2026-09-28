// Bot brain (BREAKOUT paintball elimination). Every round starts with a breakout: each bot sprints from its base to a
// bunker it picked toward the front (cover spots precomputed once per level by nav.coverSpots(): nodes hugging an
// obstacle, with the compass octants it shields). From cover it plays the classic paintball loop — hold, peek out to
// the side to shoot at what it can see, duck back in to reload or when it's getting hit — and moves cover to cover:
// forward when its team has the numbers or the clock is running out (or nobody has been seen for a while: hunt),
// back when outnumbered. Teammates share what they've seen (last known enemy positions). Grenades get lobbed at
// enemies hiding behind cover at medium range; specials fire when an enemy is in their reach.
// Motion: aim is a critically-damped spring with a turn-rate cap and a smoothly wandering error (plus an acquisition
// over/undershoot that settles), shots follow the bot's *actual* aim ray, the move command slews its heading.
// Difficulty (config DIFFICULTY) scales reaction time, aim error, the aim spring, awareness range and fire discipline.
// Attract mode (menu backdrop, free respawns) plays the same way (a respawn is a fresh breakout); Boss Battle has its
// own tick at the bottom (bots fight HULLBREAKER).
import * as THREE from 'three';
import { G, clamp, angleDiff } from '../core/ctx.js';
import { PLAYER, DIFFICULTY, SUB, SPECIALS } from '../config.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const OCT = Math.PI / 4;
const octant = (dx, dz) => ((Math.round(Math.atan2(dx, dz) / OCT) % 8) + 8) % 8;
// how well a cover spot's octant mask shields against a threat in octant k (1 square on, 0.45 from a neighbour octant)
const coverScore = (mask, k) => ((mask >> k) & 1 ? 1 : ((mask >> ((k + 1) & 7)) & 1) || ((mask >> ((k + 7) & 7)) & 1) ? 0.45 : 0);
const wander = (x) => Math.sin(x) * 0.6 + Math.sin(x * 2.27 + 1.3) * 0.4;
const BOMB_G = 24;          // weapons.js _updateBombs gravity (grenades and the storm beacon)

// team intel: last known enemy positions, shared by a team's bots (lives on the match: gone with it)
function intelOf(m) {
  return m._botIntel || (m._botIntel = { seen: [new Map(), new Map()], t: [-99, -99], round: -1 });
}

export class BotBrain {
  constructor(actor, difficulty = 'normal') {
    this.a = actor;
    this.setDifficulty(difficulty);
    this.pers = 0.25 + Math.random() * 0.45;           // personality: base aggression
    this.threat = new THREE.Vector3(); this.lastSeen = new THREE.Vector3(); this.anchor = new THREE.Vector3();
    this.peekPt = new THREE.Vector3(); this.search = new THREE.Vector3(); this.lobPt = new THREE.Vector3();
    this.lastPos = new THREE.Vector3();
    this.reset();
    try { G.nav?.coverSpots?.(); } catch { /* no level yet */ }   // precompute while the match is still loading
  }
  setDifficulty(d) { this.diff = DIFFICULTY[d] || DIFFICULTY.normal; }
  reset() {
    this.path = null; this.pi = 0; this.goal = -1; this.repath = 0; this.goalTimer = 0;
    this.target = null; this.visible = false; this.seeT = 99; this.react = 0; this.headOnly = false;
    this.stuck = 0; this.jumpCd = 0; this.bestD = Infinity; this.noProg = 0;
    this.mode = 'breakout'; this.needBreak = true; this.goalSpot = null; this.holdT = 0;
    this.peekPhase = 'duck'; this.peekT = 0; this.peekSide = Math.random() < 0.5 ? 1 : -1; this.hasPeek = false;
    this.repickCd = 0; this.searchT = 0; this.hasSearch = false; this.threatKnown = false; this.threatAge = 99;
    this.aggr = this.pers;
    this.aimYaw = this.a.yaw; this.aimPitch = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0; this.strafeS = 0; this.strafeAmp = 1;
    this.bombCd = 2 + Math.random() * 4; this.lob = null; this.specialCd = 0;
    this.think = Math.random() * 0.2;
    const d = this.diff;
    // charger release point: Easy bots often let go early (a partial charge is not a one-hit elimination)
    this.chargeRelease = clamp((d.fireDiscipline ?? 0.8) + 0.12 + Math.random() * 0.15, 0.7, 1);
    this.aimYawV = 0; this.aimPitchV = 0;
    this.acqT = 9; this.acqSignY = 0; this.acqSignP = 0;
    this.ph1 = Math.random() * 20; this.ph2 = Math.random() * 20; this.t = Math.random() * 10;
    this.mvYaw = this.a.yaw; this.mvMag = 0;
    this.dodgeCd = 1 + Math.random() * 2;
    this.burstT = 0; this.pauseT = 0; this._firing = false; this.fighting = false;
    this.pathFail = 0; this.roundT = 0;
    const kind = this.a.weapon?.kind;
    // how far up the field this bot breaks out to (sniper hangs back, short-range markers go deep), and which lane
    this.breakFrac = kind === 'charger' ? 0.16 + Math.random() * 0.14 : kind === 'dualies' || kind === 'blaster' ? 0.32 + Math.random() * 0.16 : 0.24 + Math.random() * 0.18;
    this.lane = Math.random() * 2 - 1;
  }
  /** Match calls this when it puts everyone back at base for a new round. */
  onRoundReset() {
    this.reset();
    const m = G.match;
    if (m) { const I = intelOf(m); if (I.round !== m.round) { I.round = m.round; I.seen[0].clear(); I.seen[1].clear(); I.t[0] = I.t[1] = -99; } }
  }

  update(dt) {
    const a = this.a;
    const it = a.intent;
    if (!a.alive) { this._idle(it); this.path = null; this.target = null; this._wasDead = true; return; }
    const m = G.match;
    if (this._wasDead && m && m.playing()) {
      // just respawned (attract / boss: free respawns): a fresh breakout; sometimes super jump up the field
      this._wasDead = false;
      this.reset();
      this.aimYaw = a.yaw; this.aimPitch = 0;
      if (G.boss && Math.random() < 0.5) {
        const enemyPad = G.level.spawnPads[1 - a.team];
        let best = null, bd = Infinity;
        for (const o of G.actors) {
          if (o === a || o.team !== a.team || !o.alive || o.superJumpState) continue;
          const d = o.pos.distanceTo(enemyPad);
          if (d < bd && o.pos.distanceTo(a.pos) > 18) { bd = d; best = o; }
        }
        if (best && a.superJump(best)) { this.path = null; this.goalTimer = 0; }
      }
    }
    if (a.superJumpState || !m || !m.playing()) { this._idle(it); return; }
    this.think -= dt; this.jumpCd -= dt; this.bombCd -= dt; this.strafeT -= dt; this.dodgeCd -= dt; this.repickCd -= dt;
    this.specialCd -= dt; this.roundT += dt; this.acqT += dt; this.t += dt; this.seeT += dt; this.react -= dt; this.threatAge += dt;
    if (G.boss) { this._bossTick(dt); return; }   // Boss Battle: a different job (below)

    it.fire = false; it.sub = false; it.special = false; it.squid = false; it.sprint = false; it.jump = false; it.reload = false;
    if (this.think <= 0) {
      this.think = 0.12 + Math.random() * 0.08;
      this._perceive(m);
      this._tactics(m);
    }
    if (this.target && !this.target.alive) { this.target = null; this.visible = false; }
    const w = a.weapon, wr = a.weaponRunner, tgt = this.target;
    const vis = !!(tgt && this.visible && this.seeT < 0.35);
    const range = this._range();
    const tdist = tgt ? Math.hypot(tgt.pos.x - a.pos.x, tgt.pos.z - a.pos.z) : 99;

    // ---------------- navigation
    if (this.needBreak) { this.needBreak = false; this._pickCover({ breakout: true }); }
    let move = null, travelling = false;
    if (this.mode === 'move' || this.mode === 'breakout') {
      if (this.goal >= 0 && !this.path) {
        this.repath -= dt;
        if (this.repath <= 0 && !this._pathToNode(this.goal)) { if (++this.pathFail > 2) this._arrive(); }
      }
      move = this._steer(dt);
      const gn = this.goal >= 0 ? G.nav.nodes[this.goal] : null;
      const gd = gn ? Math.hypot(gn.x - a.pos.x, gn.z - a.pos.z) : 0;
      if (!gn || gd < 0.7 || (this.path && this.pi >= this.path.length && gd < 1.6)) this._arrive();
      else {
        travelling = true;
        // contact while crossing open ground: dive for the nearest cover instead of running the whole route
        if (vis && this.repickCd <= 0 && gd > 6 && tdist < range * 1.1 && this.aggr < 1.15) { this.repickCd = 2.5; this._pickCover({ maxTravel: 7 }); }
        // a sniper with someone in its sights plants where it stands instead of crawling on while charging
        else if (vis && w.kind === 'charger' && tdist < w.rangeMax && (this.mode !== 'breakout' || this.roundT > 6)) { this.goal = -1; this.goalSpot = null; this._arrive(); travelling = false; }
        // no real progress for a long while (blocked, pinned in a corner): pick somewhere else
        if (travelling) {
          if (Math.hypot(a.pos.x - this.lastPos.x, a.pos.z - this.lastPos.z) > 1.5) { this.lastPos.copy(a.pos); this.moveT = 0; }
          else if ((this.moveT = (this.moveT || 0) + dt) > 6) { this.moveT = 0; if (!this._pickCover({ maxTravel: 14, minTravel: 2 })) this._arrive(); }
        }
      }
    }
    if (this.mode === 'hold') move = this._hold(dt, vis, tdist, range);
    if (!move) move = this._steer(dt);

    // ---------------- aim + trigger
    let wantYaw = move.lengthSq() > 0.01 ? Math.atan2(move.x, move.z) : this.aimYaw;
    let wantPitch = -0.05, aimDist = 8;
    this.fighting = false;
    let fire = false;
    if (this.lob) {
      // grenade / storm beacon: settle the aim on the throw, then let go
      const L = this.lob;
      L.t += dt;
      const dx = this.lobPt.x - a.pos.x, dz = this.lobPt.z - a.pos.z;
      wantYaw = Math.atan2(dx, dz); wantPitch = L.pitch;
      this.fighting = true;
      const settled = Math.abs(angleDiff(this.aimYaw, wantYaw)) < 0.07 && Math.abs(this.aimPitch - wantPitch) < 0.07;
      if (L.kind === 'sub') {
        it.sub = true;
        if ((L.t > 0.3 && settled) || L.t > 0.9) { it.sub = false; this.lob = null; }
      } else if ((L.t > 0.2 && settled) || L.t > 0.8) { it.special = true; this.lob = null; }
      if (move) move.multiplyScalar(0.5);
    } else if (tgt && (vis || this.seeT < 3)) {
      const t = tgt;
      const lead = w.kind === 'charger' ? 0 : tdist / (w.projSpeed || 40);
      const h = vis ? (this.headOnly ? 1.22 : 0.9) : 0.9;
      const px = vis ? t.pos.x + t.vel.x * lead : this.lastSeen.x, pz = vis ? t.pos.z + t.vel.z * lead : this.lastSeen.z;
      const py = (vis ? t.pos.y + (t.smoothY || 0) : this.lastSeen.y) + h;
      _v2.set(px - a.pos.x, py - a.pos.y - 1.1, pz - a.pos.z);
      const idealYaw = Math.atan2(_v2.x, _v2.z), idealPitch = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
      aimDist = _v2.length();
      // human aim error: a slow wander plus an acquisition error that settles over the reaction time
      const e = this.diff.aimError * (this.headOnly ? 0.8 : 1);
      const acq = Math.exp(-this.acqT / Math.max(0.12, this.diff.reaction * 0.9));
      wantYaw = idealYaw + e * (0.75 * wander(this.t * 1.7 + this.ph1) + 2.4 * acq * this.acqSignY);
      wantPitch = idealPitch + e * 0.6 * (0.75 * wander(this.t * 2.1 + this.ph2) + 1.6 * acq * this.acqSignP);
      this.fighting = vis;
      const off = Math.hypot(angleDiff(this.aimYaw, idealYaw), this.aimPitch - idealPitch);
      const tol = Math.max(0.045, Math.atan2(this.headOnly ? 0.35 : 0.55, tdist)) * (this._firing ? 2.4 : 1.5);
      fire = this._trigger(dt, vis, off, tol, tdist, range);
      // blaster: splash the spot they ducked behind for a moment
      if (!fire && w.kind === 'blaster' && !vis && this.seeT < 1.6 && tdist < range && tdist > 3 && !a.reloading && a.ammo > 3 && Math.abs(angleDiff(this.aimYaw, idealYaw)) < 0.12) fire = Math.random() < 0.6;
      if (w.kind === 'charger' && wr.charging && move) move.multiplyScalar(0.25);
      if (w.kind === 'splatling' && (wr.charging || wr.streaming) && move) move.multiplyScalar(0.7);
      // dualies: dive-roll sideways while firing when hit / up close
      if (fire && w.kind === 'dualies' && move && this.dodgeCd <= 0 && a.grounded && !wr.dodge && wr.rollsLeft > 0 && (a.lastDamage < 0.3 || tdist < 5) && Math.random() < 0.08 * dt * 60) {
        const nx = _v2.x / Math.max(aimDist, 0.01), nz = _v2.z / Math.max(aimDist, 0.01), side = Math.random() < 0.5 ? -1 : 1;
        if (!this._nearWater(a, 3.2)) { move.set(-nz * side, 0, nx * side); it.jump = true; this.dodgeCd = 1.6 + Math.random() * 1.8; }
      }
      // specials: the slam right on top of them
      if (vis && a.specialReady() && w.special === 'slam' && tdist < 5.5 && this.specialCd <= 0) { it.special = true; this.specialCd = 2; }
    } else if (this.threatKnown || this.mode === 'hold') {
      // no one in sight: watch where they're expected to come from
      const dx = this.threat.x - a.pos.x, dz = this.threat.z - a.pos.z;
      if (!travelling || Math.hypot(dx, dz) < 12) { wantYaw = Math.atan2(dx, dz) + Math.sin(this.t * 0.7 + this.ph1) * 0.25; wantPitch = -0.03; }
    }
    if (fire) {
      if (a.ammo < (w.ammoPerShot ?? 1) - 1e-6 && a.reloading <= 0) { fire = false; it.reload = true; }
    }
    if (m.fireLocked && m.fireLocked()) fire = false;
    it.fire = fire;
    this._firing = fire;

    // ---------------- reload: when dry, or proactively when low with nobody in sight
    if (!fire && a.reloading <= 0 && !this.lob && !wr.charging && !wr.streaming && a.ammo < a.ammoMax - 1e-6) {
      const frac = a.ammo / a.ammoMax, lowAt = w.kind === 'charger' ? 0.6 : w.kind === 'blaster' ? 0.55 : 0.45;
      if (a.ammo < (w.ammoPerShot ?? 1) || (frac < lowAt && this.seeT > 1.0) || (frac < 0.8 && this.seeT > 5 && this.mode === 'hold')) it.reload = true;
    }

    // ---------------- sprint while crossing ground with nobody to shoot
    if (travelling && !fire && !this.lob && !wr.charging && !wr.streaming && this._pathRemaining() > 2.2 && !(vis && tdist < range * 1.05 && this.react <= 0)) it.sprint = true;
    it.squid = it.sprint;
    this._tail(dt, move, wantYaw, wantPitch, aimDist, move.lengthSq() > 0.01);
  }

  _idle(it) {
    it.move.set(0, 0, 0); it.fire = it.squid = it.sprint = it.sub = it.jump = it.special = it.reload = false;
    this.mvMag = 0; this.lob = null;
  }

  // Per-weapon trigger handling. Returns whether the trigger is held this frame.
  //   shooter / dualies / blaster: held while aimed at a visible target in range
  //   splatling: hold to spin up (starts while the aim is still coming on), keep holding while it streams on target
  //   charger: hold to charge (from first sight), release once charged enough for the distance and on target
  _trigger(dt, vis, off, tol, dist, range) {
    const a = this.a, w = a.weapon, wr = a.weaponRunner;
    if (a.reloading > 0) return false;
    const ready = vis && this.react <= 0;
    // fire discipline: bursts with short breaths (sloppier bots spray longer and breathe less often)
    if (this._firing) { this.burstT += dt; } else this.burstT = Math.max(0, this.burstT - dt * 2);
    this.pauseT -= dt;
    switch (w.kind) {
      case 'charger': {
        const need = clamp((dist - w.rangeMin) / (w.rangeMax - w.rangeMin), 0, 1);
        if (wr.charging) {
          const want = Math.max(this.chargeRelease, need + 0.03);
          if (vis && off < tol && wr.charge >= Math.min(1, want)) return false;       // release: the shot
          if (!vis && this.seeT > 2.2) return false;                                    // gave up waiting
          return true;
        }
        return ready && dist < w.rangeMax * 1.02 && off < tol * 5 && wr.cooldown <= 0;
      }
      case 'splatling': {
        if (wr.streaming) return (vis || this.seeT < 0.4) && off < tol * 3.5 && dist < range * 1.2;
        if (wr.charging) return ready || this.seeT < 0.7;
        return ready && dist < range * 1.1 && off < tol * 4;
      }
      default: {
        if (this.pauseT > 0) return false;
        const burstMax = 0.7 + (this.diff.fireDiscipline ?? 0.8) * 1.4;
        if (this.burstT > burstMax) { this.burstT = 0; this.pauseT = 0.12 + (1 - (this.diff.fireDiscipline ?? 0.8)) * 0.5 + Math.random() * 0.15; return false; }
        const k = w.kind === 'blaster' ? 1.4 : 1;
        return ready && off < tol * k && dist < range * (w.kind === 'blaster' ? 1.0 : 1.08);
      }
    }
  }

  // ------------------------------------------------------------------------------------------ holding a bunker
  // At the anchor (the cover spot) facing the threat: ducked while reloading / hurt, otherwise peek out sideways to a
  // spot that sees the threat, shoot, duck back; leave for the next cover when the hold time runs out.
  _hold(dt, vis, tdist, range) {
    const a = this.a, out = this._mv || (this._mv = new THREE.Vector3());
    out.set(0, 0, 0);
    this.holdT -= dt * (this.threatKnown ? 1 : 1.6) * (vis && tdist > range * 1.1 ? 2 : 1);
    const sp = this.goalSpot;
    const tx = this.threat.x - this.anchor.x, tz = this.threat.z - this.anchor.z;
    const covered = sp ? coverScore(sp.mask, octant(tx, tz)) : 0;
    // cover no longer faces the fight and we're taking hits: find better cover close by
    if (covered === 0 && a.lastDamage < 0.4 && this.repickCd <= 0) { this.repickCd = 2; if (this._pickCover({ maxTravel: 8 })) return this._steer(dt); }
    if (this.holdT <= 0 && !(vis && tdist < range && this.aggr < 1.1 && a.hp > 40)) {
      this.holdT = 1.5;
      if (this._pickCover({ minTravel: 2.5 })) return this._steer(dt);
    }
    const hurt = a.lastDamage < 0.5 && a.hp < 55;
    const duck = covered > 0 && (a.reloading > 0 || hurt || (a.weaponRunner.cooldown > 0.3 && !vis));
    let gx = this.anchor.x, gz = this.anchor.z;
    this.peekT -= dt;
    if (duck) { this.peekPhase = 'duck'; this.peekT = Math.max(this.peekT, 0.35 + Math.random() * 0.4); }
    else if (vis) {
      // shooting: stay where we can see them, drifting a little side to side
      if (this.peekPhase === 'peek' && this.hasPeek) { gx = this.peekPt.x; gz = this.peekPt.z; }
      else { gx = a.pos.x; gz = a.pos.z; }
      this.peekT = Math.max(this.peekT, 0.6);
      if (this.strafeT <= 0) { this.strafeT = 0.5 + Math.random() * 1.0; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeAmp = 0.3 + Math.random() * 0.5; }
      this.strafeS += (this.strafe * this.strafeAmp - this.strafeS) * (1 - Math.exp(-5 * dt));
      const l = Math.hypot(tx, tz) || 1, px = -tz / l, pz = tx / l;
      gx += px * this.strafeS * 0.8; gz += pz * this.strafeS * 0.8;
      // don't drift far off the bunker
      const ox = gx - this.anchor.x, oz = gz - this.anchor.z, ol = Math.hypot(ox, oz);
      if (ol > 2.6) { gx = this.anchor.x + (ox / ol) * 2.6; gz = this.anchor.z + (oz / ol) * 2.6; }
    } else if (this.threatKnown && covered > 0) {
      if (this.peekPhase === 'duck' && this.peekT <= 0) {
        this.peekPhase = 'peek'; this.peekT = 1.2 + Math.random() * 1.6;
        this.hasPeek = this._findPeek();
      } else if (this.peekPhase === 'peek' && this.peekT <= 0) {
        this.peekPhase = 'duck'; this.peekT = 0.5 + Math.random() * 1.1; this.peekSide = -this.peekSide;
      }
      if (this.peekPhase === 'peek' && this.hasPeek) { gx = this.peekPt.x; gz = this.peekPt.z; }
    }
    const dx = gx - a.pos.x, dz = gz - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.2) { const s = Math.min(1, d / 0.7) / d; out.set(dx * s, 0, dz * s); }
    return out;
  }

  // a spot beside the anchor (either side, perpendicular to the threat) that sees the threat point
  _findPeek() {
    const a = this.a, nav = G.nav, A = this.anchor, T = this.threat;
    const tx = T.x - A.x, tz = T.z - A.z, l = Math.hypot(tx, tz) || 1, px = -tz / l, pz = tx / l;
    _v3.set(T.x, T.y + 1.0, T.z);
    for (let s = 0; s < 2; s++) {
      const side = s ? -this.peekSide : this.peekSide;
      for (const off of [0.9, 1.6, 2.3]) {
        const id = nav.nearest(_v.set(A.x + px * side * off, A.y, A.z + pz * side * off), 0.8);
        if (id < 0) continue;
        const n = nav.nodes[id];
        if (Math.abs(n.y - A.y) > 0.5 || Math.hypot(n.x - _v.x, n.z - _v.z) > 0.8) continue;
        if (!G.physics.los(_v2.set(n.x, n.y + 1.25, n.z), _v3)) continue;
        if (!this._fatLos(A.x, A.y, A.z, n.x, n.y, n.z)) break;   // can't get there in a straight step
        this.peekPt.set(n.x, n.y, n.z); this.peekSide = side;
        return true;
      }
    }
    // no side peek: stand tall at the anchor (shooting over a low bunker, if it is one)
    this.peekPt.copy(A);
    return false;
  }

  _arrive() {
    const a = this.a;
    this.mode = 'hold'; this.path = null; this.pathFail = 0;
    const gn = this.goal >= 0 ? G.nav.nodes[this.goal] : null;
    if (gn) this.anchor.set(gn.x, gn.y, gn.z); else this.anchor.copy(a.pos);
    const k = clamp(this.aggr, 0, 1.2) / 1.2;
    this.holdT = (9 - 6.5 * k) * (0.7 + Math.random() * 0.6);
    this.peekPhase = 'duck'; this.peekT = 0.3 + Math.random() * 0.6; this.hasPeek = false;
  }

  // ------------------------------------------------------------------------------------------ cover choice
  // Score every cover spot against the current threat point: shielded from it, at a good distance for the weapon (closer
  // when aggressive), forward / back by aggression, not too far to travel, apart from teammates. Breakout: a spot at
  // this bot's depth and lane, shielded from the enemy base.
  _pickCover(o = {}) {
    const a = this.a, nav = G.nav, L = G.level;
    const spots = nav.coverSpots ? nav.coverSpots() : [];
    if (!spots.length) { this._pathTo(this.threat, 0.6); this.mode = 'move'; return false; }
    const Po = L.spawnPads[a.team], Pe = L.spawnPads[1 - a.team];
    const axx = Pe.x - Po.x, axz = Pe.z - Po.z, len2 = axx * axx + axz * axz || 1, len = Math.sqrt(len2);
    const T = o.breakout ? Pe : this.threat;
    const range = this._range();
    const aggr = this.aggr;
    const prefD = range * (0.9 - 0.5 * clamp(aggr / 1.4, 0, 1));
    const myT = Math.hypot(T.x - a.pos.x, T.z - a.pos.z);
    const maxTravel = o.maxTravel ?? 30, minTravel = o.minTravel ?? 0;
    const cur = this.goalSpot;
    let best = null, bs = -Infinity;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      if (s === cur && minTravel > 0) continue;
      const travel = Math.hypot(s.x - a.pos.x, s.z - a.pos.z);
      if (travel > maxTravel || travel < minTravel) continue;
      if (Math.abs(s.y - a.pos.y) > 3.5) continue;
      const tx = T.x - s.x, tz = T.z - s.z, dT = Math.hypot(tx, tz);
      const k = octant(tx, tz);
      const cs = coverScore(s.mask, k);
      if (cs <= 0) continue;
      let sc = cs * 3 + ((s.tall >> k) & 1 ? 0.8 : 0);
      if (o.breakout) {
        const rx = s.x - Po.x, rz = s.z - Po.z;
        const prog = (rx * axx + rz * axz) / len2;
        const lat = (rx * -axz + rz * axx) / len / 12;      // ~ −1 … 1 across the field
        sc -= Math.abs(prog - this.breakFrac) * 16 + Math.abs(lat - this.lane) * 2.2;
      } else {
        sc -= Math.abs(dT - prefD) * 0.3;
        sc += (myT - dT) * 0.14 * (aggr - 0.45);          // forward when aggressive, back when cautious
        sc -= travel * 0.06;
      }
      for (const mt of G.actors) {
        if (mt === a || mt.team !== a.team || !mt.alive) continue;
        const g = mt.bot && mt.bot.goalSpot;
        if (g && Math.abs(g.x - s.x) < 3.2 && Math.abs(g.z - s.z) < 3.2) sc -= 4;
        else if (Math.abs(mt.pos.x - s.x) < 2 && Math.abs(mt.pos.z - s.z) < 2) sc -= 2;
      }
      sc += Math.random() * 1.4;
      if (sc > bs) { bs = sc; best = s; }
    }
    if (!best) return false;
    this.goalSpot = best; this.goal = best.id;
    this.mode = o.breakout ? 'breakout' : 'move';
    this.pathFail = 0;
    if (!this._pathToNode(best.id)) { this.repath = 0.3; }
    return true;
  }

  // Aggression / what we know. Runs at the think rate.
  _tactics(m) {
    const a = this.a, I = intelOf(m);
    let adv = 0, tl = 99;
    const mine = m.aliveCount(a.team), theirs = m.aliveCount(1 - a.team);
    if (m.elim) { adv = mine - theirs; tl = m.roundTime; }
    else adv = clamp(mine - theirs, -1, 1);
    const noC = Math.min(G.time - I.t[a.team], this.roundT);
    let g = this.pers + 0.3 * adv + (tl < 32 ? 0.45 : 0) + (tl < 16 ? 0.6 : 0) + clamp((noC - 5) / 9, 0, 0.9) - (a.hp < 45 ? 0.3 : 0);
    if (m.elim && theirs === 1 && adv > 0) g += 0.3;        // last one standing: go get them
    this.aggr = g;
    // threat point: our target's last known spot, else the freshest team intel, else a search point on their side
    if (this.target && this.seeT < 6) { this.threat.copy(this.lastSeen); this.threatKnown = true; this.threatAge = this.seeT; }
    else {
      let best = null, bd = Infinity;
      for (const [e, r] of I.seen[a.team]) {
        if (!e.alive || G.time - r.t > 10) continue;
        const d = Math.hypot(r.x - a.pos.x, r.z - a.pos.z) + (G.time - r.t) * 1.5;
        if (d < bd) { bd = d; best = r; }
      }
      if (best) { this.threat.set(best.x, best.y, best.z); this.threatKnown = true; this.threatAge = G.time - best.t; }
      else {
        this.threatKnown = false;
        if (this.roundT < 10) this.threat.copy(G.level.spawnPads[1 - a.team]);
        else {
          // hunting: sweep search points (cover spots on their side); a new one once it's reached or seen
          if (!this.hasSearch || Math.hypot(this.search.x - a.pos.x, this.search.z - a.pos.z) < 4 || (this.searchT -= 0.15) <= 0) this._pickSearch();
          this.threat.copy(this.search);
        }
      }
    }
    // grenades: at someone hiding behind cover at medium range (or only showing their head over it)
    const tgt = this.target;
    if (!this.lob && this.bombCd <= 0 && a.grenades > 0 && !a.sprinting && ((tgt && tgt.alive) || (this.threatKnown && this.threatAge < 5))) {
      const live = tgt && tgt.alive;
      const P = live ? (this.visible ? tgt.pos : this.lastSeen) : this.threat;
      const d = Math.hypot(P.x - a.pos.x, P.z - a.pos.z);
      const hidden = live ? !this.visible && this.seeT > 0.3 && this.seeT < 6 : true;
      const slow = live && this.visible && Math.hypot(tgt.vel.x, tgt.vel.z) < 1.5;
      if (d > 4 && d < 11.5 && (hidden || (this.visible && (this.headOnly || slow))) && Math.random() < 0.3 + 0.4 * (this.diff.fireDiscipline ?? 0.8)) {
        this._startLob('sub', P, d, SUB.bomb.throwSpeed, hidden);
        this.bombCd = 5 + Math.random() * 5;
      }
    }
    // storm beacon special: onto whoever we know about in reach
    if (!this.lob && a.specialReady() && a.weapon.special === 'storm' && this.specialCd <= 0 && this.threatKnown && this.threatAge < 5) {
      const d = Math.hypot(this.threat.x - a.pos.x, this.threat.z - a.pos.z);
      if (d > 4 && d < 15) { this._startLob('special', this.threat, d, SPECIALS.storm.throwSpeed || 16, false); this.specialCd = 3; }
    }
  }

  _pickSearch() {
    const a = this.a, L = G.level, spots = G.nav.coverSpots ? G.nav.coverSpots() : [];
    const Po = L.spawnPads[a.team], Pe = L.spawnPads[1 - a.team];
    const axx = Pe.x - Po.x, axz = Pe.z - Po.z, len2 = axx * axx + axz * axz || 1;
    this.searchT = 7 + Math.random() * 5; this.hasSearch = true;
    for (let i = 0; i < 24 && spots.length; i++) {
      const s = spots[(Math.random() * spots.length) | 0];
      const prog = ((s.x - Po.x) * axx + (s.z - Po.z) * axz) / len2;
      if (prog < 0.4 || prog > 0.92) continue;
      if (Math.hypot(s.x - a.pos.x, s.z - a.pos.z) < 6) continue;
      this.search.set(s.x, s.y, s.z);
      return;
    }
    this.search.copy(Pe);
  }

  // aim a throw at P (horizontal distance d): the throw pitch is aimPitch + 0.28 (weapons.js throwVelocity), launched
  // from 1.35 m with +1.5 m/s up; grenades bounce, so aim a little short. `high` = lob it over cover.
  _startLob(kind, P, d, speed, high) {
    const a = this.a;
    const dd = kind === 'sub' ? Math.max(2, d - 0.7) : d;
    const dy = P.y - (a.pos.y + 1.35);
    const reach = (p) => {
      const vh = speed * Math.cos(p);
      if (vh < 0.5) return -1e3;
      const t = dd / vh;
      if (kind === 'special' && t > 1.1) return -1e3;       // the beacon pops at 1.1 s in the air
      return (speed * Math.sin(p) + 1.5) * t - 0.5 * BOMB_G * t * t;
    };
    let pitch = null;
    if (high) { for (let p = 1.1; p > 0.2; p -= 0.04) if (reach(p) >= dy) { pitch = p; break; } }
    if (pitch === null) for (let p = -0.3; p < 1.1; p += 0.04) if (reach(p) >= dy) { pitch = p; break; }
    if (pitch === null) pitch = 0.75;
    this.lobPt.copy(P);
    this.lob = { kind, t: 0, pitch: clamp(pitch - 0.28, -1.1, 1.0) };
  }

  _range() {
    const w = this.a.weapon;
    if (w.kind === 'charger') return w.rangeMax * 0.9;
    if (w.kind === 'roller') return 6;
    return w.range || 15;
  }

  _perceive(m) {
    const a = this.a, I = intelOf(m), seen = I.seen[a.team];
    const eye = _v.copy(a.pos); eye.y += 1.3;
    let best = null, bd = Infinity, bestHead = false;
    const aw = this.diff.awareness * (a.weapon.kind === 'charger' ? 1.35 : 1);
    for (const e of G.actors) {
      if (e.team === a.team || !e.alive || e.superJumpState) continue;
      const d = e.pos.distanceTo(a.pos);
      if (d > aw) continue;
      const by = e.pos.y + (e.smoothY || 0);
      let head = false;
      if (!G.physics.los(eye, _v2.set(e.pos.x, by + 0.95, e.pos.z))) {
        if (!G.physics.los(eye, _v2.set(e.pos.x, by + 1.32, e.pos.z))) continue;
        head = true;
      }
      // seen: tell the team
      let r = seen.get(e);
      if (!r) { r = { x: 0, y: 0, z: 0, t: 0 }; seen.set(e, r); }
      r.x = e.pos.x; r.y = e.pos.y; r.z = e.pos.z; r.t = G.time;
      I.t[a.team] = G.time;
      const score = d - (PLAYER.hp - Math.max(0, e.hp)) * 0.06 + (head ? 2 : 0) - (e === this.target ? 3 : 0);
      if (score < bd) { bd = score; best = e; bestHead = head; }
    }
    // shot at: we know where it came from (and turn to face it faster)
    const la = a.lastAttacker;
    if (a.lastDamage < 0.5 && la && la.alive && la.team !== a.team) {
      let r = seen.get(la);
      if (!r) { r = { x: 0, y: 0, z: 0, t: 0 }; seen.set(la, r); }
      r.x = la.pos.x; r.y = la.pos.y; r.z = la.pos.z; r.t = G.time;
      I.t[a.team] = G.time;
      if (!best && (!this.target || this.seeT > 1)) { this.target = la; this.lastSeen.copy(la.pos); this.seeT = 0.5; }
    }
    if (best) {
      if (best !== this.target || this.seeT > 1.5) {
        // (re)acquired: a reaction time (longer when they came from behind), and the first look lands a little off
        const behind = Math.abs(angleDiff(this.aimYaw, Math.atan2(best.pos.x - a.pos.x, best.pos.z - a.pos.z))) > 1.9;
        this.react = this.diff.reaction * (0.7 + Math.random() * 0.6) * (behind ? 1.6 : 1) * (best === this.target ? 0.5 : 1);
        this.acqT = 0; this.acqSignY = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); this.acqSignP = (Math.random() - 0.5) * 1.2;
      }
      this.target = best; this.visible = true; this.seeT = 0; this.headOnly = bestHead;
      this.lastSeen.copy(best.pos);
    } else {
      this.visible = false;
      if (this.target && (this.seeT > 7 || !this.target.alive)) this.target = null;
    }
  }

  _pathToNode(id) {
    const n = G.nav.nodes[id];
    return this._pathTo(_v3.set(n.x, n.y, n.z), 0.4);
  }
  _pathTo(pos, maxUp = 0.8) {
    const nav = G.nav;
    const s = nav.nearest(this.a.pos, 1.2);
    const g = nav.nearest(pos, maxUp);
    this.repath = 0.8 + Math.random() * 0.4;
    if (s < 0 || g < 0) { this.path = null; return false; }
    const p = nav.path(s, g, this.a.team);
    if (!p) { this.path = null; return false; }
    this.path = p; this.pi = Math.min(1, p.length - 1); this.goal = g; this.bestD = Infinity; this.noProg = 0;
    return true;
  }

  // shared by paintball and boss play: the aim spring, the smoothed move command, edge guard, stuck recovery
  _tail(dt, move, wantYaw, wantPitch, aimDist, wantMove) {
    const a = this.a, it = a.intent, w = a.weapon;
    // ---------------- aim: critically-damped spring with a turn-rate cap (flicks accelerate and settle; no twitch)
    const fighting = this.fighting;
    const om = fighting ? (this.diff.aimOmega ?? 13) : 8;
    const maxRate = fighting ? (this.diff.aimTurn ?? 10) : 6;
    wantPitch = clamp(wantPitch, -1.1, 1.0);
    this.aimYawV += (om * om * angleDiff(this.aimYaw, wantYaw) - 2 * om * this.aimYawV) * dt;
    this.aimYawV = clamp(this.aimYawV, -maxRate, maxRate);
    this.aimYaw += this.aimYawV * dt;
    if (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2; else if (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;
    this.aimPitchV += (om * om * (wantPitch - this.aimPitch) - 2 * om * this.aimPitchV) * dt;
    this.aimPitchV = clamp(this.aimPitchV, -maxRate * 0.7, maxRate * 0.7);
    this.aimPitch = clamp(this.aimPitch + this.aimPitchV * dt, -1.1, 1.0);
    a.aimYaw = this.aimYaw; a.aimPitch = this.aimPitch;
    // shots go where the bot is actually aiming (its eye ray at the target's distance), never straight to the target
    {
      const cp = Math.cos(this.aimPitch);
      const d = this.target ? aimDist : 8;
      a.aimPoint.set(a.pos.x + Math.sin(this.aimYaw) * cp * d, a.pos.y + 1.1 + Math.sin(this.aimPitch) * d, a.pos.z + Math.cos(this.aimYaw) * cp * d);
    }

    // ---------------- smooth the move command: heading slews (no twitch at waypoint switches / strafe flips)
    const ml = Math.min(1, move.length());
    if (ml > 0.01) {
      const des = Math.atan2(move.x, move.z);
      const d = angleDiff(this.mvYaw, des);
      if (this.mvMag < 0.05) this.mvYaw = des;
      else if (Math.abs(d) > 2.1) { this.mvYaw = des; this.mvMag *= 0.35; }      // reversal: let the body plant and reverse
      else this.mvYaw += clamp(d, -11 * dt, 11 * dt);
    }
    this.mvMag += (ml - this.mvMag) * (1 - Math.exp(-14 * dt));
    it.move.set(Math.sin(this.mvYaw) * this.mvMag, 0, Math.cos(this.mvYaw) * this.mvMag);
    // edge guard: never steer off a deck into the sea
    if (this.mvMag > 0.05 && a.grounded) this._edgeGuard(a, it.move);
    // stuck recovery, based on progress toward the current waypoint: hop → skip the waypoint → replan
    const trying = this.path && wantMove && !(w.kind === 'charger' && a.weaponRunner.charging);
    if (!trying) this.noProg = 0;
    if (this.noProg > 0.7 && this.jumpCd <= 0 && a.grounded && !this._nearWater(a, 1.2)) { it.jump = true; this.jumpCd = 1.0; }
    if (this.noProg > 1.5 && this.path && this.pi < this.path.length - 1 && !this._skipped) { this.pi++; this._skipped = true; this.bestD = Infinity; }
    if (this.noProg > 2.4) { this.noProg = 0; this._skipped = false; this.path = null; this.goalTimer = 0; this.repath = 0; if (++this.pathFail > 3 && this.mode !== 'boss') this._arrive(); }
    if (this.noProg === 0) this._skipped = false;
    this.stuck = this.noProg;
    if (this._needJump && this.jumpCd <= 0 && a.grounded) { it.jump = true; this.jumpCd = 0.6; this._needJump = false; }
  }

  _pathRemaining() {
    if (!this.path) return 0;
    const n = G.nav.nodes[this.path[this.path.length - 1]];
    return Math.hypot(n.x - this.a.pos.x, n.z - this.a.pos.z);
  }

  _wet(x, z, y) { const gy = G.level.groundHeight(x, z, y + 0.6); return gy === -Infinity || gy < PLAYER.fallDeathY; }
  // ground all the way along a straight walk (samples every 0.45 m)
  _dryLine(x0, y0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.45);
    for (let i = 1; i <= n; i++) { const t = i / n; if (this._wet(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y0)) return false; }
    return true;
  }
  _nearWater(a, r) {
    for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; if (this._wet(a.pos.x + Math.cos(t) * r, a.pos.z + Math.sin(t) * r, a.pos.y)) return true; }
    return false;
  }
  _edgeGuard(a, mv) {
    const m = Math.hypot(mv.x, mv.z); if (m < 1e-4) return;
    const dx = mv.x / m, dz = mv.z / m;
    const look = 0.6 + Math.hypot(a.vel.x, a.vel.z) * 0.17;
    const px = a.pos.x, py = a.pos.y, pz = a.pos.z;
    const bad = (ux, uz) => this._wet(px + ux * 0.45, pz + uz * 0.45, py) || this._wet(px + ux * look, pz + uz * look, py);
    if (!bad(dx, dz)) return;
    for (const ang of [0.8, -0.8, 1.45, -1.45]) {
      const c = Math.cos(ang), s = Math.sin(ang), nx = dx * c + dz * s, nz = -dx * s + dz * c;
      if (!bad(nx, nz)) { mv.set(nx * m, 0, nz * m); return; }
    }
    mv.set(0, 0, 0);
  }

  // body-width line of sight at knee height (centre + both shoulders) so bots never cut corners they can't fit past
  _fatLos(ax, ay, az, bx, by, bz) {
    let dx = bx - ax, dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * 0.34, pz = (dx / l) * 0.34;
    for (const o of [0, 1, -1]) {
      _v.set(ax + px * o, ay + 0.45, az + pz * o); _v2.set(bx + px * o, by + 0.45, bz + pz * o);
      if (!G.physics.los(_v, _v2)) return false;
    }
    return true;
  }

  _steer(dt) {
    const a = this.a, nav = G.nav, out = this._mv || (this._mv = new THREE.Vector3());
    out.set(0, 0, 0);
    if (!this.path || this.pi >= this.path.length) return out;
    // advance waypoints we've reached (generous vertically when dropping down)
    while (this.pi < this.path.length) {
      const n = nav.nodes[this.path[this.pi]];
      const dx = n.x - a.pos.x, dz = n.z - a.pos.z, dy = n.y - a.pos.y;
      if (dx * dx + dz * dz < 0.6 * 0.6 && dy < 0.9 && dy > -1.8) { this.pi++; this.bestD = Infinity; this.noProg = 0; }
      else break;
    }
    if (this.pi >= this.path.length) return out;
    const cur = nav.nodes[this.path[this.pi]];
    const hd = Math.hypot(cur.x - a.pos.x, cur.z - a.pos.z);
    // waypoint is above us and we can't get there from here (slipped off a ledge, got pushed): replan now
    if (a.grounded && cur.y - a.pos.y > 0.9 && hd < 1.2 && nav.edgeType(this.path[Math.max(0, this.pi - 1)], this.path[this.pi]) !== 'jump') {
      this.path = null; this.repath = 0; this.goalTimer = 0;
      return out;
    }
    // look ahead: aim at the furthest waypoint we can walk to in a straight line on this level (re-chosen every
    // ~0.1 s or when the waypoint advances — the probes are the costly part, the heading still updates every frame)
    let ti = this.pi;
    this._laT = (this._laT ?? 0) - dt;
    if (this._laT > 0 && this._laPi === this.pi && this._laPath === this.path && this._laTi < this.path.length) ti = this._laTi;
    else {
      for (let k = this.pi + 1; k < Math.min(this.path.length, this.pi + 7); k++) {
        const n = nav.nodes[this.path[k]];
        if (Math.abs(n.y - a.pos.y) > 0.4) break;
        if (nav.edgeType(this.path[k - 1], this.path[k]) !== 'walk') break;
        if (!this._fatLos(a.pos.x, a.pos.y, a.pos.z, n.x, n.y, n.z)) break;
        if (!this._dryLine(a.pos.x, a.pos.y, a.pos.z, n.x, n.z)) break;   // never cut a corner across water
        ti = k;
      }
      this._laT = 0.1; this._laPi = this.pi; this._laPath = this.path; this._laTi = ti;
    }
    const n = nav.nodes[this.path[ti]];
    out.set(n.x - a.pos.x, 0, n.z - a.pos.z);
    const l = out.length();
    if (l > 0.001) out.multiplyScalar(1 / l);
    // jump edges
    if (this.pi > 0) {
      const et = nav.edgeType(this.path[this.pi - 1], this.path[this.pi]);
      if (et === 'jump' && cur.y - a.pos.y > 0.4 && hd < 1.6) this._needJump = true;
    }
    // separation from teammates (only sideways relative to travel, so it never stalls forward progress)
    for (const o of G.actors) {
      if (o === a || !o.alive) continue;
      const dx = a.pos.x - o.pos.x, dz = a.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.4 * 1.4 && d2 > 1e-4) {
        const d = Math.sqrt(d2), k = (1.4 - d) * 0.7;
        const side = (dx * -out.z + dz * out.x) >= 0 ? 1 : -1;
        const ox = out.x, oz = out.z;
        out.x = ox - oz * side * k; out.z = oz + ox * side * k;
      }
    }
    const l2 = out.length();
    if (l2 > 1) out.multiplyScalar(1 / l2);
    // progress tracking toward the current waypoint (used by the stuck recovery)
    if (hd < this.bestD - 0.2) { this.bestD = hd; this.noProg = 0; } else this.noProg += dt;
    return out;
  }


  // ============================================================================================ Boss Battle
  // One squad vs HULLBREAKER (docs/BOSS.md): spread round its flanks at weapon range, shoot what it exposes (eyes; the
  // belly while it's stunned — everyone piles in), step out of every telegraph (the sweep beam included: there's no
  // diving under it any more), hop the shockwave rings, pop the crablets that come for the squad, reload when low.
  _bossTick(dt) {
    const a = this.a, it = a.intent, w = a.weapon, boss = G.boss, wr = a.weaponRunner;
    it.fire = false; it.sub = false; it.special = false; it.squid = false; it.sprint = false; it.jump = false; it.reload = false;
    this.mode = 'boss';
    if (this.think <= 0) { this.think = 0.12 + Math.random() * 0.1; this._bossPerceive(boss); }
    this.evadeT = (this.evadeT || 0) - dt;
    const th = Object.assign(this._th || (this._th = {}), boss.hz.threat(a.pos.x, a.pos.y, a.pos.z, 1.4));   // (threat() reuses its result)
    // human-ish: a new telegraph takes a reaction time to register, and now and then a ring hop is simply missed
    if (th.level > 0 || th.ringIn >= 0) {
      if (this.thSeen === undefined) { this.thSeen = this.t + this.diff.reaction * (0.5 + Math.random() * 0.9); this.hopMiss = Math.random() < (0.45 - this.diff.fireDiscipline * 0.4); }
      if (this.t < this.thSeen) { th.level = 0; th.ringIn = -1; th.beam = false; th.cover = false; }
    } else this.thSeen = undefined;
    // ---- where to go
    this.goalTimer -= dt; this.repath -= dt;
    const evading = th.level > 0.2;
    if (evading && (this.evadeT <= 0 || !this.path)) { this._bossEvade(boss, th); this.evadeT = 0.45; }
    else if (!evading && this._wasEvading) { this.path = null; this.goalTimer = 0; }
    this._wasEvading = evading;
    if (!evading && (this.goalTimer <= 0 || !this.path || this.pi >= this.path.length || (boss.stunned && !this._rushing))) this._bossGoal(boss);
    const move = this._steer(dt);
    let wantMove = move.lengthSq() > 0.01;
    // ---- aim + fire
    let wantYaw = wantMove ? Math.atan2(move.x, move.z) : a.yaw, wantPitch = -0.1, aimDist = 6;
    const T = this.bTgt;
    this.target = null; this.fighting = false;
    let fire = false;
    if (T) {
      const tp = T.shape ? T.shape.pos : T.pos;
      _v.set(tp.x, tp.y, tp.z);
      _v2.copy(_v); _v2.x -= a.pos.x; _v2.y -= a.pos.y + 1.1; _v2.z -= a.pos.z;
      const dist = Math.hypot(_v2.x, _v2.z);
      T.dist = dist;
      const idealYaw = Math.atan2(_v2.x, _v2.z), idealPitch = Math.atan2(_v2.y, dist);
      aimDist = _v2.length();
      const e = this.diff.aimError * 0.8;
      const acq = Math.exp(-this.acqT / Math.max(0.12, this.diff.reaction * 0.9));
      wantYaw = idealYaw + e * (0.75 * wander(this.t * 1.7 + this.ph1) + 2.4 * acq * this.acqSignY);
      wantPitch = idealPitch + e * 0.6 * (0.75 * wander(this.t * 2.1 + this.ph2) + 1.6 * acq * this.acqSignP);
      this.target = T;
      const range = this._range() + (T.crab ? 0 : T.rad * 0.6);
      // circle-strafe a little while holding position (a squad that stands still gets slammed)
      if (!wantMove && !th.level && w.kind !== 'charger') {
        if (this.strafeT <= 0) { this.strafeT = 0.8 + Math.random() * 1.4; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeAmp = 0.35 + Math.random() * 0.4; }
        this.strafeS += (this.strafe * this.strafeAmp - this.strafeS) * (1 - Math.exp(-4 * dt));
        const nx = _v2.x / Math.max(dist, 0.01), nz = _v2.z / Math.max(dist, 0.01);
        move.set(-nz * this.strafeS, 0, nx * this.strafeS);
        if (dist < 4) move.x -= nx * 0.6, move.z -= nz * 0.6;   // not right under its claws
        wantMove = move.lengthSq() > 0.01;
      }
      const off = Math.hypot(angleDiff(this.aimYaw, idealYaw), this.aimPitch - idealPitch);
      const tol = Math.max(0.05, Math.atan2(T.rad, Math.max(dist, 0.5))) * (this._firing ? 2.4 : 1.5);
      if (T.los) this.seeT = 0;
      this.fighting = !!T.los;
      fire = this._trigger(dt, !!T.los && dist < range * 1.05, off, tol, dist, range);
      if (w.kind === 'charger' && wr.charging) move.multiplyScalar(0.3);
      if (w.kind === 'splatling' && (wr.charging || wr.streaming)) move.multiplyScalar(0.6);
      if (fire && this.bombCd <= 0 && !T.crab && a.grenades > 0 && dist > 5 && dist < 11 && Math.random() < 0.025) {
        this._startLob('sub', _v, dist, SUB.bomb.throwSpeed, false); this.bombCd = 6 + Math.random() * 6;
      }
      // specials: slam from under its claws, the storm cloud onto it
      if (a.specialReady() && !th.level && !T.crab) {
        if (w.special === 'slam' && dist < 5.5) it.special = true;
        if (w.special === 'storm' && dist < 13 && T.los) it.special = true;
      }
    }
    if (this.lob) {
      const L = this.lob; L.t += dt;
      wantYaw = Math.atan2(this.lobPt.x - a.pos.x, this.lobPt.z - a.pos.z); wantPitch = L.pitch; fire = false;
      it.sub = true;
      if (L.t > 0.5) { it.sub = false; this.lob = null; }
    }
    if (fire && a.ammo < (w.ammoPerShot ?? 1)) { fire = false; it.reload = true; }
    it.fire = fire; this._firing = fire;
    // reload: dry, or low while nothing is in the sights
    if (!fire && a.reloading <= 0 && !wr.charging && !wr.streaming && a.ammo < a.ammoMax && (a.ammo < (w.ammoPerShot ?? 1) || (a.ammo / a.ammoMax < 0.3 && !(T && T.los)))) it.reload = true;
    // ---- hop the shockwave; sprint when travelling far with nothing to shoot
    if (th.ringIn >= 0 && th.ringIn < 0.2 && a.grounded && this.jumpCd <= 0 && !this.hopMiss) { it.jump = true; this.jumpCd = 0.5; }
    if (!fire && !wr.charging && !wr.streaming && !this.lob && (this._pathRemaining() > 5 || (evading && this._pathRemaining() > 1.5))) it.sprint = true;
    it.squid = it.sprint;
    this._tail(dt, move, wantYaw, wantPitch, aimDist, wantMove);
  }

  // what to shoot: a crablet that's closing in, else the part of the boss worth hitting that it can see
  _bossPerceive(boss) {
    const a = this.a, eye = _v3.copy(a.pos); eye.y += 1.2;
    let T = null;
    for (const c of boss.crabs.values()) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - a.pos.x, c.z - a.pos.z);
      if (d > 9 || (T && d >= T.dist)) continue;
      if (!G.physics.los(eye, _v.set(c.x, c.y + 0.35, c.z))) continue;
      T = { crab: c, pos: new THREE.Vector3(c.x, c.y + 0.35, c.z), rad: 0.5, dist: d, los: true };
    }
    if (T) { T.pos.set(T.crab.x, T.crab.y + 0.35, T.crab.z); }
    else if (boss.visible && !boss.dead) {
      // keep a chosen spot for a while; the belly (when open) and the eyes are worth 2.5×
      this.shapeT = (this.shapeT || 0) - 0.2;
      const shapes = boss.model.hitShapes.filter((h) => h.active);
      const belly = shapes.find((h) => h.weak && h.socket === 'belly');
      let pick = this.bTgt && !this.bTgt.crab && this.shapeT > 0 && this.bTgt.shape.active ? this.bTgt.shape : null;
      if (belly && pick !== belly) pick = null;
      if (!pick) {
        this.shapeT = 1.2 + Math.random() * 1.5;
        const eyes = this.a.weapon.kind === 'charger' || Math.random() < 0.25 + this.diff.fireDiscipline * 0.3;
        const order = shapes.slice().sort((h1, h2) => {
          const s = (h) => (h === belly ? -100 : h.weak && eyes ? -50 : h.weak ? 10 : 0) + h.pos.distanceTo(eye);
          return s(h1) - s(h2);
        });
        for (const h of order) if (G.physics.los(eye, h.pos)) { pick = h; break; }
        if (!pick) pick = order.find((h) => !h.weak) || null;
      }
      if (pick) {
        const los = G.physics.los(eye, pick.pos);
        T = this.bTgt && this.bTgt.shape === pick ? this.bTgt : { shape: pick, rad: pick.r * 0.85, weak: pick.weak, dist: pick.pos.distanceTo(a.pos) };
        T.los = los;
      }
    }
    const prev = this.bTgt;
    if (T && (!prev || (prev.shape || prev.crab) !== (T.shape || T.crab))) {
      this.react = this.diff.reaction * (0.6 + Math.random() * 0.5);
      this.acqT = 0; this.acqSignY = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); this.acqSignP = (Math.random() - 0.5) * 1.2;
    }
    this.bTgt = T;
  }

  // a spot to fight from: weapon range off its flank (not in front of it — slams, sweeps and charges go that way), clear
  // of the other bots, seeing it. When it's stunned everyone rushes the belly.
  _bossGoal(boss) {
    const a = this.a, w = a.weapon, nav = G.nav;
    this.goalTimer = 2.4 + Math.random() * 2;
    const stunned = boss.stunned || (boss.phase >= 3 && Math.random() < 0.3);
    this._rushing = boss.stunned;
    const fwd = boss.yaw, bx = boss.pos.x, bz = boss.pos.z;
    const reach = w.kind === 'charger' ? 15 : clamp(this._range() * 0.7, 4.5, 11);
    const R = 3.4 + (boss.stunned ? Math.min(reach, 6) : reach);
    let best = -1, bs = -Infinity;
    for (let i = 0; i < 12; i++) {
      // bearing: its front when it's open (belly), else a flank or the rear
      const off = stunned ? (Math.random() - 0.5) * 1.3 : (Math.random() < 0.5 ? 1 : -1) * (0.95 + Math.random() * 1.9);
      const ang = fwd + off, r = R * (0.85 + Math.random() * 0.3);
      _v.set(bx + Math.sin(ang) * r, boss.pos.y + 0.5, bz + Math.cos(ang) * r);
      const id = nav.nearest(_v, 2.5);
      if (id < 0) continue;
      const n = nav.nodes[id];
      if (Math.hypot(n.x - _v.x, n.z - _v.z) > 2.5) continue;
      let s = -Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.08 + Math.random();
      if (boss.hz.threat(n.x, n.y, n.z, 1.5).level > 0) s -= 6;
      if (G.physics.los(_v2.set(n.x, n.y + 1.3, n.z), _v3.set(bx, boss.pos.y + 2.5, bz))) s += 3;
      for (const m of G.actors) {
        if (m === a || !m.bot || !m.alive || m.bot.goal < 0) continue;
        const g = nav.nodes[m.bot.goal];
        if (g && Math.hypot(g.x - n.x, g.z - n.z) < 4) s -= 2.5;
      }
      if (s > bs) { bs = s; best = id; }
    }
    if (best < 0) { this.path = null; return; }
    const n = nav.nodes[best];
    this._pathTo(_v.set(n.x, n.y, n.z), 1.0);
  }

  // out of a telegraph: the reachable spot nearby with the least danger, biased along the escape direction
  _bossEvade(boss, th) {
    const a = this.a, nav = G.nav;
    let best = -1, bs = -Infinity;
    for (let i = 0; i < 12; i++) {
      const ang = Math.atan2(th.ax, th.az) + (Math.random() - 0.5) * 2.4, r = 3 + Math.random() * 5;
      _v.set(a.pos.x + Math.sin(ang) * r, a.pos.y, a.pos.z + Math.cos(ang) * r);
      const id = nav.nearest(_v, 1.2);
      if (id < 0) continue;
      const n = nav.nodes[id];
      const t = boss.hz.threat(n.x, n.y, n.z, 1.6);
      const s = -t.level * 8 - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.25 + (Math.sin(ang) * th.ax + Math.cos(ang) * th.az) * 1.5 + Math.random() * 0.5;
      if (s > bs) { bs = s; best = id; }
    }
    if (best < 0) return;
    const n = nav.nodes[best];
    this._pathTo(_v.set(n.x, n.y, n.z), 1.0);
    this.goalTimer = 0.8;
  }
}
