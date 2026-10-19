import type { Budget } from "./input.ts";
import { cause, noAnswer, Unanswered } from "./no-answer.ts";
import type { Beam, BeamEnd, Input, LdsEnd, NoAnswer, Reason, Replay, ReplayResult } from "./oracle-line.ts";

/** `null` is a turn the game plays for us, such as a two-turn move's second: it takes no input. */
export type Action = Input | null;

/** Each mon's HP as a fraction of its max, 0 once fainted. */
export type Hp = { ours: readonly number[]; foes: readonly number[] };

/** A decision the search can fork from. Two positions with one `sig` are one to the search. */
export type Position = { sig: string; hp: Hp; legal: readonly Action[]; forkPoint: string };

/**
 * One action played from a fork point; `input` names the faint replacement and the learn picks the turn took, where it
 * asked for them, so a `null` that asked for either comes back as a `queued` input (#702, #673).
 */
export type Child =
  | { input: Action; end: "on"; at: Position }
  | { input: Action; end: "won" | "lost"; hp: Hp }
  | { input: Action; end: "dropped"; why: string };

export type Pool = {
  size: number;
  /** A child per action, and one more per other faint replacement or learn pick an action's turn could have taken. */
  expand(forkPoint: string, inputs: readonly Action[]): Promise<Child[]>;
};

// (#655) In order of preference: a later beam runs only on workers the earlier ones leave idle (#760).
export const PORTFOLIO: readonly Beam[] = [
  { width: 8, ours: 1 },
  { width: 8, ours: 0.5 },
  { width: 16, ours: 0.5 },
];

/**
 * Limited discrepancy search (Harvey & Ginsberg 1995), the r-th best child costing r discrepancies. `alternatives` is
 * how many of the best children it ever follows, `discrepancies` the most it allows, and `expansions` its own budget,
 * ahead of the beams'.
 */
export type Lds = { ours: number; alternatives: number; discrepancies: number; expansions: number };

// (#761)
export const LDS: Lds = { ours: 1, alternatives: 2, discrepancies: 2, expansions: 3000 };

const STALL_TURNS = 6;

/** Expansions, each one turn played from a fork point, against the discrepancy search's and every beam's together. */
export type Progress = { spent: number; budget: number };

export type Found = { kind: "found"; inputs: readonly Input[]; replay: Replay };

type Validate = (inputs: readonly Input[]) => Promise<ReplayResult>;

export type SearchInput = {
  root: Position;
  pool: Pool;
  /** The validation protocol, run on a win's inputs. */
  validate: Validate;
  /** Each beam's own; its turn limit is the discrepancy search's too. */
  budget: Budget;
  /** null runs the beams alone. */
  lds?: Lds | null;
  portfolio?: readonly Beam[];
  progress?: (progress: Progress) => void;
};

type Node = { path: readonly Action[]; at: Position; hist: readonly number[]; score: number };

type Expanded = { node: Node; child: Child };

/** What every stage of one search adds to its "no answer", and the paths whose replay it has already refused. */
type Trail = { unreplayed: string[]; dropped: number; refused: Set<string> };

type StageInput = { root: Position; pool: Pool; validate: Validate; trail: Trail; progress: (spent: number) => void };

type Stage<End> = Found | NoAnswer | { kind: "ended"; end: End };

type BeamRun = Beam & {
  index: number;
  spent: number;
  inFlight: number;
  outOfBudget: boolean;
  ended?: BeamEnd;
};

type Job = { beam: BeamRun; forkPoint: string; inputs: readonly Action[]; done: (children: Child[]) => void; fail: (e: Error) => void };

class SearchOver extends Error {}

class OutOfBudget extends Error {}

const ENVIRONMENT_GONE = new Set<Reason["code"]>(["no_clone", "clone_version"]);

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const foeLost = (hp: Hp) => sum(hp.foes.map(f => 1 - f));
const played = (path: readonly Action[]) => path.filter((a): a is Input => a !== null);

const failure = (e: unknown): NoAnswer =>
  e instanceof Unanswered
    ? e.answer
    : noAnswer({ code: "harness_failed", why: `the search's worker failed: ${e instanceof Error ? e.message : String(e)}` });

