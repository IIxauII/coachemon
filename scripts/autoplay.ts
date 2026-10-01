/**
 * Plays waves through the MCP surface on the card's act line (`lag-run/policy.ts`) and counts what that costs (#25).
 * `--lag --slot N` is the lag run (lag-run.md §Command): a fresh run on the Orion tab through the store hub, the meter
 * drained after every action. `--lag --slot N --resume <log>` takes a lag run that lost its tab back up on the game's
 * saved session: no reload, no new run, appended to that log. `COACHEMON_TRANSPORT=hub` and `COACHEMON_DEV=1` reach the spawned server
 * (extension-distribution.md §7.2).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { serverEnv } from "../src/server-env.ts";
import { momentsOf } from "./lag-run/moments.ts";
import { lowPowerMode, orion, type Refresh } from "./lag-run/orion.ts";
import { decide, freshMemory, heard, readsCard, refused, type Card, type Menu } from "./lag-run/policy.ts";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const LAG = process.argv.includes("--lag");
const WAVES = Number(arg("--waves", LAG ? "50" : "1"));
const MAX_CALLS = Number(arg("--max-calls", LAG ? "60000" : "200"));
// `--team coach` takes the first team the starters card proposes, read off the grid before the run starts (#508).
const COACH = arg("--team", "") === "coach";
let TEAM = COACH ? [] : arg("--team", "Larvitar,Machop,Growlithe").split(",");
const SLOT = arg("--slot", "");
const RESUME = arg("--resume", "");
// `--reroll` rerolls once a shop so the shop card's draw after a reroll is measured (#516); a comparison leaves it off.
const REROLL = process.argv.includes("--reroll");
const LOG = RESUME || arg("--log", LAG ? `.cache/lag-run/${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl` : ".cache/autoplay.jsonl");
// `--refresh clock|watch` plays on this checkout's overlay, injected after the reload, in place of the extension's (#519).
const REFRESH = arg("--refresh", "") as Refresh | "";

if (LAG) {
  // The slot is overwritten every run, so it is never guessed.
  if (!/^[0-4]$/.test(SLOT)) { console.error("--lag needs --slot 0-4: a save slot that holds nothing of yours"); process.exit(2); }
  if (REFRESH && REFRESH !== "clock" && REFRESH !== "watch") { console.error("--refresh is clock or watch"); process.exit(2); }
  if (RESUME && !existsSync(RESUME)) { console.error(`--resume ${RESUME}: no such log`); process.exit(2); }
  if (lowPowerMode()) { console.error("Low Power Mode is on: it throttles the frames the run measures (docs/lag-run.md)"); process.exit(2); }
  process.env.COACHEMON_TRANSPORT = "hub";
  delete process.env.COACHEMON_DEV;
}
mkdirSync(dirname(LOG), { recursive: true });
const log = (o: unknown) => appendFileSync(LOG, JSON.stringify(o) + "\n");

type Result = Record<string, unknown> & { status?: string; screen?: string; wave?: number | null; error?: string; messages?: string[] };

const client = new Client({ name: "autoplay", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["src/server.ts"], stderr: "inherit", env: serverEnv() }));

// A resumed run carries on the first part's calls and time, so the summary covers the whole run.
const prior = RESUME ? readFileSync(RESUME, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l) as { kind?: string; t?: number })
  .reduce((p, o) => (o.kind === "call" ? { calls: p.calls + 1, ms: Math.max(p.ms, o.t ?? 0) } : p), { calls: 0, ms: 0 }) : { calls: 0, ms: 0 };
let calls = prior.calls;
const t0 = Date.now() - prior.ms;
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
let facts: { lang?: string | null; sprites?: unknown[] } = {};
function drain() {
  const d = tab!.drain();
  if (d.error) throw new Error(`no meter to drain: ${d.error}`);
  if (!d.stats) throw new Error(`no meter to drain (hudActive ${d.hudActive}, meterActive ${d.meterActive}): the extension in Orion predates the lag run (#499)`);
  hidden += (d.stats.frames as { hidden?: number } | undefined)?.hidden ?? 0;
  facts = (d.stats.facts as typeof facts | undefined) ?? facts;
  return d.stats;
}

let stop = "";

function inject(): boolean {
  if (!REFRESH) return true;
  const r = tab!.inject(REFRESH);
  const on = (drain().facts as { refresh?: string } | undefined)?.refresh;
  if (r.hud !== "on" || on !== REFRESH) { stop = `inject:${r.error ?? r.hud ?? "?"}:${on ?? "no model"}`; return false; }
  log({ kind: "inject", refresh: REFRESH });
  return true;
}

/** From TITLE: New Game, Classic, the starters card's first team, then back out to TITLE for `start_run`. */
async function coachTeam(): Promise<boolean> {
  const title = await call("read_menu");
  const n = ((title.options as unknown[] | undefined) ?? []).length;
  // New Game is the first title option unless Continue is offered (game-code.md §26).
  const mode = await call("select_option", { index: n >= 5 ? 1 : 0 });
  const grid = mode.screen === "OPTION_SELECT" ? await call("select_option", { index: 0 }) : mode;
  if (grid.screen !== "STARTER_SELECT") { stop = `coach-team:${grid.screen ?? grid.error}`; return false; }
  let summary: string | null = null;
  for (let i = 0; i < 15 && !summary; i++) {
    const c = (await call("read_card")) as unknown as Card;
    summary = c?.kind === "starters" ? c.groups?.find(g => g.id === "act")?.summary ?? null : null;
    if (!summary) await sleep(1000);
  }
  await call("press", { button: "CANCEL" });
  await call("select_option", { label: "Yes" });
  for (let i = 0; i < 20 && String((await call("read_menu")).screen) !== "TITLE"; i++) await sleep(1000);
  // `best: Larvitar (carry) + Machop + Growlithe · 10/10 pts · weak Water; trio: …`
  const first = summary?.split("; ")[0] ?? "";
  TEAM = first.slice(first.indexOf(": ") + 2).split(" · ")[0].split(" + ").map(x => x.replace(/ \(carry\)$/, "").trim()).filter(Boolean);
  log({ kind: "team", by: "coach", team: TEAM, summary });
  console.log(`coach team: ${TEAM.join(", ")} (${summary})`);
  drain();
  if (!TEAM.length) stop = "coach-team:no-card";
  return TEAM.length > 0;
}

