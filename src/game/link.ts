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
import type { Reach } from "../hub/ladder.ts";
import type { Args, CommandName } from "../protocol/commands.ts";
import type { HubCode, RelayCode } from "../protocol/wire.ts";

/**
 * A command that got no answer: the page threw, the handler was missing, the tab went away (§9.7), the hub refused to
 * route it (§7.6), or there was no hub to ask at all.
 */
export type Fault = { fault: RelayCode | HubCode | "unreachable"; message: string };

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
 * What a transport does outside the command table: whether the game can be reached at all, who may act on it, the raw
 * keyboard, and the page's own errors. The CDP side of each is a tab it attaches to; the hub side is the ladder, the
 * driver grant and the `key` command (§12.1, §12.3).
 */
export interface Tab {
  /**
   * Whether a command can reach a game tab right now, and what `status` says about the transport. `needs` are the
   * commands the caller is about to use: one the connected extension never registered refuses alone (§8.5).
   */
  presence(needs?: readonly CommandName[]): Promise<Presence>;
  /** Takes the right to act on the game for this session (§7.5). A refusal is a tool's, so it carries its own wording. */
  claim(): Promise<Claim>;
  /** Whether this transport's own reads advance a frozen game loop (§10.3): CDP cannot, the hub's pumping probe does. */
  readonly pumps: boolean;
  /** Re-apply focus emulation (#23); nothing to do where the loop is pumped instead. */
  keepAlive(): Promise<void>;
  /** The button through the raw keyboard, on the fingerprint it was decided on. `false`: it has no keyboard equivalent. */
  rawKey(b: Button, fine: string): Promise<boolean>;
  /** The page's recent console errors and warnings, for diagnostics; asked for only when a result is not `ok` (§12.4). */
  tail(): Promise<ConsoleLine[]>;
  /** Called for every unhandled page exception (#16's hang corroboration). */
  onRejection(cb: (t: number) => void): void;
}

/** What the transport says about getting to a game tab, for `status` and for every tool's opening check (§12.3). */
export type Presence = {
  /** Null when a command can reach the one ready tab; otherwise the first failing rung, in the words the tool shows. */
  reach: Reach | null;
  /** The transport's own `status` fields: the CDP tab's attachment, or the hub's browsers, tabs and driver. */
  facts: Record<string, unknown>;
};

/** `contended` is the hub's word for a held grant and `tab_contended` the pidfile lock's: each transport refuses in its own (§7.5). */
export type Claim = { ok: true } | { ok: false; code: "contended" | "tab_contended"; message: string; detail?: Record<string, unknown> };
