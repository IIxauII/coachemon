#!/usr/bin/env bash
# Fetch the MCP spec pages this research cites, pinned to a commit of the spec repo.
set -euo pipefail
REV=${REV:-2026-07-28}
OUT=${OUT:-/tmp/cc7/spec}
mkdir -p "$OUT"
API=https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol
SHA=$(curl -s "$API/commits/main" | python3 -c 'import sys,json;print(json.load(sys.stdin)["sha"])')
echo "spec repo main @ $SHA" | tee "$OUT/SHA"
curl -s "$API/git/trees/$SHA?recursive=1" \
  | python3 -c 'import sys,json;[print(x["path"]) for x in json.load(sys.stdin)["tree"] if x["path"].startswith("docs/specification/'"$REV"'")]' \
  > "$OUT/tree.txt"
grep -E 'progress|cancel|lifecycle|tools|changelog' "$OUT/tree.txt"
RAW=https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/$SHA
for p in $(grep -E '(progress|cancellation|lifecycle|server/tools|changelog)\.mdx?$' "$OUT/tree.txt"); do
  curl -sf "$RAW/$p" -o "$OUT/$(basename "$(dirname "$p")")_$(basename "$p")" || echo "missing $p"
done
ls -la "$OUT"
