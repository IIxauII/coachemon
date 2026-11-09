#!/bin/bash
# #1019, Firefox 159: the scripted press pass, against the throwaway Firefox of keyprobe-firefox.ts (relay port 9559).
# Stops at the first press whose target is not in front. Not run yet (2026-11-09).
#
# Usage: firefox-pass.sh <firefox pid>
# Env: KEYPROBE_PRESS (the built keyprobe-press), KEYPROBE_OUT (where logs go; default $TMPDIR/coachemon-1019)
HERE="$(cd "$(dirname "$0")" && pwd)"
KP="${KEYPROBE_PRESS:-${TMPDIR:-/tmp}/keyprobe-press}"
OUT="${KEYPROBE_OUT:-${TMPDIR:-/tmp}/coachemon-1019}"
mkdir -p "$OUT"
BIDI="node $HERE/../keyprobe-bidi.ts 9559"
PID="$1"
GAME=https://pokerogue.net
box() { $BIDI js $GAME "[...document.querySelectorAll('#coachemon-keyprobe button')].find(b => b.textContent.startsWith('$1')).click(), 'clicked $1'"; }
# Untested: whether BiDi's activate raises the app on macOS 26; `open -a` activates the one running Firefox.
front() { $BIDI front $GAME; open -a Firefox; sleep 1; }
step() { echo "== $1"; }
shot() { screencapture -x -o -l "$("$KP" windows "$PID" | head -1 | awk '{print $2}')" "$OUT/firefox-$1.png"; }

front
"$KP" front
box "accesskey off"
box clear
step "log only: the list (Escape after the ⌥U dead key)"
bash "$HERE/presslist.sh" "$PID" opt+k ctrl+k cmd+shift+k ctrl+shift+k opt+shift+k cmd+ctrl+k ctrl+opt+k opt+j ctrl+j opt+u escape || exit 1
bash "$HERE/presslist.sh" "$PID" cmd+shift+u || exit 1
shot after-action
bash "$HERE/presslist.sh" "$PID" escape k || exit 1
step "prevent: the list again"
box "switch to prevent"
bash "$HERE/presslist.sh" "$PID" opt+k ctrl+k cmd+shift+k ctrl+shift+k opt+shift+k cmd+ctrl+k ctrl+opt+k opt+j ctrl+j opt+u escape cmd+shift+u || exit 1
shot after-action-prevent
bash "$HERE/presslist.sh" "$PID" escape k || exit 1
step "accesskey on: ⌃⌥K prevented, then log only"
box "accesskey on"
bash "$HERE/presslist.sh" "$PID" ctrl+opt+k || exit 1
box "switch to log only"
bash "$HERE/presslist.sh" "$PID" ctrl+opt+k || exit 1
step "commands.update ⌥J → ⌥L, press ⌥L; reset, press ⌥J"
box "commands.update"
sleep 1.5
bash "$HERE/presslist.sh" "$PID" opt+l || exit 1
box "commands.reset"
sleep 1.5
bash "$HERE/presslist.sh" "$PID" opt+j || exit 1
step "copy log"
box refresh
sleep 1.5
box "copy log"
sleep 1
$BIDI js $GAME "document.querySelector('#coachemon-keyprobe-copy textarea')?.value ?? ''" > "$OUT/firefox-log-overlay.txt"
pbpaste > "$OUT/firefox-log.txt"
wc -l "$OUT/firefox-log.txt" "$OUT/firefox-log-overlay.txt"
echo "firefox pass done"
