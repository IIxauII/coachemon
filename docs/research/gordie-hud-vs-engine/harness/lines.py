#!/usr/bin/env python3
# usage: lines.py <out.json> <name>=<tokens> [<name>=<tokens>[@follow]] ...
# Tokens as #632's br.py: a move abbreviation or MOVE_ID, >Name switch, T:MOVE Tera + move, X!A|B faint order from that
# step on, plus H = take the card's own action this turn, and !hud = take the card's send-in at faint prompts.
# A trailing @N on a line keeps following the card for N more turns after its tokens.
import json, sys

AB = {'DP': 'DRAGON_PULSE', 'FB': 'FICKLE_BEAM', 'BF': 'BLUE_FLARE', 'HV': 'HYPER_VOICE', 'LS': 'LEAF_STORM',
      'BB': 'BUG_BITE', 'PP': 'POLLEN_PUFF', 'HH': 'HELPING_HAND', 'BS': 'BODY_SLAM', 'BD': 'BELLY_DRUM',
      'ST': 'SLEEP_TALK', 'RE': 'REST', 'HP': 'HYDRO_PUMP', 'HU': 'HURRICANE', 'BO': 'BOUNCE', 'TW': 'TWISTER',
      'ML': 'MEAN_LOOK', 'PF': 'POISON_FANG', 'VS': 'VENOSHOCK', 'TX': 'TOXIC', 'EP': 'EARTH_POWER',
      'ZC': 'ZAP_CANNON', 'PG': 'POWER_GEM', 'TA': 'TRI_ATTACK'}

LINES = {
    # The 19-turn line #632 found and played (PLAN.md); faint replacements T13 Golbat, T15 Gyarados.
    'win': 'DP,>Probopass,>Leavanny,PP,BB,LS,BB,LS,>Reshiram,DP,>Leavanny,LS,BB!Golbat,TX,VS!Gyarados,T:HP!Reshiram,HP,HP,HP',
    # Attempt 1's 23 inputs (kit HANDOFF.md turn log); faint replacements T11 Leavanny, T15 Reshiram, T18 Gyarados,
    # T20 Golbat, T22 Leavanny.
    'a1': 'DP,>Probopass,EP,>Leavanny,LS,LS,>Probopass,>Gyarados,HP,>Probopass,EP!Leavanny,LS,>Snorlax,BS,BS!Reshiram,'
          'DP,DP,DP!Gyarados,HP,HP!Golbat,VS,TX!Leavanny,LS',
}


def parse(s):
    out = []
    for tok in [t.strip() for t in s.split(',') if t.strip()]:
        st = {}
        if '!' in tok:
            tok, f = tok.split('!')
            st['faint'] = f.split('|')
        if tok == 'H':
            st['hud'] = True
        elif tok.startswith('>'):
            st['s'] = tok[1:]
        elif tok.startswith('T:'):
            st['m'] = AB.get(tok[2:], tok[2:])
            st['tera'] = True
        elif tok:
            st['m'] = AB.get(tok, tok)
        out.append(st)
    return out


scripts = []
for arg in sys.argv[2:]:
    name, body = arg.split('=', 1)
    follow = 0
    if '@' in body:
        body, n = body.rsplit('@', 1)
        follow = int(n)
    body = LINES.get(body, body)
    scripts.append({'name': name, 'steps': parse(body), 'follow': follow})
json.dump(scripts, open(sys.argv[1], 'w'), indent=1)
print(f"{len(scripts)} script(s): " + ', '.join(f"{s['name']} ({len(s['steps'])}+{s['follow']})" for s in scripts))
