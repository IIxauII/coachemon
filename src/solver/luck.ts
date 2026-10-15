import { Stat } from "../enums/generated.ts";
import { STAGES, title } from "./describe.ts";
import type { Luck } from "./oracle-line.ts";
import type { Draw } from "./schema.ts";

const percent = (chance: number) => {
  const rounded = Math.round(chance * 100);
  return rounded === 0 ? "<1%" : rounded === 100 ? ">99%" : `${rounded}%`;
};

const effectName = (effect: Extract<Draw, { kind: "effect" }>["effect"]) => {
  if ("status" in effect) return title(effect.status);
  if ("tag" in effect) return title(effect.tag);
  if ("attr" in effect) return effect.attr;
  const stats = effect.stats.map(s => STAGES[Stat[s] - Stat.ATK]).join("/");
  return `${stats} ${effect.stages > 0 ? "+" : "−"}${Math.abs(effect.stages)}`;
};

/** Whether a draw of ours that happened went our way. A foe's goes our way the other way round. */
const HAPPENING_HELPS_US: Record<Draw["kind"], boolean> = {
  accuracy: true,
  crit: true,
  effect: true,
  item: true,
  paralysis: false,
  confusion: false,
};

// A foe's crit, effect or proc that never came would put most of its hits on the list.
const FOES_COUNTED = new Set<Draw["kind"]>(["accuracy", "paralysis", "confusion"]);

function said(draw: Draw): string {
  const who = `${draw.side === "foes" ? "the foe's " : ""}${title(draw.species)}`;
  switch (draw.kind) {
    case "accuracy":
      return `${who}'s ${title(draw.move)} ${draw.happened ? "hits" : "misses"}`;
    case "crit":
      return `${who}'s ${title(draw.move)} crits`;
    case "effect":
      return `${who}'s ${title(draw.move)} adds ${effectName(draw.effect)}`;
    case "item":
      return `${who}'s ${title(draw.item)} activates`;
    case "paralysis":
      return draw.happened ? `${who} is fully paralysed` : `${who} moves through its paralysis`;
    case "confusion":
      return draw.happened ? `${who} hurts itself in its confusion` : `${who} keeps from hurting itself in its confusion`;
  }
}

function ourWay(draw: Draw): string | null {
  const ours = draw.side === "ours";
  if (!ours && !FOES_COUNTED.has(draw.kind)) return null;
  if (draw.happened !== (HAPPENING_HELPS_US[draw.kind] === ours)) return null;
  const odds = draw.happened ? draw.chance : 1 - draw.chance;
  return odds < 1 ? `${said(draw)} (${percent(odds)})` : null;
}

export function luckOf(steps: readonly { turn: number; draws: readonly Draw[] }[]): Luck[] {
  return steps.flatMap(({ turn, draws }) =>
    draws.flatMap(draw => {
      const what = ourWay(draw);
      return what === null ? [] : [{ turn, what }];
    }),
  );
}
