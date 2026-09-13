import assert from "node:assert/strict";
import { test } from "node:test";
import type { CdpSession } from "./cdp/session.ts";
import { Driver, type MenuRead } from "./driver.ts";
import { Button, UiMode } from "./enums/generated.ts";
import { Refusal } from "./envelope.ts";
import * as js from "./game/js.ts";
import { CALL_BUDGET_MS, type Ready } from "./settle.ts";

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
      frame: ++frame, domMode: "TARGET_SELECT", gameVersion: "1.12.0.11", disc,
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
