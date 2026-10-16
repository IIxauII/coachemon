import assert from "node:assert/strict";
import { test } from "node:test";
import { luckOf } from "./luck.ts";
import type { Draw } from "./schema.ts";

const ours = { side: "ours", species: "RESHIRAM" } as const;
const foes = { side: "foes", species: "TERAPAGOS" } as const;

test("each draw that went our way is luck, named with its turn and its chance (#701)", () => {
  const luck = luckOf([
    { turn: 14, draws: [{ ...ours, species: "PROBOPASS", kind: "accuracy", move: "ZAP_CANNON", chance: 0.5, happened: true }] },
    {
      turn: 30,
      draws: [
        { ...ours, kind: "item", item: "QUICK_CLAW", chance: 0.1, happened: true },
        { ...ours, kind: "crit", move: "BLUE_FLARE", chance: 1 / 24, happened: true },
      ],
    },
  ]);

  assert.deepEqual(luck, [
    { turn: 14, what: "Probopass's Zap Cannon hits (50%)" },
    { turn: 30, what: "Reshiram's Quick Claw activates (10%)" },
    { turn: 30, what: "Reshiram's Blue Flare crits (4%)" },
  ]);
});

test("a foe's miss, full paralysis and confusion self-hit are luck, with the chance of what happened (#701)", () => {
  const luck = luckOf([
    {
      turn: 3,
      draws: [
        { ...foes, kind: "accuracy", move: "HURRICANE", chance: 0.7, happened: false },
        { ...foes, kind: "paralysis", chance: 0.125, happened: true },
        { ...foes, kind: "confusion", chance: 1 / 3, happened: true },
      ],
    },
  ]);

  assert.deepEqual(luck, [
    { turn: 3, what: "the foe's Terapagos's Hurricane misses (30%)" },
    { turn: 3, what: "the foe's Terapagos is fully paralysed (13%)" },
    { turn: 3, what: "the foe's Terapagos hurts itself in its confusion (33%)" },
  ]);
});

test("our mon moving through its paralysis or its confusion is luck, as the foe's full paralysis is (#701)", () => {
  const luck = luckOf([
    {
      turn: 4,
      draws: [
        { ...ours, kind: "paralysis", chance: 0.125, happened: false },
        { ...ours, kind: "confusion", chance: 1 / 3, happened: false },
      ],
    },
  ]);

  assert.deepEqual(luck, [
    { turn: 4, what: "Reshiram moves through its paralysis (88%)" },
    { turn: 4, what: "Reshiram keeps from hurting itself in its confusion (67%)" },
  ]);
});

test("an added effect is luck when it lands for us, named by what it adds (#701)", () => {
  const luck = luckOf([
    {
      turn: 2,
      draws: [
        { ...ours, kind: "effect", move: "THUNDERBOLT", effect: { status: "PARALYSIS" }, chance: 0.1, happened: true },
        { ...ours, kind: "effect", move: "IRON_HEAD", effect: { tag: "FLINCHED" }, chance: 0.3, happened: true },
        { ...ours, kind: "effect", move: "PSYCHIC", effect: { stats: ["SPDEF"], stages: -1 }, chance: 0.1, happened: true },
        { ...ours, kind: "effect", move: "CHARGE_BEAM", effect: { stats: ["SPATK"], stages: 1 }, chance: 0.7, happened: true },
      ],
    },
  ]);

  assert.deepEqual(
    luck.map(l => l.what),
    [
      "Reshiram's Thunderbolt adds Paralysis (10%)",
      "Reshiram's Iron Head adds Flinched (30%)",
      "Reshiram's Psychic adds SpD −1 (10%)",
      "Reshiram's Charge Beam adds SpA +1 (70%)",
    ],
  );
});

test("a draw that went against us, a foe's crit, effect or proc that never came, or a sure thing, is not luck (#701)", () => {
  const against: Draw[] = [
    { ...ours, kind: "accuracy", move: "BLUE_FLARE", chance: 0.85, happened: false },
    { ...ours, kind: "crit", move: "BLUE_FLARE", chance: 1 / 24, happened: false },
    { ...ours, kind: "effect", move: "IRON_HEAD", effect: { tag: "FLINCHED" }, chance: 0.3, happened: false },
    { ...ours, kind: "item", item: "QUICK_CLAW", chance: 0.1, happened: false },
    { ...ours, kind: "paralysis", chance: 0.125, happened: true },
    { ...ours, kind: "confusion", chance: 1 / 3, happened: true },
    { ...foes, kind: "accuracy", move: "HURRICANE", chance: 0.7, happened: true },
    { ...foes, kind: "crit", move: "TERA_STARSTORM", chance: 1 / 24, happened: true },
    { ...foes, kind: "effect", move: "SCALD", effect: { status: "BURN" }, chance: 0.3, happened: true },
    { ...foes, kind: "item", item: "QUICK_CLAW", chance: 0.1, happened: true },
    { ...foes, kind: "paralysis", chance: 0.125, happened: false },
    { ...foes, kind: "confusion", chance: 1 / 3, happened: false },
    { ...foes, kind: "crit", move: "TERA_STARSTORM", chance: 1 / 24, happened: false },
    { ...foes, kind: "effect", move: "SCALD", effect: { status: "BURN" }, chance: 0.3, happened: false },
    { ...foes, kind: "item", item: "FOCUS_BAND", chance: 0.1, happened: false },
    { ...ours, kind: "accuracy", move: "THUNDER", chance: 1, happened: true },
  ];

  assert.deepEqual(luckOf([{ turn: 1, draws: against }]), []);
});
