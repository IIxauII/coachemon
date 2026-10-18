import assert from "node:assert/strict";
import { test } from "node:test";
import type { MonState, OracleLine, Replay } from "../../src/solver/oracle-line.ts";
import type { Played } from "../../src/solver/worker.ts";
import { printChecks, printOracleLine, printReplay } from "./print.ts";

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
  confidence: "replay",
  outcome: "won",
  receipt: [{ step: "versions", checked: "the save, the clone and the pin are all game version 1.12.0.11" }],
  luck: [
    { turn: 6, what: "Reshiram's Fickle Beam hits (90%)" },
    { turn: 7, what: "the foe's Dragonite's Hurricane misses (30%)" },
  ],
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

test("an oracle line prints how it wins, then each turn, then its receipt with the checks left to live (#662)", () => {
  const line: OracleLine = {
    seed: "VTAUX0Kaz7T3GDMR7LXP1Bhn",
    wave: 188,
    gameVersion: "1.12.0.11",
    steps: won.steps,
    receipt: [{ step: "known_turn", checked: "checked live at the next decision", pending: true }],
    luck: [],
  };

  const printed = printOracleLine(line).split("\n");

  assert.equal(printed[0], "oracle line: wins in 7 turns with 1 of 1 left");
  assert.equal(printed[1], "T6  Tera + Fickle Beam");
  assert.equal(printed.at(-1), "    known_turn (pending): checked live at the next decision");
});

test("an oracle line that rides no luck says so, naming the draws it read (#701)", () => {
  const line: OracleLine = { seed: "VTAUX0Kaz7T3GDMR7LXP1Bhn", wave: 188, gameVersion: "1.12.0.11", steps: won.steps, receipt: [], luck: [] };

  assert.match(printOracleLine(line), /^luck: rides none: .*hit.*crit.*added effect.*item proc.*miss.*full paralysis.*confusion/m);
});

test("an oracle line lists the luck it rides, a draw a line, before its receipt (#701)", () => {
  const line: OracleLine = { seed: "VTAUX0Kaz7T3GDMR7LXP1Bhn", wave: 188, gameVersion: "1.12.0.11", steps: won.steps, receipt: [], luck: won.luck.slice(0, 1) };

  assert.deepEqual(printOracleLine(line).split("\n").slice(-3), ["luck: rides 1 draw", "    T6  Reshiram's Fickle Beam hits (90%)", "receipt"]);
});

const played = (hp: number): Played => ({
  input: null,
  turn: 2,
  checkpoint: { ours: [mon("RESHIRAM", hp, { onField: true })], foes: [] },
  end: "on",
});

test("the checks pass when every restore and every chained turn played as the straight line did (#662)", () => {
  const { passed, text } = printChecks({ straight: [1, 2, 3].map(turn => ({ turn, end: "on" })), fork: [], chain: [] });

  assert.equal(passed, true);
  assert.match(text, /fork check: 2 of 2 restores played the rest the same/);
  assert.match(text, /chained-restore check: all 3 turns played the same chained/);
});

test("a restore that played otherwise fails the fork check, naming where and how (#662)", () => {
  const miss = { from: 1, turn: 2, want: played(547), got: played(471) };

  const { passed, text } = printChecks({ straight: [1, 2, 3].map(turn => ({ turn, end: "on" })), fork: [miss], chain: [] });

  assert.equal(passed, false);
  assert.match(text, /fork check: 1 of 2 restores/);
  assert.match(text, /restored at T1, T2 played otherwise: Reshiram\* 471\/622, straight Reshiram\* 547\/622/);
});

test("a replay prints its outcome, then each turn's input and checkpoint, then its luck and its receipt (#660, #701)", () => {
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
      "luck: rides 2 draws",
      "    T6  Reshiram's Fickle Beam hits (90%)",
      "    T7  the foe's Dragonite's Hurricane misses (30%)",
      "receipt",
      "    versions: the save, the clone and the pin are all game version 1.12.0.11",
    ].join("\n"),
  );
});

test("a step prints each learn pick its turn took, after the input and before the faint replacement (#673)", () => {
  const leechSeed = { slot: 1, species: "BULBASAUR", move: "LEECH_SEED" } as const;
  const steps = [
    { ...won.steps[0], input: { kind: "move", move: "SCRATCH", tera: false, learns: [{ ...leechSeed, forget: "GUNK_SHOT" }] } },
    {
      ...won.steps[1],
      input: { kind: "queued", replacement: { slot: 2, species: "SQUIRTLE" }, learns: [{ ...leechSeed, forget: null }] },
    },
  ] as const;
  const lines = printReplay({ ...won, steps }).split("\n");

  assert.equal(lines[1], "T6  Scratch, Bulbasaur (slot 1) forgets Gunk Shot for Leech Seed");
  assert.equal(lines[4], "T7  played for us, Bulbasaur (slot 1) declines Leech Seed, replacement Squirtle (slot 2)");
});
