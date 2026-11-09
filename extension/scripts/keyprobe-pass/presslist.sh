#!/bin/bash
# #1019: presses each chord into one pid, 2.5 s apart so each gets its own heading in the probe box. Stops at the
# first press whose target is not in front.
# Usage: presslist.sh <pid> <chord>...   (KEYPROBE_PRESS: the built keyprobe-press, default $TMPDIR/keyprobe-press)
KP="${KEYPROBE_PRESS:-${TMPDIR:-/tmp}/keyprobe-press}"
pid="$1"; shift
for chord in "$@"; do
  "$KP" press "$pid" "$chord" || { echo "STOPPED at $chord"; exit 1; }
  sleep 2.5
done
