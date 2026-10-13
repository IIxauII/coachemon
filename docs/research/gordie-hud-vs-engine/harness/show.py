#!/usr/bin/env python3
# usage: show.py <out.json> [name ...]
# Per turn: what we did and what the engine did, then what the card read at that turn's decision said.
import json, re, sys

d = json.load(open(sys.argv[1]))
want = set(sys.argv[2:])
strip = lambda xs: [re.sub(r' \[0,0,0,0,0,0,0\]', '', x) for x in xs]
NOISE = r'sandstorm rages|buffeted|Come back|^Go! '


def act(st):
    return ('T:' if st.get('tera') else '') + (st.get('m') or ('>' + st.get('s', '')))


def card_lines(h, ind='     '):
    if not h:
        return [ind + 'card: (none)']
    if h.get('error'):
        return [ind + 'card ERROR: ' + h['error'][:300]]
    c, s = h['card'] or {}, h['summary'] or {}
    out = []
    f = c.get('field') or {}
    sw = '; '.join(f"{(x.get('out') or {}).get('name')}→{x['in']['name']}" + (f" (takes {x['in']['takes']['pct']}% {x['in']['takes']['move']})" if x['in'].get('takes') else '')
                   for x in f.get('switches') or [])
    out.append(ind + f"card[{h['phase']}{'' if h['rngKept'] else ' RNG-MOVED'}{' BREACH' if h['breaches'] else ''}] "
               f"verdict={s.get('verdict')} | act: {s.get('field')}" + (f" | switch: {sw}" if sw else '')
               + (f" | freeEntry {f['freeEntry']['out']['name']}→{f['freeEntry']['in']['name']}" if f.get('freeEntry') else '')
               + (f" | nextIn {f['nextIn']['foe']['name']}←{f['nextIn']['answer']['name']}" if f.get('nextIn') else ''))
    for e in c.get('enemySwitches') or []:
        out.append(ind + f"  predicts switch {e['from']['name']} → {e['to']['name']}{' (sure)' if e.get('sure') else ''}{' (return)' if e.get('back') else ''}")
    for r in c.get('rows') or []:
        lk = r.get('likely')
        pk = r.get('pick')
        if not (lk or r.get('switchTo')) and r['hp'] == 100 and not pk:
            continue
        bits = [f"{r['name']} {r['hp']}%" + (f" tera:{r['tera']}" if r.get('tera') else '')]
        if lk:
            bits.append(f"likely {lk['move']} [{lk['confidence']}{'' if lk.get('p') is None else ' p=' + str(lk['p'])}] first={lk['first']}%")
        if r.get('switchTo'):
            bits.append(f"→{r['switchTo']['name']}")
        if pk:
            bits.append(f"pick {pk['name']} {pk['move']} {pk['pct']}% ko={pk['ko']}" + (' risky' if pk.get('risky') else ''))
        out.append(ind + '  row ' + ' · '.join(bits))
    for dg in s.get('danger') or []:
        out.append(ind + f"  danger {dg['level']}: {dg['mon']} ← {dg['from']} {dg['move']}" + (f" (save for {dg['saveFor']})" if dg.get('saveFor') else ''))
    tp = c.get('teamPlan')
    if tp:
        out.append(ind + f"  plan: {s.get('plan')}")
        win = tp.get('win')
        if win:
            out.append(ind + f"    win-condition {win['name']} KOs {win['kills']}/{win['of']}; reserve " + ', '.join(f"{x['name']}({x['per']}%{' acts' if x['acts'] else ''})" for x in tp.get('reserve') or [])
                       + ('; only ' + ', '.join(f"{x['name']} for {'/'.join(y['name'] for y in x['for'])}" for x in tp.get('only') or []) if tp.get('only') else ''))
        steps = ' › '.join(f"{x['send']['name']}{'(sw)' if x['entry'] == 'switch' else ''} {x['move']}→{x['vs']['name']} [{x['why']}]" for x in tp.get('steps') or [])
        out.append(ind + f"    steps: {steps}")
        if tp.get('prefers'):
            out.append(ind + f"    prefers: {tp['prefers']}")
    return out


for res in d:
    if want and res['name'] not in want:
        continue
    print(f"## {res['name']} -> {res.get('result', '')} {res.get('stopped', '') or ''}{(' ERR ' + res['error'][:120]) if res.get('error') else ''}")
    for t in res['turns']:
        for l in card_lines(t.get('hud')):
            print(l)
        msgs = ' | '.join(m.replace('\n', ' ') for m in t.get('msgs', []) if not re.search(NOISE, m))
        print(f"T{t['turn']:>2} {act(t['step']):<14} {msgs}")
        if 'ours' in t:
            alive = [x for x in strip(t['ours']) if not re.search(r' 0/\d+', x) or '*' in x]
            print('       us:', ', '.join(alive) + (' (in:' + t['sentIn'] + ')' if t.get('sentIn') else ''))
            print('     them:', ', '.join(x for x in strip(t['foes']) if not re.search(r' 0/\d+', x)))
        if t.get('faintRead'):
            print(f"     faint prompt — card send-in: {t.get('faintHudPick')}")
            for l in card_lines(t['faintRead'], '       '):
                print(l)
    print()
