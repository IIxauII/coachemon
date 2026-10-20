/**
 * The developer's `COACHEMON_CAPTURE=1`: a solve from a fight's wave-start save keeps what it solved from, and the line
 * it found, under the home as a known fight's two files (#787). Never a player's: unset, nothing is written.
 */
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NAMES, TrainerVariant } from "../enums/generated.ts";
import type { JobWork } from "../jobs.ts";
import type { MonState, OracleLine, SessionSave, SolveInput, SolveResult } from "./solver.ts";
import type { Script } from "./script.ts";

const capturing = (env: NodeJS.ProcessEnv = process.env): boolean => env.COACHEMON_CAPTURE === "1";

const KEPT_FIGHTS = 12;

const fightsDir = (home: string): string => path.join(home, "fights");

export const withCapture =
  (work: JobWork, home: string, env: NodeJS.ProcessEnv = process.env): JobWork =>
  async (args, ctl) => {
    const input = args.input as SolveInput;
    // The re-check replays from the wave-start save with no extras, so a mid-fight solve's input could never be one.
    if (!capturing(env) || input.extras !== undefined) return work(args, ctl);
    const stem = path.join(fightsDir(home), fightKey(input.save));
    const line = `${stem}${LINE}`;
    // A line kept beside an earlier solve's input belongs to that solve, not this one.
    drop(line);
    keep(`${stem}.json`, { live: input.live, save: input.save, liveExport: input.liveExport, cloneVersion: input.cloneVersion });
    prune(fightsDir(home));
    const result = (await work(args, ctl)) as SolveResult;
    if (!ctl.signal.aborted && result?.kind === "oracle_line") keep(line, scriptOf(result.oracleLine));
    return result;
  };

/** `<seed>-w<wave>-<fight>`, as the coach's boss plan names its file. */
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

const dashed = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** The line as the re-check's script: what live must show after each turn is what the line's checkpoint promised. */
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

const LINE = ".win.script.json";

/** By when each fight's input was last written; never fails the solve. */
function prune(dir: string): void {
  try {
    const inputs = readdirSync(dir)
      .filter(name => name.endsWith(".json") && !name.endsWith(LINE))
      .map(name => ({ stem: path.join(dir, name.slice(0, -".json".length)), at: statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
    for (const { stem } of inputs.slice(KEPT_FIGHTS)) {
      drop(`${stem}.json`);
      drop(`${stem}${LINE}`);
    }
  } catch {
    // Left for the next solve's prune.
  }
}

/** Whole or not at all, and never fails the solve. */
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
  } catch {
    // Never fails the solve.
  }
}
