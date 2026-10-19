#!/bin/sh
# The whole-search measurements, poll1 and the fake clock back to back, 3 workers, the load logged around each run:
# 1. Gordie's 8@0.5 beam on an empty tree, each variant (does the fake clock retrace the unpatched recording?);
# 2. the shipped solve on each fight, in the order poll1, fake, fake, poll1, every win replayed unpatched.
# usage: batch.sh <scratch-dir> [beam] [solve]
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../.." && pwd)
scratch=$1; shift
runs="$here/../runs"
FC="$here/patches/fake-clock.ts"
cd "$repo"
mkdir -p "$runs/lab" "$runs/solve"
for stage in "$@"; do
  # beam2 runs the pair again, in the other order.
  if [ "$stage" = beam ] || [ "$stage" = beam2 ]; then
    order="poll1 fake"; sfx=""
    [ "$stage" = beam2 ] && { order="fake poll1"; sfx="-2"; }
    for v in $order; do
      patch=""; [ "$v" = fake ] && patch=$FC
      echo "$(date '+%H:%M:%S') beam $v load $(sysctl -n vm.loadavg)"
      MODE=poll1 PATCH=$patch node "$here/lab-run.ts" \
        --fight src/solver/fixtures/gordie-w180.json --tree "$scratch/beam-$v$sfx/gordie-w180" --method beam:8:0.5 --workers 3 \
        --out "$runs/lab/gordie-w180-beam_8_0.5-$v$sfx.json" 2> "$runs/lab/gordie-w180-beam_8_0.5-$v$sfx.log" | tail -1
    done
  fi
  if [ "$stage" = solve ]; then
    for f in gordie-w180 drayton-w188 kieran-w190; do
      n=0
      for v in poll1 fake fake poll1; do
        n=$((n + 1))
        patch=""; [ "$v" = fake ] && patch=$FC
        out="$runs/solve/$f-$n-$v"
        rm -f "$out.progress.jsonl"
        echo "$(date '+%H:%M:%S') solve $f $n $v load $(sysctl -n vm.loadavg)"
        MODE=poll1 PATCH=$patch node "$here/solve.ts" "src/solver/fixtures/$f.json" "$repo/.cache/pokerogue/v1.12.1.2" "$out.progress.jsonl" 3 \
          2> "$out.log" | tail -1 | tee "$out.json"
      done
    done
  fi
done
echo "$(date '+%H:%M:%S') done load $(sysctl -n vm.loadavg)"
