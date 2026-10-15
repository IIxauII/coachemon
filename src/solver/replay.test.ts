import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GameModes } from "../enums/generated.ts";
import type { Battle, SessionSave } from "./input.ts";
import type { Checkpoint, Input, ReplayResult } from "./oracle-line.ts";
import { type Clone, type CloneRun, replay } from "./replay.ts";

const PIN = "1.12.0.11";
const drayton: { live: Battle; save: SessionSave } = JSON.parse(
  readFileSync(new URL("./fixtures/drayton-w188.json", import.meta.url), "utf8"),
);

const toProbopass: Input = { kind: "switch", to: { slot: 3, species: "PROBOPASS" } };
const bounce: Input = { kind: "move", move: "BOUNCE", tera: false };
const atTurn = (hp: number): Checkpoint => ({
  ours: [
    { slot: 0, species: "PROBOPASS", onField: true, hp, maxHp: 461, status: "NONE", statStages: [-1, 0, 0, 0, 0, 0, 0], tera: false },
  ],
  foes: [
    { slot: 0, species: "ARCHALUDON", onField: true, hp: 0, maxHp: 578, status: "FAINT", statStages: [0, 0, 0, 0, 0, 0, 0], tera: false, bossBars: 0 },
  ],
});

const totals = (items: SessionSave["modifiers"]) => {
  const out: Record<string, number> = {};
  for (const { typeId, stackCount } of items) out[typeId] = (out[typeId] ?? 0) + stackCount;
  return out;
};

/** What the harness writes for a fight that loaded clean and won in two turns, the second with no input. */
const clean = () => ({
  version: PIN,
  hygiene: {
    realRng: { constructed: true, reloaded: true },
    overrides: [] as string[],
    enemyItemsBeforeReload: 0,
    items: { ours: totals(drayton.save.modifiers), foes: totals(drayton.save.enemyModifiers) },
  },
  battle: { ...drayton.live },
  steps: [
    { turn: 1, input: bounce, checkpoint: atTurn(346), strayPrompts: 0 },
    { turn: 2, input: null, checkpoint: atTurn(300), strayPrompts: 0 },
  ],
  end: "won" as unknown,
});

const fakeClone = (run: CloneRun) => {
  const handed: Parameters<Clone>[0][] = [];
  const clone: Clone = async job => {
    handed.push(job);
    return run;
  };
  return { clone, handed };
};

const ask = async (
  report: unknown,
  given: { save?: SessionSave; live?: Battle; extras?: { arenaTags: [] }; inputs?: Input[] } = {},
) => {
  const { clone, handed } = fakeClone({ out: JSON.stringify(report) });
  const live = "live" in given ? given.live : drayton.live;
  const { save = drayton.save, extras, inputs = [bounce] } = given;
  return { result: await replay({ save, live, extras, cloneVersion: PIN }, inputs, clone), handed };
};

const reason = (result: ReplayResult) => {
  assert.equal(result.kind, "no_answer", `expected no answer, got ${JSON.stringify(result).slice(0, 200)}`);
  return result.kind === "no_answer" ? result : assert.fail();
};

test("a replay hands the harness the save and the inputs, and comes back with the outcome and a checkpoint per turn (#660)", async () => {
  const { result, handed } = await ask(clean());

  assert.deepEqual(JSON.parse(handed[0].input), { save: drayton.save, inputs: [bounce] });
  assert.equal(result.kind, "replayed");
  assert.equal(result.kind === "replayed" && result.replay.outcome, "won");
  assert.deepEqual(result.kind === "replayed" && result.replay.steps, [
    { turn: 1, input: bounce, checkpoint: atTurn(346) },
    { turn: 2, input: null, checkpoint: atTurn(300) },
  ]);
});

test("a replay's receipt names validation steps 1-3 and what each one checked (#660)", async () => {
  const { result } = await ask(clean());
  const receipt = result.kind === "replayed" ? result.replay.receipt : assert.fail();

  assert.deepEqual(
    receipt.map(r => r.step),
    ["versions", "load_hygiene", "wave_start_save"],
  );
  assert.match(receipt[0].checked, /1\.12\.0\.11/);
  assert.match(receipt[2].checked, /wave 188/);
  assert.match(receipt[2].checked, /DAihNIyy0o8ef1c1/);
});

test("a lost replay and one whose inputs ran out come back as replays, not as no answer (#660)", async () => {
  for (const end of ["lost", "open"] as const) {
    const { result } = await ask({ ...clean(), end });

    assert.equal(result.kind === "replayed" && result.replay.outcome, end);
  }
});

test("a fight the gate refuses gets its refusal, and the clone never runs (#660)", async () => {
  const { result, handed } = await ask(clean(), { save: { ...drayton.save, gameMode: GameModes.DAILY } });

  assert.deepEqual(reason(result).reason, { code: "daily" });
  assert.equal(handed.length, 0);
});

test("a replay is what the harness re-check runs, so it never waits on one (#660, #665)", async () => {
  const { result } = await ask(clean());

  assert.equal(result.kind, "replayed");
});

