#!/bin/sh
# The laptop VM's runs, with the game tab up: the shipped solve on each fight, the same with the poll patch, then
# throughput by worker count with the frame probe (frames.ts) beside it. Runs inside the VM's solver container, from
# the repo root, after setup-clone.ts has put the pinned game's clone in /home/coach/clone.
set -u
here=$(dirname "$0")
P="$here/patches/poll1.ts"
for f in gordie:gordie-w180 drayton:drayton-w188 kieran:kieran-w190; do
  sh "$here/laptop.sh" "${f%%:*}" "src/solver/fixtures/${f#*:}.json"
done
for f in drayton:drayton-w188 gordie:gordie-w180 kieran:kieran-w190; do
  PATCH=$P sh "$here/laptop.sh" "${f%%:*}-poll1" "src/solver/fixtures/${f#*:}.json"
done
node "$here/frames.ts" "$here/../runs/laptop/frames.jsonl" &
probe=$!
sleep 60
for w in 1 2 3 4 6; do
  BUDGET=100 sh "$here/laptop.sh" "scale-unpatched-w$w" src/solver/fixtures/gordie-w180.json "$w"
done
for w in 1 2 3 4 6; do
  BUDGET=300 PATCH=$P sh "$here/laptop.sh" "scale-poll1-w$w" src/solver/fixtures/gordie-w180.json "$w"
done
kill "$probe"
