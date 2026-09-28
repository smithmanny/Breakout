// BREAKOUT — match audio director (docs/PAINTBALL.md). Subscribes to the round / elimination / reload events on the
// ctx bus and plays the referee + paintball sounds from src/audio/audio.js, and runs the paintball-field soundscape
// (picks the ambience per stage, schedules distant markers / sideline chatter on the field).
//   installMatchAudio(engine)   idempotent; audio.init() calls it (browser only).
// Harbour stages: a stage whose layout declares `ambience: 'harbour'` (or one of HARBOUR_STAGES) keeps the sea bed.
import { on, G } from '../core/ctx.js';

const HARBOUR_STAGES = new Set(['halyard', 'harbor', 'harbour', 'marina']);
const REF_RANGE = 26;          // m: eliminations further than this from the listener (and not involving us) get no call
let installed = false;

export function installMatchAudio(engine) {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const A = () => G.audio || engine;
  const play = (n, o) => { try { return A()?.play(n, o); } catch (e) { return null; } };
  const timers = new Set();
  const later = (s, fn) => { const id = setTimeout(() => { timers.delete(id); try { fn(); } catch (e) { /* */ } }, s * 1000); timers.add(id); };
  const pos3 = (p, dy = 0) => (p && Number.isFinite(p.x) ? { x: p.x, y: p.y + dy, z: p.z } : undefined);
  const listenerDist = (p) => { const a = A(); return a && a._dist && p ? a._dist(p) : Infinity; };
  const near = (actor, r = 22) => !!actor && (actor.isLocal || actor._nearCamera?.() || listenerDist(actor.pos) < r);
  const live = () => { const m = G.match; return !!(m && !m.attract); };
  const localTeam = () => G.local?.team ?? G.match?.local?.team ?? 0;
  const safe = (fn) => (e) => { try { fn(e || {}); } catch (err) { console.warn('[matchAudio]', err); } };

  // ---- rounds
  on('round:start', safe(() => { if (!live()) return; play('whistle_start', { volume: 0.9 }); }));
  on('round:end', safe((e) => {
    if (!live()) return;
    const timeUp = e.reason === 'time';
    if (timeUp) play('buzzer', { volume: 0.8 });
    later(timeUp ? 0.55 : 0, () => play('whistle_end', { volume: 0.9 }));
    const w = e.winner;
    if (w === 0 || w === 1) {
      const won = w === localTeam();
      later(timeUp ? 1.45 : 0.95, () => {
        play(won ? 'round_win' : 'round_lose', { volume: 0.85 });
        if (won) play('crowd_cheer', { volume: 0.55 });
        A()?.duck?.(0.4, 1.4);
      });
    }
  }));

  // ---- eliminations: the ref calls "OUT!" near the victim (only when it's close or involves us, so it never spams)
  let lastOut = 0;
  on('eliminated', safe((e) => {
    const v = e.victim, at = e.attacker;
    if (!v || !live()) return;
    const mine = v.isLocal || (at && at.isLocal);
    const p = pos3(v.pos, 1.2);
    const d = listenerDist(p);
    if (!mine && d > REF_RANGE) return;
    if (d < REF_RANGE * 1.5) play('splat_big', { pos: p, volume: v.isLocal ? 0.45 : 0.55 });
    const t = performance.now() / 1000;
    if (!mine && t - lastOut < 0.9) return;
    lastOut = t;
    // the ref stands off to the side of the play: offset the call a few metres so it doesn't sit inside the player
    const rp = p && { x: p.x + 3, y: p.y + 0.6, z: p.z + 2 };
    later(0.18, () => play('ref_out', { pos: rp, volume: mine ? 1 : 0.75, pitch: 0.94 + Math.random() * 0.14 }));
  }));

  // ---- hopper / reload
  on('reload:start', safe((e) => {
    const a = e.actor;
    if (!near(a)) return;
    const dur = Number.isFinite(a.reloading) && a.reloading > 0 ? a.reloading : undefined;
    play('reload_pod', { pos: a.isLocal ? undefined : pos3(a.pos, 1), volume: a.isLocal ? 0.8 : 0.5, dur });
  }));
  let dryT = 0;
  on('weapon:dry', safe((e) => {
    const a = e.actor;
    if (!a || !a.isLocal) return;
    const eng = A(), t = performance.now() / 1000;
    // weapons.js may still play 'empty_click' on the same trigger pull: don't double it
    const lastEmpty = eng?.last?.get?.('empty_click');
    if (lastEmpty !== undefined && eng.ctx && eng.ctx.currentTime - lastEmpty < 0.15) return;
    if (t - dryT < 0.12) return;
    dryT = t;
    play('dry_fire', { volume: 0.8 });
  }));
  on('bomb:throw', safe((e) => { const a = e.actor; if (a && a.isLocal) play('grenade_pin', { volume: 0.55 }); }));
  // sprinting: the loader rattles on every other foot plant
  on('actor:footstep', safe((e) => {
    const a = e.actor;
    if (!a || !a.sprinting || !a.alive) return;
    a._rattleN = (a._rattleN || 0) + 1;
    if (a._rattleN & 1) return;
    if (!a.isLocal && !(listenerDist(a.pos) < 12)) return;
    play('hopper_rattle', { pos: a.isLocal ? undefined : pos3(a.pos, 1.1), volume: a.isLocal ? 0.45 : 0.35 });
  }));

  // ---- stage ambience + field soundscape (distant games on other fields, sideline chatter)
  const st = { markT: 6 + Math.random() * 8, chatT: 10 + Math.random() * 10 };
  let lastTick = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = Math.min(2, (now - lastTick) / 1000);
    lastTick = now;
    const eng = A();
    if (!eng || !eng.ctx) return;
    const lay = G.level?.layout;
    const kind = lay && (lay.ambience === 'harbour' || lay.ambience === 'harbor' || (!lay.ambience && HARBOUR_STAGES.has(lay.id))) ? 'harbour' : 'field';
    eng.setAmbience?.(kind);
    if (kind !== 'field' || G.mode !== 'match' || document.hidden) return;
    const B = G.level?.bounds;
    const far = (r, y) => {
      const a = Math.random() * Math.PI * 2, ex = B ? Math.max(Math.abs(B.maxX), Math.abs(B.minX)) : 40, ez = B ? Math.max(Math.abs(B.maxZ), Math.abs(B.minZ)) : 40;
      return { x: Math.cos(a) * (ex + r), y, z: Math.sin(a) * (ez + r) };
    };
    if ((st.markT -= dt) <= 0) {
      st.markT = 9 + Math.random() * 16;
      play('distant_markers', { pos: far(55 + Math.random() * 40, 2), volume: 0.6 + Math.random() * 0.4, pitch: 0.85 + Math.random() * 0.3 });
    }
    if ((st.chatT -= dt) <= 0) {
      st.chatT = 14 + Math.random() * 20;
      play('distant_chatter', { pos: far(20 + Math.random() * 15, 1.5), volume: 0.7 + Math.random() * 0.3 });
    }
  }, 250);
}
