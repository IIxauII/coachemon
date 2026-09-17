import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { Button } from "../enums/generated.ts";
import { CdpLink, type LinkSession } from "./link.ts";
import type { Thrown } from "./session.ts";

/** A session that evaluates each expression in a fresh context holding only a fake game, the way a real tab has no server modules. */
function tabSession(scene: Record<string, unknown>) {
  const sent: string[] = [];
  const keys: string[] = [];
  let ensured = 0;
  const session: LinkSession = {
    attached: true,
    launchedChrome: false,
    onException: null,
    ensure: async () => { ensured++; },
    evaluate: async <T>(expr: string) => {
      sent.push(expr);
      const game = { isBooted: true, isRunning: true, scene: { getScene: () => scene }, loop: { frame: 5 } };
      const context = { Phaser: { Display: { Canvas: { CanvasPool: { pool: [{ parent: { game } }] } } } }, document: { getElementById: () => null } };
      try {
        // `returnByValue`: the tab's answer arrives as JSON.
        return JSON.parse(JSON.stringify(vm.runInNewContext(expr, context)) ?? "null") as T;
      } catch (e) {
        return { __throw: String((e as Error).message) } as Thrown;
      }
    },
    keepAlive: async () => {},
    rawKey: async key => { keys.push(key); },
    screenshot: async () => "png",
    consoleTail: () => [{ t: "t", level: "error", text: "x" }],
  };
  return { session, sent, keys, ensured: () => ensured };
}

/** A COMMAND screen that records the buttons reaching `processInput`. */
function commandScene(inputs: number[]) {
  return {
    ui: {
      mode: 2,
      handlers: {
        2: { active: true, cursor: 0, commandsContainer: { list: [{ text: "Fight" }, { text: "Ball" }] } },
        10: { cursor: 0, scrollCursor: 0, filteredStarterContainers: [], starterSpecies: [] },
      },
      processInput: (b: number) => inputs.push(b),
    },
    phaseManager: { currentPhase: { phaseName: "CommandPhase" } },
    currentBattle: { waveIndex: 4, turn: 1 },
  };
}

test("every command runs self-contained in the tab: nothing it needs is left behind in the server (§10.5)", async () => {
  const inputs: number[] = [];
  const link = new CdpLink(tabSession(commandScene(inputs)).session);
  const probe = await link.probe({});
  assert.ok(!("fault" in probe) && probe.ready, JSON.stringify(probe));
  const fine = probe.fine;
  const replies = {
    menu: await link.menu(),
    snapshot: await link.snapshot({ detail: "full" }),
    starters: await link.starters(),
    card: await link.card(),
    press: await link.press({ button: Button.DOWN, fine }),
    "cursor.option": await link.cursorOption({ index: 0, fine: "stale" }),
    "cursor.shop": await link.cursorShop({ row: 1, col: 0, fine: "stale" }),
    "cursor.starter": await link.cursorStarter({ index: 0, fine: "stale" }),
    "cursor.learn": await link.cursorLearn({ row: 0, fine: "stale" }),
    modal: await link.modal({ index: 0, fine: "stale" }),
    key: await link.key({ button: "UP", fine: "stale" }),
  };
  for (const [name, r] of Object.entries(replies)) assert.ok(!("fault" in r), `${name}: ${JSON.stringify(r)}`);
  assert.deepEqual(replies.menu && "options" in replies.menu && replies.menu.options.map(o => o.label), ["Fight", "Ball"]);
  assert.deepEqual(replies.press, { ok: true, mode: 2 });
  assert.deepEqual(replies.card, { ok: false, why: "no-hud" });
  assert.equal("why" in replies.modal && replies.modal.why, "moved");
  assert.deepEqual(inputs, [Button.DOWN]);
});

test("the act and its fingerprint check go to the tab in one evaluate, so nothing runs between them (§10.2)", async () => {
  const s = tabSession(commandScene([]));
  await new CdpLink(s.session).press({ button: Button.ACTION, fine: "f" });
  assert.equal(s.sent.length, 1);
});

test("a page throw comes back as a threw fault, never as a throw", async () => {
  const s = tabSession({ ui: { mode: 2, handlers: { 2: { active: true } }, processInput: () => { throw new Error("processInput exploded"); } } });
  const link = new CdpLink(s.session);
  const probe = await link.probe({});
  assert.ok(!("fault" in probe) && probe.ready);
  assert.deepEqual(await link.press({ button: Button.ACTION, fine: probe.fine }), { fault: "threw", message: "processInput exploded" });
});

test("every command attaches first, screenshot too", async () => {
  const s = tabSession(commandScene([]));
  const link = new CdpLink(s.session);
  await link.probe({});
  await link.menu();
  assert.equal(await link.screenshot(), "png");
  assert.equal(s.ensured(), 3);
});

test("the link offers the whole store table", () => {
  const link = new CdpLink(tabSession({}).session);
  assert.equal(link.commands.size, 12);
  assert.ok(link.commands.has("cursor.learn"));
});

test("rawKey sends a button's keyboard equivalent, and nothing for a button without one", async () => {
  const s = tabSession({});
  const link = new CdpLink(s.session);
  assert.equal(await link.rawKey(Button.UP), true);
  assert.equal(await link.rawKey(Button.CYCLE_SHINY), false);
  assert.deepEqual(s.keys, ["ArrowUp"]);
});

test("the page's unhandled exceptions reach onRejection, and its console tail is the session's", () => {
  const s = tabSession({});
  const link = new CdpLink(s.session);
  const seen: number[] = [];
  link.onRejection(t => seen.push(t));
  s.session.onException?.(42);
  assert.deepEqual(seen, [42]);
  assert.deepEqual(link.consoleTail(), [{ t: "t", level: "error", text: "x" }]);
});
