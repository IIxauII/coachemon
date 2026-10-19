import { z } from "zod";
import { MoveId, SpeciesId, Stat, StatusEffect } from "../enums/generated.ts";
import type { Checkpoint, FieldCommand, Input, LearnPick, MonState, Outcome, PartySlot } from "./oracle-line.ts";

const keyOf = <T extends object>(table: T, what: string) =>
  z.custom<keyof T & string>(v => typeof v === "string" && Object.hasOwn(table, v), `not a ${what}`);

export const partySlot = z.strictObject({
  slot: z.int().min(0).max(5),
  species: keyOf(SpeciesId, "species"),
}) satisfies z.ZodType<PartySlot>;

const learnPick = z.strictObject({
  ...partySlot.shape,
  move: keyOf(MoveId, "move"),
  forget: keyOf(MoveId, "move").nullable(),
}) satisfies z.ZodType<LearnPick>;

const learns = z.array(learnPick).min(1).readonly().optional();
const asked = { replacement: partySlot.optional(), learns };

const field = z.union([z.literal(0), z.literal(1)]);

const command = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("move"),
    move: keyOf(MoveId, "move"),
    tera: z.boolean(),
    target: z.strictObject({ side: z.enum(["foes", "ours"]), field }).optional(),
  }),
  z.strictObject({ kind: z.literal("switch"), to: partySlot }),
]) satisfies z.ZodType<FieldCommand>;

const double = z
  .strictObject({
    kind: z.literal("double"),
    commands: z.tuple([command.nullable(), command.nullable()]).readonly(),
    replacements: z.array(z.strictObject({ ...partySlot.shape, field })).min(1).readonly().optional(),
    learns,
  })
  .refine(d => d.commands.some(c => c !== null) || d.replacements !== undefined || d.learns !== undefined, {
    message: "a double turn names a command, a faint replacement or a learn pick",
  })
  .refine(
    ({ commands: [a, b] }) => a?.kind !== "switch" || b?.kind !== "switch" || a.to.slot !== b.to.slot,
    { message: "both field slots switch to the same party slot" },
  )
  // One Tera a battle (game-code.md §34).
  .refine(({ commands: [a, b] }) => !(a?.kind === "move" && a.tera && b?.kind === "move" && b.tera), {
    message: "both field slots terastallize",
  });

export const input = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("move"), move: keyOf(MoveId, "move"), tera: z.boolean(), ...asked }),
  z.strictObject({ kind: z.literal("switch"), to: partySlot, ...asked }),
  z
    .strictObject({ kind: z.literal("queued"), ...asked })
    .refine(q => q.replacement !== undefined || q.learns !== undefined, {
      message: "a turn the game plays for us names a faint replacement, learn picks or both",
    }),
  double,
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

const drawFields = {
  /** Whose draw: the move's user, the item's holder, the mon whose status rolled. */
  side: z.enum(["ours", "foes"]),
  species: keyOf(SpeciesId, "species"),
  /** Of the thing `kind` names happening, whichever way it went: a foe's hit, never its miss. */
  chance: z.number().min(0).max(1),
  happened: z.boolean(),
};

const effect = z.union([
  z.strictObject({ status: keyOf(StatusEffect, "status") }),
  z.strictObject({ tag: z.string() }),
  z.strictObject({ stats: z.array(keyOf(Stat, "stat")).min(1), stages: z.int() }),
  z.strictObject({ attr: z.string() }),
]);

export const draw = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.enum(["accuracy", "crit"]), move: keyOf(MoveId, "move"), ...drawFields }),
  z.strictObject({ kind: z.literal("effect"), move: keyOf(MoveId, "move"), effect, ...drawFields }),
  z.strictObject({ kind: z.literal("item"), item: z.string(), ...drawFields }),
  z.strictObject({ kind: z.enum(["paralysis", "confusion"]), ...drawFields }),
]);

export type Draw = z.infer<typeof draw>;
