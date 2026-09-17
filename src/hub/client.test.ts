/**
 * Dialling the hub (§7.2) and what the plugin versions mean once it answers (§7.3). The spawn test runs the real
 * `src/hub/main.ts` as a detached process, because connect-else-spawn is the whole of the pairing story: no installer,
 * nothing written to disk, and no step the player takes.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { PROTOCOL } from "../protocol/version.ts";
import { compareVersions, dial, HubClient } from "./client.ts";
import { FakeExtension, delivered } from "./fake-extension.ts";
import { Hub } from "./hub.ts";

const open: { close: () => unknown }[] = [];

after(async () => {
  for (const o of open.reverse()) await o.close();
});

async function hub(opts: Partial<Parameters<typeof Hub.listen>[0]> = {}) {
  const h = await Hub.listen({ port: 0, version: "1.0.0", onRetire: () => {}, onIdle: () => {}, ...opts });
  open.push(h);
  return h;
}

test("a refused port is not an error: the client starts the machine's hub and connects to it (§7.2)", async () => {
  const port = await freePort();
  const first = await dial({ port, version: "0.0.0", role: "server" });
  assert.ok(first.ok, JSON.stringify(first));
  open.push(first.client);
  assert.equal(first.client.hubVersion.length > 0, true);

  // A second client finds it already running and connects without spawning anything.
  const second = await dial({ port, version: "0.0.0", role: "server", spawnHub: false });
  assert.ok(second.ok, JSON.stringify(second));
  open.push(second.client);

  // The spawned hub is a real detached process: retire it rather than leaving it on the port for ten minutes.
  const ext = await FakeExtension.connect(port);
  ext.tab(1);
  await delivered();
  assert.equal((await second.client.state()).tabs.length, 1);
  await ext.close();
  second.client.retire();
  await delivered();
});

test("a foreign process on the port is rung 1: it never proves itself with the product marker (§7.2)", async () => {
  const squatter = await squat(false);
  open.push({ close: () => new Promise<void>(r => squatter.close(() => r())) });
  const d = await dial({ port: (squatter.address() as { port: number }).port, version: "1.0.0", role: "server", spawnHub: false });
  assert.equal(d.ok, false);
  assert.equal(!d.ok && d.reach.rung, 1);
});

test("a process that answers with the wrong product is rung 1 too, not a hub to be trusted (§7.4)", async () => {
  const squatter = await squat(true);
  open.push({ close: () => new Promise<void>(r => squatter.close(() => r())) });
  const d = await dial({ port: (squatter.address() as { port: number }).port, version: "1.0.0", role: "server", spawnHub: false });
  assert.equal(d.ok, false);
  assert.equal(!d.ok && d.reach.rung, 1);
});

test("a hub newer than this plugin copy refuses every tool call: restart the session (§7.3)", async () => {
  const h = await hub({ version: "2.0.0" });
  const d = await dial({ port: h.port, version: "1.0.0", role: "server", spawnHub: false });
  assert.ok(d.ok);
  open.push(d.client);
  assert.equal(d.client.skew, "This Claude session's Coachemon plugin is older than the running hub. Restart this Claude session.");
});

test("a plugin newer than the hub retires it, when nobody is driving (§7.3)", async () => {
  let retired = 0;
  const h = await hub({ version: "0.9.0", onRetire: () => retired++ });
  // No spawn: the retired hub is not replaced, so the dial ends on rung 2 having done what it came to do.
  const d = await dial({ port: h.port, version: "1.0.0", role: "server", spawnHub: false });
  assert.equal(retired, 1);
  assert.equal(d.ok, false);
});

test("a plugin newer than the hub leaves a driving session alone, and says so (§7.3)", async () => {
  let retired = 0;
  const h = await hub({ version: "0.9.0", onRetire: () => retired++ });
  const holder = await dial({ port: h.port, version: "0.9.0", role: "server", spawnHub: false });
  assert.ok(holder.ok);
  open.push(holder.client);
  assert.equal(await holder.client.claim(), true);

  const d = await dial({ port: h.port, version: "1.0.0", role: "server", spawnHub: false });
  assert.ok(d.ok, JSON.stringify(d));
  open.push(d.client);
  assert.equal(retired, 0);
  assert.equal(d.client.skew, "Another session is driving on an older Coachemon hub. Finish or close that session, then retry.");
});

test("equal versions proceed with no skew at all", async () => {
  const h = await hub({ version: "1.0.0" });
  const d = await dial({ port: h.port, version: "1.0.0", role: "server", spawnHub: false });
  assert.ok(d.ok);
  open.push(d.client);
  assert.equal(d.client.skew, null);
});

test("a dead socket answers everything waiting on it, so no tool call hangs on a hub that went away", async () => {
  const h = await hub();
  const d = await dial({ port: h.port, version: "1.0.0", role: "server", spawnHub: false });
  assert.ok(d.ok);
  const client: HubClient = d.client;
  await h.close();
  await delivered();
  const reply = await client.send("menu", {});
  assert.equal(reply.ok, false);
  assert.deepEqual(await client.state(), { t: "state", extensions: [], tabs: [], driver: null });
  assert.equal(await client.claim(), false);
  assert.equal(client.open, false);
});

test("plugin versions compare field by field", () => {
  assert.equal(compareVersions("1.2.0", "1.2.0"), 0);
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("0.29.0", "0.30.0"), -1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
});

// -------------------------------------------------------------------- helpers

/** A port nothing is listening on, found by letting the OS pick one and giving it back. */
async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>(r => s.listen(0, "127.0.0.1", () => r()));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>(r => s.close(() => r()));
  return port;
}

/** Something else on the port: it accepts the upgrade, and either says nothing or answers as another product. */
async function squat(answer: boolean): Promise<Server> {
  const http = createServer();
  const wss = new WebSocketServer({ noServer: true });
  http.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, ws => {
      if (answer) ws.send(JSON.stringify({ t: "welcome", product: "something-else", protocol: PROTOCOL, version: "1.0.0" }));
    });
  });
  await new Promise<void>(r => http.listen(0, "127.0.0.1", () => r()));
  return http;
}
