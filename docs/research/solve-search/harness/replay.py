#!/usr/bin/env python3
# usage: replay.py <summary.json> <job-dir> [N] — replay the first N wins a search found, from the T1 save in a fresh
# process, with every message: a line is only an answer once it replays from the save (replay protocol step 5).
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import known_lines  # noqa: E402

d = json.load(open(sys.argv[1]))
n = int(sys.argv[3]) if len(sys.argv) > 3 else 1
prefix = []
pre = d["summary"]["args"].get("prefix")
lines = [{"name": f"win{i}", "steps": w["path"]} for i, w in enumerate(d["wins"][:n])]
os.makedirs(sys.argv[2], exist_ok=True)
json.dump({"jobs": [{"id": "R", "kind": "lines", "msgs": True, "lines": lines}]}, open(os.path.join(sys.argv[2], "job.json"), "w"))
