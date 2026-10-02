import assert from "node:assert/strict";
import test from "node:test";
import { gameFacts, perWave, waveKind, type WaveRecord, type WaveWindow } from "./waves.ts";

const tick = (seq: number, at: number, ms: number, o: { wave: number; phase: string; kind?: string | null; drew?: boolean; road?: number }) =>
  ({ seq, at, ms, kind: o.kind ?? "battle", wave: o.wave, phase: o.phase, drew: o.drew ?? false, stages: { read: ms, ...(o.road != null ? { road: o.road } : {}) } });
const gap = (at: number, g: number, panel: number, ticks: number[] = []): { at: number; gap: number; panel: number; ticks: number[]; wave?: number } => ({ at, gap: g, panel, ticks });
const win = (wave: number, ticks: ReturnType<typeof tick>[], gaps: ReturnType<typeof gap>[] = [], o: Partial<WaveWindow> = {}): WaveWindow =>
  ({ wave, messages: [], stats: { ticks, gaps }, ...o });
const rec = (wave: number, o: Partial<WaveRecord> = {}): WaveRecord => ({ wave, battleType: 0, double: false, trainer: null, boss: false, ...o });

test("a wave is named by its battle type, its trainer's class and whether it is double or a boss (#508)", () => {
  assert.equal(waveKind(rec(1), null), "wild single");
  assert.equal(waveKind(rec(2, { double: true }), null), "wild double");
  assert.equal(waveKind(rec(10, { boss: true }), null), "wild boss");
  assert.equal(waveKind(rec(8, { battleType: 1, trainer: "Ivy" }), "Rival Ivy"), "rival single");
  assert.equal(waveKind(rec(20, { battleType: 1, trainer: "Brock" }), "Gym Leader Brock"), "gym leader single");
  assert.equal(waveKind(rec(15, { battleType: 1, double: true, trainer: "Clea & Gil" }), "Twins Clea & Gil"), "trainer double");
  assert.equal(waveKind(rec(35, { battleType: 1, trainer: "Macro Cosmos Trainer" }), "Macro Cosmos Trainer"), "evil team single");
  assert.equal(waveKind(rec(62, { battleType: 1, trainer: "Giacomo" }), "Team Star Squad Boss Giacomo"), "evil team single");
  assert.equal(waveKind(rec(115, { battleType: 1, trainer: "Penny" }), "Team Star Leader Penny"), "evil team boss single", "not a gym leader");
  assert.equal(waveKind(rec(33, { battleType: 3 }), null), "mystery encounter");
  assert.equal(waveKind(undefined, null), "?", "a wave the driver never read is not guessed");
});

test("each wave reports its turn card, preview recomputes, shop card, overlay-made hitches and overlay share (#508)", () => {
  const [row] = perWave([
    win(1, [
      tick(1, 100, 40, { wave: 1, phase: "CommandPhase", drew: true }),
      tick(2, 1100, 2, { wave: 1, phase: "CommandPhase" }),
      tick(3, 2100, 30, { wave: 1, phase: "MoveEffectPhase", drew: true, road: 25 }),
      tick(4, 3100, 9, { wave: 1, phase: "CommandPhase", road: 1 }),
      tick(5, 4100, 35, { wave: 1, phase: "SelectModifierPhase", kind: "rewards", drew: true, road: 8 }),
      tick(8, 4600, 7, { wave: 1, phase: "CheckSwitchPhase", road: 6 }),
      tick(6, 5100, 6, { wave: 1, phase: "SelectModifierPhase", kind: "rewards", drew: true }),
    ], [gap(90, 80, 40, [1]), gap(2090, 60, 30, [3]), gap(5000, 100, 0)]),
    win(2, [tick(7, 9000, 3, { wave: 2, phase: "CommandPhase", drew: true })]),
  ], [rec(1)], 50, false);
  assert.deepEqual(row.turnCardMs, [40], "a held card's refresh is not a turn card");
  assert.deepEqual(row.recomputeMs, [25, 8, 6], "a cached run read is not a recompute");
  assert.equal(row.inAnimation, 1, "a recompute at the shop or the switch question is at a prompt");
  assert.equal(row.shopCard, 35, "only the shop's first draw");
  assert.deepEqual(row.hitches, { n: 1, overlayMs: 40 }, "a hitch with under 34 ms of overlay in it is not overlay-made");
  assert.equal(row.overlayMs / row.hitchMs, 70 / 240);
});

