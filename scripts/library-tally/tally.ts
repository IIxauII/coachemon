/** How solving went across a fight folder tree's statistics entries, per setting set (#948). */
import type { SolveStatistics } from "../../src/solver/capture.ts";
import type { SearchStatistics } from "../../src/solver/search.ts";

/**
 * An entry of any schema, read for whatever fields it has, beside the fight folder it sits in. A search written before
 * #941 has its win and stages only.
 */
export type Entry = {
  fight: string;
  statistics: Partial<Omit<SolveStatistics, "search">> & { search?: Pick<SearchStatistics, "found" | "stages"> & Partial<SearchStatistics> };
};

type Statistics = Entry["statistics"];

export type Settings = Pick<Statistics, "budget" | "lds" | "portfolio">;

export type Count = { won: number; of: number };

export type FoundBy = { by: string; wins: number };

export type Spread = { median: number; max: number };

/** `wins` counts the wins whose entry says when it came; the rest are left out of the spreads. */
export type ToWin = { wins: number; turns: Spread; ms: Spread };

/** Each part totals over the solves whose entry recorded it, `solves` of them; `null` where none did (#949). */
export type TimeSplit = {
  startup: Startup | null;
  lds: Time | null;
  beams: Beams | null;
  replays: (Time & { ran: number }) | null;
  turns: TurnTime | null;
};

export type Time = { solves: number; ms: number };

export type Startup = Time & { gateMs: number; loadMs: number; poolMs: number };

/** The beams run side by side from one start, so `ms` totals each solve's longest; `each` is every beam's own. */
export type Beams = Time & { each: { beam: string; ms: number }[] };

/** Worker time, summed over the pool's workers, so it outruns the wall clock on more than one. */
export type TurnTime = { solves: number; turns: number; restoreMs: number; playMs: number };

/** `dropped` is every turn dropped over the `solves` that counted their drops, `top` the reasons that dropped the most. */
export type Drops = { solves: number; dropped: number; top: { reason: string; turns: number }[] };

/** A fight is won where any of its solves found an oracle line. */
export type Summary = { fights: Count; solves: Count; foundBy: FoundBy[]; toWin: ToWin | null; time: TimeSplit; drops: Drops | null };

/** `wave` is null for a folder not named as the recorder names a fight, whose `trainer` is then the folder's name. */
export type ByFight = Summary & { trainer: string; wave: number | null };

/** `benchmark` names the setting set a benchmark run's entries ran under, null for live solves. */
export type SettingSet = Summary & { benchmark: string | null; settings: Settings; byFight: ByFight[] };

export const NOT_RECORDED = "not recorded";

const TOP_DROPS = 3;

export function tally(entries: readonly Entry[]): SettingSet[] {
  const ordered = [...entries.filter(e => !benchmarkOf(e)), ...entries.filter(benchmarkOf)];
  return [...groups(ordered, e => JSON.stringify([benchmarkOf(e), settingsOf(e.statistics)]))].map(solves => ({
    benchmark: benchmarkOf(solves[0]),
    settings: settingsOf(solves[0].statistics),
    ...summary(solves),
    byFight: [...groups(solves, e => JSON.stringify(foughtAt(e.fight)))]
      .map(fought => ({ ...foughtAt(fought[0].fight), ...summary(fought) }))
      .sort((a, b) => (a.wave ?? Infinity) - (b.wave ?? Infinity) || a.trainer.localeCompare(b.trainer)),
  }));
}

const benchmarkOf = (e: Entry): string | null => e.statistics.benchmark?.set ?? null;

const settingsOf = ({ budget, lds, portfolio }: Statistics): Settings => ({ budget, lds, portfolio });

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
    time: { startup: startup(solves), lds: lds(solves), beams: beams(solves), replays: replays(solves), turns: turns(solves) },
    drops: drops(solves),
  };
}

function drops(solves: readonly Entry[]): Drops | null {
  const recorded = solves.flatMap(({ statistics }) => (statistics.search?.dropped ? [statistics.search.dropped] : []));
  if (recorded.length === 0) return null;
  const by = new Map<string, number>();
  for (const dropped of recorded) for (const [reason, turns] of Object.entries(dropped)) by.set(reason, (by.get(reason) ?? 0) + turns);
  const top = [...by]
    .map(([reason, turns]) => ({ reason, turns }))
    .sort((a, b) => b.turns - a.turns || a.reason.localeCompare(b.reason))
    .slice(0, TOP_DROPS);
  return { solves: recorded.length, dropped: sumOf([...by.values()], n => n), top };
}

