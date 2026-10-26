import type { Budget } from "./input.ts";
import { cause, noAnswer, Unanswered } from "./no-answer.ts";
import type { Beam, BeamEnd, Input, LdsEnd, NoAnswer, Reason, Replay, ReplayResult } from "./oracle-line.ts";

/** `null` is a turn the game plays for us, such as a two-turn move's second: it takes no input. */
export type Action = Input | null;

/** Each mon's HP as a fraction of its max, 0 once fainted; the classic final boss's spans both its stages (#788). */
export type Hp = { ours: readonly number[]; foes: readonly number[] };

/** Each mon's seven stat stages, none off the field or fainted (#813). */
export type StatStages = { ours: readonly (readonly number[])[]; foes: readonly (readonly number[])[] };

/** A decision the search can fork from. Two positions with one `sig` are one to the search. */
export type Position = { sig: string; hp: Hp; stages: StatStages; legal: readonly Action[]; forkPoint: string };

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

/**
 * How one search went, its answer aside. `found` is null where no win replayed; its `spent` is every stage's turns
 * played when the winning turn came back. A stage that never ran has no entry.
 */
export type SearchStatistics = { found: FoundBy | null; stages: readonly StageStatistics[] };

/** `pass` is the most discrepancies the discrepancy search allowed; `turn` counts from where the solve started. */
export type FoundBy = ({ stage: "lds"; pass: number } | { stage: "beam"; index: number; turn: number }) & { spent: number };

/** `stopped`: still searching when the search ended, on another stage's win or a failure. */
export type StageStatistics = (
  | { stage: "lds"; ended: LdsEnd["ended"] | "won" | "stopped" }
  | { stage: "beam"; index: number; ended: BeamEnd["ended"] | "won" | "stopped" }
) & { spent: number; ms: number };

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
  /** Called once, as the search ends, whatever it answers. */
  statistics?: (statistics: SearchStatistics) => void;
  /** Wall time in milliseconds. */
  now?: () => number;
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
  now: () => number;
};

type Stage<End> = Found | NoAnswer | { kind: "ended"; end: End };

type Staged<End> = { result: Stage<End>; stages: StageStatistics[]; found: FoundBy | null };

