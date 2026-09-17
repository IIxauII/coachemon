/**
 * The MAIN-world half of the relay channel (§9, §10.5): it registers the page handlers, answers `coachemon:cmd` inside
 * the dispatch that delivered it, and announces itself so the relay can count the tab.
 *
 * Nothing here knows the game: `src/page/` holds the handlers, and `dispatch` runs the locator, the act fingerprint
 * check and the handler in one page turn. This file is only the channel and the instance bookkeeping.
 */
import { EVENT, encode, decode, type Channel, type Listener, type MakeEvent } from "../relay/channel.ts";
import { dispatch } from "../../../src/page/dispatch.ts";
import { disc } from "../../../src/page/disc.ts";
import { fine } from "../../../src/page/fine.ts";
import { locate } from "../../../src/page/locate.ts";
import { COMMAND_HANDLERS } from "../../../src/page/handlers.ts";
import { PAGE_MODES } from "../../../src/page/modes.ts";
import { STORE_COMMANDS } from "../../../src/protocol/commands.ts";

export type Handler = { kind: "read" | "act"; run: (L: any, args: any) => unknown };

/** What a page instance leaves on `window`, so the next copy can replace it in place (§9.6). */
export type PageInstance = { build: string; stop: () => void };

export type PageDeps = {
  /** `document`. */
  channel: Channel;
  /** `(type, detail) => new CustomEvent(type, { detail })`. */
  makeEvent: MakeEvent;
  build: string;
  /**
   * The world marker's visibility, read by the caller as `typeof __coachemonIsolated !== "undefined"`: if this script
   * can see the relay's own-world global, it ran isolated and must do nothing but say so (§9.4).
   */
  isolated: boolean;
  /**
   * `window`. Never `host`: CONTEXT.md reserves that word for Apple's host app, which is the browser.
   */
  global: { __coachemonPage?: PageInstance };
  /** Beyond the store table: the dev commands, in a dev build only (§10.6). */
  extra?: Record<string, Handler>;
};

/** The store table as handlers: exactly `STORE_COMMANDS`, one per command, and nothing else in a store build (§10.1). */
function storeHandlers(): Record<string, Handler> {
  const out: Record<string, Handler> = {};
  for (const [name, spec] of Object.entries(STORE_COMMANDS)) {
    out[name] = { kind: spec.kind, run: (COMMAND_HANDLERS as Record<string, Handler["run"]>)[name] };
  }
  return out;
}

export function startPage(d: PageDeps): PageInstance {
  const dispatchEvent = (type: string, detail: object): void => {
    d.channel.dispatchEvent(d.makeEvent(type, encode({ build: d.build, ...detail })));
  };

  if (d.isolated) {
    // No handlers, no HUD, no presence: the relay reports `wrong-world` and the tab is not counted (§9.4).
    dispatchEvent(EVENT.wrongWorld, { side: "page" });
    return { build: d.build, stop: () => {} };
  }

  // The newest copy always wins, including over a copy with no build id left by `read.sh` (§9.6).
  d.global.__coachemonPage?.stop();

  const table = { ...storeHandlers(), ...d.extra };
  const commands = Object.keys(table);
  let greeted = false;

  const onHello: Listener = e => {
    const hello = decode(e.detail);
    if (!hello || hello.side !== "relay" || hello.build !== d.build) return;
    if (greeted) return;
    greeted = true;
    dispatchEvent(EVENT.hello, { side: "page", commands });
  };

  const onCmd: Listener = e => {
    const cmd = decode(e.detail);
    if (!cmd || cmd.build !== d.build || typeof cmd.id !== "number" || typeof cmd.name !== "string") return;
    const handler = table[cmd.name];
    // A name we do not have gets no reply at all, so the relay answers `no-handler` — the one code for "nobody here".
    if (!handler) return;
    const args = (cmd.args && typeof cmd.args === "object" ? cmd.args : {}) as Record<string, unknown>;
    try {
      // The extension hands the generated mode enums in by importing them; the CDP link inlines them as JSON (#164).
      const result = dispatch(locate, fine, disc, handler.run, cmd.name, handler.kind, PAGE_MODES, args);
      dispatchEvent(EVENT.reply, { id: cmd.id, ok: true, result });
    } catch (e) {
      // Only the message crosses: a stack is page internals and the server treats `threw` as a failed read (§9.7).
      dispatchEvent(EVENT.reply, { id: cmd.id, ok: false, code: "threw", message: e instanceof Error ? e.message : String(e) });
    }
  };

  d.channel.addEventListener(EVENT.hello, onHello);
  d.channel.addEventListener(EVENT.cmd, onCmd);

  const instance: PageInstance = {
    build: d.build,
    stop: () => {
      d.channel.removeEventListener(EVENT.hello, onHello);
      d.channel.removeEventListener(EVENT.cmd, onCmd);
      if (d.global.__coachemonPage === instance) delete d.global.__coachemonPage;
    },
  };
  d.global.__coachemonPage = instance;

  // Both sides announce on load; whoever is second answers the other's hello (§9.3).
  dispatchEvent(EVENT.hello, { side: "page", commands });
  return instance;
}
