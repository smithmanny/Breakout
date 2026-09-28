#!/bin/sh
# Boot the game, play 8 s on autopilot, report state + any console errors. Exit 1 on errors.
cd "$(dirname "$0")/.."
# (Linux runs Chromium on software GL: the Low preset keeps it from crawling / losing the WebGL context)
LOW=$([ "$(uname)" = Darwin ] || echo --low)
OUT=$(node tools/play.mjs "http://localhost:8490/?autostart=60&autopilot&shadercheck" '[{"until":"window.__inkwave && __inkwave.match && __inkwave.match.state===\"playing\" && __inkwave.match.local && !__inkwave.match.attract","untilMs":480000},{"wait":8000},{"eval":"JSON.stringify({state:__inkwave.match.state,t:+__inkwave.match.time.toFixed(1),boot:__inkwave.bootMs,fps:__inkwave.fps,perf:__inkwave.perf,round:__inkwave.match.round,phase:__inkwave.match.roundPhase,roundWins:__inkwave.match.roundWins,alive:[__inkwave.match.aliveCount(0),__inkwave.match.aliveCount(1)],elims:__inkwave.match.actors.map(a=>a.stats.splats),dmg:__inkwave.match.actors.map(a=>Math.round(a.stats.damage||0))})","log":"smoke"}]' $LOW 2>&1)
echo "$OUT" | grep -v "Failed to fetch\|404\|preload"
echo "$OUT" | grep -qiE "\[error\]|pageerror|until timeout|eval error" && { echo "SMOKE FAIL"; exit 1; }
echo "$OUT" | grep -q "smoke ->" || { echo "SMOKE FAIL (no result — is the dev server on :8490 up?)"; exit 1; }
echo "SMOKE OK"
