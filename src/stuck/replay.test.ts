/**
 * The detector replayed against #6's six prototype transcripts, converted by
 * `scripts/stuck-replay.ts --emit src/stuck/fixtures`. This is the measurement
 * #13 could only infer: that 12/5 catches the shop↔party loop.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { progressFingerprint } from "./detector.ts";
import { replay, type ReplayStep } from "./replay.ts";

const load = (run: string): ReplayStep[] =>
  JSON.parse(readFileSync(new URL(`./fixtures/${run}.calls.json`, import.meta.url), "utf8"));

test("run2: the 147-iteration shop↔party loop trips on its twelfth call, and keeps reporting", () => {
  const result = replay(load("run2"));

  assert.ok(result.firstTrip);
  assert.equal(result.firstTrip.call, 12);
  assert.equal(result.firstTrip.transcriptLine, 48);
  const { stuck } = result.firstTrip.assessment;
  assert.equal(result.firstTrip.assessment.status, "stuck");
  assert.equal(stuck.verdict, "loop");
  assert.equal(stuck.screen, "MODIFIER_SELECT");
  assert.deepEqual(stuck.tried, [{ kind: "option", label: "Rare Candy" }]);
  assert.equal(stuck.untried?.includes("Rare Candy"), false);
  assert.deepEqual(stuck.cycle?.map(m => m.screen), ["MODIFIER_SELECT", "PARTY/MODIFIER"]);

  const next = stuck.ladder.rungs[stuck.ladder.next!].rung;
  assert.equal(next.do === "press" && next.button, "CANCEL");
  assert.ok(result.trips > 250);
});

test("run3: the PARTY→SUMMARY cycle trips where the prototype's own detector fired", () => {
  const result = replay(load("run3"));

  assert.ok(result.firstTrip);
  assert.equal(result.firstTrip.transcriptLine, 26);
  assert.equal(result.firstTrip.assessment.stuck.verdict, "loop");
  assert.equal(result.firstTrip.assessment.stuck.screen, "PARTY/MODIFIER");
});

for (const run of ["run", "run4", "run5", "run6"]) {
  test(`${run}: a healthy run never trips, with headroom to the threshold`, () => {
    const result = replay(load(run));

    assert.equal(result.trips, 0);
    assert.ok(result.maxRepeats <= 3, `maxRepeats ${result.maxRepeats}`);
  });
}

test("run4: the three presses into the party-overlay stall are not admitted", () => {
  const result = replay(load("run4"));

  assert.equal(result.calls - result.admitted, 3);
});

test("the same COMMAND prompt on a later turn is a different fingerprint", () => {
  const read = { phaseName: "CommandPhase", mode: 2, modeChain: [], cursor: 0, messageText: "What will\nBulbasaur do?", wave: 3, money: 1000 };

  assert.notEqual(progressFingerprint({ ...read, turn: 1 }), progressFingerprint({ ...read, turn: 2 }));
});

/**
 * #35: Potion → mon → Apply, back to the shop, four times over; `spend` is what each purchase costs. The party's
 * options overlay reads as the party itself (same mode, same message), which is where #28's trip was reported.
 */
function potionRun(spend: number) {
  const shop = { phaseName: "SelectModifierPhase", modeChain: [], cursor: 0, wave: 15, turn: 15 };
  const at = (mode: number, messageText: string | null, money: number) => progressFingerprint({ ...shop, mode, messageText, money });
  const steps: ReplayStep[] = [];
  let money = 1000;
  for (let i = 0; i < 4; i++) {
    const shopFp = at(6, "Restores 20 HP or 20% of a Pokémon's HP, whichever is higher.", money);
    const party = at(8, "Restores 20 HP or 20% of a Pokémon's HP, whichever is higher.", money);
    money -= spend;
    const back = at(6, "Restores 20 HP or 20% of a Pokémon's HP, whichever is higher.", money);
    const assess = (screen: string, fingerprint: string, transcriptLine: number): ReplayStep => ({
      assess: { screen, fingerprint, settled: true, liveVersion: "1.12.0.11", tutorialActive: false, options: null },
      transcriptLine,
    });
    const act = (screen: string, before: string, after: string, label: string, transcriptLine: number): ReplayStep => ({
      call: { screen, before: { fingerprint: before, settled: true }, after: { fingerprint: after, settled: true }, choice: { kind: "option", label }, tutorialActive: false },
      transcriptLine,
    });
    steps.push(
      assess("MODIFIER_SELECT", shopFp, i * 3 + 1),
      act("MODIFIER_SELECT", shopFp, party, "Potion", i * 3 + 1),
      assess("PARTY/MODIFIER", party, i * 3 + 2),
      act("PARTY/MODIFIER", party, party, "Charmander", i * 3 + 2),
      assess("PARTY/MODIFIER", party, i * 3 + 3),
      act("PARTY/MODIFIER", party, back, "Apply", i * 3 + 3),
    );
  }
  return replay(steps);
}

test("#35: buying the same shop item four times in a row is progress, not a loop", () => {
  const result = potionRun(66);

  assert.equal(result.trips, 0);
  assert.ok(result.maxRepeats <= 2, `maxRepeats ${result.maxRepeats}`);
});

test("#35: the same round trip with no money spent is still caught", () => {
  const result = potionRun(0);

  assert.ok(result.firstTrip);
  assert.equal(result.firstTrip.assessment.stuck.verdict, "loop");
});