type BeamRun = Beam & {
  index: number;
  spent: number;
  inFlight: number;
  outOfBudget: boolean;
  ended?: BeamEnd;
  stage?: StageStatistics;
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

// (#813)
const STAT_STAGE = 0.2;

/** Each mon's stat stages that `counts`, each times the HP share it has left. */
const staged = (stages: StatStages["ours"], hp: readonly number[], counts: (stage: number) => boolean) =>
  sum(stages.map((mon, i) => hp[i] * sum(mon.filter(counts))));

/**
 * In mons' whole HP, a stat stage counting `STAT_STAGE` of one at full HP: each of ours, and each of a foe's drops; a
 * foe's raises count for nothing (#813).
 */
const worth = ({ hp, stages }: Pick<Position, "hp" | "stages">, ours: number) =>
  foeLost(hp) +
  ours * sum(hp.ours) +
  STAT_STAGE * (staged(stages.ours, hp.ours, () => true) - staged(stages.foes, hp.foes, stage => stage < 0));

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
  // A command the fixed one can't pair with, as two Teras can't, would go unscored and never be paired.
  const fixed = ([0, 1] as const).map(f =>
    [...options[f]].find(key => legal.filter(a => slotKey(a, f) === key).length === options[1 - f].size),
  );
  if (fixed.some(key => key === undefined)) return play(legal);
  const probe = legal.filter(a => slotKey(a, 0) === fixed[0] || slotKey(a, 1) === fixed[1]);
  const first = await play(probe);
  const best = ([0, 1] as const).map(f => {
    const other = (1 - f) as 0 | 1;
    const value = new Map<string, number>();
    for (const { child } of first) {
      if (slotKey(child.input, other) !== fixed[other]) continue;
      const key = slotKey(child.input, f) as string;
      const v = child.end === "won" ? Infinity : child.end === "on" ? worth(child.at, ours) : -Infinity;
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
    const score = worth(child.at, ours);
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
  statistics,
  now = () => performance.now(),
}: SearchInput): Promise<Found | NoAnswer> {
  const trail: Trail = { unreplayed: [], dropped: 0, tried: new Set() };
  const total = (lds?.expansions ?? 0) + budget.expansions * portfolio.length;
  const stages: StageStatistics[] = [];
  const answer = <A extends Found | NoAnswer>(result: A, found: FoundBy | null = null): A => {
    statistics?.({ found, stages });
    return result;
  };
  let ldsSpent = 0;
  let ldsPlayed = 0;
  let ldsEnd: LdsEnd | null = null;
  if (lds) {
    const ran = await discrepancySearch(
      {
        root,
        pool,
        validate,
        trail,
        paired,
        progress: spent => {
          ldsPlayed = spent;
          ldsSpent = Math.min(spent, lds.expansions);
          progress?.({ spent: ldsSpent, budget: total });
        },
        now,
      },
      lds,
      budget.turns,
    );
    stages.push(...ran.stages);
    if (ran.result.kind !== "ended") return answer(ran.result, ran.found);
    ldsEnd = ran.result.end;
  }
  const ran = await beams(
    { root, pool, validate, trail, paired, progress: spent => progress?.({ spent: ldsSpent + spent, budget: total }), now },
    budget,
    portfolio,
    ldsPlayed,
  );
  stages.push(...ran.stages);
  if (ran.result.kind !== "ended") return answer(ran.result, ran.found);
  return answer(noAnswer({ code: "no_win", lds: ldsEnd, beams: ran.result.end, unreplayed: trail.unreplayed, dropped: trail.dropped }));
}

/** One position expanded at a time, its actions spread over the pool. */
async function discrepancySearch(
  { root, pool, validate, trail, paired, progress, now }: StageInput,
  lds: Lds,
  turns: number,
): Promise<Staged<LdsEnd>> {
  const started = now();
  let spent = 0;
  let k = 0;
  const staged = (result: Stage<LdsEnd>): Staged<LdsEnd> => {
    const ended = result.kind === "ended" ? result.end.ended : result.kind === "found" ? "won" : "stopped";
    return {
      result,
      stages: [{ stage: "lds", ended, spent, ms: Math.round(now() - started) }],
      found: result.kind === "found" ? { stage: "lds", pass: k, spent } : null,
    };
  };

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
      if (ended) return staged(ended);
    }
    return staged({ kind: "ended", end: { ended: "exhausted", discrepancies: lds.discrepancies, expansions: spent } });
  } catch (e) {
    if (e instanceof OutOfBudget) return staged({ kind: "ended", end: { ended: "budget", discrepancies: k, expansions: spent } });
    return staged(failure(e));
  }
}

/**
 * The pool serves the earliest beam in the portfolio with a job queued. `before` is the turns the discrepancy search
 * played ahead of the beams.
 */
function beams(
  { root, pool, validate, trail, paired, progress, now }: StageInput,
  budget: Budget,
  portfolio: readonly Beam[],
  before: number,
): Promise<Staged<BeamEnd[]>> {
  const started = now();
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

    const stage = (beam: BeamRun, ended: Extract<StageStatistics, { stage: "beam" }>["ended"]): StageStatistics => ({
      stage: "beam",
      index: beam.index,
      ended,
      spent: beam.spent,
      ms: Math.round(now() - started),
    });

    /** `by` is the beam whose win ended the search, on its turn, with every stage's turns played by then. */
    const finish = (result: Stage<BeamEnd[]>, by?: { beam: BeamRun; turn: number; spent: number }) => {
      if (over) return;
      over = true;
      for (const job of queue.splice(0)) job.fail(new SearchOver());
      const found = by && result.kind === "found" ? by : null;
      for (const beam of runs) beam.stage ??= stage(beam, beam === found?.beam ? "won" : "stopped");
      resolve({
        result,
        stages: runs.map(b => b.stage as StageStatistics),
        found: found && { stage: "beam", index: found.beam.index, turn: found.turn, spent: found.spent },
      });
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
      beam.stage = stage(beam, ended);
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
        const spent = before + sum(runs.map(b => b.spent));
        const { wins, next, stalled } = scored(children, beam.ours, trail);
        for (const win of wins) {
          const ended = await replayed(win.path, replays, trail);
          if (ended) return finish(ended, { beam, turn, spent });
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
