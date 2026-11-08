/**
 * No message carries a tab id: the relay never learns its own, and the background keys everything by `sender.tab.id`
 * (extension-distribution.md §8.3).
 */
import type { EventKind, RelayCode, TabState } from "../../src/protocol/wire.ts";

export type TabReport = { t: "tab"; state: TabState; title: string };

/** Carries the tab's state, so a restarted background re-learns the tab from it alone (extension-distribution.md §8.2). */
export type Keepalive = { t: "keepalive"; state: TabState | null; title: string };

/** A HUD event that passed the relay's structural filter (extension-distribution.md §9.5). */
export type EventReport = { t: "event"; kind: EventKind; body: Record<string, unknown> };

export type ToBackground = TabReport | Keepalive | EventReport;

export type CmdMessage = { t: "cmd"; id: number; name: string; args: Record<string, unknown> };

/**
 * A **grab**, on its way down to one tab (#418's hop). The probe's carries which route fired, so the panel can log it.
 * Nothing answers it, and it never reaches the hub.
 */
export type GrabMessage = {
  t: "grab";
  /** `command`: `commands.onCommand`. `action`: `action.onClicked`. */
  route: "command" | "action";
  name: string;
  /** The background's `Date.now()` when the browser handed it the event. */
  at: number;
  /** Whether the tab came with the event, from `tabs.query`, or not at all. */
  tabFrom: "event" | "query";
};

/** What the background sends down to a relay. */
export type ToRelay = CmdMessage | GrabMessage;

/** A question from the probe's panel or its options page to the background. The answer is JSON-able. */
export type ProbeAsk = { t: "probe-ask"; ask: string };

/** Ready to go on the wire as it stands. */
export type RelayReply =
  | { t: "reply"; id: number; ok: true; result: unknown }
  | { t: "reply"; id: number; ok: false; code: RelayCode; message: string };

export const KEEPALIVE_MS = 20_000;

/** What both caps say when they refuse (extension-distribution.md §8.3, §9.7): the relay's, on the detail, and the background's, on the frame. */
export const TOO_LARGE = "reply over 1 MB";
