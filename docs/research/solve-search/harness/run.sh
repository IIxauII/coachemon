#!/bin/sh
# usage: run.sh <log>   (env: SS_MODE, SS_SESSION, SS_DIR or SS_JOB+SS_OUT; SS_CLONE overrides the pinned clone)
# Copies solve.test.ts into the shared pinned clone under a unique name, runs it once, and always removes it again.
# vitest exits 1 on Node >= 25 whatever happened (the clone's own i18n rejection): read results, never the exit code.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
C=${SS_CLONE:-/Users/xau/Documents/projects/coachemon/.cache/pokerogue/v1.12.0.11}
TAG=ss-$$-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')
TEST=$C/test/tests/zz-$TAG.test.ts
trap 'rm -f "$TEST"' EXIT INT TERM
cp "$HERE/solve.test.ts" "$TEST"
cd "$C" && ./node_modules/.bin/vitest run "test/tests/zz-$TAG.test.ts" > "$1" 2>&1
