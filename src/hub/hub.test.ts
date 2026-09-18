import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fakeClient, fakeExtension, open, Peer, readyTab } from "./fake-ext.ts";
import { authorize, Hub, startHub } from "./hub.ts";
import { PRODUCT, PROTOCOL } from "../protocol/version.ts";
import type { ClientReply, FromClient, FromExtension, HubState, TabInfo, ToClient, ToExtension } from "../protocol/wire.ts";

const hubs: Hub[] = [];

after(() => {
  for (const h of hubs) h.close();
});

/** A hub on a port of its own, closed when the file's tests are done. `timeoutMs` and `idleMs` keep the tests quick. */
async function hub(o: { timeoutMs?: number; idleMs?: number; onIdle?: () => void; onRetire?: () => void; version?: string } = {}): Promise<Hub> {
  const h = await startHub({ port: 0, version: o.version ?? "1.0.0", timeoutMs: o.timeoutMs ?? 300, ...o });
  hubs.push(h);
  return h;
}

type Client = Peer<ToClient, FromClient>;

/** The hub's own view, which is also how a test waits for a frame sent on another socket to have landed. */
async function state(c: Client): Promise<HubState> {
  c.send({ t: "state" });
  return c.take<HubState>(f => f.t === "state");
}

async function tabsCount(c: Client, n: number): Promise<TabInfo[]> {
  for (let i = 0; i < 50; i++) {
    const s = await state(c);
    if (s.tabs.length === n) return s.tabs;
    await c.quiet(20);
  }
  assert.fail(`the hub never reported ${n} tabs`);
}

async function ask(c: Client, id: number, name: string, args: Record<string, unknown> = {}): Promise<ClientReply> {
  c.send({ t: "cmd", id, name, args });
  return c.take<ClientReply>(f => f.t === "reply" && (f as ClientReply).id === id);
}

// --------------------------------------------------------------------- §7.4 auth

test("the upgrade takes a local client and an extension origin, and 403s anything else (§7.4)", async () => {
  const h = await hub();
  assert.equal(authorize({ host: `127.0.0.1:${h.port}` }, h.port), "client");
  assert.equal(authorize({ host: `127.0.0.1:${h.port}`, origin: "moz-extension://uuid" }, h.port), "browser");
  assert.equal(authorize({ host: `127.0.0.1:${h.port}`, origin: "safari-web-extension://uuid" }, h.port), "browser");
  // A page is the threat: a drive-by origin gets nothing, whatever the id.
  assert.equal(authorize({ host: `127.0.0.1:${h.port}`, origin: "https://pokerogue.net" }, h.port), null);
  assert.equal(authorize({ host: `127.0.0.1:${h.port}`, origin: "http://localhost:3000" }, h.port), null);
  // DNS rebinding: the name resolved to us, but the Host header gives it away.
  assert.equal(authorize({ host: `evil.example:${h.port}` }, h.port), null);
  assert.equal(authorize({ host: `localhost:${h.port}` }, h.port), null);
});

test("a wrong Host or a page Origin is refused on the wire, not just in the check (§7.4)", async () => {
  const h = await hub();
  await assert.rejects(open(h.port, { Host: `evil.example:${h.port}` }), /403/);
  await assert.rejects(open(h.port, { Origin: "https://pokerogue.net" }), /403/);
});

test("the hub answers a hello with the product marker, and says nothing before one (§7.4, §7.6)", async () => {
  const h = await hub({ version: "1.2.0" });
  const welcome = { t: "welcome", product: PRODUCT, protocol: PROTOCOL, version: "1.2.0" };

  const ext = new Peer<ToExtension, FromExtension>(await open(h.port, { Origin: "chrome-extension://fakefakefakefake" }));
  await ext.quiet();
  assert.deepEqual(ext.seen, [], "hellos go both ways: the hub proves itself only to something that spoke first");
  ext.send({ t: "hello", protocol: PROTOCOL, version: "1.0.0", target: "chrome", flavour: "store", build: "fake", consent: true, commands: [] });
  assert.deepEqual(await ext.take(f => f.t === "welcome"), welcome);

  const client = new Peer<ToClient, FromClient>(await open(h.port, {}));
  client.send({ t: "hello", role: "server", version: "1.0.0", pid: process.pid });
  assert.deepEqual(await client.take(f => f.t === "welcome"), welcome);
});

// ------------------------------------------------------------------ §7.5 routing

