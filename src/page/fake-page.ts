import { disc } from "./disc.ts";
import { dispatch } from "./dispatch.ts";
import { COMMAND_HANDLERS } from "./handlers.ts";
import { fine } from "./fine.ts";
import { locate } from "./locate.ts";
import { PAGE_MODES } from "./modes.ts";
import { STORE_COMMANDS, type Args, type CommandName } from "../protocol/commands.ts";

type Globals = { Phaser?: unknown; document?: unknown };

export function onPage(t: { after: (fn: () => void) => void }, scene: Record<string, unknown>, game: Record<string, unknown> = {}): void {
  const g = globalThis as Globals;
  const prev = { Phaser: g.Phaser, document: g.document };
  const theGame = { isBooted: true, isRunning: true, scene: { getScene: (key: string) => (key === "battle" ? scene : null) }, ...game };
  g.Phaser = { Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: theGame } }] } } } };
  // A tab without the touch-controls element, which the probe reads for its DOM mode.
  g.document = { getElementById: () => null };
  t.after(() => {
    g.Phaser = prev.Phaser;
    g.document = prev.document;
  });
}

export function offPage(t: { after: (fn: () => void) => void }): void {
  const g = globalThis as Globals;
  const prev = { Phaser: g.Phaser, document: g.document };
  delete g.Phaser;
  g.document = { getElementById: () => null };
  t.after(() => {
    g.Phaser = prev.Phaser;
    g.document = prev.document;
  });
}

export function send<N extends CommandName>(name: N, args: Args<N>): any {
  return dispatch(locate, fine, disc, COMMAND_HANDLERS[name], name, STORE_COMMANDS[name].kind, PAGE_MODES, args);
}
