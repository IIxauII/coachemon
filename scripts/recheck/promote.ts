/**
 * Turns a fight `COACHEMON_CAPTURE=1` kept under the home into a known fight (#787). Promoting is the maintainer's word
 * that live won the fight on the kept line: nothing here checks that.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fightName } from "../../src/solver/capture.ts";
import { readScript, type SessionSave } from "../../src/solver/solver.ts";
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

const LINE = ".win.script.json";

/** `kept` is either of the fight's two files. */
export async function promote(kept: string, deps: PromoteDeps, stem?: string): Promise<Promoted> {
  const keptStem = kept.endsWith(LINE) ? kept.slice(0, -LINE.length) : kept.replace(/\.json$/, "");
  const read = readKept(keptStem, deps.pin);
  if ("refused" in read) return read;
  const { given, line } = read;

  const fight = named(stem ?? `${fightName(given.save)}-w${given.save.waveIndex}`);
  const files = [path.join(deps.fixtures, `${fight.stem}.json`), path.join(deps.fixtures, `${fight.stem}${LINE}`)];
  const known = JSON.parse(readFileSync(deps.knownFights, "utf8")) as KnownFight[];
  if (files.some(f => existsSync(f)) || known.some(k => k.stem === fight.stem)) {
    return { refused: `the fixtures already hold a known fight ${fight.stem}: promote it under another name with --stem <name>.` };
  }

  writeFileSync(files[0], JSON.stringify(given) + "\n");
  writeFileSync(files[1], line);
  writeFileSync(deps.knownFights, listed([...known, fight]));
  const { failed } = await deps.recheck(fight);
  if (failed.length === 0) return { promoted: fight };
  for (const file of files) rmSync(file, { force: true });
  writeFileSync(deps.knownFights, listed(known));
  return { refused: `the re-check of ${fight.name} failed: ${failed.join("; ")}. Nothing was promoted.` };
}

type Given = { live: unknown; save: SessionSave; liveExport: unknown };

function readKept(keptStem: string, pin: string): { given: Given; line: string } | { refused: string } {
  const kept = JSON.parse(readFileSync(`${keptStem}.json`, "utf8")) as Given & { cloneVersion?: string; extras?: unknown };
  if (kept.extras !== undefined) {
    return { refused: `${keptStem}.json is a mid-fight solve's: the re-check replays a fight from its wave-start save, with no extras.` };
  }
  if (kept.save?.gameVersion !== pin) {
    return {
      refused: `${keptStem}.json was saved on game version ${kept.save?.gameVersion}, and the pin is ${pin}: the re-check would carry it, where a known fight recorded now replays without one.`,
    };
  }
  if (!existsSync(`${keptStem}${LINE}`)) {
    return { refused: `${keptStem} has no line file: its solve ended without an oracle line, so there is no line it was won on.` };
  }
  const line = readFileSync(`${keptStem}${LINE}`, "utf8");
  try {
    readScript(line);
  } catch (e) {
    return { refused: `${keptStem}${LINE} doesn't read as a script: ${e instanceof Error ? e.message : String(e)}` };
  }
  const { cloneVersion: _version, ...given } = kept;
  return { given, line };
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
