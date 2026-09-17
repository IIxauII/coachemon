/**
 * The menu families (see CONTEXT.md): how the Driver reaches an Option on each and commits it. Whether a family moves
 * by `setCursor` or by presses, its step rule, what a `setCursor` miss means, how it commits and the refusals that
 * belong to one family all live here, as a plan the Driver executes. The evidence for each family's movement is
 * `docs/spec/v1-tool-surface.md` §7.
 *
 * Pure: no port, no clock, no settle. Matching a label to an Option and the menu-level refusals stay in `selectOption`.
 */
import { Button } from "./enums/generated.ts";
import { Refusal } from "./envelope.ts";
import type { CursorTarget, MenuOption, MenuRead } from "./game/port.ts";
import { normalizeLabel } from "./labels.ts";
import type { Choice } from "./stuck/detector.ts";

/** Which press moves a cursor one step toward its target. */
export type StepRule = "list" | "grid2x2" | "down_cycle" | "battler_grid";

export type Walk = { to: number; rule: StepRule };

/** How the cursor gets onto the Option before the commit. */
export type Reach =
  /** Nothing to move: a modal's buttons, a spread move's targets. */
  | { kind: "none" }
  /** `setCursor`, and on a miss walk the cursor by presses. */
  | { kind: "set"; to: CursorTarget; miss: "walk"; walk: Walk }
  /** `setCursor`, and on a miss refuse `cursor_unreachable`, naming the cursor that missed. */
  | { kind: "set"; to: CursorTarget; miss: "refuse"; cursor: "shop cursor" | "grid cursor" }
  /** Presses only. */
  | ({ kind: "walk" } & Walk);

export type Plan = {
  reach: Reach;
  commit: { kind: "action" } | { kind: "modal_button"; index: number };
  /** What the stuck detector judges the call by. */
  choice: Choice;
  /** Fields the acting result carries, e.g. `{ targets: "all" }` on a spread move. */
  extra: Record<string, unknown>;
};

/** The button that moves the cursor from `cursor` one step toward `to`. */
export function step(rule: StepRule, cursor: number, to: number): Button {
  switch (rule) {
    case "list":
      return cursor < to ? Button.DOWN : Button.UP;
    case "grid2x2":
      // UP/DOWN are ±2 across the rows, LEFT/RIGHT ±1 along one.
      if (Math.floor(cursor / 2) !== Math.floor(to / 2)) return cursor < to ? Button.DOWN : Button.UP;
      return cursor < to ? Button.RIGHT : Button.LEFT;
    case "down_cycle":
      return Button.DOWN;
    case "battler_grid": {
      // BattlerIndex grid, nothing wraps (#40): enemies 2,3 on top, player field 0,1 below. UP/DOWN jump to the first
      // target in the other row, LEFT/RIGHT step ±1 within a row (TargetSelectUiHandler.processInput).
      const enemy = (i: number) => i >= 2;
      if (enemy(cursor) !== enemy(to)) return enemy(to) ? Button.UP : Button.DOWN;
      return cursor < to ? Button.RIGHT : Button.LEFT;
    }
  }
}

/** How to reach and commit `target` on `menu`, or a Refusal when this family never selects it. */
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
    // §7 TITLE / CONFIRM / OPTION_SELECT: setCursor over the unskipped list, which handles the scroll maths.
    case "option_select": {
      const unskipped = menu.extra.unskippedIndices;
      const j = unskipped ? unskipped.indexOf(i) : i;
      if (j < 0) throw new Refusal("option_skipped", `option ${target.label} is not selectable right now`, { options: menu.options.map(o => o.label) });
      return plan({ kind: "set", to: { family: "option_select", index: j }, miss: "walk", walk: { to: j, rule: "list" } });
    }
    // §7 COMMAND: presses over the 2×2 grid. Command.BALL is the second command, refused by position, not by the
    // localised label (#56).
    case "command":
      if (i === 1 && menu.extra.catchable === false) throw cannotCatch(menu, target);
      return plan(walk("grid2x2"));
    // §7 FIGHT: presses, UP/DOWN ±2 and LEFT/RIGHT ±1 over a 2×2. MYSTERY_ENCOUNTER has no §7 row; its options sit on
    // the same grid.
    case "fight":
    case "mystery_encounter":
      return plan(walk("grid2x2"));
    // BALL has no §7 row: presses over a plain list. Its rows carry a ballType, Cancel does not (#46, #56).
    case "ball":
      if ("ballType" in target && menu.extra.catchable === false) throw cannotCatch(menu, target);
      return plan(walk("list"));
    // §7 TARGET_SELECT: presses; the cursor is a BattlerIndex. A spread move ignores the cursor: ACTION hits every
    // target and no direction moves it (#33).
    case "target_select":
      if (menu.extra.isMultipleTargets) return plan({ kind: "none" }, { targets: "all" });
      return plan(walk("battler_grid"));
    // §7 MODIFIER_SELECT: setRowCursor then setCursor, measured live every wave.
    case "modifier_select":
      return plan({ kind: "set", to: { family: "modifier_select", row: Number(target.row), col: Number(target.col) }, miss: "refuse", cursor: "shop cursor" });
    // §7 STARTER_SELECT grid: setCursor, measured live (#8).
    case "starter_select":
      return plan({ kind: "set", to: { family: "starter_select", index: i }, miss: "refuse", cursor: "grid cursor" });
    // §7 SUMMARY/LEARN_MOVE: setCursor(row) while moveSelect is on; presses (UP/DOWN ±1, wrapping over rows 0–4) as
    // the fallback. ACTION on a moveset row forgets it, on row 4 declines the new move (#31).
    case "learn_move":
      return plan({ kind: "set", to: { family: "learn_move", row: i }, miss: "walk", walk: { to: i, rule: "list" } });
    // §7 PARTY: the slot list is a DOWN-cycle, 0..n-1 → 6 (Cancel) → 0; the option phase is a plain list, presses always.
    case "party":
      return plan(walk(menu.extra.optionsMode ? "list" : "down_cycle"));
    // §7 SAVE_SLOT: presses over cursor + scrollCursor. MENU has no §7 row: presses over a plain list.
    case "save_slot":
    case "menu":
      return plan(walk("list"));
    // Modals have no §7 row: committed through the handler's own button action, mouse-only by construction (#13), with
    // no cursor to move.
    case "modal":
      return { reach: { kind: "none" }, commit: { kind: "modal_button", index: i }, choice: { kind: "modal_button", index: i }, extra: {} };
    // No Option to select (§7 SUMMARY: never position; anything unmodelled: nothing). `selectOption` refuses an empty
    // menu before planning, so reaching here is defensive.
    case "acknowledge":
    case "paged_viewer":
    case "unmapped":
    case null:
      throw new Refusal("no_options", `${menu.screen} presents no options to select; use press (ACTION acknowledges a message, CANCEL leaves a viewer).`, echo(menu));
  }
}

/** A trainer's Pokémon cannot be caught: the thrown ball is wasted (#56). */
function cannotCatch(menu: MenuRead, target: MenuOption): Refusal {
  return new Refusal("cannot_catch_trainer", `This is a trainer battle: its Pokémon cannot be caught, so ${JSON.stringify(target.label)} is refused. Nothing was pressed.`, echo(menu));
}

function echo(menu: MenuRead): Record<string, unknown> {
  return { screen: menu.screen, options: menu.options.map(o => normalizeLabel(o.label)), cursor: menu.cursor };
}
