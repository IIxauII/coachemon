/**
 * The developer's `COACHEMON_CAPTURE=1`: a solve keeps what it solved from, the wave-start save or a mid-fight augmented
 * export, and the oracle line it found, as the fight library's two files under the turn it started at, in that fight's
 * folder under the home (#787, #936, #937). Never a player's: unset, nothing is written.
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NAMES, TrainerVariant } from "../enums/generated.ts";
import type { JobWork } from "../jobs.ts";
import { type Script, WIN_SCRIPT } from "./script.ts";
import type { MonState, OracleLine, SessionSave, SolveInput, SolveResult } from "./solver.ts";

export const FIRST_TURN = "turn-1";

export const withCapture =
  (work: JobWork, home: string, env: NodeJS.ProcessEnv = process.env): JobWork =>
  async (args, ctl) => {
    const input = args.input as SolveInput;
    const turn = input.extras === undefined ? FIRST_TURN : Number.isInteger(input.extras.turn) ? `turn-${input.extras.turn}` : null;
    if (env.COACHEMON_CAPTURE !== "1" || turn === null) return work(args, ctl);
    const stem = path.join(home, "fights", fightKey(input.save), turn);
    const { live, save, extras, liveExport, cloneVersion, budget } = input;
    keep(`${stem}.json`, { live, save, extras, liveExport, cloneVersion, budget });
    const result = (await work(args, ctl)) as SolveResult;
    if (!ctl.signal.aborted && result?.kind === "oracle_line") keep(`${stem}${WIN_SCRIPT}`, scriptOf(result.oracleLine));
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
