import assert from "node:assert/strict";
import { test } from "node:test";
import { Button, UiMode } from "../enums/generated.ts";
import type { Discriminators } from "../screen.ts";
import type { Fault, GameLink, Tab } from "./link.ts";
import { LinkGame } from "./link-game.ts";
import type { CursorTarget } from "./port.ts";

type Sent = { command: string; args: unknown };

/** A link whose commands answer through `answers`; a command it does not script fails the test. Every command sent is recorded. */
function stubLink(answers: Partial<Record<keyof GameLink, (args: any) => unknown>>) {
  const sent: Sent[] = [];
  const method = (command: keyof GameLink) => async (args: unknown) => {
    sent.push({ command, args });
    const answer = answers[command];
    if (!answer) throw new Error(`unexpected ${command}`);
    return answer(args);
  };
  const link = {
    commands: new Set(),
    probe: method("probe"), menu: method("menu"), snapshot: method("snapshot"), starters: method("starters"), card: method("card"),
    press: method("press"), key: method("key"), cursorOption: method("cursorOption"), cursorShop: method("cursorShop"),
    cursorStarter: method("cursorStarter"), cursorLearn: method("cursorLearn"), modal: method("modal"), screenshot: method("screenshot"),
  } as unknown as GameLink;
  const tab: Tab = {
    attach: async () => ({ attached: true, launchedChrome: false }),
    keepAlive: async () => {},
    rawKey: async () => true,
    consoleTail: async () => [],
    onRejection: () => {},
  };
  return { game: new LinkGame(link, tab), sent, tab };
}

const THREW: Fault = { fault: "threw", message: "TypeError: Cannot read properties of undefined" };
const always = (v: unknown) => () => v;

function throwing() {
  const all = always(THREW);
  return stubLink({ probe: all, menu: all, snapshot: all, starters: all, press: all, cursorOption: all, cursorShop: all, cursorStarter: all, cursorLearn: all, modal: all }).game;
}

test("a page throw on a read degrades to that read's not-readable value", async () => {
  const game = throwing();
  assert.deepEqual(await game.read(), { ready: false, why: THREW.message, frame: null, domMode: null });
  assert.equal(await game.frame(), null);
  const menu = await game.menu();
  assert.equal(menu.readable, false);
  assert.equal(menu.why, THREW.message);
  assert.deepEqual(menu.options, []);
  assert.deepEqual(await game.starterGrid(), { ok: false, why: THREW.message });
  assert.deepEqual(await game.snapshot("lean"), { ok: false, why: THREW.message });
});

test("a page throw on a menu read is the UNKNOWN(-1) screen", async () => {
  assert.equal((await throwing().menu()).screen, "UNKNOWN(-1)");
});

test("a read off the game carries the locator's reason, and the probe's transport fields stop at the adapter", async () => {
  const { game } = stubLink({ probe: always({ ready: false, why: "no-phaser", frame: null, domMode: null, pumped: false, errorAt: null }), snapshot: always({ ok: false, why: "no-phaser" }) });
  assert.deepEqual(await game.read(), { ready: false, why: "no-phaser", frame: null, domMode: null });
  assert.deepEqual(await game.snapshot("party"), { ok: false, why: "no-phaser" });
});

const NO_DISC: Discriminators = { partyUiMode: null, optionsMode: false, saveSlotUiMode: null, summaryUiMode: null, alertClosable: false, filterMode: false, transferMode: false };

/** A page on one screen: the probe and the menu reader each read `disc` off the same handler. */
function pageOn(mode: number, family: string, disc: Partial<Discriminators>, extra: Record<string, unknown> = {}) {
  const d = { ...NO_DISC, ...disc };
  return stubLink({
    probe: always({
      ready: true, settled: true, reason: "menu-open", mode, phaseName: null, wave: null, turn: null, money: null, runLive: false,
      tutorialActive: false, handler: null, cursor: 0, modeChain: [], messageText: null, onActionInput: false,
      awaitingActionInput: false, fine: "f", frame: 1, domMode: null, gameVersion: null, disc: d, pumped: false, errorAt: null,
    }),
    menu: always({ readable: true, mode, handler: "H", family, options: [], cursor: 0, text: null, extra, disc: d }),
  }).game;
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
    const game = pageOn(s.mode, s.family, s.disc, { kept: 1 });
    const read = await game.read();
    const menu = await game.menu();
    assert.equal(read.ready && read.screen, s.screen);
    assert.equal(menu.screen, s.screen);
    assert.deepEqual(menu.extra, { kept: 1, ...s.fields });
    assert.ok(!("disc" in read) && !("disc" in menu), "disc stops at the adapter");
    assert.ok(!("pumped" in read) && !("errorAt" in read), "so do the probe's transport fields");
  });
}

test("a menu read with no handler is unreadable and carries its mode's Screen", async () => {
  const menu = await stubLink({ menu: always({ readable: false, why: "no-handler", mode: UiMode.COMMAND }) }).game.menu();
  assert.equal(menu.readable, false);
  assert.equal(menu.why, "no-handler");
  assert.equal(menu.screen, "COMMAND");
  const located = await stubLink({ menu: always({ ok: false, why: "no-phaser" }) }).game.menu();
  assert.equal(located.why, "no-phaser");
  assert.equal(located.mode, -1);
  assert.equal(located.screen, "UNKNOWN(-1)");
});