test("a command goes to the one counted tab and its reply comes back on the client's own id (§7.5)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 77);
  const client = await fakeClient(h.port);
  await tabsCount(client, 1);

  client.send({ t: "cmd", id: 5, name: "menu", args: {} });
  const cmd = await ext.take<{ t: "cmd"; id: number; tab: number; name: string }>(f => f.t === "cmd");
  assert.equal(cmd.tab, 77);
  assert.equal(cmd.name, "menu");
  // The hub numbers its own commands: the client's id is its own, and comes back unchanged.
  ext.send({ t: "reply", id: cmd.id, ok: true, result: { readable: true } });
  const reply = await client.take<ClientReply>(f => f.t === "reply");
  assert.deepEqual(reply, { t: "reply", id: 5, ok: true, result: { readable: true } });
});

test("zero tabs refuse no-tab and more than one refuses tabs with the list, at once (§7.5)", async () => {
  const h = await hub();
  const client = await fakeClient(h.port);
  const none = await ask(client, 1, "menu");
  assert.equal(none.ok === false && none.code, "no-tab");

  await readyTab(h.port, 1, { target: "chrome" });
  await readyTab(h.port, 2, { target: "firefox" });
  await tabsCount(client, 2);
  const many = await ask(client, 2, "menu");
  assert.equal(many.ok === false && many.code, "tabs");
  assert.equal(many.ok === false && many.tabs?.length, 2);
  // Tabs are counted across browsers, so the list names both.
  assert.deepEqual(
    many.ok === false ? many.tabs?.map(t => t.target).sort() : null,
    ["chrome", "firefox"],
  );
});

test("a name outside the store table refuses unknown-command, and a dev name reaches only a dev build (§10.6)", async () => {
  const h = await hub();
  await readyTab(h.port, 1);
  const client = await fakeClient(h.port);
  await tabsCount(client, 1);
  const bogus = await ask(client, 1, "eval_forever");
  assert.equal(bogus.ok === false && bogus.code, "unknown-command");
  const dev = await ask(client, 2, "eval", { source: "1" });
  assert.equal(dev.ok === false && dev.code, "unknown-command");
});

test("a dev build takes the dev table (§10.6)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 1, { flavour: "dev", commands: ["probe", "eval"] });
  const client = await fakeClient(h.port);
  await tabsCount(client, 1);
  client.send({ t: "cmd", id: 1, name: "eval", args: { source: "1+1" } });
  const cmd = await ext.take<{ t: "cmd"; id: number; name: string }>(f => f.t === "cmd");
  assert.equal(cmd.name, "eval");
});

test("`dev-reload` reaches every dev build, needing no tab, and never a store build (§5.4)", async () => {
  const h = await hub();
  // No tab anywhere: the dev loop's reload has to work on the build whose relay the last change broke.
  const dev = await fakeExtension(h.port, { flavour: "dev" });
  const store = await fakeExtension(h.port, { flavour: "store" });
  const client = await fakeClient(h.port);
  client.send({ t: "dev-reload" });
  await dev.take(f => f.t === "dev-reload");
  await store.quiet();
  assert.deepEqual(store.seen.filter(f => f.t === "dev-reload"), []);
});

test("a command the connected extension did not list refuses missing-command (§8.5)", async () => {
  const h = await hub();
  await readyTab(h.port, 1, { commands: ["probe", "menu"] });
  const client = await fakeClient(h.port);
  await tabsCount(client, 1);
  const r = await ask(client, 1, "cursor.learn", { row: 0, fine: "x" });
  assert.equal(r.ok === false && r.code, "missing-command");
});

test("an extension outside the protocol window has its commands refused protocol (§8.5)", async () => {
  const h = await hub();
  await readyTab(h.port, 1, { protocol: PROTOCOL + 1 });
  const client = await fakeClient(h.port);
  await tabsCount(client, 1);
  const r = await ask(client, 1, "menu");
  assert.equal(r.ok === false && r.code, "protocol");
});

test("the previous protocol is still inside the window (§8.5)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 1, { protocol: PROTOCOL - 1 });
  const client = await fakeClient(h.port);
  await tabsCount(client, 1);
  client.send({ t: "cmd", id: 1, name: "menu", args: {} });
  await ext.take(f => f.t === "cmd");
});

test("an extension that never answers gets the client a timeout, and a late reply is dropped (§7.6)", async () => {
  const h = await hub({ timeoutMs: 120 });
  const ext = await readyTab(h.port, 1);
  const client = await fakeClient(h.port);
  await tabsCount(client, 1);
  const cmdPromise = ext.take<{ t: "cmd"; id: number }>(f => f.t === "cmd");
  const r = await ask(client, 9, "menu");
  assert.equal(r.ok === false && r.code, "timeout");
  const cmd = await cmdPromise;
  ext.send({ t: "reply", id: cmd.id, ok: true, result: { late: true } });
  await client.quiet();
  assert.equal(client.seen.filter(f => f.t === "reply").length, 0);
});

