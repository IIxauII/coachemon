/**
 * The hub link against a live hub and a fake browser (§12.1): a `GameLink` whose commands cross a real socket. What is
 * being checked is what the link adds over the wire — the pump gate, the fleet it reports, the diagnostics it now has
 * to ask the page for, and the two things the CDP transport did that the hub does differently.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Button, NAMES } from "../enums/generated.ts";
import { isFault } from "../game/link.ts";
import { FakeExtension, delivered } from "./fake-extension.ts";
import { Hub } from "./hub.ts";
import { HubLink } from "./link.ts";

const open: { close: () => unknown }[] = [];

after(async () => {
  for (const o of open.reverse()) await o.close();
});

/** A hub, a browser with one ready tab, and a link pointed at them. */
async function linked(opts: Parameters<typeof FakeExtension.connect>[1] = {}) {
  const hub = await Hub.listen({ port: 0, version: "1.0.0", onRetire: () => {}, onIdle: () => {} });
  open.push(hub);
  const ext = await FakeExtension.connect(hub.port, opts);
  open.push(ext);
  ext.tab(1);
  const link = new HubLink({ port: hub.port, version: "1.0.0", names: NAMES.Button, spawnHub: false });
  open.push(link);
  await delivered();
  return { hub, ext, link };
}

const READY = { ready: true, settled: true, fine: "f1", frame: 5, pumped: false, errorAt: null, mode: 2, disc: {} };

test("a command crosses the hub and comes back as the page's own result", async () => {
  const { ext, link } = await linked();
  ext.answers(cmd => (cmd.name === "menu" ? { readable: true, mode: 2, options: [{ label: "Fight" }] } : READY));
  const menu = await link.menu();
  assert.ok(!isFault(menu) && "options" in menu, JSON.stringify(menu));
  assert.deepEqual(ext.received.map(c => c.name), ["menu"]);
});

test("a hub refusal is a fault carrying its code, never a throw (§7.6)", async () => {
  const { link } = await linked({ commands: ["probe"] });
  const r = await link.menu();
  assert.ok(isFault(r));
  assert.equal(r.fault, "missing-command");
});

test("only the driver's settles pump: the link asks for it once it holds the grant, and not before (§10.3)", async () => {
  const { ext, link } = await linked();
  ext.answers(() => READY);
  await link.probe({});
  assert.equal(ext.received.at(-1)!.args.pump, false);
  assert.equal(await link.claim(), true);
  await link.probe({});
  assert.equal(ext.received.at(-1)!.args.pump, true);
});

test("the fleet is one state frame: who is connected, who is driving, and which rung stands in the way (§12.3)", async () => {
  const { link } = await linked({ target: "firefox", consent: false });
  const waiting = await link.fleet();
  assert.equal(waiting.reach?.rung, 5);
  assert.deepEqual(waiting.browsers.map(b => b.target), ["firefox"]);
  assert.equal(waiting.driver, null);
  assert.equal(waiting.skew, null);
});

test("the link offers what the browser's hello listed, so the server knows what it can send (§10.1)", async () => {
  const { link } = await linked({ commands: ["probe", "menu", "press"] });
  await link.fleet();
  assert.deepEqual([...link.commands].sort(), ["menu", "press", "probe"]);
});

test("attach is a reachability check, not a launch: the server never starts a browser (§12.2)", async () => {
  const { ext, link } = await linked();
  assert.deepEqual(await link.attach(), { attached: true, launchedChrome: false });
  ext.tab(1, "gone");
  await delivered();
  assert.deepEqual(await link.attach(), { attached: false, launchedChrome: false });
});

test("the raw-key rung sends the key command on the fine the last probe saw (§10.4, §10.2)", async () => {
  const { ext, link } = await linked();
  ext.answers(() => READY);
  await link.probe({});
  assert.equal(await link.rawKey(Button.UP), true);
  assert.deepEqual(ext.received.at(-1)!.args, { button: "UP", fine: "f1" });
  // A button with no keyboard equivalent sends nothing at all.
  const sent = ext.received.length;
  assert.equal(await link.rawKey(Button.CYCLE_SHINY), false);
  assert.equal(ext.received.length, sent);
});

test("the console tail is a probe asking for it, and the page's errorAt reaches onRejection (§12.4)", async () => {
  const { ext, link } = await linked();
  const seen: number[] = [];
  link.onRejection(t => seen.push(t));
  ext.answers(cmd => ({ ...READY, errorAt: 1700, ...(cmd.args.tail ? { console: [{ t: "12:00", level: "error", text: "boom" }] } : {}) }));
  await link.probe({});
  assert.deepEqual(seen, [1700]);
  assert.deepEqual(await link.consoleTail(), [{ t: "12:00", level: "error", text: "boom" }]);
  assert.equal(ext.received.at(-1)!.args.tail, true);
  // The same error twice is one rejection: only a newer one is news.
  await link.probe({});
  assert.deepEqual(seen, [1700]);
});

test("a store build has no screenshot, and the error says what to read instead (§12.2)", async () => {
  const { link } = await linked();
  await assert.rejects(link.screenshot(), /screenshot needs a dev build of Coachemon/);
});

test("a dev build's screenshot comes back as the page's PNG (§10.6)", async () => {
  const { ext, link } = await linked({ flavour: "dev", commands: ["probe", "screenshot"] });
  ext.answers(() => ({ ok: true, png: "iVBOR" }));
  assert.equal(await link.screenshot(), "iVBOR");
});

test("with no hub answering, every command is a fault carrying the ladder's line rather than a hang", async () => {
  const link = new HubLink({ port: 1, version: "1.0.0", names: NAMES.Button, spawnHub: false });
  open.push(link);
  const fleet = await link.fleet();
  assert.equal(fleet.reach?.rung, 2);
  const r = await link.menu();
  assert.ok(isFault(r));
  assert.equal(r.message, fleet.reach!.line);
});
