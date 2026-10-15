import type { Stat } from "../enums/generated.ts";
import { title } from "./describe.ts";
import type { Luck } from "./oracle-line.ts";
import type { Draw } from "./schema.ts";

const STATS: Record<keyof typeof Stat, string> = {
  HP: "HP",
  ATK: "Atk",
  DEF: "Def",
  SPATK: "SpA",
  SPDEF: "SpD",
  SPD: "Spe",
  ACC: "Acc",
  EVA: "Eva",
};

const percent = (chance: number) => {
  const rounded = Math.round(chance * 100);
  return rounded === 0 ? "<1%" : rounded === 100 ? ">99%" : `${rounded}%`;
};

const added = (effect: Extract<Draw, { kind: "effect" }>["effect"]) => {
  if ("status" in effect) return title(effect.status);
  if ("tag" in effect) return title(effect.tag);
  if ("attr" in effect) return effect.attr;
  return `${effect.stats.map(s => STATS[s]).join("/")} ${effect.stages > 0 ? "+" : "−"}${Math.abs(effect.stages)}`;
};

/** What went our way, worded with the chance it had: null for a draw that went against us or was never in doubt. */
function ourWay(draw: Draw): string | null {
  const who = `${draw.side === "foes" ? "the foe's " : ""}${title(draw.species)}`;
  const ours = draw.side === "ours";
  // The chance of what happened, which for a foe's miss is the chance it had to miss.
  const odds = draw.happened ? draw.chance : 1 - draw.chance;
  if (odds >= 1) return null;
  switch (draw.kind) {
    case "accuracy":
      if (ours !== draw.happened) return null;
      return `${who}'s ${title(draw.move)} ${ours ? "hits" : "misses"} (${percent(odds)})`;
    case "crit":
      return ours && draw.happened ? `${who}'s ${title(draw.move)} crits (${percent(odds)})` : null;
    case "effect":
      return ours && draw.happened ? `${who}'s ${title(draw.move)} adds ${added(draw.effect)} (${percent(odds)})` : null;
    case "item":
      return ours && draw.happened ? `${who}'s ${title(draw.item)} activates (${percent(odds)})` : null;
    case "paralysis":
      return !ours && draw.happened ? `${who} is fully paralysed (${percent(odds)})` : null;
    case "confusion":
      return !ours && draw.happened ? `${who} hurts itself in its confusion (${percent(odds)})` : null;
  }
}

/** The draws that went our way, in the order they rolled. */
export function luckOf(steps: readonly { turn: number; draws: readonly Draw[] }[]): Luck[] {
  return steps.flatMap(({ turn, draws }) =>
    draws.flatMap(draw => {
      const what = ourWay(draw);
      return what === null ? [] : [{ turn, what }];
    }),
  );
}
