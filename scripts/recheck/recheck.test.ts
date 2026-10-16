import assert from "node:assert/strict";
import { test } from "node:test";
import type { Carry } from "../../src/solver/gate.ts";
import { noAnswer } from "../../src/solver/no-answer.ts";
import type { Input, ReplayResult } from "../../src/solver/oracle-line.ts";
import type { CheckResult, Checks, Script } from "../../src/solver/solver.ts";
import { type Given, recheck } from "./recheck.ts";

const VERSION = "1.12.0.11";

const replayed = (turns: number): ReplayResult => ({
  kind: "replayed",
  replay: {
    confidence: "replay",
    outcome: "won",
    steps: Array.from({ length: turns }, (_, i) => ({ turn: i + 1, input: null, checkpoint: { ours: [], foes: [] } })),
    receipt: [],
    luck: [],
  },
});

const passing = (turns: number): Checks => ({
  straight: Array.from({ length: turns }, (_, i) => ({ turn: i + 1, end: i + 1 === turns ? "won" : "on" })),
  fork: [],
  chain: [],
});

const missed: Checks["fork"][number] = {
  from: 3,
  turn: 4,
  want: { input: null, turn: 4, checkpoint: { ours: [], foes: [] }, end: "on" },
  got: { input: null, turn: 4, checkpoint: { ours: [], foes: [] }, end: "lost" },
};

const fakes = ({
  replays = {},
  checks = {},
}: { replays?: Record<number, ReplayResult>; checks?: Record<number, CheckResult> } = {}) => {
  const calls: {
    kind: "replay" | "check";
    wave: number;
    given: Given;
    inputs: readonly Input[];
    script?: Script;
    carry: Carry;
  }[] = [];
  return {
    calls,
    deps: {
      replay: async (given: Given, script: Script, carry: Carry) => {
        calls.push({ kind: "replay", wave: given.save.waveIndex, given, inputs: script.inputs, script, carry });
        return replays[given.save.waveIndex] ?? replayed(script.inputs.length);
      },
      checkForks: async (given: Given, inputs: readonly Input[], carry: Carry) => {
        calls.push({ kind: "check", wave: given.save.waveIndex, given, inputs, carry });
        return checks[given.save.waveIndex] ?? { kind: "checked" as const, checks: passing(inputs.length) };
      },
    },
  };
};

test("the re-check replays the three known fights at the stamped version, then checks each, and passes (#665)", async () => {
  const { calls, deps } = fakes();

  const run = await recheck(VERSION, deps);

  assert.deepEqual(run.failed, []);
  assert.deepEqual(
    calls.map(c => `${c.kind} ${c.wave}`),
    ["replay 180", "replay 188", "replay 190", "check 180", "check 188", "check 190"],
  );
  for (const call of calls) assert.equal(call.given.cloneVersion, VERSION);
  for (const call of calls) assert.deepEqual(call.carry, { carried: false }, "the fights were recorded on this version");
  for (const call of calls.filter(c => c.kind === "replay")) {
    assert.ok(call.given.live && call.given.liveExport, "a replay needs the live battle and its export");
    assert.equal(call.script?.known?.outcome, "won", "a known line is held to every fact live recorded");
  }
  assert.match(run.text, /Gordie W180: replayed, won in 19 turns/);
  assert.match(run.text, /Kieran W190\n\s+straight: 31 turns[^\n]*\n\s+fork check: 30 of 30 restores/);
});

