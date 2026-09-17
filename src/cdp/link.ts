/**
 * The CDP link (§12.1): every store command as one `Runtime.evaluate` of the page handler, stringified with `dispatch`,
 * the locator, `fine` and `disc` as its arguments (§10.5). One source serves this link and the extension until CDP is
 * deleted at the flip. Because the whole command is one evaluate, an act's fingerprint check and the act itself run
 * in the same page turn (§10.2).
 *
 * It is also the tab's CDP side (`Tab`): attach-else-launch, focus emulation, the trusted raw keyboard, and CDP's own
 * exception and console events.
 */
import { Button } from "../enums/generated.ts";
import type { Fault, GameLink, Tab } from "../game/link.ts";
import { disc } from "../page/disc.ts";
import { dispatch } from "../page/dispatch.ts";
import type { ConsoleLine } from "../page/errors.ts";
import { fine } from "../page/fine.ts";
import { HANDLERS, type Result } from "../page/handlers.ts";
import { locate } from "../page/locate.ts";
import { COMMAND_NAMES, STORE_COMMANDS, type Args, type CommandName } from "../protocol/commands.ts";
import { isThrown, type CdpSession } from "./session.ts";

/** The part of `CdpSession` the link drives. */
export type LinkSession = Pick<CdpSession, "attached" | "launchedChrome" | "onException" | "ensure" | "evaluate" | "keepAlive" | "rawKey" | "screenshot" | "consoleTail">;

/** Each button's keyboard equivalent, for the raw fallback (§6.4). Phaser binds to `window`, so a dispatched key reaches the game (#9). */
const RAW_KEYS: Partial<Record<Button, [key: string, code: string, keyCode: number]>> = {
  [Button.UP]: ["ArrowUp", "ArrowUp", 38],
  [Button.DOWN]: ["ArrowDown", "ArrowDown", 40],
  [Button.LEFT]: ["ArrowLeft", "ArrowLeft", 37],
  [Button.RIGHT]: ["ArrowRight", "ArrowRight", 39],
  [Button.ACTION]: ["z", "KeyZ", 90],
  [Button.CANCEL]: ["x", "KeyX", 88],
  [Button.SUBMIT]: ["Enter", "Enter", 13],
  [Button.MENU]: ["Escape", "Escape", 27],
};

/** Each command's expression up to its arguments: the functions stringify once. */
const PREFIX = Object.fromEntries(
  COMMAND_NAMES.map(name => [name, `(${dispatch})(${locate}, ${fine}, ${disc}, ${HANDLERS[name]}, ${JSON.stringify(name)}, ${JSON.stringify(STORE_COMMANDS[name].kind)}, `]),
) as Record<CommandName, string>;

export class CdpLink implements GameLink, Tab {
  readonly commands: ReadonlySet<CommandName> = new Set(COMMAND_NAMES);
  readonly #session: LinkSession;

  constructor(session: LinkSession) {
    this.#session = session;
  }

  /** Every command attaches first: attach-else-launch is the session's, and idempotent. */
  async #run<N extends CommandName>(name: N, args: Args<N>): Promise<Result<N> | Fault> {
    await this.#session.ensure();
    const r = await this.#session.evaluate<Result<N>>(`${PREFIX[name]}${JSON.stringify(args)})`);
    return isThrown(r) ? { fault: "threw", message: r.__throw } : r;
  }

  probe(args: Args<"probe">) { return this.#run("probe", args); }
  menu() { return this.#run("menu", {}); }
  snapshot(args: Args<"snapshot">) { return this.#run("snapshot", args); }
  starters() { return this.#run("starters", {}); }
  card() { return this.#run("card", {}); }
  press(args: Args<"press">) { return this.#run("press", args); }
  key(args: Args<"key">) { return this.#run("key", args); }
  cursorOption(args: Args<"cursor.option">) { return this.#run("cursor.option", args); }
  cursorShop(args: Args<"cursor.shop">) { return this.#run("cursor.shop", args); }
  cursorStarter(args: Args<"cursor.starter">) { return this.#run("cursor.starter", args); }
  cursorLearn(args: Args<"cursor.learn">) { return this.#run("cursor.learn", args); }
  modal(args: Args<"modal">) { return this.#run("modal", args); }

  async screenshot(): Promise<string> {
    await this.#session.ensure();
    return this.#session.screenshot();
  }

  // ------------------------------------------------------------------ tab

  async attach(): Promise<{ attached: boolean; launchedChrome: boolean }> {
    await this.#session.ensure();
    return { attached: this.#session.attached, launchedChrome: this.#session.launchedChrome };
  }

  async keepAlive(): Promise<void> {
    await this.#session.ensure();
    await this.#session.keepAlive();
  }

  async rawKey(b: Button): Promise<boolean> {
    const k = RAW_KEYS[b];
    if (!k) return false;
    await this.#session.ensure();
    await this.#session.rawKey(...k);
    return true;
  }

  consoleTail(): ConsoleLine[] {
    return this.#session.consoleTail();
  }

  onRejection(cb: (t: number) => void): void {
    this.#session.onException = cb;
  }
}
