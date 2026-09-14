import assert from "node:assert/strict";
import { test } from "node:test";
import type { CdpSession } from "./cdp/session.ts";
import { Driver, type MenuRead } from "./driver.ts";
import { Button, UiMode } from "./enums/generated.ts";
import { Refusal } from "./envelope.ts";
import * as js from "./game/js.ts";
import { CALL_BUDGET_MS, type Ready } from "./settle.ts";

// `money` joins Ready with #38; spread so this fixture compiles with and without it.
const money = { money: 1000 };
const disc = { partyUiMode: null, optionsMode: false, saveSlotUiMode: null, summaryUiMode: null, alertClosable: false, filterMode: false, transferMode: false };

/**
 * A game tab on a fake clock: every settle poll advances time by its sleep, nothing else does. The screen is #28's
 * double-battle TARGET_SELECT for a single-target move, where the cursor sits on Zigzagoon and no press ever moves it. With `stallAfterPress`
 * the game stops settling once the first press lands.
 */
function fakeTab(opts: { stallAfterPress: boolean }) {
  let t = 0;
  let frame = 0;
  const presses: number[] = [];
  const read = (): Ready => {
    const settled = !(opts.stallAfterPress && presses.length > 0);
    return {
      ready: true, settled, reason: settled ? "menu-open" : "ui-transition", mode: UiMode.TARGET_SELECT,
      phaseName: "SelectTargetPhase", wave: 13, turn: 1, runLive: true, tutorialActive: false, handler: "TargetSelectUiHandler",
      cursor: 2, modeChain: [], messageText: null, onActionInput: false, awaitingActionInput: false, fine: "target|2",
      frame: ++frame, domMode: "TARGET_SELECT", gameVersion: "1.12.0.11", disc, ...money,
    };
  };
  const menu: MenuRead = {
    readable: true, mode: UiMode.TARGET_SELECT, family: "target_select", cursor: 2, text: null,
    options: [{ i: 2, label: "Zigzagoon" }, { i: 3, label: "Sentret" }], extra: { isMultipleTargets: false },
  };
  const session = {
    onException: null,
    attached: true,
    ensure: async () => {},
    keepAlive: async () => {},
    rawKey: async () => {},
    consoleTail: () => [],
    evaluate: async (expr: string) => {
      if (expr === js.PREDICATE) return read();
      if (expr === js.FRAME) return { ready: true, frame: ++frame };
      if (expr === js.READER) return menu;
      for (const b of Object.values(Button)) {
        if (expr === js.press(b)) {
          presses.push(b);
          return { ok: true };
        }
      }
      return {};
    },
  } as unknown as CdpSession;
  const driver = new Driver(session, { path: "/nonexistent/driver.lock", contended: false, holder: null }, {
    now: () => t,
    sleep: async ms => { t += ms; },
  });
  return { driver, presses, now: () => t };
}

async function outcome(p: Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof Refusal) return { error: e.code, ...e.detail };
    throw e;
  }
}

test("a cursor walk that never moves the cursor refuses after one press, inside the call budget (#34)", async () => {
  const tab = fakeTab({ stallAfterPress: false });
  const r = await outcome(tab.driver.selectOption("Sentret", undefined, undefined, {}));
  assert.equal(r.error, "cursor_stuck");
  assert.deepEqual(tab.presses, [Button.RIGHT], "no retry of a press that did not move the cursor");
  assert.ok(tab.now() <= CALL_BUDGET_MS, `returned at ${tab.now()} ms`);
});

test("a cursor walk whose presses never settle returns timed_out at the call deadline, not per press (#34)", async () => {
  const tab = fakeTab({ stallAfterPress: true });
  const r = await outcome(tab.driver.selectOption("Sentret", undefined, undefined, {}));
  assert.equal(r.status, "timed_out");
  assert.ok(tab.now() <= CALL_BUDGET_MS + 1_000, `returned at ${tab.now()} ms`);
});

/**
 * A double-battle TARGET_SELECT that moves its cursor the way TargetSelectUiHandler.processInput does (#40): UP/DOWN jump
 * to the first target in the other row (enemies 2,3 on top, player field 0,1 below), LEFT/RIGHT step ±1 within a row,
 * nothing wraps. A spread move (`isMultipleTargets`) ignores every direction; ACTION commits all targets.
 */
