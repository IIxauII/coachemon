#!/bin/bash
# #1019, Chrome 156: the scripted press pass, against the throwaway Chrome of keyprobe-chrome.ts (CDP port 9557).
# Bind the hand-bound chords first (bind.js on chrome://extensions/shortcuts). Stops at the first press whose target
# is not in front. Not run yet as a whole: only a bare K was pressed so far (2026-11-09).
#
# Usage: chrome-pass.sh <chrome pid> <toolbar-button x> <toolbar-button y>   (global screen points, top-left origin;
#        find the pinned probe button with a screenshot of the window)
# Env: KEYPROBE_PRESS (the built keyprobe-press), KEYPROBE_OUT (where logs go; default $TMPDIR/coachemon-1019)
HERE="$(cd "$(dirname "$0")" && pwd)"
KP="${KEYPROBE_PRESS:-${TMPDIR:-/tmp}/keyprobe-press}"
OUT="${KEYPROBE_OUT:-${TMPDIR:-/tmp}/coachemon-1019}"
mkdir -p "$OUT"
CDP="node $HERE/../keyprobe-cdp.ts 9557"
PID="$1"; TBX="$2"; TBY="$3"
EXT=bfdlnegplhjnnnomakhffjbonpkhbcij
GAME=https://pokerogue.net
box() { $CDP js $GAME "[...document.querySelectorAll('#coachemon-keyprobe button')].find(b => b.textContent.startsWith('$1')).click(), 'clicked $1'"; }
# CDP's activate is the one request macOS 26 lets bring the throwaway Chrome forward (Chrome raises itself).
front() { $CDP front $GAME; sleep 0.8; }
step() { echo "== $1"; }

front
box clear
step "log only: the list (Escape after the ⌥U dead key, so it does not fold into the next press)"
bash "$HERE/presslist.sh" "$PID" opt+k ctrl+k cmd+k cmd+shift+k ctrl+shift+k opt+shift+k cmd+ctrl+k opt+j ctrl+j opt+u escape cmd+shift+u ctrl+opt+k k || exit 1
step "global, Chrome in front"
bash "$HERE/presslist.sh" "$PID" cmd+shift+1 || exit 1
step "global, the Finder in front"
open -a Finder
sleep 1.2
FINDER=$(pgrep -x Finder)
"$KP" press "$FINDER" cmd+shift+1 || exit 1
sleep 2.5
front
step "toolbar click"
"$KP" click "$PID" "$TBX" "$TBY" || exit 1
sleep 2.5
step "prevent: ⌥K ⇧⌘K"
box "switch to prevent"
bash "$HERE/presslist.sh" "$PID" opt+k cmd+shift+k || exit 1
box "switch to log only"
step "⌥C, bound to probe-opt-u"
$CDP open chrome://extensions/
sleep 1.5
$CDP js chrome://extensions "(async () => { await chrome.developerPrivate.updateExtensionCommand({ extensionId: '$EXT', commandName: 'probe-opt-u', keybinding: 'Alt+C' }); const i = await chrome.developerPrivate.getExtensionInfo('$EXT'); return 'probe-opt-u now ' + i.commands.filter(c => c.name === 'probe-opt-u').map(c => c.keybinding).join(); })()"
$CDP close chrome://extensions
front
bash "$HERE/presslist.sh" "$PID" opt+c || exit 1
step "copy log (overwrites the clipboard; the overlay holds it where the clipboard refuses)"
box refresh
sleep 1.5
box "copy log"
sleep 1
$CDP js $GAME "document.querySelector('#coachemon-keyprobe-copy textarea')?.value ?? ''" > "$OUT/chrome-log-overlay.txt"
pbpaste > "$OUT/chrome-log.txt"
wc -l "$OUT/chrome-log.txt" "$OUT/chrome-log-overlay.txt"
echo "chrome pass done"
