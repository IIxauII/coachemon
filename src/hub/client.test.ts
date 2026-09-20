import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { WebSocketServer } from "ws";
import { compare, HubClient, spawnHub, type HubProcess } from "./client.ts";
import { deadPort, deadSpawn, fakeClient, readyTab } from "./fake-ext.ts";
import { Hub, startHub } from "./hub.ts";
import type { ClientReply, ToClient } from "../protocol/wire.ts";

const shut: (() => void)[] = [];

after(() => {
  for (const s of shut) s();
});

async function hub(o: { version?: string; port?: number } = {}): Promise<Hub> {
  const h = await startHub({ port: o.port ?? 0, version: o.version ?? "1.0.0", timeoutMs: 300 });
  shut.push(() => h.close());
  return h;
}

/** A hub start that really does come up, in this process. */
function liveSpawn(version = "1.0.0"): (port: number) => HubProcess {
  return port => {
    const started = startHub({ port, version });
    void started.then(h => shut.push(() => h.close()));
    return { pid: null, stderr: () => "", exited: started.then(() => null), release: () => {} };
  };
}

function client(port: number, o: Partial<ConstructorParameters<typeof HubClient>[0]> = {}): HubClient {
  const c = new HubClient({ port, version: "1.0.0", spawnHub: () => deadSpawn(), ...o });
  shut.push(() => c.close());
  return c;
}

test("a client connects to a running hub, and its commands reach the tab (§7.2)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 3);
  const c = client(h.port);
  assert.equal(await c.ready(), null);
  for (let i = 0; i < 50 && (await c.state())?.tabs.length !== 1; i++) await new Promise(r => setTimeout(r, 20));

  const reply = c.send("menu", {});
  const cmd = await ext.take<{ t: "cmd"; id: number; tab: number }>(f => f.t === "cmd");
  assert.equal(cmd.tab, 3);
  ext.send({ t: "reply", id: cmd.id, ok: true, result: { readable: true } });
  assert.deepEqual(await reply, { t: "reply", id: 1, ok: true, result: { readable: true } });
});

test("a hub that will not start is rung 2's stderr, and its death ends the wait early (§7.2)", async () => {
  const port = await deadPort();
  const c = client(port, { spawnHub: () => deadSpawn("Error: cannot find module ws\n    at x") });
  const t0 = Date.now();
  assert.deepEqual(await c.ready(), { kind: "no-start", stderr: "Error: cannot find module ws\n    at x" });
  assert.ok(Date.now() - t0 < 3_000, `a child that has exited is not waited out: took ${Date.now() - t0} ms`);
});

test("a hub that never answers and never exits is given the whole spawn budget (§7.2)", async () => {
  const port = await deadPort();
  const c = client(port, { spawnHub: () => ({ pid: null, stderr: () => "", exited: new Promise(() => {}), release: () => {} }) });
  const t0 = Date.now();
  const r = await c.ready();
  assert.equal(r?.kind, "no-start");
  assert.ok(Date.now() - t0 >= 3_000, "the client retries every 100 ms for the full 3 s budget");
});

test("a spawn that does come up is connected to, and the child is released then (§7.2)", async () => {
  const port = await deadPort();
  let released = 0;
  const c = client(port, {
    spawnHub: p => {
      const h = liveSpawn()(p);
      return { ...h, release: () => { released++; } };
    },
  });
  assert.equal(await c.ready(), null);
  assert.equal(released, 1, "the stderr pipe is destroyed and the child unref'd once we are connected");
});

test("a port that answers but is not a hub is rung 1, whether it speaks HTTP or a silent WebSocket (§7.2, §7.4)", async () => {
  const holder = () => ({ process: "OtherApp", pid: 4242 });

  const http = createServer((_req, res) => res.writeHead(200).end("hello"));
  await new Promise<void>(r => http.listen(0, "127.0.0.1", r));
  shut.push(() => http.close());
  const httpPort = (http.address() as { port: number }).port;
  assert.deepEqual(await client(httpPort, { portHolder: holder }).ready(), { kind: "foreign", port: httpPort, process: "OtherApp", pid: 4242 });

  // Connected, but no product-marked welcome within the window: a squatter that speaks WebSocket is still not ours.
  const silent = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>(r => silent.once("listening", r));
  shut.push(() => silent.close());
  const silentPort = (silent.address() as { port: number }).port;
  assert.deepEqual(await client(silentPort, { portHolder: holder }).ready(), { kind: "foreign", port: silentPort, process: "OtherApp", pid: 4242 });
});

