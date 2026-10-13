#!/usr/bin/env python3
# usage: standin_tally.py <runs/standin> [names...] — one row per stand-in beam: result, expansions to the first win,
# line, survivors, wall-clock, memory (pool, worker tree, largest heap a job reported) and the replay from T1.
import json, os, sys

root = sys.argv[1]
names = sys.argv[2:] or sorted(n for n in os.listdir(root) if os.path.isfile(os.path.join(root, n, "summary.json")))
print("| run | W | w | result | layers | expansions to first win (total) | line | alive | boot s | search s | replay s "
      "| pool peak MB | worker peak MB | max heap after a job MB | replayed from T1 |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
for n in names:
    s = json.load(open(os.path.join(root, n, "summary.json")))["summary"]
    a, fw, layers = s["args"], s["first_win"], s["layers"]
    heap = [json.loads(x) for x in open(os.path.join(root, n, "heap.jsonl"))]
    hmax = max((h["heap_mb"] for h in heap), default=0)
    if s.get("aborted"):
        res = f"worker death / abort: {s['aborted']}"
    elif fw:
        res = "win"
    elif not layers or layers[-1]["distinct"] == 0:
        res = f"beam emptied at depth {len(layers)} ({s.get('stalled_total', 0)} stalled)"
    elif a.get("budget_children") and s["children_total"] >= a["budget_children"]:
        res = "budget reached"
    else:
        res = f"no win in {len(layers)} turns"
    alive = sum(1 for x in fw["end"]["ours"] if " 0/" not in x) if fw else "-"
    val = s.get("validated") or []
    vt = f"{sum(1 for v in val if v.get('result') == 'WIN')}/{len(val)}" if val else "-"
    print(f"| {n} | {a['width']} | {a['ours_weight']} | {res} | {len(layers)} | "
          f"{fw['children_so_far'] if fw else '-'} ({s['children_total']}) | {len(fw['path']) if fw else '-'} | {alive} | "
          f"{s['boot_secs']} | {s['search_secs']} | {s['validate_secs']} | {s['memory']['peak_total_mb']:.0f} | "
          f"{s['memory']['peak_worker_mb']:.0f} | {hmax} | {vt} |")
