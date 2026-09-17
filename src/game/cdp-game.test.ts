import assert from "node:assert/strict";
import { test } from "node:test";
import type { Thrown } from "../cdp/session.ts";
import { Button, UiMode } from "../enums/generated.ts";
import type { Discriminators } from "../screen.ts";
import { CdpGame, type GameSession } from "./cdp-game.ts";
import * as js from "./js.ts";
import type { CursorTarget } from "./port.ts";

/** A session whose page answers every expression through `page`; `{ __throw }` is how the real session returns a page throw. */
function stubSession(page: (expr: string) => unknown) {
  const sent: string[] = [];
  const keys: string[] = [];
  let ensured = 0;
  const session: GameSession = {
    attached: true,
    launchedChrome: false,
    onException: null,
    ensure: async () => { ensured++; },
    evaluate: async <T>(expr: string) => {
      sent.push(expr);
      return page(expr) as T | Thrown;
    },
    keepAlive: async () => {},
    rawKey: async key => { keys.push(key); },
    screenshot: async () => "png",
    consoleTail: () => [],
  };
  return { session, sent, keys, ensured: () => ensured };
}

const THROW = { __throw: "TypeError: Cannot read properties of undefined" };
const throwing = () => new CdpGame(stubSession(() => THROW).session);

test("a page throw on a read degrades to that read's not-readable value", async () => {
  const game = throwing();
  assert.deepEqual(await game.read(), { ready: false, why: THROW.__throw, frame: null, domMode: null });
  assert.equal(await game.frame(), null);
  const menu = await game.menu();
  assert.equal(menu.readable, false);
  assert.equal(menu.why, THROW.__throw);
  assert.deepEqual(menu.options, []);
  assert.deepEqual(await game.starterGrid(), { ok: false, why: THROW.__throw });
  assert.deepEqual(await game.snapshot("lean"), { ok: false, why: THROW.__throw });
});

test("a page throw on a menu read is the UNKNOWN(-1) screen", async () => {
  assert.equal((await throwing().menu()).screen, "UNKNOWN(-1)");
});

const NO_DISC: Discriminators = { partyUiMode: null, optionsMode: false, saveSlotUiMode: null, summaryUiMode: null, alertClosable: false, filterMode: false, transferMode: false };

/** A page on one screen: the predicate and the menu reader each read `disc` off the same handler, as js.ts's one DISC snippet does. */
function pageOn(mode: number, family: string, disc: Partial<Discriminators>, extra: Record<string, unknown> = {}) {
  const d = { ...NO_DISC, ...disc };
  return stubSession(expr => {
    if (expr === js.PREDICATE) {
      return {
        ready: true, settled: true, reason: "menu-open", mode, phaseName: null, wave: null, turn: null, money: null, runLive: false,
        tutorialActive: false, handler: null, cursor: 0, modeChain: [], messageText: null, onActionInput: false,
        awaitingActionInput: false, fine: "f", frame: 1, domMode: null, gameVersion: null, disc: d,
      };
    }
    if (expr === js.READER) return { readable: true, mode, handler: "H", family, options: [], cursor: 0, text: null, extra, disc: d };
    throw new Error("unexpected expression");
  });
}

/** Each family whose typed fields come from `disc`: the Screen both reads derive, and the fields the menu read carries. */
const screens: { name: string; mode: number; family: string; disc: Partial<Discriminators>; screen: string; fields: Record<string, unknown> }[] = [
  { name: "party", mode: UiMode.PARTY, family: "party", disc: { partyUiMode: 1, optionsMode: true, transferMode: true }, screen: "PARTY/FAINT_SWITCH:options", fields: { optionsMode: true, partyUiMode: 1, transferMode: true } },
  { name: "save_slot", mode: UiMode.SAVE_SLOT, family: "save_slot", disc: { saveSlotUiMode: 1 }, screen: "SAVE_SLOT/SAVE", fields: { uiMode: 1 } },
  { name: "alert", mode: UiMode.ALERT_MODAL, family: "acknowledge", disc: { alertClosable: true }, screen: "ALERT_MODAL/CLOSABLE", fields: { closable: true } },
  { name: "starter filter bar", mode: UiMode.STARTER_SELECT, family: "starter_select", disc: { filterMode: true }, screen: "STARTER_SELECT/FILTER", fields: { filterMode: true } },
  { name: "learn move", mode: UiMode.SUMMARY, family: "learn_move", disc: { summaryUiMode: 1 }, screen: "SUMMARY/LEARN_MOVE", fields: {} },
];

for (const s of screens) {
  test(`read and menu derive the same Screen from one disc, and the menu's typed fields come from it: ${s.name}`, async () => {
    const game = new CdpGame(pageOn(s.mode, s.family, s.disc, { kept: 1 }).session);
    const read = await game.read();
    const menu = await game.menu();
    assert.equal(read.ready && read.screen, s.screen);
    assert.equal(menu.screen, s.screen);
    assert.deepEqual(menu.extra, { kept: 1, ...s.fields });
    assert.ok(!("disc" in read) && !("disc" in menu), "disc stops at the adapter");
  });
}

