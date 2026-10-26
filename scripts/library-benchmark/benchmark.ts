/** Solves the fight library's fights again under named setting sets, each solve appending a statistics entry (#950). */
import { appendFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { endOf, ranUnder, type Recorder, type SolveEnd, STATISTICS, type SolveStatistics } from "../../src/solver/capture.ts";
import type { Carry } from "../../src/solver/gate.ts";
import { newerVersion } from "../../src/solver/no-answer.ts";
import type { SolveInput, SolveReport, SolveResult } from "../../src/solver/solver.ts";
import { type SearchFlags, type SearchSettings, searchSettings } from "../battle-oracle/settings.ts";
import { type Filter, selected } from "../library-replay/library-replay.ts";

export type SettingSet = { name: string; settings: SearchSettings };

const FLAGS: readonly (keyof SearchFlags)[] = ["budget", "turns", "lds", "beams"];

/** `text` is a JSON object of named sets, each a set of `oracle:battle`'s search flags without their dashes. */
export function settingSets(text: string): { ok: true; sets: SettingSet[] } | { ok: false; why: string } {
  let named: unknown;
  try {
    named = JSON.parse(text);
  } catch (e) {
    return { ok: false, why: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof named !== "object" || named === null || Array.isArray(named) || Object.keys(named).length === 0) {
    return { ok: false, why: "not an object of named setting sets" };
  }
  const sets: SettingSet[] = [];
  for (const [name, flags] of Object.entries(named)) {
    const refused = (why: string) => ({ ok: false as const, why: `setting set "${name}": ${why}` });
    if (typeof flags !== "object" || flags === null || Array.isArray(flags)) return refused("not an object of flags");
    for (const [flag, value] of Object.entries(flags)) {
      if (!FLAGS.includes(flag as keyof SearchFlags)) return refused(`${flag} is not one of ${FLAGS.join(", ")}`);
      if (typeof value !== "string") return refused(`${flag} is not a string`);
    }
    const read = searchSettings(flags as SearchFlags);
    if (!read.ok) return refused(read.why);
    sets.push({ name, settings: read.settings });
  }
  return { ok: true, sets };
}

/** `statistics` is handed the solve's report as it starts, which the solve fills in as it goes. */
export type Solve = (input: SolveInput, statistics: (report: SolveReport) => void, carry: Carry) => Promise<SolveResult>;

export type Options = { version: string; recorder: Recorder; filter?: Filter; print?: (line: string) => void };

const INPUT = /^turn-(\d+)\.json$/;

type Start = { fight: string; turn: number; kept: SolveInput | { why: string } };

/**
 * Each solve start in `folder`'s selected fight folders, solved once per set on `version`. A live entry is never
 * rewritten: each solve only appends its own to the fight's statistics file.
 */
export async function benchmark(
  folder: string,
  sets: readonly SettingSet[],
  solve: Solve,
  { version, recorder, filter = {}, print = () => {} }: Options,
): Promise<void> {
  const starts: Start[] = readdirSync(folder)
    .sort()
    .filter(fight => selected(fight, filter) && statSync(path.join(folder, fight)).isDirectory())
    .flatMap(fight =>
      readdirSync(path.join(folder, fight))
        .flatMap(file => {
          const turn = INPUT.exec(file)?.[1];
          return turn === undefined ? [] : [{ fight, turn: Number(turn), kept: read(path.join(folder, fight, file)) }];
        })
        .sort((a, b) => a.turn - b.turn),
    );
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  print(`library benchmark: solving ${plural(starts.length, "solve start")} in ${folder} under ${plural(sets.length, "setting set")} on game version ${version}`);
  for (const { fight, turn, kept } of starts) {
    if ("why" in kept) {
      print(`  ${fight} turn ${turn}: skipped, ${kept.why}`);
      continue;
    }
    const from = kept.save.gameVersion;
    if (newerVersion(from, version)) {
      print(`  ${fight} turn ${turn}: skipped, its save is from ${from}, newer than ${version}`);
      continue;
    }
    const carry = { carried: newerVersion(version, from) };
    for (const { name, settings } of sets) {
      const input: SolveInput = { ...kept, cloneVersion: version, ...settings };
      let reported: Partial<SolveReport> = {};
      let ended: SolveEnd | null;
      try {
        ended = endOf(await solve(input, report => (reported = report), carry));
      } catch (e) {
        ended = { kind: "failed", failure: e instanceof Error ? e.message : String(e) };
      }
      if (ended === null) continue;
      const entry: SolveStatistics = { ...ranUnder(input, turn, recorder), ...reported, ended, benchmark: { set: name } };
      appendFileSync(path.join(folder, fight, STATISTICS), JSON.stringify(entry) + "\n");
      print(`  ${fight} turn ${turn}, "${name}": ${described(ended)}`);
    }
  }
}

function read(file: string): SolveInput | { why: string } {
  try {
    const kept = JSON.parse(readFileSync(file, "utf8")) as SolveInput;
    return typeof kept?.save?.gameVersion === "string" ? kept : { why: `${path.basename(file)} holds no save` };
  } catch (e) {
    return { why: `${path.basename(file)} doesn't read: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function described(ended: SolveEnd): string {
  switch (ended.kind) {
    case "oracle_line":
      return "an oracle line";
    case "no_answer":
      return `no answer (${ended.code})`;
    case "failed":
      return `failed: ${ended.failure}`;
    case "cancelled":
      return "cancelled";
  }
}
