import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Driver } from "./driver.ts";
import { fakeGame } from "./game/fake-game.ts";
import type { JobKinds } from "./jobs.ts";
import { toolServer } from "./tools.ts";

function tempHome(t: TestContext): string {
  const home = mkdtempSync(path.join(tmpdir(), "coachemon-tools-test-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

async function connect(t: TestContext, kinds: JobKinds = {}): Promise<Client> {
  const fake = fakeGame({});
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await toolServer(new Driver(fake.game, tempHome(t), fake.clock, kinds)).connect(serverSide);
  const client = new Client({ name: "tools-test", version: "0" });
  await client.connect(clientSide);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<{ body: Record<string, unknown>; isError: boolean }> {
  const res = await client.callTool({ name, arguments: args });
  const [first] = res.content as { type: string; text: string }[];
  return { body: JSON.parse(first.text), isError: res.isError === true };
}

test("the server offers exactly these tools", async t => {
  const { tools } = await (await connect(t)).listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [
    "cancel_job", "get_state", "hand_oracle_line", "poll_job", "press", "read_card", "read_job", "read_menu", "read_starters", "screenshot", "select_option", "solving", "start_job", "start_run", "status",
  ]);
});

test("a job started over MCP is read back over MCP once it has answered (#667)", async t => {
  let answer = (_: unknown) => {};
  const client = await connect(t, { echo: async args => new Promise(r => (answer = () => r(args))) });
  const started = await call(client, "start_job", { kind: "echo", args: { wave: 180 } });
  assert.deepEqual(started, { body: { job: "echo-1", kind: "echo", state: "running", progress: null, end_file: started.body.end_file }, isError: false });
  assert.equal(typeof started.body.end_file, "string");
  answer(undefined);
  await new Promise(r => setImmediate(r));
  assert.deepEqual((await call(client, "read_job", { job: "echo-1" })).body.result, { wave: 180 });
  assert.equal((await call(client, "poll_job", { job: "echo-1" })).body.state, "done");
  assert.equal((await call(client, "cancel_job", { job: "echo-1" })).body.state, "done");
});

test("read_job takes detail short or full over MCP (#818)", async t => {
  const client = await connect(t, { echo: async args => args });
  const { tools } = await client.listTools();
  const schema = tools.find(tool => tool.name === "read_job")?.inputSchema.properties as Record<string, { enum?: string[] }>;
  assert.deepEqual(schema.detail?.enum, ["short", "full"]);
  await call(client, "start_job", { kind: "echo", args: { wave: 180 } });
  await new Promise(r => setImmediate(r));
  assert.deepEqual((await call(client, "read_job", { job: "echo-1", detail: "full" })).body.result, { wave: 180 });
});

test("a job tool refused over MCP is an error result carrying its code (#667)", async t => {
  const { body, isError } = await call(await connect(t), "poll_job", { job: "solve-1" });
  assert.equal(isError, true);
  assert.equal(body.error, "unknown_job");
});

test("hand_oracle_line takes a job's id over MCP, and refuses one with no oracle line as an error result (#673)", async t => {
  const client = await connect(t, { echo: async () => "no line" });
  const { body: started } = await call(client, "start_job", { kind: "echo" });
  await new Promise(r => setImmediate(r));
  const { body, isError } = await call(client, "hand_oracle_line", { job: started.job });
  assert.equal(isError, true);
  assert.equal(body.error, "no_oracle_line", JSON.stringify(body));
});
