#!/usr/bin/env bash
# Read-only snapshot of a live PokéRogue tab.
# Usage: read.sh <chrome|orion> <battle|starters|hud|hud-off>
set -euo pipefail
browser=${1:?chrome|orion}
mode=${2:-battle}
here=$(cd "$(dirname "$0")" && pwd)
case "$mode" in hud|hud-off) src=hud.js ;; *) src=probe.js ;; esac
probe=$(sed "s/__MODE__/$mode/" "$here/$src")

# Wrapper: inject probe as a <script> tag (reaches the page world), read the
# result back off the DOM, clean up.
wrapper="(() => { const e = document.createElement('script'); e.textContent = $(node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))' <<<"$probe"); document.documentElement.appendChild(e); e.remove(); const r = document.documentElement.dataset.mcpOut; delete document.documentElement.dataset.mcpOut; return r || JSON.stringify({error: 'no result (CSP or page not loaded)'}); })()"

case "$browser" in
  orion)
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
    ;;
  chrome)
    WRAPPER="$wrapper" node --input-type=module -e '
      const port = process.env.POKEROGUE_MCP_PORT ?? 9222;
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = tabs.find(x => x.url.includes("pokerogue.net"));
      if (!t) { console.log(JSON.stringify({ error: "no pokerogue.net tab on debug port" })); process.exit(0); }
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise(r => (ws.onopen = r));
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: process.env.WRAPPER, returnByValue: true } }));
      ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) { console.log(d.result?.result?.value ?? JSON.stringify(d)); process.exit(0); } };
    '
    ;;
  *) echo "unknown browser: $browser" >&2; exit 2 ;;
esac
