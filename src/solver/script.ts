import { z } from "zod";
import { SpeciesId } from "../enums/generated.ts";
import { title } from "./describe.ts";
import type { Replay } from "./oracle-line.ts";
import { input, monFacts, outcome } from "./schema.ts";

const bySpecies = z
  .record(z.string(), monFacts.partial())
  .superRefine((mons, ctx) => {
    for (const species of Object.keys(mons)) {
      if (!Object.hasOwn(SpeciesId, species)) ctx.addIssue({ code: "custom", message: `not a species: ${species}` });
    }
  });

/** Inputs for `oracle:battle --replay`, and what live showed after each turn where they were played there. */
const script = z.strictObject({
  inputs: z.array(input),
  known: z
    .strictObject({
      outcome,
      after: z.array(z.strictObject({ turn: z.int().min(1), ours: bySpecies.optional(), foes: bySpecies.optional() })),
    })
    .optional(),
});

export type Script = z.infer<typeof script>;

/** A known fight's oracle line beside its `<stem>.json`. */
export const WIN_SCRIPT = ".win.script.json";
export type Known = NonNullable<Script["known"]>;

/** Throws, naming each place the text strays from a script. */
export function readScript(text: string): Script {
  const read = script.safeParse(JSON.parse(text));
  if (!read.success) throw new Error(z.prettifyError(read.error));
  return read.data;
}

const show = (fact: unknown) => (typeof fact === "string" ? fact : JSON.stringify(fact));

/** Each fact live recorded that the replay shows otherwise, in turn order. */
export function misses(known: Known, replay: Pick<Replay, "outcome" | "steps">): string[] {
  const out = replay.outcome === known.outcome ? [] : [`the replay ${replay.outcome}, where live ${known.outcome}`];
  for (const after of known.after) {
    const step = replay.steps.find(s => s.turn === after.turn);
    if (step === undefined) {
      out.push(`turn ${after.turn}: the replay never played it`);
      continue;
    }
    for (const [side, recorded, mons] of [
      ["our", after.ours, step.checkpoint.ours],
      ["the foe's", after.foes, step.checkpoint.foes],
    ] as const) {
      for (const [species, facts] of Object.entries(recorded ?? {})) {
        const mon = mons.find(m => m.species === species);
        if (mon === undefined) {
          out.push(`turn ${after.turn}: no ${title(species)} among ${side}`);
          continue;
        }
        for (const [fact, live] of Object.entries(facts)) {
          const replayed = mon[fact as keyof typeof facts];
          if (JSON.stringify(replayed) !== JSON.stringify(live)) {
            out.push(`turn ${after.turn}: ${side} ${title(species)} ${fact} ${show(replayed)}, live ${show(live)}`);
          }
        }
      }
    }
  }
  return out;
}
