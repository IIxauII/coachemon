import json, sys
# Agent spend inside a time window of one transcript: assistant turns, output tokens, context tokens per turn.
f, t0, t1 = sys.argv[1:4]
ev = []
first = None
for ln in open(f, errors="ignore"):
    try:
        d = json.loads(ln)
    except Exception:
        continue
    if first is None:
        first = (d.get("type"), str(d)[:300])
    m = d.get("message") or {}
    if d.get("type") == "assistant" and t0 <= d.get("timestamp", "") <= t1:
        u = m.get("usage") or {}
        ctx = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
        ev.append((d["timestamp"], u.get("output_tokens", 0), ctx))
print("turns", len(ev), "output", sum(e[1] for e in ev), "context sum", sum(e[2] for e in ev),
      "max ctx", max(e[2] for e in ev) if ev else 0)
print("first record:", first)
