#!/bin/sh
# The 10-fork bench again, traced (patches/trace.ts), once per variant, each compared job by job with the reference.
# usage: trace.sh <tree-dir> <ref-jobs.json> <out-dir> <variant>...   variants: none1 none2 fake fake50 spin
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../.." && pwd)
tree=$1; ref=$2; out=$3; shift 3
cd "$repo"
mkdir -p "$out"
TR="$here/patches/trace.ts"
FC="$here/patches/fake-clock.ts"
SPIN="$repo/docs/research/solve-speed/harness/patches/spin.ts"
for v in "$@"; do
  echo "$(date '+%H:%M:%S') $v load $(sysctl -n vm.loadavg)"
  case $v in
    none*) set -- MODE=none PATCH="$TR" ;;
    fake) set -- MODE=poll1 PATCH="$FC,$TR" ;;
    fake50) set -- MODE=none PATCH="$FC,$TR" ;;
    spin) set -- MODE=none CLOCK=1 PATCH="$SPIN,$TR" ;;
  esac
  env "$@" TRACE_OUT="$out/$v.txt" REF="$ref" node "$here/profile.ts" src/solver/fixtures/gordie-w180.json "$tree" "$out/$v" 10 2>/dev/null | tail -1
done