function scored(children: readonly Expanded[], ours: number, trail: Trail) {
  const wins: { path: Action[]; oursLeft: number }[] = [];
  const kept = new Map<string, Node>();
  let stalled = 0;
  for (const { node, child } of children) {
    const path = [...node.path, child.input];
    if (child.end === "dropped") trail.dropped++;
    if (child.end === "won") wins.push({ path, oursLeft: sum(child.hp.ours) });
    if (child.end !== "on") continue;
    const lost = foeLost(child.at.hp);
    const hist = [...node.hist, lost];
    if (hist.length > STALL_TURNS && lost <= hist[hist.length - 1 - STALL_TURNS] + 1e-9) {
      stalled++;
      continue;
    }
    const score = lost + ours * sum(child.at.hp.ours);
    const same = kept.get(child.at.sig);
    if (same === undefined || score > same.score) kept.set(child.at.sig, { path, at: child.at, hist, score });
  }
  wins.sort((a, b) => b.oursLeft - a.oursLeft);
  return { wins, next: [...kept.values()].sort((a, b) => b.score - a.score), stalled };
}

/**
 * The win, or the environment gone, either of which ends the search; null where it didn't replay, wasn't run, or was
 * refused before, in this stage or an earlier one.
 */
async function replayed(
  path: readonly Action[],
  validate: (inputs: readonly Input[]) => Promise<ReplayResult | null>,
  trail: Trail,
): Promise<Found | NoAnswer | null> {
  const inputs = played(path);
  const key = JSON.stringify(path);
  if (trail.refused.has(key)) return null;
  const verdict = await validate(inputs);
  if (verdict === null) return null;
  if (verdict.kind === "replayed" && verdict.replay.outcome === "won") return { kind: "found", inputs, replay: verdict.replay };
  if (verdict.kind === "no_answer" && ENVIRONMENT_GONE.has(verdict.reason.code)) return verdict;
  trail.refused.add(key);
  if (verdict.kind === "no_answer") trail.unreplayed.push(cause(verdict.reason));
  else trail.unreplayed.push(verdict.replay.outcome === "lost" ? "it lost on replay." : "its inputs ran out with the fight still on.");
  return null;
}

/**
 * The discrepancy search, then the beams, until a win replays. Running out of discrepancies or of its budget only hands
 * over to the beams: for want of a win, "no answer" comes only once every beam has emptied, stalled, reached the turn
 * limit or spent its budget.
 */
export async function search({
  root,
  pool,
  validate,
  budget,
  lds = LDS,
  portfolio = PORTFOLIO,
  progress,
}: SearchInput): Promise<Found | NoAnswer> {
  const trail: Trail = { unreplayed: [], dropped: 0, refused: new Set() };
  const total = (lds?.expansions ?? 0) + budget.expansions * portfolio.length;
  let ldsSpent = 0;
  let ldsEnd: LdsEnd | null = null;
  if (lds) {
    const ldsResult = await discrepancySearch(
      {
        root,
        pool,
        validate,
        trail,
        progress: spent => {
          ldsSpent = Math.min(spent, lds.expansions);
          progress?.({ spent: ldsSpent, budget: total });
        },
      },
      lds,
      budget.turns,
    );
    if (ldsResult.kind !== "ended") return ldsResult;
    ldsEnd = ldsResult.end;
  }
  const beamResult = await beams(
    { root, pool, validate, trail, progress: spent => progress?.({ spent: ldsSpent + spent, budget: total }) },
    budget,
    portfolio,
  );
  if (beamResult.kind !== "ended") return beamResult;
  return noAnswer({ code: "no_win", lds: ldsEnd, beams: beamResult.end, unreplayed: trail.unreplayed, dropped: trail.dropped });
}

/** One position expanded at a time, its actions spread over the pool. */
async function discrepancySearch(
  { root, pool, validate, trail, progress }: StageInput,
  lds: Lds,
  turns: number,
): Promise<Stage<LdsEnd>> {
  let spent = 0;
  let k = 0;

  const expand = async (node: Node): Promise<Expanded[]> => {
    const chunk = Math.max(1, Math.ceil(node.at.legal.length / pool.size));
    const parts: Action[][] = [];
    for (let i = 0; i < node.at.legal.length; i += chunk) parts.push(node.at.legal.slice(i, i + chunk));
    const children = (await Promise.all(parts.map(part => pool.expand(node.at.forkPoint, part)))).flat();
    spent += children.length;
    progress(spent);
    return children.map(child => ({ node, child }));
  };

  /** `seen` holds the most discrepancies any visit this pass had left at each sig. */
  const dive = async (node: Node, left: number, seen: Map<string, number>): Promise<Found | NoAnswer | null> => {
    if (spent >= lds.expansions) throw new OutOfBudget();
    if (node.path.length >= turns) return null;
    if ((seen.get(node.at.sig) ?? -1) >= left) return null;
    seen.set(node.at.sig, left);
    const { wins, next } = scored(await expand(node), lds.ours, trail);
    for (const win of wins) {
      const ended = await replayed(win.path, validate, trail);
      if (ended) return ended;
    }
    for (let r = 0; r < Math.min(lds.alternatives, next.length) && r <= left; r++) {
      const ended = await dive(next[r], left - r, seen);
      if (ended) return ended;
    }
    return null;
  };

  try {
    for (; k <= lds.discrepancies; k++) {
      const ended = await dive({ path: [], at: root, hist: [], score: 0 }, k, new Map());
      if (ended) return ended;
    }
    return { kind: "ended", end: { ended: "exhausted", discrepancies: lds.discrepancies, expansions: spent } };
  } catch (e) {
    if (e instanceof OutOfBudget) return { kind: "ended", end: { ended: "budget", discrepancies: k, expansions: spent } };
    return failure(e);
  }
}

