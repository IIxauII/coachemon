#!/usr/bin/env python3
"""Heap-cap runs against their uncapped baselines.

usage: heaptally.py table <baseline-dir> <run-dir>...   one row per run over its first 5 layers (the 521-step workload)
       heaptally.py time <run-dir>                       one row per layer: memory over the whole run

"Same" compares, layer by layer, the children, distinct states, beam paths and beam scores with the baseline's.
Memory up to step 521 is read from mem.jsonl (process trees) and heap.jsonl (the fork's own RSS and heap use after each
job), so a longer run gives the 521-step numbers of its own first 5 layers.
"""
import json, os, sys

N_LAYERS = 5


def load(d):
    s = json.load(open(os.path.join(d, "summary.json")))["summary"]
    mem = [json.loads(l) for l in open(os.path.join(d, "mem.jsonl"))]
    hp = os.path.join(d, "heap.jsonl")
    heap = [json.loads(l) for l in open(hp)] if os.path.exists(hp) else []
    return s, mem, heap


def same(a, b):
    keys = ("children", "distinct", "beam_paths", "beam_scores")
    la, lb = a["layers"][:N_LAYERS], b["layers"][:N_LAYERS]
    if len(la) != len(lb):
        return f"no: {len(la)} layers against {len(lb)}"
    for x, y in zip(la, lb):
        for k in keys:
            if x[k] != y[k]:
                return f"no: L{x['depth']} {k}"
    return "yes"


def table(base, runs):
    print("| run | workers | cap MB | heap limit seen MB | search s (5 layers) | steps/s | pool peak MB | worker tree peak MB "
          "| largest process MB | fork RSS peak MB | fork heap peak MB | same as baseline | aborted |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for d in runs:
        s, mem, heap = load(d)
        L = s["layers"][:N_LAYERS]
        steps = L[-1]["children_so_far"] if L else 0
        secs = sum(x["secs"] for x in L)
        m = [x for x in mem if x["children"] < steps]
        h = [x for x in heap if x["children"] < steps]
        pool = max((sum(x["mb"]) for x in m), default=0)
        tree = max((max(x["mb"]) for x in m), default=0)
        proc = max((max(x.get("proc_mb") or [0]) for x in m), default=0)
        lim = sorted({r.get("heapLimitMb") for r in s.get("ready") or []} - {None})
        b = base.get(s["workers"]) or base.get(1)  # the beam does not depend on the worker count
        print(f"| {os.path.basename(d)} | {s['workers']} | {s.get('heap_cap_mb') or '-'} | {','.join(map(str, lim)) or '?'} "
              f"| {secs:.1f} | {steps / secs if secs else 0:.2f} | {pool:.0f} | {tree:.0f} | {proc:.0f} "
              f"| {max((x['rss_mb'] for x in h), default=0)} | {max((x['heap_mb'] for x in h), default=0)} "
              f"| {same(s, b) + ' (' + str(steps) + ' steps)' if b else '-'} | {s.get('aborted') or '-'} |")


def timeline(d):
    s, mem, heap = load(d)
    print(f"{os.path.basename(d)}: cap {s.get('heap_cap_mb') or '-'} MB, workers {s['workers']}, "
          f"limit seen {[r.get('heapLimitMb') for r in s.get('ready') or []]} MB")
    print("| layer | steps at end | t at end s | worker tree MB (max) | largest process MB (max) | fork RSS MB (min–max) "
          "| fork heap MB (min–max) | live heap after GC MB |")
    print("|---|---|---|---|---|---|---|---|")
    prev = 0
    for x in s["layers"]:
        end = x["children_so_far"]
        m = [y for y in mem if y["children"] == prev]
        h = [y for y in heap if y["children"] == prev]
        t = max((y["t"] for y in m), default=0)
        rss = [y["rss_mb"] for y in h]
        hu = [y["heap_mb"] for y in h]
        lv = [y["live_mb"] for y in h if "live_mb" in y]
        print(f"| {x['depth']} | {end} | {t:.0f} | {max((max(y['mb']) for y in m), default=0)} "
              f"| {max((max(y.get('proc_mb') or [0]) for y in m), default=0)} "
              f"| {min(rss, default=0)}–{max(rss, default=0)} | {min(hu, default=0)}–{max(hu, default=0)} "
              f"| {', '.join(map(str, lv)) or '-'} |")
        prev = end


if sys.argv[1] == "table":
    bdir = sys.argv[2]
    base = {}
    for n in os.listdir(bdir):
        f = os.path.join(bdir, n, "summary.json")
        if n.startswith("p") and n[1:].isdigit() and os.path.exists(f):
            bs = json.load(open(f))["summary"]
            base[bs["workers"]] = bs
    table(base, sys.argv[3:])
else:
    timeline(sys.argv[2])
