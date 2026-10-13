#!/bin/sh
# usage: sweep.sh <out-root> <name> [search.py args...] — one search run per call, its log next to its summary.
# Run these one after another, never side by side: they share the machine's cores and the timings would mix.
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$1
NAME=$2
shift 2
mkdir -p "$ROOT"
python3 -I "$HERE/search.py" "$ROOT/$NAME" "$@" > "$ROOT/$NAME.txt" 2>&1
echo "$NAME: $(grep -E '^L|replayed' "$ROOT/$NAME.txt" | tail -2 | tr '\n' ' ')"
