import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { serverEnv } from "./server-env.ts";

function tempHome(t: TestContext): string {
  const home = mkdtempSync(path.join(tmpdir(), "coachemon-home-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

/** The env is built by hand: a shell's `COACHEMON_TRANSPORT` passed through would move the server off its default transport. */
async function plugin(t: TestContext, home: string): Promise<Client> {
  const client = new Client({ name: "server-test", version: "0" });
  const env = serverEnv({ PATH: process.env.PATH, HOME: process.env.HOME, COACHEMON_HOME: home });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(import.meta.dirname, "server.ts")], stderr: "ignore", env }));
  t.after(() => client.close());
  return client;
}

async function solving(client: Client, args: { on?: boolean }): Promise<unknown> {
  const res = await client.callTool({ name: "solving", arguments: args });
  return JSON.parse((res.content as { text: string }[])[0].text);
}

test("solving turned on survives a restart of the plugin, and stays with the home COACHEMON_HOME names", async t => {
  const home = tempHome(t);
  const first = await plugin(t, home);
  assert.deepEqual(await solving(first, { on: true }), { status: "ok", solving: true });
  await first.close();

  assert.deepEqual(await solving(await plugin(t, home), {}), { status: "ok", solving: true });
  assert.deepEqual(await solving(await plugin(t, tempHome(t)), {}), { status: "ok", solving: false });
});

test("the plugin runs the clone's setup as a job, and refuses it while solving is off (#668)", async t => {
  const res = await (await plugin(t, tempHome(t))).callTool({ name: "start_job", arguments: { kind: "clone" } });
  assert.equal(res.isError, true);
  assert.equal(JSON.parse((res.content as { text: string }[])[0].text).error, "solving_off");
});

test("the solving tool and the coach skill both state what turning solving on costs (#666)", async t => {
  const { tools } = await (await plugin(t, tempHome(t))).listTools();
  const description = tools.find(tool => tool.name === "solving")?.description ?? "";
  const skill = readFileSync(path.join(import.meta.dirname, "../skills/coachemon/SKILL.md"), "utf8");
  const solvingSection = skill.slice(skill.indexOf("## Solving"), skill.indexOf("\n## ", skill.indexOf("## Solving") + 1));
  for (const cost of ["0.6 GB of disk", "one-time setup", "minutes of CPU per fight"]) {
    assert.ok(description.includes(cost), `the tool's description names ${cost}`);
    assert.ok(solvingSection.includes(cost), `the skill's Solving section names ${cost}`);
  }
});