if (LAG && RESUME) {
  const seen = tab!.visibility();
  if (seen !== "visible") { console.error(`the pokerogue.net tab is not in the foreground (${seen}): bring its Orion window to the front`); process.exit(2); }
  const audio = tab!.audio();
  if (audio.state !== "running") { console.error(`the tab's audio is not running (${JSON.stringify(audio)}): click in the game once, or allow auto-play for pokerogue.net`); process.exit(2); }
  const s = await call("status");
  log({ kind: "resume", at: new Date().toISOString(), priorCalls: prior.calls, priorMs: prior.ms, status: s });
  if (REFRESH) inject(); else drain();
} else if (LAG) {
  log({ kind: "run", team: COACH ? null : TEAM, slot: Number(SLOT), waves: WAVES, refresh: REFRESH || null, started: new Date().toISOString(), status: await call("status") });
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
  const audio = screen === "TITLE" ? tab!.audio() : null;
  if (screen !== "TITLE") stop = `no-title:${screen}`;
  else if (audio?.error || audio?.state == null) stop = `audio-probe:${audio?.error ?? "no context"}`;
  else if (audio.state !== "running") {
    stop = "audio-locked";
    console.error(`the tab's audio is locked (${JSON.stringify(audio)}): the heal after wave 10 would wait on it forever. Allow auto-play for pokerogue.net in Orion (docs/lag-run.md)`);
  } else if (!inject() || (COACH && !(await coachTeam()))) {
    stop ||= "coach-team";
  } else {
    const r = await call("start_run", { species: TEAM, slot: Number(SLOT), overwrite: true });
    if (r.error || (r.status !== "ok" && r.status !== "timed_out")) { stop = `start_run:${r.error ?? r.status}`; console.log(JSON.stringify(r, null, 1)); }
    else log({ kind: "window", wave: r.wave ?? null, screen: "TITLE", action: { tool: "start_run" }, moments: [], trainer: false, stats: drain() });
  }
}

const mem = freshMemory(REROLL);
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
  if (wave !== lastWave) {
    waveCalls = calls;
    if (LAG && wave !== null) {
      type Mon = { species?: string | null; level?: number | null; boss?: boolean | null } | null;
      const g = await call("get_state", { detail: "full" });
      mem.party = ((g.party as Mon[] | null) ?? []).filter(m => m?.species).length || null;
      log({ kind: "wave", wave, battleType: g.battleType ?? null, double: g.double ?? null, trainer: g.trainer ?? null,
        boss: ((g.enemy as Mon[] | null) ?? []).some(m => m?.boss === true),
        levels: Object.fromEntries(((g.party as Mon[] | null) ?? []).flatMap(m => (m?.species && m.level ? [[m.species, m.level]] : []))) });
    }
  }
  // A loop the same-screen guard misses alternates screens: a shop, its party screen, back.
  if (calls - waveCalls > STALL) { stop = `stalled:${menu.screen}`; break; }
  lastWave = wave ?? lastWave;
  if (startWave === null && wave !== null) startWave = LAG ? 1 : wave;
  if (startWave !== null && wave !== null && wave >= startWave + WAVES && menu.screen === "COMMAND") { stop = "waves-reached"; break; }
  repeats = menu.screen === lastScreen ? repeats + 1 : 0;
  lastScreen = String(menu.screen);
  if (repeats > 30) { stop = `same-screen:${menu.screen}`; break; }
  const card = readsCard(menu.screen) ? ((await call("read_card")) as unknown as Card) : null;
  const lead = mem.swapLead;
  const d = decide(menu, card, mem);
  const retry = mem.swapLead !== null && mem.swapLead !== lead;
  by[d.by]++;
  const r = await call(d.tool, d.args);
  const messages = r.messages ?? [];
  heard(mem, messages);
  if (r.battleType === 1 || messages.some(m => /would like to battle/.test(m))) trainerWave = (r.wave as number | null) ?? wave;
  if (LAG) {
    const trainer = trainerWave !== null && trainerWave === wave;
    log({ kind: "window", wave, screen: menu.screen, action: { tool: d.tool, args: d.args, by: d.by, intent: d.intent ?? null }, messages, retry,
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
const summary = { stop, calls, ...(RESUME ? { resumed: prior } : {}), startWave, wave: lastWave, wallMs: Date.now() - t0, by, hidden, lang: facts.lang, sprites: facts.sprites, log: LOG };
log({ kind: "summary", ...summary });
console.log(JSON.stringify(summary));
await client.close();
