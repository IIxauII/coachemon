#!/usr/bin/env python3
"""A portfolio of beams on one shared pool of solve.test.ts workers, stopping at the first win that replays from T1.

usage: portfolio.py <out-dir> [--workers P] [--beams W:w,W:w,...] [--depth D] [--prefix NAME:N] [--stall N]
                    [--budget N] [--session FILE] [--no-share]

Each beam is search.py's beam (expand every node by every legal action, drop losses, merge children by state
signature, keep the best W by foe HP lost + w x our HP fraction), but the beams advance independently and their
jobs go through one queue:

- Interleaving: a shared queue, fair by expansions. The coordinator holds each beam's pending jobs and writes at most
  P of them into the pool's job directory at a time. The next one comes from the beam with the fewest actions
  dispatched so far, so each beam gets about a third of the pool, and a beam waiting on the tail of its layer leaves
  its workers to the others instead of idling them.
- Sharing: a node expansion is a task keyed by the node's state signature. A beam whose node has a signature that
  another beam has already expanded, or is expanding, waits on that task instead of submitting its own, and adopts
  that node's path (sig() leaves out the RNG, so the children belong to the path that was played). --no-share turns
  this off.
- A layer with a win pauses its beam and replays each of its first five wins from T1 as separate jobs, ahead of
  everything else. The first replayed win ends the job; if none replays, the beam carries on.
- It gives up with "no answer" when every beam has emptied (every line lost or stalled) or reached --depth turns past
  the root, or when the pool has played --budget expansions in all.
"""
import argparse, json, os, resource, shutil, subprocess, sys, threading, time
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import known_lines  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--workers", type=int, default=8)
ap.add_argument("--beams", default="8:0.5,8:1,16:0.5", help="comma-separated width:ours-weight")
ap.add_argument("--depth", type=int, default=40)
ap.add_argument("--prefix", default="")
ap.add_argument("--stall", type=int, default=6)
ap.add_argument("--budget", type=int, default=3000, help="give up after this many expansions in all")
ap.add_argument("--session", default=os.path.join(HERE, "..", "session-w180.json"))
ap.add_argument("--no-share", action="store_true")
a = ap.parse_args()

out = os.path.abspath(a.out)
shutil.rmtree(out, ignore_errors=True)
for d in ("jobs", "claimed", "results", "logs"):
    os.makedirs(os.path.join(out, d))

# ---- workers and memory sampling (as search.py) ----------------------------------------------------------------
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


def since():
    return round(time.time() - t_ready, 1)


# ---- the shared queue ------------------------------------------------------------------------------------------
job_seq = 0
outstanding = {}  # jid -> handler(result)
replay_queue = deque()  # (payload, handler), dispatched before any expansion


def write_job(payload):
    global job_seq
    job_seq += 1
    jid = f"{job_seq:07d}"
    payload["id"] = jid
    tmp = os.path.join(out, f".{jid}.tmp")
    json.dump(payload, open(tmp, "w"))
    os.rename(tmp, os.path.join(out, "jobs", f"{jid}.json"))
    return jid


def score(hp, w):
    return sum(1 - x for x in hp["foes"]) + w * sum(hp["ours"])


prefix = []
if a.prefix:
    name, n = a.prefix.split(":")
    prefix = getattr(known_lines, name)[: int(n)]

tasks = {}  # sig -> task: one node expansion, shared by every beam whose node has that signature
tasks_created = tasks_reused = 0


class Task:
    def __init__(self, key, node, depth, chunks, owner):
        self.key, self.depth, self.owner = key, depth, owner
        self.path, self.hist = node["path"], node.get("hist", [])
        self.cap = node["cap"]
        self.subscribers = []
        self.results = [None] * len(chunks)
        self.left = len(chunks)
        self.children = None
        for i, part in enumerate(chunks):
            payload = {"kind": "expand", "cap": self.cap, "path": self.path if self.cap is None else [], "actions": part}
            owner.pending.append((payload, len(part) if part else 13, lambda res, i=i: self.on_result(i, res)))

    def on_result(self, i, res):
        global children_total
        self.results[i] = res
        children_total += len(res.get("children", []))
        self.left -= 1
        if self.left == 0:
            self.children = self.results
            for b in self.subscribers:
                b.task_done(self)


