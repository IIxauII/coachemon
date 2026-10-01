/**
 * The lag run cut per wave (#508): the five numbers every fix ticket reports before and after (#486), what the wave
 * was, and what happened in it.
 */
import { BattleType } from "../../src/enums/generated.ts";
import { decisionsOf, type Decision } from "./decisions.ts";
import { dist, GAP_MS, type Dist } from "./report.ts";

const OVERLAY_MADE_MS = 34;
const RECOMPUTE_MS = 5;
/** The phases where the game waits on the player; a recompute anywhere else lands inside an animation. */
const PROMPTS = new Set([
  "CommandPhase", "CheckSwitchPhase", "SelectTargetPhase", "SelectModifierPhase", "LearnMovePhase", "SwitchPhase", "SelectBiomePhase",
  "SelectStarterPhase", "TitlePhase", "MysteryEncounterPhase",
]);

type Tick = { seq: number; at: number; ms: number; kind: string | null; wave?: number | null; phase?: string | null; drew?: boolean; stages?: Record<string, number> };
type Gap = { at: number; gap: number; panel: number; driver?: number; ticks: number[]; wave?: number | null };
type Facts = { lang?: string | null; sprites?: { id: string; misses: number; found: boolean }[]; refresh?: string | null };
export type WaveWindow = {
  wave: number | null; action?: { intent?: string | null }; messages?: string[]; retry?: boolean;
  stats: { ticks: Tick[]; gaps: Gap[]; facts?: Facts; decisions?: Decision[] };
};
/** The driver's `get_state` at the wave's first read. */
export type WaveRecord = {
  wave: number; battleType: number | null; double: boolean | null; trainer: string | null; boss: boolean; levels?: Record<string, number>;
};

export type WaveRow = {
  wave: number;
  kind: string;
  trainer: string | null;
  events: string[];
  turnCardMs: number[];
  recomputeMs: number[];
  inAnimation: number;
  shopCard: number | null;
  hitches: { n: number; overlayMs: number };
  hitchMs: number;
  overlayMs: number;
  cardMs: number[];
  notDrawn: number;
  lateMs: number;
};

/** A trainer's intro says its class, which `get_state`'s bare name does not. */
const intro = (messages: string[]) => messages.map(m => /^([^]+?)\s+would like to battle!/.exec(m)?.[1]).find(Boolean)?.replace(/\s+/g, " ") ?? null;

const EVIL_BOSS = /^(Team \w+ Boss|Aether President|Macro Cosmos President|Team Star Leader)\b/;
const EVIL_TEAM = /^(Team |Macro Cosmos\b|Aether Foundation\b)|\bGrunts?\b/;

export function waveKind(rec: WaveRecord | undefined, introduced: string | null): string {
  if (!rec) return "?";
  const n = rec.double ? "double" : "single";
  if (rec.battleType === BattleType.MYSTERY_ENCOUNTER) return "mystery encounter";
  if (rec.battleType === BattleType.TRAINER) {
    const title = introduced ?? rec.trainer ?? "";
    // `Team Star Leader` is an evil team's boss, so the evil-team tests go ahead of the gym leader's `Leader`.
    const cls = /^Rival\b/.test(title) ? "rival" : /^Elite Four\b/.test(title) ? "elite four" : /^Champion\b/.test(title) ? "champion"
      : EVIL_BOSS.test(title) ? "evil team boss" : EVIL_TEAM.test(title) ? "evil team" : /\bLeader\b/.test(title) ? "gym leader" : "trainer";
    return `${cls} ${n}`;
  }
  if (rec.battleType === BattleType.WILD) return `wild ${rec.boss ? "boss" : n}`;
  return `battleType ${rec.battleType}`;
}

/** The game's level-up message is never among an act's messages, so a wave's level-ups are the party's gain by the next. */
const levelUps = (from: WaveRecord | undefined, to: WaveRecord | undefined) =>
  Object.entries(from?.levels ?? {}).reduce((n, [mon, lv]) => n + Math.max(0, (to?.levels?.[mon] ?? lv) - lv), 0);

