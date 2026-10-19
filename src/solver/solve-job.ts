import type { JobControl, JobWork } from "../jobs.ts";
import { type CloneSetup, setUpClone } from "./clone.ts";
import type { Clone } from "./replay.ts";
import { harnessIn } from "./run-in-clone.ts";
import { slowPollNote, solve, type SolveDeps, type SolveInput, type SolveResult } from "./solver.ts";

export const SOLVE_JOB = "solve";

export type SolveJobDeps = {
  setUp: (home: string, ctl: JobControl) => Promise<CloneSetup>;
  runIn: (dir: string) => Clone;
  solve: (input: SolveInput, deps: SolveDeps) => Promise<SolveResult>;
};

const PLAYERS: SolveJobDeps = { setUp: setUpClone, runIn: dir => harnessIn(() => ({ clone: dir })), solve };

/** `args.input` is the fight the Driver read at its decision, already through the refusal gate. */
export const solveJob =
  (home: string, deps: SolveJobDeps = PLAYERS): JobWork =>
  async (args, ctl) => {
    const setUp = await deps.setUp(home, ctl);
    if (setUp.kind !== "clone") return setUp;
    ctl.progress("loading the fight in the clone and starting the search's workers");
    return deps.solve(args.input as SolveInput, {
      clone: stoppedBy(ctl.signal, deps.runIn(setUp.dir)),
      progress: ({ spent, budget, pool }) => {
        const searched = `searched ${spent.toLocaleString("en")} of ${budget.toLocaleString("en")} turns`;
        ctl.progress(pool.slowPoll === null ? searched : `${searched}, slowly: ${slowPollNote(pool.slowPoll)}`);
      },
    });
  };

/**
 * Nothing stops a solve but its clone: once `signal` aborts, the runs going are killed and no run starts, so the pool
 * reads the clone as gone and the solve ends with every worker it started.
 */
const stoppedBy =
  (signal: AbortSignal, clone: Clone): Clone =>
  async run => {
    if (signal.aborted) return { missing: "the solve was cancelled" };
    return clone({ ...run, signal: run.signal ? AbortSignal.any([run.signal, signal]) : signal });
  };
