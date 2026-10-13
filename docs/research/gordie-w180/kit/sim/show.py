import json,sys,re
d=json.load(open(sys.argv[1]))
short=lambda xs:[re.sub(r' \[.*\]','',x) for x in xs]
for r in d:
  print('##',r['name'],r['seed'],r.get('result','(unfinished)'))
  for t in r['turns']:
    st=t['step']; a=('tera+' if st.get('tera') else '')+(st.get('m') or ('->'+st.get('s','')))
    msgs=' | '.join(m.replace('\n',' ') for m in t['msgs'] if not re.search(r'sandstorm rages|buffeted',m))
    print(f"T{t['turn']:>2} {a:<16} {msgs}")
    act=lambda xs:[x for x in xs if '*' in x]
    print('     ours:',', '.join(short([x for x in t['ours'] if not x.endswith(' 0/'+x.split('/')[-1]) or '*' in x])))
    print('     foes:',', '.join(short(t['foes'])), ('sentIn:'+t['sentIn']) if t.get('sentIn') else '')
