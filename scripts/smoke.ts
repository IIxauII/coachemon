/**
 * Drive the server over stdio the way Claude Code does, without Claude.
 *
 *   node scripts/smoke.ts status
 *   node scripts/smoke.ts read_menu
 *   node scripts/smoke.ts get_state '{"detail":"party"}'
 *   node scripts/smoke.ts select_option '{"label":"Fight"}'
 *   node scripts/smoke.ts press '{"button":"ACTION"}'
 *   node scripts/smoke.ts start_run '{"species":["Bulbasaur"]}'
 *   node scripts/smoke.ts screenshot            # writes .cache/screenshot.png
 *
 * Several calls can be chained: `node scripts/smoke.ts status read_menu`.
 *
 * With `COACHEMON_DEV=1` the server it spawns talks to the dev hub on 47148 instead of the store hub, which is how a
 * checkout reaches a paired dev build of the extension (§7.2); `COACHEMON_TRANSPORT=hub` is what selects the hub at
 * all (§12.1). Both are passed through to the server, which the MCP SDK does not do by itself.
 *
 * The per-engine smoke checks (§16) are the other mode, and they do not go through the server at all. They dial the
 * same port everything else does — 47147, or 47148 with `COACHEMON_DEV=1` — so a dev build is checked on the dev hub
 * and a store install, which is what §16's Orion premise is about, on the store hub:
 *
 *   COACHEMON_DEV=1 node scripts/smoke.ts --engines       # the connected dev build, 5 min idle, then the report
 *   node scripts/smoke.ts --engines --engine orion        # Orion runs the Chrome or Firefox build, so name it
 *   COACHEMON_DEV=1 node scripts/smoke.ts --engines --idle 30   # a shorter idle, for a check of the check
 *   node scripts/smoke.ts --engines --report              # print the ledger and run nothing
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { allPassed, merge, report, runChecks, type Ledger } from "../src/hub/checks.ts";
import { HubClient } from "../src/hub/client.ts";
import { hubPort } from "../src/hub/link.ts";
import { PLUGIN_VERSION } from "../src/plugin-version.ts";
import { serverEnv } from "../src/server-env.ts";

const argv = process.argv.slice(2);
const flag = (k: string) => argv.includes(k);
const value = (k: string, d: string) => {
  const i = argv.indexOf(k);
  return i > -1 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};

if (flag("--engines")) await engines();
else await tools();

/**
 * The relay and keepalive checks against whichever engine has the one counted tab right now (§16). One engine per run:
 * with more than one tab the hub refuses reads as well as acts. The ledger keeps every engine's latest result, so the
 * report names the ones this machine never reached.
 */
async function engines(): Promise<void> {
  const path = value("--ledger", ".cache/engine-checks.json");
  let ledger: Ledger = {};
  try {
    ledger = JSON.parse(readFileSync(path, "utf8")) as Ledger;
  } catch {
    // No ledger yet, or one we cannot read: this run writes a fresh one.
  }

  if (!flag("--report")) {
    const port = hubPort();
    const client = new HubClient({ port, version: PLUGIN_VERSION });
    const run = await runChecks(
      {
        port,
        state: () => client.state(),
        send: async (name, args) => {
          const a = await client.send(name, args);
          return a.ok ? { ok: true, result: a.result } : { ok: false, code: a.code, message: a.message };
        },
        now: () => Date.now(),
        sleep: ms => new Promise(r => setTimeout(r, ms)),
        say: line => process.stderr.write(`${line}\n`),
      },
      // Unnamed, the engine is the build's own target, which is right for every engine but Orion (§2).
      { engine: value("--engine", "") || undefined, idleMs: Number(value("--idle", "300")) * 1000 },
    );
    client.close();
    if (!run.reached) {
      // Not an engine result: nothing about an engine was learned, so nothing is recorded against one.
      process.stderr.write(`no engine checked: ${run.why}\n`);
    } else {
      ledger = merge(ledger, run.result);
      mkdirSync(path.slice(0, Math.max(0, path.lastIndexOf("/"))) || ".", { recursive: true });
      writeFileSync(path, `${JSON.stringify(ledger, null, 1)}\n`);
    }
  }

  console.log(report(ledger));
  // A failing check is a failing run: this is the ticket's acceptance line, not a report for a human to squint at.
  process.exitCode = allPassed(ledger) ? 0 : 1;
}

async function tools(): Promise<void> {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    let args: Record<string, unknown> = {};
    if (argv[i + 1]?.startsWith("{")) args = JSON.parse(argv[++i]) as Record<string, unknown>;
    calls.push({ name, args });
  }
  if (calls.length === 0) calls.push({ name: "status", args: {} });

  const client = new Client({ name: "smoke", version: "0" });
  const transport = new StdioClientTransport({ command: "node", args: ["src/server.ts"], stderr: "inherit", env: serverEnv() });
  await client.connect(transport);

  for (const { name, args } of calls) {
    const t0 = Date.now();
    const res = await client.callTool({ name, arguments: args }, undefined, {
      timeout: 60_000,
      onprogress: p => process.stderr.write(`  progress: ${p.message ?? p.progress}\n`),
    });
    const ms = Date.now() - t0;
    const content = res.content as { type: string; text?: string; data?: string }[];
    for (const c of content) {
      if (c.type === "text") {
        let v: unknown = c.text;
        try { v = JSON.parse(c.text ?? ""); } catch { /* plain text */ }
        console.log(`--- ${name} ${JSON.stringify(args)} (${ms} ms)${res.isError ? " [error]" : ""}`);
        console.log(JSON.stringify(v, null, 1));
      } else if (c.type === "image" && c.data) {
        mkdirSync(".cache", { recursive: true });
        writeFileSync(".cache/screenshot.png", Buffer.from(c.data, "base64"));
        console.log(`--- ${name} (${ms} ms): wrote .cache/screenshot.png (${c.data.length} b64 chars)`);
      }
    }
  }
  await client.close();
}
