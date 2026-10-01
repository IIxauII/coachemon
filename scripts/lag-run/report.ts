/**
 * Reads lag-run logs into the numbers a comparison is judged by (#484): tick p50/p95/max and frame gaps of 50 ms and
 * up, per moment and per card kind. A gap the hub's commands spent more of than the overlay is the driver's, counted
 * apart and never compared.
 */
import { MOMENT_NAMES, MOMENTS, type Moment } from "./moments.ts";
import { formatFacts, formatWaves, gameFacts, perWave, type WaveRecord, type WaveWindow } from "./waves.ts";

export const GAP_MS = 50;

type Tick = { seq: number; at: number; ms: number; kind: string | null };
type Gap = { at: number; gap: number; panel: number; driver?: number; stage: string | null; ticks: number[]; kind?: string | null };
export type Window = { moments: Moment[]; stats: { ticks: Tick[]; gaps: Gap[] } };
export type Dist = { n: number; p50: number; p95: number; max: number } | null;
export type Cell = { windows: number; ticks: Dist; gaps: Dist; driverGaps: Dist };
export type Summary = { moments: Record<Moment, Cell>; kinds: Record<string, Cell>; total: Cell };

const rank = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
export const dist = (xs: number[]): Dist => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, p50: rank(s, 0.5), p95: rank(s, 0.95), max: s[s.length - 1] };
};

type Acc = { windows: number; ticks: number[]; gaps: number[]; driverGaps: number[] };
const acc = (): Acc => ({ windows: 0, ticks: [], gaps: [], driverGaps: [] });
const cell = (a: Acc): Cell => ({ windows: a.windows, ticks: dist(a.ticks), gaps: dist(a.gaps), driverGaps: dist(a.driverGaps) });
/** A refresh drained just before its frame lands as a gap with a little of the driver's in it (#515). */
const isDriverGap = (g: { panel: number; driver?: number }) => (g.driver ?? 0) > g.panel;
const addGap = (a: Acc, g: Gap) => { (isDriverGap(g) ? a.driverGaps : a.gaps).push(g.gap); };

/** A gap's card is the one its refreshes drew, else the last one drawn before it. */
const kindOfGap = (g: Gap, ticks: Tick[]): string => {
  if (g.ticks.length && "kind" in g) return g.kind ?? "none";
  const own = ticks.find(t => g.ticks.includes(t.seq));
  if (own) return own.kind ?? "none";
  const before = ticks.filter(t => t.at <= g.at).at(-1);
  return before?.kind ?? "none";
};

export function summarize(windows: Window[]): Summary {
  const moments = Object.fromEntries(MOMENTS.map(m => [m, acc()])) as Record<Moment, Acc>;
  const kinds: Record<string, Acc> = {};
  const total = acc();
  for (const w of windows) {
    const gaps = w.stats.gaps.filter(g => g.gap >= GAP_MS);
    const into = (a: Acc) => { a.windows++; a.ticks.push(...w.stats.ticks.map(t => t.ms)); gaps.forEach(g => addGap(a, g)); };
    into(total);
    for (const m of new Set(w.moments)) into(moments[m]);
    const seen = new Set<string>();
    for (const t of w.stats.ticks) {
      const k = (kinds[t.kind ?? "none"] ??= acc());
      k.ticks.push(t.ms);
      if (!seen.has(t.kind ?? "none")) { seen.add(t.kind ?? "none"); k.windows++; }
    }
    for (const g of gaps) addGap((kinds[kindOfGap(g, w.stats.ticks)] ??= acc()), g);
  }
  return {
    moments: Object.fromEntries(MOMENTS.map(m => [m, cell(moments[m])])) as Record<Moment, Cell>,
    kinds: Object.fromEntries(Object.entries(kinds).map(([k, a]) => [k, cell(a)])),
    total: cell(total),
  };
}

export type Side = { before: Cell; after: Cell; met: boolean };
export type Comparison = { moments: Record<Moment, Side>; kinds: Record<string, Side>; total: { before: Cell; after: Cell } };

const empty: Cell = { windows: 0, ticks: null, gaps: null, driverGaps: null };

export function compare(before: Window[][], after: Window[][]): Comparison {
  const b = summarize(before.flat()), a = summarize(after.flat());
  const side = (x: Cell | undefined, y: Cell | undefined): Side =>
    ({ before: x ?? empty, after: y ?? empty, met: (x?.windows ?? 0) > 0 && (y?.windows ?? 0) > 0 });
  const kinds = [...new Set([...Object.keys(b.kinds), ...Object.keys(a.kinds)])].sort();
  return {
    moments: Object.fromEntries(MOMENTS.map(m => [m, side(b.moments[m], a.moments[m])])) as Record<Moment, Side>,
    kinds: Object.fromEntries(kinds.map(k => [k, side(b.kinds[k], a.kinds[k])])),
    total: { before: b.total, after: a.total },
  };
}