test("a known fight that doesn't replay fails the re-check by name, and no check runs after it (#665)", async () => {
  const { calls, deps } = fakes({ replays: { 188: noAnswer({ code: "harness_failed", why: "the harness wrote no report" }) } });

  const run = await recheck(VERSION, deps);

  assert.deepEqual(run.failed, ["Drayton W188 didn't replay"]);
  assert.match(run.text, /Drayton W188: no answer: the oracle's harness failed/);
  assert.match(run.text, /Kieran W190: replayed/, "the other fights still replay, so one run names every failure");
  assert.equal(calls.filter(c => c.kind === "check").length, 0);
});

test("a fork or chained-restore miss fails the re-check naming the fight and the check, as does no answer (#665)", async () => {
  const { deps } = fakes({
    checks: {
      180: { kind: "checked", checks: { ...passing(19), fork: [missed] } },
      188: { kind: "checked", checks: { ...passing(10), fork: [missed], chain: [missed] } },
      190: noAnswer({ code: "harness_failed", why: "the worker took too long to start" }),
    },
  });

  const run = await recheck(VERSION, deps);

  assert.deepEqual(run.failed, [
    "Gordie W180's fork check failed",
    "Drayton W188's fork check failed",
    "Drayton W188's chained-restore check failed",
    "Kieran W190's checks got no answer",
  ]);
  assert.match(run.text, /Gordie W180\n[^]*fork check: 17 of 18 restores[^\n]*\n\s+restored at T3, T4 played otherwise/);
  assert.match(run.text, /Kieran W190: no answer: .*the worker took too long to start/);
});

test("checks whose straight run doesn't win as live did fail the re-check, though every restore matched it (#665)", async () => {
  const lost = passing(19);
  const { deps } = fakes({
    checks: { 180: { kind: "checked", checks: { ...lost, straight: [...lost.straight.slice(0, -1), { turn: 19, end: "lost" }] } } },
  });

  const run = await recheck(VERSION, deps);

  assert.deepEqual(run.failed, ['Gordie W180\'s straight run ended "lost", not as live did']);
});

test("at a newer game version the re-check carries each known fight's save to it, and passes (#703)", async () => {
  const { calls, deps } = fakes();

  const run = await recheck("1.12.1.1", deps);

  assert.deepEqual(run.failed, []);
  assert.equal(calls.length, 6);
  for (const call of calls) assert.deepEqual(call.carry, { carried: true });
  for (const call of calls) assert.equal(call.given.cloneVersion, "1.12.1.1");
  assert.match(run.text, /carrying the 1\.12\.0\.11 saves of Gordie W180, Drayton W188 and Kieran W190 to 1\.12\.1\.1/);
});

test("a carried fight that doesn't replay ends the re-check naming it to record again on the new version, and where how is (#703)", async () => {
  const missedTurn = noAnswer({ code: "known_turn_missed", misses: ["turn 3: our Reshiram hp 120, live 118"] });
  const { deps } = fakes({ replays: { 180: missedTurn, 190: missedTurn } });

  const run = await recheck("1.12.1.1", deps);

  assert.deepEqual(run.failed, ["Gordie W180 didn't replay", "Kieran W190 didn't replay"]);
  assert.match(
    run.text,
    /Gordie W180 and Kieran W190 were recorded on 1\.12\.0\.11\. Where 1\.12\.1\.1 changed the fights, record others in their place on 1\.12\.1\.1: "Record a known fight again" in docs\/runbooks\/pin-bump\.md\.$/,
  );
});

test("a carried fight whose harness failed asks for no new recording: a new fight would fail the same way (#703)", async () => {
  const broke = noAnswer({ code: "harness_failed", why: "TypeError: Cannot read properties of undefined (reading 'sprites')" });
  const { deps } = fakes({ replays: { 180: broke, 188: broke, 190: broke } });

  const run = await recheck("1.12.1.1", deps);

  assert.equal(run.failed.length, 3);
  assert.doesNotMatch(run.text, /in (its|their) place/);
});

test("a known fight that doesn't replay on its own version asks for no new recording: the harness drifted, not the game (#703)", async () => {
  const { deps } = fakes({ replays: { 188: noAnswer({ code: "known_turn_missed", misses: ["turn 1"] }) } });

  const run = await recheck(VERSION, deps);

  assert.doesNotMatch(run.text, /in (its|their) place/);
});
