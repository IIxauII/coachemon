import assert from "node:assert/strict";
import { test } from "node:test";
import type { MenuRead } from "./port.ts";
import { PREDICATE, READER } from "./js.ts";

/** Run an injected expression against a fake tab: a Phaser CanvasPool whose one entry carries a booted game. */
function evaluateIn<T>(expr: string, scene: Record<string, unknown>): T {
  const game = { isBooted: true, isRunning: true, scene: { getScene: (key: string) => (key === "battle" ? scene : null) } };
  const g = globalThis as { Phaser?: unknown };
  const prev = g.Phaser;
  g.Phaser = { Display: { Canvas: { CanvasPool: { pool: [{ parent: { game } }] } } } };
  try {
    return (0, eval)(expr) as T;
  } finally {
    g.Phaser = prev;
  }
}

/** BALL as game 1.12 builds it (BallUiHandler.setup): a names text ending in Cancel, then a separate counts text. */
function ballScene(counts: number[], cursor: number) {
  const text = (t: string) => ({ text: t });
  const countsText = text(counts.map(c => `×${c}`).join("\n"));
  const h = {
    cursor,
    countsText,
    pokeballSelectContainer: { list: [{}, text("Poké Ball\nGreat Ball\nUltra Ball\nRogue Ball\nMaster Ball\nCancel"), countsText, {}] },
  };
  return { ui: { mode: 4, handlers: { 4: h } }, pokeballCounts: Object.fromEntries(counts.map((c, i) => [i, c])) };
}

test("BALL options carry the ball name and count, plus the Cancel row (#46)", () => {
  const menu = evaluateIn<MenuRead>(READER, ballScene([13, 9, 0, 0, 0], 1));
  assert.equal(menu.family, "ball");
  assert.equal(menu.readable, true);
  assert.equal(menu.cursor, 1);
  assert.deepEqual(menu.options, [
    { i: 0, label: "Poké Ball ×13", name: "Poké Ball", ballType: 0, count: 13 },
    { i: 1, label: "Great Ball ×9", name: "Great Ball", ballType: 1, count: 9 },
    { i: 2, label: "Ultra Ball ×0", name: "Ultra Ball", ballType: 2, count: 0 },
    { i: 3, label: "Rogue Ball ×0", name: "Rogue Ball", ballType: 3, count: 0 },
    { i: 4, label: "Master Ball ×0", name: "Master Ball", ballType: 4, count: 0 },
    { i: 5, label: "Cancel" },
  ]);
});

test("BALL labels stay distinct when two ball types share a count (#46)", () => {
  const menu = evaluateIn<MenuRead>(READER, ballScene([0, 0, 0, 0, 0], 0));
  const labels = menu.options.map(o => o.label);
  assert.equal(new Set(labels).size, labels.length, labels.join(", "));
});

/** A tab without the touch-controls element, which the predicate reads for its DOM mode. */
function withoutTouchControls(t: { after: (fn: () => void) => void }) {
  (globalThis as { document?: unknown }).document = { getElementById: () => null };
  t.after(() => delete (globalThis as { document?: unknown }).document);
}

/** PARTY/MODIFIER's option phase over a two-slot party, as PartyUiHandler holds it mid-shop. */
function partyOptionsScene() {
  const h = {
    active: true, partyUiMode: 4, optionsMode: true, transferMode: false, optionsCursor: 1, cursor: 1,
    optionsContainer: { list: [{ text: "Summary", y: 20 }, { text: "[shadow]Apply[/shadow]", y: 0 }, { text: "Cancel", y: 40 }] },
  };
  return { ui: { mode: 8, handlers: { 8: h } }, phaseManager: { currentPhase: { phaseName: "SelectModifierPhase" } } };
}

test("the predicate and the menu reader read the same discriminators, and the reader keeps no copies of them (#133)", t => {
  withoutTouchControls(t);
  const read = evaluateIn<{ disc: unknown }>(PREDICATE, partyOptionsScene());
  const menu = evaluateIn<{ disc: unknown; extra: Record<string, unknown>; options: { label: string }[] }>(READER, partyOptionsScene());
  assert.deepEqual(menu.disc, read.disc);
  assert.deepEqual(read.disc, { partyUiMode: 4, optionsMode: true, saveSlotUiMode: null, summaryUiMode: null, alertClosable: false, filterMode: false, transferMode: false });
  assert.deepEqual(menu.options.map(o => o.label), ["Apply", "Summary", "Cancel"], "the option phase is chosen from disc");
  for (const k of ["optionsMode", "partyUiMode", "transferMode"]) assert.ok(!(k in menu.extra), `extra.${k} is the adapter's to fill`);
});

test("the menu reader picks learn_move from disc's summaryUiMode", () => {
  const h = { summaryUiMode: 1, moveSelect: true, moveCursor: 0, cursor: 2, pokemon: { name: "Charmander", getMoveset: () => [] }, newMove: null };
  const menu = evaluateIn<MenuRead>(READER, { ui: { mode: 9, handlers: { 9: h } } });
  assert.equal(menu.family, "learn_move");
});

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
  withoutTouchControls(t);
  const fine = (s: "hidden" | "increments" | "totals") => evaluateIn<{ fine: string; settled: boolean }>(PREDICATE, levelUpScene(s));
  assert.equal(fine("increments").settled, true);
  const fps = new Set([fine("hidden").fine, fine("increments").fine, fine("totals").fine]);
  assert.equal(fps.size, 3);
});
