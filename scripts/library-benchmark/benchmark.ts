import { appendStatisticsEntry, endOf, type Filter, type Recorder, type SolveEnd, solveStartsIn } from "../../src/solver/fight-library.ts";
import type { Carry } from "../../src/solver/gate.ts";
import { newerVersion } from "../../src/solver/no-answer.ts";
import type { SolveInput, SolveReport, SolveResult } from "../../src/solver/solver.ts";
import { type SearchFlags, type SearchSettings, searchSettings } from "../battle-oracle/settings.ts";
import { carryTo, messageOf } from "../library-replay/library-replay.ts";

export type NamedSettings = { name: string; settings: SearchSettings };

const FLAGS: readonly (keyof SearchFlags)[] = ["budget", "turns", "lds", "beams"];

/** `text` is a JSON object of named sets, each a set of `oracle:battle`'s search flags without their dashes. */
export function settingSets(text: string): { ok: true; sets: NamedSettings[] } | { ok: false; why: string } {
  let named: unknown;
  try {
    named = JSON.parse(text);
  } catch (e) {
    return { ok: false, why: `not JSON: ${messageOf(e)}` };
  }
  if (typeof named !== "object" || named === null || Array.isArray(named) || Object.keys(named).length === 0) {
    return { ok: false, why: "not an object of named setting sets" };
  }
  const sets: NamedSettings[] = [];
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

export type Options = { version: string; recorder?: Recorder; filter?: Filter; print?: (line: string) => void };

/**
 * Each solve start in `folder`'s selected fight folders, solved once per set on `version`. A live entry is never
 * rewritten: each solve only appends its own to the fight's statistics file.
 */
export async function benchmark(
  folder: string,
  sets: readonly NamedSettings[],
  solve: Solve,
  { version, recorder, filter = {}, print = () => {} }: Options,
): Promise<void> {
  const starts = solveStartsIn({ library: folder }, filter);
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  print(`library benchmark: solving ${plural(starts.length, "solve start")} in ${folder} under ${plural(sets.length, "setting set")} on game version ${version}`);
  for (const start of starts) {
    const { fight, turn, input: kept } = start;
    if ("why" in kept) {
      print(`  ${fight.folder} turn ${turn}: skipped, ${kept.why}`);
      continue;
    }
    const from = kept.save.gameVersion;
    if (newerVersion(from, version)) {
      print(`  ${fight.folder} turn ${turn}: skipped, its save is from ${from}, newer than ${version}`);
      continue;
    }
    const carry = carryTo(kept, version);
    for (const { name, settings } of sets) {
      const input: SolveInput = { ...kept, cloneVersion: version, ...settings };
      let report = null as SolveReport | null;
      let ended: SolveEnd | null;
      try {
        ended = endOf(await solve(input, reported => (report = reported), carry));
      } catch (e) {
        ended = { kind: "failed", failure: messageOf(e) };
      }
      if (ended === null) continue;
      const unwritten = appendStatisticsEntry(start, { input, ended, report, set: name }, recorder);
      print(`  ${fight.folder} turn ${turn}, "${name}": ${described(ended)}${unwritten ? `, statistics entry not written: ${unwritten.why}` : ""}`);
    }
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
