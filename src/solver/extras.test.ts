import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readExtras } from "./extras.ts";
import type { MidFightExtras, SessionSave } from "./input.ts";

const t5: { save: SessionSave; extras: MidFightExtras } = JSON.parse(
  readFileSync(new URL("./fixtures/gordie-w180.t5.json", import.meta.url), "utf8"),
);
type Saved = { id: number; summonData: unknown };
const [coalossal, gigalith] = t5.save.enemyParty as Saved[];
const [leavanny] = t5.save.party as Saved[];

const read = (extras: unknown) => readExtras(t5.save, extras as MidFightExtras);

const missing = (extras: unknown) => {
  const result = read(extras);
  return result.kind === "missing" ? result.extras : assert.fail(`read every extra: ${JSON.stringify(extras).slice(0, 200)}`);
};

test("the Gordie T5 read becomes the fork point the harness restores, and the battle it was read in (#664)", () => {
  const result = read(t5.extras);
  assert.equal(result.kind, "read");
  if (result.kind !== "read") return;
  const fork = JSON.parse(result.forkPoint);

  assert.deepEqual(result.live, { wave: 180, battleSeed: "U0QKEz8wJ8ea7832" });
  assert.deepEqual(JSON.parse(fork.session), t5.save);
  assert.equal(fork.turn, 5);
  assert.equal(fork.rng, t5.extras.rndState);
  assert.equal(fork.battleSeedState, null);
  assert.equal(fork.switchCounter, 1);
  assert.equal(fork.lastMove, t5.extras.lastMove);
  assert.equal(fork.enemyFaints, 1);
  assert.deepEqual(fork.faints, { ours: [], foes: [{ id: gigalith.id, turn: 2 }] });
  assert.equal(fork.teamIndex[coalossal.id], 5);
  assert.equal(fork.bossIndex[coalossal.id], null);
  assert.deepEqual(fork.temp[leavanny.id], { turnCount: 2, waveTurnCount: 2 });
  assert.deepEqual(fork.wave[coalossal.id], { endured: false, abilityRevealed: false, abilitiesApplied: [] });
  assert.deepEqual(fork.summon[coalossal.id], t5.extras.foes?.[0].summonData);
  assert.deepEqual(fork.summon[leavanny.id], leavanny.summonData);
  assert.equal(fork.summon[gigalith.id], undefined);
  assert.deepEqual(fork.status[gigalith.id], { toxic: 0, sleep: 0 });
});

test("an extra the read lacks, or names unread, is missing by its path in the read (#664)", () => {
  const top = Object.keys(t5.extras).filter(key => key !== "unread") as (keyof MidFightExtras)[];
  assert.ok(top.length >= 13, top.join(", "));
  for (const key of top) {
    const { [key]: _gone, ...rest } = t5.extras;
    assert.deepEqual(missing(rest), [key], key);
    assert.deepEqual(missing({ ...t5.extras, [key]: null, unread: [key] }), [key], key);
  }
});

test("a foe's or our extra the read lacks is missing by its path, and a mon with none at all by its slot (#664)", () => {
  const foes = structuredClone(t5.extras.foes) ?? assert.fail();
  const party = structuredClone(t5.extras.party) ?? assert.fail();
  delete (foes[0] as Partial<(typeof foes)[0]>).initialTeamIndex;
  foes[0].summonData = null;
  delete (party[0] as Partial<(typeof party)[0]>).tempSummonData;

  assert.deepEqual(missing({ ...t5.extras, foes, party }), [
    "foes.0.initialTeamIndex",
    "foes.0.summonData",
    "party.0.tempSummonData",
  ]);
  assert.deepEqual(missing({ ...t5.extras, foes: t5.extras.foes?.slice(0, 5) }), ["foes.5"]);
});

test("a foe the read gives no id is missing its id, not its slot as well (#664)", () => {
  const foes = structuredClone(t5.extras.foes) ?? assert.fail();
  delete (foes[2] as Partial<(typeof foes)[0]>).id;

  assert.deepEqual(missing({ ...t5.extras, foes }), ["foes.2.id"]);
});

test("a read that names its own field unread is missing that field though it came back with a value (#664)", () => {
  assert.deepEqual(missing({ ...t5.extras, unread: ["foes.2.waveData"] }), ["foes.2.waveData"]);
});
