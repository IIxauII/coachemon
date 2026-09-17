/**
 * Runtime messaging between a relay and the background (§8.3). The relay never learns its own tab id: the background
 * takes it from `sender.tab.id` and keys everything by it, which is also why no message here carries one.
 */
import type { EventKind, RelayCode, TabState } from "../../src/protocol/wire.ts";

/** A relay announcing what its tab is now (§9.3). */
export type TabReport = { t: "tab"; state: TabState; title: string };

/**
 * The relay's 20 s tick, which is what holds Firefox's event page, and how the background re-learns tabs after any
 * restart (§8.2). It carries the tab's state so a restarted background needs nothing else.
 */
export type Keepalive = { t: "keepalive"; state: TabState | null; title: string };

/** A HUD event that passed the relay's structural filter (§9.5). */
export type EventReport = { t: "event"; kind: EventKind; body: Record<string, unknown> };

export type ToBackground = TabReport | Keepalive | EventReport;

/** One command, forwarded from the hub frame unchanged but for the tab id (§7.6). */
export type CmdMessage = { t: "cmd"; id: number; name: string; args: Record<string, unknown> };

/** What the relay answers through `sendResponse`, ready to go on the wire as it stands. */
export type RelayReply =
  | { t: "reply"; id: number; ok: true; result: unknown }
  | { t: "reply"; id: number; ok: false; code: RelayCode; message: string };

export const KEEPALIVE_MS = 20_000;

/** What both caps say when they refuse (§8.3, §9.7): the relay's, on the detail, and the background's, on the frame. */
export const TOO_LARGE = "reply over 1 MB";
