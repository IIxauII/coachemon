/**
 * The dev-only table (§10.6). The guard proves these names never reach a store artifact; this proves they do what the
 * dev loop and `scripts/eval.ts` need of them.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEV_PAGE_HANDLERS, SCREENSHOT_CHUNK, devCommands, type DevApi, type ScreenshotPart } from "../src/dev/commands.ts";
import { reinject } from "../src/dev/reinject.ts";
import { interesting } from "../src/dev/watch.ts";
import { disc } from "../../src/page/disc.ts";
import { dispatch } from "../../src/page/dispatch.ts";
import { fine } from "../../src/page/fine.ts";
import { locate } from "../../src/page/locate.ts";
import { PAGE_MODES } from "../../src/page/modes.ts";
import { offPage, onPage } from "../../src/page/fake-page.ts";
import type { ExtensionCmd } from "../../src/protocol/wire.ts";
import type { RelayReply } from "../src/messages.ts";

const run = (source: string): any =>
  dispatch(locate, fine, disc, DEV_PAGE_HANDLERS.eval!.run, "eval", "read", PAGE_MODES, { source });

const cmd = (name: string, args: Record<string, unknown> = {}): ExtensionCmd => ({ t: "cmd", id: 7, tab: 3, name, args });

const result = async (answer: Promise<RelayReply> | null): Promise<any> => {
  assert.ok(answer, "the background did not answer this command");
  const reply = await answer;
  assert.equal(reply.ok, true);
  return (reply as { result: unknown }).result;
};

// ------------------------------------------------------------------- eval

test("eval runs a body after the locator, with the scene in scope", t => {
  onPage(t, { arena: { biomeType: 4 }, ui: { mode: 2 } });
  assert.deepEqual(run("return { biome: scene.arena.biomeType, mode: ui.mode }"), { biome: 4, mode: 2 });
});

test("eval off the game refuses with the locator's reason, like any other read", t => {
  offPage(t);
  assert.deepEqual(run("return 1"), { ok: false, why: "no-phaser" });
});

test("a body that throws comes back named, not as a relay `threw`", t => {
  onPage(t, { ui: {} });
  assert.deepEqual(run("throw new Error('nope')"), { ok: false, why: "threw", message: "nope" });
});

test("a value the reply cannot carry refuses here rather than at the channel", t => {
  onPage(t, { ui: {} });
  const r = run("const a = {}; a.self = a; return a");
  assert.equal(r.ok, false);
  assert.equal(r.why, "threw");
});

test("a body with no return answers null, which is a value the channel can carry", t => {
  onPage(t, { ui: {} });
  assert.equal(run("1 + 1"), null);
});

// ------------------------------------------------------------- screenshot

/** A capture of `size` base64 characters, plus the data URL prefix the browser puts in front of it. */
function capture(size: number): { api: DevApi; calls: () => number; body: string } {
  let calls = 0;
  const body = "a".repeat(size);
  return {
    body,
    calls: () => calls,
    api: { capture: async () => (calls++, `data:image/png;base64,${body}`), reload: () => {}, soon: fn => fn() },
  };
}

test("a capture that fits in one frame comes back whole, prefix stripped", async () => {
  const c = capture(10);
  const dev = devCommands(c.api);
  const part = (await result(dev(cmd("screenshot")))) as ScreenshotPart;
  assert.deepEqual(part, { ok: true, id: 1, part: 0, parts: 1, png: c.body });
});

test("a capture over the frame cap crosses in parts, and only part 0 captures (§10.6)", async () => {
  const c = capture(SCREENSHOT_CHUNK * 2 + 5);
  const dev = devCommands(c.api);
  const first = (await result(dev(cmd("screenshot")))) as ScreenshotPart & { ok: true };
  assert.equal(first.parts, 3);
  assert.equal(first.png.length, SCREENSHOT_CHUNK);
  let png = first.png;
  for (let part = 1; part < first.parts; part++) {
    const next = (await result(dev(cmd("screenshot", { id: first.id, part })))) as ScreenshotPart & { ok: true };
    assert.equal(next.part, part);
    png += next.png;
  }
  assert.equal(png, c.body);
  assert.equal(c.calls(), 1, "a later part re-captured the tab");
});

