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
import type { Claim, Fault, GameLink, Presence, Tab } from "../game/link.ts";
import { lockContended, type Lock } from "./lock.ts";
import { disc } from "../page/disc.ts";
import { dispatch } from "../page/dispatch.ts";
import type { ConsoleLine } from "../page/errors.ts";
import { fine } from "../page/fine.ts";
import { COMMAND_HANDLERS, type Result } from "../page/handlers.ts";
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
  COMMAND_NAMES.map(name => [name, `(${dispatch})(${locate}, ${fine}, ${disc}, ${COMMAND_HANDLERS[name]}, ${JSON.stringify(name)}, ${JSON.stringify(STORE_COMMANDS[name].kind)}, `]),
) as Record<CommandName, string>;

export class CdpLink implements GameLink, Tab {
  readonly commands: ReadonlySet<CommandName> = new Set(COMMAND_NAMES);
  /** CDP reads never advance a frozen loop: the guard still checks the frame and refuses `loop_frozen` (#23, §10.3). */
  readonly pumps = false;
  readonly #session: LinkSession;
  readonly #lock: Lock | null;

  constructor(session: LinkSession, lock: Lock | null = null) {
    this.#session = session;
    this.#lock = lock;
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

  /**
   * Attach-else-launch is this transport's whole reachability: there is no hub, no browser list and no tab count, so
   * none of the ladder's rungs can be evaluated and a tab that will not attach is simply not there (§12.3).
   */
  async presence(): Promise<Presence> {
    let error: string | null = null;
    try {
      await this.#session.ensure();
    } catch (e) {
      error = (e as Error).message;
    }
    const contended = this.#contention();
    const attached = error === null && this.#session.attached;
    return {
      reach: attached ? null : { code: "unreachable", rung: null, line: error ?? "The server is not attached to a PokéRogue tab." },
      facts: { attached, error, tab_contended: contended.contended, lock_holder: contended.holder, chrome_launched_by_server: this.#session.launchedChrome },
    };
  }

  /** The pidfile lock is CDP's driver grant, and stays until the flip deletes this link (§7.5, §13.2). */
  async claim(): Promise<Claim> {
    const c = this.#contention();
    if (!c.contended) return { ok: true };
    return { ok: false, code: "tab_contended", message: `Another driver (pid ${c.holder}) holds the tab. Nothing was pressed.`, detail: { holder: c.holder } };
  }

  /** Whether another live driver holds the lock; with no lock (a test, a second link) nothing is contended. */
  #contention(): { contended: boolean; holder: number | null } {
    return this.#lock ? lockContended(this.#lock) : { contended: false, holder: null };
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

  /** CDP's own console events, already collected: nothing is asked of the page (§12.4). */
  async tail(): Promise<ConsoleLine[]> {
    return this.#session.consoleTail();
  }

  onRejection(cb: (t: number) => void): void {
    this.#session.onException = cb;
  }
}
