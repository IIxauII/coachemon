import assert from "node:assert/strict";
import { test } from "node:test";
import { GORDIE_LINE } from "../game/fixtures/oracle-line.ts";
import type { MonState, OracleLine } from "./oracle-line.ts";
import { shortSolveResult } from "./short-line.ts";

test("a solved line reads short: per turn its command, what the turn asks after it, and the field's HP after it (#818)", () => {
  assert.deepEqual(shortSolveResult({ kind: "oracle_line", oracleLine: GORDIE_LINE }), {
    kind: "oracle_line",
    wave: 180,
    turns: 9,
    steps: [
      { turn: 11, command: "switch to LEAVANNY (slot 4)", ours: ["LEAVANNY 280/497"], foes: ["BARBARACLE 480/480"] },
      { turn: 12, command: "LEAF_STORM", ours: ["LEAVANNY 249/497"], foes: ["TYRANITAR 569/569"] },
      { turn: 13, command: "BUG_BITE", replacements: ["GOLBAT (slot 5)"], ours: ["GOLBAT 493/493"], foes: ["TYRANITAR 512/569"] },
      { turn: 14, command: "TOXIC", ours: ["GOLBAT 463/493"], foes: ["TYRANITAR 477/569 TOXIC"] },
      { turn: 15, command: "VENOSHOCK", replacements: ["GYARADOS (slot 0)"], ours: ["GYARADOS 570/570"], foes: ["TYRANITAR 339/569 TOXIC"] },
      { turn: 16, command: "Tera HYDRO_PUMP", ours: ["GYARADOS 351/570"], foes: ["TYRANITAR 109/569 TOXIC"] },
      { turn: 17, command: "HYDRO_PUMP", ours: ["GYARADOS 316/570"], foes: ["CARRACOSTA 121/467"] },
      { turn: 18, command: "HYDRO_PUMP", ours: ["GYARADOS 423/570"], foes: ["COALOSSAL 238/711"] },
      { turn: 19, command: "HYDRO_PUMP", ours: ["GYARADOS 423/570"], foes: ["COALOSSAL 0/711"] },
    ],
    luck: [{ turn: 14, what: "Stone Edge misses" }],
    receipt: { versions: "passed", known_turn: "passed" },
  });
});

test("a 17-turn line of six against six reads short in a few KB (#818)", () => {
  const steps = Array.from({ length: 17 }, (_, i) => ({ ...GORDIE_LINE.steps[i % GORDIE_LINE.steps.length], turn: i + 1 }));
  const solved = { kind: "oracle_line", oracleLine: { ...GORDIE_LINE, steps } } as const;
  assert.ok(JSON.stringify(solved).length > 25_000, "the full line is the size #818 measured");
  assert.ok(JSON.stringify(shortSolveResult(solved)).length < 4_000);
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
    receipt: [{ step: "known_turn", checked: "T3 replayed", pending: true }],
  };
  const short = shortSolveResult({ kind: "oracle_line", oracleLine: line });
  assert.equal(short.kind, "oracle_line");
  const ours = ["MEW 215/440", "MASQUERAIN 199/339"];
  const foes = ["GARCHOMP 0/400", "PIKACHU 90/200 BURN (2 bars)"];
  assert.deepEqual(short.steps, [
    {
      turn: 3,
      command: ["Tera PHOTON_GEYSER → foe field 1", null],
      replacements: ["SNORLAX (slot 2) to field 1"],
      pivots: ["MASQUERAIN (slot 1) to field 0"],
      learns: ["MEW (slot 0) learns PSYCHIC over TACKLE", "MASQUERAIN (slot 1) declines SURF"],
      ours,
      foes,
    },
    { turn: 4, command: ["HELPING_HAND → our field 1", "switch to SNORLAX (slot 2)"], ours, foes },
    { turn: 5, replacements: ["SNORLAX (slot 2)"], ours, foes },
    { turn: 6, ours, foes },
  ]);
  assert.deepEqual(short.receipt, { known_turn: "pending" });
});

test("a solve with no answer reads as it is (#818)", () => {
  const answer = { kind: "no_answer", reason: { code: "daily" }, message: "a Daily's seed is shared" } as const;
  assert.deepEqual(shortSolveResult(answer), answer);
});
