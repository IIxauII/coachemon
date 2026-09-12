#!/usr/bin/env bash
# Line refs into @modelcontextprotocol/sdk 1.30.0 source (npm gitHead 2d889f2b).
set -euo pipefail
SHA=2d889f2b329e46680ec9bdd565de4616c497825a
F=/tmp/cc7/sdk-protocol.ts
curl -sf "https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/$SHA/src/shared/protocol.ts" -o "$F"
wc -l "$F"
grep -n 'DEFAULT_REQUEST_TIMEOUT_MSEC =\|resetTimeoutOnProgress?:\|maxTotalTimeout?:\|onprogress?:\|signal: AbortSignal\|_oncancel(\|private _setupTimeout\|private _resetTimeout\|private _onprogress\|method: .notifications/cancelled.\|progressToken: messageId\|if (abortController.signal.aborted)\|sendNotification: async\|const timeoutHandler\|Request timed out' "$F"
