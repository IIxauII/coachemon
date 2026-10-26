/** How solving went across a fight folder tree's statistics entries, per setting set (#948). */
import type { SolveStatistics } from "../../src/solver/capture.ts";

/** An entry of any schema, read for whatever fields it has, beside the fight folder it sits in. */
export type Entry = { fight: string; statistics: Partial<SolveStatistics> };

export type Settings = Pick<Partial<SolveStatistics>, "budget" | "lds" | "portfolio">;

export type Count = { won: number; of: number };

export type FoundBy = { by: string; wins: number };

export type Spread = { median: number; max: number };

/** `wins` counts the wins whose entry says when it came; the rest are left out of the spreads. */
export type ToWin = { wins: number; turns: Spread; ms: Spread };

/** A fight is won where any of its solves found an oracle line. */
export type Summary = { fights: Count; solves: Count; foundBy: FoundBy[]; toWin: ToWin | null };

/** `wave` is null for a folder not named as the recorder names a fight, whose `trainer` is then the folder's name. */
export type ByFight = Summary & { trainer: string; wave: number | null };

export type SettingSet = Summary & { settings: Settings; byFight: ByFight[] };

export const NOT_RECORDED = "not recorded";

export function tally(entries: readonly Entry[]): SettingSet[] {
  return [...groups(entries, e => JSON.stringify(settingsOf(e.statistics)))].map(solves => ({
    settings: settingsOf(solves[0].statistics),
    ...summary(solves),
    byFight: [...groups(solves, e => JSON.stringify(foughtAt(e.fight)))]
      .map(fought => ({ ...foughtAt(fought[0].fight), ...summary(fought) }))
      .sort((a, b) => (a.wave ?? Infinity) - (b.wave ?? Infinity) || a.trainer.localeCompare(b.trainer)),
  }));
}

const settingsOf = ({ budget, lds, portfolio }: Partial<SolveStatistics>): Settings => ({ budget, lds, portfolio });

function groups(entries: readonly Entry[], key: (e: Entry) => string): Iterable<Entry[]> {
  const by = new Map<string, Entry[]>();
  for (const e of entries) by.set(key(e), [...(by.get(key(e)) ?? []), e]);
  return by.values();
}

/** The recorder's `<seed>-w<wave>-<fight>`. */
const FIGHT = /^.+-w(\d+)-([a-z0-9-]+)$/;

function foughtAt(fight: string): { trainer: string; wave: number | null } {
  const [, wave, trainer] = FIGHT.exec(fight) ?? [];
  return wave === undefined ? { trainer: fight, wave: null } : { trainer, wave: Number(wave) };
}

const won = (e: Entry) => e.statistics.ended?.kind === "oracle_line";

function summary(solves: readonly Entry[]): Summary {
  const wins = solves.filter(won);
  return {
    fights: fightsWon(solves),
    solves: { won: wins.length, of: solves.length },
    foundBy: foundBy(wins),
    toWin: toWin(wins),
  };
}

function fightsWon(solves: readonly Entry[]): Count {
  const fights = new Map<string, boolean>();
  for (const e of solves) fights.set(e.fight, (fights.get(e.fight) ?? false) || won(e));
  return { won: [...fights.values()].filter(Boolean).length, of: fights.size };
}

function foundBy(wins: readonly Entry[]): FoundBy[] {
  const counts = new Map<string, number>();
  for (const { statistics } of wins) {
    const by = stageOf(statistics);
    counts.set(by, (counts.get(by) ?? 0) + 1);
  }
  const last = (by: string) => (by === NOT_RECORDED ? 1 : 0);
  return [...counts]
    .map(([by, wins]) => ({ by, wins }))
    .sort((a, b) => last(a.by) - last(b.by) || b.wins - a.wins);
}

function stageOf({ search, portfolio }: Partial<SolveStatistics>): string {
  const found = search?.found;
  if (!found) return NOT_RECORDED;
  if (found.stage === "lds") return `discrepancy search, pass ${found.pass}`;
  const beam = portfolio?.[found.index];
  return beam ? `beam ${found.index} (${beam.width} wide, ours ${beam.ours})` : `beam ${found.index}`;
}

function toWin(wins: readonly Entry[]): ToWin | null {
  const came = wins.flatMap(({ statistics }) => {
    const at = winAt(statistics);
    return at ? [at] : [];
  });
  if (came.length === 0) return null;
  return { wins: came.length, turns: spread(came.map(c => c.turns)), ms: spread(came.map(c => c.ms)) };
}

/** A beam's `ms` counts from when the beams started, which is after the discrepancy search ended. */
function winAt({ search }: Partial<SolveStatistics>): { turns: number; ms: number } | null {
  const winner = search?.stages.find(s => s.ended === "won");
  if (!search?.found || !winner) return null;
  const before = winner.stage === "beam" ? (search.stages.find(s => s.stage === "lds")?.ms ?? 0) : 0;
  return { turns: search.found.spent, ms: before + winner.ms };
}

function spread(values: readonly number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = Number.isInteger(mid) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
  return { median: Math.round(median), max: sorted[sorted.length - 1] };
}

export function report(entries: readonly Entry[]): string {
  const sets = tally(entries);
  if (sets.length === 0) return "no statistics entries";
  return sets.map(set => [`### ${settingsLine(set.settings)}`, ...summaryLines(set), "", ...fightTable(set.byFight)].join("\n")).join("\n\n");
}

function settingsLine({ budget, lds, portfolio }: Settings): string {
  if (budget === undefined && lds === undefined && portfolio === undefined) return "settings not recorded";
  const beams = portfolio ? `beams ${portfolio.map(b => `${b.width} wide ours ${b.ours}`).join(", ")}` : "beams not recorded";
  const each = budget ? `, ${budget.expansions} turns each, to turn ${budget.turns}` : "";
  const discrepancy =
    lds === null
      ? "no discrepancy search"
      : lds === undefined
        ? "discrepancy search not recorded"
        : `discrepancy search ${lds.expansions} turns, ${lds.alternatives} alternatives, ${lds.discrepancies} discrepancies, ours ${lds.ours}`;
  return `${beams}${each}; ${discrepancy}`;
}

const count = ({ won, of }: Count) => `${won} of ${of}`;

const foundByText = (foundBy: readonly FoundBy[]) => foundBy.map(f => `${f.by}: ${f.wins}`).join("; ");

const time = (ms: number) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60_000).toFixed(1)} min`);

function summaryLines({ fights, solves, toWin, foundBy }: Summary): string[] {
  return [
    `fights won: ${count(fights)}; solves won: ${count(solves)}`,
    ...(toWin
      ? [
          `turns to the first win: median ${toWin.turns.median}, max ${toWin.turns.max}, over ${toWin.wins} win${toWin.wins === 1 ? "" : "s"}`,
          `time to the first win: median ${time(toWin.ms.median)}, max ${time(toWin.ms.max)}`,
        ]
      : []),
    ...(foundBy.length > 0 ? [`found by: ${foundByText(foundBy)}`] : []),
  ];
}

function fightTable(rows: readonly ByFight[]): string[] {
  return [
    "| trainer | wave | fights won | solves won | turns to the first win, median | time to it, median | found by |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(r =>
      [
        r.trainer,
        r.wave ?? "—",
        count(r.fights),
        count(r.solves),
        r.toWin?.turns.median ?? "—",
        r.toWin ? time(r.toWin.ms.median) : "—",
        foundByText(r.foundBy) || "—",
      ].join(" | "),
    ).map(row => `| ${row} |`),
  ];
}
