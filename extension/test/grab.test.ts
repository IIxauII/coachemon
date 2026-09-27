/** The hop from the browser's shortcut into one tab's relay, driven over its injected deps. */
import assert from "node:assert/strict";
import test from "node:test";
import { startGrab, type GrabDeps } from "../src/grab.ts";
import type { ToRelay } from "../src/messages.ts";

function deps() {
  const handlers: ((tab: number | undefined) => void)[] = [];
  const sent: { tab: number; message: ToRelay }[] = [];
  const d: GrabDeps = {
    onCommand: fn => void handlers.push(fn),
    toTab: (tab, message) => void sent.push({ tab, message }),
  };
  return { d, handlers, sent, fire: (tab: number | undefined) => handlers[0](tab) };
}

test("the shortcut listener is registered before the factory returns", () => {
  const h = deps();
  // No `await` between here and the assertion: a listener registered behind one never wakes Chrome's service worker.
  startGrab(h.d);
  assert.equal(h.handlers.length, 1, "the factory returned with no shortcut listener registered");
});

test("the tab the shortcut handler is handed is the tab the grab goes to, and nothing else is ever sent", () => {
  const h = deps();
  startGrab(h.d);
  h.fire(17);
  h.fire(4);
  assert.deepEqual(
    h.sent,
    [{ tab: 17, message: { t: "grab" } }, { tab: 4, message: { t: "grab" } }],
    "a grab went somewhere other than the tab handed over, or carried something other than the grab",
  );
});

test("a fire with no tab sends nothing", () => {
  const h = deps();
  startGrab(h.d);
  h.fire(undefined);
  assert.deepEqual(h.sent, [], "a shortcut with no tab behind it still sent a grab");
});
