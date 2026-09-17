/**
 * The hub against a fake extension client (§7): a real listener, a real upgrade, real frames. Nothing here reaches
 * into the hub's internals, because the extension package will not be able to either.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import WebSocket from "ws";
import { COMMAND_NAMES } from "../protocol/commands.ts";
import { PRODUCT, PROTOCOL } from "../protocol/version.ts";
import type { Notice } from "../protocol/wire.ts";
import { dial, HubClient } from "./client.ts";
import { FakeExtension, delivered } from "./fake-extension.ts";
import { Hub } from "./hub.ts";

const open: (Hub | HubClient | FakeExtension)[] = [];

after(async () => {
  for (const o of open.reverse()) await o.close();
});

async function hub(opts: Partial<Parameters<typeof Hub.listen>[0]> = {}) {
  const h = await Hub.listen({ port: 0, version: "1.0.0", onRetire: () => {}, onIdle: () => {}, ...opts });
  open.push(h);
  return h;
}

/** A local client: `ws` sends no `Origin`, which is what tells the hub a client from a browser (§7.4). */
async function client(h: Hub) {
  const d = await dial({ port: h.port, version: "1.0.0", role: "server", spawnHub: false });
  assert.ok(d.ok, JSON.stringify(d));
  open.push(d.client);
  return d.client;
}

async function extension(h: Hub, opts: Parameters<typeof FakeExtension.connect>[1] = {}) {
  const e = await FakeExtension.connect(h.port, opts);
  open.push(e);
  return e;
}

/** A browser with one ready tab: the only shape in which the hub routes anything. */
async function paired(opts: Parameters<typeof FakeExtension.connect>[1] = {}) {
  const h = await hub();
  const ext = await extension(h, opts);
  ext.tab(1);
  const c = await client(h);
  await delivered();
  return { h, ext, c };
}

// ------------------------------------------------------------------- §7.4 auth

test("the upgrade needs an exact Host: a rebinding page's own hostname gets 403 before any frame (§7.4)", async () => {
  const h = await hub();
  const code = await upgradeStatus(h.port, { host: "game.example.com", origin: undefined });
  assert.equal(code, 403);
});

test("an Origin that is not an extension scheme gets 403; no Origin is a local client (§7.4)", async () => {
  const h = await hub();
  assert.equal(await upgradeStatus(h.port, { origin: "https://pokerogue.net" }), 403);
  assert.equal(await upgradeStatus(h.port, { origin: "moz-extension://whatever" }), 101);
  assert.equal(await upgradeStatus(h.port, { origin: "safari-web-extension://whatever" }), 101);
  assert.equal(await upgradeStatus(h.port, { origin: undefined }), 101);
});

test("the hub proves itself first: the welcome carries the product marker, so a squatter gets nothing (§7.4)", async () => {
  const h = await hub();
  const ext = await extension(h, { hello: false });
  await delivered();
  assert.deepEqual(ext.welcome, { t: "welcome", product: PRODUCT, protocol: PROTOCOL, version: "1.0.0" });
});

// ------------------------------------------------------------ §7.5 tabs, state

test("a tab counts only once its relay says ready and its browser has consent (§7.5)", async () => {
  const h = await hub();
  const ext = await extension(h, { target: "firefox", consent: false });
  const c = await client(h);
  ext.tab(1);
  await delivered();
  assert.equal((await c.state()).tabs.filter(t => t.state === "ready").length, 1);
  // The hub still refuses to route: the tab is reported, but its browser has no consent yet.
  assert.equal((await c.send("menu", {})).ok, false);
  ext.consent(true);
  await delivered();
  assert.equal((await c.send("menu", {})).ok, true);
});

test("tabs are counted across browsers, and a closed browser takes its tabs with it (§7.5)", async () => {
  const h = await hub();
  const chrome = await extension(h);
  const firefox = await extension(h, { target: "firefox" });
  const c = await client(h);
  chrome.tab(1);
  firefox.tab(7);
  await delivered();
  const two = await c.send("menu", {});
  assert.equal(two.ok, false);
  assert.equal(two.ok === false && two.code, "tabs");
  assert.deepEqual(two.ok === false && two.tabs?.map(t => t.target), ["chrome", "firefox"]);
  await firefox.close();
  await delivered();
  assert.equal((await c.send("menu", {})).ok, true);
});

test("state names every browser with its command list, and who is driving, from the asker's side (§7.6)", async () => {
  const { h, c } = await paired({ version: "1.2.0", flavour: "dev" });
  const other = await client(h);
  assert.equal(await c.claim(), true);
  const mine = await c.state();
  assert.deepEqual(mine.extensions.map(e => [e.target, e.version, e.flavour, e.protocol, e.consent]), [["chrome", "1.2.0", "dev", PROTOCOL, true]]);
  assert.ok(mine.extensions[0]!.commands.includes("cursor.learn"));
  assert.equal(mine.driver, "you");
  assert.equal((await other.state()).driver, "other");
});

// ----------------------------------------------------------------- §7.5 grant

