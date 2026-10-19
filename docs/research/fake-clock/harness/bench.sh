#!/bin/sh
# The per-try bench on one recorded tree: unpatched first (the reference every other run is compared with, job by job),
# then each variant, with the load logged around each.
# usage: bench.sh <tree-dir> <out-dir> <forks> <variant>...
# variants: none | poll1 | fake50 | fake | fakevitest | spin
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../.." && pwd)
tree=$1; out=$2; forks=$3; shift 3
cd "$repo"
FC="$here/patches/fake-clock.ts"
SPIN="$repo/docs/research/solve-speed/harness/patches/spin.ts"
run() {
  name=$1; shift
  echo "$(date '+%H:%M:%S') $name load $(sysctl -n vm.loadavg)"
  env "$@" REF="$out/none/jobs.json" node "$here/profile.ts" src/solver/fixtures/gordie-w180.json "$tree" "$out/$name" "$forks" 2>/dev/null | tail -1
}
[ -f "$out/none/jobs.json" ] || { echo "$(date '+%H:%M:%S') none load $(sysctl -n vm.loadavg)"; MODE=none node "$here/profile.ts" src/solver/fixtures/gordie-w180.json "$tree" "$out/none" "$forks" 2>/dev/null | tail -1; }
for v in "$@"; do
  case $v in
    none) ;;
    poll1) run poll1 MODE=poll1 ;;
    fake50) run fake50 MODE=none PATCH="$FC" ;;
    fake) run fake MODE=poll1 PATCH="$FC" ;;
    fakevitest) run fakevitest MODE=poll1 PATCH="$FC" FAKE_CLOCK_IMPL=vitest ;;
    spin) run spin MODE=none PATCH="$SPIN" CLOCK=1 ;;
    *) echo "no variant $v" ;;
  esac
done
echo "$(date '+%H:%M:%S') done load $(sysctl -n vm.loadavg)"
