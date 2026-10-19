import type { Budget } from "./input.ts";
import { cause, noAnswer, Unanswered } from "./no-answer.ts";
import type { Beam, BeamEnd, Input, NoAnswer, Reason, Replay, ReplayResult } from "./oracle-line.ts";

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

/**
 * In order of preference: a later beam runs only on workers the earlier ones leave idle (#655). 8@1 goes first as the
 * one beam that wins Kieran W190 alone; first, it needed 46.5% fewer tries to a first win across the three fights (#760).
 */
export const PORTFOLIO: readonly Beam[] = [
  { width: 8, ours: 1 },
  { width: 8, ours: 0.5 },
  { width: 16, ours: 0.5 },
];

const STALL_TURNS = 6;

/** Expansions, each one turn played from a fork point, against every beam's budget together. */
export type Progress = { spent: number; budget: number };

export type Found = { kind: "found"; inputs: readonly Input[]; replay: Replay };

export type SearchInput = {
  root: Position;
  pool: Pool;
  /** The validation protocol, run on a win's inputs. */
  validate: (inputs: readonly Input[]) => Promise<ReplayResult>;
  /** Each beam's own. */
  budget: Budget;
  portfolio?: readonly Beam[];
  progress?: (progress: Progress) => void;
};

type Node = { path: readonly Action[]; at: Position; hist: readonly number[]; score: number };

type BeamRun = Beam & {
  index: number;
  spent: number;
  inFlight: number;
  outOfBudget: boolean;
  ended?: BeamEnd;
};

type Job = { beam: BeamRun; forkPoint: string; inputs: readonly Action[]; done: (children: Child[]) => void; fail: (e: Error) => void };

class SearchOver extends Error {}

const ENVIRONMENT_GONE = new Set<Reason["code"]>(["no_clone", "clone_version"]);

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const foeLost = (hp: Hp) => sum(hp.foes.map(f => 1 - f));
const played = (path: readonly Action[]) => path.filter((a): a is Input => a !== null);

/**
 * Beams over per-turn decisions, the pool serving the earliest in the portfolio with a job queued, until a win replays.
 * For want of a win, "no answer" comes only once every beam has emptied, stalled, reached the turn limit or spent its
 * budget.
 */
export function search({ root, pool, validate, budget, portfolio = PORTFOLIO, progress }: SearchInput): Promise<Found | NoAnswer> {
  return new Promise(resolve => {
    const beams: BeamRun[] = portfolio.map((beam, index) => ({
      ...beam,
      index,
      spent: 0,
      inFlight: 0,
      outOfBudget: false,
    }));
    const queue: Job[] = [];
    const unreplayed: string[] = [];
    let busy = 0;
    let over = false;
    let dropped = 0;
    let validating: Promise<unknown> = Promise.resolve();

    const finish = (result: Found | NoAnswer) => {
      if (over) return;
      over = true;
      for (const job of queue.splice(0)) job.fail(new SearchOver());
      resolve(result);
    };
    const failed = (e: unknown) =>
      finish(
        e instanceof Unanswered
          ? e.answer
          : noAnswer({ code: "harness_failed", why: `the search's worker failed: ${e instanceof Error ? e.message : String(e)}` }),
      );

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
            const spent = sum(beams.map(b => Math.min(b.spent, budget.expansions)));
            progress?.({ spent, budget: budget.expansions * beams.length });
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
      if (beams.every(b => b.ended)) {
        finish(noAnswer({ code: "no_win", beams: beams.map(b => b.ended as BeamEnd), unreplayed, dropped }));
      }
    };

    /** True once the win has replayed and ended the search. */
    const replaysAsWin = async (path: readonly Action[]): Promise<boolean> => {
      const inputs = played(path);
      const verdict = await replays(inputs);
      if (over || verdict === null) return false;
      if (verdict.kind === "replayed") {
        if (verdict.replay.outcome === "won") {
          finish({ kind: "found", inputs, replay: verdict.replay });
          return true;
        }
        unreplayed.push(verdict.replay.outcome === "lost" ? "it lost on replay." : "its inputs ran out with the fight still on.");
        return false;
      }
      if (ENVIRONMENT_GONE.has(verdict.reason.code)) finish(verdict);
      else unreplayed.push(cause(verdict.reason));
      return false;
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
        const wins: { path: Action[]; oursLeft: number }[] = [];
        const kept = new Map<string, Node>();
        let stalled = 0;
        for (const { node, child } of children) {
          const path = [...node.path, child.input];
          if (child.end === "dropped") dropped++;
          if (child.end === "won") wins.push({ path, oursLeft: sum(child.hp.ours) });
          if (child.end !== "on") continue;
          const lost = foeLost(child.at.hp);
          const hist = [...node.hist, lost];
          if (hist.length > STALL_TURNS && lost <= hist[hist.length - 1 - STALL_TURNS] + 1e-9) {
            stalled++;
            continue;
          }
          const score = lost + beam.ours * sum(child.at.hp.ours);
          const same = kept.get(child.at.sig);
          if (same === undefined || score > same.score) kept.set(child.at.sig, { path, at: child.at, hist, score });
        }
        wins.sort((a, b) => b.oursLeft - a.oursLeft);
        for (const win of wins) {
          if (await replaysAsWin(win.path)) return;
          if (over) return;
        }
        if (beam.outOfBudget) return end(beam, "budget", turn);
        nodes = [...kept.values()].sort((a, b) => b.score - a.score).slice(0, beam.width);
        if (nodes.length === 0) return end(beam, stalled > 0 ? "stalled" : "emptied", turn);
        if (turn >= budget.turns) return end(beam, "turns", turn);
      }
    };

    for (const beam of beams) run(beam).catch(failed);
  });
}