test("a save for another wave than the live battle's gets no answer, and the clone never runs (#660)", async () => {
  const live = { ...drayton.live, wave: 189 };
  const { result, handed } = await ask(clean(), { live });

  assert.deepEqual(reason(result).reason, { code: "save_mismatch", save: { wave: 188 }, live });
  assert.match(reason(result).message, /wave 188.*wave 189/);
  assert.equal(handed.length, 0);
});

test("a save that loads with another battle seed than the live battle's gets no answer (#660)", async () => {
  const { result } = await ask({ ...clean(), battle: { wave: 188, battleSeed: "U0QKEz8wJ8ea7832" } });

  assert.deepEqual(reason(result).reason, {
    code: "save_mismatch",
    save: { wave: 188, battleSeed: "U0QKEz8wJ8ea7832" },
    live: drayton.live,
  });
  assert.match(reason(result).message, /U0QKEz8wJ8ea7832.*DAihNIyy0o8ef1c1/);
});

test("a save with no live battle to match gets no answer (#660)", async () => {
  const { result, handed } = await ask(clean(), { live: undefined });

  assert.deepEqual(reason(result).reason, { code: "no_live_battle" });
  assert.equal(handed.length, 0);
});

test("a replay from the session export gets no answer: only the wave-start save replays from the first turn (#660)", async () => {
  const { result, handed } = await ask(clean(), { extras: { arenaTags: [] } });

  assert.deepEqual(reason(result).reason, { code: "not_wave_start" });
  assert.equal(handed.length, 0);
});

test("each load-hygiene rule that doesn't hold gives no answer naming it, never a replay (#660)", async () => {
  const broken: [string, (r: ReturnType<typeof clean>) => void, RegExp][] = [
    ["max_rolls", r => (r.hygiene.realRng.constructed = false), /after it was built/],
    ["max_rolls", r => (r.hygiene.realRng.reloaded = false), /after the reload/],
    ["overrides", r => r.hygiene.overrides.push("IVS_OVERRIDE", "our PROBOPASS's nature"), /IVS_OVERRIDE, our PROBOPASS's nature/],
    ["enemy_items", r => (r.hygiene.enemyItemsBeforeReload = 3), /3/],
    ["item_totals", r => (r.hygiene.items.ours.LEFTOVERS -= 1), /our LEFTOVERS 2 → 1/],
    ["item_totals", r => (r.hygiene.items.foes.GOLDEN_PUNCH = 1), /the foe's GOLDEN_PUNCH 0 → 1/],
    ["stray_prompt", r => (r.steps[1].strayPrompts = 2), /turn 2/],
  ];
  for (const [rule, breakIt, detail] of broken) {
    const report = clean();
    breakIt(report);
    const { result } = await ask(report);
    const { reason: why, message } = reason(result);

    assert.equal(why.code === "load_hygiene" ? why.rule : why.code, rule);
    assert.match(message, detail);
  }
});

test("an illegal step stops the line with no answer naming the input, its turn and what the game offers (#660)", async () => {
  const fickle: Input = { kind: "move", move: "FICKLE_BEAM", tera: true };
  const illegal = { input: 1, turn: 2, why: "isn't offered", legal: [bounce, toProbopass] };
  const { result } = await ask({ ...clean(), steps: clean().steps.slice(0, 1), end: { illegal } }, {
    inputs: [bounce, fickle],
  });

  assert.deepEqual(reason(result).reason, { code: "illegal_step", ...illegal, tried: fickle });
  assert.match(reason(result).message, /input 2, Tera \+ Fickle Beam, isn't offered at turn 2/);
  assert.match(reason(result).message, /Bounce, switch → Probopass \(slot 3\)/);
});

test("no clone to run in gives no answer naming what is missing (#660)", async () => {
  const { clone } = fakeClone({ missing: "No pinned clone at .cache/pokerogue/v1.12.0.11." });
  const result = await replay({ ...drayton, cloneVersion: PIN }, [bounce], clone);

  assert.deepEqual(reason(result).reason, {
    code: "no_clone",
    version: PIN,
    cause: "No pinned clone at .cache/pokerogue/v1.12.0.11.",
  });
  assert.match(reason(result).message, /No pinned clone/);
});

test("a clone at another game version than the pin gives no answer (#660)", async () => {
  const { result } = await ask({ ...clean(), version: "1.12.0.10" });

  assert.deepEqual(reason(result).reason, { code: "clone_version", clone: "1.12.0.10", pinned: PIN });
});

test("a harness that failed is no answer, never a win or a loss (#660)", async () => {
  const failed: [unknown, RegExp][] = [
    [undefined, /wrote no report/],
    ["{ not json", /report/],
    [{ ...clean(), error: "Error: Timed out in waitUntil!\n    at …", end: undefined }, /Timed out in waitUntil!$/],
    [{ ...clean(), end: undefined }, /stopped without saying how the fight ended/],
  ];
  for (const [report, why] of failed) {
    const { clone } = fakeClone({ out: report === undefined || typeof report === "string" ? report : JSON.stringify(report) });
    const { reason: said } = reason(await replay({ ...drayton, cloneVersion: PIN }, [bounce], clone));

    assert.equal(said.code, "harness_failed");
    assert.match(said.code === "harness_failed" ? said.why : "", why);
  }
});
