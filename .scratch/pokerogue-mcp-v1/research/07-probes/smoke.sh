#!/usr/bin/env bash
# Drive probe-server.mjs by hand (no Claude Code): call sleep with a progressToken, cancel
# it mid-flight, and show what the server logs and writes back.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
LOG=/tmp/cc7/smoke.log
rm -f "$LOG"
{
  printf '%s\n' \
    '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"sleep","arguments":{"ms":1500,"progress_every_ms":500},"_meta":{"progressToken":7}}}'
  sleep 0.7
  printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1,"reason":"test"}}'
  sleep 1.5
} | PROBE_LOG="$LOG" node "$HERE/probe-server.mjs"
echo "---- server log"
cat "$LOG"
