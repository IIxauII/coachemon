/**
 * Turns a fight `COACHEMON_CAPTURE=1` kept under the home into a known fight (#787). Promoting is the maintainer's word
 * that live won the fight on the kept oracle line: nothing here checks that.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fightName } from "../../src/solver/capture.ts";
import { WIN_SCRIPT } from "../../src/solver/script.ts";
import { readScript, type SolveInput } from "../../src/solver/solver.ts";
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
type Recorded = Required<Pick<SolveInput, "live" | "save" | "liveExport">>;

/** `kept` is either of the fight's two files. */
export async function promote(kept: string, deps: PromoteDeps, stem?: string): Promise<Promoted> {
  const keptStem = kept.endsWith(WIN_SCRIPT) ? kept.slice(0, -WIN_SCRIPT.length) : kept.replace(/\.json$/, "");
  const read = readKept(keptStem, deps.pin);
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
  writeFileSync(files[1], script);
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

function readKept(keptStem: string, pin: string): { recorded: Recorded; script: string } | { refused: string } {
  const kept = JSON.parse(readFileSync(`${keptStem}.json`, "utf8")) as Recorded & Partial<Pick<SolveInput, "extras" | "cloneVersion" | "budget">>;
  if (kept.extras !== undefined) {
    return { refused: `${keptStem}.json is a mid-fight solve's: the re-check replays a fight from its wave-start save, with no extras.` };
  }
  if (kept.save?.gameVersion !== pin) {
    return {
      refused: `${keptStem}.json was saved on game version ${kept.save?.gameVersion}, and the pin is ${pin}: the re-check would carry it, where a known fight recorded now replays without one.`,
    };
  }
  if (!existsSync(`${keptStem}${WIN_SCRIPT}`)) {
    return { refused: `${keptStem} has no oracle line file: its solve ended without an oracle line, so there is none it was won on.` };
  }
  const script = readFileSync(`${keptStem}${WIN_SCRIPT}`, "utf8");
  try {
    readScript(script);
  } catch (e) {
    return { refused: `${keptStem}${WIN_SCRIPT} doesn't read as a script: ${e instanceof Error ? e.message : String(e)}` };
  }
  const { live, save, liveExport } = kept;
  return { recorded: { live, save, liveExport }, script };
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
