/**
 * The hub link (§12.1): a `GameLink` whose commands go over the loopback socket to whichever browser holds the one
 * ready pokerogue.net tab. Selected by `COACHEMON_TRANSPORT=hub` until the flip deletes the CDP link (§13.1).
 *
 * It is also the tab's side of that transport, so the Driver keeps one shape across both: attaching becomes a
 * reachability check, focus emulation goes away (the driver's settles pump instead, §10.3), the raw keyboard becomes
 * the `key` command, and the page's errors and console come from `probe`'s `errorAt` and `tail` (§12.4).
 */
import type { Button } from "../enums/generated.ts";
import { Refusal } from "../envelope.ts";
import type { Fault, GameLink, Tab, Unready } from "../game/link.ts";
import type { CursorLearnResult, CursorOptionResult, CursorShopResult, CursorStarterResult, KeyResult, ModalResult, PressResult } from "../page/acts.ts";
import type { CardResult } from "../page/card.ts";
import type { ConsoleLine } from "../page/errors.ts";
import type { MenuResult } from "../page/menu.ts";
import type { ProbeArgs, ProbeResult } from "../page/probe.ts";
import type { SnapshotDetail } from "../page/snapshot.ts";
import type { StartersResult } from "../page/starters.ts";
import { KEY_BUTTONS, type Args, type CommandName } from "../protocol/commands.ts";
import type { ClientReply } from "../protocol/wire.ts";
import { dial, type HubClient } from "./client.ts";
import { offeredCommands, reachLadder, type Fleet, type Reach } from "./reach.ts";

/** Each button's name in the `key` command's vocabulary; a button outside it has no raw fallback (§10.4). */
const KEY_NAMES = new Set<string>(KEY_BUTTONS);

export type HubLinkOptions = {
  port: number;
  version: string;
  /** Button numbers back to their names, so `rawKey` can say which key it means. */
  names: Readonly<Record<number, string>>;
  spawnHub?: boolean;
};

export class HubLink implements GameLink, Tab {
  readonly #opts: HubLinkOptions;
  #client: HubClient | null = null;
  #dialing: Promise<HubClient | Reach> | null = null;
  #commands: ReadonlySet<string> = new Set();
  /** Set once this link takes the grant: only the driver's settles pump the game loop (§10.3). */
  #claimed = false;
  /** The fine fingerprint of the last probe, so the raw-key rung can say what it decided on (§10.2). */
  #fine = "";
  #console: ConsoleLine[] = [];
  #errorAt: number | null = null;
  #onRejection: ((t: number) => void) | null = null;

  constructor(opts: HubLinkOptions) {
    this.#opts = opts;
  }

  /** What this browser offers, as its hello listed it. Empty until a reachability check has read the hub's state. */
  get commands(): ReadonlySet<CommandName> {
    return this.#commands as ReadonlySet<CommandName>;
  }

  // -------------------------------------------------------------- the hub

  /** Everything `status` reports and every tool checks first (§12.2, §12.3), from one `state` frame. */
  async fleet(needed: readonly string[] = []): Promise<Fleet> {
    const c = await this.#connect();
    if (!isClient(c)) return { browsers: [], tabs: [], driver: null, commands: new Set(), reach: c, skew: null };
    const state = await c.state();
    this.#commands = offeredCommands(state);
    return { browsers: state.extensions, tabs: state.tabs, driver: state.driver, commands: this.#commands, reach: reachLadder(state, needed), skew: c.skew };
  }

  /** Takes the driver grant at an acting call's start (§7.5). `false`: another session holds it. */
  async claim(): Promise<boolean> {
    const c = await this.#connect();
    if (!isClient(c)) return false;
    this.#claimed = await c.claim();
    return this.#claimed;
  }

  close(): void {
    this.#client?.close();
    this.#client = null;
    this.#claimed = false;
  }

  /** One live connection, redialled whenever the last one went away — an idle hub exits, and the next call restarts it. */
  async #connect(): Promise<HubClient | Reach> {
    if (this.#client?.open) return this.#client;
    this.#dialing ??= dial({ port: this.#opts.port, version: this.#opts.version, role: "server", spawnHub: this.#opts.spawnHub })
      .then(d => {
        this.#dialing = null;
        if (!d.ok) {
          this.#client = null;
          return d.reach;
        }
        this.#client = d.client;
        // A fresh socket holds no grant: the next acting call claims again.
        this.#claimed = false;
        return d.client;
      })
      .catch((e): Reach => {
        this.#dialing = null;
        return { rung: 2, line: `The Coachemon hub would not start: ${(e as Error).message}.` };
      });
    return this.#dialing;
  }

  // ------------------------------------------------------------- commands

  /** A command, or the fault that stood in its way. No hub at all is `no-tab`: the ladder's line says which rung. */
  async #run<T>(name: string, args: Record<string, unknown>): Promise<T | Fault> {
    const c = await this.#connect();
    if (!isClient(c)) return { fault: "no-tab", message: c.line };
    const reply: ClientReply = await c.send(name, args);
    return reply.ok ? (reply.result as T) : { fault: reply.code, message: reply.message };
  }

