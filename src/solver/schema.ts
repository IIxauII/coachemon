import { z } from "zod";
import { MoveId, SpeciesId, StatusEffect } from "../enums/generated.ts";
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
