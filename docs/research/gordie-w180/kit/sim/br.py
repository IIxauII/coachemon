#!/usr/bin/env python3
# usage: br.py '<prefix steps>' '<alt1>' '<alt2>' ...   (each a compact string: "DP,>Probopass,>Leavanny,PP,LS")
# tokens: MOVE (abbr ok), >Name = switch, T:MOVE = tera+move, !Name|Name = faint preference from this step on
import json,subprocess,sys,re
AB={'DP':'DRAGON_PULSE','FB':'FICKLE_BEAM','BF':'BLUE_FLARE','HV':'HYPER_VOICE','LS':'LEAF_STORM','BB':'BUG_BITE','PP':'POLLEN_PUFF','HH':'HELPING_HAND',
'BS':'BODY_SLAM','BD':'BELLY_DRUM','ST':'SLEEP_TALK','RE':'REST','HP':'HYDRO_PUMP','HU':'HURRICANE','BO':'BOUNCE','TW':'TWISTER',
'ML':'MEAN_LOOK','PF':'POISON_FANG','VS':'VENOSHOCK','TX':'TOXIC','EP':'EARTH_POWER','ZC':'ZAP_CANNON','PG':'POWER_GEM','TA':'TRI_ATTACK'}
def parse(s):
  out=[]
  for tok in [t.strip() for t in s.split(',') if t.strip()]:
    st={}
    if '!' in tok: tok,f=tok.split('!'); st['faint']=f.split('|')
    if tok.startswith('>'): st['s']=tok[1:]
    elif tok.startswith('T:'): st['m']=AB.get(tok[2:],tok[2:]); st['tera']=True
    else: st['m']=AB.get(tok,tok)
    out.append(st)
  return out
pre=parse(sys.argv[1]); alts=sys.argv[2:] or ['']
scripts=[{'name':a or '(prefix)','steps':pre+parse(a)} for a in alts]
json.dump(scripts,open('/var/folders/r5/2cldn5651rn1630cj_pkvzqh0000gn/T//coachemon-handoff-w180-retry/sim/s-br.json','w'))
r=subprocess.run(['/var/folders/r5/2cldn5651rn1630cj_pkvzqh0000gn/T//coachemon-handoff-w180-retry/sim/sim.sh','/var/folders/r5/2cldn5651rn1630cj_pkvzqh0000gn/T//coachemon-handoff-w180-retry/sim/s-br.json','/var/folders/r5/2cldn5651rn1630cj_pkvzqh0000gn/T//coachemon-handoff-w180-retry/sim/o-br.json'],capture_output=True,text=True)
d=json.load(open('/var/folders/r5/2cldn5651rn1630cj_pkvzqh0000gn/T//coachemon-handoff-w180-retry/sim/o-br.json'))
short=lambda xs:[re.sub(r' \[0,0,0,0,0,0,0\]','',x) for x in xs]
skip=int(sys.argv[0+0] and 0)
for res in d:
  n=len(pre)
  print(f"## {res['name']}  -> {res.get('result','')} {res.get('stopped','')}{(' ERR '+res['error'][:80]) if res.get('error') else ''}")
  turns=res['turns']
  if alts!=[""] : turns=turns[max(0,n):]
  for t in turns:
    st=t['step']; a=('T:' if st.get('tera') else '')+(st.get('m') or ('>'+st.get('s','')))
    msgs=' | '.join(m.replace('\n',' ') for m in t['msgs'] if not re.search(r'sandstorm rages|buffeted|Come back|^Go! ',m))
    print(f"T{t['turn']:>2} {a:<14} {msgs}")
    alive=[x for x in short(t['ours']) if not re.search(r' 0/\d+',x) or '*' in x]
    print('       us:',', '.join(alive)+(' (in:'+t['sentIn']+')' if t.get('sentIn') else ''))
    print('     them:',', '.join(x for x in short(t['foes']) if not re.search(r' 0/\d+',x)))
