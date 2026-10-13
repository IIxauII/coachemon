#!/bin/sh
# usage: run.sh <scripts.json> <out.json> [--no-hud]
# Env: G638_SESSION (default: the W180 T1 export in $G638_KIT/sim), G638_CLONE (default: <repo>/.cache/pokerogue/v1.12.0.11).
# Copies hud-vs-engine.test.ts into the shared pinned clone under a unique name and always removes it again.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
C=${G638_CLONE:-$ROOT/.cache/pokerogue/v1.12.0.11}
SESSION=${G638_SESSION:?set G638_SESSION to the W180 T1 session export}
SCRIPT=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
OUT=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
TAG=638-$$-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')
TEST=$C/test/tests/zz-g$TAG.test.ts
BUNDLE=
if [ "${3:-}" != "--no-hud" ]; then
  BUNDLE=${TMPDIR:-/tmp}/g$TAG.bundle.js
  node "$HERE/make-bundle.mjs" "$BUNDLE" || exit 2
fi
trap 'rm -f "$TEST" ${BUNDLE:+"$BUNDLE"}' EXIT INT TERM
cp "$HERE/hud-vs-engine.test.ts" "$TEST"
LOG=${OUT%.json}.log
(cd "$C" && G638_SESSION=$SESSION G638_SCRIPT=$SCRIPT G638_OUT=$OUT G638_BUNDLE=$BUNDLE \
  npx --yes pnpm@10.33.2 exec vitest run "test/tests/zz-g$TAG.test.ts" > "$LOG" 2>&1)
rc=$?
tail -6 "$LOG"
# The clone's own i18n rejection makes vitest exit 1 on every run (#632): read the result from $OUT.
exit $rc
