/**
 * The developer's `COACHEMON_CAPTURE=1`: each solve is recorded into the fight library under the home, its solve start
 * with the oracle line it found and a statistics entry (#787, #936, #937, #938, #940, #969). Never a player's: unset,
 * nothing is written.
 */
import type { JobWork } from "../jobs.ts";
import { endOf, type Recorder, recordSolveStart } from "./fight-library.ts";
import type { Script } from "./script.ts";
import type { SolveControl, SolveWork } from "./solve-job.ts";
import type { MonState, OracleLine, SolveInput, SolveReport, SolveResult } from "./solver.ts";

export const withCapture =
  (work: SolveWork, home: string, env: NodeJS.ProcessEnv = process.env, recorder?: Recorder): JobWork =>
  async (args, ctl) => {
    const recording = env.COACHEMON_CAPTURE === "1" ? recordSolveStart({ home }, args.input as SolveInput, recorder) : null;
    if (recording === null) return work(args, ctl);
    let report: SolveReport | null = null;
    let progress: string | null = null;
    // The job has ended once cancelled, and the work may run on long after, or never return.
    const cancelled = () => recording.finish({ ended: { kind: "cancelled", progress }, report });
    if (ctl.signal.aborted) cancelled();
    else ctl.signal.addEventListener("abort", cancelled, { once: true });
    const watched: SolveControl = {
      signal: ctl.signal,
      statistics: reported => (report = reported),
      progress: (line: string) => {
        progress = line;
        ctl.progress(line);
      },
    };
    let result: SolveResult;
    try {
      result = (await work(args, watched)) as SolveResult;
    } catch (e) {
      recording.finish({ ended: { kind: "failed", failure: e instanceof Error ? e.message : String(e) }, report });
      throw e;
    } finally {
      ctl.signal.removeEventListener("abort", cancelled);
    }
    recording.finish({ ended: endOf(result), report, oracleLine: result?.kind === "oracle_line" ? scriptOf(result.oracleLine) : undefined });
    return result;
  };

/** What live must show after each turn is what the oracle line's checkpoint promised. */
function scriptOf(line: OracleLine): Script {
  return {
    inputs: line.steps.flatMap(s => (s.input === null ? [] : [s.input])),
    known: {
      outcome: "won",
      after: line.steps.map(s => ({ turn: s.turn, ...side("ours", s.checkpoint.ours), ...side("foes", s.checkpoint.foes) })),
    },
  };
}

function side(name: "ours" | "foes", mons: readonly MonState[]) {
  const facts: Record<string, Omit<MonState, "slot" | "species">> = {};
  // `misses` finds a recorded mon by species alone, so a second of one species would be held to the first one's facts.
  const twice = new Set(mons.filter((m, i) => mons.findIndex(o => o.species === m.species) !== i).map(m => m.species));
  for (const { slot: _slot, species, ...rest } of mons) if (!twice.has(species)) facts[species] = rest;
  return Object.keys(facts).length === 0 ? {} : { [name]: facts };
}