function eventsOf(windows: WaveWindow[], levels: number): string[] {
  const all = windows.flatMap(w => w.messages ?? []);
  const said = (re: RegExp) => all.filter(m => re.test(m)).length;
  const did = (intent: string) => windows.filter(w => w.action?.intent === intent).length;
  const out: [string, number][] = [
    ["level-up", levels],
    ["move learnt", said(/learned/i)],
    ["our faint", said(/fainted!/) - said(/^(Wild|Foe) [^]*fainted!/)],
    ["our switch", did("switch")],
    ["foe switch", said(/withdrew/i)],
    ["catch", said(/was caught/i)],
    ["shop pick", did("shop")],
    ["reroll", did("reroll")],
    ["retry", windows.filter(w => w.retry).length],
  ];
  return out.filter(([, n]) => n > 0).map(([e, n]) => (n > 1 ? `${e} ×${n}` : e));
}

/** A tick's wave is its own; a gap's is that of the refresh it held, else of the refresh before it. */
function byWave(windows: WaveWindow[]) {
  const ticks = new Map<number, Tick[]>(), gaps = new Map<number, Gap[]>(), acts = new Map<number, WaveWindow[]>();
  const push = <T>(m: Map<number, T[]>, k: number | null | undefined, x: T) => { if (k != null) (m.get(k) ?? m.set(k, []).get(k)!).push(x); };
  for (const w of windows) {
    push(acts, w.wave, w);
    for (const t of w.stats.ticks) push(ticks, t.wave ?? w.wave, t);
    for (const g of w.stats.gaps) {
      if (g.ticks.length && "wave" in g) { push(gaps, g.wave ?? w.wave, g); continue; }
      const own = w.stats.ticks.find(t => g.ticks.includes(t.seq)) ?? w.stats.ticks.filter(t => t.at <= g.at).at(-1);
      push(gaps, own ? own.wave ?? w.wave : w.wave, g);
    }
  }
  return { ticks, gaps, acts };
}

/** Waves 1 up to the last one the run finished: a run that stopped short leaves out the wave it stopped on. */
export function perWave(windows: WaveWindow[], records: WaveRecord[], upTo: number, reached: boolean): WaveRow[] {
  const { ticks, gaps, acts } = byWave(windows);
  const decisions = decisionsOf(windows);
  const last = reached ? upTo : Math.min(upTo, Math.max(0, ...windows.map(w => w.wave ?? 0)) - 1);
  const rows: WaveRow[] = [];
  for (let wave = 1; wave <= last; wave++) {
    const ts = ticks.get(wave) ?? [];
    const hitches = (gaps.get(wave) ?? []).filter(g => g.gap >= GAP_MS);
    const made = hitches.filter(g => g.panel >= OVERLAY_MADE_MS);
    const recomputes = ts.filter(t => (t.stages?.road ?? 0) >= RECOMPUTE_MS);
    const acted = acts.get(wave) ?? [];
    const rec = records.find(r => r.wave === wave);
    const introduced = intro(acted.flatMap(w => w.messages ?? []));
    rows.push({
      wave,
      kind: waveKind(rec, introduced),
      trainer: rec?.battleType === BattleType.TRAINER ? introduced ?? rec.trainer : null,
      events: eventsOf(acted, levelUps(rec, records.find(r => r.wave === wave + 1))),
      turnCardMs: ts.filter(t => t.phase === "CommandPhase" && t.kind === "battle" && t.drew).map(t => t.ms),
      recomputeMs: recomputes.map(t => t.stages!.road),
      inAnimation: recomputes.filter(t => t.phase && !PROMPTS.has(t.phase)).length,
      shopCard: ts.find(t => t.kind === "rewards" && t.drew)?.ms ?? null,
      hitches: { n: made.length, overlayMs: Math.round(made.reduce((a, g) => a + g.panel, 0)) },
      hitchMs: hitches.reduce((a, g) => a + g.gap, 0),
      overlayMs: hitches.reduce((a, g) => a + g.panel, 0),
      ...decisionCells(decisions.filter(d => d.wave === wave)),
    });
  }
  return rows;
}

function decisionCells(ds: Decision[]) {
  return {
    cardMs: ds.flatMap(d => (d.drawn === null ? [] : [d.drawn])),
    notDrawn: ds.filter(d => d.drawn === null).length,
    lateMs: Math.round(ds.reduce((a, d) => a + d.late, 0)),
  };
}

/** The meter's facts are the overlay's since the page loaded, so the last drain has them all. */
export function gameFacts(windows: WaveWindow[]): { lang: string | null; sprites: NonNullable<Facts["sprites"]> | null } {
  const f = windows.map(w => w.stats.facts).filter(Boolean).at(-1);
  return { lang: f?.lang ?? null, sprites: f && "sprites" in f ? f.sprites ?? [] : null };
}