test("a part of a capture that has been replaced expires rather than mixing two images", async () => {
  const c = capture(SCREENSHOT_CHUNK + 1);
  const dev = devCommands(c.api);
  const first = (await result(dev(cmd("screenshot")))) as ScreenshotPart & { ok: true };
  await result(dev(cmd("screenshot")));
  assert.deepEqual(await result(dev(cmd("screenshot", { id: first.id, part: 1 }))), { ok: false, why: "expired" });
});

test("a part past the end of the capture expires", async () => {
  const dev = devCommands(capture(10).api);
  const first = (await result(dev(cmd("screenshot")))) as ScreenshotPart & { ok: true };
  assert.deepEqual(await result(dev(cmd("screenshot", { id: first.id, part: 4 }))), { ok: false, why: "expired" });
});

test("a capture the browser refuses is named, not thrown at the transport", async () => {
  const dev = devCommands({ capture: () => Promise.reject(new Error("no activeTab")), reload: () => {}, soon: fn => fn() });
  assert.deepEqual(await result(dev(cmd("screenshot"))), { ok: false, why: "threw", message: "no activeTab" });
});

test("the capture is of the window the game tab is in", async () => {
  const seen: number[] = [];
  const dev = devCommands({ capture: async tab => (seen.push(tab), "data:image/png;base64,x"), reload: () => {}, soon: fn => fn() });
  await result(dev(cmd("screenshot")));
  assert.deepEqual(seen, [3]);
});

// ----------------------------------------------------------------- reload

test("reload answers before it reloads: the reply goes out on the socket the reload takes", async () => {
  const order: string[] = [];
  let fire: (() => void) | null = null;
  const dev = devCommands({
    capture: async () => "",
    reload: () => order.push("reload"),
    soon: fn => {
      fire = fn;
    },
  });
  const answer = dev(cmd("reload"));
  assert.deepEqual(await result(answer), { ok: true });
  order.push("reply");
  assert.ok(fire, "the reload was never deferred");
  (fire as unknown as () => void)();
  assert.deepEqual(order, ["reply", "reload"]);
});

test("a store command is not the background's to answer", () => {
  const dev = devCommands(capture(1).api);
  assert.equal(dev(cmd("probe")), null);
  assert.equal(dev(cmd("press", { button: 0, fine: "x" })), null);
});

// -------------------------------------------------------------- reinject

test("a reloaded dev build puts both worlds' scripts back into every game tab (§5.4)", async () => {
  const done: string[] = [];
  await reinject({
    gameTabs: async () => [11, 22],
    inject: async (tab, files, world) => done.push(`${tab}:${world}:${files.join(",")}`),
  });
  assert.deepEqual(done, [
    "11:ISOLATED:relay.js",
    "11:MAIN:page.js,hud.js",
    "22:ISOLATED:relay.js",
    "22:MAIN:page.js,hud.js",
  ]);
});

test("a tab the browser will not script does not take the others down with it", async () => {
  const done: number[] = [];
  await reinject({
    gameTabs: async () => [11, 22],
    inject: async tab => {
      if (tab === 11) throw new Error("cannot access");
      done.push(tab);
    },
  });
  assert.deepEqual(done, [22, 22]);
});

test("no tabs to query is no re-injection, not a failure", async () => {
  await reinject({ gameTabs: () => Promise.reject(new Error("no tabs permission")), inject: async () => assert.fail("injected with no tabs") });
});

// ----------------------------------------------------------- the dev loop

test("the watcher rebuilds for what the build reads (§5.4)", () => {
  for (const path of [
    "src/page/probe.ts",
    "src/protocol/commands.ts",
    "extension/entrypoints/background.ts",
    "extension/wxt.config.ts",
    "skills/coach-pokerogue/scripts/hud/05-randbats.js",
    "extension/package.json",
  ]) {
    assert.ok(interesting(path), `${path} should rebuild`);
  }
});

test("the watcher never rebuilds for its own output, or a build would never stop (§5.4)", () => {
  for (const path of [
    "extension/.output/chrome-mv3-dev/page.js",
    "extension/.wxt/wxt.d.ts",
    "extension/node_modules/wxt/dist/index.js",
    "src/page/.probe.ts.swp",
    "src/page/probe.ts~",
    "docs/spec/extension-distribution.md",
    "src/page",
  ]) {
    assert.ok(!interesting(path), `${path} should not rebuild`);
  }
});
