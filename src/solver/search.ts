import type { Budget } from "./input.ts";
import { cause, noAnswer, Unanswered } from "./no-answer.ts";
import type { Beam, BeamEnd, Input, LdsEnd, NoAnswer, Reason, Replay, ReplayResult } from "./oracle-line.ts";

/** `null` is a turn the game plays for us, such as a two-turn move's second: it takes no input. */
export type Action = Input | null;

/** Each mon's HP as a fraction of its max, 0 once fainted; the classic final boss's spans both its stages (#788). */
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

// (#792)
export const PAIRED = 3;

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
  /** How many of each field slot's own commands a double pairs up with the other's (`expandPruned`). */
  paired?: number;
  progress?: (progress: Progress) => void;
};

type Node = { path: readonly Action[]; at: Position; hist: readonly number[]; score: number };

type Expanded = { node: Node; child: Child };

/** What every stage of one search adds to its "no answer", and the paths it has already sent to replay. */
type Trail = { unreplayed: string[]; dropped: number; tried: Set<string> };

type StageInput = {
  root: Position;
  pool: Pool;
  validate: Validate;
  trail: Trail;
  paired: number;
  progress: (spent: number) => void;
};

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
const parts = <T>(xs: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
};
const foeLost = (hp: Hp) => sum(hp.foes.map(f => 1 - f));
const played = (path: readonly Action[]) => path.filter((a): a is Input => a !== null);

const failure = (e: unknown): NoAnswer =>
  e instanceof Unanswered
    ? e.answer
    : noAnswer({ code: "harness_failed", why: `the search's worker failed: ${e instanceof Error ? e.message : String(e)}` });

const worth = (hp: Hp, ours: number) => foeLost(hp) + ours * sum(hp.ours);

/** Of a double's two field slots' commands, which one the action names; a single's and a queued turn's name none. */
const slotKey = (action: Action, field: 0 | 1): string | null =>
  action?.kind === "double" ? JSON.stringify(action.commands[field]) : null;

/**
 * A double's actions are every pairing of its two field slots' commands. Where both slots have more than `paired` to
 * choose from, each slot's commands are first played beside one fixed command of the other's, and only the `paired`
 * best of each are paired up (#792). Every turn played is a child, the first round's included.
 */
async function expandPruned(
  node: Node,
  play: (inputs: readonly Action[]) => Promise<Expanded[]>,
  ours: number,
  paired: number,
): Promise<Expanded[]> {
  const { legal } = node.at;
  const options = ([0, 1] as const).map(f => new Set(legal.map(a => slotKey(a, f))));
  if (options.some(o => o.has(null) || o.size <= paired)) return play(legal);
  const fixed = [slotKey(legal[0], 0), slotKey(legal[0], 1)];
  const probe = legal.filter(a => slotKey(a, 0) === fixed[0] || slotKey(a, 1) === fixed[1]);
  const first = await play(probe);
  const best = ([0, 1] as const).map(f => {
    const other = (1 - f) as 0 | 1;
    const value = new Map<string, number>();
    for (const { child } of first) {
      if (slotKey(child.input, other) !== fixed[other]) continue;
      const key = slotKey(child.input, f) as string;
      const v = child.end === "won" ? Infinity : child.end === "on" ? worth(child.at.hp, ours) : -Infinity;
      value.set(key, Math.max(value.get(key) ?? -Infinity, v));
    }
    return new Set([...value].sort((a, b) => b[1] - a[1]).slice(0, paired).map(([key]) => key));
  });
  const rest = legal.filter(
    a => !probe.includes(a) && best[0].has(slotKey(a, 0) as string) && best[1].has(slotKey(a, 1) as string),
  );
  return rest.length > 0 ? [...first, ...(await play(rest))] : first;
}

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
    const score = worth(child.at.hp, ours);
    const same = kept.get(child.at.sig);
    if (same === undefined || score > same.score) kept.set(child.at.sig, { path, at: child.at, hist, score });
  }
  wins.sort((a, b) => b.oursLeft - a.oursLeft);
  return { wins, next: [...kept.values()].sort((a, b) => b.score - a.score), stalled };
}

/**
 * The win, or the environment gone, either of which ends the search; null where it didn't replay, wasn't run, or was
 * sent to replay before, by any stage or beam.
 */
async function replayed(
  path: readonly Action[],
  validate: (inputs: readonly Input[]) => Promise<ReplayResult | null>,
  trail: Trail,
): Promise<Found | NoAnswer | null> {
  const inputs = played(path);
  const key = JSON.stringify(path);
  if (trail.tried.has(key)) return null;
  // Before the await: a second beam reaching it mid-replay must pass it by (#761).
  trail.tried.add(key);
  const verdict = await validate(inputs);
  if (verdict === null) return null;
  if (verdict.kind === "replayed" && verdict.replay.outcome === "won") return { kind: "found", inputs, replay: verdict.replay };
  if (verdict.kind === "no_answer" && ENVIRONMENT_GONE.has(verdict.reason.code)) return verdict;
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
  paired = PAIRED,
  progress,
}: SearchInput): Promise<Found | NoAnswer> {
  const trail: Trail = { unreplayed: [], dropped: 0, tried: new Set() };
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
        paired,
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
    { root, pool, validate, trail, paired, progress: spent => progress?.({ spent: ldsSpent + spent, budget: total }) },
    budget,
    portfolio,
  );
  if (beamResult.kind !== "ended") return beamResult;
  return noAnswer({ code: "no_win", lds: ldsEnd, beams: beamResult.end, unreplayed: trail.unreplayed, dropped: trail.dropped });
}

/** One position expanded at a time, its actions spread over the pool. */
async function discrepancySearch(
  { root, pool, validate, trail, paired, progress }: StageInput,
  lds: Lds,
  turns: number,
): Promise<Stage<LdsEnd>> {
  let spent = 0;
  let k = 0;

  const play = async (node: Node, inputs: readonly Action[]): Promise<Expanded[]> => {
    const chunk = Math.max(1, Math.ceil(inputs.length / pool.size));
    const children = (await Promise.all(parts(inputs, chunk).map(part => pool.expand(node.at.forkPoint, part)))).flat();
    spent += children.length;
    progress(spent);
    return children.map(child => ({ node, child }));
  };
  const expand = (node: Node) => expandPruned(node, inputs => play(node, inputs), lds.ours, paired);

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
  { root, pool, validate, trail, paired, progress }: StageInput,
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
      const play = async (node: Node, inputs: readonly Action[]) => {
        const jobs = parts(inputs, chunk).map(async part => (await expand(beam, node.at.forkPoint, part)).map(child => ({ node, child })));
        return (await Promise.all(jobs)).flat();
      };
      return (await Promise.all(nodes.map(node => expandPruned(node, inputs => play(node, inputs), beam.ours, paired)))).flat();
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
