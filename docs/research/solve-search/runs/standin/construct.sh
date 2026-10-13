#!/bin/sh
# usage: construct.sh <out.json> <log> [waves]   — runs construct.test.ts once in the shared pinned clone, as run.sh does,
# and always removes the copy again. Read <out.json>, never vitest's exit code.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
C=${SS_CLONE:-/Users/xau/Documents/projects/coachemon/.cache/pokerogue/v1.12.0.11}
TAG=sc-$$-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')
TEST=$C/test/tests/zz-$TAG.test.ts
trap 'rm -f "$TEST"' EXIT INT TERM
if [ -n "${SS_HEAP_MB:-}" ]; then
  NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=$SS_HEAP_MB"
  export NODE_OPTIONS
fi
OUT=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
LOG=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
cp "$HERE/construct.test.ts" "$TEST"
cd "$C" && SC_SESSION=${SC_SESSION:-$HERE/../../session-w180.json} SC_OUT=$OUT SC_WAVES=${3:-182,184,186} \
  ./node_modules/.bin/vitest run "test/tests/zz-$TAG.test.ts" > "$LOG" 2>&1
