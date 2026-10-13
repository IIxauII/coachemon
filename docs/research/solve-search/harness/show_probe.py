#!/usr/bin/env python3
# usage: show_probe.py <probe-out.json> — summarise a probe run (lines per process, fork fidelity)
import json, sys

d = json.load(open(sys.argv[1]))
print("boot ms", round(d["bootMs"]), "stats", d.get("stats"))
for r in d["results"]:
    if "fatal" in r:
        print("FATAL", r["id"], r["fatal"], *r.get("stack", []), sep="\n  ")
        continue
    if "lines" in r:
        for ln in r["lines"]:
            last = ln["turns"][-1] if ln["turns"] else {}
            print(f"{ln['name']:<18} {ln['result']:<6} load {ln['loadMs']:6.0f} ms  play {ln['playMs']:6.0f} ms  "
                  f"turns {len(ln['turns']):>2}  end T{last.get('turn')} ours {[x for x in last.get('ours', []) if ' 0/' not in x]}")
        print("  stats", r["stats"])
    if "checks" in r:
        e = r["refEnd"]
        print(f"forkcheck {r['id']}: reference ends T{e['turn']} won={e['won']} lost={e['lost']}")
        for c in r["checks"]:
            diff = json.dumps(c["firstDiff"])[:400] if c["firstDiff"] else ""
            print(f"  restore at step {c['fromStep']:>2} (T{c['turn']:>2}) {c['restoreMs']:5.0f} ms  match={c['match']} {diff}")
    if "ndiffs" in r:
        print(f"chaincheck {r['id']}: {r['steps']} steps, {r['ndiffs']} differ from the straight replay")
        for x in r["diffs"]:
            print("  ", json.dumps(x)[:900])
    if "children" in r:
        print(f"expand {r['id']}: {len(r['children'])} children in {r['ms']:.0f} ms, rss {r['rss'] / 1e6:.0f} MB")
        for c in r["children"]:
            print(f"  {json.dumps(c['step']):<45} won={c['won']} lost={c['lost']} {c['ms']:5.0f} ms {c.get('error') or ''}")
