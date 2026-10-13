#!/usr/bin/env python3
# usage: tally.py <sweep-dir> [names...] — one row per search run: outcome, children, wall-clock, memory
import json, os, sys

root = sys.argv[1]
names = sys.argv[2:] or sorted(n for n in os.listdir(root) if os.path.isfile(os.path.join(root, n, "summary.json")))
print("| run | W | P | root | result | layers | children | to first win | search s | boot s | children/s | peak total MB | peak worker MB | replayed from T1 |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
for n in names:
    f = os.path.join(root, n, "summary.json")
    if not os.path.exists(f):
        continue
    s = json.load(open(f))["summary"]
    a = s["args"]
    fw = s["first_win"]
    layers = s["layers"]
    if fw:
        res = f"win, {len(fw['path'])}-step line, {sum(1 for x in fw['end']['ours'] if ' 0/' not in x)} of 6 alive"
    elif not layers or layers[-1]["distinct"] == 0:
        res = "every line lost (beam emptied)"
    elif a.get("budget_children") and s["children_total"] >= a["budget_children"]:
        res = "budget reached"
    else:
        res = f"no win in {len(layers)} turns"
    val = s.get("validated") or []
    vt = f"{sum(1 for v in val if v.get('result') == 'WIN')}/{len(val)}" if val else "-"
    print(f"| {n} | {a['width']} | {a['workers']} | {a.get('prefix') or 'T1'} | {res} | {len(layers)} | {s['children_total']} | "
          f"{fw['children_so_far'] if fw else '-'} | {s['search_secs']} | {s['boot_secs']} | {s['children_per_sec']} | "
          f"{s['memory']['peak_total_mb']:.0f} | {s['memory']['peak_worker_mb']:.0f} | {vt} |")
