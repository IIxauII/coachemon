import { z } from "zod";
import { MoveId, SpeciesId, Stat, StatusEffect } from "../enums/generated.ts";
import type { Checkpoint, Input, MonState, Outcome, PartySlot } from "./oracle-line.ts";

const keyOf = <T extends object>(table: T, what: string) =>
  z.custom<keyof T & string>(v => typeof v === "string" && Object.hasOwn(table, v), `not a ${what}`);

export const partySlot = z.strictObject({
  slot: z.int().min(0).max(5),
  species: keyOf(SpeciesId, "species"),
}) satisfies z.ZodType<PartySlot>;

export const input = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("move"),
    move: keyOf(MoveId, "move"),
    tera: z.boolean(),
    replacement: partySlot.optional(),
  }),
  z.strictObject({ kind: z.literal("switch"), to: partySlot, replacement: partySlot.optional() }),
]) satisfies z.ZodType<Input>;

export const monFacts = z.strictObject({
  onField: z.boolean(),
  hp: z.int(),
  maxHp: z.int(),
  status: keyOf(StatusEffect, "status"),
  statStages: z.array(z.int()).length(7),
  tera: z.boolean(),
  bossBars: z.int().optional(),
});

const monState = z.strictObject({ ...partySlot.shape, ...monFacts.shape }) satisfies z.ZodType<MonState>;

export const checkpoint = z.strictObject({ ours: z.array(monState), foes: z.array(monState) }) satisfies z.ZodType<Checkpoint>;

export const outcome = z.enum(["won", "lost", "open"]) satisfies z.ZodType<Outcome>;

const drawn = {
  side: z.enum(["ours", "foes"]),
  species: keyOf(SpeciesId, "species"),
  /** Of what `kind` names happening: the move hitting, a crit, the effect, the item's proc, full paralysis, a self-hit. */
  chance: z.number().min(0).max(1),
  happened: z.boolean(),
};

const effect = z.union([
  z.strictObject({ status: keyOf(StatusEffect, "status") }),
  z.strictObject({ tag: z.string() }),
  z.strictObject({ stats: z.array(keyOf(Stat, "stat")).min(1), stages: z.int() }),
  z.strictObject({ attr: z.string() }),
]);

/** A battle draw the harness saw roll, on either side. `side` is whose: the move's user, the item's holder, the mon whose status rolled. */
export const draw = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.enum(["accuracy", "crit"]), move: keyOf(MoveId, "move"), ...drawn }),
  z.strictObject({ kind: z.literal("effect"), move: keyOf(MoveId, "move"), effect, ...drawn }),
  z.strictObject({ kind: z.literal("item"), item: z.string(), ...drawn }),
  z.strictObject({ kind: z.enum(["paralysis", "confusion"]), ...drawn }),
]);

export type Draw = z.infer<typeof draw>;