/** The pool serves the earliest beam in the portfolio with a job queued. */
function beams(
  { root, pool, validate, trail, progress }: StageInput,
  budget: Budget,
  portfolio: readonly Beam[],
): Promise<Stage<BeamEnd[]>> {
  return new Promise(resolve => {
    const runs: BeamRun[] = portfolio.map((beam, index) => ({
      ...beam,
      index,
      spent: 0,
      inFlight: 0,
      outOfBudget: false,
    }));
    const queue: Job[] = [];
    let busy = 0;
    let over = false;
    let validating: Promise<unknown> = Promise.resolve();

    const finish = (result: Stage<BeamEnd[]>) => {
      if (over) return;
      over = true;
      for (const job of queue.splice(0)) job.fail(new SearchOver());
      resolve(result);
    };
    const failed = (e: unknown) => finish(failure(e));

    const pump = () => {
      while (!over && busy < pool.size && queue.length > 0) {
        const next = queue.reduce((best, job) => (job.beam.index < best.beam.index ? job : best));
        queue.splice(queue.indexOf(next), 1);
        const { beam, inputs } = next;
        if (beam.spent + beam.inFlight >= budget.expansions) {
          beam.outOfBudget = true;
          next.done([]);
          continue;
        }
        busy++;
        beam.inFlight += inputs.length;
        pool.expand(next.forkPoint, inputs).then(
          children => {
            busy--;
            beam.inFlight -= inputs.length;
            if (over) return;
            beam.spent += children.length;
            // A turn's other faint replacements and learn picks can carry a beam past its budget by part of a job.
            progress(sum(runs.map(b => Math.min(b.spent, budget.expansions))));
            next.done(children);
            pump();
          },
          e => {
            busy--;
            failed(e);
          },
        );
      }
    };

    const expand = (beam: BeamRun, forkPoint: string, inputs: readonly Action[]) =>
      new Promise<Child[]>((done, fail) => {
        if (over) return fail(new SearchOver());
        queue.push({ beam, forkPoint, inputs, done, fail });
        pump();
      });

    const layer = async (beam: BeamRun, nodes: readonly Node[]) => {
      const chunk = Math.max(1, Math.ceil(sum(nodes.map(n => n.at.legal.length)) / (2 * pool.size)));
      const jobs = nodes.flatMap(node => {
        const parts: Action[][] = [];
        for (let i = 0; i < node.at.legal.length; i += chunk) parts.push(node.at.legal.slice(i, i + chunk));
        return parts.map(async part => (await expand(beam, node.at.forkPoint, part)).map(child => ({ node, child })));
      });
      return (await Promise.all(jobs)).flat();
    };

    /** One at a time, so a solve never runs more than one replay beside its pool. */
    const replays = (inputs: readonly Input[]) => {
      const next = validating.then(() => (over ? null : validate(inputs)));
      validating = next.catch(() => {});
      return next;
    };

    const end = (beam: BeamRun, ended: BeamEnd["ended"], turn: number) => {
      beam.ended = { width: beam.width, ours: beam.ours, ended, turn, expansions: beam.spent };
      if (runs.every(b => b.ended)) finish({ kind: "ended", end: runs.map(b => b.ended as BeamEnd) });
    };

    const run = async (beam: BeamRun) => {
      let nodes: Node[] = [{ path: [], at: root, hist: [], score: 0 }];
      for (let turn = 1; ; turn++) {
        let children;
        try {
          children = await layer(beam, nodes);
        } catch (e) {
          if (e instanceof SearchOver) return;
          throw e;
        }
        if (over) return;
        const { wins, next, stalled } = scored(children, beam.ours, trail);
        for (const win of wins) {
          const ended = await replayed(win.path, replays, trail);
          if (ended) return finish(ended);
          if (over) return;
        }
        if (beam.outOfBudget) return end(beam, "budget", turn);
        nodes = next.slice(0, beam.width);
        if (nodes.length === 0) return end(beam, stalled > 0 ? "stalled" : "emptied", turn);
        if (turn >= budget.turns) return end(beam, "turns", turn);
      }
    };

    for (const beam of runs) run(beam).catch(failed);
  });
}
