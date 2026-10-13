#!/usr/bin/env python3
"""Beam search over per-turn decisions, on a pool of long-lived solve.test.ts workers.

usage: search.py <out-dir> [--workers P] [--width W] [--depth D] [--prefix NAME:N] [--all-wins] [--ours-weight X]
                 [--session FILE] [--budget-children N] [--stall N] [--setup FILE]

Each layer expands every node in the beam by every legal action (moves, Tera + move while Tera is available,
switches, and every legal replacement when one of ours faints), scores the children, drops losses, merges
children that reach the same state, and keeps the best W. It stops at the first layer that holds a win,
unless --all-wins. A node is a snapshot taken at a command prompt (solve.test.ts capture/patch); the root is the
T1 save, or the T1 save plus a replayed prefix of a known line (--prefix WIN:4 = the winning line's first 4 steps).
"""
import argparse, json, os, shutil, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import known_lines  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--workers", type=int, default=4)
ap.add_argument("--width", type=int, default=8)
ap.add_argument("--depth", type=int, default=40)
ap.add_argument("--prefix", default="")
ap.add_argument("--all-wins", action="store_true")
ap.add_argument("--ours-weight", type=float, default=0.5)
ap.add_argument("--session", default=os.path.join(HERE, "..", "session-w180.json"))
ap.add_argument("--budget-children", type=int, default=0, help="stop after this many child evaluations")
ap.add_argument("--stall", type=int, default=0, help="drop a node whose foes have lost no HP in this many turns")
ap.add_argument("--setup", default="", help="JSON file: solve.test.ts setup applied to the T1 save (movesets, PP left)")
a = ap.parse_args()
SETUP = json.load(open(a.setup)) if a.setup else None

out = os.path.abspath(a.out)
shutil.rmtree(out, ignore_errors=True)
for d in ("jobs", "claimed", "results", "logs"):
    os.makedirs(os.path.join(out, d))

# ---- workers and memory sampling -------------------------------------------------------------------------------
env = dict(os.environ, SS_MODE="worker", SS_DIR=out, SS_SESSION=os.path.abspath(a.session))
procs = [subprocess.Popen([os.path.join(HERE, "run.sh"), os.path.join(out, "logs", f"w{i}.log")], env=env)
         for i in range(a.workers)]
mem = {"peak_total_mb": 0.0, "peak_worker_mb": 0.0, "samples": 0}
children_total = 0
stop_sampling = threading.Event()


def tree_rss():
    ps = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,rss="], capture_output=True, text=True).stdout.split("\n")
    kids, rss = {}, {}
    for line in ps:
        f = line.split()
        if len(f) == 3:
            pid, ppid, r = map(int, f)
            kids.setdefault(ppid, []).append(pid)
            rss[pid] = r
    per = []
    for p in procs:
        tot, stack = 0, [p.pid]
        while stack:
            q = stack.pop()
            tot += rss.get(q, 0)
            stack += kids.get(q, [])
        per.append(tot / 1024)
    return per


def sampler():
    log = open(os.path.join(out, "mem.jsonl"), "w")
    while not stop_sampling.is_set():
        per = tree_rss()
        log.write(json.dumps({"t": round(time.time() - t_start, 1), "mb": [round(x) for x in per], "children": children_total}) + "\n")
        log.flush()
        mem["peak_total_mb"] = max(mem["peak_total_mb"], sum(per))
        mem["peak_worker_mb"] = max(mem["peak_worker_mb"], max(per) if per else 0)
        mem["samples"] += 1
        time.sleep(0.5)


threading.Thread(target=sampler, daemon=True).start()
t_start = time.time()
while len([f for f in os.listdir(out) if f.startswith("ready.")]) < a.workers:
    if any(p.poll() is not None for p in procs):
        sys.exit("a worker exited before it was ready; see logs/")
    time.sleep(0.1)
t_ready = time.time()

# ---- search ----------------------------------------------------------------------------------------------------
job_seq = 0


def submit(payload):
    global job_seq
    job_seq += 1
    jid = f"{job_seq:07d}"
    payload["id"] = jid
    if SETUP:
        payload["setup"] = SETUP
    tmp = os.path.join(out, f".{jid}.tmp")
    json.dump(payload, open(tmp, "w"))
    os.rename(tmp, os.path.join(out, "jobs", f"{jid}.json"))
    return jid


def collect(ids):
    want, got = set(ids), {}
    while want:
        for jid in list(want):
            f = os.path.join(out, "results", f"{jid}.json")
            if os.path.exists(f):
                got[jid] = json.load(open(f))
                os.remove(f)
                want.discard(jid)
        time.sleep(0.01)
    return [got[i] for i in ids]


def score(hp):
    return sum(1 - x for x in hp["foes"]) + a.ours_weight * sum(hp["ours"])


prefix = []
if a.prefix:
    name, n = a.prefix.split(":")
    prefix = getattr(known_lines, name)[: int(n)]

