#!/usr/bin/env python3
# usage: faint-estimates.py <out.json> [...]
# At a faint prompt the card shows the active foe's move against our send-in as an estimate: checked here against the
# move the foe then used, each decision point once.
import json, re, sys

runs =[r for f in sys.argv[1:] for r in json.load(open(f))]
seen = set()
ok = n = 0
rows = []


def used(tt):
    u = {}
    for m in tt.get('msgs', []):
        m = m.replace('\n', ' ')
        x = re.match(r'Foe (\w+) used (.+)!$', m)
        if x:
            u.setdefault(x[1], x[2])
    return u


for r in runs:
    hist = ''
    for i, t in enumerate(r['turns'][:-1]):
        st = t['step']
        hist += json.dumps(st) + str(t.get('sentIn'))
        nxt = r['turns'][i + 1]
        foe = next((x.split('*')[0] for x in t.get('foes', []) if '*' in x.split(' ')[0]), None)
        fr = t.get('faintRead')
        if fr and hist not in seen and foe:
            lk = {x['name']: x for x in (fr['card'] or {}).get('rows') or []}.get(foe, {}).get('likely')
            u = used(nxt)
            if lk and foe in u and not any('withdrew' in m for m in nxt['msgs']):
                n += 1
                ok += u[foe] == lk['move']
                rows.append(f"{r['name']} after T{t['turn']} faint->{t['sentIn']}: est {lk['move']} p={lk['p']} vs {u[foe]}")
        seen.add(hist)
print("faint-prompt estimate of the active foe's next move:", ok, '/', n)
for x in rows:
    print('  ', x)
