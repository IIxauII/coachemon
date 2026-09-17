import assert from "node:assert/strict";
import { test } from "node:test";
import { offPage, onPage, send } from "./fake-page.ts";

/** A MESSAGE screen as LevelUpPhase leaves it (BattleMessageUiHandler.promptLevelUpStats): same text throughout, stats window on top. */
function levelUpScene(stats: "hidden" | "increments" | "totals") {
  const mh = {
    active: true,
    awaitingActionInput: true,
    onActionInput: () => {},
    message: { text: "Bulbasaur grew to Lv. 24!" },
    levelUpStatsContainer: { visible: stats !== "hidden" },
    levelUpStatsIncrContent: { visible: stats === "increments" },
  };
  return { ui: { mode: 0, handlers: { 0: mh } }, phaseManager: { currentPhase: { phaseName: "LevelUpPhase" } }, currentBattle: { waveIndex: 30, turn: 2 } };
}

test("the fine fingerprint moves through the level-up stats window, whose presses leave the message text alone (#55)", t => {
  const scene = levelUpScene("hidden");
  onPage(t, scene);
  const fps = new Set<string>();
  for (const stats of ["hidden", "increments", "totals"] as const) {
    scene.ui.handlers[0] = levelUpScene(stats).ui.handlers[0];
    const r = send("probe", {});
    if (stats === "increments") assert.equal(r.settled, true);
    fps.add(r.fine);
  }
  assert.equal(fps.size, 3);
});

/** PARTY/MODIFIER's option phase over a two-slot party, as PartyUiHandler holds it mid-shop. */
function partyOptionsScene() {
  const h = {
    active: true, partyUiMode: 4, optionsMode: true, transferMode: false, optionsCursor: 1, cursor: 1,
    optionsContainer: { list: [{ text: "Summary", y: 20 }, { text: "[shadow]Apply[/shadow]", y: 0 }, { text: "Cancel", y: 40 }] },
  };
  return { ui: { mode: 8, handlers: { 8: h } }, phaseManager: { currentPhase: { phaseName: "SelectModifierPhase" } } };
}

test("the probe and the menu reader read the same discriminators, and the reader keeps no copies of them (#133)", t => {
  onPage(t, partyOptionsScene());
  const read = send("probe", {});
  const menu = send("menu", {});
  assert.deepEqual(menu.disc, read.disc);
  assert.deepEqual(read.disc, { partyUiMode: 4, optionsMode: true, saveSlotUiMode: null, summaryUiMode: null, alertClosable: false, filterMode: false, transferMode: false });
  assert.deepEqual(menu.options.map((o: { label: string }) => o.label), ["Apply", "Summary", "Cancel"], "the option phase is chosen from disc");
  for (const k of ["optionsMode", "partyUiMode", "transferMode"]) assert.ok(!(k in menu.extra), `extra.${k} is the adapter's to fill`);
});

/** A settled COMMAND screen on a game loop that advances only when ticked. */
function frozenLoop() {
  const loop = { frame: 40, ticks: 0, tick() { this.ticks++; this.frame++; } };
  const scene = { ui: { mode: 2, handlers: { 2: { active: true, cursor: 0 } } }, phaseManager: { currentPhase: { phaseName: "CommandPhase" } } };
  return { loop, scene };
}

test("pump ticks the loop once when its frame has not advanced since the previous probe (§10.3)", t => {
  const { loop, scene } = frozenLoop();
  onPage(t, scene, { loop });
  send("probe", {});
  const r = send("probe", { pump: true });
  assert.equal(r.pumped, true);
  assert.equal(loop.ticks, 1);
  assert.equal(r.frame, 41);
});

test("pump leaves a running loop alone, and a probe without pump never ticks", t => {
  const { loop, scene } = frozenLoop();
  onPage(t, scene, { loop });
  send("probe", {});
  assert.equal(send("probe", {}).pumped, false, "no pump asked");
  loop.frame += 3;
  assert.equal(send("probe", { pump: true }).pumped, false, "the loop moved on its own");
  assert.equal(loop.ticks, 0);
});

test("errorAt and tail come from the page's error recorder", t => {
  const g = globalThis as { __coachemonErrors?: unknown };
  g.__coachemonErrors = { at: 1234, lines: [{ t: "2026-09-17T00:00:00.000Z", level: "exception", text: "boom" }] };
  t.after(() => delete g.__coachemonErrors);
  onPage(t, frozenLoop().scene);
  const plain = send("probe", {});
  assert.equal(plain.errorAt, 1234);
  assert.equal("console" in plain, false, "console only with tail");
  assert.deepEqual(send("probe", { tail: true }).console, [{ t: "2026-09-17T00:00:00.000Z", level: "exception", text: "boom" }]);
});

test("without a recorder errorAt is null and the tail is empty", t => {
  onPage(t, frozenLoop().scene);
  const r = send("probe", { tail: true });
  assert.equal(r.errorAt, null);
  assert.deepEqual(r.console, []);
});

test("off the game the probe reports not ready, with its reason", t => {
  offPage(t);
  assert.deepEqual(send("probe", {}), { ready: false, why: "no-phaser", frame: null, domMode: null, pumped: false, errorAt: null });
});
