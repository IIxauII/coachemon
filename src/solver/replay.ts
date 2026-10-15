import { readFileSync } from "node:fs";
import { z } from "zod";
import { refuse } from "./gate.ts";
import type { SavedItem, SolveInput } from "./input.ts";
import { noAnswer } from "./no-answer.ts";
import type { HygieneRule, Input, NoAnswer, ReplayResult } from "./oracle-line.ts";
import { checkpoint, input, outcome } from "./schema.ts";

/** Runs the oracle's harness in the clone of the pinned game version. `out` is what it wrote, absent if nothing. */
export type Clone = (run: { name: string; source: string; input: string }) => Promise<CloneRun>;

export type CloneRun = { out: string | undefined } | { missing: string };

const totals = z.record(z.string(), z.int());

/** What `harness.test.ts.template` writes. It writes what it got to, and `error` where it stopped. */
const report = z.object({
  version: z.string().optional(),
  error: z.string().optional(),
  hygiene: z
    .object({
      realRng: z.object({ constructed: z.boolean(), reloaded: z.boolean() }),
      overrides: z.array(z.string()),
      enemyItemsBeforeReload: z.int(),
      items: z.object({ ours: totals, foes: totals }),
    })
    .optional(),
  battle: z.object({ wave: z.int(), battleSeed: z.string() }).optional(),
  steps: z.array(z.object({ turn: z.int(), input: input.nullable(), checkpoint, strayPrompts: z.int() })).optional(),
  end: z
    .union([
      outcome,
      z.object({
        illegal: z.object({ index: z.int().nullable(), turn: z.int(), why: z.string(), legal: z.array(input) }),
      }),
    ])
    .optional(),
});

type Hygiene = NonNullable<z.infer<typeof report>["hygiene"]>;

const failed = (why: string) => noAnswer({ code: "harness_failed", why });
const broke = (rule: HygieneRule, detail: string) => noAnswer({ code: "load_hygiene", rule, detail });

/** Plays the inputs forward from the wave-start save on the battle's seed, a step per turn, until the fight or they end. */
export async function replay(
  given: Pick<SolveInput, "save" | "extras" | "live" | "cloneVersion">,
  inputs: readonly Input[],
  clone: Clone,
): Promise<ReplayResult> {
  // A replay is what the harness re-check runs (#665), so it can't wait on one having passed.
  const refused = refuse(given, { gameVersion: given.cloneVersion });
  if (refused) return refused;
  const { save, live } = given;
  if (given.extras) return noAnswer({ code: "not_wave_start" });
  if (!live) return noAnswer({ code: "no_live_battle" });
  if (save.waveIndex !== live.wave) return noAnswer({ code: "save_mismatch", save: { wave: save.waveIndex }, live });

  const source = readFileSync(new URL("./harness.test.ts.template", import.meta.url), "utf8");
  const run = await clone({ name: "replay", source, input: JSON.stringify({ save, inputs }) });
  if ("missing" in run) return noAnswer({ code: "no_clone", version: given.cloneVersion, cause: run.missing });
  if (run.out === undefined) return failed("the harness wrote no report");
  let parsed;
  try {
    parsed = report.safeParse(JSON.parse(run.out));
  } catch {
    return failed("its report is not JSON");
  }
  if (!parsed.success) return failed(`its report doesn't read: ${z.prettifyError(parsed.error)}`);
  const { version, error, hygiene, battle, steps, end } = parsed.data;

  if (version !== undefined && version !== given.cloneVersion) {
    return noAnswer({ code: "clone_version", clone: version, pinned: given.cloneVersion });
  }
  const unclean = hygiene && loadHygiene(hygiene, save);
  if (unclean) return unclean;
  if (error !== undefined) return failed(error.split("\n")[0]);
  if (version === undefined || !hygiene || !battle || !steps || end === undefined) {
    return failed("the harness stopped without saying how the fight ended");
  }
  if (battle.wave !== live.wave || battle.battleSeed !== live.battleSeed) {
    return noAnswer({ code: "save_mismatch", save: battle, live });
  }
  const stray = steps.find(step => step.strayPrompts > 0);
  if (stray) return broke("stray_prompt", `${stray.strayPrompts} after turn ${stray.turn}`);
  if (typeof end === "object") {
    const { index } = end.illegal;
    const tried = index === null ? null : inputs[index];
    if (tried === undefined) return failed(`it stopped on input ${(index ?? 0) + 1} of ${inputs.length}`);
    return noAnswer({ code: "illegal_step", ...end.illegal, tried });
  }

  const stacks = Object.keys(hygiene.items.ours).length + Object.keys(hygiene.items.foes).length;
  return {
    kind: "replayed",
    replay: {
      outcome: end,
      steps: steps.map(({ turn, input, checkpoint }) => ({ turn, input, checkpoint })),
      receipt: [
        { step: "versions", checked: `the save, the clone and the pin are all game version ${version}` },
        {
          step: "load_hygiene",
          checked:
            "real battle draws after the build and the reload; no IV, nature or shiny override; the foe's items " +
            `cleared before the reload; ${stacks} item stacks totalled as the save's; no prompt left queued in ` +
            `${steps.length} turns`,
        },
        {
          step: "wave_start_save",
          checked: `the save loaded wave ${battle.wave} with battle seed ${battle.battleSeed}, the live battle's own`,
        },
      ],
    },
  };
}

function loadHygiene(hygiene: Hygiene, save: Pick<SolveInput["save"], "modifiers" | "enemyModifiers">): NoAnswer | null {
  if (!hygiene.realRng.constructed) return broke("max_rolls", "after it was built");
  if (!hygiene.realRng.reloaded) return broke("max_rolls", "after the reload");
  if (hygiene.overrides.length > 0) return broke("overrides", hygiene.overrides.join(", "));
  if (hygiene.enemyItemsBeforeReload > 0) return broke("enemy_items", `${hygiene.enemyItemsBeforeReload} left`);
  // Stack totals, never the item count: a second load merges into the stacks already there (#632).
  const off = [
    ...differ("our", tally(save.modifiers), hygiene.items.ours),
    ...differ("the foe's", tally(save.enemyModifiers), hygiene.items.foes),
  ];
  return off.length > 0 ? broke("item_totals", off.join(", ")) : null;
}

function tally(items: readonly SavedItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { typeId, stackCount } of items) out[typeId] = (out[typeId] ?? 0) + stackCount;
  return out;
}

const differ = (side: string, saved: Record<string, number>, loaded: Record<string, number>) =>
  [...new Set([...Object.keys(saved), ...Object.keys(loaded)])]
    .filter(type => (saved[type] ?? 0) !== (loaded[type] ?? 0))
    .map(type => `${side} ${type} ${saved[type] ?? 0} → ${loaded[type] ?? 0}`);