/** A part still `null` counts as nothing spent on it. */
function startup(solves: readonly Entry[]): Startup | null {
  const recorded = solves.flatMap(({ statistics }) => (statistics.startup ? [statistics.startup] : []));
  if (recorded.length === 0) return null;
  const gateMs = sumOf(recorded, s => s.gateMs);
  const loadMs = sumOf(recorded, s => s.loadMs ?? 0);
  const poolMs = sumOf(recorded, s => s.pool?.ms ?? 0);
  return { solves: recorded.length, ms: gateMs + loadMs + poolMs, gateMs, loadMs, poolMs };
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

function stageOf({ search, portfolio }: Statistics): string {
  const found = search?.found;
  if (!found) return NOT_RECORDED;
  return found.stage === "lds" ? `discrepancy search, pass ${found.pass}` : beamName(found.index, portfolio);
}

function beamName(index: number, portfolio: Statistics["portfolio"]): string {
  const beam = portfolio?.[index];
  return beam ? `beam ${index} (${beam.width} wide, ours ${beam.ours})` : `beam ${index}`;
}

function replays(solves: readonly Entry[]): TimeSplit["replays"] {
  const recorded = solves.flatMap(({ statistics }) => (statistics.search?.replays ? [statistics.search.replays] : []));
  if (recorded.length === 0) return null;
  return { solves: recorded.length, ran: sumOf(recorded, r => r.ran), ms: sumOf(recorded, r => r.ms) };
}

/** Leaves out `null` turn times, which are a solve that played no turn on the pool or one cancelled before they were read. */
function turns(solves: readonly Entry[]): TurnTime | null {
  const recorded = solves.flatMap(({ statistics }) => (statistics.turnTimes ? [statistics.turnTimes] : []));
  if (recorded.length === 0) return null;
  return {
    solves: recorded.length,
    turns: sumOf(recorded, t => t.play.count),
    restoreMs: sumOf(recorded, t => t.restore.totalMs),
    playMs: sumOf(recorded, t => t.play.totalMs),
  };
}

const sumOf = <T>(items: readonly T[], part: (item: T) => number) => items.reduce((total, item) => total + part(item), 0);

function lds(solves: readonly Entry[]): Time | null {
  const recorded = solves.flatMap(({ statistics }) => statistics.search?.stages.filter(s => s.stage === "lds") ?? []);
  return recorded.length === 0 ? null : { solves: recorded.length, ms: sumOf(recorded, s => s.ms) };
}

function beams(solves: readonly Entry[]): Beams | null {
  const ran = solves.flatMap(({ statistics: { search, portfolio } }) => {
    const beams = search?.stages.flatMap(s => (s.stage === "beam" ? [{ beam: beamName(s.index, portfolio), index: s.index, ms: s.ms }] : [])) ?? [];
    return beams.length > 0 ? [beams] : [];
  });
  if (ran.length === 0) return null;
  const each = new Map<string, { index: number; ms: number }>();
  for (const { beam, index, ms } of ran.flat()) each.set(beam, { index, ms: (each.get(beam)?.ms ?? 0) + ms });
  return {
    solves: ran.length,
    ms: sumOf(ran, beams => Math.max(...beams.map(b => b.ms))),
    each: [...each].sort(([, a], [, b]) => a.index - b.index).map(([beam, { ms }]) => ({ beam, ms })),
  };
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
function winAt({ search }: Statistics): { turns: number; ms: number } | null {
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
  return sets
    .map(set =>
      [`### ${set.benchmark === null ? "live" : `benchmark "${set.benchmark}"`}: ${settingsLine(set.settings)}`, ...summaryLines(set), ...timeLines(set), "", ...fightTable(set.byFight), "", ...timeTable(set.byFight)].join("\n"),
    )
    .join("\n\n");
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

const over = (solves: number) => `over ${solves} solve${solves === 1 ? "" : "s"}`;

function timeLines({ time: { startup, lds, beams, replays, turns }, drops }: Summary): string[] {
  return [
    ...(startup
      ? [`startup: ${time(startup.ms)} ${over(startup.solves)} (gate ${time(startup.gateMs)}, load check ${time(startup.loadMs)}, pool start ${time(startup.poolMs)})`]
      : []),
    ...(lds ? [`discrepancy search: ${time(lds.ms)} ${over(lds.solves)}`] : []),
    ...(beams ? [`beams side by side: ${time(beams.ms)} ${over(beams.solves)} (${beams.each.map(b => `${b.beam} ${time(b.ms)}`).join("; ")})`] : []),
    ...(replays ? [`confirming replays: ${replays.ran}, in ${time(replays.ms)}, ${over(replays.solves)}`] : []),
    ...(turns
      ? [`turns played: ${turns.turns}, restoring ${time(turns.restoreMs)} and playing ${time(turns.playMs)} of worker time, ${over(turns.solves)}`]
      : []),
    ...(drops
      ? [`top drop reasons: ${drops.top.length > 0 ? `${dropsText(drops)}; of ${drops.dropped} dropped` : "none"} ${over(drops.solves)}`]
      : []),
  ];
}

const dropsText = ({ top }: Drops) => top.map(d => `${d.reason}: ${d.turns}`).join("; ");

const timed = (ms: number | undefined) => (ms === undefined ? "—" : time(ms));

function timeTable(rows: readonly ByFight[]): string[] {
  return [
    "| trainer | wave | startup | discrepancy search | beams side by side | confirming replays | restoring | playing | top drop reason |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows
      .map(({ trainer, wave, time: t, drops }) =>
        [
          trainer,
          wave ?? "—",
          timed(t.startup?.ms),
          timed(t.lds?.ms),
          timed(t.beams?.ms),
          timed(t.replays?.ms),
          timed(t.turns?.restoreMs),
          timed(t.turns?.playMs),
          drops ? dropsText({ ...drops, top: drops.top.slice(0, 1) }) || "none" : "—",
        ].join(" | "),
      )
      .map(row => `| ${row} |`),
  ];
}
