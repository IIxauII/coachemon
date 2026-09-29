/** The extension registers exactly these in a store build (extension-distribution.md §10.1). */
import type { CommandName } from "../protocol/commands.ts";
import { cursorLearn, cursorOption, cursorShop, cursorStarter, key, modal, press } from "./acts.ts";
import { card } from "./card.ts";
import { menu } from "./menu.ts";
import { probe } from "./probe.ts";
import { snapshot } from "./snapshot.ts";
import { starters } from "./starters.ts";

export const COMMAND_HANDLERS = Object.freeze({
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

export type Result<N extends CommandName> = ReturnType<(typeof COMMAND_HANDLERS)[N]>;
