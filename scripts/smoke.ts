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
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const calls: { name: string; args: Record<string, unknown> }[] = [];
for (let i = 0; i < argv.length; i++) {
  const name = argv[i];
  let args: Record<string, unknown> = {};
  if (argv[i + 1]?.startsWith("{")) args = JSON.parse(argv[++i]) as Record<string, unknown>;
  calls.push({ name, args });
}
if (calls.length === 0) calls.push({ name: "status", args: {} });

const client = new Client({ name: "smoke", version: "0" });
const transport = new StdioClientTransport({ command: "node", args: ["src/server.ts"], stderr: "inherit" });
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
