#!/bin/sh
# One worker, the same recorded fork points, with each patch in turn (none first); checks every child against the tree.
# usage: bench-patch.sh <fight> <trees-dir> <out-dir> <forks> [patch-file[:poll-ms]]...
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../.." && pwd)
fight=$1; trees=$2; out=$3; forks=$4; shift 4
cd "$repo"
echo "load $(sysctl -n vm.loadavg 2>/dev/null || cat /proc/loadavg)"
node "$here/profile.ts" "src/solver/fixtures/$fight.json" "$trees/$fight" "$out/none" "$forks" 2>/dev/null | tail -1
for p in "$@"; do
  file=${p%%:*}; poll=${p#*:}; [ "$poll" = "$p" ] && poll=""
  POLL_MS=$poll PATCH="$here/patches/$file" node "$here/profile.ts" "src/solver/fixtures/$fight.json" "$trees/$fight" "$out/$file-$poll" "$forks" 2>/dev/null | tail -1
done
echo "load $(sysctl -n vm.loadavg 2>/dev/null || cat /proc/loadavg)"
