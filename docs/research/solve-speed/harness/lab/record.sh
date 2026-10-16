#!/bin/sh
# Plays each listed method on each fight on the real pool, recording the tree as it goes.
# usage: record.sh <trees-dir> <workers> <fight>... -- <method>...
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
trees=$1; workers=$2; shift 2
fights=""
while [ "$1" != "--" ]; do fights="$fights $1"; shift; done
shift
for f in $fights; do
  for m in "$@"; do
    out="$here/../../runs/lab/$f"
    mkdir -p "$out"
    name=$(echo "$m" | tr ':,=' '__-')
    echo "$(date '+%H:%M:%S') $f $m load $(sysctl -n vm.loadavg)" >> "$out/../record.log"
    node "$here/run.ts" --fight "$repo/src/solver/fixtures/$f.json" --tree "$trees/$f" --method "$m" --workers "$workers" \
      --out "$out/$name.json" 2> "$out/$name.log" | tail -1 >> "$out/../record.log"
    echo "$(date '+%H:%M:%S') done, load $(sysctl -n vm.loadavg)" >> "$out/../record.log"
  done
done