test("a browser that disconnects mid-command refuses the command instead of hanging", async () => {
  const h = await hub({ timeoutMs: 5_000 });
  const ext = await readyTab(h.port, 1);
  const client = await fakeClient(h.port);
  await tabsCount(client, 1);
  client.send({ t: "cmd", id: 3, name: "menu", args: {} });
  await ext.take(f => f.t === "cmd");
  ext.close();
  const r = await client.take<ClientReply>(f => f.t === "reply");
  assert.equal(r.ok === false && r.code, "no-tab");
});

// -------------------------------------------------------------------- §7.5 grant

test("claim takes the grant and a second client's claim is contended until the holder's socket closes (§7.5)", async () => {
  const h = await hub();
  await readyTab(h.port, 1);
  const a = await fakeClient(h.port);
  const b = await fakeClient(h.port);
  a.send({ t: "claim" });
  assert.deepEqual(await a.take(f => f.t === "claimed"), { t: "claimed", ok: true });
  // The holder's own re-claim is still ok: the grant is the connection's.
  a.send({ t: "claim" });
  assert.deepEqual(await a.take(f => f.t === "claimed"), { t: "claimed", ok: true });
  b.send({ t: "claim" });
  assert.deepEqual(await b.take(f => f.t === "claimed"), { t: "claimed", ok: false, code: "contended" });
  assert.equal((await state(b)).driver, "other");

  a.close();
  for (let i = 0; i < 50 && (await state(b)).driver !== null; i++) await b.quiet(20);
  b.send({ t: "claim" });
  assert.deepEqual(await b.take(f => f.t === "claimed"), { t: "claimed", ok: true });
  assert.equal((await state(b)).driver, "you");
});

test("the first act claims implicitly, and another client's act is refused contended (§7.5)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 1);
  const a = await fakeClient(h.port);
  const b = await fakeClient(h.port);
  await tabsCount(a, 1);

  a.send({ t: "cmd", id: 1, name: "press", args: { button: 0, fine: "x" } });
  await ext.take(f => f.t === "cmd");
  assert.equal((await state(a)).driver, "you");

  const refused = await ask(b, 1, "press", { button: 0, fine: "x" });
  assert.equal(refused.ok === false && refused.code, "contended");
  // A read never needs the grant.
  b.send({ t: "cmd", id: 2, name: "menu", args: {} });
  await ext.take(f => f.t === "cmd" && (f as { name: string }).name === "menu");
});

test("a pumping probe needs the grant and never takes it (§7.5, §10.3)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 1);
  const a = await fakeClient(h.port);
  const b = await fakeClient(h.port);
  await tabsCount(a, 1);

  const notDriver = await ask(a, 1, "probe", { pump: true });
  assert.equal(notDriver.ok === false && notDriver.code, "not-driver");
  assert.equal((await state(a)).driver, null, "a pumping probe must not claim");

  a.send({ t: "claim" });
  await a.take(f => f.t === "claimed");
  a.send({ t: "cmd", id: 2, name: "probe", args: { pump: true } });
  await ext.take(f => f.t === "cmd");
  // The gate is the grant, not the command: the other client's plain probe still goes through.
  b.send({ t: "cmd", id: 3, name: "probe", args: {} });
  await ext.take(f => f.t === "cmd");
});

// --------------------------------------------------------------------- §7.5 tabs

test("a tab counts only once it is ready and its browser has consent (§7.5, §8.4)", async () => {
  const h = await hub();
  const ext = await fakeExtension(h.port, { target: "firefox", consent: false });
  const client = await fakeClient(h.port);
  ext.send({ t: "tab", tab: 4, state: "ready", title: "PokéRogue" });
  await tabsCount(client, 1);
  const waiting = await ask(client, 1, "menu");
  assert.equal(waiting.ok === false && waiting.code, "no-tab", "a tab without consent is not counted");

  ext.send({ t: "consent", consent: true });
  client.send({ t: "cmd", id: 2, name: "menu", args: {} });
  await ext.take(f => f.t === "cmd");
});

test("a wrong-world tab is not counted, and a gone tab leaves the list (§9.3, §9.4)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 1);
  const client = await fakeClient(h.port);
  await tabsCount(client, 1);

  ext.send({ t: "tab", tab: 1, state: "wrong-world", title: "PokéRogue" });
  for (let i = 0; i < 50; i++) {
    const s = await state(client);
    if (s.tabs[0]?.state === "wrong-world") break;
    await client.quiet(20);
  }
  const r = await ask(client, 1, "menu");
  assert.equal(r.ok === false && r.code, "no-tab");

  ext.send({ t: "tab", tab: 1, state: "gone", title: "PokéRogue" });
  await tabsCount(client, 0);
});

