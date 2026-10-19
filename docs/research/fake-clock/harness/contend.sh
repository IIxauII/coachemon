#!/bin/sh
# Does a worker's per-try cost hold when three run at once, as in a 3-worker search? The 10-fork bench, poll1 then the
# fake clock, each as three benches started together.
# usage: contend.sh <tree-dir> <scratch-dir>
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../.." && pwd)
tree=$1; s=$2
cd "$repo"
for v in poll1 fake; do
  patch=""; [ "$v" = fake ] && patch="$here/patches/fake-clock.ts"
  echo "$(date '+%H:%M:%S') 3 x $v load $(sysctl -n vm.loadavg)"
  for i in 1 2 3; do
    MODE=poll1 PATCH=$patch node "$here/profile.ts" src/solver/fixtures/gordie-w180.json "$tree" "$s/$v-$i" 10 2>/dev/null | tail -1 &
  done
  wait
done
echo "$(date '+%H:%M:%S') done load $(sysctl -n vm.loadavg)"
