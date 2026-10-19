#!/bin/sh
# poll1 and the fake clock under V8's CPU profiler on the 30-fork bench, back to back, each summarised by prof.py from its
# first job on. The fake clock's run also writes its driver's counts (FAKE_STATS_OUT).
# usage: cpu.sh <tree-dir> <scratch-dir>
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../.." && pwd)
tree=$1; s=$2
out="$here/../runs/profile"
cd "$repo"
for v in poll1 fake; do
  patch=""; [ "$v" = fake ] && patch="$here/patches/fake-clock.ts"
  echo "$(date '+%H:%M:%S') cpu $v load $(sysctl -n vm.loadavg)"
  PROF=1 MODE=poll1 PATCH=$patch FAKE_STATS_OUT="$s/cpu-$v.stats" node "$here/profile.ts" src/solver/fixtures/gordie-w180.json "$tree" "$s/cpu-$v" 30 2>/dev/null | tail -1
  cp "$s/cpu-$v/jobs.json" "$out/cpu-$v-30forks.jobs.json"
  # The patch is spliced in right after the template's vitest import (mode.ts).
  from=$(($(grep -n '^import { beforeAll, describe, it, vi } from "vitest";$' src/solver/harness.test.ts.template | cut -d: -f1) + 1))
  lines=""; [ -n "$patch" ] && lines="--patch-lines $from-$((from + $(wc -l < "$patch") - 1))"
  python3 -I "$here/prof.py" "$(ls -S "$s/cpu-$v"/*.cpuprofile | head -1)" 40 $lines > "$out/cpu-$v-30forks.txt"
done
cat "$s"/cpu-fake.stats.* > "$out/cpu-fake-30forks.stats.json" 2>/dev/null
echo "$(date '+%H:%M:%S') done load $(sysctl -n vm.loadavg)"
