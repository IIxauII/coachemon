// Live divergence poller for #113: the same ⚔-vs-♟ attribution as dump.mjs, read off a real game tab.
// Throwaway research harness (branch research/hud-authority). Read-only: it never presses anything, never touches the
// game's state, and needs the coach HUD already running in the tab (`skills/coach-pokerogue/scripts/read.sh chrome hud`).
//
//   node research/hud-authority/live.mjs sample [--log <file>] [--all]   one command phase → one JSONL line
//   node research/hud-authority/live.mjs watch  [--log <file>] [--all]   poll every 1.5 s, log each new command phase
//   node research/hud-authority/live.mjs report [--log <file>]           tally the log per verdict and bucket
//   node research/hud-authority/live.mjs expr   [--all]                  print the in-page expression only
//
// `sample` is meant for an agent driving the game through the pokerogue MCP tools: call it once whenever the game waits
// for a command (a Fight/Ball/Pokémon/Run menu), before choosing. It waits one HUD tick (the panel refreshes every
// second) so the model it reads was built for this command phase, then logs wave, turn, the slot deciding, the
// agreement verdict and buckets, the ⚔ and ♟ views as drawn, `summary()` and `stats()` (refresh cost). A command phase
// already logged is skipped, so calling it twice is harmless. Wild waves have no ♟ plan and are skipped unless --all.
// `watch` does the same unattended, for a reader running next to a human or an agent.
// Port: POKEROGUE_MCP_PORT (default 9222), like read.sh.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const [cmd = "sample", ...rest] = process.argv.slice(2);
const opt = name => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : null);
const LOG = opt("--log") ?? `${here}live-log.jsonl`;
const ALL = rest.includes("--all");
const PORT = process.env.POKEROGUE_MCP_PORT ?? 9222;

// Runs in the page. Installs `hudAgreement` once, then samples the current command phase.
const pageSample = all => `(async () => {
  if (typeof window.hudAgreement !== "function") { ${readFileSync(`${here}agreement.js`, "utf8")} }
  const game = Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game)?.game;
  const s = game?.scene?.getScene?.("battle");
  const ph = s?.phaseManager?.getCurrentPhase?.();
  if (ph?.phaseName !== "CommandPhase") return { skip: "not a command phase", phase: ph?.phaseName ?? null };
  if (!window.__coachHud) return { error: "coach HUD not running: skills/coach-pokerogue/scripts/read.sh chrome hud" };
  const b = s.currentBattle;
  const key = [b.waveIndex, b.turn, ph.fieldIndex ?? 0].join("|");
  window.__hudAgreeSeen ??= new Set();
  if (window.__hudAgreeSeen.has(key)) return { skip: "already logged", key };
  if (!b.trainer && !${all}) return { skip: "wild wave (no fight plan)", key };
  // One HUD tick after the phase began, so last() was built for it.
  await new Promise(r => setTimeout(r, 1150));
  if (s.phaseManager.getCurrentPhase() !== ph) return { skip: "phase moved on", key };
  const m = window.__coachHud.last();
  if (!m || m.kind !== "battle" || m.wave !== b.waveIndex) return { skip: "HUD model not for this battle yet", key };
  window.__hudAgreeSeen.add(key);
  const a = window.hudAgreement(m);
  return {
    at: new Date().toISOString(), key, wave: b.waveIndex, turn: b.turn, fieldIndex: ph.fieldIndex ?? 0,
    trainer: b.trainer?.getName?.() ?? null, double: !!b.double,
    verdict: a?.verdict ?? null, bucket: a?.bucket ?? null, buckets: a?.buckets ?? [], agreement: a,
    summary: window.__coachHud.summary(), stats: window.__coachHud.stats(),
    field: m.field, teamPlan: m.teamPlan, enemySwitches: m.enemySwitches, ifStay: m.ifStay,
  };
})()`;

