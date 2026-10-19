"""Two bench runs' children (profile.ts's children.jsonl), compared child by child: the bench jobs that differ, and what
each differing child came back as.

usage: python3 -I children_diff.py <reference-run-dir> <run-dir>
"""

import json
import os
import sys
from collections import Counter


def children(d):
    out = {}
    for r in map(json.loads, open(os.path.join(d, "children.jsonl"))):
        out[r["i"]] = r["c"] if r["c"].startswith("error:") else json.loads(r["c"])
    return out


def main():
    ref, run = children(sys.argv[1]), children(sys.argv[2])
    differ = [i for i in sorted(run) if run[i] != ref[i]]
    kinds = Counter()
    for i in differ:
        if isinstance(run[i], str):
            kinds[run[i]] += 1
            continue
        for want, got in zip(ref[i], run[i]):
            if want != got:
                kinds[got["end"] + (f" ({got['why']})" if got["end"] == "dropped" else "")] += 1
    print(f"bench jobs: {len(run)}, same {len(run) - len(differ)}, differ {len(differ)}: {differ}")
    print("differing children, as the run returned them:")
    for k, n in kinds.most_common():
        print(f"  {n:4d}  {k}")


if __name__ == "__main__":
    main()
