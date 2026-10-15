import assert from "node:assert/strict";
import { test } from "node:test";
import type { MonState, Replay } from "../../src/solver/oracle-line.ts";
import { printReplay } from "./print.ts";

const mon = (species: MonState["species"], hp: number, extra: Partial<MonState> = {}): MonState => ({
  slot: 0,
  species,
  onField: false,
  hp,
  maxHp: 622,
  status: "NONE",
  statStages: [0, 0, 0, 0, 0, 0, 0],
  tera: false,
  ...extra,
});

const won: Replay = {
  claim: "replay",
  outcome: "won",
  receipt: [{ step: "versions", checked: "the save, the clone and the pin are all game version 1.12.0.11" }],
  steps: [
    {
      turn: 6,
      input: { kind: "move", move: "FICKLE_BEAM", tera: true },
      checkpoint: {
        ours: [mon("RESHIRAM", 318, { onField: true, tera: true, statStages: [1, 0, 3, 1, 0, 0, 0] }), mon("SNORLAX", 889, { status: "SLEEP" })],
        foes: [mon("ARCHALUDON", 0, { status: "FAINT", bossBars: 0 }), mon("DRAGONITE", 584, { onField: true })],
      },
    },
    {
      turn: 7,
      input: null,
      checkpoint: {
        ours: [mon("RESHIRAM", 307, { onField: true })],
        foes: [mon("HAXORUS", 528, { bossBars: 2 }), mon("FLYGON", 530, { bossBars: 1 })],
      },
    },
  ],
};

test("a replay prints its outcome, then each turn's input and checkpoint, then its receipt (#660)", () => {
  assert.equal(
    printReplay(won),
    [
      "replayed: won in 7 turns",
      "T6  Tera + Fickle Beam",
      "    ours  Reshiram* 318/622 Tera Atk+1 SpA+3 SpD+1 · Snorlax 889/622 Sleep",
      "    foes  Archaludon 0/622 Faint 0 bars · Dragonite* 584/622",
      "T7  (no input)",
      "    ours  Reshiram* 307/622",
      "    foes  Haxorus 528/622 2 bars · Flygon 530/622 1 bar",
      "receipt",
      "    versions: the save, the clone and the pin are all game version 1.12.0.11",
    ].join("\n"),
  );
});
