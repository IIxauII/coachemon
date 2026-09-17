/**
 * The transport seam (§12.1): how the server reaches a game tab. A `GameLink` has one method per store command (§10.1),
 * each answering what the page handler answered, or a `Fault` when the command never got an answer from the page.
 * `src/cdp/link.ts` is the CDP link; the hub link joins it behind the same interface.
 *
 * The link knows nothing about Screens, settling or refusals: `LinkGame` turns its answers into the game port the Driver
 * uses (#127).
 */
import type { Button } from "../enums/generated.ts";
import type { CursorLearnResult, CursorOptionResult, CursorShopResult, CursorStarterResult, KeyResult, ModalResult, PressResult } from "../page/acts.ts";
import type { CardResult } from "../page/card.ts";
import type { ConsoleLine } from "../page/errors.ts";
import type { MenuResult } from "../page/menu.ts";
import type { ProbeArgs, ProbeResult } from "../page/probe.ts";
import type { SnapshotDetail } from "../page/snapshot.ts";
import type { StartersResult } from "../page/starters.ts";
import type { Args, CommandName } from "../protocol/commands.ts";
import type { HubCode, RelayCode } from "../protocol/wire.ts";

/** A command that got no answer from its handler: the page threw, the handler was missing, the tab went away (§9.7). */
export type Fault = { fault: RelayCode | HubCode; message: string };

export const isFault = (v: unknown): v is Fault => typeof v === "object" && v !== null && "fault" in v;

/** A read's answer: off the game it is the locator's refusal (§10.1). */
export type Unready = { ok: false; why: string };

export interface GameLink {
  /** The commands this link can send: the whole store table on CDP, the extension's hello on the hub. */
  readonly commands: ReadonlySet<CommandName>;
  probe(args: ProbeArgs): Promise<ProbeResult | Fault>;
  menu(): Promise<MenuResult | Unready | Fault>;
  snapshot(args: { detail: SnapshotDetail }): Promise<Record<string, unknown> | Unready | Fault>;
  starters(): Promise<StartersResult | Unready | Fault>;
  card(): Promise<CardResult | Unready | Fault>;
  press(args: Args<"press">): Promise<PressResult | Fault>;
  key(args: Args<"key">): Promise<KeyResult | Fault>;
  cursorOption(args: Args<"cursor.option">): Promise<CursorOptionResult | Fault>;
  cursorShop(args: Args<"cursor.shop">): Promise<CursorShopResult | Fault>;
  cursorStarter(args: Args<"cursor.starter">): Promise<CursorStarterResult | Fault>;
  cursorLearn(args: Args<"cursor.learn">): Promise<CursorLearnResult | Fault>;
  modal(args: Args<"modal">): Promise<ModalResult | Fault>;
  /** A base64 PNG. */
  screenshot(): Promise<string>;
}

/**
 * What the CDP transport does to the tab outside the command table, until the flip replaces each (§13.2): attaching,
 * focus emulation, the trusted raw keyboard, and CDP's own exception and console events.
 */
export interface Tab {
  attach(): Promise<{ attached: boolean; launchedChrome: boolean }>;
  /** Re-apply focus emulation (#23). */
  keepAlive(): Promise<void>;
  /** The button through the raw keyboard. `false`: it has no keyboard equivalent, and nothing was sent. */
  rawKey(b: Button): Promise<boolean>;
  /** The page's recent console errors and warnings, for diagnostics. */
  consoleTail(): Promise<ConsoleLine[]>;
  /** Called for every unhandled page exception (#16's hang corroboration). */
  onRejection(cb: (t: number) => void): void;
}
