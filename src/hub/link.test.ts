import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fakeClient, fakeExtension, Peer, readyTab } from "./fake-ext.ts";
import { HubLink, hubPort } from "./link.ts";
import { Hub, startHub } from "./hub.ts";
import { Button } from "../enums/generated.ts";
import { Refusal } from "../envelope.ts";
import { isFault } from "../game/link.ts";
import { COMMAND_NAMES } from "../protocol/commands.ts";
import { DEV_PORT, PROTOCOL, STORE_PORT } from "../protocol/version.ts";
import type { FromExtension, ToExtension } from "../protocol/wire.ts";

const shut: (() => void)[] = [];

after(() => {
  for (const s of shut) s();
});

type Ext = Peer<ToExtension, FromExtension>;

async function linked(o: { commands?: string[]; flavour?: "store" | "dev"; tab?: number } = {}): Promise<{ hub: Hub; ext: Ext; link: HubLink }> {
  const hub = await startHub({ port: 0, version: "1.0.0", timeoutMs: 400 });
  shut.push(() => hub.close());
  const ext = await readyTab(hub.port, o.tab ?? 1, { commands: o.commands, flavour: o.flavour });
  const link = new HubLink({ port: hub.port, version: "1.0.0" });
  shut.push(() => link.close?.());
  // The first presence both connects the client and settles the tab count.
  for (let i = 0; i < 50; i++) {
    const p = await link.presence();
    if (p.reach === null) return { hub, ext, link };
    await new Promise(r => setTimeout(r, 20));
  }
  assert.fail("the link never reached the fake tab");
}

/** Answers the next command the extension is asked, as the page would. */
async function answer(ext: Ext, result: unknown): Promise<{ name: string; args: Record<string, unknown> }> {
  const cmd = await ext.take<{ t: "cmd"; id: number; name: string; args: Record<string, unknown> }>(f => f.t === "cmd");
  ext.send({ t: "reply", id: cmd.id, ok: true, result });
  return { name: cmd.name, args: cmd.args };
}

test("a command crosses the hub and its result comes back as the page's own (§12.1)", async () => {
  const { ext, link } = await linked();
  const menu = link.menu();
  const sent = await answer(ext, { readable: true, mode: 2, family: "command", options: [], cursor: 0, text: null, extra: {} });
  assert.equal(sent.name, "menu");
  assert.deepEqual(await menu, { readable: true, mode: 2, family: "command", options: [], cursor: 0, text: null, extra: {} });
});

test("a relay refusal becomes a Fault, so LinkGame cannot tell the transports apart (§9.7, §12.1)", async () => {
  const { ext, link } = await linked();
  const menu = link.menu();
  const cmd = await ext.take<{ t: "cmd"; id: number }>(f => f.t === "cmd");
  ext.send({ t: "reply", id: cmd.id, ok: false, code: "no-handler", message: "dispatch returned with no reply" });
  const r = await menu;
  assert.ok(isFault(r) && r.fault === "no-handler", JSON.stringify(r));
});

test("a refusal the hub answers itself is a Fault too, carrying the hub's code (§7.6)", async () => {
  const { link } = await linked({ commands: ["probe", "menu"] });
  const r = await link.starters();
  assert.ok(isFault(r) && r.fault === "missing-command", JSON.stringify(r));
});

test("only the driver pumps, and it pumps every probe once it holds the grant (§10.3)", async () => {
  const { ext, link } = await linked();
  const before = link.probe({});
  assert.deepEqual((await answer(ext, { ready: false, why: "no-phaser", frame: null, domMode: null, pumped: false, errorAt: null })).args, {});
  await before;

  assert.deepEqual(await link.claim(), { ok: true });
  const after = link.probe({});
  assert.deepEqual((await answer(ext, { ready: false, why: "no-phaser", frame: null, domMode: null, pumped: true, errorAt: null })).args, { pump: true });
  await after;
});

