"""Compares two traces (patches/trace.ts) of the same bench, job by job, and prints each job's first difference.

usage: python3 -I trace-diff.py <trace-a> <jobs-a.json> <trace-b> <jobs-b.json> [jobs...] [--context N] [--kinds PSGMQID]

A trace splits at each `R` (one child's turn, after the worker's own load). A job plays one turn per child it returns,
so job i owns as many segments as it has children. `--kinds` keeps only those event kinds; ticks (`@n`) are dropped,
since they are timing, and shown beside the difference.
"""

import json
import sys


def segments(path):
    segs, cur = [], None
    for line in open(path):
        line = line.rstrip("\n")
        if line.startswith("R "):
            if cur is not None:
                segs.append(cur)
            cur = []
        elif cur is not None:
            cur.append(line)
    if cur is not None:
        segs.append(cur)
    return segs[1:]  # the first is the worker's own load


def by_job(path, jobs_path):
    jobs = json.load(open(jobs_path))["jobs"]
    segs = segments(path)
    out, k = [], 0
    for j in jobs:
        n = max(1, j["children"])
        out.append(segs[k : k + n])
        k += n
    return out, len(segs), k


def strip(lines, kinds):
    return [l.rsplit(" @", 1)[0] for l in lines if l[:1] in kinds]


args = [a for a in sys.argv[1:]]
ctx = 6
kinds = "PSGMQID"
if "--context" in args:
    i = args.index("--context")
    ctx = int(args[i + 1])
    del args[i : i + 2]
if "--kinds" in args:
    i = args.index("--kinds")
    kinds = args[i + 1]
    del args[i : i + 2]
ta, ja, tb, jb = args[:4]
only = set(int(x) for x in args[4:])
A, na, ka = by_job(ta, ja)
B, nb, kb = by_job(tb, jb)
print(f"segments a {na} (jobs use {ka}), b {nb} (jobs use {kb})")
same = 0
for i, (sa, sb) in enumerate(zip(A, B)):
    if only and i not in only:
        continue
    fa = [strip(s, kinds) for s in sa]
    fb = [strip(s, kinds) for s in sb]
    if fa == fb:
        same += 1
        continue
    for c, (x, y) in enumerate(zip(fa, fb)):
        if x == y:
            continue
        d = next((n for n in range(min(len(x), len(y))) if x[n] != y[n]), min(len(x), len(y)))
        rawx = [l for l in sa[c] if l[:1] in kinds]
        rawy = [l for l in sb[c] if l[:1] in kinds]
        print(f"\njob {i} child {c}: first difference at event {d} of {len(x)} / {len(y)}")
        lo = max(0, d - ctx)
        print("  a: " + "\n     ".join(rawx[lo : d + ctx]))
        print("  b: " + "\n     ".join(rawy[lo : d + ctx]))
        break
    else:
        print(f"\njob {i}: {len(fa)} vs {len(fb)} children")
print(f"\nsame {same} of {len(A) if not only else len(only)}")
