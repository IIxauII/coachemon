/**
 * Summarise a soak (#25): the server's per-call log plus, optionally, the
 * `claude -p --output-format json` result for tokens and cost.
 *
 *   node scripts/soak-report.ts <calls.jsonl> [claude-output.json]
 */
import { readFileSync } from "node:fs";

type Line = { t: number; tool: string; args: unknown; ms: number; status?: string; screen?: string; wave?: number | null; selected?: string };

const lines: Line[] = readFileSync(process.argv[2], "utf8")
  .split("\n")
  .filter(Boolean)
  .map(l => JSON.parse(l) as Line);

const acting = new Set(["select_option", "press", "start_run"]);
const byWave = new Map<string, { calls: number; acting: number; ms: number; first: number; last: number; statuses: Map<string, number> }>();
const screens = new Map<string, number>();
const errors = new Map<string, number>();
const tools = new Map<string, number>();
let nonOk = 0;
for (const l of lines) {
  const w = l.wave === null || l.wave === undefined ? "-" : String(l.wave);
  const e = byWave.get(w) ?? { calls: 0, acting: 0, ms: 0, first: l.t, last: l.t, statuses: new Map() };
  e.calls++;
  if (acting.has(l.tool)) e.acting++;
  e.ms += l.ms;
  e.last = l.t;
  e.statuses.set(l.status ?? "?", (e.statuses.get(l.status ?? "?") ?? 0) + 1);
  byWave.set(w, e);
  tools.set(l.tool, (tools.get(l.tool) ?? 0) + 1);
  if (l.screen) screens.set(l.screen, (screens.get(l.screen) ?? 0) + 1);
  if (l.status && !["ok", "timed_out", "stuck", "run_over", "run_interrupted"].includes(l.status)) errors.set(l.status, (errors.get(l.status) ?? 0) + 1);
  if (l.status && l.status !== "ok") nonOk++;
}

const wall = (lines.at(-1)?.t ?? 0) / 1000;
console.log(`calls ${lines.length} over ${wall.toFixed(0)} s; tools: ${[...tools].map(([k, v]) => `${k}=${v}`).join(" ")}`);
console.log("wave  calls acting  serverMs  wallS  statuses");
for (const [w, e] of [...byWave].sort((a, b) => (a[0] === "-" ? -1 : b[0] === "-" ? 1 : Number(a[0]) - Number(b[0])))) {
  const st = [...e.statuses].filter(([k]) => k !== "ok").map(([k, v]) => `${k}×${v}`).join(",");
  console.log(`${w.padStart(4)}  ${String(e.calls).padStart(5)} ${String(e.acting).padStart(6)}  ${String(e.ms).padStart(8)}  ${((e.last - e.first) / 1000).toFixed(0).padStart(5)}  ${st}`);
}
console.log(`screens: ${[...screens].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(" ")}`);
console.log(`non-ok results: ${nonOk}; refusals/errors: ${[...errors].map(([k, v]) => `${k}×${v}`).join(" ") || "none"}`);

if (process.argv[3]) {
  const out = JSON.parse(readFileSync(process.argv[3], "utf8")) as {
    num_turns?: number;
    duration_ms?: number;
    total_cost_usd?: number;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    modelUsage?: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; costUSD: number }>;
    result?: string;
    subtype?: string;
  };
  const u = out.usage ?? {};
  const waves = [...byWave.keys()].filter(k => k !== "-").length;
  console.log(`\nclaude: ${out.subtype ?? "?"} after ${out.num_turns ?? "?"} turns, ${((out.duration_ms ?? 0) / 1000).toFixed(0)} s, $${(out.total_cost_usd ?? 0).toFixed(3)}`);
  console.log(`tokens: in ${u.input_tokens ?? 0} + cache-read ${u.cache_read_input_tokens ?? 0} + cache-write ${u.cache_creation_input_tokens ?? 0}, out ${u.output_tokens ?? 0}`);
  if (waves > 0) {
    const total = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    console.log(`per wave (${waves} waves): ${Math.round(total / waves)} input-side tokens, ${Math.round((u.output_tokens ?? 0) / waves)} output, $${((out.total_cost_usd ?? 0) / waves).toFixed(3)}`);
  }
  for (const [m, mu] of Object.entries(out.modelUsage ?? {})) console.log(`  ${m}: in ${mu.inputTokens} cacheRead ${mu.cacheReadInputTokens} cacheWrite ${mu.cacheCreationInputTokens} out ${mu.outputTokens} $${mu.costUSD.toFixed(3)}`);
  if (out.result) console.log(`\n--- Claude's report ---\n${out.result}`);
}
