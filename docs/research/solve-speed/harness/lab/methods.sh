#!/bin/sh
# The other search methods on one fight, each on the real (patched) pool where the tree lacks a turn.
# usage: PATCH=<file> methods.sh <trees-dir> <fight> <workers> <method>...
# A method's budget: 3,000 per beam for `iw` (as the portfolio's beams), 9,000 tries in all for `lds` and `bf`.
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
trees=$1; f=$2; w=$3; shift 3
out="$here/../../runs/lab/methods/$f"
mkdir -p "$out"
for m in "$@"; do
  case $m in iw*) b=3000 ;; *) b=9000 ;; esac
  name=$(echo "$m" | tr ':,=' '__-')
  echo "$(date '+%H:%M:%S') $f $m load $(sysctl -n vm.loadavg)" >> "$out/../methods.log"
  node "$here/run.ts" --fight "$repo/src/solver/fixtures/$f.json" --tree "$trees/$f" --method "$m" --workers "$w" \
    --budget "$b" --out "$out/$name.json" 2> "$out/$name.log" | tail -1 >> "$out/../methods.log"
done
