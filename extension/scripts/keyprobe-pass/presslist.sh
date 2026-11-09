#!/bin/bash
# #1019: presses each chord into one pid, 2.5 s apart so each gets its own heading in the probe box. Stops at the
# first press whose target is not already in front.
# Usage: presslist.sh <pid> <chord>...   (KEYPROBE_PRESS: the built keyprobe-press, default $TMPDIR/keyprobe-press)
KP="${KEYPROBE_PRESS:-${TMPDIR:-/tmp}/keyprobe-press}"
pid="$1"; shift
for chord in "$@"; do
  # The pass brings the browser forward once, itself. From then on anything else in front means the owner took over:
  # stop, rather than let keyprobe-press raise the browser again under their hands.
  front=$("$KP" front | awk '{print $2}')
  [ "$front" = "$pid" ] || { echo "STOPPED before $chord: pid $front is in front, not $pid"; exit 1; }
  "$KP" press "$pid" "$chord" || { echo "STOPPED at $chord"; exit 1; }
  sleep 2.5
done
