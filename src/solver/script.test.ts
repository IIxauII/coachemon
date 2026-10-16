import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { MonState, Replay } from "./oracle-line.ts";
import { misses, readScript } from "./script.ts";

const facts = (species: MonState["species"], hp: number, extra: Partial<MonState> = {}): MonState => ({
  slot: 0,
  species,
  onField: true,
  hp,
  maxHp: 622,
  status: "NONE",
  statStages: [0, 0, 0, 0, 0, 0, 0],
  tera: false,
  ...extra,
});

const replayed: Replay = {
  confidence: "replay",
  outcome: "won",
  receipt: [],
  luck: [],
  steps: [
    {
      turn: 1,
      input: { kind: "move", move: "FICKLE_BEAM", tera: true },
      checkpoint: { ours: [facts("RESHIRAM", 318, { tera: true })], foes: [facts("HAXORUS", 0, { status: "FAINT" })] },
    },
    { turn: 2, input: null, checkpoint: { ours: [facts("RESHIRAM", 307)], foes: [facts("DRAGONITE", 226)] } },
  ],
};

const known = (after: object[], outcome = "won") =>
  readScript(JSON.stringify({ inputs: [], known: { outcome, after } })).known!;

test("a script reads its inputs and what live showed after each turn (#660)", () => {
  const script = readScript(
    JSON.stringify({
      inputs: [
        { kind: "switch", to: { slot: 3, species: "PROBOPASS" } },
        { kind: "move", move: "TRI_ATTACK", tera: false, replacement: { slot: 3, species: "SNORLAX" } },
      ],
      known: { outcome: "won", after: [{ turn: 1, ours: { PROBOPASS: { hp: 346 } } }] },
    }),
  );

  assert.deepEqual(script.inputs[1], {
    kind: "move",
    move: "TRI_ATTACK",
    tera: false,
    replacement: { slot: 3, species: "SNORLAX" },
  });
  assert.deepEqual(script.known?.after, [{ turn: 1, ours: { PROBOPASS: { hp: 346 } } }]);
});

test("a turn the game plays for us names the faint replacement it asks for as an input of its own (#702)", () => {
  const script = readScript(JSON.stringify({ inputs: [{ kind: "queued", replacement: { slot: 4, species: "GOLBAT" } }] }));

  assert.deepEqual(script.inputs, [{ kind: "queued", replacement: { slot: 4, species: "GOLBAT" } }]);
});

test("a script with a move, a species or a field the game doesn't have doesn't read, and says where (#660)", () => {
  for (const [bad, where] of [
    [{ inputs: [{ kind: "move", move: "DRAGON_PULS", tera: false }] }, /inputs\[0\]\.move/],
    [{ inputs: [{ kind: "switch", to: { slot: 3, species: "PROBOPAS" } }] }, /inputs\[0\]\.to\.species/],
    [{ inputs: [{ kind: "move", move: "BOUNCE", tera: false, replacment: { slot: 1, species: "SNORLAX" } }] }, /replacment/],
    [{ inputs: [], known: { outcome: "won", after: [{ turn: 1, ours: { RESHIRAMM: { hp: 1 } } }] } }, /RESHIRAMM/],
    [{ inputs: [{ kind: "queued" }] }, /inputs\[0\]\.replacement/],
  ] as const) {
    assert.throws(() => readScript(JSON.stringify(bad)), where);
  }
});

test("a replay that shows every fact live recorded misses nothing (#660)", () => {
  const after = [
    { turn: 1, ours: { RESHIRAM: { hp: 318, tera: true } }, foes: { HAXORUS: { hp: 0 } } },
    { turn: 2, ours: { RESHIRAM: { hp: 307, onField: true } }, foes: { DRAGONITE: { hp: 226 } } },
  ];

  assert.deepEqual(misses(known(after), replayed), []);
});

test("each recorded fact the replay shows otherwise is a miss naming the turn, the mon and both values (#660)", () => {
  const after = [
    { turn: 1, ours: { RESHIRAM: { hp: 320, tera: false } } },
    { turn: 2, foes: { DRAGONITE: { statStages: [2, 0, 0, 0, 0, 0, 0], status: "PARALYSIS" } } },
  ];

  assert.deepEqual(misses(known(after), replayed), [
    "turn 1: our Reshiram hp 318, live 320",
    "turn 1: our Reshiram tera true, live false",
    "turn 2: the foe's Dragonite status NONE, live PARALYSIS",
    "turn 2: the foe's Dragonite statStages [0,0,0,0,0,0,0], live [2,0,0,0,0,0,0]",
  ]);
});

test("a turn the replay never reached, a mon its checkpoint lacks and another outcome are misses (#660)", () => {
  const after = [{ turn: 2, foes: { FLYGON: { hp: 530 } } }, { turn: 3, ours: { RESHIRAM: { hp: 383 } } }];

  assert.deepEqual(misses(known(after, "lost"), replayed), [
    "the replay won, where live lost",
    "turn 2: no Flygon among the foe's",
    "turn 3: the replay never played it",
  ]);
});

test("every fight script in the fixtures reads, and one played live records the outcome and its turns in order (#660, #702)", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  const scripts = readdirSync(dir).filter(name => name.endsWith(".script.json"));
  const live = scripts.filter(name => name !== "gordie-w180.queued-faint.script.json");

  assert.ok(live.length >= 4, `only ${live.join(", ")}`);
  for (const name of scripts) {
    const { inputs, known } = readScript(readFileSync(new URL(name, dir), "utf8"));
    const turns = known?.after.map(after => after.turn) ?? [];

    assert.ok(inputs.length > 0, name);
    assert.equal(known !== undefined, live.includes(name), name);
    assert.deepEqual(turns, [...turns].sort((a, b) => a - b), name);
  }
});