test("state names every connected extension, its command list and who is driving (§7.6)", async () => {
  const h = await hub();
  await readyTab(h.port, 12, { target: "firefox", version: "1.3.0", commands: ["probe", "menu"] });
  const client = await fakeClient(h.port);
  const s = await tabsCount(client, 1).then(() => state(client));
  assert.deepEqual(s.extensions.map(e => ({ target: e.target, version: e.version, flavour: e.flavour, protocol: e.protocol, consent: e.consent, commands: e.commands })), [
    { target: "firefox", version: "1.3.0", flavour: "store", protocol: PROTOCOL, consent: true, commands: ["probe", "menu"] },
  ]);
  assert.deepEqual(s.tabs, [{ conn: s.extensions[0].conn, tab: 12, target: "firefox", title: "PokéRogue", state: "ready" }]);
  assert.equal(s.driver, null);
});

// ------------------------------------------------------------------- §7.5 events

test("events fan out to subscribers only, and an unsubscribed client hears nothing (§7.5)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 1);
  const sub = await fakeClient(h.port);
  const quiet = await fakeClient(h.port);
  await tabsCount(sub, 1);
  sub.send({ t: "subscribe" });
  await sub.quiet(50);

  ext.send({ t: "event", tab: 1, kind: "card", body: { text: "go" } });
  assert.deepEqual(await sub.take(f => f.t === "event"), { t: "event", kind: "card", body: { text: "go" } });
  assert.deepEqual(quiet.seen.filter(f => f.t === "event"), []);
});

test("a client that subscribes into an already-split tab count hears the notice too (§7.5)", async () => {
  const h = await hub();
  await readyTab(h.port, 1, { target: "chrome" });
  await readyTab(h.port, 2, { target: "firefox" });
  const late = await fakeClient(h.port);
  await tabsCount(late, 2);

  late.send({ t: "subscribe" });
  const notice = await late.take<{ t: "notice"; kind: string; tabs: TabInfo[] }>(f => f.t === "notice");
  assert.equal(notice.kind, "tabs", "otherwise it would wait for events the hub is not forwarding");
  assert.equal(notice.tabs.length, 2);
});

test("with more than one tab the hub forwards no events and notices once, then resumes at one (§7.5)", async () => {
  const h = await hub();
  const first = await readyTab(h.port, 1, { target: "chrome" });
  const sub = await fakeClient(h.port);
  await tabsCount(sub, 1);
  sub.send({ t: "subscribe" });
  await sub.quiet(50);

  const second = await readyTab(h.port, 2, { target: "firefox" });
  const notice = await sub.take<{ t: "notice"; kind: string; tabs: TabInfo[] }>(f => f.t === "notice");
  assert.equal(notice.kind, "tabs");
  assert.equal(notice.tabs.length, 2);

  first.send({ t: "event", tab: 1, kind: "card", body: { text: "dropped" } });
  await sub.quiet();
  assert.deepEqual(sub.seen.filter(f => f.t === "event"), [], "no events while the hub cannot tell which save they are about");
  assert.equal(sub.seen.filter(f => f.t === "notice").length, 0, "one notice per transition, not one per tab frame");

  second.send({ t: "tab", tab: 2, state: "gone", title: "PokéRogue" });
  const resume = await sub.take<{ t: "notice"; kind: string }>(f => f.t === "notice");
  assert.equal(resume.kind, "resume");
  first.send({ t: "event", tab: 1, kind: "card", body: { text: "back" } });
  assert.deepEqual(await sub.take(f => f.t === "event"), { t: "event", kind: "card", body: { text: "back" } });
});

// ----------------------------------------------------------------- §7.2 lifecycle

test("a second hub on the same port gets EADDRINUSE, which is the first one's win (§7.2)", async () => {
  const h = await hub();
  await assert.rejects(startHub({ port: h.port, version: "1.0.0" }), (e: NodeJS.ErrnoException) => e.code === "EADDRINUSE");
});

test("retire closes every connection and calls for the exit (§7.3)", async () => {
  let retired = 0;
  const h = await hub({ onRetire: () => retired++ });
  const ext = await readyTab(h.port, 1);
  const client = await fakeClient(h.port);
  const closed = new Promise<void>(r => ext.ws.once("close", () => r()));
  client.send({ t: "retire" });
  await closed;
  assert.equal(retired, 1);
});

test("the hub exits after its idle window with no clients and no counted tabs (§7.2)", async () => {
  let idle = 0;
  const h = await hub({ idleMs: 40, onIdle: () => idle++ });
  // An extension connection without a counted tab does not keep the hub alive.
  await fakeExtension(h.port);
  for (let i = 0; i < 50 && idle === 0; i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(idle > 0, "an idle hub with no counted tab must exit");
  h.close();
});

test("a client, or a counted tab, keeps the hub alive (§7.2)", async () => {
  let idle = 0;
  const h = await hub({ idleMs: 40, onIdle: () => idle++ });
  await readyTab(h.port, 1);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(idle, 0);
});
