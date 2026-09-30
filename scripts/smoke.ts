/**
 * Drives the server over stdio the way Claude Code does, without Claude. Tool calls chain, each taking an optional
 * JSON argument:
 *
 *   node scripts/smoke.ts status get_state '{"detail":"party"}' screenshot   # the shot lands in .cache/screenshot.png
 *
 * `--engines` runs the per-engine checks instead, straight at the hub rather than through the server
 * (extension-distribution.md §16):
 *
 *   node scripts/smoke.ts --engines [--engine orion] [--idle <seconds>] [--report]
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

/** One engine per run, whichever holds the one counted tab: with more than one tab the hub refuses reads as well as acts. */
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
      // Unnamed, the engine is the build's own target, which is right for every engine but Orion
      // (extension-distribution.md §2).
      { engine: value("--engine", "") || undefined, idleMs: Number(value("--idle", "300")) * 1000 },
    );
    client.close();
    if (!run.reached) {
      process.stderr.write(`no engine checked: ${run.why}\n`);
    } else {
      ledger = merge(ledger, run.result);
      mkdirSync(path.slice(0, Math.max(0, path.lastIndexOf("/"))) || ".", { recursive: true });
      writeFileSync(path, `${JSON.stringify(ledger, null, 1)}\n`);
    }
  }

  console.log(report(ledger));
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
