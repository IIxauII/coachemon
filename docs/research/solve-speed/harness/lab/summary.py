"""One line per lab run under the given directories: method, result, turn, tries (requested, unique), turns played on
the game, seconds.  usage: python3 -I summary.py <dir>..."""
import glob
import json
import os
import sys

for d in sys.argv[1:]:
    for f in sorted(glob.glob(os.path.join(d, "**", "*.json"), recursive=True)):
        try:
            x = json.load(open(f))
        except Exception:
            continue
        if "tally" not in x:
            continue
        r = x["result"]
        t = x["tally"]
        extra = r.get("extra") or ""
        steps = " ".join(f"W{s['width']}:{s['kind']}@{s['triesAfter']}({s['beam'].get('end') or ''})" for s in r.get("steps", []))
        beams = " ".join(
            f"[{b['width']}/{b['ours']} {b.get('end') or 'on'} L{len(b['layers'])} {b['spent']}]" for b in r.get("beams", [])
        )
        print(
            f"{x['fight']:18s} {x['method']:40s} {'share' if x.get('share') else '':5s} w{x['workers']} {r['kind']:9s} "
            f"T{r.get('turn','-')!s:3s} req {t['requested']:5d} uniq {t['unique']:5d} played {t['played']:5d} "
            f"{x['seconds']:6.0f}s {r.get('why','')} {extra} {steps} {beams}"
        )