test("the first act claims the grant implicitly, and a second client's act is contended (§7.5)", async () => {
  const { h, c } = await paired();
  const other = await client(h);
  assert.equal((await c.send("press", { button: 0, fine: "f" })).ok, true);
  const refused = await other.send("press", { button: 0, fine: "f" });
  assert.equal(refused.ok === false && refused.code, "contended");
  // Reads never need the grant.
  assert.equal((await other.send("menu", {})).ok, true);
});

test("claim answers contended rather than taking a held grant, and the grant dies with its socket (§7.5)", async () => {
  const { h, c } = await paired();
  const other = await client(h);
  assert.equal(await c.claim(), true);
  assert.equal(await other.claim(), false);
  c.close();
  await delivered();
  assert.equal(await other.claim(), true);
});

test("a command that refuses for any other reason leaves no grant behind (§7.5)", async () => {
  const h = await hub();
  const ext = await extension(h);
  const c = await client(h);
  const other = await client(h);
  await delivered();
  // No tab: the act refuses `no-tab`, and must not have taken the grant on its way out.
  assert.equal((await c.send("press", { button: 0, fine: "f" })).ok === false, true);
  assert.equal(await other.claim(), true);
  // Nor does a command the browser cannot answer.
  ext.tab(1);
  await delivered();
  const third = await client(h);
  assert.equal((await third.send("nonsense", {})).ok === false, true);
  assert.equal((await other.state()).driver, "you");
});

test("a dev build's own commands never take the grant: only a store act does (§7.5, §10.6)", async () => {
  const { h, ext, c } = await paired({ flavour: "dev", commands: [...COMMAND_NAMES, "screenshot"] });
  ext.answers(() => ({ ok: true, png: "iVBOR" }));
  const other = await client(h);
  assert.equal((await c.send("screenshot", {})).ok, true);
  assert.equal(await other.claim(), true);
});

test("the pump gate: probe { pump: true } refuses not-driver from a client without the grant, and never claims (§7.5)", async () => {
  const { h, c } = await paired();
  const other = await client(h);
  const refused = await other.send("probe", { pump: true });
  assert.equal(refused.ok === false && refused.code, "not-driver");
  // Refusing the pump took no grant: the other client can still claim.
  assert.equal(await c.claim(), true);
  assert.equal((await c.send("probe", { pump: true })).ok, true);
});

// --------------------------------------------------------------- §7.5 routing

test("a command reaches the one ready tab, and its reply carries the page's result back (§7.5)", async () => {
  const { ext, c } = await paired();
  ext.answers(cmd => ({ echoed: cmd.name, tab: cmd.tab, args: cmd.args }));
  const reply = await c.send("snapshot", { detail: "lean" });
  assert.deepEqual(reply.ok && reply.result, { echoed: "snapshot", tab: 1, args: { detail: "lean" } });
  assert.equal(ext.received.length, 1);
});

test("zero tabs refuses no-tab at once, and the hub queues nothing (§7.5)", async () => {
  const h = await hub();
  await extension(h);
  const c = await client(h);
  await delivered();
  const r = await c.send("menu", {});
  assert.equal(r.ok === false && r.code, "no-tab");
});

test("a name outside the store table is unknown-command; a store name the browser did not list is missing-command (§7.6)", async () => {
  const { c } = await paired({ commands: ["probe", "menu"] });
  const unknown = await c.send("eval", { source: "1" });
  assert.equal(unknown.ok === false && unknown.code, "unknown-command");
  const missing = await c.send("press", { button: 0, fine: "f" });
  assert.equal(missing.ok === false && missing.code, "missing-command");
});

test("a dev build gets the dev table's names; a store build never does (§10.6)", async () => {
  const dev = await paired({ flavour: "dev", commands: ["probe", "menu", "eval"] });
  dev.ext.answers(() => ({ value: 42 }));
  assert.deepEqual((await dev.c.send("eval", { source: "6*7" })).ok && dev.ext.received.at(-1)!.name, "eval");
  const store = await paired({ flavour: "store", commands: ["probe", "menu", "eval"] });
  const r = await store.c.send("eval", { source: "6*7" });
  assert.equal(r.ok === false && r.code, "unknown-command");
});

test("a browser outside the protocol window refuses protocol; the window is PROTOCOL and PROTOCOL - 1 (§8.5)", async () => {
  const old = await paired({ protocol: PROTOCOL - 2 });
  const r = await old.c.send("menu", {});
  assert.equal(r.ok === false && r.code, "protocol");
  const previous = await paired({ protocol: PROTOCOL - 1 });
  assert.equal((await previous.c.send("menu", {})).ok, true);
  const future = await paired({ protocol: PROTOCOL + 1 });
  const rf = await future.c.send("menu", {});
  assert.equal(rf.ok === false && rf.code, "protocol");
});

test("a browser that never answers times out rather than hanging the client (§7.6)", async () => {
  const h = await hub({ timeoutMs: 40 });
  const ext = await extension(h);
  ext.tab(1);
  ext.answers(() => null);
  const c = await client(h);
  await delivered();
  const r = await c.send("menu", {});
  assert.equal(r.ok === false && r.code, "timeout");
});