test("a contended claim is the tool's refusal, and the link stops pumping (§7.5)", async () => {
  const { hub, ext, link } = await linked();
  const other = await fakeClient(hub.port);
  other.send({ t: "claim" });
  await other.take(f => f.t === "claimed");

  const claim = await link.claim();
  assert.equal(claim.ok, false);
  assert.equal(claim.ok === false && claim.code, "contended");
  const probe = link.probe({});
  assert.deepEqual((await answer(ext, { ready: false, why: "no-phaser", frame: null, domMode: null, pumped: false, errorAt: null })).args, {});
  await probe;
});

test("presence carries the browsers, the tab count and the driver, and the ladder's line when there is one (§12.3)", async () => {
  const { hub, link } = await linked();
  const p = await link.presence();
  assert.deepEqual(p.facts, {
    browsers: [{ target: "chrome", version: "1.0.0", flavour: "store", protocol: PROTOCOL, consent: true }],
    tabs: 1,
    driver: null,
  });

  await link.claim();
  assert.equal((await link.presence()).facts.driver, "you");

  // A second ready tab is rung 8, with the list.
  await readyTab(hub.port, 2, { target: "firefox" });
  for (let i = 0; i < 50 && (await link.presence()).reach === null; i++) await new Promise(r => setTimeout(r, 20));
  const many = await link.presence();
  assert.equal(many.reach?.rung, 8);
  assert.equal(many.reach?.code, "tabs");
  assert.equal(many.facts.tabs, 2);
});

test("a tool's needed command the extension never listed is rung 4, and its command list is the link's (§8.5)", async () => {
  const { link } = await linked({ commands: ["probe", "menu"] });
  assert.deepEqual([...link.commands].sort(), ["menu", "probe"]);
  assert.equal((await link.presence(["probe", "menu"])).reach, null);
  const short = await link.presence(["probe", "starters"]);
  assert.equal(short.reach?.code, "missing_command");
  assert.equal(short.reach?.rung, 4);
});

test("the command list is the routed extension's, not what two browsers happen to share (§7.5, §10.1)", async () => {
  const { hub, link } = await linked({ commands: ["probe", "menu", "starters"] });
  // A second browser with a poorer table, and no ready tab: it is not where commands go, so it takes nothing away.
  const other = await fakeExtension(hub.port, { target: "firefox", commands: ["probe"] });
  other.send({ t: "tab", tab: 9, state: "gone", title: "PokéRogue" });
  for (let i = 0; i < 50 && (await link.presence()).reach !== null; i++) await new Promise(r => setTimeout(r, 20));
  assert.deepEqual([...link.commands].sort(), ["menu", "probe", "starters"]);
});

test("the raw-key rung goes out as the key command, on the fingerprint it was decided on (§10.4)", async () => {
  const { ext, link } = await linked();
  const sent = link.rawKey(Button.UP, "fp-7");
  assert.deepEqual(await answer(ext, { ok: true }), { name: "key", args: { button: "UP", fine: "fp-7" } });
  assert.equal(await sent, true);
  // A button with no keyboard equivalent sends nothing at all.
  assert.equal(await link.rawKey(Button.CYCLE_SHINY, "fp-7"), false);
});

test("the console tail is one probe asking for it, and every probe carries the page's latest error (§12.4)", async () => {
  const { ext, link } = await linked();
  const seen: number[] = [];
  link.onRejection(t => seen.push(t));

  const tail = link.tail();
  const sent = await answer(ext, { ready: false, why: "no-phaser", frame: null, domMode: null, pumped: false, errorAt: 1234, console: [{ t: "t", level: "error", text: "boom" }] });
  assert.equal(sent.args.tail, true);
  assert.deepEqual(await tail, [{ t: "t", level: "error", text: "boom" }]);
  assert.deepEqual(seen, [1234], "a newer errorAt is the hang watch's corroboration");

  // The same error twice is one rejection, not two.
  const again = link.probe({});
  await answer(ext, { ready: false, why: "no-phaser", frame: null, domMode: null, pumped: false, errorAt: 1234 });
  await again;
  assert.deepEqual(seen, [1234]);
});

