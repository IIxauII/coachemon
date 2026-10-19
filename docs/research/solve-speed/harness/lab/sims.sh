#!/bin/sh
# The portfolio's scheduling variants, simulated over a fight's recorded tree (no game): every try costs the same
# fake time, so the tries to the first win reflect each policy's interleaving on <workers> workers.
# usage: sims.sh <trees-dir> <fight> <workers> [tau-ms=2]
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
trees=$1; f=$2; w=$3; tau=${4:-2}
out="$here/../../runs/lab/sims/$f-w$w"
mkdir -p "$out"
for m in portfolio:fair portfolio:fair:early portfolio:priority portfolio:priority:early \
  portfolio:priority:order=1,0,2 portfolio:priority:order=2,0,1 portfolio:priority:early:order=2,0,1; do
  for share in "" "--share"; do
    name=$(echo "$m$share" | tr ':,=' '__-')
    node "$here/run.ts" --fight "$repo/src/solver/fixtures/$f.json" --tree "$trees/$f" --method "$m" --workers "$w" \
      --sim "$tau" $share --out "$out/$name.json" 2> "$out/$name.log" | tail -1
  done
done
