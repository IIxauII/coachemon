#!/bin/bash
# #1019, Orion 1.1.3: the scripted press pass on the owner's own Orion, for whichever build its folder holds. Run it
# once per build; the quits and the swap between builds happen outside it (the scripts doc, Orion steps 8 and 9).
# Reads and clicks the box over AppleScript (orion.applescript). Stops at the first press whose target is not in
# front, and at any press after which the game tab no longer has the keyboard (an Orion shortcut that opened a panel,
# say), so no later letter types into Orion's own UI.
#
# Usage: orion-pass.sh <orion pid> <label>   (label names the output files: chrome-build, firefox-build)
# Env: KEYPROBE_PRESS (the built keyprobe-press), KEYPROBE_OUT (where logs go; default $TMPDIR/coachemon-1019)
HERE="$(cd "$(dirname "$0")" && pwd)"
KP="${KEYPROBE_PRESS:-${TMPDIR:-/tmp}/keyprobe-press}"
OUT="${KEYPROBE_OUT:-${TMPDIR:-/tmp}/coachemon-1019}"
mkdir -p "$OUT"
PID="$1"; LABEL="$2"
[ -n "$PID" ] && [ -n "$LABEL" ] || { echo "usage: orion-pass.sh <orion pid> <label>"; exit 2; }
ORION="osascript $HERE/orion.applescript"
GAME=pokerogue.net
js() { $ORION js "$1" "$2"; }
box() { js $GAME "[...document.querySelectorAll('#coachemon-keyprobe button')].find(b => b.textContent.startsWith('$1')).click(), 'clicked $1'"; }
focused() { [ "$(js $GAME 'String(document.hasFocus())')" = true ]; }
step() { echo "== $1"; }

# Brings Orion forward and gives the game tab the keyboard: a click on the box's first line, which the box keeps from
# the game, when the tab does not have it already (a new tab may open with the address bar focused).
front() {
  open -a Orion
  sleep 1
  "$KP" activate "$PID" >/dev/null || return 1
  focused && return 0
  read -r X Y <<< "$(js $GAME "(() => { const r = document.querySelector('#coachemon-keyprobe').getBoundingClientRect(); return Math.round(window.screenX + r.left + 60) + ' ' + Math.round(window.screenY + window.outerHeight - window.innerHeight + r.top + 7); })()")"
  "$KP" click "$PID" "$X" "$Y" >/dev/null || return 1
  sleep 0.6
  focused
}

presses() {
  for chord in "$@"; do
    bash "$HERE/presslist.sh" "$PID" "$chord" || exit 1
    focused || { echo "STOPPED after $chord: the game tab lost the keyboard"; exit 1; }
  done
}

# Each way of opening the options page: let it draw, keep its text, close it.
options() {
  sleep 2.5
  local url
  url=$($ORION urls options.html | head -1)
  if [ -z "$url" ]; then echo "options ($1): no tab with options.html opened"; return; fi
  echo "options ($1): $url"
  { echo "== $1: $url"; js options.html "document.body.innerText" 2>&1; echo; } >> "$OUT/orion-$LABEL-options.txt"
  $ORION close options.html >/dev/null
}

: > "$OUT/orion-$LABEL-options.txt"
step "a newly opened game tab"
open -a Orion "https://pokerogue.net/"
for _ in $(seq 1 40); do
  heading=$(js $GAME "document.querySelector('#coachemon-keyprobe')?.innerText.split('\\n')[0] ?? ''" 2>/dev/null)
  [ -n "$heading" ] && break
  sleep 0.5
done
[ -n "$heading" ] || { echo "no probe box in the new tab"; exit 1; }
echo "box: $heading"
front || { echo "could not give the game tab the keyboard"; exit 1; }
box "accesskey on" >/dev/null 2>&1
box clear

step "log only: the list (Escape after the ⌥U dead key)"
presses opt+k ctrl+k cmd+k cmd+shift+k ctrl+shift+k opt+shift+k cmd+ctrl+k opt+j ctrl+j opt+u escape cmd+shift+u ctrl+opt+k k
step "prevent: the list again"
box "switch to prevent"
presses opt+k ctrl+k cmd+k cmd+shift+k ctrl+shift+k opt+shift+k cmd+ctrl+k opt+j ctrl+j opt+u escape cmd+shift+u ctrl+opt+k k
box "switch to log only"
step "commands.update ⌥J → ⌥L, press ⌥L; reset, press ⌥J"
box "commands.update"
sleep 1.5
presses opt+l
box "commands.reset"
sleep 1.5
presses opt+j

step "copy log"
box refresh
sleep 1.5
box "copy log"
sleep 1
# A scripted click carries no user activation, so the clipboard likely refuses and the overlay holds the text. Read
# the clipboard only when it did not: otherwise it still holds whatever the owner copied last.
js $GAME "document.querySelector('#coachemon-keyprobe-copy textarea')?.value ?? ''" > "$OUT/orion-$LABEL-log.txt"
[ -s "$OUT/orion-$LABEL-log.txt" ] && [ "$(wc -l < "$OUT/orion-$LABEL-log.txt")" -gt 1 ] || pbpaste > "$OUT/orion-$LABEL-log.txt"
js $GAME "document.querySelector('#coachemon-keyprobe').innerText" > "$OUT/orion-$LABEL-box.txt"
wc -l "$OUT/orion-$LABEL-log.txt" "$OUT/orion-$LABEL-box.txt"

step "the options page: openOptionsPage(), a tab, the URL in a new tab"
box "openOptionsPage()"
options "openOptionsPage()"
box "options in a tab"
options "options in a tab"
url=$(js $GAME "document.querySelector('#coachemon-keyprobe').innerText.match(/options page: (\\S+)/)?.[1] ?? ''")
if [ -n "$url" ]; then
  osascript -e "tell application \"Orion\" to make new tab at end of tabs of front window with properties {URL:\"$url\"}" >/dev/null
  options "the URL in a new tab"
fi
echo "orion pass ($LABEL) done; Manage Extensions' settings and the shortcuts panel are by screenshot"
