import assert from "node:assert/strict";
import { test } from "node:test";
import { Driver } from "./driver.ts";
import { Button, UiMode } from "./enums/generated.ts";
import { Refusal } from "./envelope.ts";
import { fakeGame, type FakeScreen, type ScreenRead } from "./game/fake-game.ts";
import type { MenuRead } from "./game/port.ts";
import { CALL_BUDGET_MS } from "./settle.ts";

// `money` joins Ready with #38; spread so this fixture compiles with and without it.
const money = { money: 1000 };

/** A Driver on a scripted screen, with the fake's clock. */
function drive(screen: FakeScreen) {
  const fake = fakeGame(screen);
  return { ...fake, driver: new Driver(fake.game, fake.clock) };
}

/**
 * A game tab on a fake clock: every settle poll advances time by its sleep, nothing else does. The screen is #28's
 * double-battle TARGET_SELECT for a single-target move, where the cursor sits on Zigzagoon and no press ever moves it. With `stallAfterPress`
 * the game stops settling once the first press lands.
 */
function fakeTab(opts: { stallAfterPress: boolean }) {
  const presses: number[] = [];
  const read = (): ScreenRead => {
    const settled = !(opts.stallAfterPress && presses.length > 0);
    return {
      ready: true, settled, reason: settled ? "menu-open" : "ui-transition", mode: UiMode.TARGET_SELECT,
      phaseName: "SelectTargetPhase", wave: 13, turn: 1, runLive: true, tutorialActive: false, handler: "TargetSelectUiHandler",
      cursor: 2, modeChain: [], messageText: null, onActionInput: false, awaitingActionInput: false, fine: "target|2",
      domMode: "TARGET_SELECT", gameVersion: "1.12.0.11", screen: "TARGET_SELECT", ...money,
    };
  };
  const menu: MenuRead = {
    readable: true, mode: UiMode.TARGET_SELECT, screen: "TARGET_SELECT", family: "target_select", cursor: 2, text: null,
    options: [{ i: 2, label: "Zigzagoon" }, { i: 3, label: "Sentret" }], extra: { isMultipleTargets: false },
  };
  const tab = drive({ read, menu: () => menu, onPress: b => { presses.push(b); }, onRawKey: () => true });
  return { driver: tab.driver, presses, now: tab.now };
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
  const presses: number[] = [];
  const targets = opts.targets.map(o => o.i);
  let cursor = opts.cursor;
  let committed: number[] | null = null;
  const read = (): ScreenRead => ({
    ready: true, settled: true, reason: "menu-open", mode: committed === null ? UiMode.TARGET_SELECT : UiMode.COMMAND,
    phaseName: committed === null ? "SelectTargetPhase" : "CommandPhase", wave: 7, turn: 1, runLive: true, tutorialActive: false,
    handler: "TargetSelectUiHandler", cursor, modeChain: [], messageText: null, onActionInput: false, awaitingActionInput: false,
    fine: `target|${cursor}|${committed}`, domMode: null, gameVersion: "1.12.0.11", screen: committed === null ? "TARGET_SELECT" : "COMMAND", ...money,
  });
  const menu = (): MenuRead => ({
    readable: true, mode: UiMode.TARGET_SELECT, screen: "TARGET_SELECT", family: "target_select", cursor, text: null,
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
  const { driver } = drive({ read, menu, onPress: press });
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
 * BALL as #46 reads it: `Name ×count` rows then Cancel, a plain UP/DOWN list. ACTION throws the ball under the cursor.
 * `trainer` marks the battle uncatchable as the reader does (#56); `command` opens on COMMAND instead, Ball at row 1.
 */
function ballTab(opts: { trainer?: boolean; command?: boolean } = {}) {
  const presses: number[] = [];
  let cursor = 0;
  let thrown: number | null = null;
  const read = (): ScreenRead => ({
    ready: true, settled: true, reason: "menu-open", mode: thrown !== null ? UiMode.MESSAGE : opts.command ? UiMode.COMMAND : UiMode.BALL,
    screen: thrown !== null ? "MESSAGE" : opts.command ? "COMMAND" : "BALL",
    phaseName: "CommandPhase", wave: 7, turn: 1, runLive: true, tutorialActive: false, handler: "BallUiHandler", cursor,
    modeChain: [], messageText: null, onActionInput: false, awaitingActionInput: false,
    fine: `ball|${cursor}|${thrown}`, domMode: null, gameVersion: "1.12.0.11", ...money,
  });
  const options = [
    { i: 0, label: "Poké Ball ×13", name: "Poké Ball", ballType: 0, count: 13 },
    { i: 1, label: "Great Ball ×9", name: "Great Ball", ballType: 1, count: 9 },
    { i: 2, label: "Ultra Ball ×0", name: "Ultra Ball", ballType: 2, count: 0 },
    { i: 3, label: "Cancel" },
  ];
  const extra = opts.trainer ? { catchable: false } : { catchable: true };
  const commands = [{ i: 0, label: "Fight" }, { i: 1, label: "Ball" }, { i: 2, label: "Pokémon" }, { i: 3, label: "Run" }];
  const menu = (): MenuRead => opts.command
    ? { readable: true, mode: UiMode.COMMAND, screen: "COMMAND", family: "command", cursor, text: null, options: commands, extra: { fieldIndex: 0, ...extra } }
    : { readable: true, mode: UiMode.BALL, screen: "BALL", family: "ball", cursor, text: null, options, extra };
  const press = (b: number) => {
    presses.push(b);
    if (b === Button.ACTION) thrown = cursor;
    else if (b === Button.DOWN) cursor = cursor < 3 ? cursor + 1 : 0;
    else if (b === Button.UP) cursor = cursor ? cursor - 1 : 3;
  };
  const { driver } = drive({ read, menu, onPress: press });
  return { driver, presses, thrown: () => thrown };
}

test("select_option throws a ball by its name, without the count (#46)", async () => {
  const tab = ballTab();
  const r = await outcome(tab.driver.selectOption("Great Ball", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(r.selected, "Great Ball ×9");
  assert.equal(tab.thrown(), 1);
  assert.deepEqual(tab.presses, [Button.DOWN, Button.ACTION]);
});

test("select_option by index accepts the ball's name as the label check (#46)", async () => {
  const tab = ballTab();
  const r = await outcome(tab.driver.selectOption("Poké Ball", 0, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(tab.thrown(), 0);
});

test("select_option refuses a ball in a trainer battle without pressing anything (#56)", async () => {
  const tab = ballTab({ trainer: true });
  const r = await outcome(tab.driver.selectOption("Great Ball", undefined, undefined, {}));
  assert.equal(r.error, "cannot_catch_trainer");
  assert.deepEqual(tab.presses, []);
  assert.equal(tab.thrown(), null);
});

test("select_option still takes Cancel on BALL in a trainer battle (#56)", async () => {
  const tab = ballTab({ trainer: true });
  const r = await outcome(tab.driver.selectOption("Cancel", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
});

test("select_option refuses Ball on COMMAND in a trainer battle, and read_menu flags it uncatchable (#56)", async () => {
  const tab = ballTab({ trainer: true, command: true });
  const r = await outcome(tab.driver.selectOption("Ball", undefined, undefined, {}));
  assert.equal(r.error, "cannot_catch_trainer");
  assert.deepEqual(tab.presses, []);
  const m = await outcome(tab.driver.readMenu({}));
  assert.equal((m.extra as Record<string, unknown>).catchable, false);
});

test("select_option takes Ball on COMMAND in a wild battle (#56)", async () => {
  const tab = ballTab({ command: true });
  const r = await outcome(tab.driver.selectOption("Ball", undefined, undefined, {}));
  assert.notEqual(r.error, "cannot_catch_trainer", JSON.stringify(r));
});

/**
 * `start_run` on a scripted tab, from TITLE to the first decision after the save slot. Slot 1 holds a run, the rest are
 * empty. ACTION on a free slot starts the run and settles on CheckSwitchPhase's "Will you switch Pokémon?" CONFIRM, the
 * screen #30 mistook for the overwrite confirm; ACTION on Slot 1 opens the real overwrite confirm first. CANCEL on the
 * grid with an empty party asks to return to the title; Yes goes there (#41), after `yesLingers` settled polls still on
 * the grid, as the live handler sets STARTER_SELECT before the title phase shows TITLE. With `gameModeStalls` the
 * game-mode select never settles; with `filterBar` the grid opens with its filter bar active. `titleMenuScreen` is the
 * Screen the menu reader sees on TITLE, when it differs from the settled read's.
 */
function startRunTab(opts: { costs?: Record<string, number>; cancelIgnored?: boolean; yesIgnored?: boolean; yesLingers?: number; gameModeStalls?: boolean; filterBar?: boolean; titleMenuScreen?: string } = {}) {
  const presses: number[] = [];
  const slots = [0, 1, 2, 3, 4].map(i => ({ i, label: `Slot ${i + 1}`, hasData: i === 0 }));
  type Screen = { mode: number; screen: string; phase: string; chain: number[]; family: string; options: string[]; text?: string };
  const title: Screen = { mode: UiMode.TITLE, screen: "TITLE", phase: "TitlePhase", chain: [], family: "option_select", options: ["Continue", "New Game", "Load Game", "Run History", "Settings"] };
  const gameMode: Screen = { mode: UiMode.OPTION_SELECT, screen: "OPTION_SELECT", phase: "TitlePhase", chain: [UiMode.TITLE], family: "option_select", options: ["Classic", "Daily Run", "Cancel"] };
  const grid: Screen = { mode: UiMode.STARTER_SELECT, screen: opts.filterBar ? "STARTER_SELECT/FILTER" : "STARTER_SELECT", phase: "SelectStarterPhase", chain: [UiMode.TITLE], family: "starter_select", options: [] };
  const starterMenu: Screen = { ...gameMode, phase: "SelectStarterPhase", chain: [UiMode.TITLE, UiMode.STARTER_SELECT], options: ["Add to Party", "Cancel"] };
  const begin: Screen = { mode: UiMode.CONFIRM, screen: "CONFIRM", phase: "SelectStarterPhase", chain: [UiMode.TITLE, UiMode.STARTER_SELECT], family: "option_select", options: ["Yes", "No"] };
  const saveSlot: Screen = { mode: UiMode.SAVE_SLOT, screen: "SAVE_SLOT/SAVE", phase: "SelectStarterPhase", chain: [UiMode.TITLE, UiMode.TITLE], family: "save_slot", options: [] };
  // The stale chain entries below the top are what the live game showed (#30).
  const overwriteConfirm: Screen = { ...begin, chain: [UiMode.TITLE, UiMode.TITLE, UiMode.SAVE_SLOT], text: "Overwrite the data in the selected slot?" };
  const switchConfirm: Screen = { ...begin, phase: "CheckSwitchPhase", chain: [UiMode.TITLE], text: "Will you switch\nPokémon?" };
  const exitConfirm: Screen = { ...begin, text: "Return to the title screen?" };
  const costs = opts.costs ?? { Bulbasaur: 3 };
  const starterGrid = Object.entries(costs).map(([name, cost], i) => ({ i, name, cost }));

  let screen = title;
  let cursor = 0;
  let party: string[] = [];
  let gridCursor = 0;
  let lingering = 0;
  const go = (next: Screen) => { screen = next; cursor = 0; };
  const read = (): ScreenRead => {
    if (lingering > 0 && --lingering === 0) go(title);
    return readScreen();
  };
  const readScreen = (): ScreenRead => ({
    ready: true, ...(opts.gameModeStalls && screen === gameMode ? { settled: false, reason: "ui-transition" } : { settled: true, reason: "menu-open" }), mode: screen.mode, screen: screen.screen, phaseName: screen.phase, wave: screen === switchConfirm ? 1 : null,
    turn: null, runLive: screen === switchConfirm, tutorialActive: false, handler: null, cursor, modeChain: screen.chain,
    messageText: screen.text ?? null, onActionInput: false, awaitingActionInput: false, fine: `${screen.mode}|${screen.phase}|${cursor}|${party.length}`,
    domMode: null, gameVersion: "1.12.0.11", ...money,
  });
  const menu = (): MenuRead => ({
    readable: true, mode: screen.mode, screen: screen === title ? (opts.titleMenuScreen ?? title.screen) : screen.screen, family: screen.family, cursor, text: screen.text ?? null, extra: {},
    options: screen === saveSlot ? slots : screen.options.map((label, i) => ({ i, label })),
  });
  const press = (b: number) => {
    presses.push(b);
    if (b === Button.DOWN) cursor++;
    else if (b === Button.UP) cursor--;
    else if (b === Button.SUBMIT && screen === grid) go(begin);
    else if (b === Button.CANCEL && screen === grid && party.length === 0 && !opts.cancelIgnored) go(exitConfirm);
    else if (b === Button.ACTION) {
      if (screen === title) go(gameMode);
      else if (screen === gameMode) go(grid);
      else if (screen === grid) go(starterMenu);
      else if (screen === starterMenu) { party = [...party, starterGrid[gridCursor].name]; go(grid); }
      else if (screen === exitConfirm && opts.yesIgnored) return;
      else if (screen === exitConfirm && cursor === 0 && opts.yesLingers) { go(grid); lingering = opts.yesLingers; }
      else if (screen === exitConfirm) go(cursor === 0 ? title : grid);
      else if (screen === begin) go(saveSlot);
      else if (screen === saveSlot) go(slots[cursor].hasData ? overwriteConfirm : switchConfirm);
      else if (screen === overwriteConfirm) go(switchConfirm);
    }
  };
  const { driver } = drive({
    read,
    menu,
    onPress: press,
    starterGrid: () => ({ ok: true, grid: starterGrid, valueLimit: 10, party, partyValid: true }),
    onSetCursor: target => {
      if (target.family === "starter_select") {
        gridCursor = target.index;
        return { ok: true, species: starterGrid[target.index].name };
      }
      if (target.family === "option_select") {
        cursor = target.index;
        return { ok: true };
      }
      throw new Error(`unexpected setCursor on ${target.family}`);
    },
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

test("start_run over budget backs out to TITLE before refusing, so a corrected start_run works at once (#41)", async () => {
  const tab = startRunTab({ costs: { Bulbasaur: 3, Mewtwo: 11 } });
  const r = await outcome(tab.driver.startRun(["Bulbasaur", "Mewtwo"], undefined, false, {}));
  assert.equal(r.error, "party_over_budget", JSON.stringify(r));
  assert.equal(r.screen, "TITLE");
  assert.equal(tab.screen().mode, UiMode.TITLE);
  const again = await outcome(tab.driver.startRun(["Bulbasaur"], undefined, false, {}));
  assert.equal(again.error, undefined, JSON.stringify(again));
  assert.equal(again.started, true);
});

test("start_run with a name not on the grid backs out to TITLE before refusing (#41)", async () => {
  const tab = startRunTab();
  const r = await outcome(tab.driver.startRun(["Missingno"], undefined, false, {}));
  assert.equal(r.error, "unknown_species", JSON.stringify(r));
  assert.equal(r.screen, "TITLE");
  assert.equal(tab.screen().mode, UiMode.TITLE);
});

test("start_run whose back-out fails still refuses, naming the manual way back to TITLE (#41)", async () => {
  const tab = startRunTab({ costs: { Bulbasaur: 3, Mewtwo: 11 }, cancelIgnored: true });
  const r = await outcome(tab.driver.startRun(["Bulbasaur", "Mewtwo"], undefined, false, {}));
  assert.equal(r.error, "party_over_budget", JSON.stringify(r));
  assert.equal(r.screen, "STARTER_SELECT");
  assert.match(String(r.next), /press\(CANCEL\).*select_option\("Yes"\)/);
  assert.ok(Array.isArray(r.log));
});

test("start_run waits past the grid the live game shows between Yes and TITLE (#41)", async () => {
  const tab = startRunTab({ costs: { Bulbasaur: 3, Mewtwo: 11 }, yesLingers: 8 });
  const r = await outcome(tab.driver.startRun(["Bulbasaur", "Mewtwo"], undefined, false, {}));
  assert.equal(r.error, "party_over_budget", JSON.stringify(r));
  assert.equal(r.screen, "TITLE");
  assert.equal(r.next, undefined);
});

test("start_run whose back-out stops on the return-to-title CONFIRM says to answer Yes, not to CANCEL (#41)", async () => {
  const tab = startRunTab({ costs: { Bulbasaur: 3, Mewtwo: 11 }, yesIgnored: true });
  const r = await outcome(tab.driver.startRun(["Bulbasaur", "Mewtwo"], undefined, false, {}));
  assert.equal(r.error, "party_over_budget", JSON.stringify(r));
  assert.equal(r.screen, "CONFIRM");
  assert.match(String(r.next), /select_option\("Yes"\)/);
  assert.doesNotMatch(String(r.next), /CANCEL/);
});

test("start_run that runs out of budget mid-setup returns timed_out with the step, not a refusal (#141)", async () => {
  const tab = startRunTab({ gameModeStalls: true });
  const r = await outcome(tab.driver.startRun(["Bulbasaur"], undefined, false, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(r.status, "timed_out");
  assert.equal(r.screen, "OPTION_SELECT");
  assert.equal(r.step, "title");
  assert.ok((r.log as string[]).some(l => l.startsWith("title:")));
  assert.match(String(r.next), /start_run/);
  assert.equal((r.diagnostic as { reason: string }).reason, "ui-transition");
});

test("start_run that arrives on the starter filter bar refuses filter_bar there, before reading the grid", async () => {
  const tab = startRunTab({ filterBar: true });
  const r = await outcome(tab.driver.startRun(["Bulbasaur"], undefined, false, {}));
  assert.equal(r.error, "filter_bar", JSON.stringify(r));
  assert.equal(r.screen, "STARTER_SELECT/FILTER");
  assert.deepEqual(tab.presses, [Button.ACTION, Button.ACTION], "title and game mode only; nothing on the filter bar");
});

test("start_run refuses screen_changed when the menu read's Screen differs from the settled read's, pressing nothing", async () => {
  const tab = startRunTab({ titleMenuScreen: "OPTION_SELECT" });
  const r = await outcome(tab.driver.startRun(["Bulbasaur"], undefined, false, {}));
  assert.equal(r.error, "screen_changed", JSON.stringify(r));
  assert.equal(r.screen, "OPTION_SELECT");
  assert.deepEqual(tab.presses, []);
});

/**
 * #28's Charmander on SUMMARY/LEARN_MOVE: Scratch, Growl, Ember, Flare Blitz and the new Metal Claw on row 4, where the
 * row cursor starts. ACTION on a moveset row forgets that move; on row 4 it declines. With `setCursorWorks: false` the
 * handler's setCursor is unavailable and the driver must walk the rows one press at a time. `fineTracksRow: false` drops
 * the row from the fine fingerprint (the #32 hole before #43); `readerFailsAfterPress` makes every menu read throw once a
 * button has been pressed. Raw arrow keys move the row like processInput does.
 */
function learnMoveTab(opts: { setCursorWorks: boolean; fineTracksRow?: boolean; readerFailsAfterPress?: boolean }) {
  const presses: number[] = [];
  const rawKeys: number[] = [];
  const moves = ["Scratch", "Growl", "Ember", "Flare Blitz", "Metal Claw"];
  let moveCursor = 4;
  let answered: number | null = null;
  const read = (): ScreenRead => ({
    ready: true, settled: true, reason: "menu-open", mode: answered === null ? UiMode.SUMMARY : UiMode.MESSAGE,
    screen: answered === null ? "SUMMARY/LEARN_MOVE" : "MESSAGE", phaseName: "LearnMovePhase",
    wave: 16, turn: 1, runLive: true, tutorialActive: false, handler: "SummaryUiHandler", cursor: 2, modeChain: [], messageText: null,
    onActionInput: false, awaitingActionInput: false, fine: `summary|2|${opts.fineTracksRow === false ? "" : moveCursor}|${answered}`, domMode: null,
    gameVersion: "1.12.0.11", ...money,
  });
  const menu = (): MenuRead =>
    opts.readerFailsAfterPress && presses.length > 0
      ? { readable: false, why: "reader threw", mode: -1, screen: "UNKNOWN(-1)", family: null, options: [], cursor: null, text: null, extra: {} }
      : {
          readable: true, mode: UiMode.SUMMARY, screen: "SUMMARY/LEARN_MOVE", family: "learn_move", cursor: moveCursor, text: null, extra: { moveSelect: true, page: 2 },
          options: moves.map((label, i) => ({ i, label, forget: i < 4 })),
        };
  const { driver } = drive({
    read,
    menu,
    onPress: b => {
      presses.push(b);
      if (b === Button.UP) moveCursor = moveCursor ? moveCursor - 1 : 4;
      else if (b === Button.DOWN) moveCursor = moveCursor < 4 ? moveCursor + 1 : 0;
      else if (b === Button.ACTION) answered = moveCursor;
    },
    // The raw keyboard reaches the same handler: an arrow key moves the row exactly as processInput does.
    onRawKey: b => {
      rawKeys.push(b);
      if (b === Button.UP) moveCursor = moveCursor ? moveCursor - 1 : 4;
      else if (b === Button.DOWN) moveCursor = moveCursor < 4 ? moveCursor + 1 : 0;
      return true;
    },
    onSetCursor: target => {
      if (target.family !== "learn_move") throw new Error(`unexpected setCursor on ${target.family}`);
      if (!opts.setCursorWorks) return { ok: false, why: "setCursor unavailable", threw: true };
      moveCursor = target.row;
      return { ok: true };
    },
  });
  return { driver, presses, rawKeys, answered: () => answered, moveCursor: () => moveCursor };
}

test("press(UP) on SUMMARY/LEARN_MOVE moves one row and reports changed (#32)", async () => {
  const tab = learnMoveTab({ setCursorWorks: true });
  const r = await outcome(tab.driver.press("UP", {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(tab.moveCursor(), 3);
  assert.deepEqual(tab.rawKeys, []);
  assert.equal(r.changed, true);
  assert.equal(r.raw_keyboard_fallback, false);
});

test("a press that moves neither the fingerprint nor the menu cursor still retries once on the raw keyboard (§6.4, #32)", async () => {
  const tab = fakeTab({ stallAfterPress: false });
  const r = await outcome(tab.driver.press("LEFT", {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(r.raw_keyboard_fallback, true);
  assert.equal(r.changed, false);
});

test("a menu read that fails after the press is not a cursor move: the raw retry still fires (#32)", async () => {
  const tab = learnMoveTab({ setCursorWorks: true, fineTracksRow: false, readerFailsAfterPress: true });
  const r = await outcome(tab.driver.press("UP", {}));
  assert.equal(r.raw_keyboard_fallback, true);
});

test("a press that moved the menu cursor is never retried on the raw keyboard, even when the fine fingerprint misses it (#32)", async () => {
  const tab = learnMoveTab({ setCursorWorks: true, fineTracksRow: false });
  const r = await outcome(tab.driver.press("UP", {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(tab.moveCursor(), 3, "one UP, one row");
  assert.deepEqual(tab.rawKeys, []);
  assert.equal(r.changed, true);
  assert.equal(r.raw_keyboard_fallback, false);
});

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
 * while it waits, every direction is swallowed. The fake mirrors the menu reader's party branch in that state: no options,
 * the handler's own message as text, `extra.messagePending`.
 */
function partyMessageTab() {
  const presses: number[] = [];
  const party = ["Fletchling", "Charmander"];
  const verbs = ["Apply", "Summary", "Cancel"];
  let optionsMode = true;
  let cursor = 1;
  let optionsCursor = 0;
  let message: string | null = null;
  const read = (): ScreenRead => ({
    ready: true, settled: true, reason: "menu-open", mode: UiMode.PARTY, phaseName: "SelectModifierPhase", wave: 21, turn: 1,
    runLive: true, tutorialActive: false, handler: "PartyUiHandler", cursor, modeChain: [UiMode.MODIFIER_SELECT], messageText: null,
    onActionInput: message !== null, awaitingActionInput: message !== null,
    fine: `party|${optionsMode}|${cursor}|${optionsCursor}|${message}`, domMode: null, gameVersion: "1.12.0.11",
    screen: screen(), ...money,
  });
  const screen = () => (optionsMode ? "PARTY/MODIFIER:options" : "PARTY/MODIFIER");
  const menu = (): MenuRead => {
    const extra = { optionsMode, partyUiMode: 4, transferMode: false, ...(message !== null ? { messagePending: true } : {}) };
    const on = { readable: true, mode: UiMode.PARTY, screen: screen(), family: "party", extra };
    if (message !== null) return { ...on, cursor, text: message, options: [] };
    if (optionsMode) return { ...on, cursor: optionsCursor, text: "Revive", options: verbs.map((label, i) => ({ i, label })) };
    return { ...on, cursor, text: null, options: [...party.map((label, i) => ({ i, label })), { i: 6, label: "Cancel" }] };
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
  const { driver } = drive({ read, menu, onPress: press });
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

/**
 * #45's wave 18 shop: Rarer Candy levels the whole party, and each level-up is its own MESSAGE with a live prompt. ACTION
 * on one shows the next; after the last the shop comes back. Every press moves `messageText`, so the chain is progress.
 */
function messageChainTab(count: number, opts: { cycle: boolean } = { cycle: false }) {
  const texts = Array.from({ length: count }, (_, i) => `Pokémon ${i + 1} grew to Lv. ${20 + i}!`);
  let shown: number | null = null;
  const onMessage = () => shown !== null && (opts.cycle || shown < count);
  const read = (): ScreenRead => {
    const text = shown === null ? null : texts[shown % count];
    return {
      ready: true, settled: true, reason: onMessage() ? "awaiting-action" : "menu-open", mode: onMessage() ? UiMode.MESSAGE : UiMode.MODIFIER_SELECT,
      screen: onMessage() ? "MESSAGE" : "MODIFIER_SELECT",
      phaseName: onMessage() ? "LevelUpPhase" : "SelectModifierPhase", wave: 18, turn: 1, runLive: true, tutorialActive: false, handler: null,
      cursor: 0, modeChain: [], messageText: onMessage() ? text : null, onActionInput: onMessage(), awaitingActionInput: onMessage(),
      fine: `chain|${shown}`, domMode: null, gameVersion: "1.12.0.11", ...money,
    };
  };
  const menu = (): MenuRead =>
    onMessage()
      ? { readable: true, mode: UiMode.MESSAGE, screen: "MESSAGE", family: "acknowledge", cursor: null, text: null, extra: { awaitingActionInput: true }, options: [] }
      : { readable: true, mode: UiMode.MODIFIER_SELECT, screen: "MODIFIER_SELECT", family: "modifier_select", cursor: 0, text: null, extra: {}, options: [{ i: 0, label: "Rarer Candy", row: 1, col: 0 }] };
  const { driver } = drive({
    read,
    menu,
    onSetCursor: target => {
      assert.deepEqual(target, { family: "modifier_select", row: 1, col: 0 });
      return { ok: true };
    },
    onPress: b => {
      assert.equal(b, Button.ACTION);
      shown = shown === null ? 0 : shown + 1;
    },
  });
  return { driver, shown: () => shown };
}

test("a chain of more messages than the auto-advance cap hands the next MESSAGE back as ok, not stuck (#45)", async () => {
  const tab = messageChainTab(15);
  const r = await outcome(tab.driver.selectOption("Rarer Candy", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(r.status, "ok", JSON.stringify(r.diagnostic));
  assert.equal(r.diagnostic, undefined);
  assert.equal(r.screen, "MESSAGE");
  assert.equal((r.messages as string[]).length, 12);
  assert.match(String(r.next), /press\("ACTION"\)/);

  const rest = await outcome(tab.driver.press("ACTION", {}));
  assert.equal(rest.status, "ok", JSON.stringify(rest.diagnostic));
  assert.equal(rest.screen, "MODIFIER_SELECT");
  assert.equal(tab.shown(), 15);
});

test("a message chain that really cycles still trips the stuck detector across capped calls (#45)", async () => {
  // Thirteen messages: one press plus twelve auto-advances brings every call back to the MESSAGE it started on.
  const tab = messageChainTab(13, { cycle: true });
  const statuses = [await outcome(tab.driver.selectOption("Rarer Candy", undefined, undefined, {}))];
  for (let i = 0; i < 4; i++) statuses.push(await outcome(tab.driver.press("ACTION", {})));
  // ACTION is the MESSAGE ladder's only rung and every call spent it, so the verdict goes past stuck to ladder-exhausted.
  assert.deepEqual(statuses.map(r => r.status), ["ok", "ok", "ok", "ok", "run_interrupted"]);
  const last = statuses.at(-1)!;
  assert.equal((last.diagnostic as { reason: string }).reason, "ladder-exhausted");
  assert.equal(last.next, undefined, "no press(ACTION) hint once the detector has tripped");
});

test("a chain the cap does not reach carries no next hint (#45)", async () => {
  const tab = messageChainTab(3);
  const r = await outcome(tab.driver.selectOption("Rarer Candy", undefined, undefined, {}));
  assert.equal(r.status, "ok", JSON.stringify(r.diagnostic));
  assert.equal(r.screen, "MODIFIER_SELECT");
  assert.equal(r.next, undefined);
});

/**
 * #55: a level-up chain whose ACTION presses leave the fine fingerprint where it was (the stats window swaps increments
 * for totals under the same message). Every press costs the settle's change grace, so the chain outlasts the call budget
 * while the game sits on a prompt waiting for ACTION.
 */
function unmovedChainTab() {
  let presses = 0;
  const read = (): ScreenRead => ({
    ready: true, settled: true, reason: "awaiting-action", mode: UiMode.MESSAGE, phaseName: "LevelUpPhase", wave: 30, turn: 2,
    runLive: true, tutorialActive: false, handler: "BattleMessageUiHandler", cursor: null, modeChain: [], messageText: "Bulbasaur grew to Lv. 24!",
    onActionInput: true, awaitingActionInput: true, fine: "levelup", domMode: null, gameVersion: "1.12.0.11", screen: "MESSAGE", ...money,
  });
  const menu: MenuRead = { readable: true, mode: UiMode.MESSAGE, screen: "MESSAGE", family: "acknowledge", cursor: null, text: "Bulbasaur grew to Lv. 24!", extra: { awaitingActionInput: true }, options: [] };
  const { driver } = drive({
    read,
    menu: () => menu,
    onPress: b => {
      assert.equal(b, Button.ACTION);
      presses++;
    },
    onRawKey: () => true,
  });
  return { driver, presses: () => presses };
}

test("an acting call that runs out of budget on a MESSAGE waiting for ACTION says so, instead of a bare timed_out (#55)", async () => {
  const tab = unmovedChainTab();
  const r = await outcome(tab.driver.press("ACTION", {}));
  assert.equal(r.status, "timed_out", JSON.stringify(r));
  assert.equal(r.message_pending, true);
  assert.match(String(r.next), /press\(ACTION\)/);
  assert.match(String(r.note), /ACTION/);
});

/**
 * The guards every acting call passes before its first press (#126 left them in the Driver). Unless `onPress` is given
 * the screen scripts no press: a guard that let the call through fails the test with `unexpected press`.
 */
function guardedTab(over: Pick<FakeScreen, "lockHolder" | "frame" | "menu" | "onPress" | "onRawKey" | "pumps" | "unreachable"> & { mode?: number; screen?: string } = {}) {
  const mode = over.mode ?? UiMode.COMMAND;
  const read = (): ScreenRead => ({
    ready: true, settled: true, reason: "menu-open", mode, screen: over.screen ?? "COMMAND", phaseName: "CommandPhase", wave: 5, turn: 1, runLive: true, tutorialActive: false,
    handler: null, cursor: 0, modeChain: [], messageText: null, onActionInput: false, awaitingActionInput: false, fine: `guard|${mode}`,
    domMode: null, gameVersion: "1.12.0.11", ...money,
  });
  const { mode: _mode, screen: _screen, ...screen } = over;
  return drive({ ...screen, read });
}

/** COMMAND's 2×2 grid as the menu reader sees it: `screen` is the Screen it reads, which a test may move away from the settled read's. */
function commandMenu(cursor: number, screen = "COMMAND"): MenuRead {
  const options = ["Fight", "Ball", "Pokémon", "Run"].map((label, i) => ({ i, label }));
  return { readable: true, mode: UiMode.COMMAND, screen, family: "command", cursor, text: null, extra: { fieldIndex: 0, catchable: true }, options };
}

test("an acting call refuses tab_contended while another live driver holds the lock, pressing nothing", async () => {
  const tab = guardedTab({ lockHolder: process.ppid });
  const r = await outcome(tab.driver.press("ACTION", {}));
  assert.equal(r.error, "tab_contended", JSON.stringify(r));
  assert.equal(r.holder, process.ppid);
});

test("an acting call refuses settings_mode on a settings screen, pressing nothing", async () => {
  const tab = guardedTab({ mode: UiMode.SETTINGS });
  const r = await outcome(tab.driver.press("ACTION", {}));
  assert.equal(r.error, "settings_mode", JSON.stringify(r));
});

test("an acting call refuses filter_bar while the starter filter bar is active, pressing nothing", async () => {
  const tab = guardedTab({ mode: UiMode.STARTER_SELECT, screen: "STARTER_SELECT/FILTER" });
  const r = await outcome(tab.driver.press("ACTION", {}));
  assert.equal(r.error, "filter_bar", JSON.stringify(r));
  assert.equal(r.screen, "STARTER_SELECT/FILTER");
});

test("select_option refuses screen_changed when the menu read's Screen differs from the settled read's, pressing nothing (#133)", async () => {
  const tab = guardedTab({ menu: () => commandMenu(0, "FIGHT") });
  const r = await outcome(tab.driver.selectOption("Run", undefined, undefined, {}));
  assert.equal(r.error, "screen_changed", JSON.stringify(r));
  assert.equal(r.screen, "FIGHT");
  assert.equal(r.was, "COMMAND");
});

test("a cursor walk whose Screen changes under it stops as screen_changed, counting the presses already sent (#133)", async () => {
  const presses: number[] = [];
  const tab = guardedTab({ menu: () => commandMenu(presses.length ? 2 : 0, presses.length ? "PARTY/SWITCH" : "COMMAND"), onPress: b => { presses.push(b); } });
  const r = await outcome(tab.driver.selectOption("Run", undefined, undefined, {}));
  assert.equal(r.error, "screen_changed", JSON.stringify(r));
  assert.equal(r.screen, "PARTY/SWITCH");
  assert.equal(r.presses, 1);
  assert.deepEqual(presses, [Button.DOWN], "nothing committed on the new screen");
});

test("a menu read that failed is no Screen change: acting calls refuse as before, read-only calls keep the settled Screen (#133)", async () => {
  const failed: MenuRead = { readable: false, why: "reader threw", mode: -1, screen: "UNKNOWN(-1)", family: null, options: [], cursor: null, text: null, extra: {} };
  const tab = guardedTab({ menu: () => failed });
  const r = await outcome(tab.driver.selectOption("Run", undefined, undefined, {}));
  assert.equal(r.error, "no_options", JSON.stringify(r));
  const menu = await outcome(tab.driver.readMenu({}));
  assert.equal(menu.screen, "COMMAND");
  assert.equal(menu.cancel_effect, "rejected", "the ladder answers for the settled Screen");
});

test("read-only calls never refuse on a Screen mismatch and report the menu read's newer Screen (#133)", async () => {
  const tab = guardedTab({ menu: () => commandMenu(0, "FIGHT") });
  const menu = await outcome(tab.driver.readMenu({}));
  assert.equal(menu.error, undefined, JSON.stringify(menu));
  assert.equal(menu.screen, "FIGHT");
  const state = await outcome(tab.driver.getState("lean", {}));
  assert.equal(state.error, undefined, JSON.stringify(state));
  assert.equal(state.screen, "FIGHT");
});

test("an acting call refuses loop_frozen when the frame does not advance across the check, pressing nothing (#23)", async () => {
  const tab = guardedTab({ frame: () => 7 });
  const r = await outcome(tab.driver.press("ACTION", {}));
  assert.equal(r.error, "loop_frozen", JSON.stringify(r));
  assert.equal(r.frame, 7);
});

test("a transport whose settles pump has no frozen loop to refuse (§10.3, §12.2)", async () => {
  const presses: number[] = [];
  // The fingerprint never moves on this scripted screen, so the press takes §6.4's one raw-keyboard retry.
  const tab = guardedTab({ pumps: true, frame: () => 7, onPress: b => { presses.push(b); }, onRawKey: () => true, menu: () => commandMenu(0) });
  const r = await outcome(tab.driver.press("ACTION", {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.deepEqual(presses, [Button.ACTION]);
});

test("every tool refuses with the failing rung's line before it reads anything (§12.2, §12.3)", async () => {
  const unreachable = { code: "unreachable" as const, rung: 7, line: "Coachemon is connected, but no pokerogue.net tab is ready. Open or reload pokerogue.net." };
  // No `read` is scripted: a tool that got as far as settling would fail with `unexpected read`.
  const tab = drive({ unreachable });
  for (const call of [tab.driver.getState("lean", {}), tab.driver.readMenu({}), tab.driver.press("ACTION", {}), tab.driver.selectOption("Fight", undefined, undefined, {})]) {
    const r = await outcome(call);
    assert.equal(r.error, "unreachable", JSON.stringify(r));
    assert.equal(r.rung, 7);
  }
});

test("more than one tab refuses `tabs` with the list, and a missing command refuses alone (§7.5, §8.5)", async () => {
  const tabs = [{ conn: 1, tab: 1, target: "chrome" as const, title: "PokéRogue", state: "ready" as const }];
  const many = drive({ unreachable: { code: "tabs", rung: 8, line: "2 pokerogue.net tabs are open (Chrome: PokéRogue; Firefox: PokéRogue). Close all but one.", tabs } });
  const r = await outcome(many.driver.getState("lean", {}));
  assert.equal(r.error, "tabs", JSON.stringify(r));
  assert.deepEqual(r.tabs, tabs);

  const short = drive({ unreachable: { code: "missing_command", rung: 4, line: "Coachemon 1.0.0 in Chrome is too old for this plugin. Update the extension." } });
  const s = await outcome(short.driver.readMenu({}));
  assert.equal(s.error, "missing_command", JSON.stringify(s));
});

test("status reports reachability, the transport's own facts and the game, and answers when nothing is reachable (§12.3)", async () => {
  const tab = guardedTab();
  const ok = await tab.driver.status();
  assert.equal(ok.reachable, true);
  assert.equal(ok.reach, null);
  assert.equal(ok.attached, true, "the transport's facts ride along");
  assert.equal(ok.screen, "COMMAND");
  assert.equal(ok.wave, 5);
  assert.equal(ok.game_version, "1.12.0.11");

  const reach = { code: "unreachable" as const, rung: 3, line: "No browser has Coachemon connected." };
  const out = await drive({ unreachable: reach }).driver.status();
  assert.equal(out.status, "ok", "status answers rather than refusing: it is the tool that says why");
  assert.equal(out.reachable, false);
  assert.deepEqual(out.reach, { rung: 3, line: reach.line });
  assert.equal(out.screen, "UNKNOWN(-1)");
  assert.equal(out.run_live, false);
});

test("a press decided on a screen the game has since left refuses game_moved, pressing nothing (§10.2)", async () => {
  // The game moves on its own during the guard's frame check, between the settled read and the press.
  let frames = 0;
  const presses: number[] = [];
  const tab = drive({
    guardFine: true,
    read: () => ({
      ready: true, settled: true, reason: "menu-open", mode: UiMode.COMMAND, screen: "COMMAND", phaseName: "CommandPhase", wave: 5, turn: 1, runLive: true,
      tutorialActive: false, handler: null, cursor: 0, modeChain: [], messageText: null, onActionInput: false, awaitingActionInput: false,
      fine: frames >= 2 ? "command|turn 2" : "command|turn 1", domMode: null, gameVersion: "1.12.0.11", ...money,
    }),
    frame: () => ++frames,
    onPress: b => { presses.push(b); },
  });
  const r = await outcome(tab.driver.press("ACTION", {}));
  assert.equal(r.error, "game_moved", JSON.stringify(r));
  assert.deepEqual(presses, []);
});

/** CONFIRM [Yes, No] whose `setCursor` moves the cursor the fine fingerprint carries; ACTION answers the option under it. */
function confirmTab() {
  let cursor = 0;
  let answered: string | null = null;
  const labels = ["Yes", "No"];
  const tab = drive({
    guardFine: true,
    read: () => ({
      ready: true, settled: true, reason: "menu-open", mode: answered === null ? UiMode.CONFIRM : UiMode.COMMAND, screen: answered === null ? "CONFIRM" : "COMMAND",
      phaseName: "CheckSwitchPhase", wave: 5, turn: 1, runLive: true, tutorialActive: false, handler: null, cursor, modeChain: [], messageText: null,
      onActionInput: false, awaitingActionInput: false, fine: `confirm|${cursor}|${answered}`, domMode: null, gameVersion: "1.12.0.11", ...money,
    }),
    menu: () => ({
      readable: true, mode: UiMode.CONFIRM, screen: "CONFIRM", family: "option_select", cursor, text: null,
      options: labels.map((label, i) => ({ i, label })), extra: { unskippedIndices: [0, 1] },
    }),
    onSetCursor: t => {
      cursor = (t as { index: number }).index;
      return { ok: true };
    },
    onPress: b => {
      assert.equal(b, Button.ACTION);
      answered = labels[cursor];
    },
  });
  return { ...tab, answered: () => answered };
}

test("select_option commits on the fingerprint its own cursor move left, not the one it settled on (§10.2)", async () => {
  const tab = confirmTab();
  const r = await outcome(tab.driver.selectOption("No", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(tab.answered(), "No");
});

test("auto-advance that finds the game moved on settles again and answers the message now showing (§10.2)", async () => {
  // Two messages; the second replaces itself with a third just before the auto-advance press reaches it.
  let shown = 0;
  let raced = false;
  const texts = ["Wild Pidgey fainted!", "Bulbasaur gained 30 EXP!", "Bulbasaur grew to Lv. 6!"];
  const onMessage = () => shown < texts.length;
  const pressed: string[] = [];
  const tab = drive({
    guardFine: true,
    read: () => ({
      ready: true, settled: true, reason: onMessage() ? "awaiting-action" : "menu-open", mode: onMessage() ? UiMode.MESSAGE : UiMode.COMMAND,
      screen: onMessage() ? "MESSAGE" : "COMMAND", phaseName: "VictoryPhase", wave: 5, turn: 1, runLive: true, tutorialActive: false, handler: null,
      cursor: 0, modeChain: [], messageText: onMessage() ? texts[shown] : null, onActionInput: onMessage(), awaitingActionInput: onMessage(),
      fine: `msg|${shown}`, domMode: null, gameVersion: "1.12.0.11", ...money,
    }),
    menu: () => (onMessage()
      ? { readable: true, mode: UiMode.MESSAGE, screen: "MESSAGE", family: "acknowledge", cursor: null, text: texts[shown], extra: {}, options: [] }
      : commandMenu(0)),
    onPress: b => {
      assert.equal(b, Button.ACTION);
      pressed.push(texts[shown]);
      shown++;
    },
  });
  const game = tab.game;
  const press = game.press;
  game.press = async (b, fine) => {
    if (shown === 1 && !raced) {
      raced = true;
      shown = 2;
    }
    return press(b, fine);
  };
  const r = await outcome(tab.driver.press("ACTION", {}));
  assert.equal(r.status, "ok", JSON.stringify(r));
  assert.equal(r.screen, "COMMAND");
  assert.deepEqual(pressed, ["Wild Pidgey fainted!", "Bulbasaur grew to Lv. 6!"], "nothing pressed on the message that went away");
});

test("a cursor walk that finds the game moved on settles again and walks on, not mistaking the unsent press for a stuck cursor", async () => {
  // The double-battle TARGET_SELECT of #40; the game moves once on its own before the first press, leaving the cursor alone.
  let cursor = 2;
  let tick = 0;
  let committed: number | null = null;
  const presses: number[] = [];
  const targets = [{ i: 2, label: "Starly" }, { i: 3, label: "Caterpie" }, { i: 1, label: "Lillipup" }];
  const tab = drive({
    guardFine: true,
    read: () => ({
      ready: true, settled: true, reason: "menu-open", mode: committed === null ? UiMode.TARGET_SELECT : UiMode.COMMAND, screen: committed === null ? "TARGET_SELECT" : "COMMAND",
      phaseName: "SelectTargetPhase", wave: 7, turn: 1, runLive: true, tutorialActive: false, handler: null, cursor, modeChain: [], messageText: null,
      onActionInput: false, awaitingActionInput: false, fine: `target|${cursor}|${committed}|${tick}`, domMode: null, gameVersion: "1.12.0.11", ...money,
    }),
    menu: () => ({ readable: true, mode: UiMode.TARGET_SELECT, screen: "TARGET_SELECT", family: "target_select", cursor, text: null, options: targets, extra: { isMultipleTargets: false } }),
    onPress: b => {
      presses.push(b);
      if (b === Button.ACTION) committed = cursor;
      else if (b === Button.DOWN && cursor >= 2) cursor = 1;
      else if (b === Button.RIGHT && cursor === 2) cursor = 3;
    },
  });
  const press = tab.game.press;
  tab.game.press = async (b, fine) => {
    if (tick === 0) tick = 1;
    return press(b, fine);
  };
  const r = await outcome(tab.driver.selectOption("Lillipup", undefined, undefined, {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(committed, 1);
  assert.deepEqual(presses, [Button.DOWN, Button.ACTION]);
});

test("a frame read that fails is not a frozen loop", async () => {
  let presses = 0;
  const tab = guardedTab({ frame: () => null, menu: () => commandMenu(0), onPress: () => { presses++; }, onRawKey: () => true });
  const r = await outcome(tab.driver.press("ACTION", {}));
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(presses, 1);
});
