#!/usr/bin/env bash
# Run one empirical case: headless Claude Code calls probe__sleep once.
#
#   run-case.sh <name> <ms> <progress_every_ms> <per_server_timeout_ms|-> [ENV=VAL ...]
#
# Output (under /tmp/cc7/cases/<name>/): probe.log (server side, wire in), stream.jsonl
# (Claude Code stream-json, which contains the exact tool_result the model saw), meta.txt.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
NAME=$1 MS=$2 EVERY=$3 PST=$4
shift 4
DIR=/tmp/cc7/cases/$NAME
rm -rf "$DIR" && mkdir -p "$DIR"
if [ "$PST" = "-" ]; then TIMEOUT_FIELD=""; else TIMEOUT_FIELD="\"timeout\": $PST,"; fi
cat > "$DIR/mcp.json" <<EOF
{ "mcpServers": { "probe": { "type": "stdio", $TIMEOUT_FIELD
  "command": "node", "args": ["$HERE/probe-server.mjs"],
  "env": { "PROBE_LOG": "$DIR/probe.log" } } } }
EOF
PROMPT="Call the mcp__probe__sleep tool exactly once with ms=$MS and progress_every_ms=$EVERY. Do not retry and do not call any other tool. Then reply with the tool's result or error text quoted verbatim."
START=$(date +%s)
# macOS has no coreutils `timeout`; perl's alarm bounds the run at 300 s.
env "$@" perl -e 'alarm shift; exec @ARGV' 300 claude -p "$PROMPT" \
  --model haiku \
  --mcp-config "$DIR/mcp.json" --strict-mcp-config \
  --allowedTools mcp__probe__sleep \
  --output-format stream-json --verbose \
  > "$DIR/stream.jsonl" 2> "$DIR/stderr.txt"
RC=$?
END=$(date +%s)
{ echo "case=$NAME ms=$MS every=$EVERY per_server_timeout=$PST env=$* rc=$RC wall=$((END-START))s"; } | tee "$DIR/meta.txt"
# Give the (still-running) server a moment to log post-cancel activity before we read it.
sleep 2
echo "---- tool_result (model-visible)"
grep '"tool_result"' "$DIR/stream.jsonl" | python3 -c '
import sys, json
for l in sys.stdin:
    m = json.loads(l)
    for c in m.get("message", {}).get("content", []):
        if isinstance(c, dict) and c.get("type") == "tool_result":
            print(json.dumps({"is_error": c.get("is_error"), "content": c.get("content")}))
'
echo "---- final text"
grep '"type":"result"' "$DIR/stream.jsonl" | python3 -c 'import sys,json;[print(json.loads(l).get("result")) for l in sys.stdin]'
echo "---- server log (tools/call + cancel + handler events)"
grep -v '"method\\":\\"tools/list\|initialize\|server_boot' "$DIR/probe.log" | cut -c1-400