test("a relay's own failure code passes through unchanged (§9.7)", async () => {
  const { ext, c } = await paired();
  ext.answers(() => ({ error: "handler exploded" }));
  const r = await c.send("menu", {});
  assert.equal(r.ok === false && r.code, "threw");
  assert.equal(r.ok === false && r.message, "handler exploded");
});

test("a browser that goes away mid-command answers tab-gone, not silence", async () => {
  const { ext, c } = await paired();
  ext.answers(() => null);
  const pending = c.send("menu", {});
  await delivered();
  await ext.close();
  const r = await pending;
  assert.equal(r.ok === false && r.code, "tab-gone");
});

// ------------------------------------------------------- §7.5 events, notices

test("card events fan out to every subscribed client, and only to subscribers (§7.5)", async () => {
  const { h, ext, c } = await paired();
  const quiet = await client(h);
  const seen: unknown[] = [];
  const unseen: unknown[] = [];
  c.on({ event: (kind, body) => seen.push([kind, body]) });
  quiet.on({ event: (kind, body) => unseen.push([kind, body]) });
  c.subscribe();
  await delivered();
  ext.event(1, "card", { wave: 4 });
  await delivered();
  assert.deepEqual(seen, [["card", { wave: 4 }]]);
  assert.deepEqual(unseen, []);
});

test("with more than one tab the hub forwards no events and notices once, then resumes at one (§7.5)", async () => {
  const { h, ext, c } = await paired();
  const notices: Notice[] = [];
  const events: unknown[] = [];
  c.on({ notice: n => notices.push(n), event: kind => events.push(kind) });
  c.subscribe();
  const second = await extension(h, { target: "firefox" });
  second.tab(9);
  await delivered();
  ext.event(1, "card", { wave: 4 });
  await delivered();
  assert.deepEqual(events, []);
  assert.deepEqual(notices.map(n => n.kind), ["tabs"]);
  await second.close();
  await delivered();
  assert.deepEqual(notices.map(n => n.kind), ["tabs", "resume"]);
  ext.event(1, "card", { wave: 5 });
  await delivered();
  assert.deepEqual(events, ["card"]);
});

test("a client subscribing while the count is already off one is told at once, not at the next crossing (§7.5)", async () => {
  const { h } = await paired();
  const second = await extension(h, { target: "firefox" });
  second.tab(9);
  await delivered();
  const late = await client(h);
  const notices: Notice[] = [];
  late.on({ notice: n => notices.push(n) });
  late.subscribe();
  await delivered();
  assert.deepEqual(notices.map(n => n.kind), ["tabs"]);
});

// -------------------------------------------------------- §7.2, §7.3 lifecycle

test("retire is ignored while a driver holds the grant: the hub rechecks what the client raced on (§7.3)", async () => {
  let retired = 0;
  const h = await hub({ onRetire: () => retired++ });
  const holder = await client(h);
  const newer = await client(h);
  assert.equal(await holder.claim(), true);
  newer.retire();
  await delivered();
  assert.equal(retired, 0);
  assert.equal(newer.open, true);
});

test("retire closes every connection and ends the hub once nobody is driving (§7.3)", async () => {
  let retired = 0;
  const h = await hub({ onRetire: () => retired++ });
  const c = await client(h);
  const ext = await extension(h);
  ext.tab(1);
  await delivered();
  c.retire();
  await delivered();
  assert.equal(retired, 1);
  assert.equal(c.open, false);
});

test("the hub exits once nothing has been connected for the idle window, and a counted tab holds it open (§7.2)", async () => {
  let idled = 0;
  const h = await hub({ idleMs: 30, onIdle: () => idled++ });
  const c = await client(h);
  const ext = await extension(h);
  ext.tab(1);
  await delivered();
  c.close();
  await new Promise(r => setTimeout(r, 60));
  // A browser with a counted tab keeps it alive even with no client connected.
  assert.equal(idled, 0);
  ext.tab(1, "gone");
  await new Promise(r => setTimeout(r, 60));
  assert.equal(idled, 1);
});

test("a second hub on a taken port fails with EADDRINUSE, which is how its client knows one is already up (§7.2)", async () => {
  const h = await hub();
  await assert.rejects(Hub.listen({ port: h.port, version: "1.0.0" }), (e: NodeJS.ErrnoException) => e.code === "EADDRINUSE");
});

// -------------------------------------------------------------------- helpers

/** The status the upgrade got: 101 for a switch, 403 for a refusal. */
function upgradeStatus(port: number, headers: { host?: string; origin?: string | undefined }): Promise<number> {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`, {
      headers: { ...(headers.host ? { host: headers.host } : {}), ...(headers.origin ? { origin: headers.origin } : {}) },
    });
    ws.on("open", () => {
      ws.close();
      resolve(101);
    });
    ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    ws.on("error", () => resolve(0));
  });
}

