/**
 * The hub link (§12.1): the same `GameLink` the CDP link implements, carried as hub frames instead of `Runtime.evaluate`.
 * One command per method, one frame each; every refusal the hub or the relay answers becomes a `Fault`, so `LinkGame`
 * above it cannot tell the transports apart.
 *
 * What it adds over the CDP link is what the hub knows and CDP never did: whether a tab is reachable at all and why not
 * (§12.3), the driver grant (§7.5), and the pump — a server holding the grant sets `pump: true` on every probe, which
 * is what keeps a hidden tab's game loop moving for its settles (§10.3).
 */
import { HubClient, type ClientOptions } from "./client.ts";
import { reach } from "./ladder.ts";
import { Button } from "../enums/generated.ts";
import { Refusal } from "../envelope.ts";
import type { Claim, Fault, GameLink, Presence, Tab } from "../game/link.ts";
import type { ConsoleLine } from "../page/errors.ts";
import type { Result } from "../page/handlers.ts";
import type { ProbeArgs, ProbeResult } from "../page/probe.ts";
import { KEY_BUTTONS, type Args, type CommandName } from "../protocol/commands.ts";
import { DEV_PORT, STORE_PORT } from "../protocol/version.ts";
import type { ExtensionInfo, TabInfo } from "../protocol/wire.ts";

/** What `screenshot` says against a store build, which has no dev table (§12.2). */
const NO_SCREENSHOT = "screenshot needs a dev build of Coachemon. Use read_menu or get_state to see the screen.";

/** Each raw-keyboard button's name in the `key` command (§10.4); the rest have no keyboard equivalent. */
const KEY_NAMES: Partial<Record<Button, (typeof KEY_BUTTONS)[number]>> = {
  [Button.UP]: "UP",
  [Button.DOWN]: "DOWN",
  [Button.LEFT]: "LEFT",
  [Button.RIGHT]: "RIGHT",
  [Button.ACTION]: "ACTION",
  [Button.CANCEL]: "CANCEL",
  [Button.SUBMIT]: "SUBMIT",
  [Button.MENU]: "MENU",
};

/** 47147, or the dev hub's 47148 from a checkout with `COACHEMON_DEV=1`, so a dev build never double-counts a tab (§7.2). */
export const hubPort = (env: NodeJS.ProcessEnv = process.env): number => (env.COACHEMON_DEV === "1" ? DEV_PORT : STORE_PORT);

/**
 * Whether this process talks to the hub at all. The transport is CDP until the flip deletes the choice, and only the
 * dev opts in (§12.1, §13.1). One answer, so the server and the scripts around it can never disagree about it.
 */
export const usesHub = (env: NodeJS.ProcessEnv = process.env): boolean => env.COACHEMON_TRANSPORT === "hub";

export class HubLink implements GameLink, Tab {
  /** The hub's settles pump, so nothing here refuses a frozen loop (§10.3). */
  readonly pumps = true;
  readonly #client: HubClient;
  /** What the connected extension registered; every tool reads it before deciding it can run (§8.5). */
  #commands = new Set<CommandName>();
  #driving = false;
  #errorAt: number | null = null;
  #rejection: ((t: number) => void) | null = null;

  constructor(o: ClientOptions) {
    this.#client = new HubClient(o);
  }

  get commands(): ReadonlySet<CommandName> {
    return this.#commands;
  }

  /** Drops the connection, which releases the driver grant with it (§7.5). */
  close(): void {
    this.#driving = false;
    this.#client.close();
  }

  // ------------------------------------------------------------- commands

