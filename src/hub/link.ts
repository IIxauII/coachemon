/**
 * The hub's `GameLink` (extension-distribution.md §12.1). A command the hub or the relay refuses comes back as a
 * `Fault`, never a throw (`screenshot` aside), so `LinkGame` cannot tell the transports apart.
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

const NO_SCREENSHOT = "screenshot needs a dev build of Coachemon. Use read_menu or get_state to see the screen.";

/** The rest have no keyboard equivalent (extension-distribution.md §10.4). */
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

export const hubPort = (env: NodeJS.ProcessEnv = process.env): number => (env.COACHEMON_DEV === "1" ? DEV_PORT : STORE_PORT);

/** The one reading of the opt-in (extension-distribution.md §12.1), so the server and its scripts never disagree. */
export const usesHub = (env: NodeJS.ProcessEnv = process.env): boolean => env.COACHEMON_TRANSPORT === "hub";

export class HubLink implements GameLink, Tab {
  /** The hub's settles pump, so nothing here refuses a frozen loop (extension-distribution.md §10.3). */
  readonly pumps = true;
  readonly #client: HubClient;
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

  /** Drops the connection, which releases the driver grant with it (extension-distribution.md §7.5). */
  close(): void {
    this.#driving = false;
    this.#client.close();
  }

  async #run<N extends CommandName>(name: N, args: Args<N>): Promise<Result<N> | Fault> {
    const r = await this.#client.send(name, args as Record<string, unknown>);
    if (r.ok) return r.result as Result<N>;
    // The grant is gone: stop pumping, or every probe after it refuses `not-driver` (extension-distribution.md §7.5).
    if (r.code === "not-driver" || r.code === "contended") this.#driving = false;
    return { fault: r.code, message: r.message };
  }

  async probe(args: ProbeArgs): Promise<ProbeResult | Fault> {
    // The driver pumps every poll, reads included (extension-distribution.md §10.3).
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
   * A store build never registered it (extension-distribution.md §12.2). A capture is over the frame cap, so it comes
   * one part per call (§10.6), and every part after the first names its capture: a second `screenshot` in flight would
   * otherwise splice two images together.
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

  /** Also what turns this link's probes into pumping ones (extension-distribution.md §7.5). */
  async claim(): Promise<Claim> {
    this.#driving = await this.#client.claim();
    return this.#driving
      ? { ok: true }
      : { ok: false, code: "contended", message: "Another Coachemon session is driving this tab. Finish or close that session, then retry. Nothing was pressed." };
  }

  /** Nothing to re-apply: the extension holds its own socket, and the page is never focus-emulated (extension-distribution.md §10.3). */
  async keepAlive(): Promise<void> {}

  async rawKey(b: Button, fine: string): Promise<boolean> {
    const button = KEY_NAMES[b];
    if (button === undefined) return false;
    const r = await this.key({ button, fine });
    return !("fault" in r) && r.ok === true;
  }

  async tail(): Promise<ConsoleLine[]> {
    const r = await this.probe({ tail: true });
    return "fault" in r ? [] : (r.console ?? []);
  }

  onRejection(cb: (t: number) => void): void {
    this.#rejection = cb;
  }

  #noteError(p: ProbeResult): void {
    if (typeof p.errorAt !== "number" || p.errorAt === this.#errorAt) return;
    this.#errorAt = p.errorAt;
    this.#rejection?.(p.errorAt);
  }
}

/** (extension-distribution.md §7.5) */
function routable(extensions: readonly ExtensionInfo[], tabs: readonly TabInfo[]): Set<CommandName> {
  const ready = tabs.filter(t => t.state === "ready");
  if (ready.length !== 1) return new Set();
  const owner = extensions.find(e => e.conn === ready[0].conn);
  return new Set((owner?.commands ?? []) as CommandName[]);
}