const share = (overlay: number, all: number) => (all ? `${Math.round((100 * overlay) / all)}%` : "–");
const spread = (x: Dist) => (x ? `${x.p95} / ${x.max}` : "–");

export function formatFacts(f: ReturnType<typeof gameFacts>): string {
  const sprites = f.sprites === null ? "not in this build" : f.sprites.length
    ? f.sprites.map(s => `${s.id} ×${s.misses}${s.found ? " (found later)" : ""}`).join(", ") : "none";
  return `language **${f.lang ?? (f.sprites === null ? "not in this build" : "unset (English)")}**, missed sprites: ${sprites}`;
}

/** One run's rows, or several runs' rows for the same wave pooled. */
function cells(rs: WaveRow[]) {
  const all = <T>(f: (r: WaveRow) => T[]) => rs.flatMap(f);
  const sum = (f: (r: WaveRow) => number) => rs.reduce((a, r) => a + f(r), 0);
  const turns = dist(all(r => r.turnCardMs));
  const shops = all(r => (r.shopCard === null ? [] : [r.shopCard]));
  return {
    turn: `${spread(turns)}${turns ? ` (${turns.n})` : ""}`,
    preview: `${sum(r => r.recomputeMs.length)} (${sum(r => r.inAnimation)})`,
    road: spread(dist(all(r => r.recomputeMs))),
    shop: shops.length ? String(Math.max(...shops)) : "–",
    hitches: `${sum(r => r.hitches.n)} (${sum(r => r.hitches.overlayMs)})`,
    share: share(sum(r => r.overlayMs), sum(r => r.hitchMs)),
    card: (() => { const c = dist(all(r => r.cardMs)); const missed = sum(r => r.notDrawn); return `${spread(c)}${c ? ` (${c.n}${missed ? `, ${missed} never` : ""})` : missed ? `– (${missed} never)` : ""}`; })(),
    late: String(sum(r => r.lateMs)),
  };
}
type Cells = ReturnType<typeof cells>;
const COLUMNS: [keyof Cells, string][] = [
  ["turn", "turn card ms p95 / max (n)"], ["preview", "preview recomputes (in animation)"], ["road", "recompute ms p95 / max"],
  ["shop", "shop card ms"], ["hitches", "overlay-made hitches (overlay ms)"], ["share", "overlay share of hitch time"],
  ["card", "decision → card ms p95 / max (n)"], ["late", "late block ms"],
];

export function formatWaves(rows: WaveRow[]): string {
  const lines = [
    `| wave | kind | what happened | ${COLUMNS.map(([, h]) => h).join(" | ")} |`,
    `|---|---|---|${COLUMNS.map(() => "---|").join("")}`,
  ];
  const row = (label: string, kind: string, events: string, c: Cells) => `| ${label} | ${kind} | ${events} | ${COLUMNS.map(([k]) => c[k]).join(" | ")} |`;
  for (const r of rows) lines.push(row(String(r.wave), `${r.kind}${r.trainer ? ` (${r.trainer})` : ""}`, r.events.join(", ") || "–", cells([r])));
  lines.push(row("all", "", "", cells(rows)));
  return lines.join("\n");
}

/** Each side pools, wave by wave, the runs that finished that wave. */
export function formatWaveComparison(before: WaveRow[][], after: WaveRow[][]): string {
  const at = (runs: WaveRow[][], wave: number) => runs.map(rs => rs.find(r => r.wave === wave)).filter((r): r is WaveRow => !!r);
  const last = Math.max(0, ...[...before, ...after].flat().map(r => r.wave));
  const lines = [
    `| wave | kind | runs | ${COLUMNS.map(([, h]) => h).join(" | ")} |`,
    `|---|---|---|${COLUMNS.map(() => "---|").join("")}`,
  ];
  for (let wave = 1; wave <= last; wave++) {
    const b = at(before, wave), a = at(after, wave);
    const kinds = [...new Set([...b, ...a].map(r => r.kind))].join(" / ");
    if (!b.length || !a.length) { lines.push(`| ${wave} | ${kinds} | ${b.length} → ${a.length} | not met |${COLUMNS.slice(1).map(() => " |").join("")}`); continue; }
    const x = cells(b), y = cells(a);
    lines.push(`| ${wave} | ${kinds} | ${b.length} → ${a.length} | ${COLUMNS.map(([k]) => `${x[k]} → ${y[k]}`).join(" | ")} |`);
  }
  return lines.join("\n");
}
