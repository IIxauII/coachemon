#!/bin/sh
# usage: report.sh <dir with o1.json … o4.json>
# Regenerates runs/*.txt from the four runs' raw output (kept out of git: ~9 MB of JSON).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$HERE/../runs
cd "$1"
python3 -I "$HERE/show.py" o1.json win > "$OUT/win.cards.txt"
python3 -I "$HERE/show.py" o1.json a1 > "$OUT/a1.cards.txt"
python3 -I "$HERE/show.py" o2.json 'hud@T1' > "$OUT/hud-from-T1.cards.txt"
python3 -I "$HERE/score.py" o1.json > "$OUT/score.txt"
python3 -I "$HERE/claims.py" o1.json o2.json o3.json o4.json > "$OUT/claims.txt"
python3 -I "$HERE/faint-estimates.py" o1.json o2.json o3.json o4.json > "$OUT/faint-estimates.txt"
python3 -I "$HERE/branches.py" o2.json o3.json o4.json > "$OUT/branches.txt"
