/**
 * Turns a fight `COACHEMON_CAPTURE=1` recorded, waiting under the home or imported into the fight library, into a known
 * fight (#787, #936, #970). Promoting is the maintainer's word that live won the fight on the kept oracle line: nothing
 * here checks that.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fightName, solveStartAt } from "../../src/solver/fight-library.ts";
import { type Script, WIN_SCRIPT } from "../../src/solver/script.ts";
import type { SolveInput } from "../../src/solver/solver.ts";
import type { KnownFight } from "./recheck.ts";

export type { KnownFight };

export type PromoteDeps = {
  fixtures: string;
  knownFights: string;
  pin: string;
  /** The re-check of that one fight, at the pin. */
  recheck: (fight: KnownFight) => Promise<{ failed: string[] }>;
};

export type Promoted = { promoted: KnownFight } | { refused: string };

/** A known fight's `<stem>.json`. */
type Recorded = Pick<SolveInput, "live" | "save" | "liveExport">;

/** `kept` is a fight folder, for its first-turn solve, or either of a solve's two files in one. */
export async function promote(kept: string, deps: PromoteDeps, stem?: string): Promise<Promoted> {
  const read = readKept(kept, deps.pin);
  if ("refused" in read) return read;
  const { recorded, script } = read;

  const fight = named(stem ?? `${fightName(recorded.save)}-w${recorded.save.waveIndex}`);
  const files = [path.join(deps.fixtures, `${fight.stem}.json`), path.join(deps.fixtures, `${fight.stem}${WIN_SCRIPT}`)];
  const known = JSON.parse(readFileSync(deps.knownFights, "utf8")) as KnownFight[];
  if (files.some(f => existsSync(f)) || known.some(k => k.stem === fight.stem)) {
    return { refused: `the fixtures already hold a known fight ${fight.stem}: promote it under another name with --stem <name>.` };
  }

  const takeBack = () => {
    for (const file of files) rmSync(file, { force: true });
    writeFileSync(deps.knownFights, listed(known));
  };
  writeFileSync(files[0], JSON.stringify(recorded) + "\n");
  writeFileSync(files[1], JSON.stringify(script) + "\n");
  writeFileSync(deps.knownFights, listed([...known, fight]));
  let failed: string[];
  try {
    ({ failed } = await deps.recheck(fight));
  } catch (e) {
    takeBack();
    throw e;
  }
  if (failed.length === 0) return { promoted: fight };
  takeBack();
  return { refused: `the re-check of ${fight.name} failed: ${failed.join("; ")}. Nothing was promoted.` };
}

function readKept(kept: string, pin: string): { recorded: Recorded; script: Script } | { refused: string } {
  const start = solveStartAt(kept);
  if ("why" in start) return { refused: start.why };
  const { input, oracleLine, files } = start;
  if ("why" in input) return { refused: input.why };
  if (input.extras !== undefined) {
    return { refused: `${files.input} is a mid-fight solve's: the re-check replays a fight from its wave-start save, with no extras.` };
  }
  if (input.save.gameVersion !== pin) {
    return {
      refused: `${files.input} was saved on game version ${input.save.gameVersion}, and the pin is ${pin}: the re-check would carry it, where a known fight recorded now replays without one.`,
    };
  }
  if (oracleLine === null) {
    return { refused: `${files.input} has no oracle line file: its solve ended without an oracle line, so there is none it was won on.` };
  }
  if ("why" in oracleLine) return { refused: oracleLine.why };
  const { live, save, liveExport } = input;
  return { recorded: { live, save, liveExport }, script: oracleLine };
}

/** `gordie-w180` is `Gordie W180`. */
const named = (stem: string): KnownFight => ({
  stem,
  name: stem
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" "),
});

const listed = (fights: readonly KnownFight[]) => `[\n${fights.map(f => `  ${JSON.stringify(f)}`).join(",\n")}\n]\n`;
