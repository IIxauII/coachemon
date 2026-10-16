#!/bin/sh
# The laptop VM's runs after the shipped baselines: the patched solves, then throughput by worker count.
# Runs inside the VM's solver container.
set -u
here=$(dirname "$0")
P="$here/patches/poll1.ts"
for f in drayton:drayton-w188 gordie:gordie-w180 kieran:kieran-w190; do
  PATCH=$P sh "$here/laptop.sh" "${f%%:*}-poll1" "src/solver/fixtures/${f#*:}.json"
done
for w in 1 2 3 4; do
  BUDGET=100 sh "$here/laptop.sh" "scale-unpatched-w$w" src/solver/fixtures/gordie-w180.json "$w"
done
for w in 1 2 3 4; do
  BUDGET=300 PATCH=$P sh "$here/laptop.sh" "scale-poll1-w$w" src/solver/fixtures/gordie-w180.json "$w"
done
