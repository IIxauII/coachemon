#!/usr/bin/env bash
# PROTOTYPE — throwaway. #23: launch the owned Chrome (#5's command) plus any extra flags.
#   bash launch.sh [extra chrome flags...]
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.pokerogue-mcp/chrome-profile" \
  --no-first-run --no-default-browser-check \
  "$@" \
  https://pokerogue.net
