/**
 * pokerogue-mcp: the MCP server. Seven tools (#7), stdio transport. Attachment
 * is lazy, on first use; there is no connect/disconnect tool.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { appendFileSync } from "node:fs";
import { z } from "zod";
import { Button } from "./enums/generated.ts";
import { Refusal } from "./envelope.ts";
import { Driver, type CallContext } from "./driver.ts";
import { CALL_BUDGET_MS } from "./settle.ts";

type Extra = {
  signal: AbortSignal;
  _meta?: { progressToken?: string | number };
  sendNotification: (n: { method: "notifications/progress"; params: { progressToken: string | number; progress: number; message?: string } }) => Promise<void>;
};

const driver = Driver.create();

const inherited = Number(process.env.MCP_TOOL_TIMEOUT);
if (Number.isFinite(inherited) && inherited > 0 && inherited * 1000 <= CALL_BUDGET_MS) {
  process.stderr.write(`[pokerogue-mcp] warning: MCP_TOOL_TIMEOUT=${inherited}s is at or below the settle budget (${CALL_BUDGET_MS / 1000}s); the client may cut calls short\n`);
}

function context(extra: Extra): CallContext {
  const token = extra._meta?.progressToken;
  let progress = 0;
  return {
    signal: extra.signal,
    progress: token === undefined ? undefined : message => {
      progress++;
      void extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress, message } }).catch(() => {});
    },
  };
}

function json(value: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], isError };
}

/** Optional per-call JSONL log (`POKEROGUE_MCP_LOG=path`): the soak's calls-per-wave count comes from here (#25). */
const LOG = process.env.POKEROGUE_MCP_LOG;
const t0 = Date.now();
function logCall(tool: string, args: unknown, ms: number, result: Record<string, unknown>): void {
  if (!LOG) return;
  const line = { t: Date.now() - t0, tool, args, ms, status: result.status ?? result.error, screen: result.screen, wave: result.wave, selected: result.selected, messages: result.messages };
  try {
    appendFileSync(LOG, JSON.stringify(line) + "\n");
  } catch {
    // logging never fails a call
  }
}

async function run(tool: string, args: unknown, fn: () => Promise<Record<string, unknown>>) {
  const t = Date.now();
  try {
    const result = await fn();
    logCall(tool, args, Date.now() - t, result);
    // run_interrupted is an error by contract (#7 §3): the run may still exist server-side.
    return json(result, result.status === "run_interrupted");
  } catch (e) {
    const body = e instanceof Refusal ? { error: e.code, message: e.message, ...e.detail } : { error: "internal", message: (e as Error).message ?? String(e) };
    logCall(tool, args, Date.now() - t, body);
    return json(body, true);
  }
}

const server = new McpServer({ name: "pokerogue-mcp", version: "0.1.0" });

server.registerTool(
  "status",
  {
    description:
      "Is the server attached to a PokéRogue tab and is a run live. The only tool meaningful before a run exists. Attaches lazily (launching Chrome if needed).",
    inputSchema: {},
  },
  async () => run("status", {}, () => driver.status()),
);

server.registerTool(
  "get_state",
  {
    description:
      "The settled snapshot: wave, turn, money, biome, active pokémon, enemy, party. detail widens it: party (movesets, IVs, stats), items (held modifiers, best-effort), full. Waits for the game to settle; if a previous call timed out, this resumes the wait without pressing anything.",
    inputSchema: { detail: z.enum(["lean", "party", "items", "full"]).optional() },
  },
  async ({ detail }, extra) => run("get_state", { detail }, () => driver.getState(detail ?? "lean", context(extra as Extra))),
);

server.registerTool(
  "read_menu",
  {
    description:
      "What the game is asking right now: composite screen id, option labels in cursor order, cursor, message text, and what CANCEL would do here (cancel_effect). Labels are read fresh each call; pass them back verbatim to select_option.",
    inputSchema: {},
  },
  async (_args, extra) => run("read_menu", {}, () => driver.readMenu(context(extra as Extra))),
);

server.registerTool(
  "select_option",
  {
    description:
      "Make one decision: move the cursor to the option with this label (exact match after trimming/case-folding) and commit with ACTION. Returns messages crossed while auto-advancing text, the lean snapshot and the next menu. Refuses (nothing pressed) on no_match, ambiguous, screen_changed, settings screens, the starter filter bar, a contended tab or a frozen loop. To leave a screen, select the option that leaves it (Cancel, No): there is no back button.",
    inputSchema: {
      label: z.string().optional().describe("An option label as read_menu returned it"),
      index: z.union([z.string(), z.number()]).optional().describe("The option's `i` as read_menu returned it this call — use when a label is duplicated (e.g. the same item as a free reward and in the shop). With label too, both must agree."),
      expect_screen: z.string().optional().describe("Composite screen id from read_menu; refused with screen_changed if the live screen differs"),
    },
  },
  async ({ label, index, expect_screen }, extra) => run("select_option", { label, index, expect_screen }, () => driver.selectOption(label, index, expect_screen, context(extra as Extra))),
);

server.registerTool(
  "press",
  {
    description:
      "Deliver one raw button — the escape hatch for unmodelled screens. CANCEL is not 'back': it consents on messages, selects the last option on option lists, abandons a run on the save-slot screen and pops a team member on the starter grid; check read_menu's cancel_effect first. Never repeat a button because the last one seemed to fail; judge by the returned state.",
    inputSchema: { button: z.enum(Object.keys(Button) as [string, ...string[]]) },
  },
  async ({ button }, extra) => run("press", { button }, () => driver.press(button, context(extra as Extra))),
);

server.registerTool(
  "start_run",
  {
    description:
      "From the TITLE screen, start a Classic run with these starters (species names as shown on the starter grid) and play up to the first decision. Refuses an occupied save slot unless overwrite is true; default slot is the lowest free one. If the party exceeds the cost budget or a name is not on the grid, it refuses once the grid is open and backs out to TITLE first, so a corrected start_run works at once; should the back-out fail, the refusal's next says how to finish it.",
    inputSchema: {
      species: z.array(z.string()).min(1).max(6),
      slot: z.number().int().min(0).max(4).optional().describe('0-based save-slot index: 0 is the screen\'s "Slot 1", 4 is "Slot 5".'),
      overwrite: z.boolean().optional(),
    },
  },
  async ({ species, slot, overwrite }, extra) => run("start_run", { species, slot, overwrite }, () => driver.startRun(species, slot, overwrite ?? false, context(extra as Extra))),
);

server.registerTool(
  "screenshot",
  {
    description: "A PNG of the game for the human reading the transcript. Never needed to play; ~100× slower and ~90× larger than a text read.",
    inputSchema: {},
  },
  async () => {
    try {
      const data = await driver.screenshot();
      return { content: [{ type: "image" as const, data, mimeType: "image/png" }] };
    } catch (e) {
      return json({ error: "screenshot_failed", message: (e as Error).message }, true);
    }
  },
);

await server.connect(new StdioServerTransport());
process.stderr.write("[pokerogue-mcp] ready on stdio\n");
