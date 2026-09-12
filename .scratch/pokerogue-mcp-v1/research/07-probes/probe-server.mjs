// Probe MCP stdio server for research ticket #20.
//
// One tool, `sleep({ ms, progress_every_ms })`, that waits `ms` and, if the client sent a
// progressToken, emits notifications/progress every `progress_every_ms`. It deliberately
// does NOT stop when cancelled, so the log shows whether server-side work outlives the
// client's timeout.
//
// Everything is appended as JSON lines to $PROBE_LOG:
//   - every raw line the client writes to our stdin (tap on process.stdin)
//   - handler start (with _meta), each progress sent, abort-signal firing, handler end
//
// Run with the SDK resolved from a scratch install, e.g.
//   NODE_PATH=/tmp/cc7/run/node_modules node probe-server.mjs
// (ESM ignores NODE_PATH, so the imports below use SDK_DIR.)
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SDK_DIR = process.env.SDK_DIR ?? "/tmp/cc7/run/node_modules";
const LOG = process.env.PROBE_LOG ?? "/tmp/cc7/probe.log";
const t0 = Date.now();
const log = (event, data = {}) =>
  appendFileSync(LOG, JSON.stringify({ t: Date.now() - t0, at: new Date().toISOString(), event, ...data }) + "\n");

const imp = (p) => import(pathToFileURL(`${SDK_DIR}/${p}`).href);
const { McpServer } = await imp("@modelcontextprotocol/sdk/dist/esm/server/mcp.js");
const { StdioServerTransport } = await imp("@modelcontextprotocol/sdk/dist/esm/server/stdio.js");
const { z } = await imp("zod/index.js");

process.stdin.on("data", (buf) => {
  for (const line of buf.toString("utf8").split("\n").filter(Boolean)) log("wire_in", { line });
});

const server = new McpServer({ name: "probe", version: "0.0.1" });

server.registerTool(
  "sleep",
  {
    description: "Wait ms milliseconds, optionally sending progress notifications every progress_every_ms (0 = never).",
    inputSchema: { ms: z.number().int().nonnegative(), progress_every_ms: z.number().int().nonnegative().default(0) },
  },
  async ({ ms, progress_every_ms }, extra) => {
    const token = extra._meta?.progressToken;
    log("handler_start", { requestId: extra.requestId, ms, progress_every_ms, meta: extra._meta ?? null });
    extra.signal.addEventListener("abort", () => log("abort_signal", { requestId: extra.requestId, reason: String(extra.signal.reason) }));
    const start = Date.now();
    let n = 0;
    while (Date.now() - start < ms) {
      const step = progress_every_ms > 0 ? Math.min(progress_every_ms, ms - (Date.now() - start)) : ms - (Date.now() - start);
      await new Promise((r) => setTimeout(r, step));
      if (progress_every_ms > 0 && Date.now() - start < ms) {
        n += 1;
        if (token === undefined) {
          log("progress_skipped_no_token", { n });
        } else {
          // sendNotification is a silent no-op once extra.signal has aborted (sdk protocol.js).
          await extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken: token, progress: n, message: `waited ${Date.now() - start}ms` },
          });
          // aborted:true means the SDK swallowed it (nothing went on the wire).
          log("progress_call", { n, aborted: extra.signal.aborted });
        }
      }
    }
    log("handler_end", { requestId: extra.requestId, elapsed: Date.now() - start, aborted: extra.signal.aborted });
    return { content: [{ type: "text", text: `slept ${ms}ms, sent ${n} progress notifications` }] };
  },
);

log("server_boot", {
  pid: process.pid,
  // Can the server see the client's timeout knobs? (only if Claude Code forwards them)
  env: Object.fromEntries(Object.entries(process.env).filter(([k]) => /MCP|CLAUDE/.test(k))),
});
await server.connect(new StdioServerTransport());