export type RunLog = {
  header: { team?: string[]; slot?: number; waves?: number; started?: string } | null;
  windows: Window[];
  waves: WaveRecord[];
  summary: { stop?: string; wallMs?: number; wave?: number | null; calls?: number; by?: Record<string, number>; hidden?: number } | null;
};

export function parseRun(text: string): RunLog {
  const out: RunLog = { header: null, windows: [], waves: [], summary: null };
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const o = JSON.parse(line) as { kind?: string };
    if (o.kind === "run") out.header = o as RunLog["header"];
    else if (o.kind === "window") out.windows.push(o as unknown as Window);
    else if (o.kind === "wave") out.waves.push(o as unknown as WaveRecord);
    else if (o.kind === "summary") out.summary = o as RunLog["summary"];
  }
  return out;
}

const spread = (x: Dist) => (x ? `${x.p50} / ${x.p95} / ${x.max}` : "–");
const count = (x: Dist) => String(x?.n ?? 0);

/** The waves a run finished, up to the length it was started for. */
export const wavesOf = (run: RunLog) =>
  perWave(run.windows as unknown as WaveWindow[], run.waves, run.header?.waves ?? Infinity, run.summary?.stop === "waves-reached");

export function formatRun(name: string, run: RunLog): string {
  const s = summarize(run.windows);
  const sm = run.summary;
  const lines = [
    `## ${name}`,
    "",
    `stop **${sm?.stop ?? "?"}** at wave ${sm?.wave ?? "?"}, wall ${sm?.wallMs ? (sm.wallMs / 60000).toFixed(1) : "?"} min, ${sm?.calls ?? "?"} calls` +
      `${sm?.by ? `, decisions by card ${sm.by.card ?? 0} / rule ${sm.by.rule ?? 0}` : ""}${sm?.hidden ? `, **tab hidden ${sm.hidden}×**` : ""}`,
    "",
    `| | windows | ticks | tick ms p50 / p95 / max | gaps ≥ ${GAP_MS} | gap ms p50 / p95 / max | driver gaps | driver gap ms |`,
    "|---|---|---|---|---|---|---|---|",
  ];
  const row = (label: string, c: Cell) => `| ${label} | ${c.windows} | ${count(c.ticks)} | ${spread(c.ticks)} | ${count(c.gaps)} | ${spread(c.gaps)} | ${count(c.driverGaps)} | ${spread(c.driverGaps)} |`;
  for (const m of MOMENTS) lines.push(s.moments[m].windows ? row(MOMENT_NAMES[m], s.moments[m]) : `| ${MOMENT_NAMES[m]} | not met | | | | | | |`);
  for (const [k, c] of Object.entries(s.kinds).sort()) lines.push(row(`card: ${k}`, c));
  lines.push(row("whole run", s.total));
  lines.push("", formatFacts(gameFacts(run.windows as unknown as WaveWindow[])), "", formatWaves(wavesOf(run)));
  return lines.join("\n");
}

export function formatComparison(c: Comparison, runs: { before: RunLog[]; after: RunLog[] }): string {
  const wall = (rs: RunLog[]) => rs.map(r => (r.summary?.wallMs ? (r.summary.wallMs / 60000).toFixed(1) : "?")).join(", ");
  const lines = [
    `before: ${runs.before.length} runs (${wall(runs.before)} min) · after: ${runs.after.length} runs (${wall(runs.after)} min)`,
    "",
    `| | tick ms before | tick ms after | gaps ≥ ${GAP_MS} before | gaps ≥ ${GAP_MS} after | gap ms before | gap ms after |`,
    "|---|---|---|---|---|---|---|",
  ];
  const cells = (label: string, x: { before: Cell; after: Cell }) =>
    `| ${label} | ${spread(x.before.ticks)} | ${spread(x.after.ticks)} | ${count(x.before.gaps)} | ${count(x.after.gaps)} | ${spread(x.before.gaps)} | ${spread(x.after.gaps)} |`;
  const row = (label: string, x: Side) => (x.met
    ? cells(label, x)
    : `| ${label} | not met (${[x.before.windows ? null : "before", x.after.windows ? null : "after"].filter(Boolean).join(", ")}) | | | | | |`);
  for (const m of MOMENTS) lines.push(row(MOMENT_NAMES[m], c.moments[m]));
  for (const [k, x] of Object.entries(c.kinds)) lines.push(row(`card: ${k}`, x));
  const t = c.total;
  lines.push(cells("whole run (not judged)", t));
  lines.push("", `driver gaps, left out: before ${count(t.before.driverGaps)} (${spread(t.before.driverGaps)} ms), after ${count(t.after.driverGaps)} (${spread(t.after.driverGaps)} ms)`);
  return lines.join("\n");
}
