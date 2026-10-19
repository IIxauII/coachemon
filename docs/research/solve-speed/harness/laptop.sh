#!/bin/sh
# One shipped solve inside the laptop VM's container, with the machine sampled beside it, on the pinned game's clone.
# usage: laptop.sh <run-name> <export.json> [workers] ; BUDGET=<n> for a short run
set -u
here=$(dirname "$0")
out="$here/../runs/laptop/$1"
version=$(node -p 'require("./src/escape-ladder/reviewed.json").pinned.gameVersion')
mkdir -p "$out"
rm -f "$out/progress.jsonl" "$out/mem.jsonl"
node "$here/solve-shipped.ts" "$2" "/home/coach/clone/v$version/game" "$out/progress.jsonl" ${3:-} > "$out/summary.json" 2> "$out/stderr.txt" &
pid=$!
node "$here/sample.ts" "$pid" "$out/mem.jsonl" 2 &
wait "$pid"
wait
cat "$out/summary.json"