test("a hub newer than this plugin copy refuses every call, and says which side to restart (§7.3)", async () => {
  const h = await hub({ version: "2.0.0" });
  const c = client(h.port);
  assert.deepEqual(await c.ready(), { kind: "skew-hub-newer" });
  const r = await c.send("menu", {});
  assert.equal(r.ok === false && r.code, "unreachable", "no hub to ask is not the same as no tab (§7.6)");
});

test("a newer client retires an idle older hub and takes its place (§7.3)", async () => {
  const port = await deadPort();
  const old = await hub({ version: "0.9.0", port });
  let spawned = 0;
  const c = client(port, {
    version: "1.0.0",
    spawnHub: p => {
      spawned++;
      return liveSpawn("1.0.0")(p);
    },
  });
  assert.equal(await c.ready(), null);
  assert.equal(spawned, 1, "the old hub was retired and a matching one started");
  assert.equal(old.port, port);
});

test("a newer client leaves an older hub alone while someone is driving on it (§7.3)", async () => {
  const h = await hub({ version: "0.9.0" });
  const driver = await fakeClient(h.port);
  driver.send({ t: "claim" });
  await driver.take(f => f.t === "claimed");

  const c = client(h.port, { version: "1.0.0" });
  assert.deepEqual(await c.ready(), { kind: "skew-driving" });
});

test("claim and its refusal cross the client (§7.5)", async () => {
  const h = await hub();
  const a = client(h.port);
  const b = client(h.port);
  assert.equal(await a.claim(), true);
  assert.equal(await b.claim(), false);
  assert.equal((await b.state())?.driver, "other");
});

test("a subscribed client hears events and notices (§7.5)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 1);
  const heard: ToClient[] = [];
  const c = client(h.port, { onEvent: f => heard.push(f) });
  await c.subscribe();
  for (let i = 0; i < 50 && (await c.state())?.tabs.length !== 1; i++) await new Promise(r => setTimeout(r, 20));

  ext.send({ t: "event", tab: 1, kind: "card", body: { text: "go" } });
  for (let i = 0; i < 50 && heard.length === 0; i++) await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(heard, [{ t: "event", kind: "card", body: { text: "go" } }]);
});

test("a hub that goes away mid-command answers the command instead of hanging", async () => {
  const h = await hub();
  await readyTab(h.port, 1);
  const c = client(h.port);
  await c.ready();
  const reply = c.send("menu", {}) as Promise<ClientReply>;
  h.close();
  const r = await reply;
  assert.equal(r.ok, false);
});

test("a real client spawns the real hub process and is talking to it inside the budget (§7.2)", async () => {
  const port = await deadPort();
  const spawned: HubProcess[] = [];
  const c = new HubClient({
    port,
    version: readVersion(),
    spawnHub: p => {
      const child = spawnHub(p);
      spawned.push(child);
      return child;
    },
  });
  shut.push(() => c.close());
  shut.push(() => {
    for (const child of spawned) if (child.pid) process.kill(child.pid, "SIGTERM");
  });

  const t0 = Date.now();
  assert.equal(await c.ready(), null, "the spawned hub answers with the product marker");
  assert.ok(Date.now() - t0 < 3_000, `the dialling runs alongside the child's start: took ${Date.now() - t0} ms`);
  assert.equal(spawned[0].stderr(), "");

  // Two clients racing to spawn is normal: the loser's hub gets EADDRINUSE, exits 0 and says nothing.
  const loser = spawnHub(port);
  if (loser.pid) shut.push(() => { try { process.kill(loser.pid!, "SIGTERM"); } catch { /* already gone */ } });
  assert.equal(await loser.exited, 0);
  assert.equal(loser.stderr(), "");
  loser.release();
});

test("plugin versions compare as the three numbers semantic-release writes (§7.3)", () => {
  assert.equal(compare("1.2.0", "1.2.0"), 0);
  assert.equal(compare("1.10.0", "1.9.0"), 1);
  assert.equal(compare("0.28.0", "1.0.0"), -1);
  assert.equal(compare("1.0.1", "1.0.0"), 1);
});

/** The hub process stamps its welcome with its own plugin copy's version, so a real client must match it. */
function readVersion(): string {
  return (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;
}
