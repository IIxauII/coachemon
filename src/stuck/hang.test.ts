import assert from "node:assert/strict";
import { test } from "node:test";
import { HANG_CORROBORATED_MS, HANG_DWELL_MS, HangWatch, type HangPoll } from "./hang.ts";

const hungPoll = (t: number): HangPoll => ({ t, mode: 0, phaseName: "EncounterPhase", onActionInput: false });

function hold(watch: HangWatch, from: number, to: number) {
  for (let t = from; t <= to; t += 100) watch.poll(hungPoll(t));
}

test("the hang signature held for less than the dwell is not a hang", () => {
  const watch = new HangWatch();
  hold(watch, 0, HANG_DWELL_MS - 100);

  assert.deepEqual(watch.assess(), { status: "ok" });
});

test("the hang signature held for the full dwell is run_interrupted, uncorroborated", () => {
  const watch = new HangWatch();
  hold(watch, 0, HANG_DWELL_MS);

  assert.deepEqual(watch.assess(), {
    status: "run_interrupted",
    cause: "save_hang",
    hang: { heldMs: HANG_DWELL_MS, corroborated: false },
  });
});

test("an unhandled rejection during the hold shortens the dwell", () => {
  const watch = new HangWatch();
  hold(watch, 0, 500);
  watch.unhandledRejection(550);
  hold(watch, 600, HANG_CORROBORATED_MS);

  const result = watch.assess();
  assert.equal(result.status, "run_interrupted");
  assert.equal(result.status === "run_interrupted" && result.hang.corroborated, true);
});

test("a rejection that lands just before the first hung poll still corroborates it", () => {
  const watch = new HangWatch();
  watch.poll({ t: 0, mode: 6, phaseName: "SelectModifierPhase", onActionInput: false });
  watch.unhandledRejection(40);
  hold(watch, 100, HANG_CORROBORATED_MS + 100);

  assert.equal(watch.assess().status, "run_interrupted");
});

test("a rejection from an earlier screen does not corroborate a later hold", () => {
  const watch = new HangWatch();
  watch.unhandledRejection(0);
  watch.poll({ t: 50, mode: 6, phaseName: "SelectModifierPhase", onActionInput: false });
  hold(watch, 100, HANG_CORROBORATED_MS + 100);

  assert.equal(watch.assess().status, "ok");
});

test("a shown prompt breaks the hold: normal encounter text is not a hang", () => {
  const watch = new HangWatch();
  hold(watch, 0, HANG_DWELL_MS - 1000);
  watch.poll({ t: HANG_DWELL_MS - 900, mode: 0, phaseName: "EncounterPhase", onActionInput: true });
  hold(watch, HANG_DWELL_MS - 800, HANG_DWELL_MS + 500);

  assert.equal(watch.assess().status, "ok");
});

test("any other phase breaks the hold", () => {
  const watch = new HangWatch();
  hold(watch, 0, 20_000);
  watch.poll({ t: 20_100, mode: 0, phaseName: "CommandPhase", onActionInput: false });
  hold(watch, 20_200, HANG_DWELL_MS + 100);

  assert.equal(watch.assess().status, "ok");
});

test("the hold accumulates across calls: a resume keeps polling the same watch", () => {
  const watch = new HangWatch();
  hold(watch, 0, 15_000);
  assert.equal(watch.assess().status, "ok");
  hold(watch, 15_100, HANG_DWELL_MS);

  assert.equal(watch.assess().status, "run_interrupted");
});

test("a scene-unavailable poll neither breaks nor extends the hold", () => {
  const watch = new HangWatch();
  hold(watch, 0, 10_000);
  watch.poll(null);
  hold(watch, 10_100, HANG_DWELL_MS);

  assert.equal(watch.assess().status, "run_interrupted");
});