test("a menu read with no handler is unreadable and carries its mode's Screen", async () => {
  const game = new CdpGame(stubSession(() => ({ readable: false, why: "no-handler", mode: UiMode.COMMAND })).session);
  const menu = await game.menu();
  assert.equal(menu.readable, false);
  assert.equal(menu.why, "no-handler");
  assert.equal(menu.screen, "COMMAND");
  const located = await new CdpGame(stubSession(() => ({ readable: false, why: "no-phaser" })).session).menu();
  assert.equal(located.mode, -1);
  assert.equal(located.screen, "UNKNOWN(-1)");
});

test("a page throw on an act says it threw", async () => {
  const game = throwing();
  assert.deepEqual(await game.press(Button.ACTION), { ok: false, why: THROW.__throw, threw: true });
  assert.deepEqual(await game.modalButton(0), { ok: false, why: THROW.__throw, threw: true });
  const targets: CursorTarget[] = [
    { family: "option_select", index: 1 },
    { family: "modifier_select", row: 1, col: 0 },
    { family: "starter_select", index: 3 },
    { family: "learn_move", row: 2 },
  ];
  for (const t of targets) assert.deepEqual(await game.setCursor(t), { ok: false, why: THROW.__throw, threw: true }, t.family);
});

test("an act the page refuses is not a throw: a press on a missing scene stays distinct from a throwing one", async () => {
  const game = new CdpGame(stubSession(() => ({ ok: false, why: "no-battle-scene" })).session);
  assert.deepEqual(await game.press(Button.ACTION), { ok: false, why: "no-battle-scene", threw: false });
  assert.deepEqual(await game.modalButton(1), { ok: false, why: "no-battle-scene", threw: false });
  assert.deepEqual(await game.starterGrid(), { ok: false, why: "no-battle-scene" });
});

test("a press that reached processInput is ok", async () => {
  const s = stubSession(() => ({ ok: true, mode: 2 }));
  assert.deepEqual(await new CdpGame(s.session).press(Button.DOWN), { ok: true });
  assert.deepEqual(s.sent, [js.press(Button.DOWN)]);
});

/** Each family's setCursor, what the page reads back when it lands, and what it reads back when it lands elsewhere. */
const families: { target: CursorTarget; expr: string; landed: object; elsewhere: object }[] = [
  { target: { family: "option_select", index: 2 }, expr: js.optionSelectSetCursor(2), landed: { ok: true, fullCursor: 2, cursor: 2 }, elsewhere: { ok: true, fullCursor: 0, cursor: 0 } },
  { target: { family: "modifier_select", row: 2, col: 1 }, expr: js.shopSetCursor(2, 1), landed: { ok: true, rowCursor: 2, cursor: 1 }, elsewhere: { ok: true, rowCursor: 2, cursor: 0 } },
  { target: { family: "starter_select", index: 10 }, expr: js.starterSetCursor(10), landed: { ok: true, cursor: 10, scrollCursor: 0, species: "Chikorita" }, elsewhere: { ok: true, cursor: 9, scrollCursor: 0, species: "Venusaur" } },
  { target: { family: "learn_move", row: 1 }, expr: js.learnMoveSetCursor(1), landed: { ok: true, moveCursor: 1 }, elsewhere: { ok: true, moveCursor: 4 } },
];

for (const f of families) {
  test(`setCursor on ${f.target.family} is ok only when the cursor landed on the target`, async () => {
    const landed = stubSession(() => f.landed);
    const ok = await new CdpGame(landed.session).setCursor(f.target);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.deepEqual(landed.sent, [f.expr]);

    const missed = await new CdpGame(stubSession(() => f.elsewhere).session).setCursor(f.target);
    assert.equal(missed.ok, false);
    assert.equal(!missed.ok && missed.threw, false);
  });
}

test("setCursor on the starter grid names the species it landed on", async () => {
  const r = await new CdpGame(stubSession(() => ({ ok: true, cursor: 10, scrollCursor: 0, species: "Chikorita" })).session).setCursor({ family: "starter_select", index: 10 });
  assert.deepEqual(r, { ok: true, species: "Chikorita" });
});

test("setCursor passes on the page's own refusal", async () => {
  const r = await new CdpGame(stubSession(() => ({ ok: false, why: "move-select-off" })).session).setCursor({ family: "learn_move", row: 0 });
  assert.deepEqual(r, { ok: false, why: "move-select-off", threw: false });
});

test("rawKey sends a button's keyboard equivalent, and nothing for a button without one", async () => {
  const s = stubSession(() => ({}));
  const game = new CdpGame(s.session);
  assert.equal(await game.rawKey(Button.UP), true);
  assert.deepEqual(s.keys, ["ArrowUp"]);
  assert.equal(await game.rawKey(Button.CYCLE_SHINY), false);
  assert.deepEqual(s.keys, ["ArrowUp"]);
});

test("every game operation attaches first", async () => {
  const s = stubSession(() => ({ ok: true }));
  const game = new CdpGame(s.session);
  await game.read();
  await game.press(Button.ACTION);
  await game.screenshot();
  assert.equal(s.ensured(), 3);
});

test("the page's unhandled exceptions reach onRejection", () => {
  const s = stubSession(() => ({}));
  const seen: number[] = [];
  new CdpGame(s.session).onRejection(t => seen.push(t));
  s.session.onException?.(42);
  assert.deepEqual(seen, [42]);
});
