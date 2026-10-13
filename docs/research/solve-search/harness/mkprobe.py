#!/usr/bin/env python3
# usage: mkprobe.py <out-job.json> — the one-process probes: several lines in one process (including after a loss)
# and fork fidelity along the winning line and attempt 1.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from known_lines import A1, WIN

quick = len(sys.argv) > 2 and sys.argv[2] == "quick"
jobs = [
    {"id": "Lq", "kind": "lines", "lines": [
        {"name": "win1", "steps": WIN}, {"name": "a1", "steps": A1}, {"name": "win2-after-loss", "steps": WIN},
    ]},
    {"id": "F", "kind": "forkcheck", "steps": WIN},
] if quick else [
    {"id": "L", "kind": "lines", "lines": [
        {"name": "win1", "steps": WIN}, {"name": "win2", "steps": WIN}, {"name": "a1", "steps": A1},
        {"name": "win3-after-loss", "steps": WIN}, {"name": "a1-again", "steps": A1}, {"name": "win4", "steps": WIN},
    ]},
    {"id": "F", "kind": "forkcheck", "steps": WIN},
    {"id": "FA", "kind": "forkcheck", "steps": A1},
]
json.dump({"jobs": jobs}, open(sys.argv[1], "w"))