const evaluate = async expression => {
  const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const tab = tabs.find(x => x.url.includes("pokerogue.net"));
  if (!tab) return { error: "no pokerogue.net tab on the debug port" };
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  try {
    return await new Promise(resolve => {
      ws.onmessage = msg => {
        const d = JSON.parse(msg.data);
        if (d.id !== 1) return;
        resolve(d.result?.exceptionDetails ? { error: d.result.exceptionDetails.exception?.description ?? "page exception" } : d.result?.result?.value ?? { error: JSON.stringify(d) });
      };
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
    });
  } finally { ws.close(); }
};

const line = r => (r.error ? `error: ${r.error}` : r.skip ? `skip: ${r.skip}${r.key ? ` (${r.key})` : ""}`
  : `W${r.wave} t${r.turn} slot ${r.fieldIndex} ${r.trainer ?? "wild"}: ${r.verdict ?? "n/a"}${r.buckets.length ? ` [${r.buckets.join(",")}]` : ""}`
    + (r.agreement ? ` · ⚔ ${r.agreement.turn.map(t => `${t.switchIn ? "⇄" : ""}${t.mon} ${t.move ?? "—"}→${t.target ?? "·"}`).join(" ; ")} · ♟ ${r.agreement.plan.entry === "switch" ? "⇄" : ""}${r.agreement.plan.mon} ${r.agreement.plan.move ?? "—"}→${r.agreement.plan.target}` : "")
    + ` · tick ${Math.round(r.stats?.lastTickMs ?? 0)} ms (max ${Math.round(r.stats?.maxTickMs ?? 0)})`);

const sample = async () => {
  const r = await evaluate(pageSample(ALL));
  if (!r.error && !r.skip) appendFileSync(LOG, `${JSON.stringify(r)}\n`);
  console.log(line(r));
  return r;
};

if (cmd === "expr") {
  // The in-page expression alone, for a tool that evaluates JS in the tab itself (DevTools evaluate_script).
  console.log(pageSample(ALL));
} else if (cmd === "sample") {
  const r = await sample();
  process.exit(r.error ? 1 : 0);
} else if (cmd === "watch") {
  for (;;) {
    try { const r = await sample(); if (r.skip && r.skip !== "already logged") process.stdout.write(""); } catch (e) { console.log(`error: ${e.message}`); }
    await new Promise(r => setTimeout(r, 1500));
  }
} else if (cmd === "report") {
  if (!existsSync(LOG)) { console.log(`no log at ${LOG}`); process.exit(1); }
  const rows = readFileSync(LOG, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).filter(r => r.agreement);
  const count = (xs, f) => xs.reduce((t, x) => { for (const k of [].concat(f(x))) t[k] = (t[k] ?? 0) + 1; return t; }, {});
  // Slot 1's phase in doubles re-plans around slot 0's locked command; the decision proper is slot 0's.
  const decisions = rows.filter(r => r.fieldIndex === 0);
  console.log(`${rows.length} command phases logged (${decisions.length} slot-0 decisions) across ${new Set(rows.map(r => r.wave)).size} waves`);
  console.log(`verdicts: ${JSON.stringify(count(decisions, r => r.verdict))}`);
  console.log(`primary bucket: ${JSON.stringify(count(decisions.filter(r => r.bucket), r => r.bucket))}`);
  console.log(`any bucket: ${JSON.stringify(count(decisions, r => r.buckets))}`);
  const ticks = rows.map(r => r.stats?.lastTickMs).filter(Number.isFinite).sort((a, b) => a - b);
  if (ticks.length) console.log(`HUD tick at sample: median ${Math.round(ticks[ticks.length >> 1])} ms, max seen ${Math.round(Math.max(...rows.map(r => r.stats?.maxTickMs ?? 0)))} ms`);
  for (const r of decisions.filter(r => r.verdict !== "agree")) console.log(`  ${line(r)} · ${r.agreement.plan.why}`);
} else {
  console.log("usage: live.mjs sample|watch|report [--log <file>] [--all]");
  process.exit(2);
}