function targetGridTab(opts: { targets: { i: number; label: string }[]; cursor: number; isMultipleTargets: boolean }) {
  let t = 0;
  let frame = 0;
  const presses: number[] = [];
  const targets = opts.targets.map(o => o.i);
  let cursor = opts.cursor;
  let committed: number[] | null = null;
  const read = (): Ready => ({
    ready: true, settled: true, reason: "menu-open", mode: committed === null ? UiMode.TARGET_SELECT : UiMode.COMMAND,
    phaseName: committed === null ? "SelectTargetPhase" : "CommandPhase", wave: 7, turn: 1, runLive: true, tutorialActive: false,
    handler: "TargetSelectUiHandler", cursor, modeChain: [], messageText: null, onActionInput: false, awaitingActionInput: false,
    fine: `target|${cursor}|${committed}`, frame: ++frame, domMode: null, gameVersion: "1.12.0.11", disc, ...money,
  });
  const menu = (): MenuRead => ({
    readable: true, mode: UiMode.TARGET_SELECT, family: "target_select", cursor, text: null,
    options: opts.targets, extra: { isMultipleTargets: opts.isMultipleTargets },
  });
  const press = (b: number) => {
    presses.push(b);
    if (b === Button.ACTION) committed = opts.isMultipleTargets ? targets : [cursor];
    else if (opts.isMultipleTargets) return;
    else if (b === Button.UP && cursor < 2) cursor = targets.find(i => i >= 2) ?? cursor;
    else if (b === Button.DOWN && cursor >= 2) cursor = targets.find(i => i < 2) ?? cursor;
    else if (b === Button.LEFT && cursor % 2 && targets.includes(cursor - 1)) cursor--;
    else if (b === Button.RIGHT && !(cursor % 2) && targets.includes(cursor + 1)) cursor++;
  };
  const session = {
    onException: null,
    attached: true,
    ensure: async () => {},
    keepAlive: async () => {},
    rawKey: async () => {},
    consoleTail: () => [],
    evaluate: async (expr: string) => {
      if (expr === js.PREDICATE) return read();
      if (expr === js.FRAME) return { ready: true, frame: ++frame };
      if (expr === js.READER) return menu();
      for (const b of Object.values(Button)) {
        if (expr === js.press(b)) {
          press(b);
          return { ok: true };
        }
      }
      return {};
    },
  } as unknown as CdpSession;
  const driver = new Driver(session, { path: "/nonexistent/driver.lock", contended: false, holder: null }, {
    now: () => t,
    sleep: async ms => { t += ms; },
  });
  return { driver, presses, committed: () => committed };
}

