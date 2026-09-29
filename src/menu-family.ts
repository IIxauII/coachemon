/**
 * One plan per menu family (v1-tool-surface.md §7). Pure: no port, no clock, no settle. Matching a label to an Option
 * and the menu-level refusals stay in `selectOption`.
 */
import { Button } from "./enums/generated.ts";
import { Refusal } from "./envelope.ts";
import type { CursorTarget, MenuOption, MenuRead } from "./game/port.ts";
import { normalizeLabel } from "./labels.ts";
import type { Choice } from "./stuck/detector.ts";

export type StepRule = "list" | "grid2x2" | "down_cycle" | "battler_grid";

export type Walk = { to: number; rule: StepRule };

export type Reach =
  | { kind: "none" }
  | { kind: "set"; to: CursorTarget; miss: "walk"; walk: Walk }
  /** A miss refuses `cursor_unreachable`, naming `cursor`. */
  | { kind: "set"; to: CursorTarget; miss: "refuse"; cursor: "shop cursor" | "grid cursor" }
  | ({ kind: "walk" } & Walk);

export type Plan = {
  reach: Reach;
  commit: { kind: "action" } | { kind: "modal_button"; index: number };
  choice: Choice;
  /** Spread into the acting result. */
  extra: Record<string, unknown>;
};

export function step(rule: StepRule, cursor: number, to: number): Button {
  switch (rule) {
    case "list":
      return cursor < to ? Button.DOWN : Button.UP;
    case "grid2x2":
      if (Math.floor(cursor / 2) !== Math.floor(to / 2)) return cursor < to ? Button.DOWN : Button.UP;
      return cursor < to ? Button.RIGHT : Button.LEFT;
    case "down_cycle":
      return Button.DOWN;
    case "battler_grid": {
      // Enemies 2,3 sit above the player's 0,1, and nothing wraps (#40, game-code.md §25).
      const enemy = (i: number) => i >= 2;
      if (enemy(cursor) !== enemy(to)) return enemy(to) ? Button.UP : Button.DOWN;
      return cursor < to ? Button.RIGHT : Button.LEFT;
    }
  }
}

/** Throws a Refusal when this family never selects `target`. */
export function planSelect(menu: MenuRead, target: MenuOption): Plan {
  const i = Number(target.i);
  const walk = (rule: StepRule): Reach => ({ kind: "walk", to: i, rule });
  const plan = (reach: Reach, extra: Record<string, unknown> = {}): Plan => ({
    reach,
    commit: { kind: "action" },
    choice: { kind: "option", label: normalizeLabel(target.label) },
    extra,
  });

  switch (menu.family) {
    // v1-tool-surface.md §7 TITLE / CONFIRM / OPTION_SELECT.
    case "option_select": {
      const unskipped = menu.extra.unskippedIndices;
      const j = unskipped ? unskipped.indexOf(i) : i;
      if (j < 0) throw new Refusal("option_skipped", `option ${target.label} is not selectable right now`, { options: menu.options.map(o => o.label) });
      return plan({ kind: "set", to: { family: "option_select", index: j }, miss: "walk", walk: { to: j, rule: "list" } });
    }
    // v1-tool-surface.md §7 COMMAND. BALL is refused by its position, 1 (game-code.md §25), never by its localised
    // label (#56).
    case "command":
      if (i === 1 && menu.extra.catchable === false) throw cannotCatch(menu, target);
      return plan(walk("grid2x2"));
    // v1-tool-surface.md §7 FIGHT. MYSTERY_ENCOUNTER has no row, and only its four-option layout is FIGHT's grid
    // (game-code.md §13).
    case "fight":
    case "mystery_encounter":
      return plan(walk("grid2x2"));
    // BALL has no v1-tool-surface.md §7 row. Its rows carry a `ballType`, Cancel does not (#46, #56).
    case "ball":
      if ("ballType" in target && menu.extra.catchable === false) throw cannotCatch(menu, target);
      return plan(walk("list"));
    // v1-tool-surface.md §7 TARGET_SELECT. A multi-target move takes no cursor (#33, game-code.md §25).
    case "target_select":
      if (menu.extra.isMultipleTargets) return plan({ kind: "none" }, { targets: "all" });
      return plan(walk("battler_grid"));
    // v1-tool-surface.md §7 MODIFIER_SELECT.
    case "modifier_select":
      return plan({ kind: "set", to: { family: "modifier_select", row: Number(target.row), col: Number(target.col) }, miss: "refuse", cursor: "shop cursor" });
    // v1-tool-surface.md §7 STARTER_SELECT grid.
    case "starter_select":
      return plan({ kind: "set", to: { family: "starter_select", index: i }, miss: "refuse", cursor: "grid cursor" });
    // v1-tool-surface.md §7 SUMMARY/LEARN_MOVE.
    case "learn_move":
      return plan({ kind: "set", to: { family: "learn_move", row: i }, miss: "walk", walk: { to: i, rule: "list" } });
    // v1-tool-surface.md §7 PARTY; the slot phase's DOWN-cycle is §10.
    case "party":
      return plan(walk(menu.extra.optionsMode ? "list" : "down_cycle"));
    // v1-tool-surface.md §7 SAVE_SLOT. MENU has no row.
    case "save_slot":
    case "menu":
      return plan(walk("list"));
    // Modals have no v1-tool-surface.md §7 row and no cursor: the commit is `page/acts.ts`'s `modal`.
    case "modal":
      return { reach: { kind: "none" }, commit: { kind: "modal_button", index: i }, choice: { kind: "modal_button", index: i }, extra: {} };
    // v1-tool-surface.md §7 SUMMARY, and anything unmodelled. `selectOption` refuses an empty menu before planning, so
    // this is defensive.
    case "acknowledge":
    case "paged_viewer":
    case "unmapped":
    case null:
      throw new Refusal("no_options", `${menu.screen} presents no options to select; use press (ACTION acknowledges a message, CANCEL leaves a viewer).`, echo(menu));
  }
}

function cannotCatch(menu: MenuRead, target: MenuOption): Refusal {
  return new Refusal("cannot_catch_trainer", `This is a trainer battle: its Pokémon cannot be caught, so ${JSON.stringify(target.label)} is refused. Nothing was pressed.`, echo(menu));
}

function echo(menu: MenuRead): Record<string, unknown> {
  return { screen: menu.screen, options: menu.options.map(o => normalizeLabel(o.label)), cursor: menu.cursor };
}
