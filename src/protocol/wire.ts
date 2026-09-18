/**
 * The hub's frames (§7.6). Every frame is one JSON text message; `t` names it. Types only, no runtime.
 */
import type { CommandName } from "./commands.ts";

export type Target = "chrome" | "firefox" | "safari";
export type Flavour = "store" | "dev";

/** What a relay or the background answers instead of a result (§9.7). */
export type RelayCode = "no-handler" | "threw" | "too-large" | "wrong-world" | "tab-gone";

/** What the hub answers instead of routing a command (§7.6). */
export type HubCode = "no-tab" | "tabs" | "unknown-command" | "missing-command" | "protocol" | "contended" | "not-driver" | "timeout";

export type TabState = "ready" | "gone" | "wrong-world";

export type Welcome = { t: "welcome"; product: string; protocol: number; version: string };

export type ReplyOk = { t: "reply"; id: number; ok: true; result: unknown };

// ------------------------------------------------------------- browser ↔ hub

export type ExtensionHello = {
  t: "hello";
  protocol: number;
  version: string;
  target: Target;
  flavour: Flavour;
  build: string;
  consent: boolean;
  commands: string[];
};

export type TabFrame = { t: "tab"; tab: number; state: TabState; title: string };
export type ConsentFrame = { t: "consent"; consent: boolean };
export type Ping = { t: "ping" };
export type ExtensionCmd = { t: "cmd"; id: number; tab: number; name: string; args: Record<string, unknown> };
export type ExtensionReply = ReplyOk | { t: "reply"; id: number; ok: false; code: RelayCode; message: string };
export type ExtensionEvent = { t: "event"; tab: number; kind: EventKind; body: Record<string, unknown> };

export type EventKind = "card" | "coach-error";

/**
 * The dev loop's reload (§5.4). Not a command: it needs no tab, takes no arguments and is never answered, because the
 * extension it reaches is about to restart. The hub fans it out to every `flavour: "dev"` browser and to nothing else,
 * so it can never touch a store build — which is also why the guard bans the string from a store artifact (§5.5).
 */
export type DevReload = { t: "dev-reload" };

export type FromExtension = ExtensionHello | TabFrame | ConsentFrame | Ping | ExtensionReply | ExtensionEvent;
export type ToExtension = Welcome | ExtensionCmd | DevReload;

// -------------------------------------------------------------- client ↔ hub

export type ClientRole = "server" | "watch";

export type ClientHello = { t: "hello"; role: ClientRole; version: string; pid: number };
export type Retire = { t: "retire" };
export type Claim = { t: "claim" };
export type Claimed = { t: "claimed"; ok: true } | { t: "claimed"; ok: false; code: "contended" };
export type StateRequest = { t: "state" };

export type HubState = {
  t: "state";
  extensions: ExtensionInfo[];
  tabs: TabInfo[];
  driver: "you" | "other" | null;
};

/** A connected browser as the hub sees it. `commands` is its hello's list: what the server reads to pick a route (§10.1). */
export type ExtensionInfo = { conn: number; target: Target; version: string; flavour: Flavour; protocol: number; consent: boolean; commands: string[] };

export type TabInfo = { conn: number; tab: number; target: Target; title: string; state: TabState };

/** `name` is whatever the client sent: the hub refuses one outside `CommandName` with `unknown-command`. */
export type ClientCmd = { t: "cmd"; id: number; name: CommandName | (string & {}); args: Record<string, unknown> };
export type ClientReply = ReplyOk | { t: "reply"; id: number; ok: false; code: HubCode | RelayCode; message: string; tabs?: TabInfo[] };
export type Subscribe = { t: "subscribe" };
export type ClientEvent = { t: "event"; kind: EventKind; body: Record<string, unknown> };
export type Notice = { t: "notice"; kind: "tabs" | "resume"; tabs: TabInfo[] };

export type FromClient = ClientHello | Retire | Claim | StateRequest | ClientCmd | Subscribe | DevReload;
export type ToClient = Welcome | Claimed | HubState | ClientReply | ClientEvent | Notice;
