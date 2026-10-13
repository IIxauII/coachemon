#!/usr/bin/env python3
# usage: score.py <out.json> [name ...]
# Scores each command-time card against the turn the engine then played: the enemy's exact move, the predicted switch,
# the predicted send-in after a KO, the ⚔ line against our input, and the fight plan's verdict.
import json, re, sys

d = json.load(open(sys.argv[1]))
want = set(sys.argv[2:])


def active_foe(snap):
    for x in snap:
        if '*' in x.split(' ')[0]:
            return x.split('*')[0]
    return None


def engine(msgs):
    used, withdrew, sent, fainted = {}, None, [], []
    for i, m in enumerate(msgs):
        m = m.replace('\n', ' ')
        if (x := re.match(r'Foe (\w+) used (.+)!$', m)):
            used.setdefault(x[1], x[2])
        if (x := re.match(r'Gordie withdrew (\w+)!', m)):
            withdrew = x[1]
        if (x := re.match(r'Gordie sent out (\w+)!', m)):
            sent.append(x[1])
        if (x := re.match(r'Foe (\w+) fainted!', m)):
            fainted.append(x[1])
    return used, withdrew, sent, fainted


def our_act(st):
    return ('T:' if st.get('tera') else '') + (st.get('m') or ('>' + st.get('s', '')))


MOVE = lambda s: s.replace('_', ' ').title().replace('Up', 'Up')
tallies = {}
for res in d:
    if want and res['name'] not in want:
        continue
    print(f"## {res['name']} -> {res.get('result', '')} {res.get('stopped', '') or ''}")
    print('T  | input        | card ⚔ line                          | foe exact move        | switch pred        | nextIn        | verdict')
    prev = res['start']
    tl = tallies.setdefault(res['name'], {k: [0, 0] for k in ['exact', 'switch', 'noswitch', 'nextIn', 'act']})
    for t in res['turns']:
        h = t.get('hud') or {}
        c, s = h.get('card') or {}, h.get('summary') or {}
        foe = active_foe(prev['foes'])
        used, withdrew, sent, fainted = engine(t.get('msgs', []))
        rows = {r['name']: r for r in c.get('rows') or []}
        f = c.get('field') or {}
        swc = [x for x in f.get('switches') or [] if x.get('out')]
        # The foe's move this turn: its row while we stay, the switch-in's entry hit when the ⚔ line switches (the row
        # then shows the foe's re-pick against the switch-in, for the turn after).
        lk = (rows.get(foe) or {}).get('likely') or {}
        claim, conf = lk.get('move'), lk.get('confidence')
        if swc and (swc[0]['in'].get('takes') or {}).get('move'):
            claim, conf = swc[0]['in']['takes']['move'], 'exact' if conf == 'exact' or (rows.get(foe) or {}).get('likely') is not None else conf
            conf = 'entry'
        ex = ''
        if claim and conf in ('exact', 'entry'):
            if foe in used:
                ok = used[foe] == claim
                tl['exact'][0] += ok; tl['exact'][1] += 1
                ex = f"{claim}{' (entry)' if conf == 'entry' else ''} {'✓' if ok else '✗ ' + used[foe]}"
            else:
                ex = f"{claim} (did not act)"
        elif claim:
            ex = f"{claim} [{conf}]" + (f" ✗ {used[foe]}" if foe in used and used[foe] != claim else (' ✓' if foe in used else ''))
        elif withdrew == foe:
            ex = '—'
        # switch
        sw = [(e['from']['name'], e['to']['name']) for e in c.get('enemySwitches') or [] if e.get('sure')]
        if sw:
            ok = withdrew == sw[0][0] and sent and sent[0] == sw[0][1]
            tl['switch'][0] += ok; tl['switch'][1] += 1
            swt = f"{sw[0][0]}→{sw[0][1]} {'✓' if ok else '✗ ' + str(withdrew)}"
        else:
            ok = withdrew is None
            tl['noswitch'][0] += ok; tl['noswitch'][1] += 1
            swt = 'stays ✓' if ok else f"stays ✗ {withdrew}→{sent[0] if sent else '?'}"
        # nextIn: the foe Gordie sends after this turn's KO, read off the next decision's field.
        ni = f.get('nextIn')
        nit = ''
        foe_now = sw[0][1] if sw else foe
        after = active_foe(t['foes']) if t.get('foes') else None
        if ni:
            if foe_now in fainted and after:
                ok = after == ni['foe']['name']
                tl['nextIn'][0] += ok; tl['nextIn'][1] += 1
                nit = f"{ni['foe']['name']} {'✓' if ok else '✗ ' + str(after)}"
            else:
                nit = f"{ni['foe']['name']} (no KO)"
        elif foe_now in fainted and after:
            nit = f"(none) → {after}"
        # ⚔ line vs input
        card_act = f">{swc[0]['in']['name']} " if swc else ''
        slot = (f.get('slots') or [{}])[0]
        card_act += slot.get('move') or '-'
        st = t['step']
        mine = ('>' + st['s']) if st.get('s') else MOVE(st.get('m', ''))
        same = (st.get('s') and swc and swc[0]['in']['name'] == st['s']) or (not st.get('s') and not swc and MOVE(st.get('m', '')) == (slot.get('move') or ''))
        tl['act'][0] += bool(same); tl['act'][1] += 1
        tp = c.get('teamPlan') or {}
        verdict = (tp.get('result') or '-') if tp else '-'
        print(f"{t['turn']:<3}| {our_act(st):<12} | {('= ' if same else '≠ ') + card_act:<37}| {ex:<22}| {swt:<19}| {nit:<14}| {verdict}"
              + (f"  [faint prompt: card sends {t.get('faintHudPick')}, line sent {t.get('sentIn')}]" if t.get('faintRead') else ''))
        if not h.get('rngKept', True) or h.get('breaches'):
            print('   !! the read moved the RNG or breached its sandbox')
        prev = t if 'foes' in t else prev
    print('tally:', {k: f"{v[0]}/{v[1]}" for k, v in tl.items()})
    print()
