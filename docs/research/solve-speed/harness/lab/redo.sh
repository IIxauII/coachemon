#!/bin/sh
# Every lab measurement again, on whichever game version is pinned: the portfolio's beams recorded unpatched on each
# fight, Gordie's 8@0.5 again patched on an empty tree (does the patch retrace it?), the other methods patched, the
# portfolio sims, the pruning counts, then the per-try bench and CPU profiles on Gordie's tree.
# usage: redo.sh <trees-dir>   (the trees are scratch: nothing in runs/ needs them afterwards)
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
runs="$here/../../runs"
trees=$1
P="$here/../patches/poll1.ts"
F="gordie-w180 drayton-w188 kieran-w190"
cd "$repo"
rm -f "$runs/lab/record.log" "$runs/lab/methods/methods.log"
sh "$here/record.sh" "$trees" 3 $F -- beam:8:0.5 beam:8:1 beam:16:0.5
mkdir -p "$runs/lab/patched"
PATCH=$P node "$here/run.ts" --fight src/solver/fixtures/gordie-w180.json --tree "$trees/patched-gordie-w180" \
  --method beam:8:0.5 --workers 3 --out "$runs/lab/patched/gordie-w180-beam_8_0.5.json" 2> "$runs/lab/patched/gordie-w180-beam_8_0.5.log" | tail -1
for f in $F; do
  PATCH=$P sh "$here/methods.sh" "$trees" "$f" 3 iw:0.5 iw:1 lds:0.5:2:2 lds:1:2:2 bf:0.5:0 bf:1:0 bf:0.5:0.25 bf:1:0.25
done
for f in $F; do sh "$here/sims.sh" "$trees" "$f" 3; done
mkdir -p "$runs/lab/prune"
for f in $F; do
  node "$here/prune.ts" "$trees/$f" "$runs/lab/$f"/beam_*.json "$runs/lab/methods/$f"/*.json > "$runs/lab/prune/$f.json"
done
p="$runs/profile"
s="$trees/profile"
rm -rf "$s"
sh "$here/../bench-patch.sh" gordie-w180 "$trees" "$s" 10 poll1.ts:1 poll1.ts:10 spin.ts
cp "$s/none/jobs.json" "$p/bench-none-10forks.json"
cp "$s/poll1.ts-1/jobs.json" "$p/bench-poll1-10forks.json"
cp "$s/poll1.ts-10/jobs.json" "$p/bench-poll10-10forks.json"
cp "$s/spin.ts-/jobs.json" "$p/bench-spin-10forks.json"
rm -f "$p/bench-spin-3forks.json"
PROF=1 node "$here/../profile.ts" src/solver/fixtures/gordie-w180.json "$trees/gordie-w180" "$s/cpu-unpatched" 10 | tail -1
PROF=1 PATCH=$P node "$here/../profile.ts" src/solver/fixtures/gordie-w180.json "$trees/gordie-w180" "$s/cpu-poll1" 30 | tail -1
for v in unpatched-10forks:cpu-unpatched poll1-30forks:cpu-poll1; do
  cp "$s/${v#*:}/jobs.json" "$p/cpu-${v%%:*}.jobs.json"
  python3 -I "$here/../prof.py" "$(ls -S "$s/${v#*:}"/*.cpuprofile | head -1)" > "$p/cpu-${v%%:*}.txt"
done
echo "redo done $(date '+%H:%M:%S')"
