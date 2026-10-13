#!/usr/bin/env bash
# usage: evalorion.sh '<js expression returning a value>'
expr="$1"
js="(() => { const e = document.createElement('script'); e.textContent = $(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "try{document.documentElement.dataset.mcpOut=JSON.stringify(($expr))}catch(err){document.documentElement.dataset.mcpOut=JSON.stringify({error:String(err)})}"); document.documentElement.appendChild(e); e.remove(); const r = document.documentElement.dataset.mcpOut; delete document.documentElement.dataset.mcpOut; return r; })()"
osascript - "$js" <<'EOF'
on run argv
  tell application "Orion"
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t starts with "https://pokerogue.net" then return do JavaScript (item 1 of argv) in t
      end repeat
    end repeat
  end tell
end run
EOF
