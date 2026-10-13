#!/usr/bin/env python3
# usage: claims.py <out.json> [<out.json> ...]
# Tallies every card claim the engine can check, over all runs, each decision point counted once (lines share their
# prefixes): the foe's move, its switch, the send-in after a KO, the ⚔ line's one-hit KOs, the 💀 danger tags, and the
# fight plan's verdict against the result of playing the card's own line from there.
import json, re, sys
from collections import Counter

runs = [r for f in sys.argv[1:] for r in json.load(open(f))]


def active(snap):
    for x in snap:
        if '*' in x.split(' ')[0]:
            return x.split('*')[0]
    return None


def hp(snap, name):
    for x in snap:
        n = x.split(' ')[0].rstrip('*')
        if n == name:
            return int(re.search(r' (\d+)/', x)[1])
    return None


def norm(m):
    return m.replace('\n', ' ')


def key(st):
    return ('T:' if st.get('tera') else '') + (st.get('m') or '>' + st.get('s', '')) + '!' + '|'.join(st.get('faint') or [])


MOVE = lambda s: s.replace('_', ' ').title()
seen = set()
T = Counter()
misses = []
verdicts = []
for r in runs:
    hist = ''
    prev = r['start']
    for i, t in enumerate(r['turns']):
        h = t.get('hud') or {}
        c = h.get('card') or {}
        st = t['step']
        k = hist
        hist += key(st) + (('>' + t['sentIn']) if t.get('sentIn') else '') + ','
        if 'foes' not in t:
            continue
        if k in seen:
            prev = t
            continue
        seen.add(k)
        msgs = [norm(m) for m in t.get('msgs', [])]
        foe = active(prev['foes'])
        me = active(prev['ours'])
        used = {}
        for m in msgs:
            if (x := re.match(r'Foe (\w+) used (.+)!$', m)):
                used.setdefault(x[1], x[2])
        withdrew = next((re.match(r'Gordie withdrew (\w+)!', m)[1] for m in msgs if m.startswith('Gordie withdrew')), None)
        fainted = [re.match(r'Foe (\w+) fainted!', m)[1] for m in msgs if re.match(r'Foe (\w+) fainted!', m)]
        ours_fainted = [re.match(r'(\w+) fainted!', m)[1] for m in msgs if re.match(r'^(\w+) fainted!', m)]
        f = c.get('field') or {}
        rows = {x['name']: x for x in c.get('rows') or []}
        swc = [x for x in f.get('switches') or [] if x.get('out')]
        # 1. the foe's move this turn
        lk = (rows.get(foe) or {}).get('likely') or {}
        claim = (swc[0]['in'].get('takes') or {}).get('move') if swc else (lk.get('move') if lk.get('confidence') in ('exact', 'replay') else None)
        if claim and foe in used:
            T['move checked'] += 1
            if used[foe] == claim:
                T['move right'] += 1
            else:
                misses.append(f"{r['name']} T{t['turn']}: card {claim}, engine {used[foe]}")
        # 2. switches
        sw = [(e['from']['name'], e['to']['name']) for e in c.get('enemySwitches') or [] if e.get('sure')]
        after = active(t['foes'])
        if sw:
            T['switch predicted'] += 1
            if withdrew == sw[0][0] and after == sw[0][1] or (withdrew == sw[0][0] and sw[0][1] in fainted):
                T['switch right'] += 1
            else:
                misses.append(f"{r['name']} T{t['turn']}: card {sw[0][0]}→{sw[0][1]}, engine {withdrew}→{after}")
        else:
            T['stay predicted'] += 1
            if withdrew is None:
                T['stay right'] += 1
            else:
                misses.append(f"{r['name']} T{t['turn']}: card stays, engine {withdrew}→{after}")
        # 3. the send-in after a KO this turn
        now = sw[0][1] if sw else foe
        ni = f.get('nextIn')
        if now in fainted and after and ni:
            T['send-in checked'] += 1
            followed = (st.get('s') and swc and swc[0]['in']['name'] == st['s']) or (not st.get('s') and not swc and MOVE(st.get('m', '')) == ((f.get('slots') or [{}])[0].get('move') or ''))
            if ni['foe']['name'] == after:
                T['send-in right'] += 1
            else:
                misses.append(f"{r['name']} T{t['turn']}: card next in {ni['foe']['name']}, engine {after}" + ('' if followed else ' (our input was not the card\'s)'))
        # 4. one-hit KO claims of the ⚔ line, when we played it and the move went off
        slot = (f.get('slots') or [{}])[0]
        if not swc and not st.get('s') and MOVE(st.get('m', '')) == (slot.get('move') or '') and slot.get('ko') == 1 and slot.get('target'):
            tgt = slot['target']['name']
            went_off = any(m.startswith(f"{me} used {slot['move']}!") for m in msgs)
            if tgt == now and went_off:
                T['1-hit KO claimed'] += 1
                if tgt in fainted:
                    T['1-hit KO right'] += 1
                else:
                    misses.append(f"{r['name']} T{t['turn']}: card {slot['move']} KOs {tgt} in 1, engine left it at {hp(t['foes'], tgt)}")
        # 5. our mon falling this turn: a 💀 ko / after tag or a free entry off it, checked when the foe's named move
        # hit it (not when it missed, or the foe fell or left first)
        tags = [dg for dg in (h.get('summary') or {}).get('danger') or [] if dg['mon'] == me]
        free = (f.get('freeEntry') or {}).get('out', {}).get('name') == me
        if not st.get('s') and me:
            hit_by = used.get(foe) if foe not in fainted or any(m.startswith(f'Foe {foe} used') for m in msgs) else None
            missed = any('avoided the attack' in m for m in msgs)
            fell = me in ours_fainted
            if tags or free:
                named = tags[0]['move'] if tags else None
                if fell:
                    T[f"our KO claimed by {'💀 tag' if tags else 'free entry only'}: right"] += 1
                elif hit_by and (named is None or hit_by == named) and not missed:
                    T[f"our KO claimed by {'💀 tag' if tags else 'free entry only'}: survived the hit"] += 1
                    misses.append(f"{r['name']} T{t['turn']}: card says {me} falls ({tags[0]['level'] if tags else 'free entry'}), took {hit_by} and survived")
                else:
                    T[f"our KO claimed by {'💀 tag' if tags else 'free entry only'}: moot (missed, or the foe fell or left first)"] += 1
            elif fell:
                crit = any('critical hit' in m for m in msgs)
                T['our KO unclaimed' + (' (crit)' if crit else '')] += 1
                misses.append(f"{r['name']} T{t['turn']}: {me} fell with no 💀 tag or free entry on the card" + (' — a crit' if crit else ''))
        prev = t
# The fight plan's verdict where a run starts following the card (`@T<k>` in its name), against how that run ended.
for r in runs:
    m = re.search(r'@T(\d+)', r['name'])
    if not m or not r.get('result'):
        continue
    t = r['turns'][int(m[1]) - 1]
    tp = ((t.get('hud') or {}).get('card') or {}).get('teamPlan')
    if tp:
        verdicts.append((r['name'], tp['result'], r['result']))

print('claims (each decision point once):')
for k in ['move', 'switch', 'stay', 'send-in', '1-hit KO']:
    a = T[f'{k} right']
    b = T[f'{k} checked'] or T[f'{k} predicted'] or T[f'{k} claimed']
    print(f"  {k:<10} {a}/{b}")
for k in sorted(x for x in T if x.startswith('our KO')):
    print(f"  {k}: {T[k]}")
right = sum((v == 'win') == (res == 'WIN') for _, v, res in verdicts)
print(f"  verdict where the card takes over vs. how its own line ended: {right}/{len(verdicts)}")
for name, v, res in verdicts:
    print(f"    {name:<24} card says {'winnable' if v == 'win' else 'likely lost':<12} → {res}")
print('misses:')
for m in misses:
    print('  ', m)
