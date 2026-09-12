"""Print de-duplicated context around a literal string in the `strings` dump of the
Claude Code native binary.

    strings -n 8 /opt/homebrew/Caskroom/claude-code@latest/2.1.269/claude > /tmp/cc7/s.txt
    python3 bundle-ctx.py /tmp/cc7/s.txt '<literal>' <before> <after> [max]
"""
import re
import sys

path, pat = sys.argv[1], sys.argv[2]
before, after = int(sys.argv[3]), int(sys.argv[4])
maxn = int(sys.argv[5]) if len(sys.argv) > 5 else 3
data = open(path, encoding="utf-8", errors="replace").read()
seen = set()
n = 0
for m in re.finditer(re.escape(pat), data):
    s = data[max(0, m.start() - before) : m.end() + after]
    if s in seen:
        continue
    seen.add(s)
    n += 1
    print(f"--- @{m.start()}")
    print(s)
    if n >= maxn:
        break
