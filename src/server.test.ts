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

test("the plugin runs a solve as a job, which over CDP answers that it needs the hub (#672)", async t => {
  const client = await plugin(t, tempHome(t));
  const start = async () => {
    const res = await client.callTool({ name: "start_job", arguments: { kind: "solve" } });
    assert.equal(res.isError, true);
    return JSON.parse((res.content as { text: string }[])[0].text);
  };
  assert.equal((await start()).error, "solving_off");
  await solving(client, { on: true });
  const r = await start();
  assert.equal(r.error, "no_answer", JSON.stringify(r));
  assert.deepEqual(r.reason, { code: "needs_hub" });
});

function solvingSection(): string {
  const skill = readFileSync(path.join(import.meta.dirname, "../skills/coachemon/SKILL.md"), "utf8");
  const at = skill.indexOf("\n## Solving");
  return skill.slice(at, skill.indexOf("\n## ", at + 1));
}

test("the solving tool and the coach skill both state what turning solving on costs (#666)", async t => {
  const { tools } = await (await plugin(t, tempHome(t))).listTools();
  const description = tools.find(tool => tool.name === "solving")?.description ?? "";
  const solving = solvingSection();
  for (const cost of ["0.6 GB of disk", "one-time setup", "minutes of CPU per fight"]) {
    assert.ok(description.includes(cost), `the tool's description names ${cost}`);
    assert.ok(solving.includes(cost), `the skill's Solving section names ${cost}`);
  }
});

test("the coach skill solves a fight through tools the plugin offers, and through no tool that acts on the game (#673)", async t => {
  const { tools } = await (await plugin(t, tempHome(t))).listTools();
  const offered = new Set(tools.map(tool => tool.name));
  const section = solvingSection() + readFileSync(path.join(import.meta.dirname, "../skills/coachemon/references/solving.md"), "utf8");
  for (const tool of ["solving", "start_job", "poll_job", "read_job", "hand_oracle_line"]) {
    assert.ok(section.includes(`\`${tool}\``), `the coach's solving text names ${tool}`);
    assert.ok(offered.has(tool), `the plugin offers ${tool}`);
  }
  for (const acting of ["press", "select_option", "start_run"]) assert.ok(!section.includes(`\`${acting}\``), `the coach's solving text names ${acting}, which acts on the game`);
});
