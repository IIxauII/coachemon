/**
 * The MAIN-world half of the relay channel, which answers `coachemon:cmd` inside the dispatch that delivered it and
 * knows nothing of the game (extension-distribution.md §9.2, §10.5).
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

/** The panel's meter, which the HUD bundle puts on `window` (`hud/01-meter.js`). */
type Meter = { driver?: <T>(fn: () => T) => T };

/** What a page instance leaves on `window`, so the next copy can replace it in place (extension-distribution.md §9.6). */
export type PageInstance = { build: string; stop: () => void };

export type PageDeps = {
  channel: Channel;
  makeEvent: MakeEvent;
  build: string;
  isolated: boolean;
  /** `window`, never "host": CONTEXT.md reserves that word for Apple's host app, which is the browser. */
  global: { __coachemonPage?: PageInstance; __coachMeter?: Meter };
  extra?: Record<string, Handler>;
};

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
    // extension-distribution.md §9.4.
    dispatchEvent(EVENT.wrongWorld, { side: "page" });
    return { build: d.build, stop: () => {} };
  }

  // The newest copy always wins, including over a copy with no build id left by `read.sh`
  // (extension-distribution.md §9.6).
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
    // No reply at all, so the relay answers `no-handler`, the one code for "nobody here".
    if (!handler) return;
    const args = (cmd.args && typeof cmd.args === "object" ? cmd.args : {}) as Record<string, unknown>;
    const name = cmd.name;
    try {
      // The extension hands the generated mode enums in by importing them; the CDP link inlines them as JSON (#164).
      const run = () => dispatch(locate, fine, disc, handler.run, name, handler.kind, PAGE_MODES, args);
      // Read at each command: the panel's meter comes and goes with the HUD (#499).
      const meter = d.global.__coachMeter;
      const result = typeof meter?.driver === "function" ? meter.driver(run) : run();
      dispatchEvent(EVENT.reply, { id: cmd.id, ok: true, result });
    } catch (e) {
      // Only the message crosses (extension-distribution.md §9.7).
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

  // Both sides announce on load; whoever is second answers the other's hello (extension-distribution.md §9.3).
  dispatchEvent(EVENT.hello, { side: "page", commands });
  return instance;
}