test("select_option reaches the ally on the player row of TARGET_SELECT (#40)", async () => {
  const tab = targetGridTab({ targets: [{ i: 2, label: "Starly" }, { i: 3, label: "Caterpie" }, { i: 1, label: "Lillipup" }], cursor: 2, isMultipleTargets: false });
  const r = await outcome(tab.driver.selectOption("Lillipup", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.deepEqual(tab.committed(), [1]);
  assert.deepEqual(tab.presses, [Button.DOWN, Button.ACTION]);
});

test("select_option crosses rows then steps along the row on TARGET_SELECT (#40)", async () => {
  const tab = targetGridTab({ targets: [{ i: 2, label: "Starly" }, { i: 3, label: "Caterpie" }, { i: 0, label: "Fuecoco" }, { i: 1, label: "Lillipup" }], cursor: 1, isMultipleTargets: false });
  const r = await outcome(tab.driver.selectOption("Caterpie", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.deepEqual(tab.committed(), [3]);
  assert.deepEqual(tab.presses, [Button.UP, Button.RIGHT, Button.ACTION]);
});

test("select_option steps LEFT within the enemy row on TARGET_SELECT (#40)", async () => {
  const tab = targetGridTab({ targets: [{ i: 2, label: "Starly" }, { i: 3, label: "Caterpie" }], cursor: 3, isMultipleTargets: false });
  const r = await outcome(tab.driver.selectOption("Starly", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.deepEqual(tab.presses, [Button.LEFT, Button.ACTION]);
});

test("a spread move commits any listed target with one ACTION and reports targets: all (#33)", async () => {
  const tab = targetGridTab({ targets: [{ i: 2, label: "Zigzagoon" }, { i: 3, label: "Sentret" }], cursor: 2, isMultipleTargets: true });
  const r = await outcome(tab.driver.selectOption("Sentret", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(r.targets, "all");
  assert.deepEqual(tab.committed(), [2, 3]);
  assert.deepEqual(tab.presses, [Button.ACTION]);
});

/**
 * `start_run` on a scripted tab, from TITLE to the first decision after the save slot. Slot 1 holds a run, the rest are
 * empty. ACTION on a free slot starts the run and settles on CheckSwitchPhase's "Will you switch Pokémon?" CONFIRM, the
 * screen #30 mistook for the overwrite confirm; ACTION on Slot 1 opens the real overwrite confirm first.
 */
function startRunTab() {
  let t = 0;
  let frame = 0;
  const presses: number[] = [];
  const slots = [0, 1, 2, 3, 4].map(i => ({ i, label: `Slot ${i + 1}`, hasData: i === 0 }));
  type Screen = { mode: number; phase: string; chain: number[]; family: string; options: string[]; disc?: Record<string, unknown>; text?: string };
  const title: Screen = { mode: UiMode.TITLE, phase: "TitlePhase", chain: [], family: "option_select", options: ["Continue", "New Game", "Load Game", "Run History", "Settings"] };
  const gameMode: Screen = { mode: UiMode.OPTION_SELECT, phase: "TitlePhase", chain: [UiMode.TITLE], family: "option_select", options: ["Classic", "Daily Run", "Cancel"] };
  const grid: Screen = { mode: UiMode.STARTER_SELECT, phase: "SelectStarterPhase", chain: [UiMode.TITLE], family: "starter_select", options: [] };
  const starterMenu: Screen = { ...gameMode, phase: "SelectStarterPhase", chain: [UiMode.TITLE, UiMode.STARTER_SELECT], options: ["Add to Party", "Cancel"] };
  const begin: Screen = { mode: UiMode.CONFIRM, phase: "SelectStarterPhase", chain: [UiMode.TITLE, UiMode.STARTER_SELECT], family: "option_select", options: ["Yes", "No"] };
  const saveSlot: Screen = { mode: UiMode.SAVE_SLOT, phase: "SelectStarterPhase", chain: [UiMode.TITLE, UiMode.TITLE], family: "save_slot", options: [], disc: { saveSlotUiMode: 1 } };
  // The stale chain entries below the top are what the live game showed (#30).
  const overwriteConfirm: Screen = { ...begin, chain: [UiMode.TITLE, UiMode.TITLE, UiMode.SAVE_SLOT], text: "Overwrite the data in the selected slot?" };
  const switchConfirm: Screen = { ...begin, phase: "CheckSwitchPhase", chain: [UiMode.TITLE], text: "Will you switch\nPokémon?" };

  let screen = title;
  let cursor = 0;
  let party: string[] = [];
  const go = (next: Screen) => { screen = next; cursor = 0; };
  const read = (): Ready => ({
    ready: true, settled: true, reason: "menu-open", mode: screen.mode, phaseName: screen.phase, wave: screen === switchConfirm ? 1 : null,
    turn: null, runLive: screen === switchConfirm, tutorialActive: false, handler: null, cursor, modeChain: screen.chain,
    messageText: screen.text ?? null, onActionInput: false, awaitingActionInput: false, fine: `${screen.mode}|${screen.phase}|${cursor}|${party.length}`,
    frame: ++frame, domMode: null, gameVersion: "1.12.0.11", disc: { ...disc, ...screen.disc }, ...money,
  });
  const menu = (): MenuRead => ({
    readable: true, mode: screen.mode, family: screen.family, cursor, text: screen.text ?? null, extra: {},
    options: screen === saveSlot ? slots : screen.options.map((label, i) => ({ i, label })),
  });
  const press = (b: number) => {
    presses.push(b);
    if (b === Button.DOWN) cursor++;
    else if (b === Button.UP) cursor--;
    else if (b === Button.SUBMIT && screen === grid) go(begin);
    else if (b === Button.ACTION) {
      if (screen === title) go(gameMode);
      else if (screen === gameMode) go(grid);
      else if (screen === grid) go(starterMenu);
      else if (screen === starterMenu) { party = [...party, "Bulbasaur"]; go(grid); }
      else if (screen === begin) go(saveSlot);
      else if (screen === saveSlot) go(slots[cursor].hasData ? overwriteConfirm : switchConfirm);
      else if (screen === overwriteConfirm) go(switchConfirm);
    }
  };
  const session = {
    onException: null,
    attached: true,
    ensure: async () => {},
    keepAlive: async () => {},
    rawKey: async () => {},
    consoleTail: () => [],
    evaluate: async (expr: string) => {
      if (expr === js.PREDICATE) return read();
      if (expr === js.FRAME) return { ready: true, frame: ++frame };
      if (expr === js.READER) return menu();
      if (expr === js.STARTER_INFO) return { ok: true, filterMode: false, grid: [{ i: 0, name: "Bulbasaur", cost: 3 }], valueLimit: 10, party, partyValid: true };
      if (expr === js.starterSetCursor(0)) return { ok: true, species: "Bulbasaur", cursor: 0 };
      for (let j = 0; j < 5; j++) if (expr === js.optionSelectSetCursor(j)) { cursor = j; return { ok: true, fullCursor: j }; }
      for (const b of Object.values(Button)) {
        if (expr === js.press(b)) {
          press(b);
          return { ok: true };
        }
      }
      return {};
    },
  } as unknown as CdpSession;
  const driver = new Driver(session, { path: "/nonexistent/driver.lock", contended: false, holder: null }, {
    now: () => t,
    sleep: async ms => { t += ms; },
  });
  return { driver, presses, screen: () => screen };
}

test("start_run on a free slot hands back the switch CONFIRM unanswered, not a slot_occupied refusal (#30)", async () => {
  const tab = startRunTab();
  const r = await outcome(tab.driver.startRun(["Bulbasaur"], undefined, false, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(r.started, true);
  assert.equal(r.slot, 1);
  assert.equal(tab.screen().phase, "CheckSwitchPhase");
  assert.equal(tab.presses.at(-1), Button.ACTION, "the last press is the slot's ACTION; nothing answered the switch question");
  assert.ok(!(r.log as string[]).some(l => l.startsWith("overwrite confirm")));
});

test("start_run with overwrite answers Yes on the real overwrite confirm (#30)", async () => {
  const tab = startRunTab();
  const r = await outcome(tab.driver.startRun(["Bulbasaur"], 0, true, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(r.slot, 0);
  assert.ok((r.log as string[]).some(l => l === "overwrite confirm: Yes | No → index 0"));
  assert.equal(tab.screen().phase, "CheckSwitchPhase");
});

/**
 * #28's Charmander on SUMMARY/LEARN_MOVE: Scratch, Growl, Ember, Flare Blitz and the new Metal Claw on row 4, where the
 * row cursor starts. ACTION on a moveset row forgets that move; on row 4 it declines. With `setCursorWorks: false` the
 * handler's setCursor is unavailable and the driver must walk the rows one press at a time.
 */
function learnMoveTab(opts: { setCursorWorks: boolean }) {
  let t = 0;
  let frame = 0;
  const presses: number[] = [];
  const moves = ["Scratch", "Growl", "Ember", "Flare Blitz", "Metal Claw"];
  let moveCursor = 4;
  let answered: number | null = null;
  const read = (): Ready => ({
    ready: true, settled: true, reason: "menu-open", mode: answered === null ? UiMode.SUMMARY : UiMode.MESSAGE, phaseName: "LearnMovePhase",
    wave: 16, turn: 1, runLive: true, tutorialActive: false, handler: "SummaryUiHandler", cursor: 2, modeChain: [], messageText: null,
    onActionInput: false, awaitingActionInput: false, fine: `summary|2|${moveCursor}|${answered}`, frame: ++frame, domMode: null,
    gameVersion: "1.12.0.11", disc: { ...disc, summaryUiMode: answered === null ? 1 : null }, ...money,
  });
  const menu = (): MenuRead => ({
    readable: true, mode: UiMode.SUMMARY, family: "learn_move", cursor: moveCursor, text: null, extra: { moveSelect: true, page: 2 },
    options: moves.map((label, i) => ({ i, label, forget: i < 4 })),
  });
  const session = {
    onException: null,
    attached: true,
    ensure: async () => {},
    keepAlive: async () => {},
    rawKey: async () => {},
    consoleTail: () => [],
    evaluate: async (expr: string) => {
      if (expr === js.PREDICATE) return read();
      if (expr === js.FRAME) return { ready: true, frame: ++frame };
      if (expr === js.READER) return menu();
      for (let j = 0; j < 5; j++) {
        if (expr === js.learnMoveSetCursor(j)) {
          if (!opts.setCursorWorks) throw new Error("setCursor unavailable");
          moveCursor = j;
          return { ok: true, moveCursor };
        }
      }
      for (const b of Object.values(Button)) {
        if (expr === js.press(b)) {
          presses.push(b);
          if (b === Button.UP) moveCursor = moveCursor ? moveCursor - 1 : 4;
          else if (b === Button.DOWN) moveCursor = moveCursor < 4 ? moveCursor + 1 : 0;
          else if (b === Button.ACTION) answered = moveCursor;
          return { ok: true };
        }
      }
      return {};
    },
  } as unknown as CdpSession;
  // evaluate() of a throwing expression surfaces as { __throw } in the real session.
  const guarded = session.evaluate;
  session.evaluate = (async (expr: string) => {
    try {
      return await guarded(expr);
    } catch (e) {
      return { __throw: (e as Error).message };
    }
  }) as CdpSession["evaluate"];
  const driver = new Driver(session, { path: "/nonexistent/driver.lock", contended: false, holder: null }, {
    now: () => t,
    sleep: async ms => { t += ms; },
  });
  return { driver, presses, answered: () => answered };
}

test("select_option forgets a move by label on SUMMARY/LEARN_MOVE (#31)", async () => {
  const tab = learnMoveTab({ setCursorWorks: true });
  const r = await outcome(tab.driver.selectOption("Growl", undefined, "SUMMARY/LEARN_MOVE", {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(tab.answered(), 1);
  assert.deepEqual(tab.presses, [Button.ACTION], "the row is set directly, then committed once");
});

test("select_option on the new move declines it (#31)", async () => {
  const tab = learnMoveTab({ setCursorWorks: true });
  await outcome(tab.driver.selectOption("Metal Claw", undefined, undefined, {}));
  assert.equal(tab.answered(), 4);
});

/**
 * #44's wave-21 shop: a Revive applied to Charmander (slot 1, full HP) on PARTY/MODIFIER. ACTION on Apply closes the
 * option list and PartyUiHandler shows "It won't have any effect." in its own message box, awaiting ACTION or CANCEL;
 * while it waits, every direction is swallowed. The fake mirrors js.READER's party branch in that state: no options,
 * the handler's own message as text, `extra.messagePending`.
 */
function partyMessageTab() {
  let t = 0;
  let frame = 0;
  const presses: number[] = [];
  const party = ["Fletchling", "Charmander"];
  const verbs = ["Apply", "Summary", "Cancel"];
  let optionsMode = true;
  let cursor = 1;
  let optionsCursor = 0;
  let message: string | null = null;
  const read = (): Ready => ({
    ready: true, settled: true, reason: "menu-open", mode: UiMode.PARTY, phaseName: "SelectModifierPhase", wave: 21, turn: 1,
    runLive: true, tutorialActive: false, handler: "PartyUiHandler", cursor, modeChain: [UiMode.MODIFIER_SELECT], messageText: null,
    onActionInput: message !== null, awaitingActionInput: message !== null,
    fine: `party|${optionsMode}|${cursor}|${optionsCursor}|${message}`, frame: ++frame, domMode: null, gameVersion: "1.12.0.11",
    disc: { ...disc, partyUiMode: 4, optionsMode }, ...money,
  });
  const menu = (): MenuRead => {
    const extra = { optionsMode, partyUiMode: 4, ...(message !== null ? { messagePending: true } : {}) };
    if (message !== null) return { readable: true, mode: UiMode.PARTY, family: "party", cursor, text: message, options: [], extra };
    if (optionsMode) return { readable: true, mode: UiMode.PARTY, family: "party", cursor: optionsCursor, text: "Revive", options: verbs.map((label, i) => ({ i, label })), extra };
    return { readable: true, mode: UiMode.PARTY, family: "party", cursor, text: null, options: [...party.map((label, i) => ({ i, label })), { i: 6, label: "Cancel" }], extra };
  };
  const press = (b: number) => {
    presses.push(b);
    if (message !== null) {
      if (b === Button.ACTION || b === Button.CANCEL) message = null;
      return;
    }
    if (optionsMode) {
      if (b === Button.DOWN) optionsCursor = Math.min(optionsCursor + 1, verbs.length - 1);
      else if (b === Button.UP) optionsCursor = Math.max(optionsCursor - 1, 0);
      else if (b === Button.ACTION && optionsCursor === 0) { optionsMode = false; message = "It won't have any effect."; }
      return;
    }
    if (b === Button.DOWN) cursor = cursor === 6 ? 0 : cursor + 1 < party.length ? cursor + 1 : 6;
  };
  const session = {
    onException: null,
    attached: true,
    ensure: async () => {},
    keepAlive: async () => {},
    rawKey: async () => {},
    consoleTail: () => [],
    evaluate: async (expr: string) => {
      if (expr === js.PREDICATE) return read();
      if (expr === js.FRAME) return { ready: true, frame: ++frame };
      if (expr === js.READER) return menu();
      for (const b of Object.values(Button)) {
        if (expr === js.press(b)) {
          press(b);
          return { ok: true };
        }
      }
      return {};
    },
  } as unknown as CdpSession;
  const driver = new Driver(session, { path: "/nonexistent/driver.lock", contended: false, holder: null }, {
    now: () => t,
    sleep: async ms => { t += ms; },
  });
  return { driver, presses, cursor: () => cursor };
}

test("a no-effect Apply on PARTY/MODIFIER returns the party message and says ACTION dismisses it (#44)", async () => {
  const tab = partyMessageTab();
  const r = await outcome(tab.driver.selectOption("Apply", undefined, "PARTY/MODIFIER:options", {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  const menu = r.menu as Record<string, unknown>;
  assert.equal(menu.text, "It won't have any effect.");
  assert.deepEqual(menu.options, []);
  assert.equal(menu.message_pending, true);
  assert.match(String(menu.next), /press\(ACTION\)/);
});

test("read_menu on PARTY with a pending message shows it and how to dismiss it (#44)", async () => {
  const tab = partyMessageTab();
  await outcome(tab.driver.selectOption("Apply", undefined, undefined, {}));
  const r = await outcome(tab.driver.readMenu({}));
  assert.equal(r.text, "It won't have any effect.");
  assert.equal(r.message_pending, true);
  assert.match(String(r.next), /press\(ACTION\)/);
  assert.equal(r.cancel_effect, "consents", "CANCEL dismisses the message, it does not leave PARTY");
});

test("select_option refuses message_pending on PARTY without walking the cursor, and works once ACTION dismisses it (#44)", async () => {
  const tab = partyMessageTab();
  await outcome(tab.driver.selectOption("Apply", undefined, undefined, {}));
  const pressed = tab.presses.length;
  const refused = await outcome(tab.driver.selectOption("Cancel", undefined, undefined, {}));
  assert.equal(refused.error, "message_pending");
  assert.equal(refused.text, "It won't have any effect.");
  assert.match(String(refused.next), /press\(ACTION\)/);
  assert.equal(tab.presses.length, pressed, "nothing pressed while the message is up");

  await outcome(tab.driver.press("ACTION", {}));
  const r = await outcome(tab.driver.selectOption("Cancel", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(tab.cursor(), 6);
});

test("without setCursor the learn-move rows are walked one press per row, row 1 reachable (#31, #28)", async () => {
  const tab = learnMoveTab({ setCursorWorks: false });
  const r = await outcome(tab.driver.selectOption("Growl", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(tab.answered(), 1);
  assert.deepEqual(tab.presses, [Button.UP, Button.UP, Button.UP, Button.ACTION]);
});
