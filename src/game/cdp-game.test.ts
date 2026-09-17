import assert from "node:assert/strict";
import { test } from "node:test";
import type { Thrown } from "../cdp/session.ts";
import { Button } from "../enums/generated.ts";
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
