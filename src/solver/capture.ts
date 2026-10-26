/**
 * The developer's `COACHEMON_CAPTURE=1`: a solve keeps what it solved from, the wave-start save or a mid-fight augmented
 * export, and the oracle line it found, as the fight library's two files under the turn it started at, in that fight's
 * folder under the home, and appends a statistics entry there (#787, #936, #937, #938). Never a player's: unset, nothing
 * is written.
 */
import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NAMES, TrainerVariant } from "../enums/generated.ts";
import type { JobWork } from "../jobs.ts";
import { PLUGIN_VERSION } from "../plugin-version.ts";
import { type Script, WIN_SCRIPT } from "./script.ts";
import { LDS, type Lds, PORTFOLIO } from "./search.ts";
import type { Beam, Budget, MonState, OracleLine, Reason, SessionSave, SolveInput, SolveResult } from "./solver.ts";

export const FIRST_TURN = "turn-1";

export const STATISTICS = "statistics.jsonl";

/** One line of `STATISTICS` per solve, appended. A field that changes meaning bumps `schema`; a new one does not. */
export type SolveStatistics = {
  schema: 1;
  turn: number;
  at: string;
  ended: SolveEnd;
  budget: Budget;
  lds: Lds | null;
  portfolio: readonly Beam[];
  pluginVersion: string;
  gameVersion: string;
};

/** `progress` is the last line the solve reported before its cancel, `null` before any. */
export type SolveEnd =
  | { kind: "oracle_line" }
  | { kind: "no_answer"; code: Reason["code"] }
  | { kind: "failed"; failure: string }
  | { kind: "cancelled"; progress: string | null };

export type Recorder = { now: () => Date; pluginVersion: string };

const RECORDER: Recorder = { now: () => new Date(), pluginVersion: PLUGIN_VERSION };

export const withCapture =
  (work: JobWork, home: string, env: NodeJS.ProcessEnv = process.env, recorder: Recorder = RECORDER): JobWork =>
  async (args, ctl) => {
    const input = args.input as SolveInput;
    const turn = input.extras === undefined ? 1 : Number.isInteger(input.extras.turn) ? input.extras.turn : null;
    if (env.COACHEMON_CAPTURE !== "1" || turn === null) return work(args, ctl);
    const fight = path.join(home, "fights", fightKey(input.save));
    const stem = path.join(fight, turn === 1 ? FIRST_TURN : `turn-${turn}`);
    const { live, save, extras, liveExport, cloneVersion, budget } = input;
    keep(`${stem}.json`, { live, save, extras, liveExport, cloneVersion, budget });
    const ran = ranUnder(input, turn, recorder);
    let recorded = false;
    const record = (ended: () => SolveEnd | null) => {
      if (recorded) return;
      recorded = true;
      try {
        const end = ended();
        if (end === null) return;
        mkdirSync(fight, { recursive: true });
        // One write of one line, so two processes appending to one fight interleave whole entries.
        appendFileSync(path.join(fight, STATISTICS), JSON.stringify({ ...ran, ended: end } satisfies SolveStatistics) + "\n");
      } catch {}
    };
    let progress: string | null = null;
    // The job has ended once cancelled, and the work may run on long after, or never return.
    const cancelled = () => record(() => ({ kind: "cancelled", progress }));
    if (ctl.signal.aborted) cancelled();
    else ctl.signal.addEventListener("abort", cancelled, { once: true });
    const watched = {
      signal: ctl.signal,
      progress: (line: string) => {
        progress = line;
        ctl.progress(line);
      },
    };
    let result: SolveResult;
    try {
      result = (await work(args, watched)) as SolveResult;
    } catch (e) {
      record(() => ({ kind: "failed", failure: e instanceof Error ? e.message : String(e) }));
      throw e;
    } finally {
      ctl.signal.removeEventListener("abort", cancelled);
    }
    record(() => endOf(result));
    if (!ctl.signal.aborted && result?.kind === "oracle_line") keep(`${stem}${WIN_SCRIPT}`, scriptOf(result.oracleLine));
    return result;
  };

function endOf(result: SolveResult | undefined): SolveEnd | null {
  if (result?.kind === "oracle_line") return { kind: "oracle_line" };
  if (result?.kind === "no_answer") return { kind: "no_answer", code: result.reason.code };
  return null;
}

function ranUnder(input: SolveInput, turn: number, recorder: Recorder): Omit<SolveStatistics, "ended"> {
  return {
    schema: 1,
    turn,
    at: recorder.now().toISOString(),
    budget: input.budget,
    lds: input.lds === undefined ? LDS : input.lds,
    portfolio: input.portfolio ?? PORTFOLIO,
    pluginVersion: recorder.pluginVersion,
    gameVersion: input.cloneVersion,
  };
}

const fightKey = (save: SessionSave): string => `${save.seed.replace(/[^A-Za-z0-9]+/g, "-")}-w${save.waveIndex}-${fightName(save)}`;

/** The trainer, plural for a double, or the lead foe of a wild fight: `gordie`, `swimmers`, `eternatus`. */
export function fightName(save: SessionSave): string {
  const trainer = save.trainer;
  if (trainer) {
    const name = dashed(NAMES.TrainerType[trainer.trainerType] ?? `trainer-${trainer.trainerType}`);
    return trainer.variant === TrainerVariant.DOUBLE ? `${name}s` : name;
  }
  const lead = (save.enemyParty[0] as { species?: number } | undefined)?.species;
  return lead === undefined ? "wild" : dashed(NAMES.SpeciesId[lead] ?? `species-${lead}`);
}

const dashed = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

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

/** Whole or not at all, and never throws: no write fails the solve. */
function keep(file: string, value: unknown): void {
  const part = `${file}.part`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(part, JSON.stringify(value) + "\n");
    renameSync(part, file);
  } catch {
    drop(part);
  }
}

function drop(file: string): void {
  try {
    rmSync(file, { force: true });
  } catch {}
}
