import glob, json, os
# Find every transcript that ran the Gordie sim (br.py / sim.sh / the gordie-sim vitest), with the window and spend.
for f in sorted(glob.glob("/Users/xau/.claude/projects/*/*.jsonl"), key=os.path.getmtime):
    if os.path.getmtime(f) < 1791700000:  # older than ~2026-10-11
        continue
    runs, ev = [], []
    for ln in open(f, errors="ignore"):
        try:
            d = json.loads(ln)
        except Exception:
            continue
        m = d.get("message") or {}
        t = d.get("timestamp")
        if d.get("type") == "assistant":
            u = m.get("usage") or {}
            ev.append((t, u.get("output_tokens", 0)))
        for c in m.get("content", []) if isinstance(m.get("content"), list) else []:
            if c.get("type") == "tool_use" and c.get("name") == "Bash":
                cmd = c.get("input", {}).get("command", "")
                if ("br.py " in cmd or "sim.sh " in cmd or "zz-gordie-sim" in cmd) and "cat >" not in cmd and "<<'EOF'" not in cmd:
                    runs.append((t, cmd[:220].replace("\n", " ")))
    if runs:
        print("==", f, "runs", len(runs), "assistant turns", len(ev), "out tokens", sum(e[1] for e in ev),
              "span", ev[0][0] if ev else None, ev[-1][0] if ev else None)
        for r in runs[:60]:
            print("  ", r[0], r[1])