  /**
   * The driver's settles pump, and nobody else's: the hub refuses `pump` from a client without the grant (§10.3).
   * Every probe's `errorAt` and `console` are kept here, because that is where the tab's diagnostics now come from.
   */
  async probe(args: ProbeArgs): Promise<ProbeResult | Fault> {
    const r = await this.#run<ProbeResult>("probe", { ...args, pump: args.pump ?? this.#claimed });
    if ("fault" in r) return r;
    if (r.ready) this.#fine = r.fine;
    if (r.console) this.#console = r.console;
    const at = r.errorAt;
    if (at !== null && (this.#errorAt === null || at > this.#errorAt)) {
      this.#errorAt = at;
      this.#onRejection?.(at);
    }
    return r;
  }

  menu() { return this.#run<MenuResult | Unready>("menu", {}); }
  snapshot(args: { detail: SnapshotDetail }) { return this.#run<Record<string, unknown> | Unready>("snapshot", args); }
  starters() { return this.#run<StartersResult | Unready>("starters", {}); }
  card() { return this.#run<CardResult | Unready>("card", {}); }
  press(args: Args<"press">) { return this.#run<PressResult>("press", args); }
  key(args: Args<"key">) { return this.#run<KeyResult>("key", args); }
  cursorOption(args: Args<"cursor.option">) { return this.#run<CursorOptionResult>("cursor.option", args); }
  cursorShop(args: Args<"cursor.shop">) { return this.#run<CursorShopResult>("cursor.shop", args); }
  cursorStarter(args: Args<"cursor.starter">) { return this.#run<CursorStarterResult>("cursor.starter", args); }
  cursorLearn(args: Args<"cursor.learn">) { return this.#run<CursorLearnResult>("cursor.learn", args); }
  modal(args: Args<"modal">) { return this.#run<ModalResult>("modal", args); }

  /** A store build carries no screenshot command; the dev table's is a dev build's (§10.6, §12.2). */
  async screenshot(): Promise<string> {
    const r = await this.#run<{ png?: string }>("screenshot", {});
    if ("fault" in r || typeof r.png !== "string") {
      throw new Refusal("unavailable", "screenshot needs a dev build of Coachemon. Use read_menu or get_state to see the screen.");
    }
    return r.png;
  }

  // ------------------------------------------------------------------ tab

  /** There is no attaching over the hub: the tab is either reachable or it is not, and the server never starts a browser. */
  async attach(): Promise<{ attached: boolean; launchedChrome: boolean }> {
    const f = await this.fleet();
    return { attached: f.reach === null && f.skew === null, launchedChrome: false };
  }

  /** Focus emulation was CDP's; a hidden tab is handled by the pump instead (§10.3). */
  async keepAlive(): Promise<void> {}

  async rawKey(b: Button): Promise<boolean> {
    const name = this.#opts.names[b];
    if (!name || !KEY_NAMES.has(name)) return false;
    const r = await this.key({ button: name as Args<"key">["button"], fine: this.#fine });
    return !("fault" in r);
  }

  /** §12.4: the console tail is a `probe { tail: true }`, asked for only when a result is already not `ok`. */
  async consoleTail(): Promise<ConsoleLine[]> {
    await this.probe({ tail: true });
    return this.#console;
  }

  onRejection(cb: (t: number) => void): void {
    this.#onRejection = cb;
  }
}

const isClient = (v: HubClient | Reach): v is HubClient => !("rung" in v);
