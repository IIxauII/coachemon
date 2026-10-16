// Search methods other than the beam, over the same `Pool` and the same score as the beam
// (Σ foe HP lost + w × Σ our HP fraction), the same stall rule (6 turns with no foe HP lost) and the same 40-turn limit.
import type { Action, Child, Hp, Pool, Position } from "../../../../../src/solver/search.ts";
import type { Verdict } from "./beam.ts";

const STALL = 6;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const foeLost = (hp: Hp) => sum(hp.foes.map(f => 1 - f));

export type Found = { kind: "found"; path: Action[]; turn: number; tries: number; extra?: object };
export type None = { kind: "no_answer"; why: string; tries: number; extra?: object };
type Node = { path: Action[]; at: Position; hist: number[]; score: number; depth: number };
type Ctx = { pool: Pool; validate: (path: Action[]) => Promise<Verdict>; ours: number; budget: number; turns?: number };

class Spent extends Error {}

/** Every action of a node, spread over the pool, as the beam spreads a layer. */
async function expandNode(pool: Pool, node: Node): Promise<Child[]> {
  const chunk = Math.max(1, Math.ceil(node.at.legal.length / pool.size));
  const parts: Action[][] = [];
  for (let i = 0; i < node.at.legal.length; i += chunk) parts.push(node.at.legal.slice(i, i + chunk));
  return (await Promise.all(parts.map(p => pool.expand(node.at.forkPoint, p)))).flat();
}

function scored(node: Node, children: Child[], ours: number) {
  const wins: { path: Action[]; oursLeft: number }[] = [];
  const on: Node[] = [];
  for (const c of children) {
    const path = [...node.path, c.input];
    if (c.end === "won") wins.push({ path, oursLeft: sum(c.hp.ours) });
    if (c.end !== "on") continue;
    const lost = foeLost(c.at.hp);
    const hist = [...node.hist, lost];
    if (hist.length > STALL && lost <= hist[hist.length - 1 - STALL] + 1e-9) continue;
    on.push({ path, at: c.at, hist, score: lost + ours * sum(c.at.hp.ours), depth: node.depth + 1 });
  }
  wins.sort((a, b) => b.oursLeft - a.oursLeft);
  // Stable, so equal scores keep the worker's order, as the beam does.
  on.sort((a, b) => b.score - a.score);
  // Of children with one sig, the first is kept (the beam keeps the best, which sorting puts first).
  const seen = new Set<string>();
  return { wins, on: on.filter(n => (seen.has(n.at.sig) ? false : (seen.add(n.at.sig), true))) };
}

/**
 * Limited discrepancy search (Harvey & Ginsberg 1995): iteration k follows the best-scored child at every turn except
 * on paths whose deviations add up to at most k, a deviation to the r-th best child costing r. Only the `alternatives`
 * best children are ever followed.
 */
export async function lds(root: Position, ctx: Ctx & { alternatives: number; maxK: number; tries: () => number }): Promise<Found | None> {
  const { pool, validate, ours, budget, turns = 40, alternatives, maxK, tries } = ctx;
  const tried = new Set<string>();
  let iterations = 0;
  const dfs = async (node: Node, left: number, best: Map<string, number>): Promise<Found | null> => {
    if (tries() >= budget) throw new Spent();
    if (node.depth >= turns) return null;
    const known = best.get(node.at.sig);
    if (known !== undefined && known >= left) return null;
    best.set(node.at.sig, left);
    const { wins, on } = scored(node, await expandNode(pool, node), ours);
    for (const w of wins) {
      const key = JSON.stringify(w.path);
      if (tried.has(key)) continue;
      tried.add(key);
      if ((await validate(w.path)).won) return { kind: "found", path: w.path, turn: node.depth + 1, tries: tries(), extra: { k: iterations } };
    }
    for (let r = 0; r < Math.min(alternatives, on.length); r++) {
      if (r > left) break;
      const found = await dfs(on[r], left - r, best);
      if (found) return found;
    }
    return null;
  };
  try {
    for (let k = 0; k <= maxK; k++) {
      iterations = k;
      const found = await dfs({ path: [], at: root, hist: [], score: 0, depth: 0 }, k, new Map());
      if (found) return found;
    }
    return { kind: "no_answer", why: `no win within ${maxK} discrepancies`, tries: tries(), extra: { k: iterations } };
  } catch (e) {
    if (e instanceof Spent) return { kind: "no_answer", why: "budget", tries: tries(), extra: { k: iterations } };
    throw e;
  }
}

/**
 * Best-first: expand the best node anywhere in the tree, by score − λ × turns played (λ = 0 is greedy best-first;
 * λ > 0 a weighted A*-like trade of depth for breadth, Pohl 1970). A sig is expanded once.
 */
export async function bestFirst(root: Position, ctx: Ctx & { lambda: number; tries: () => number; parallel: number }): Promise<Found | None> {
  const { pool, validate, ours, budget, turns = 40, lambda, tries, parallel } = ctx;
  const frontier: Node[] = [{ path: [], at: root, hist: [], score: 0, depth: 0 }];
  const closed = new Set<string>();
  const tried = new Set<string>();
  let peakFrontier = 1;
  let expanded = 0;
  const priority = (n: Node) => n.score - lambda * n.depth;
  const pop = (): Node | undefined => {
    let bi = -1;
    for (let i = 0; i < frontier.length; i++) if (bi < 0 || priority(frontier[i]) > priority(frontier[bi])) bi = i;
    return bi < 0 ? undefined : frontier.splice(bi, 1)[0];
  };
  const extra = () => ({ peakFrontier, expanded, closed: closed.size });
  while (frontier.length > 0) {
    if (tries() >= budget) return { kind: "no_answer", why: "budget", tries: tries(), extra: extra() };
    const batch: Node[] = [];
    while (batch.length < parallel) {
      const n = pop();
      if (!n) break;
      if (closed.has(n.at.sig) || n.depth >= turns) continue;
      closed.add(n.at.sig);
      batch.push(n);
    }
    if (batch.length === 0) break;
    const results = await Promise.all(batch.map(async n => ({ n, ...scored(n, await expandNode(pool, n), ours) })));
    expanded += batch.length;
    for (const { n, wins, on } of results) {
      for (const w of wins) {
        const key = JSON.stringify(w.path);
        if (tried.has(key)) continue;
        tried.add(key);
        if ((await validate(w.path)).won) return { kind: "found", path: w.path, turn: n.depth + 1, tries: tries(), extra: extra() };
      }
      for (const c of on) if (!closed.has(c.at.sig)) frontier.push(c);
    }
    peakFrontier = Math.max(peakFrontier, frontier.length);
  }
  return { kind: "no_answer", why: "frontier emptied", tries: tries(), extra: extra() };
}
