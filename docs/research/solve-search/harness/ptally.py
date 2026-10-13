#!/usr/bin/env python3
# usage: ptally.py <dir> [names...] — one row per portfolio run, then one row per beam in it
import json, os, sys

root = sys.argv[1]
names = sys.argv[2:] or sorted(n for n in os.listdir(root) if os.path.isfile(os.path.join(root, n, "summary.json")))
print("| run | root | share | stop | found by | line | alive | expansions to answer (total) | search s to replayed win | boot s | peak total MB | peak worker MB | replayed |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
beams = []
for n in names:
    s = json.load(open(os.path.join(root, n, "summary.json")))["summary"]
    if "beams" not in s:
        continue
    a, ans = s["args"], s["answer"]
    root_name = a.get("prefix") or "T1"
    if ans:
        cells = [ans["beam"], f"{ans['steps']} steps ({ans['depth']} searched)", f"{ans['alive']} of 6",
                 f"{ans['children_so_far']} ({s['children_total']})", f"{ans['replayed_at']}", ans["validated"]]
    else:
        cells = ["–", "–", "–", f"– ({s['children_total']})", f"{s['search_secs']} (no answer)", "–"]
    print(f"| {n} | {root_name} | {'off' if a.get('no_share') else 'on'} | {s['stop_reason']} | " + " | ".join(cells[:5]) +
          f" | {s['boot_secs']} | {s['memory']['peak_total_mb']:.0f} | {s['memory']['peak_worker_mb']:.0f} | {cells[5]} |")
    for b in s["beams"]:
        beams.append((n, b))
print()
print("| run | beam | status | layers | actions dispatched | children consumed | tasks created | tasks reused | losses | stalled | wins |")
print("|---|---|---|---|---|---|---|---|---|---|---|")
for n, b in beams:
    print(f"| {n} | {b['name']} | {b['status']} | {b['depth']} | {b['dispatched_actions']} | {b['children_consumed']} | "
          f"{b['tasks_created']} | {b['tasks_reused']} | {b['losses']} | {b['stalled']} | {b['wins']} |")
