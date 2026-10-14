import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Driver } from "./driver.ts";
import { fakeGame } from "./game/fake-game.ts";
import type { JobKinds } from "./jobs.ts";
import { toolServer } from "./tools.ts";

async function connect(kinds: JobKinds = {}): Promise<Client> {
  const fake = fakeGame({});
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await toolServer(new Driver(fake.game, fake.clock, kinds)).connect(serverSide);
  const client = new Client({ name: "tools-test", version: "0" });
  await client.connect(clientSide);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<{ body: Record<string, unknown>; isError: boolean }> {
  const res = await client.callTool({ name, arguments: args });
  const [first] = res.content as { type: string; text: string }[];
  return { body: JSON.parse(first.text), isError: res.isError === true };
}

test("the server offers exactly these tools", async () => {
  const { tools } = await (await connect()).listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), [
    "cancel_job", "get_state", "poll_job", "press", "read_card", "read_job", "read_menu", "read_starters", "screenshot", "select_option", "solving", "start_job", "start_run", "status",
  ]);
});

test("a job started over MCP is read back over MCP once it has answered (#667)", async () => {
  let answer = (_: unknown) => {};
  const client = await connect({ echo: async args => new Promise(r => (answer = () => r(args))) });
  const started = await call(client, "start_job", { kind: "echo", args: { wave: 180 } });
  assert.deepEqual(started, { body: { job: "echo-1", kind: "echo", state: "running", progress: null }, isError: false });
  answer(undefined);
  await new Promise(r => setImmediate(r));
  assert.deepEqual((await call(client, "read_job", { job: "echo-1" })).body.result, { wave: 180 });
  assert.equal((await call(client, "poll_job", { job: "echo-1" })).body.state, "done");
  assert.equal((await call(client, "cancel_job", { job: "echo-1" })).body.state, "done");
});

test("a job tool refused over MCP is an error result carrying its code (#667)", async () => {
  const { body, isError } = await call(await connect(), "poll_job", { job: "solve-1" });
  assert.equal(isError, true);
  assert.equal(body.error, "unknown_job");
});
