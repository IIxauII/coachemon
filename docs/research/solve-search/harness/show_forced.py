#!/usr/bin/env python3
# usage: show_forced.py <probe-out.json> — summarise the forced-move cases (solve.test.ts `forced`)
import json, sys

d = json.load(open(sys.argv[1]))
print("boot ms", round(d["bootMs"]), "stats", d.get("stats"))
for r in d["results"]:
    if "fatal" in r:
        print("FATAL", r["id"], r["fatal"], *r.get("stack", []), sep="\n  ")
        continue
    if "chained" not in r:
        continue
    bad = [c for c in r["chained"] if c.get("error") or c.get("stalePrompts")]
    changed = [c for c in r["chained"] if c.get("restoreChanged")]
    fork = r.get("fork") or {}
    fm = [c for c in fork.get("checks", []) if not c["match"]]
    print(f"\n== {r['id']}: {len(r['steps'])} steps; chained vs straight diffs {len(r['diffs'])}; "
          f"stale/error steps {len(bad)}; restore changed state at {len(changed)}; "
          f"fork mismatches {len(fm)}/{len(fork.get('checks', []))}")
    for i, c in enumerate(r["chained"]):
        ours = next((x for x in c["ours"] if "*" in x), "")
        foe = next((x for x in c["foes"] if "*" in x), "")
        o = c["fx"]["ours"] or {}
        fo = c["fx"]["foe"] or {}
        if fo.get("q") or fo.get("tags"):
            foe += f" q={fo.get('q')} tags={fo.get('tags')}"
        print(f" {i:>2} T{c['turn']:>2} {c['step']:<16} legal[{' '.join(c['legal'])}]")
        print(f"      ours {ours} q={o.get('q')} tags={o.get('tags')} | foe {foe}"
              f"{' WON' if c['won'] else ''}{' LOST' if c['lost'] else ''}"
              f"{' stale=' + str(c['stalePrompts']) if c.get('stalePrompts') else ''}{' ERR ' + c['error'][:150] if c.get('error') else ''}")
        if c.get("pp"):
            print(f"      pp left: {' '.join(c['pp'])}")
        if c.get("saved") is not None:
            print(f"      saved: moveQueue={json.dumps(c['saved']['moveQueue'])} tags={json.dumps(c['saved']['tags'])[:200]}")
        msgs = [m for m in c.get("msgs", []) if any(w in m for w in ("recharge", "Struggle", "confus", "fatigue", "sunlight",
                                                                    "flew", "dug", "sprang", "glowing", "absorbed", "PP", "thrashing", "rampage"))]
        if msgs:
            print("      msgs:", " / ".join(msgs)[:300])
        if c.get("restoreChanged"):
            print("      RESTORE CHANGED", json.dumps(c["restoreChanged"])[:600])
    for x in r["diffs"][:2]:
        print("  DIFF", json.dumps(x)[:900])
    for x in fm[:2]:
        print("  FORK", json.dumps(x)[:900])
