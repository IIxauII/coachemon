/**
 * A dumb policy over the MCP surface, for soak and cost measurement (#25):
 * fight with the strongest move, take the first reward, never switch, decline
 * confirms. Not strategy — it exists to drive waves through the server and
 * count what that costs. Stops on any non-ok status, a refusal it cannot
 * route around, or the wave target.
 *
 *   node scripts/autoplay.ts --waves 2 [--max-calls 200] [--log .cache/autoplay.jsonl]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { normalizeLabel } from "../src/labels.ts";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const WAVES = Number(arg("--waves", "1"));
const MAX_CALLS = Number(arg("--max-calls", "200"));
const LOG = arg("--log", ".cache/autoplay.jsonl");
mkdirSync(".cache", { recursive: true });
const log = (o: unknown) => appendFileSync(LOG, JSON.stringify(o) + "\n");

type Result = Record<string, unknown> & { status?: string; screen?: string; wave?: number | null; error?: string };
type Opt = { i: number | string; label: string | null; [k: string]: unknown };

const client = new Client({ name: "autoplay", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["src/server.ts"], stderr: "inherit" }));

let calls = 0;
const t0 = Date.now();
async function call(name: string, args: Record<string, unknown> = {}): Promise<Result> {
  calls++;
  const t = Date.now();
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 90_000 });
  const text = (res.content as { type: string; text?: string }[]).find(c => c.type === "text")?.text ?? "{}";
  const out = JSON.parse(text) as Result;
  log({ t: Date.now() - t0, ms: Date.now() - t, call: name, args, status: out.status ?? out.error, screen: out.screen, wave: out.wave, selected: out.selected, messages: out.messages });
  return out;
}

function decide(menu: Result): { tool: "select_option" | "press"; args: Record<string, unknown> } {
  const screen = String(menu.screen);
  const options = (menu.options as Opt[]) ?? [];
  const labels = options.map(o => o.label ?? "");
  const has = (re: RegExp) => labels.find(l => re.test(normalizeLabel(l)));
  const first = labels.find(l => l !== "") ?? "";
  const extra = (menu.extra as Record<string, unknown>) ?? {};

  if (screen.startsWith("PARTY/POST_BATTLE_SWITCH") || screen.startsWith("PARTY/SWITCH")) return { tool: "select_option", args: { label: "Cancel" } };
  if (screen === "COMMAND") return { tool: "select_option", args: { label: has(/^fight/) ?? first } };
  if (screen === "FIGHT") {
    const moves = (extra.moves as ({ pp: number; power: number } | null)[]) ?? [];
    let best = -1, pick = -1;
    labels.forEach((l, i) => { const m = moves[i]; if (!l || l === "-" || !m || m.pp <= 0) return; if (m.power > best) { best = m.power; pick = i; } });
    return { tool: "select_option", args: { label: pick >= 0 ? labels[pick] : first } };
  }
  if (screen === "TARGET_SELECT") return { tool: "select_option", args: { label: first } };
  if (screen === "MODIFIER_SELECT") {
    const reward = options.find(o => o.kind === "reward");
    if (reward) return { tool: "select_option", args: { label: reward.label } };
    const cont = options.find(o => o.kind === "buttons" && o.col === 4);
    return cont ? { tool: "select_option", args: { label: cont.label } } : { tool: "press", args: { button: "CANCEL" } };
  }
  if (screen.startsWith("PARTY/") && screen.endsWith(":options")) {
    // The verb that does the thing, or back out: Summary is a viewer and the rest are cosmetic.
    return { tool: "select_option", args: { label: has(/^(send out|apply|use|teach|switch|revive|select|pass baton)/) ?? "Cancel" } };
  }
  if (screen.startsWith("PARTY/")) {
    // Switch screens need a benched mon (the one on the field has no Send Out in a double battle);
    // item screens take any standing mon. Cancelling a must-answer party screen is #6's loop.
    const needBenched = /^PARTY\/(FAINT_SWITCH|SWITCH|POST_BATTLE_SWITCH)/.test(screen);
    const mon = options.find(o => o.fainted === false && (!needBenched || o.active !== true) && o.synthetic !== true);
    if (mon) return { tool: "select_option", args: { label: mon.label } };
    return { tool: "select_option", args: { label: "Cancel" } };
  }
  if (screen === "CONFIRM") return { tool: "select_option", args: { label: has(/^no/) ?? first } };
  if (screen === "OPTION_SELECT" || screen === "MENU_OPTION_SELECT") return { tool: "select_option", args: { label: first } };
  if (screen === "SUMMARY" || screen.startsWith("SUMMARY/")) return { tool: "press", args: { button: "CANCEL" } };
  return { tool: "press", args: { button: "ACTION" } };
}

let startWave: number | null = null;
let stop = "";
let lastScreen = "";
let repeats = 0;
while (calls < MAX_CALLS) {
  const menu = await call("read_menu");
  if (menu.error) { stop = `error:${menu.error}`; break; }
  if (menu.status !== "ok") { stop = `status:${menu.status}`; console.log(JSON.stringify(menu, null, 1)); break; }
  const wave = menu.wave as number | null;
  if (startWave === null && wave !== null) startWave = wave;
  if (startWave !== null && wave !== null && wave >= startWave + WAVES && menu.screen === "COMMAND") { stop = "waves-reached"; break; }
  repeats = menu.screen === lastScreen ? repeats + 1 : 0;
  lastScreen = String(menu.screen);
  if (repeats > 30) { stop = `same-screen:${menu.screen}`; break; }
  const d = decide(menu);
  const r = await call(d.tool, d.args);
  console.log(`${String(menu.wave).padStart(3)} ${String(menu.screen).padEnd(28)} ${d.tool} ${JSON.stringify(d.args).padEnd(30)} → ${r.status ?? r.error} ${r.screen ?? ""} ${(r.messages as string[] | undefined)?.length ? JSON.stringify(r.messages) : ""}`);
  if (r.error) {
    if (r.error === "no_match" || r.error === "ambiguous") { console.log(JSON.stringify(r)); stop = `error:${r.error}`; break; }
    if (r.error === "tab_contended" || r.error === "loop_frozen" || r.error === "settings_mode") { stop = `error:${r.error}`; break; }
    continue;
  }
  if (r.status !== "ok" && r.status !== "timed_out") { stop = `status:${r.status}`; console.log(JSON.stringify(r.diagnostic ?? r, null, 1)); break; }
}
if (!stop) stop = "max-calls";
const summary = { stop, calls, startWave, wallMs: Date.now() - t0 };
log({ kind: "summary", ...summary });
console.log(JSON.stringify(summary));
await client.close();
