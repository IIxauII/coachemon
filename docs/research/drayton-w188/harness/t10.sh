#!/bin/sh
# usage: t10.sh <out.json>   — runs t10.test.ts once in the shared pinned clone under a unique name, always removes it.
# vitest exits 1 on Node >= 25 whatever happened (the clone's i18n rejection): read the output file, not the exit code.
HERE=$(cd "$(dirname "$0")" && pwd)
C=/Users/xau/Documents/projects/coachemon/.cache/pokerogue/v1.12.0.11
TAG=t10-$$-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')
TEST=$C/test/tests/zz-$TAG.test.ts
trap 'rm -f "$TEST"' EXIT INT TERM
cp "$HERE/t10.test.ts" "$TEST"
cd "$C" && T10_SESSION="$HERE/../session-w188.json" T10_OUT="$1" ./node_modules/.bin/vitest run "test/tests/zz-$TAG.test.ts" > "$1.log" 2>&1
tail -5 "$1.log"
