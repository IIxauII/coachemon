import assert from "node:assert/strict";
import { test } from "node:test";
import { GORDIE_LINE } from "../game/fixtures/oracle-line.ts";
import type { MonState, OracleLine } from "./oracle-line.ts";
import { shortOracleLine } from "./short-oracle-line.ts";

test("an oracle line reads short: per turn its command, what the turn asks after it, and the field's HP after it (#818)", () => {
  assert.deepEqual(shortOracleLine(GORDIE_LINE), {
    kind: "oracle_line",
    wave: 180,
    turns: 9,
    steps: [
      { turn: 11, command: "switch → Leavanny (slot 4)", ours: ["Leavanny 280/497"], foes: ["Barbaracle 480/480"] },
      { turn: 12, command: "Leaf Storm", ours: ["Leavanny 249/497"], foes: ["Tyranitar 569/569"] },
      { turn: 13, command: "Bug Bite", replacements: ["Golbat (slot 5)"], ours: ["Golbat 493/493"], foes: ["Tyranitar 512/569"] },
      { turn: 14, command: "Toxic", ours: ["Golbat 463/493"], foes: ["Tyranitar 477/569 Toxic"] },
      { turn: 15, command: "Venoshock", replacements: ["Gyarados (slot 0)"], ours: ["Gyarados 570/570"], foes: ["Tyranitar 339/569 Toxic"] },
      { turn: 16, command: "Tera + Hydro Pump", ours: ["Gyarados 351/570"], foes: ["Tyranitar 109/569 Toxic"] },
      { turn: 17, command: "Hydro Pump", ours: ["Gyarados 316/570"], foes: ["Carracosta 121/467"] },
      { turn: 18, command: "Hydro Pump", ours: ["Gyarados 423/570"], foes: ["Coalossal 238/711"] },
      { turn: 19, command: "Hydro Pump", ours: ["Gyarados 423/570"], foes: ["Coalossal 0/711"] },
    ],
    luck: [{ turn: 14, what: "Stone Edge misses" }],
    receipt: ["versions passed", "known_turn passed"],
  });
});

test("a 17-turn oracle line of six against six reads short in a few KB (#818)", () => {
  const steps = Array.from({ length: 17 }, (_, i) => ({ ...GORDIE_LINE.steps[i % GORDIE_LINE.steps.length], turn: i + 1 }));
  const line = { ...GORDIE_LINE, steps };
  assert.ok(JSON.stringify(line).length > 25_000, "the full oracle line is the size #818 measured");
  assert.ok(JSON.stringify(shortOracleLine(line)).length < 4_000);
});

const mon = (slot: number, species: MonState["species"], hp: number, maxHp: number, over: Partial<MonState> = {}): MonState =>
  ({ slot, species, onField: true, hp, maxHp, status: "NONE", statStages: [0, 0, 0, 0, 0, 0, 0], tera: false, ...over });

test("a double's turn reads short with a command per field slot, its targets, and what each pick fills (#818)", () => {
  const field = {
    ours: [mon(0, "MEW", 215, 440), mon(1, "MASQUERAIN", 199, 339), mon(2, "SNORLAX", 524, 524, { onField: false })],
    foes: [mon(0, "GARCHOMP", 0, 400), mon(1, "PIKACHU", 90, 200, { status: "BURN", bossBars: 2 })],
  };
  const line: OracleLine = {
    ...GORDIE_LINE,
    steps: [
      {
        turn: 3,
        input: {
          kind: "double",
          commands: [{ kind: "move", move: "PHOTON_GEYSER", tera: true, target: { side: "foes", field: 1 } }, null],
          replacements: [{ slot: 2, species: "SNORLAX", field: 1 }],
          pivots: [{ slot: 1, species: "MASQUERAIN", field: 0 }],
          learns: [{ slot: 0, species: "MEW", move: "PSYCHIC", forget: "TACKLE" }, { slot: 1, species: "MASQUERAIN", move: "SURF", forget: null }],
        },
        checkpoint: field,
      },
      {
        turn: 4,
        input: { kind: "double", commands: [{ kind: "move", move: "HELPING_HAND", tera: false, target: { side: "ours", field: 1 } }, { kind: "switch", to: { slot: 2, species: "SNORLAX" } }] },
        checkpoint: field,
      },
      { turn: 5, input: { kind: "queued", replacement: { slot: 2, species: "SNORLAX" } }, checkpoint: field },
      { turn: 6, input: null, checkpoint: field },
    ],
    receipt: [
      { step: "known_turn", checked: "T3 replayed", pending: true },
      { step: "known_turn", checked: "T3 replayed again" },
    ],
  };
  const short = shortOracleLine(line);
  const ours = ["Mew 215/440", "Masquerain 199/339"];
  const foes = ["Garchomp 0/400", "Pikachu 90/200 Burn (2 bars)"];
  assert.deepEqual(short.steps, [
    {
      turn: 3,
      command: ["Tera + Photon Geyser → foe field 1", null],
      replacements: ["Snorlax (slot 2) into field 1"],
      pivots: ["Masquerain (slot 1) into field 0"],
      learns: ["Mew (slot 0) forgets Tackle for Psychic", "Masquerain (slot 1) declines Surf"],
      ours,
      foes,
    },
    { turn: 4, command: ["Helping Hand → our field 1", "switch → Snorlax (slot 2)"], ours, foes },
    { turn: 5, replacements: ["Snorlax (slot 2)"], ours, foes },
    { turn: 6, ours, foes },
  ]);
  assert.deepEqual(short.receipt, ["known_turn pending", "known_turn passed"], "a step the receipt names twice keeps both");
});
