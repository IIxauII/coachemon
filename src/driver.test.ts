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
 * double-battle TARGET_SELECT, where the cursor sits on Zigzagoon and no press ever moves it. With `stallAfterPress`
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
    options: [{ i: 2, label: "Zigzagoon" }, { i: 3, label: "Sentret" }], extra: { isMultipleTargets: true },
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
