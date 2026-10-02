#!/bin/sh
# Build dist/ and publish it to Cloudflare Pages (project "inkwave"). Needs a one-time `npx wrangler login`.
# usage: tools/release-pages.sh
set -e
cd "$(dirname "$0")/.."
python3 tools/build-dist.py
STAGE=$(mktemp -d /private/tmp/inkwave-pages.XXXXXX)
# Pages serves everything in the folder: leave out the Vercel link files
rsync -a --exclude '.vercel' --exclude 'vercel.json' dist/ "$STAGE/"
# cache headers: dist/_headers (written by build-dist.py): html + app JS/CSS revalidate (cheap 304s), vendor/fonts/lightmaps immutable
test -f "$STAGE/_headers" || { echo "dist/_headers missing" >&2; exit 1; }
# run from the staging folder so no repo-level wrangler config gets picked up
cd "$STAGE"
npx --yes wrangler@4 pages project create inkwave --production-branch main --force 2>&1 | tail -2 || true
npx --yes wrangler@4 pages deploy . --force --project-name inkwave --branch main --commit-dirty=true