test("a card shown again from the cache is not a turn card or a shop card (#544)", () => {
  const cached = (t: ReturnType<typeof tick>) => ({ ...t, why: "cache" });
  const [row] = perWave([
    win(1, [
      cached(tick(1, 100, 1, { wave: 1, phase: "SelectModifierPhase", kind: "rewards", drew: true })),
      tick(2, 1100, 40, { wave: 1, phase: "CommandPhase", drew: true }),
      cached(tick(3, 2100, 1, { wave: 1, phase: "CommandPhase", drew: true })),
    ]),
  ], [rec(1)], 1, true);
  assert.deepEqual([row.turnCardMs, row.shopCard], [[40], null]);
});

test("a gap belongs to the wave of the refresh it held, else of the refresh before it (#508)", () => {
  const rows = perWave([
    win(1, [tick(1, 100, 3, { wave: 1, phase: "CommandPhase" }), tick(2, 1100, 40, { wave: 2, phase: "NextEncounterPhase", road: 30 })],
      [gap(1090, 90, 40, [2]), gap(1500, 70, 0)]),
    win(2, [], [gap(2000, 60, 0)]),
    win(3, []),
  ], [], 50, false);
  assert.equal(rows[0].hitchMs, 0);
  assert.equal(rows[1].hitchMs, 90 + 70 + 60);
  assert.equal(rows[1].recomputeMs.length, 1);
});

test("a gap whose refresh a drain handed back in the window before is that refresh's wave (#515)", () => {
  const rows = perWave([
    win(24, [tick(1, 100, 7500, { wave: 25, phase: "CommandPhase" })]),
    win(26, [], [{ ...gap(90, 7660, 7500, [1]), wave: 25 }]),
    win(27, []),
  ], [], 50, false);
  assert.equal(rows.find(r => r.wave === 25)!.overlayMs, 7500);
  assert.equal(rows.find(r => r.wave === 26)!.hitchMs, 0);
});

test("a run that stopped short leaves out the wave it stopped on; one that reached its length keeps the last (#508)", () => {
  const windows = [win(1, []), win(2, []), win(3, [])];
  assert.deepEqual(perWave(windows, [], 50, false).map(r => r.wave), [1, 2]);
  assert.deepEqual(perWave(windows, [], 3, true).map(r => r.wave), [1, 2, 3]);
});

test("a wave's events are its level-ups, learns, faints, switches, catches, shop picks and retries (#508)", () => {
  const [row] = perWave([
    win(1, [], [], { messages: ["Rival Ivy\nwould like to battle!", "Larvitar learned\nBite!", "Machop fainted!", "Foe Pidgey fainted!", "Rival Ivy withdrew\nPidgey!", "Rattata was caught!"] }),
    win(1, [], [], { action: { intent: "switch" } }),
    win(1, [], [], { action: { intent: "shop" }, retry: true }),
    win(1, [], [], { action: { intent: "shop" } }),
    win(2, []),
  ], [rec(1, { battleType: 1, trainer: "Ivy", levels: { Larvitar: 5, Machop: 5 } }), rec(2, { levels: { Larvitar: 7, Machop: 5 } })], 50, false);
  assert.equal(row.kind, "rival single");
  assert.equal(row.trainer, "Rival Ivy");
  assert.deepEqual(row.events, ["level-up ×2", "move learnt", "our faint", "our switch", "foe switch", "catch", "shop pick ×2", "retry"]);
});

test("the game's language and missed sprites come from the last drain, and a build without them says so (#508)", () => {
  const facts = (f: Record<string, unknown>) => ({ ...win(1, []), stats: { ticks: [], gaps: [], facts: f } });
  assert.deepEqual(gameFacts([facts({ ua: "x" })]), { lang: null, sprites: null });
  assert.deepEqual(gameFacts([facts({ lang: "en", sprites: [] }), facts({ lang: "de", sprites: [{ id: "types/fire", misses: 3, found: false }] })]),
    { lang: "de", sprites: [{ id: "types/fire", misses: 3, found: false }] });
});