test("screenshot against a store build says what to use instead (§12.2)", async () => {
  const { link } = await linked();
  await assert.rejects(link.screenshot(), (e: Refusal) => e.code === "unavailable" && /dev build of Coachemon/.test(e.message));
});

test("screenshot works against a dev build, which registered it (§10.6)", async () => {
  const { ext, link } = await linked({ flavour: "dev", commands: [...COMMAND_NAMES, "screenshot"] });
  const png = link.screenshot();
  const asked = await answer(ext, { ok: true, id: 1, part: 0, parts: 1, png: "iVBOR" });
  assert.deepEqual(asked.args, {}, "the first call names no capture: there is none yet");
  assert.equal(await png, "iVBOR");
});

test("a capture too large for one frame is asked for part by part, all from the one capture (§10.6)", async () => {
  const { ext, link } = await linked({ flavour: "dev", commands: [...COMMAND_NAMES, "screenshot"] });
  const png = link.screenshot();
  await answer(ext, { ok: true, id: 4, part: 0, parts: 3, png: "iVB" });
  assert.deepEqual((await answer(ext, { ok: true, id: 4, part: 1, parts: 3, png: "OR0" })).args, { id: 4, part: 1 });
  assert.deepEqual((await answer(ext, { ok: true, id: 4, part: 2, parts: 3, png: "KGg" })).args, { id: 4, part: 2 });
  assert.equal(await png, "iVBOR0KGg");
});

test("a capture that expired under us is `unavailable`, not half an image (§10.6)", async () => {
  const { ext, link } = await linked({ flavour: "dev", commands: [...COMMAND_NAMES, "screenshot"] });
  const png = link.screenshot();
  await answer(ext, { ok: true, id: 4, part: 0, parts: 2, png: "iVB" });
  await answer(ext, { ok: false, why: "expired" });
  await assert.rejects(png, (e: Refusal) => e.code === "unavailable" && e.detail.why === "expired");
});

test("an unreachable hub is a reach, not a throw: every tool refuses with the rung's line (§12.3)", async () => {
  const link = new HubLink({ port: 1, version: "1.0.0", spawnHub: () => ({ pid: null, stderr: () => "spawn failed", exited: Promise.resolve(1), release: () => {} }), portHolder: () => ({ process: null, pid: null }) });
  const p = await link.presence();
  assert.equal(p.reach?.rung, 2);
  assert.deepEqual(p.facts, { browsers: [], tabs: 0, driver: null });
  const r = await link.menu();
  assert.ok(isFault(r), JSON.stringify(r));
});

test("a browser that has not consented yet keeps the link on rung 5 (§8.4)", async () => {
  const hub = await startHub({ port: 0, version: "1.0.0" });
  shut.push(() => hub.close());
  const ext = await fakeExtension(hub.port, { target: "firefox", consent: false });
  ext.send({ t: "tab", tab: 1, state: "ready", title: "PokéRogue" });
  const link = new HubLink({ port: hub.port, version: "1.0.0" });
  for (let i = 0; i < 50 && (await link.presence()).reach === null; i++) await new Promise(r => setTimeout(r, 20));
  assert.equal((await link.presence()).reach?.rung, 5);
});

test("the dev checkout reaches the dev hub's port, and everything else the store one (§7.2, §12.1)", () => {
  assert.equal(hubPort({} as NodeJS.ProcessEnv), STORE_PORT);
  assert.equal(hubPort({ COACHEMON_DEV: "1" } as unknown as NodeJS.ProcessEnv), DEV_PORT);
  assert.equal(hubPort({ COACHEMON_DEV: "0" } as unknown as NodeJS.ProcessEnv), STORE_PORT);
});
