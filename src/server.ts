import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Driver } from "./driver.ts";
import { CALL_BUDGET_MS } from "./settle.ts";
import { toolServer } from "./tools.ts";

const inherited = Number(process.env.MCP_TOOL_TIMEOUT);
if (Number.isFinite(inherited) && inherited > 0 && inherited * 1000 <= CALL_BUDGET_MS) {
  process.stderr.write(`[coachemon] warning: MCP_TOOL_TIMEOUT=${inherited}s is at or below the settle budget (${CALL_BUDGET_MS / 1000}s); the client may cut calls short\n`);
}

await toolServer(Driver.create()).connect(new StdioServerTransport());
process.stderr.write("[coachemon] ready on stdio\n");
