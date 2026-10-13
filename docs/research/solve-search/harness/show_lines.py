#!/usr/bin/env python3
# usage: show_lines.py <probe-out.json> [line-name] — every turn of the lines a probe played, with messages
import json, re, sys

d = json.load(open(sys.argv[1]))
for r in d["results"]:
    for ln in r.get("lines", []):
        if len(sys.argv) > 2 and ln["name"] != sys.argv[2]:
            continue
        print(f"## {ln['name']} -> {ln['result']}")
        for t in ln["turns"]:
            st = t["step"]
            a = "(wait)" if st.get("w") else ("T:" if st.get("tera") else "") + (st.get("m") or ">" + st.get("s", "")) + (f" (in:{st['r']})" if st.get("r") else "")
            msgs = " | ".join(m for m in t.get("msgs") or [] if not re.search(r"sandstorm rages|buffeted|^Go! |Come back", m))
            print(f"T{t['turn']:>2} {a:<26} {msgs[:600]}")
            print("     us:", ", ".join(x for x in t["ours"] if " 0/" not in x))
            print("   them:", ", ".join(x for x in t["foes"] if " 0/" not in x))
