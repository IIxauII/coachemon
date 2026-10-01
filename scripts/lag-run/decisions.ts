/**
 * The two numbers that judge the refresh model (#487, #519), read off the meter's decisions: **decision → card ms**,
 * from the decision beginning to the end of the first refresh that came back with its kind of card, and **late block
 * ms**, the overlay's refresh time more than 250 ms after the decision began.
 */
import { dist, type Dist } from "./report.ts";

/** Every time is ms after `at`; `drawn` null is a decision left before its card came. */
export type Decision = {
  id: number; kind: string; card: string; wave: number | null; at: number;
  ready: number | null; input: number | null; drawn: number | null; refreshes: number; ms: number; late: number; end: number | null;
};
type DecisionWindow = { stats: { decisions?: Decision[]; watch?: { frames: number; ms: number }; facts?: { refresh?: string | null } } };

/** A decision open across a drain is in both: the later copy is the whole one. Ids restart with each overlay. */
export function decisionsOf(windows: DecisionWindow[]): Decision[] {
  const byId = new Map<string, Decision>();
  for (const w of windows) for (const d of w.stats.decisions ?? []) byId.set(`${d.id}|${d.at}`, d);
  return [...byId.values()];
}

export type KindRow = {
  kind: string; n: number; ready: Dist; input: Dist; drawn: Dist; afterInput: Dist; lateInput: number; notDrawn: number;
  late: { ms: number; n: number; max: number };
};

export function byKind(ds: Decision[]): KindRow[] {
  const kinds = [...new Set(ds.map(d => d.kind))].sort();
  return kinds.map(kind => {
    const k = ds.filter(d => d.kind === kind);
    const drawn = k.filter(d => d.drawn !== null);
    const both = drawn.filter(d => d.input !== null);
    const late = k.map(d => d.late).filter(x => x > 0);
    return {
      kind, n: k.length,
      ready: dist(k.flatMap(d => (d.ready === null ? [] : [d.ready]))),
      input: dist(k.flatMap(d => (d.input === null ? [] : [d.input]))),
      drawn: dist(drawn.map(d => d.drawn!)),
      afterInput: dist(both.map(d => Math.round((d.drawn! - d.input!) * 10) / 10)),
      lateInput: both.filter(d => d.drawn! > d.input!).length,
      notDrawn: k.length - drawn.length,
      late: { ms: Math.round(late.reduce((a, b) => a + b, 0)), n: late.length, max: late.length ? Math.max(...late) : 0 },
    };
  });
}

/** The watch's own read, without the refreshes it opened, per frame. */
export function watchCost(windows: DecisionWindow[]): { frames: number; usPerFrame: number | null } {
  const frames = windows.reduce((a, w) => a + (w.stats.watch?.frames ?? 0), 0);
  const ms = windows.reduce((a, w) => a + (w.stats.watch?.ms ?? 0), 0);
  return { frames, usPerFrame: frames ? Math.round((1000 * ms) / frames * 100) / 100 : null };
}

export const refreshModel = (windows: DecisionWindow[]): string | null => windows.map(w => w.stats.facts?.refresh).filter(Boolean).at(-1) ?? null;

const spread = (x: Dist) => (x ? `${x.p50} / ${x.p95} / ${x.max}` : "–");

export function formatKinds(rows: KindRow[], label = ""): string {
  const lines = [
    `| decision${label} | n | ready ms p50 / p95 / max | input opens ms | decision → card ms | card after input: ms p50 / p95 / max (n) | card never came | late block ms (decisions, max) |`,
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    lines.push(`| ${r.kind} | ${r.n} | ${spread(r.ready)} | ${spread(r.input)} | ${spread(r.drawn)} | ${spread(r.afterInput)} (${r.lateInput}) | ${r.notDrawn} | ${r.late.ms} (${r.late.n}, ${r.late.max}) |`);
  }
  return lines.join("\n");
}

/** Each side's decisions pooled, kind by kind. */
export function formatKindComparison(before: Decision[], after: Decision[]): string {
  return [formatKinds(byKind(before), " (before)"), "", formatKinds(byKind(after), " (after)")].join("\n");
}
