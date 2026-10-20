/**
 * The developer's `COACHEMON_CAPTURE=1`: a solve from a fight's wave-start save keeps what it solved from, and the oracle
 * line it found, under the home as a known fight's two files (#787). Never a player's: unset, nothing is written.
 */
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NAMES, TrainerVariant } from "../enums/generated.ts";
import type { JobWork } from "../jobs.ts";
import { type Script, WIN_SCRIPT } from "./script.ts";
import type { MonState, OracleLine, SessionSave, SolveInput, SolveResult } from "./solver.ts";

const KEPT_FIGHTS = 12;

export const withCapture =
  (work: JobWork, home: string, env: NodeJS.ProcessEnv = process.env): JobWork =>
  async (args, ctl) => {
    const input = args.input as SolveInput;
    if (env.COACHEMON_CAPTURE !== "1" || input.extras !== undefined) return work(args, ctl);
    const dir = path.join(home, "fights");
    const stem = path.join(dir, fightKey(input.save));
    const won = `${stem}${WIN_SCRIPT}`;
    // An oracle line kept beside an earlier solve's input belongs to that solve, not this one.
    drop(won);
    const { live, save, liveExport, cloneVersion, budget } = input;
    keep(`${stem}.json`, { live, save, liveExport, cloneVersion, budget });
    prune(dir);
    const result = (await work(args, ctl)) as SolveResult;
    if (!ctl.signal.aborted && result?.kind === "oracle_line") keep(won, scriptOf(result.oracleLine));
    return result;
  };

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

/** Never fails the solve, nor do `keep` and `drop`. */
function prune(dir: string): void {
  try {
    const inputs = readdirSync(dir)
      .filter(name => name.endsWith(".json") && !name.endsWith(WIN_SCRIPT))
      .map(name => ({ stem: path.join(dir, name.slice(0, -".json".length)), at: statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
    for (const { stem } of inputs.slice(KEPT_FIGHTS)) {
      drop(`${stem}.json`);
      drop(`${stem}${WIN_SCRIPT}`);
    }
  } catch {}
}

/** Whole or not at all. */
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
