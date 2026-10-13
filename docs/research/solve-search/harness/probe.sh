#!/bin/sh
# usage: probe.sh <dir> [session.json]   — runs <dir>/job.json in one process; writes out.json, log.txt, time.txt there
HERE=$(cd "$(dirname "$0")" && pwd)
D=$(cd "$1" && pwd)
SS_MODE=probe SS_SESSION=${2:-$HERE/../session-w180.json} SS_JOB=$D/job.json SS_OUT=$D/out.json \
  /usr/bin/time -l "$HERE/run.sh" "$D/log.txt" 2> "$D/time.txt"
grep -E "Duration" "$D/log.txt"
grep -E "real|maximum resident" "$D/time.txt"
python3 -I "$HERE/show_probe.py" "$D/out.json"
