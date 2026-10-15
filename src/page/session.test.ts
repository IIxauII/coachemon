import assert from "node:assert/strict";
import { test } from "node:test";
import { onPage, send } from "./fake-page.ts";

/** A `Storage` over `entries`, in their order, standing in for the tab's until the test ends. */
function storage(t: { after: (fn: () => void) => void }, entries: Record<string, string>) {
  const keys = Object.keys(entries);
  const store = { get length() { return keys.length; }, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null };
  const prev = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });
  t.after(() => {
    if (prev) Object.defineProperty(globalThis, "localStorage", prev);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });
}

const EXPORT = { seed: "VTAUX0Kaz7T3GDMR7LXP1Bhn", waveIndex: 180, gameVersion: "1.12.0.11", party: [] };

function battleScene(slot: number) {
  return {
    ui: { mode: 0, handlers: {} },
    sessionSlotId: slot,
    currentBattle: { waveIndex: 180, turn: 3, battleSeed: "U0QKEz8wJ8ea7832" },
    gameData: { getSessionSaveData: () => EXPORT },
  };
}

test("the session read hands back the slot's stored copies, the session as it stands, and the battle's wave and seed (extension-distribution.md §10.1)", t => {
  onPage(t, battleScene(1));
  storage(t, {
    "data_alice": "system",
    "sessionData1_alice": "U2FsdGVkX1-alice",
    "coach-me-journal": "[]",
    "sessionData1_bob": "U2FsdGVkX1-bob",
    "sessionData2_alice": "another slot",
  });
  const r = send("session", {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.wave, 180);
  assert.equal(r.battleSeed, "U0QKEz8wJ8ea7832");
  assert.deepEqual([...r.stored].sort(), ["U2FsdGVkX1-alice", "U2FsdGVkX1-bob"], "every account's copy for this slot, and nothing else");
  assert.deepEqual(r.export, EXPORT);
});

test("slot 0's key carries no digit, so another slot's copies never match it (game-code.md §29)", t => {
  onPage(t, battleScene(0));
  storage(t, { "sessionData_alice": "slot 0", "sessionData1_alice": "slot 1", "sessionData4_alice": "slot 4" });
  assert.deepEqual(send("session", {}).stored, ["slot 0"]);
});

test("with no battle there is no session to read, and the export is never built (extension-distribution.md §10.1)", t => {
  let built = false;
  onPage(t, { ui: { mode: 0, handlers: {} }, sessionSlotId: 0, currentBattle: null, gameData: { getSessionSaveData: () => { built = true; return {}; } } });
  storage(t, {});
  assert.deepEqual(send("session", {}), { ok: false, why: "no-battle" });
  assert.equal(built, false);
});
