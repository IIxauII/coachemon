/**
 * Plays waves through the MCP surface on the card's act line (`lag-run/policy.ts`) and counts what that costs (#25).
 * `--lag --slot N` is the lag run (lag-run.md §Command): a fresh run on the Orion tab through the store hub, the meter
 * drained after every action. `COACHEMON_TRANSPORT=hub` and `COACHEMON_DEV=1` reach the spawned server
 * (extension-distribution.md §7.2).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { serverEnv } from "../src/server-env.ts";
import { momentsOf } from "./lag-run/moments.ts";
import { lowPowerMode, orion } from "./lag-run/orion.ts";
import { decide, freshMemory, heard, readsCard, refused, type Card, type Menu } from "./lag-run/policy.ts";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const LAG = process.argv.includes("--lag");
const WAVES = Number(arg("--waves", LAG ? "20" : "1"));
const MAX_CALLS = Number(arg("--max-calls", LAG ? "20000" : "200"));
const TEAM = arg("--team", "Larvitar,Machop,Growlithe").split(",");
const SLOT = arg("--slot", "");
const LOG = arg("--log", LAG ? `.cache/lag-run/${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl` : ".cache/autoplay.jsonl");

if (LAG) {
  // The slot is overwritten every run, so it is never guessed.
  if (!/^[0-4]$/.test(SLOT)) { console.error("--lag needs --slot 0-4: a save slot that holds nothing of yours"); process.exit(2); }
  if (lowPowerMode()) { console.error("Low Power Mode is on: it throttles the frames the run measures (docs/lag-run.md)"); process.exit(2); }
  process.env.COACHEMON_TRANSPORT = "hub";
  delete process.env.COACHEMON_DEV;
}
mkdirSync(dirname(LOG), { recursive: true });
const log = (o: unknown) => appendFileSync(LOG, JSON.stringify(o) + "\n");

type Result = Record<string, unknown> & { status?: string; screen?: string; wave?: number | null; error?: string; messages?: string[] };

const client = new Client({ name: "autoplay", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["src/server.ts"], stderr: "inherit", env: serverEnv() }));

let calls = 0;
const t0 = Date.now();
async function call(name: string, args: Record<string, unknown> = {}): Promise<Result> {
  calls++;
  const t = Date.now();
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 90_000 });
  const text = (res.content as { type: string; text?: string }[]).find(c => c.type === "text")?.text ?? "{}";
  const out = JSON.parse(text) as Result;
  log({ kind: "call", t: Date.now() - t0, ms: Date.now() - t, call: name, args, status: out.status ?? out.error, screen: out.screen, wave: out.wave, selected: out.selected, messages: out.messages, text: out.text });
  return out;
}

const tab = LAG ? orion() : null;
let hidden = 0;
function drain() {
  const d = tab!.drain();
  if (!d.stats) throw new Error(`no meter to drain (${d.error ?? `hudActive ${d.hudActive}, meterActive ${d.meterActive}`}): the extension in Orion predates the lag run (#499)`);
  hidden += (d.stats.frames as { hidden?: number } | undefined)?.hidden ?? 0;
  return d.stats;
}

let stop = "";
if (LAG) {
  log({ kind: "run", team: TEAM, slot: Number(SLOT), waves: WAVES, started: new Date().toISOString(), status: await call("status") });
  const seen = tab!.visibility();
  if (seen !== "visible") { console.error(`the pokerogue.net tab is not in the foreground (${seen}): bring its Orion window to the front`); process.exit(2); }
  tab!.reload();
  // The hub loses the tab across the reload; reads fail until the relay is back and the game is on its title screen.
  const until = Date.now() + 180_000;
  let screen = "";
  while (Date.now() < until) {
    await sleep(3000);
    const m = await call("read_menu").catch(() => ({}) as Result);
    screen = String(m.screen ?? m.error ?? "");
    if (screen === "TITLE") break;
  }
  if (screen !== "TITLE") stop = `no-title:${screen}`;
  else {
    const r = await call("start_run", { species: TEAM, slot: Number(SLOT), overwrite: true });
    if (r.error || (r.status !== "ok" && r.status !== "timed_out")) { stop = `start_run:${r.error ?? r.status}`; console.log(JSON.stringify(r, null, 1)); }
    else log({ kind: "window", wave: r.wave ?? null, screen: "TITLE", action: { tool: "start_run" }, moments: [], trainer: false, stats: drain() });
  }
}

const mem = freshMemory();
const by = { card: 0, rule: 0 };
let startWave: number | null = null;
let lastWave: number | null = null;
let trainerWave: number | null = null;
let lastScreen = "";
let repeats = 0;
let waits = 0;
let waveCalls = 0;
const STALL = 1000;
while (!stop && calls < MAX_CALLS) {
  const read = await call("read_menu");
  if (read.error) { stop = `error:${read.error}`; break; }
  // `timed_out` is not fatal: the heal after a boss wave outlasts one call's settle (v1-tool-surface.md §3).
  waits = read.status === "timed_out" ? waits + 1 : 0;
  if (waits > 0 && waits <= 5) continue;
  // A read adds nothing to the detector's ring, so the read after a stuck act is stuck too.
  if (read.status !== "ok" && read.status !== "stuck") { stop = `status:${read.status}`; console.log(JSON.stringify(read, null, 1)); break; }
  const menu = read as unknown as Menu;
  const wave = menu.wave;
  if (wave !== lastWave) waveCalls = calls;
  // A loop the same-screen guard misses alternates screens: a shop, its party screen, back.
  if (calls - waveCalls > STALL) { stop = `stalled:${menu.screen}`; break; }
  lastWave = wave ?? lastWave;
  if (startWave === null && wave !== null) startWave = LAG ? 1 : wave;
  if (startWave !== null && wave !== null && wave >= startWave + WAVES && menu.screen === "COMMAND") { stop = "waves-reached"; break; }
  repeats = menu.screen === lastScreen ? repeats + 1 : 0;
  lastScreen = String(menu.screen);
  if (repeats > 30) { stop = `same-screen:${menu.screen}`; break; }
  const card = readsCard(menu.screen) ? ((await call("read_card")) as unknown as Card) : null;
  const d = decide(menu, card, mem);
  by[d.by]++;
  const r = await call(d.tool, d.args);
  const messages = r.messages ?? [];
  heard(mem, messages);
  if (r.battleType === 1 || messages.some(m => /would like to battle/.test(m))) trainerWave = (r.wave as number | null) ?? wave;
  if (LAG) {
    const trainer = trainerWave !== null && trainerWave === wave;
    log({ kind: "window", wave, screen: menu.screen, action: { tool: d.tool, args: d.args, by: d.by, intent: d.intent ?? null }, messages,
      moments: momentsOf({ intent: d.intent, messages, trainer }), trainer, stats: drain() });
  }
  console.log(`${String(wave).padStart(3)} ${String(menu.screen).padEnd(28)} ${d.by.padEnd(4)} ${d.tool} ${JSON.stringify(d.args).padEnd(30)} → ${r.status ?? r.error} ${r.screen ?? ""} ${messages.length ? JSON.stringify(messages) : ""}`);
  if (r.error) {
    if (r.error === "no_match" || r.error === "ambiguous") { console.log(JSON.stringify(r)); stop = `error:${r.error}`; break; }
    if (r.error === "tab_contended" || r.error === "loop_frozen" || r.error === "settings_mode") { stop = `error:${r.error}`; break; }
    // A pick's cursor move types out the item's description; a panel refresh between the move and the commit lets it
    // advance, and an immediate retry loses the same race until the stuck detector ends the run (#499).
    if (r.error === "game_moved") { refused(mem); await sleep(1500); }
    // A message the game still wants read, such as an item's "won't have any effect".
    if (r.error === "message_pending") await call("press", { button: "ACTION" });
    continue;
  }
  // `stuck` after an act that landed is the detector's advice; the same-screen guard ends a real loop.
  if (r.status !== "ok" && r.status !== "timed_out" && r.status !== "stuck") { stop = `status:${r.status}`; console.log(JSON.stringify(r.diagnostic ?? r, null, 1)); break; }
}
if (!stop) stop = "max-calls";
const summary = { stop, calls, startWave, wave: lastWave, wallMs: Date.now() - t0, by, hidden, log: LOG };
log({ kind: "summary", ...summary });
console.log(JSON.stringify(summary));
await client.close();
