#!/bin/sh
# usage: heap.sh <out-root> <name> <heap-mb|-> [search.py args...]
# One search run, as sweep.sh, with an optional heap cap (- for none). Before it starts it waits, up to 5 minutes,
# until swap use is at most 4 GB and the system has at least 15% of its memory free, and refuses to start otherwise.
# The machine's load before and after goes to <name>.load.
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$1
NAME=$2
CAP=$3
shift 3
mkdir -p "$ROOT"
load() {
  echo "$1 $(date +%H:%M:%S) $(sysctl -n vm.loadavg) free $(memory_pressure | sed -n 's/.*free percentage: //p')" \
    "swap $(sysctl -n vm.swapusage | sed 's/  */ /g')"
}
i=0
while :; do
  free=$(memory_pressure | sed -n 's/.*free percentage: \([0-9]*\)%.*/\1/p')
  swap=$(sysctl -n vm.swapusage | sed -n 's/.*used = \([0-9.]*\)M.*/\1/p')
  if [ "${free:-0}" -ge 15 ] && [ "$(echo "${swap:-99999} <= 4096" | bc)" = 1 ]; then break; fi
  i=$((i + 1))
  if [ $i -gt 20 ]; then
    echo "$NAME: refused, free ${free}% swap ${swap}M" | tee "$ROOT/$NAME.refused"
    exit 3
  fi
  sleep 15
done
load start > "$ROOT/$NAME.load"
if [ "$CAP" = - ]; then
  python3 -I "$HERE/search.py" "$ROOT/$NAME" "$@" > "$ROOT/$NAME.txt" 2>&1
else
  SS_HEAP_MB=$CAP python3 -I "$HERE/search.py" "$ROOT/$NAME" "$@" > "$ROOT/$NAME.txt" 2>&1
fi
load end >> "$ROOT/$NAME.load"
echo "$NAME: $(grep -E '^L|replayed|aborted' "$ROOT/$NAME.txt" | tail -2 | tr '\n' ' ')"
