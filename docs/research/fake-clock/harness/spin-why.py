"""For each traced run, every child's outcome beside two facts from its trace: whether the move helper's target-select
prompt was taken off the queue (a `Q SelectTargetPhase/...` line: the prompt handler's check ran while a phase that
expires it was current), and whether the turn reached a faint switch (`P SwitchPhase`). Then each child that differs
from the reference run.

usage: python3 -I spin-why.py <trace-dir> <reference-run> <run>...
A run is a name with `<name>.txt`, `<name>/jobs.json` and `<name>/children.jsonl` under <trace-dir>.
"""

import json
import os
import sys
from collections import Counter

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, "trace-diff.py")).read().split("args = [a")[0]
exec(src)  # segments(), by_job()

d, ref, runs = sys.argv[1], sys.argv[2], sys.argv[3:]


def children(name):
    return {r["i"]: json.loads(r["c"]) for r in map(json.loads, open(os.path.join(d, name, "children.jsonl")))}


R = children(ref)
for name in [ref, *runs]:
    segs, _, _ = by_job(os.path.join(d, name + ".txt"), os.path.join(d, name, "jobs.json"))
    ch = children(name)
    tally = Counter()
    for i, job in enumerate(segs):
        for c, seg in enumerate(job):
            if c >= len(ch[i]):
                continue
            expired = any(l.startswith("Q SelectTargetPhase") for l in seg)
            switch = any(l.startswith("P SwitchPhase") for l in seg)
            got = ch[i][c]
            end = got["end"] + (f" ({got['why']})" if got["end"] == "dropped" else "")
            same = "same" if R[i][c] == got else "DIFFERS"
            tally[(expired, switch, end, same)] += 1
    print(f"\n{name}: target prompt expired | faint switch | child | vs {ref} | children")
    for (e, s, end, same), n in sorted(tally.items()):
        print(f"  {str(e):5s} | {str(s):5s} | {end} | {same} | {n}")
