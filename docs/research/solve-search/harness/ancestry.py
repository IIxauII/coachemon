#!/usr/bin/env python3
# usage: ancestry.py <run-dir> — at each layer, how many of the beam's nodes lie on a winning line the search found,
# and the steps the winning lines share: the decisions this search could not have got wrong.
import json, sys

d = json.load(open(f"{sys.argv[1]}/summary.json"))
wins = [w["path"] for w in d["wins"]]
key = lambda st: json.dumps(st, sort_keys=True)
lab = lambda st: "wait" if st.get("w") else (">" + st["s"] if st.get("s") else ("T:" if st.get("tera") else "") + st["m"]) + (f"(in:{st['r']})" if st.get("r") else "")
win_prefixes = {tuple(key(s) for s in w[:k]) for w in wins for k in range(len(w) + 1)}
print(f"{len(wins)} winning lines")
for L in d["summary"]["layers"]:
    on = sum(1 for p in L["beam_paths"] if tuple(key(s) for s in p) in win_prefixes)
    print(f"depth {L['depth']:>2}: {on} of {len(L['beam_paths'])} beam nodes lie on a winning line")
if wins:
    shared = []
    for i in range(min(len(w) for w in wins)):
        steps = {key(w[i]) for w in wins}
        shared.append(lab(wins[0][i]) if len(steps) == 1 else "{" + " / ".join(sorted({lab(w[i]) for w in wins})) + "}")
    print("winning lines, step by step:", " · ".join(f"T{i + 1} {s}" for i, s in enumerate(shared)))
