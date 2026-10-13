#!/usr/bin/env python3
# usage: branches.py <out.json> [...]
# One line per run: the inputs from its branch point (the `@T<k>` in its name) with faints and Gordie's switches, the
# result, the survivors, and the fight plan's verdict at each turn (W winnable, L likely lost).
import json, re, sys

strip = lambda xs: [re.sub(r' \[[-\d,]+\]', '', x) for x in xs]
for f in sys.argv[1:]:
    for r in json.load(open(f)):
        m = re.search(r'@T(\d+)', r['name'])
        k = int(m[1]) if m else 1
        acts = []
        for t in r['turns'][k - 1:]:
            st = t['step']
            a = ('T:' if st.get('tera') else '') + (st.get('m') or ('>' + st.get('s', '')))
            a = a.replace('_', ' ').title().replace(' ', '')
            ev = []
            for msg in t.get('msgs', []):
                msg = msg.replace('\n', ' ')
                if 'fainted' in msg:
                    ev.append(msg.replace(' fainted!', '✝').replace('Foe ', ''))
                if 'withdrew' in msg:
                    ev.append(msg.replace('Gordie withdrew ', 'sw:').rstrip('!'))
            if t.get('sentIn'):
                ev.append('in:' + t['sentIn'])
            acts.append(f"T{t['turn']} {a}" + (' (' + ', '.join(ev) + ')' if ev else ''))
        snap = next((t for t in reversed(r['turns']) if t.get('ours')), r['start'])
        verdicts = ''.join({'win': 'W', 'loss': 'L', 'stall': 'L'}.get((((t.get('hud') or {}).get('card') or {}).get('teamPlan') or {}).get('result'), '-') for t in r['turns'])
        print(f"## {r['name']} -> {r.get('result') or r.get('stopped')}")
        print('    from T%d: ' % k + ' · '.join(acts))
        print('    end us:', ', '.join(x for x in strip(snap.get('ours', [])) if not re.search(r' 0/\d+', x)) or '-',
              '| them:', ', '.join(x for x in strip(snap.get('foes', [])) if not re.search(r' 0/\d+', x)) or '-')
        print('    verdict by turn (T1…):', verdicts)
