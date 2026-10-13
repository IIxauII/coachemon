#!/usr/bin/env python3
# usage: multi.py <scripts.json> <out.json> [jobs]
# One process per script, `jobs` at a time: a reload after a lost line fails in the same process (`getStartingBiome` of
# undefined), and run.sh's unique test names let the processes share the clone.
import json, os, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

scripts = json.load(open(sys.argv[1]))
jobs = int(sys.argv[3]) if len(sys.argv) > 3 else 4
run = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'run.sh')
tmp = tempfile.mkdtemp(prefix='g638-')


def one(i):
    s = os.path.join(tmp, f's{i}.json')
    o = os.path.join(tmp, f'o{i}.json')
    json.dump([scripts[i]], open(s, 'w'))
    subprocess.run([run, s, o], capture_output=True, text=True)
    try:
        return json.load(open(o))[0]
    except Exception as e:
        return {'name': scripts[i]['name'], 'error': f'no output: {e}', 'turns': [], 'start': {'ours': [], 'foes': []}}


with ThreadPoolExecutor(jobs) as ex:
    out = list(ex.map(one, range(len(scripts))))
json.dump(out, open(sys.argv[2], 'w'), indent=1)
for r in out:
    print(f"{r['name']:<28} {r.get('result', '-'):<5} turns={len(r['turns']):<3} {r.get('stopped') or ''}{(' ERR ' + r['error'][:100]) if r.get('error') else ''}")