class Beam:
    def __init__(self, idx, width, w):
        self.idx, self.width, self.w = idx, width, w
        self.name = f"W{width}@{w:g}"
        self.pending = deque()  # (payload, actions, handler) not yet written
        self.dispatched = 0
        self.depth = 0
        self.beam = [{"cap": None, "path": prefix, "score": 0.0, "sig": "ROOT"}]
        self.status = "running"
        self.layers = []
        self.consumed = self.stalled = self.losses = self.errors = 0
        self.tasks_created = self.tasks_reused = 0
        self.wins = []
        self.start_layer()

    def start_layer(self):
        global tasks_created, tasks_reused
        self.t_layer = time.time()
        self.waiting = set()
        total_actions = sum(len(n.get("legal") or [None] * 13) for n in self.beam)
        chunk = max(1, -(-total_actions // (2 * a.workers)))
        self.layer_tasks = []
        for n in self.beam:
            key = n["sig"]
            t = None if a.no_share else tasks.get(key)
            if t is None:
                acts = n.get("legal")
                parts = [acts[i:i + chunk] for i in range(0, len(acts), chunk)] if acts else [None]
                t = Task(key, n, self.depth, parts, self)
                if not a.no_share:
                    tasks[key] = t
                tasks_created += 1
                self.tasks_created += 1
            else:
                tasks_reused += 1
                self.tasks_reused += 1
            self.layer_tasks.append(t)
            if t.children is None:
                t.subscribers.append(self)
                self.waiting.add(id(t))
        if not self.waiting:
            self.finish_layer()

    def task_done(self, t):
        if self.status != "running":
            return
        self.waiting.discard(id(t))
        if not self.waiting:
            self.finish_layer()

    def finish_layer(self):
        self.depth += 1
        cand, layer_wins, losses, err = {}, [], 0, 0
        for t in self.layer_tasks:
            for res in t.children:
                if "fatal" in res:
                    err += 1
                    continue
                for c in res["children"]:
                    self.consumed += 1
                    path = t.path + [c["step"]]
                    if c.get("error"):
                        err += 1
                    elif c["won"]:
                        layer_wins.append({"path": path, "end": c["view"]})
                    elif c["lost"]:
                        losses += 1
                    else:
                        s = score(c["hp"], self.w)
                        hist = t.hist + [sum(1 - x for x in c["hp"]["foes"])]
                        if a.stall and len(hist) > a.stall and hist[-1] <= hist[-1 - a.stall] + 1e-9:
                            self.stalled += 1
                            continue
                        old = cand.get(c["sig"])
                        if old is None or s > old["score"]:
                            cand[c["sig"]] = {"cap": c["cap"], "path": path, "score": s, "view": c["view"],
                                              "legal": c["legal"], "hist": hist, "sig": c["sig"]}
        self.losses += losses
        self.errors += err
        self.beam = sorted(cand.values(), key=lambda n: -n["score"])[: self.width]
        layer = {"depth": self.depth, "distinct": len(cand), "wins": len(layer_wins), "losses": losses, "errors": err,
                 "secs": round(time.time() - self.t_layer, 2), "at": since(), "children_so_far": children_total,
                 "best": self.beam[0]["view"] if self.beam else None, "beam_paths": [n["path"] for n in self.beam],
                 "beam_scores": [round(n["score"], 3) for n in self.beam]}
        self.layers.append(layer)
        print(f"{self.name:>8} L{self.depth:>2} distinct {len(cand):>4} wins {len(layer_wins):>3} losses {losses:>3} "
              f"err {err} {layer['secs']:6.1f}s at {layer['at']:6.1f}s pool total {children_total} "
              f"rss {mem['peak_total_mb']:.0f}MB", flush=True)
        if layer_wins:
            self.wins += layer_wins
            self.status = "replaying"
            start_replay(self, layer_wins[:5])
        else:
            self.next_or_stop()

    def next_or_stop(self):
        if not self.beam:
            self.status = "emptied"
        elif self.depth >= a.depth:
            self.status = "depth cap"
        else:
            self.status = "running"
            self.start_layer()


answer = None
replays = []


def start_replay(beam, wins):
    rec = {"beam": beam.name, "depth": beam.depth, "children_so_far": children_total, "detected_at": since(),
           "results": [None] * len(wins), "wins": wins}
    replays.append(rec)

    def handler(i, res):
        global answer
        ln = (res.get("lines") or [{}])[0]
        rec["results"][i] = {"result": ln.get("result", "fatal: " + str(res.get("fatal"))), "turns": len(ln.get("turns", []))}
        if all(r is not None for r in rec["results"]):
            rec["replayed_at"] = since()
            ok = [i for i, r in enumerate(rec["results"]) if r["result"] == "WIN"]
            print(f"{beam.name:>8} replayed from T1: {[r['result'] for r in rec['results']]} at {rec['replayed_at']}s", flush=True)
            if ok and answer is None:
                w = wins[ok[0]]
                answer = {"beam": beam.name, "depth": beam.depth, "children_so_far": rec["children_so_far"],
                          "detected_at": rec["detected_at"], "replayed_at": rec["replayed_at"], "path": w["path"],
                          "steps": len(w["path"]), "end": w["end"],
                          "alive": sum(1 for x in w["end"]["ours"] if " 0/" not in x),
                          "validated": f"{len(ok)}/{len(rec['results'])}"}
            elif not ok:
                beam.next_or_stop()

    for i, w in enumerate(wins):
        replay_queue.append(({"kind": "lines", "lines": [{"name": f"win{i}", "steps": w["path"]}]},
                             lambda res, i=i: handler(i, res)))


beams = []
for i, spec in enumerate(a.beams.split(",")):
    W, w = spec.split(":")
    beams.append(Beam(i, int(W), float(w)))

stop_reason = None
while True:
    if answer:
        stop_reason = "replayed win"
        break
    over_budget = children_total >= a.budget
    active = [b for b in beams if b.status in ("running", "replaying")]
    if not outstanding and not replay_queue:
        if over_budget:
            stop_reason = "budget"
            break
        if not active:
            stop_reason = "every beam emptied or capped"
            break
    # Dispatch: replays first, then the beam with the fewest actions dispatched.
    while len(outstanding) < a.workers:
        if replay_queue:
            payload, handler = replay_queue.popleft()
            outstanding[write_job(payload)] = handler
            continue
        if over_budget:
            break
        ready = [b for b in beams if b.pending and b.status == "running"]
        if not ready:
            break
        b = min(ready, key=lambda b: (b.dispatched, b.idx))
        payload, n_actions, handler = b.pending.popleft()
        b.dispatched += n_actions
        outstanding[write_job(payload)] = handler
    progressed = False
    for jid in sorted(outstanding):
        f = os.path.join(out, "results", f"{jid}.json")
        if os.path.exists(f):
            res = json.load(open(f))
            os.remove(f)
            outstanding.pop(jid)(res)
            progressed = True
            if answer:
                break
    # A task no running beam can still reach (every one is past its depth) only holds snapshots: drop it.
    if progressed and not a.no_share:
        floor = min([b.depth for b in beams if b.status in ("running", "replaying")] or [0])
        for k in [k for k, t in tasks.items() if t.depth < floor and t.children is not None]:
            del tasks[k]
    if not progressed:
        time.sleep(0.01)

t_end = time.time()
open(os.path.join(out, "stop"), "w").close()
for p in procs:
    try:
        p.wait(timeout=60)
    except subprocess.TimeoutExpired:
        p.kill()
stop_sampling.set()
summary = {
    "args": vars(a), "workers": a.workers, "boot_secs": round(t_ready - t_start, 1),
    "search_secs": round(t_end - t_ready, 1), "stop_reason": stop_reason, "children_total": children_total,
    "children_per_sec": round(children_total / max(t_end - t_ready, 1e-9), 2),
    "tasks_created": tasks_created, "tasks_reused": tasks_reused, "answer": answer, "memory": mem,
    "coordinator_peak_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024, 1),
    "replays": [{k: v for k, v in r.items() if k != "wins"} for r in replays],
    "beams": [{"name": b.name, "width": b.width, "w": b.w, "status": b.status, "depth": b.depth,
               "dispatched_actions": b.dispatched, "children_consumed": b.consumed, "tasks_created": b.tasks_created,
               "tasks_reused": b.tasks_reused, "losses": b.losses, "stalled": b.stalled, "errors": b.errors,
               "wins": len(b.wins), "layers": b.layers} for b in beams],
}
json.dump({"summary": summary, "replays": replays}, open(os.path.join(out, "summary.json"), "w"), indent=1)
print(json.dumps({k: v for k, v in summary.items() if k != "beams"}, indent=1))
for b in summary["beams"]:
    print({k: v for k, v in b.items() if k != "layers"})