beam = [{"cap": None, "path": prefix, "score": 0.0}]
layers, wins, first_win = [], [], None
children_total = losses_total = errors_total = stalled_total = 0
for depth in range(a.depth):
    t0 = time.time()
    # Split each node's actions into chunks so that a narrow beam still keeps every worker busy.
    total_actions = sum(len(n.get("legal") or [None] * 13) for n in beam)
    chunk = max(1, -(-total_actions // (2 * a.workers)))
    owners, ids = [], []
    for n in beam:
        acts = n.get("legal")
        parts = [acts[i:i + chunk] for i in range(0, len(acts), chunk)] if acts else [None]
        for part in parts:
            ids.append(submit({"kind": "expand", "cap": n["cap"], "path": n["path"] if n["cap"] is None else [],
                               "actions": part}))
            owners.append(n)
    results = collect(ids)
    cand, layer_wins, layer_losses, layer_err = {}, [], 0, 0
    for node, res in zip(owners, results):
        if "fatal" in res:
            layer_err += 1
            continue
        for c in res["children"]:
            children_total += 1
            path = node["path"] + [c["step"]]
            if c.get("error"):
                layer_err += 1
            elif c["won"]:
                layer_wins.append({"path": path, "end": c["view"]})
            elif c["lost"]:
                layer_losses += 1
            else:
                s = score(c["hp"])
                foe_dmg = sum(1 - x for x in c["hp"]["foes"])
                hist = node.get("hist", []) + [foe_dmg]
                if a.stall and len(hist) > a.stall and hist[-1] <= hist[-1 - a.stall] + 1e-9:
                    stalled_total += 1
                    continue
                old = cand.get(c["sig"])
                if old is None or s > old["score"]:
                    cand[c["sig"]] = {"cap": c["cap"], "path": path, "score": s, "view": c["view"], "legal": c["legal"],
                                      "hist": hist}
    losses_total += layer_losses
    errors_total += layer_err
    beam = sorted(cand.values(), key=lambda n: -n["score"])[: a.width]
    layer = {"depth": depth + 1, "nodes": len(results), "children": sum(len(r.get("children", [])) for r in results),
             "distinct": len(cand), "wins": len(layer_wins), "losses": layer_losses, "errors": layer_err,
             "secs": round(time.time() - t0, 2), "children_so_far": children_total,
             "best": beam[0]["view"] if beam else None, "beam_paths": [n["path"] for n in beam],
             "beam_scores": [round(n["score"], 3) for n in beam]}
    layers.append(layer)
    print(f"L{depth + 1:>2} nodes {layer['nodes']:>3} children {layer['children']:>4} distinct {layer['distinct']:>4} "
          f"wins {layer['wins']:>3} losses {layer_losses:>3} err {layer_err} {layer['secs']:6.1f}s "
          f"total {children_total} rss {mem['peak_total_mb']:.0f}MB", flush=True)
    if layer_wins:
        wins += layer_wins
        if first_win is None:
            first_win = {"depth": depth + 1, "children_so_far": children_total, "secs": round(time.time() - t_ready, 1),
                         "path": layer_wins[0]["path"], "end": layer_wins[0]["end"]}
        if not a.all_wins:
            break
    if not beam:
        break
    if a.budget_children and children_total >= a.budget_children:
        break

t_end = time.time()
# A line found on snapshots is an answer only once it replays from the save: replay the first wins from T1.
validated = []
if wins:
    res = collect([submit({"kind": "lines", "lines": [{"name": f"win{i}", "steps": w["path"]} for i, w in enumerate(wins[:5])]})])[0]
    validated = [{"name": ln["name"], "result": ln["result"], "turns": len(ln["turns"])} for ln in res.get("lines", [])]
    if "fatal" in res:
        validated = [{"fatal": res["fatal"]}]
    print("replayed from T1:", validated, flush=True)
t_validated = time.time()
open(os.path.join(out, "stop"), "w").close()
for p in procs:
    try:
        p.wait(timeout=60)
    except subprocess.TimeoutExpired:
        p.kill()
stop_sampling.set()
summary = {
    "args": vars(a), "workers": a.workers, "boot_secs": round(t_ready - t_start, 1),
    "search_secs": round(t_end - t_ready, 1), "children_total": children_total, "losses_total": losses_total,
    "errors_total": errors_total, "stalled_total": stalled_total, "first_win": first_win, "wins": len(wins), "memory": mem, "layers": layers,
    "children_per_sec": round(children_total / max(t_end - t_ready, 1e-9), 2),
    "validated": validated, "validate_secs": round(t_validated - t_end, 1),
}
json.dump({"summary": summary, "wins": wins}, open(os.path.join(out, "summary.json"), "w"), indent=1)
print(json.dumps({k: v for k, v in summary.items() if k != "layers"}, indent=1))
