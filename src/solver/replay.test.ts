import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GameModes, TrainerVariant } from "../enums/generated.ts";
import { readExtras } from "./extras.ts";
import type { Battle, MidFightExtras, SessionSave } from "./input.ts";
import type { Checkpoint, Input, ReplayResult } from "./oracle-line.ts";
import { type Clone, type CloneRun, replay } from "./replay.ts";
import type { Known } from "./script.ts";

const PIN = "1.12.0.11";
const drayton: { live: Battle; liveExport: SessionSave; save: SessionSave } = JSON.parse(
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
  for (const { typeId, stackCount } of items ?? []) out[typeId] = (out[typeId] ?? 0) + stackCount;
  return out;
};

const clean = () => ({
  version: PIN,
  hygiene: {
    realRng: { constructed: true, reloaded: true },
    overrides: [] as string[],
    enemyItemsBeforeReload: 0,
    items: { ours: totals(drayton.save.modifiers), foes: totals(drayton.save.enemyModifiers) },
  },
  battle: { ...drayton.live },
  scene: structuredClone(drayton.liveExport) as Record<string, any>,
  steps: [
    { turn: 1, input: bounce, checkpoint: atTurn(346), strayPrompts: 0, draws: [] as unknown[] },
    { turn: 2, input: null, checkpoint: atTurn(300), strayPrompts: 0, draws: [] as unknown[] },
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
  given: {
    save?: SessionSave;
    live?: Battle;
    liveExport?: SessionSave;
    extras?: MidFightExtras;
    inputs?: Input[];
    known?: Known;
  } = {},
) => {
  const { clone, handed } = fakeClone({ out: JSON.stringify(report) });
  const live = "live" in given ? given.live : drayton.live;
  const liveExport = "liveExport" in given ? given.liveExport : drayton.liveExport;
  const { save = drayton.save, extras, inputs = [bounce], known } = given;
  return {
    result: await replay({ save, live, liveExport, extras, cloneVersion: PIN }, { inputs, known }, clone),
    handed,
  };
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

test("a replay names the luck it rode, by turn: the draws that went our way (#701)", async () => {
  const report = clean();
  report.steps[0].draws = [
    { kind: "accuracy", side: "ours", species: "PROBOPASS", move: "BOUNCE", chance: 0.85, happened: true },
    { kind: "crit", side: "ours", species: "PROBOPASS", move: "BOUNCE", chance: 1 / 24, happened: false },
  ];
  report.steps[1].draws = [{ kind: "crit", side: "ours", species: "PROBOPASS", move: "BOUNCE", chance: 1 / 24, happened: true }];
  const { result } = await ask(report);

  assert.deepEqual(result.kind === "replayed" && result.replay.luck, [
    { turn: 1, what: "Probopass's Bounce hits (85%)" },
    { turn: 2, what: "Probopass's Bounce crits (4%)" },
  ]);
});

test("a replay whose draws all went against us, or were never in doubt, rides no luck (#701)", async () => {
  const report = clean();
  report.steps[0].draws = [{ kind: "accuracy", side: "foes", species: "ARCHALUDON", move: "FLASH_CANNON", chance: 1, happened: true }];
  const { result } = await ask(report);

  assert.deepEqual(result.kind === "replayed" && result.replay.luck, []);
});

test("a replay that passes every check claims replay, with a receipt naming each check and what it checked (#660, #661)", async () => {
  const known: Known = { outcome: "won", after: [{ turn: 1, ours: { PROBOPASS: { hp: 346 } } }] };
  const { result } = await ask(clean(), { known });
  const replayed = result.kind === "replayed" ? result.replay : assert.fail();

  assert.equal(replayed.confidence, "replay");
  assert.deepEqual(
    replayed.receipt.map(r => [r.step, r.pending ?? false]),
    [
      ["versions", false],
      ["load_hygiene", false],
      ["wave_start_save", false],
      ["scene_matches", false],
      ["known_turn", false],
    ],
  );
  assert.match(replayed.receipt[0].checked, /1\.12\.0\.11/);
  assert.match(replayed.receipt[2].checked, /wave 188/);
  assert.match(replayed.receipt[2].checked, /DAihNIyy0o8ef1c1/);
  assert.match(replayed.receipt[3].checked, /live tab's export/);
  assert.match(replayed.receipt[4].checked, /1 turn/);
  assert.match(replayed.receipt[4].checked, /won/);
});

test("a replay with no known turn leaves the known-turn check pending on its first turn, to be checked live (#661)", async () => {
  const { result } = await ask(clean());
  const receipt = result.kind === "replayed" ? result.replay.receipt : assert.fail();

  assert.equal(receipt[4].step, "known_turn");
  assert.equal(receipt[4].pending, true);
  assert.match(receipt[4].checked, /first turn is the test/);
});

test("a loaded scene that differs from the live one at the decision gives no answer naming the difference (#661)", async () => {
  const report = clean();
  report.scene.party[0].hp -= 40;
  report.scene.enemyParty[0].summonData.statStages[0] = -1;
  const { result } = await ask(report);
  const { reason: why, message } = reason(result);

  assert.equal(why.code, "scene_mismatch");
  assert.match(message, /isn't the live one at the decision/);
  assert.match(message, /our Gyarados \(slot 0\) hp: loaded 561, live 601/);
  assert.match(message, /the foe's Dragonite \(slot 0\) summonData\.statStages\[0\]: loaded -1, live 0/);
});

test("a scene that differs only in play time, timestamp or the abilities applied on entry matches (#661)", async () => {
  const report = clean();
  report.scene.playTime += 48;
  report.scene.timestamp += 1000;
  report.scene.party[0].summonData.abilitiesApplied = [163];
  const { result } = await ask(report);

  assert.equal(result.kind, "replayed");
});

const foesOf = (save: SessionSave) => save.enemyParty as Record<string, unknown>[];

test("a foe the live game built fresh, with no passive or fusion fields, matches the same foe loaded from its save (#673)", async () => {
  const liveExport = structuredClone(drayton.liveExport);
  for (const foe of foesOf(liveExport)) {
    delete foe.passive;
    delete foe.fusionSpecies;
    delete foe.fusionVariant;
  }
  const { result } = await ask(clean(), { liveExport });

  assert.equal(result.kind, "replayed", `got ${JSON.stringify(result).slice(0, 300)}`);
});

test("a foe whose passive live has set is still held to it (#673)", async () => {
  const liveExport = structuredClone(drayton.liveExport);
  foesOf(liveExport)[0].passive = true;
  const { result } = await ask(clean(), { liveExport });

  assert.match(reason(result).message, /the foe's Dragonite \(slot 0\) passive: loaded false, live true/);
});

const arenaOf = (save: SessionSave) => (save as unknown as { arena: Record<string, unknown> }).arena;

test("a live arena whose weather and terrain ended, left null, matches the load that leaves them unset (#673)", async () => {
  const liveExport = structuredClone(drayton.liveExport);
  arenaOf(liveExport).weather = null;
  arenaOf(liveExport).terrain = null;
  const { result } = await ask(clean(), { liveExport });

  assert.equal(result.kind, "replayed", `got ${JSON.stringify(result).slice(0, 300)}`);
});

test("a terrain still up on the live arena is still held to the loaded one (#673)", async () => {
  const liveExport = structuredClone(drayton.liveExport);
  arenaOf(liveExport).terrain = { terrainType: 1, turnsLeft: 3, maxDuration: 5 };
  const { result } = await ask(clean(), { liveExport });

  assert.match(reason(result).message, /arena\.terrain: loaded nothing, live \{"terrainType":1/);
});

const partnered = (export_: SessionSave, partnerNameKey: string) => ({
  ...structuredClone(export_),
  trainer: { ...export_.trainer!, variant: TrainerVariant.DOUBLE, partnerNameKey },
});

test("a trainer double whose partner's name the load re-rolled matches the live one (#829)", async () => {
  const report = clean();
  report.scene = partnered(drayton.liveExport, "trainersCommon:swimmer.female.3");
  const liveExport = partnered(drayton.liveExport, "trainersCommon:swimmer.female.65");
  const { result } = await ask(report, { liveExport });

  assert.equal(result.kind, "replayed");
});

test("a trainer double's other fields are still compared, with the partner's name skipped (#829)", async () => {
  const report = clean();
  report.scene = partnered(drayton.liveExport, "trainersCommon:swimmer.female.3");
  report.scene.trainer.variant = TrainerVariant.FEMALE;
  const liveExport = partnered(drayton.liveExport, "trainersCommon:swimmer.female.65");
  const { result } = await ask(report, { liveExport });
  const { reason: why, message } = reason(result);

  assert.equal(why.code, "scene_mismatch");
  assert.match(message, /trainer\.variant: loaded 1, live 2/);
  assert.doesNotMatch(message, /partnerNameKey/);
});

test("a save whose side holds no items, written null by a load, replays (#821)", async () => {
  const report = clean();
  report.hygiene.items = { ours: {}, foes: {} };
  const { result } = await ask(report, { save: { ...drayton.save, modifiers: null, enemyModifiers: null } });

  assert.equal(result.kind, "replayed");
});

test("a side a save writes null is still held to the items the load reports there (#821)", async () => {
  const report = clean();
  report.hygiene.items.foes = {};
  const { result } = await ask(report, { save: { ...drayton.save, modifiers: null, enemyModifiers: null } });
  const why = reason(result).reason;

  assert.equal(why.code, "load_hygiene");
  assert.match(JSON.stringify(why), /item_totals/);
});

test("a play time or timestamp below the top of the export is compared like any other field (#661)", async () => {
  const report = clean();
  report.scene.arena.timestamp = 1;
  const { result } = await ask(report);

  assert.match(reason(result).message, /arena\.timestamp: loaded 1, live nothing/);
});

test("a scene the harness never reports gives no answer, never a replay (#661)", async () => {
  const { result } = await ask({ ...clean(), scene: undefined });

  assert.equal(reason(result).reason.code, "harness_failed");
});

test("a save with no live export to match the loaded scene against gets no answer, and the clone never runs (#661)", async () => {
  const { result, handed } = await ask(clean(), { liveExport: undefined });

  assert.deepEqual(reason(result).reason, { code: "no_live_export" });
  assert.equal(handed.length, 0);
});

test("a known turn the replay doesn't reproduce gives no answer naming what differs (#661)", async () => {
  const known: Known = { outcome: "won", after: [{ turn: 2, ours: { PROBOPASS: { hp: 280 } } }] };
  const { result } = await ask(clean(), { known });
  const { reason: why, message } = reason(result);

  assert.deepEqual(why, { code: "known_turn_missed", misses: ["turn 2: our Probopass hp 300, live 280"] });
  assert.match(message, /a turn whose outcome is known didn't reproduce: turn 2: our Probopass hp 300, live 280/);
});

test("a known outcome the replay doesn't reach gives no answer, even where every recorded turn matches (#661)", async () => {
  const { result } = await ask(clean(), { known: { outcome: "lost", after: [] } });

  assert.deepEqual(reason(result).reason, { code: "known_turn_missed", misses: ["the replay won, where live lost"] });
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

const t5: { save: SessionSave; extras: MidFightExtras } = JSON.parse(
  readFileSync(new URL("./fixtures/gordie-w180.t5.json", import.meta.url), "utf8"),
);
const fromT5 = (scene: SessionSave = t5.save) => ({
  ...clean(),
  hygiene: { ...clean().hygiene, items: { ours: totals(t5.save.modifiers), foes: totals(t5.save.enemyModifiers) } },
  battle: { wave: 180, battleSeed: "U0QKEz8wJ8ea7832" },
  scene: structuredClone(scene) as Record<string, any>,
});

test("a replay from the augmented export hands the harness the turn to start at, and its own battle and scene to match (#664)", async () => {
  const { result, handed } = await ask(fromT5(), { ...t5, live: undefined, liveExport: undefined });
  const read = readExtras(t5.save, t5.extras);

  assert.deepEqual(JSON.parse(handed[0].input), {
    save: t5.save,
    inputs: [bounce],
    at: read.kind === "read" ? read.forkPoint : assert.fail(),
  });
  const receipt = result.kind === "replayed" ? result.replay.receipt : assert.fail(JSON.stringify(result));
  assert.equal(receipt[2].step, "augmented_export");
  assert.match(receipt[2].checked, /wave 180 with battle seed U0QKEz8wJ8ea7832/);
  assert.match(receipt[2].checked, /turn 5/);
});

test("a scene loaded from the augmented export that differs from the export gives no answer naming the difference (#664)", async () => {
  const scene = structuredClone(t5.save);
  (scene.enemyParty[0] as { hp: number }).hp -= 82;
  const { result } = await ask(fromT5(scene), { ...t5, live: undefined, liveExport: undefined });

  assert.equal(reason(result).reason.code, "scene_mismatch");
  assert.match(reason(result).message, /the foe's Coalossal \(slot 0\) hp/);
});

test("an augmented export missing an extra gets no answer naming it, and the clone never runs (#664)", async () => {
  const { lastMove: _gone, ...extras } = t5.extras;
  const { result, handed } = await ask(fromT5(), { ...t5, extras: extras as MidFightExtras });

  assert.deepEqual(reason(result).reason, { code: "missing_extras", extras: ["lastMove"] });
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

test("an illegal step stops the replay with no answer naming the input, its turn and what the game offers (#660)", async () => {
  const fickle: Input = { kind: "move", move: "FICKLE_BEAM", tera: true };
  const illegal = { index: 1, turn: 2, why: "isn't offered", legal: [bounce, toProbopass] };
  const { result } = await ask({ ...clean(), steps: clean().steps.slice(0, 1), end: { illegal } }, {
    inputs: [bounce, fickle],
  });

  assert.deepEqual(reason(result).reason, { code: "illegal_step", ...illegal, tried: fickle });
  assert.match(reason(result).message, /input 2, Tera \+ Fickle Beam, isn't offered at turn 2/);
  assert.match(reason(result).message, /Bounce, switch → Probopass \(slot 3\)/);
});

test("a faint on a turn with no input of its own stops the replay with no answer naming that turn, not an input (#660)", async () => {
  const why = "leaves a faint replacement to pick, and names none";
  const { result } = await ask({ ...clean(), end: { illegal: { index: null, turn: 2, why, legal: [] } } });

  assert.deepEqual(reason(result).reason, { code: "illegal_step", index: null, turn: 2, why, tried: null, legal: [] });
  assert.match(reason(result).message, /^turn 2, which has no input of its own, leaves a faint replacement to pick/);
});

test("a turn the game plays for us comes back with the faint replacement its input named (#702)", async () => {
  const toGolbat: Input = { kind: "queued", replacement: { slot: 4, species: "GOLBAT" } };
  const { result } = await ask(
    { ...clean(), steps: [clean().steps[0], { ...clean().steps[1], input: toGolbat }] },
    { inputs: [bounce, toGolbat] },
  );

  assert.deepEqual(result.kind === "replayed" && result.replay.steps.map(st => st.input), [bounce, toGolbat]);
});

test("an illegal replacement on a turn the game plays for us names that input and the turn (#702)", async () => {
  const toGolbat: Input = { kind: "queued", replacement: { slot: 4, species: "GOLBAT" } };
  const illegal = { index: 1, turn: 2, why: "names a faint replacement, but nothing of ours fainted", legal: [] };
  const { result } = await ask({ ...clean(), steps: clean().steps.slice(0, 1), end: { illegal } }, { inputs: [bounce, toGolbat] });

  assert.match(
    reason(result).message,
    /^input 2, played for us, replacement Golbat \(slot 4\), names a faint replacement, but nothing of ours fainted at turn 2\./,
  );
});

const zapCannon = { slot: 0, species: "PROBOPASS", move: "ZAP_CANNON", forget: "THUNDER_WAVE" } as const;

test("a replay comes back with the learn picks each turn took, on a turn the game plays for us too (#673)", async () => {
  const learning: Input = { ...bounce, learns: [zapCannon] };
  const declining: Input = { kind: "queued", learns: [{ ...zapCannon, forget: null }] };
  const { result } = await ask(
    { ...clean(), steps: [{ ...clean().steps[0], input: learning }, { ...clean().steps[1], input: declining }] },
    { inputs: [learning, declining] },
  );

  assert.deepEqual(result.kind === "replayed" && result.replay.steps.map(st => st.input), [learning, declining]);
});

test("a learn pick the prompt can't take stops the replay with no answer naming the pick and the turn (#673)", async () => {
  const learning: Input = { ...bounce, learns: [zapCannon] };
  const why = "names a learn pick the prompt can't take (PROBOPASS in slot 0 learning ZAP_CANNON, knowing IRON_DEFENSE)";
  const illegal = { index: 0, turn: 1, why, legal: [] };
  const { result } = await ask({ ...clean(), steps: [], end: { illegal } }, { inputs: [learning] });

  assert.deepEqual(reason(result).reason, { code: "illegal_step", ...illegal, tried: learning });
  assert.match(reason(result).message, /^input 1, Bounce, Probopass \(slot 0\) forgets Thunder Wave for Zap Cannon, names a learn pick/);
});

test("no clone to run in gives no answer naming what is missing (#660)", async () => {
  const missing = "No pinned clone at .cache/pokerogue/v1.12.0.11. Set it up with `npm run drift:check`";
  const { clone } = fakeClone({ missing });
  const result = await replay({ ...drayton, cloneVersion: PIN }, { inputs: [bounce] }, clone);

  assert.deepEqual(reason(result).reason, { code: "no_clone", version: PIN, cause: missing });
  assert.match(reason(result).message, /isn't set up: No pinned clone .*`npm run drift:check`\. The card still coaches\.$/);
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
    [{ ...clean(), error: "Error: the replay timed out after 540 s" }, /timed out after 540 s$/],
    [{ ...clean(), steps: [{ ...clean().steps[0], checkpoint: { ...atTurn(346), ours: [] } }] }, /our party was empty after turn 1/],
    [{ ...clean(), steps: [{ ...clean().steps[0], draws: undefined }] }, /draws/],
  ];
  for (const [report, why] of failed) {
    const { clone } = fakeClone({ out: report === undefined || typeof report === "string" ? report : JSON.stringify(report) });
    const { reason: said, message } = reason(await replay({ ...drayton, cloneVersion: PIN }, { inputs: [bounce] }, clone));

    assert.equal(said.code, "harness_failed");
    assert.match(said.code === "harness_failed" ? said.why : "", why);
    assert.match(message, /[^.!?][.!?] The card still coaches\.$/);
  }
});

const NEXT = "1.12.1.1";

/** Drayton as a clone at NEXT reports it, carried from PIN by a migration that renamed an item and floored the money. */
const carriedReport = () => {
  const report = clean();
  const renamed = (save: SessionSave) => ({
    ...structuredClone(save),
    money: 48000,
    modifiers: save.modifiers!.map(item => (item.typeId === "EXP_SHARE" ? { ...item, typeId: "EXP_ALL" } : item)),
  });
  const migrated = { save: renamed(drayton.save), liveExport: renamed(drayton.liveExport) };
  return {
    ...report,
    version: NEXT,
    hygiene: { ...report.hygiene, items: { ...report.hygiene.items, ours: totals(migrated.save.modifiers) } },
    scene: { ...structuredClone(migrated.liveExport), gameVersion: NEXT } as Record<string, any>,
    migrated,
  };
};

const carry = async (report: unknown) => {
  const { clone, handed } = fakeClone({ out: JSON.stringify(report) });
  const result = await replay({ ...drayton, cloneVersion: NEXT }, { inputs: [bounce] }, clone, { carried: true });
  return { result, handed };
};

test("a known fight carried to a newer game is held to its save and live export as that game migrates them (#703)", async () => {
  const { result, handed } = await carry(carriedReport());
  const receipt = result.kind === "replayed" ? result.replay.receipt : assert.fail(JSON.stringify(result).slice(0, 300));

  assert.deepEqual(JSON.parse(handed[0].input), { save: drayton.save, inputs: [bounce], liveExport: drayton.liveExport });
  assert.match(receipt[0].checked, /game version 1\.12\.0\.11, carried to 1\.12\.1\.1 by the game's own migration/);
  assert.match(receipt[3].checked, /as game version 1\.12\.1\.1 migrates it/);
});

test("a carried scene that differs from the migrated live export gives no answer naming the difference (#703)", async () => {
  const report = carriedReport();
  report.scene.party[0].hp -= 40;
  const { reason: why, message } = reason((await carry(report)).result);

  assert.equal(why.code, "scene_mismatch");
  assert.match(message, /our Gyarados \(slot 0\) hp: loaded 561, live 601/);
});

test("a carried replay whose harness reports no migration fails, never matching the unmigrated export (#703)", async () => {
  const { migrated: _migrated, ...report } = carriedReport();
  const { reason: said } = reason((await carry(report)).result);

  assert.equal(said.code, "harness_failed");
  assert.match(said.code === "harness_failed" ? said.why : "", /didn't say how it migrated/);
});
