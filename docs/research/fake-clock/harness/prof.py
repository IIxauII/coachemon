"""Where a worker's time goes, from a V8 .cpuprofile: self time by source, the harness steps' inclusive time, and the
heaviest functions.  usage: python3 -I prof.py <file.cpuprofile> [top=40] [--patch-lines <from>-<to>]
A copy of solve-speed's prof.py that leaves out the worker's boot (every sample before the first one inside the
harness's `expand`). `--patch-lines` names the lines of the test file the fake clock was spliced into (cpu.sh works them
out); code there counts as the fake clock's, not the harness's."""
import json
import sys
from collections import Counter, defaultdict

argv = sys.argv[1:]
patch_lines = (0, -1)
if "--patch-lines" in argv:
    i = argv.index("--patch-lines")
    patch_lines = tuple(int(x) for x in argv[i + 1].split("-"))
    del argv[i : i + 2]
prof = json.load(open(argv[0]))
top = int(argv[1]) if len(argv) > 1 else 40
nodes = {n["id"]: n for n in prof["nodes"]}
parent = {}
for n in prof["nodes"]:
    for c in n.get("children", []):
        parent[c] = n["id"]


def source(cf):
    url, fn = cf.get("url", ""), cf["functionName"]
    if fn in ("(idle)", "(garbage collector)", "(program)", "(root)"):
        return fn
    if "coach-worker" in url:
        in_patch = patch_lines[0] <= cf.get("lineNumber", -1) + 1 <= patch_lines[1]
        return "fake clock (driver, timers, waitUntil)" if in_patch else "harness (the coach test file)"
    for key, name in [
        ("i18next", "i18next (text lookups)"),
        ("/phaser/", "Phaser (graphics, tweens, timers)"),
        ("jsdom", "jsdom"),
        ("tinyspy", "vitest spies (tinyspy)"),
        ("@vitest", "vitest"),
        ("/vitest/", "vitest"),
        ("/test/framework/", "test framework"),
        ("/test/helpers/", "test framework"),
        ("/test/setup/", "test framework"),
        ("/test/", "test framework"),
        ("/src/ui/", "game: ui"),
        ("/src/phases/", "game: phases"),
        ("/src/system/", "game: save/load (system)"),
        ("/src/field/", "game: field (pokemon, arena)"),
        ("/src/data/", "game: data (moves, abilities, tags)"),
        ("/src/modifier/", "game: items (modifiers)"),
        ("/src/", "game: other"),
        ("node_modules", "other dependencies"),
        ("node:", "node internals"),
    ]:
        if key in url:
            return name
    return "native (JSON, builtins, regexp)" if url == "" else "other"


STEPS = ["restore", "loadSession", "reload", "sweep", "putBack", "turn", "command", "position", "forkPoint", "sig", "legal", "hp",
         "expand", "strayPrompts", "reloadSession", "parseSessionData", "getSessionSaveData", "initSessionFromData", "to", "run",
         "waitUntil", "startBattle", "t", "addPokemonIcon", "addPokemonSprite"]
self_by = Counter()
incl = Counter()
fn_self = Counter()
total = 0
cache = {}
def in_expand(sid):
    x = sid
    while x in nodes:
        c = nodes[x]["callFrame"]
        if c["functionName"] == "expand" and "coach-worker" in c.get("url", ""):
            return True
        x = parent.get(x)
    return False


started = False
for sid, dt in zip(prof["samples"], prof["timeDeltas"]):
    if not started:
        started = in_expand(sid)
        if not started:
            continue
    total += dt
    n = nodes[sid]
    cf = n["callFrame"]
    self_by[source(cf)] += dt
    fn_self[(cf["functionName"] or "(anon)", cf.get("url", "").split("/")[-1], cf.get("lineNumber", 0))] += dt
    if sid not in cache:
        names = set()
        x = sid
        while x in nodes:
            c = nodes[x]["callFrame"]
            if c["functionName"] in STEPS and ("coach-worker" in c.get("url", "") or c["functionName"] in
                                                ("reloadSession", "parseSessionData", "getSessionSaveData", "initSessionFromData", "to", "run", "waitUntil", "t", "startBattle")):
                names.add(c["functionName"] + ("" if "coach-worker" in c.get("url", "") else f" ({c.get('url','').split('/')[-1]})"))
            x = parent.get(x)
        cache[sid] = names
    for name in cache[sid]:
        incl[name] += dt

ms = lambda us: us / 1000
busy = total - self_by["(idle)"]
print(f"profile, from the first job on: {ms(total)/1000:.1f} s sampled, {ms(self_by['(idle)'])/1000:.1f} s idle, {ms(busy)/1000:.1f} s busy")
print("\nself time by source (share of busy):")
for k, v in self_by.most_common():
    if k == "(idle)":
        continue
    print(f"  {k:40s} {ms(v)/1000:7.2f} s  {100*v/busy:5.1f}%")
print("\ninclusive time of steps (share of busy; nested steps overlap):")
for k, v in incl.most_common(30):
    print(f"  {k:40s} {ms(v)/1000:7.2f} s  {100*v/busy:5.1f}%")
print(f"\ntop {top} functions by self time:")
for (fn, f, line), v in fn_self.most_common(top):
    print(f"  {100*v/busy:5.1f}%  {fn} ({f}:{line+1})")
