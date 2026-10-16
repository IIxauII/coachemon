// The shipped beam portfolio (`src/solver/search.ts`), its choices kept exactly, with the scheduling made a choice:
// `fair` is the shipped share by actions dispatched; `priority` serves the earliest beam in the portfolio that has a
// job queued, so later beams only fill idle workers. `earlyWin` replays a win as soon as its job returns, not at the
// end of its layer. Every beam's layers are traced.
import type { Beam } from "../../../../../src/solver/oracle-line.ts";
import type { Action, Child, Hp, Pool, Position } from "../../../../../src/solver/search.ts";

export type Verdict = { won: boolean; why?: string };
export type LayerTrace = { turn: number; spentAfter: number; kept: number; children: number; wins: number; stalled: number };
export type BeamTrace = Beam & { end?: string; endTurn?: number; spent: number; layers: LayerTrace[] };
export type Outcome =
  | { kind: "found"; beam: number; turn: number; path: Action[]; spent: number; beams: BeamTrace[] }
  | { kind: "no_answer"; spent: number; beams: BeamTrace[] };

type Node = { path: Action[]; at: Position; hist: number[]; score: number };
type Run = Beam & { index: number; dispatched: number; spent: number; inFlight: number; outOfBudget: boolean; ended: boolean; trace: BeamTrace };
type Job = { beam: Run; forkPoint: string; inputs: readonly Action[]; done: (c: Child[]) => void; fail: (e: Error) => void };

class Over extends Error {}
const STALL = 6;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const foeLost = (hp: Hp) => sum(hp.foes.map(f => 1 - f));

export function beams(opts: {
  root: Position;
  pool: Pool;
  validate: (path: Action[]) => Promise<Verdict>;
  portfolio: readonly Beam[];
  budget: number;
  turns?: number;
  policy?: "fair" | "priority";
  earlyWin?: boolean;
}): Promise<Outcome> {
  const { root, pool, validate, portfolio, budget, turns = 40, policy = "fair", earlyWin = false } = opts;
  return new Promise(resolve => {
    const runs: Run[] = portfolio.map((b, index) => ({
      ...b,
      index,
      dispatched: 0,
      spent: 0,
      inFlight: 0,
      outOfBudget: false,
      ended: false,
      trace: { ...b, spent: 0, layers: [] },
    }));
    const queue: Job[] = [];
    const tried = new Map<string, Promise<boolean>>();
    let busy = 0;
    let over = false;
    let validating: Promise<unknown> = Promise.resolve();
    const total = () => sum(runs.map(r => r.spent));
    const traces = () => runs.map(r => ({ ...r.trace, spent: r.spent }));
    const finish = (o: Outcome) => {
      if (over) return;
      over = true;
      for (const j of queue.splice(0)) j.fail(new Over());
      resolve(o);
    };
    const better = (a: Run, b: Run) =>
      policy === "priority" ? a.index < b.index : a.dispatched < b.dispatched || (a.dispatched === b.dispatched && a.index < b.index);
    const pump = () => {
      while (!over && busy < pool.size && queue.length > 0) {
        const next = queue.reduce((best, j) => (better(j.beam, best.beam) ? j : best));
        queue.splice(queue.indexOf(next), 1);
        const { beam, inputs } = next;
        if (beam.spent + beam.inFlight >= budget) {
          beam.outOfBudget = true;
          next.done([]);
          continue;
        }
        busy++;
        beam.dispatched += inputs.length;
        beam.inFlight += inputs.length;
        pool.expand(next.forkPoint, inputs).then(
          children => {
            busy--;
            beam.inFlight -= inputs.length;
            if (over) return;
            beam.spent += children.length;
            next.done(children);
            pump();
          },
          e => {
            busy--;
            next.fail(e);
          },
        );
      }
    };
    const expand = (beam: Run, forkPoint: string, inputs: readonly Action[]) =>
      new Promise<Child[]>((done, fail) => {
        if (over) return fail(new Over());
        queue.push({ beam, forkPoint, inputs, done, fail });
        pump();
      });
    /** One replay at a time, as the shipped search; a path already replayed is not replayed again. */
    const replaysAsWin = (beam: Run, turn: number, path: Action[]): Promise<boolean> => {
      const key = JSON.stringify(path);
      let p = tried.get(key);
      if (!p) {
        p = validating.then(async () => (over ? false : (await validate(path)).won));
        tried.set(key, p);
        validating = p.catch(() => {});
      }
      return p.then(won => {
        if (won) finish({ kind: "found", beam: beam.index, turn, path, spent: total(), beams: traces() });
        return won;
      });
    };
    const end = (beam: Run, why: string, turn: number) => {
      beam.ended = true;
      beam.trace.end = why;
      beam.trace.endTurn = turn;
      if (runs.every(r => r.ended)) finish({ kind: "no_answer", spent: total(), beams: traces() });
    };
    const layer = async (beam: Run, nodes: Node[], turn: number) => {
      const chunk = Math.max(1, Math.ceil(sum(nodes.map(n => n.at.legal.length)) / (2 * pool.size)));
      const jobs = nodes.flatMap(node => {
        const parts: Action[][] = [];
        for (let i = 0; i < node.at.legal.length; i += chunk) parts.push(node.at.legal.slice(i, i + chunk));
        return parts.map(async part => {
          const children = await expand(beam, node.at.forkPoint, part);
          if (earlyWin) {
            for (const c of children) if (c.end === "won") void replaysAsWin(beam, turn, [...node.path, c.input]);
          }
          return children.map(child => ({ node, child }));
        });
      });
      return (await Promise.all(jobs)).flat();
    };
    const run = async (beam: Run) => {
      let nodes: Node[] = [{ path: [], at: root, hist: [], score: 0 }];
      for (let turn = 1; ; turn++) {
        let children;
        try {
          children = await layer(beam, nodes, turn);
        } catch (e) {
          if (e instanceof Over) return;
          throw e;
        }
        if (over) return;
        const wins: { path: Action[]; oursLeft: number }[] = [];
        const kept = new Map<string, Node>();
        let stalled = 0;
        for (const { node, child } of children) {
          const path = [...node.path, child.input];
          if (child.end === "won") wins.push({ path, oursLeft: sum(child.hp.ours) });
          if (child.end !== "on") continue;
          const lost = foeLost(child.at.hp);
          const hist = [...node.hist, lost];
          if (hist.length > STALL && lost <= hist[hist.length - 1 - STALL] + 1e-9) {
            stalled++;
            continue;
          }
          const score = lost + beam.ours * sum(child.at.hp.ours);
          const same = kept.get(child.at.sig);
          if (same === undefined || score > same.score) kept.set(child.at.sig, { path, at: child.at, hist, score });
        }
        beam.trace.layers.push({ turn, spentAfter: beam.spent, kept: kept.size, children: children.length, wins: wins.length, stalled });
        wins.sort((a, b) => b.oursLeft - a.oursLeft);
        for (const w of wins) {
          if (await replaysAsWin(beam, turn, w.path)) return;
          if (over) return;
        }
        if (beam.outOfBudget) return end(beam, "budget", turn);
        nodes = [...kept.values()].sort((a, b) => b.score - a.score).slice(0, beam.width);
        if (nodes.length === 0) return end(beam, stalled > 0 ? "stalled" : "emptied", turn);
        if (turn >= turns) return end(beam, "turns", turn);
      }
    };
    for (const r of runs) run(r).catch(e => finish({ kind: "no_answer", spent: total(), beams: [{ ...r.trace, end: `error: ${e}` } as BeamTrace] }));
  });
}
