/**
 * The page's dispatch table: one handler per store command (§10.1). The extension registers exactly these in a store
 * build; the CDP link stringifies them one at a time (§10.5).
 */
import type { CommandName } from "../protocol/commands.ts";
import { cursorLearn, cursorOption, cursorShop, cursorStarter, key, modal, press } from "./acts.ts";
import { card } from "./card.ts";
import { menu } from "./menu.ts";
import { probe } from "./probe.ts";
import { snapshot } from "./snapshot.ts";
import { starters } from "./starters.ts";

export const HANDLERS = Object.freeze({
  probe,
  menu,
  snapshot,
  starters,
  card,
  press,
  key,
  "cursor.option": cursorOption,
  "cursor.shop": cursorShop,
  "cursor.starter": cursorStarter,
  "cursor.learn": cursorLearn,
  modal,
} satisfies Record<CommandName, (L: any, args: any) => unknown>);

/** What a command's handler answers. */
export type Result<N extends CommandName> = ReturnType<(typeof HANDLERS)[N]>;