  async #run<N extends CommandName>(name: N, args: Args<N>): Promise<Result<N> | Fault> {
    const r = await this.#client.send(name, args as Record<string, unknown>);
    if (r.ok) return r.result as Result<N>;
    // The grant went with a dropped socket, or to someone else: stop pumping rather than refuse every probe (§7.5).
    if (r.code === "not-driver" || r.code === "contended") this.#driving = false;
    return { fault: r.code, message: r.message };
  }

  async probe(args: ProbeArgs): Promise<ProbeResult | Fault> {
    // Only the driver may pump, and it pumps every poll, reads included (§10.3).
    const r = await this.#run("probe", this.#driving ? { ...args, pump: true } : args);
    if (!("fault" in r)) this.#noteError(r);
    return r;
  }

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

  /**
   * The dev table's `screenshot`; a store build never registered it, and says so rather than failing obscurely (§12.2).
   *
   * A capture is larger than the 1 MB frame cap, so the extension holds it and answers one part per call (§10.6). The
   * first call takes the capture and says how many parts it has; the rest name that capture, so a second `screenshot`
   * in flight can never splice two images together.
   */
  async screenshot(): Promise<string> {
    const first = await this.#capture(0, null);
    let png = first.png;
    for (let part = 1; part < first.parts; part++) png += (await this.#capture(part, first.id)).png;
    return png;
  }

  async #capture(part: number, id: number | null): Promise<{ id: number; parts: number; png: string }> {
    const r = await this.#client.send("screenshot", id === null ? {} : { id, part });
    if (!r.ok) throw new Refusal("unavailable", NO_SCREENSHOT, { code: r.code });
    const v = (r.result ?? {}) as { ok?: unknown; id?: unknown; parts?: unknown; png?: unknown; why?: unknown };
    if (v.ok !== true || typeof v.png !== "string" || typeof v.id !== "number" || typeof v.parts !== "number") {
      throw new Refusal("unavailable", NO_SCREENSHOT, typeof v.why === "string" ? { why: v.why } : {});
    }
    return { id: v.id, parts: v.parts, png: v.png };
  }

  // ------------------------------------------------------------------ tab

  /** What stands between this call and the game, and what `status` says about the transport (§12.3). */
  async presence(needs?: readonly CommandName[]): Promise<Presence> {
    const trouble = await this.#client.ready();
    const state = trouble === null ? await this.#client.state() : null;
    const extensions: ExtensionInfo[] = state?.extensions ?? [];
    const tabs = state?.tabs ?? [];
    this.#commands = routable(extensions, tabs);
    if (state !== null && state.driver !== "you") this.#driving = false;
    return {
      reach: reach({ trouble, extensions, tabs, needs }),
      facts: {
        browsers: extensions.map(e => ({ target: e.target, version: e.version, flavour: e.flavour, protocol: e.protocol, consent: e.consent })),
        tabs: tabs.filter(t => t.state === "ready").length,
        driver: state?.driver ?? null,
      },
    };
  }

  /** The grant, taken when an acting call starts (§7.5). It is also what turns this link's probes into pumping probes. */
  async claim(): Promise<Claim> {
    this.#driving = await this.#client.claim();
    return this.#driving
      ? { ok: true }
      : { ok: false, code: "contended", message: "Another Coachemon session is driving this tab. Finish or close that session, then retry. Nothing was pressed." };
  }

  /** Nothing to re-apply: the extension holds its own socket, and the page is never focus-emulated (§10.3). */
  async keepAlive(): Promise<void> {}

  async rawKey(b: Button, fine: string): Promise<boolean> {
    const button = KEY_NAMES[b];
    if (button === undefined) return false;
    const r = await this.key({ button, fine });
    return !("fault" in r) && r.ok === true;
  }

  /** The page's own recent errors and warnings, asked for only when a result is not `ok` (§12.4). */
  async tail(): Promise<ConsoleLine[]> {
    const r = await this.probe({ tail: true });
    return "fault" in r ? [] : (r.console ?? []);
  }

  onRejection(cb: (t: number) => void): void {
    this.#rejection = cb;
  }

  /** Every probe carries the page's latest uncaught error; a newer one is the hang watch's corroboration (§12.4). */
  #noteError(p: ProbeResult): void {
    if (typeof p.errorAt !== "number" || p.errorAt === this.#errorAt) return;
    this.#errorAt = p.errorAt;
    this.#rejection?.(p.errorAt);
  }
}

/**
 * The commands of the extension a command would actually be routed to: the one holding the single counted tab (§7.5).
 * With no such tab there is nothing to route to, and nothing to promise.
 */
function routable(extensions: readonly ExtensionInfo[], tabs: readonly TabInfo[]): Set<CommandName> {
  const ready = tabs.filter(t => t.state === "ready");
  if (ready.length !== 1) return new Set();
  const owner = extensions.find(e => e.conn === ready[0].conn);
  return new Set((owner?.commands ?? []) as CommandName[]);
}
