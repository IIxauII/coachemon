#!/usr/bin/env bash
# usage: orion-eval.sh <file.js>  — runs the JS in the pokerogue.net page world (Orion) and prints
# document.documentElement.dataset.coachOut (which the JS must set, possibly later for async work).
set -euo pipefail
code=$(cat "$1")
wrapper="(() => { const e = document.createElement('script'); e.textContent = $(node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))' <<<"$code"); document.documentElement.appendChild(e); e.remove(); const r = document.documentElement.dataset.coachOut; return r || 'pending'; })()"
osascript - "$wrapper" <<'EOF'
on run argv
  tell application "Orion"
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t starts with "https://pokerogue.net" then return do JavaScript (item 1 of argv) in t
      end repeat
    end repeat
  end tell
  return "{\"error\":\"no pokerogue.net tab in Orion\"}"
end run
EOF
