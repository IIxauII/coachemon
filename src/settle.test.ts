import assert from "node:assert/strict";
import { test } from "node:test";
import { AGREE, CHANGE_GRACE_MS, POLL_MS, settle, type PredicateRead, type Ready } from "./settle.ts";

const disc = { partyUiMode: null, optionsMode: false, saveSlotUiMode: null, summaryUiMode: null, alertClosable: false, filterMode: false, transferMode: false };

function ready(over: Partial<Ready> = {}): Ready {
  return {
    ready: true, settled: true, reason: "menu-open", mode: 2, phaseName: "CommandPhase", wave: 3, turn: 1, money: 1000, runLive: true,
    tutorialActive: false, handler: "CommandUiHandler", cursor: 0, modeChain: [], messageText: null, onActionInput: false,
    awaitingActionInput: false, fine: "A", frame: 100, domMode: "COMMAND", gameVersion: "1.12.0.11", disc, ...over,
  };
}

/** A scripted poller with a fake clock: each poll advances time by POLL_MS. */
function scripted(reads: (PredicateRead | { __throw: string })[]) {
  let t = 0;
  let i = 0;
  return {
    deps: {
      poll: async () => reads[Math.min(i++, reads.length - 1)],
      now: () => t,
      sleep: async (ms: number) => { t += ms; },
    },
    polls: () => i,
  };
}

test("settles after AGREE identical settled samples when there is no pre-press value", async () => {
  const frames = [1, 2, 3, 4, 5].map(f => ready({ frame: f }));
  const { deps } = scripted(frames);
  const r = await settle(deps, null);
  assert.equal(r.settled, true);
  assert.equal(r.polls, AGREE);
  assert.equal(r.fpMoved, null);
});

test("does not exit while the fingerprint still equals its pre-press value (#8's early exit)", async () => {
  // Three settled polls on the old fingerprint, then the press lands.
  const reads = [ready({ frame: 1 }), ready({ frame: 2 }), ready({ frame: 3 }), ready({ fine: "B", frame: 4 }), ready({ fine: "B", frame: 5 }), ready({ fine: "B", frame: 6 })];
  const { deps } = scripted(reads);
  const r = await settle(deps, "A");
  assert.equal(r.settled, true);
  assert.equal(r.fpMoved, true);
  assert.equal(r.last && r.last.ready ? r.last.fine : null, "B");
  assert.equal(r.polls, 6);
});

test("an unmoved fingerprint is accepted once the change grace has elapsed", async () => {
  let f = 0;
  const { deps } = scripted(Array.from({ length: 100 }, () => ready({ frame: ++f })));
  const r = await settle(deps, "A");
  assert.equal(r.settled, true);
  assert.equal(r.fpMoved, false);
  assert.ok(r.elapsedMs > CHANGE_GRACE_MS);
});

test("a busy game times out at the budget with the last busy reason, and is not fatal", async () => {
  let f = 0;
  const { deps } = scripted(Array.from({ length: 1000 }, () => ready({ settled: false, reason: "ui-transition", frame: ++f })));
  const stalls: number[] = [];
  const r = await settle({ ...deps, budgetMs: 2_000, onStall: ms => stalls.push(ms) }, "A");
  assert.equal(r.settled, false);
  assert.equal(r.reason, "ui-transition");
  assert.equal(r.fpMoved, false);
  assert.ok(r.elapsedMs >= 2_000);
  assert.equal(stalls.length, 0, "no notice below the notice threshold");
});

test("a frozen loop is reported as loop-frozen even when the predicate says settled (#23)", async () => {
  const { deps } = scripted(Array.from({ length: 1000 }, () => ready({ frame: 7 })));
  const r = await settle({ ...deps, budgetMs: 1_000 }, null);
  assert.equal(r.settled, false);
  assert.equal(r.reason, "loop-frozen");
  assert.equal(r.loopFrozen, true);
});

test("locator failure is a busy reason, never a throw (#14)", async () => {
  const gone: PredicateRead = { ready: false, why: "no-battle-scene", frame: null, domMode: null };
  const { deps } = scripted([gone, gone, gone, ready({ frame: 1 }), ready({ frame: 2 }), ready({ frame: 3 })]);
  const r = await settle(deps, null);
  assert.equal(r.settled, true);
  assert.equal(r.polls, 6);
});

test("a page-side throw degrades the poll rather than the call", async () => {
  const { deps } = scripted([{ __throw: "TypeError: boom" }, ready({ frame: 1 }), ready({ frame: 2 }), ready({ frame: 3 })]);
  const r = await settle(deps, null);
  assert.equal(r.settled, true);
});

test("an aborted signal returns promptly and says so", async () => {
  let f = 0;
  const { deps } = scripted(Array.from({ length: 1000 }, () => ready({ settled: false, reason: "resolving", frame: ++f })));
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 0);
  const r = await settle({ ...deps, signal: ac.signal, sleep: async ms => { deps.sleep(ms); await new Promise(res => setImmediate(res)); } }, "A");
  assert.equal(r.settled, false);
  assert.equal(r.aborted, true);
  assert.ok(r.elapsedMs < 30_000);
  assert.ok(r.polls * POLL_MS <= r.elapsedMs + POLL_MS);
});