test("a page throw on an act says it threw", async () => {
  const game = throwing();
  assert.deepEqual(await game.press(Button.ACTION, "f"), { ok: false, why: THREW.message, threw: true });
  assert.deepEqual(await game.modalButton(0, "f"), { ok: false, why: THREW.message, threw: true });
  const targets: CursorTarget[] = [
    { family: "option_select", index: 1 },
    { family: "modifier_select", row: 1, col: 0 },
    { family: "starter_select", index: 3 },
    { family: "learn_move", row: 2 },
  ];
  for (const t of targets) assert.deepEqual(await game.setCursor(t, "f"), { ok: false, why: THREW.message, threw: true }, t.family);
});

test("an act the page refuses is not a throw: a press on a missing scene stays distinct from a throwing one", async () => {
  const refuse = always({ ok: false, why: "no-battle-scene" });
  const { game } = stubLink({ press: refuse, modal: refuse, starters: refuse });
  assert.deepEqual(await game.press(Button.ACTION, "f"), { ok: false, why: "no-battle-scene", threw: false });
  assert.deepEqual(await game.modalButton(1, "f"), { ok: false, why: "no-battle-scene", threw: false });
  assert.deepEqual(await game.starterGrid(), { ok: false, why: "no-battle-scene" });
});

test("a press carries the fingerprint it was decided on, and is ok once it reached processInput", async () => {
  const s = stubLink({ press: always({ ok: true, mode: 2 }) });
  assert.deepEqual(await s.game.press(Button.DOWN, "command|0"), { ok: true });
  assert.deepEqual(s.sent, [{ command: "press", args: { button: Button.DOWN, fine: "command|0" } }]);
});

test("an act on a game that moved did nothing, and says where the game is now (§10.2)", async () => {
  const moved = always({ ok: false, why: "moved", fine: "command|1" });
  const { game } = stubLink({ press: moved, modal: moved, cursorOption: moved });
  const expected = { ok: false, why: "moved", threw: false, fine: "command|1" };
  assert.deepEqual(await game.press(Button.ACTION, "command|0"), expected);
  assert.deepEqual(await game.modalButton(0, "command|0"), expected);
  assert.deepEqual(await game.setCursor({ family: "option_select", index: 1 }, "command|0"), expected);
});

/** Each family's setCursor: the command and arguments it sends, what the page reads back when it lands, and when it lands elsewhere. */
const families: { target: CursorTarget; command: keyof GameLink; args: object; landed: object; elsewhere: object }[] = [
  { target: { family: "option_select", index: 2 }, command: "cursorOption", args: { index: 2, fine: "f" }, landed: { ok: true, fullCursor: 2, cursor: 2, fine: "g" }, elsewhere: { ok: true, fullCursor: 0, cursor: 0, fine: "g" } },
  { target: { family: "modifier_select", row: 2, col: 1 }, command: "cursorShop", args: { row: 2, col: 1, fine: "f" }, landed: { ok: true, rowCursor: 2, cursor: 1, fine: "g" }, elsewhere: { ok: true, rowCursor: 2, cursor: 0, fine: "g" } },
  { target: { family: "starter_select", index: 10 }, command: "cursorStarter", args: { index: 10, fine: "f" }, landed: { ok: true, cursor: 10, scrollCursor: 0, species: "Chikorita", fine: "g" }, elsewhere: { ok: true, cursor: 9, scrollCursor: 0, species: "Venusaur", fine: "g" } },
  { target: { family: "learn_move", row: 1 }, command: "cursorLearn", args: { row: 1, fine: "f" }, landed: { ok: true, moveCursor: 1, fine: "g" }, elsewhere: { ok: true, moveCursor: 4, fine: "g" } },
];

for (const f of families) {
  test(`setCursor on ${f.target.family} is ok only when the cursor landed on the target, and hands back the fingerprint it left either way`, async () => {
    const landed = stubLink({ [f.command]: always(f.landed) });
    const ok = await landed.game.setCursor(f.target, "f");
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.fine, "g");
    assert.deepEqual(landed.sent, [{ command: f.command, args: f.args }]);

    const missed = await stubLink({ [f.command]: always(f.elsewhere) }).game.setCursor(f.target, "f");
    assert.equal(missed.ok, false);
    assert.equal(!missed.ok && missed.threw, false);
    assert.equal(missed.fine, "g");
  });
}

test("setCursor on the starter grid names the species it landed on", async () => {
  const { game } = stubLink({ cursorStarter: always({ ok: true, cursor: 10, scrollCursor: 0, species: "Chikorita", fine: "g" }) });
  assert.deepEqual(await game.setCursor({ family: "starter_select", index: 10 }, "f"), { ok: true, species: "Chikorita", fine: "g" });
});

test("setCursor passes on the page's own refusal", async () => {
  const { game } = stubLink({ cursorLearn: always({ ok: false, why: "move-select-off" }) });
  assert.deepEqual(await game.setCursor({ family: "learn_move", row: 0 }, "f"), { ok: false, why: "move-select-off", threw: false });
});

test("the frame comes from the probe", async () => {
  const { game } = stubLink({ probe: always({ ready: true, frame: 77, disc: NO_DISC, mode: 2 }) });
  assert.equal(await game.frame(), 77);
});
