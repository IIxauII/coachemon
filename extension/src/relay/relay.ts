/**
 * The relay (§9): the ISOLATED-world content script's whole behaviour, as one function over injected dependencies so
 * the tests drive it against a plain `EventTarget` (§9.2's synchrony is then the real thing, not a mock).
 *
 * It is the only part that talks to both the background and the page, and the only place the upward direction is
 * defended: a page-originated event becomes a hub event only if it is structurally exactly what the HUD sends (§9.5).
 */
import { KEEPALIVE_MS, TOO_LARGE, type CmdMessage, type RelayReply, type ToBackground } from "../messages.ts";
import type { TabState } from "../../../src/protocol/wire.ts";
import { EVENT, EVENT_BY_KIND, MAX_DETAIL_BYTES, decode, decodeAny, encode, eventBody, type Channel, type MakeEvent } from "./channel.ts";

export type RelayDeps = {
  /** `document` in the real thing. */
  channel: Channel;
  /** `(type, detail) => new CustomEvent(type, { detail })`. */
  makeEvent: MakeEvent;
  /** This build's id, which is also the world marker's value (§9.4). */
  build: string;
  /** `runtime.sendMessage`. Failures are swallowed: a background that is gone will re-learn on the next tick. */
  send: (message: ToBackground) => void;
  /** `() => document.title`, read fresh: the game rewrites it. */
  title: () => string;
  /** `(fn) => addEventListener("pagehide", fn)`. */
  onPageHide: (fn: () => void) => void;
  /** `setInterval`, injected so a test does not wait 20 s. */
  every: (fn: () => void, ms: number) => void;
};

export type Relay = {
  /** Answers one command from the background, synchronously (§9.2). */
  command: (msg: CmdMessage) => RelayReply;
  /** What the relay would report for its tab: `null` until the page announces, then `ready` or `wrong-world`. */
  state: () => TabState | null;
};

const UTF8 = new TextEncoder();

/** The size a detail may not exceed, in bytes; `length` is a lower bound on bytes, so an over-long string is over. */
function overCap(detail: string): boolean {
  return detail.length > MAX_DETAIL_BYTES || UTF8.encode(detail).length > MAX_DETAIL_BYTES;
}

export function startRelay(d: RelayDeps): Relay {
  /** At most one command is ever in flight: `command` dispatches and reads the answer in the same page turn (§9.2). */
  let pending: { id: number; reply: RelayReply | null } | null = null;
  let state: TabState | null = null;
  /** Answered once, so a hello storm between two loaded copies cannot bounce forever (§9.3). */
  let greeted = false;

  const dispatch = (type: string, detail: unknown): void => {
    d.channel.dispatchEvent(d.makeEvent(type, encode({ build: d.build, ...(detail as object) })));
  };

  const report = (next: TabState): void => {
    state = next;
    d.send({ t: "tab", state: next, title: d.title() });
  };

  /** A detail from the page counts only with our own build id: the relay pairs only with page scripts of its build (§9.6). */
  const mine = (detail: unknown, read: (d: unknown) => Record<string, unknown> | null = decode): Record<string, unknown> | null => {
    const parsed = read(detail);
    return parsed && parsed.build === d.build ? parsed : null;
  };

  d.channel.addEventListener(EVENT.hello, e => {
    const hello = mine(e.detail);
    if (!hello || hello.side !== "page") return;
    // Load order never matters: whoever is second answers, and the other side's hello arrives before it needs it.
    if (!greeted) {
      greeted = true;
      dispatch(EVENT.hello, { side: "relay" });
    }
    // Presence waits on the page handlers alone, never on the HUD or on game boot (§9.3).
    if (state !== "ready") report("ready");
  });

  d.channel.addEventListener(EVENT.reply, e => {
    if (!pending || pending.reply) return;
    const raw = e.detail;
    // Ownership first, size second: otherwise any MAIN-world code could turn an in-flight command into `too-large`
    // by dispatching one oversized reply, which is exactly what the structural defence is there to stop (§9.5).
    const reply = mine(raw, decodeAny);
    if (!reply || reply.id !== pending.id) return;
    if (typeof raw === "string" && overCap(raw)) {
      pending.reply = { t: "reply", id: pending.id, ok: false, code: "too-large", message: TOO_LARGE };
      return;
    }
    pending.reply = reply.ok === true
      ? { t: "reply", id: pending.id, ok: true, result: reply.result }
      : { t: "reply", id: pending.id, ok: false, code: "threw", message: typeof reply.message === "string" ? reply.message : "" };
  });

  for (const [kind, event] of EVENT_BY_KIND) {
    d.channel.addEventListener(event, e => {
      const raw = e.detail;
      // An oversized event is dropped here and nowhere else: nothing upward carries it (§9.7).
      if (typeof raw !== "string" || overCap(raw)) return;
      const detail = mine(raw);
      const body = detail && eventBody(kind, detail);
      if (body) d.send({ t: "event", kind, body });
    });
  }

  d.channel.addEventListener(EVENT.wrongWorld, e => {
    if (!mine(e.detail)) return;
    report("wrong-world");
  });

  d.onPageHide(() => report("gone"));

  // What holds Firefox's event page, and how a restarted background re-learns this tab (§8.2).
  d.every(() => d.send({ t: "keepalive", state, title: d.title() }), KEEPALIVE_MS);

  // Ours is the first hello when the relay wins the race; the page answers it (§9.3).
  dispatch(EVENT.hello, { side: "relay" });

  return {
    command: msg => {
      if (state === "wrong-world") {
        return { t: "reply", id: msg.id, ok: false, code: "wrong-world", message: "the page scripts ran isolated" };
      }
      pending = { id: msg.id, reply: null };
      let answer: RelayReply | null = null;
      try {
        dispatch(EVENT.cmd, { id: msg.id, name: msg.name, args: msg.args });
        answer = pending.reply;
      } finally {
        pending = null;
      }
      // No reply by the time dispatch returned: nobody is listening in the page. No timer, ever (§9.2).
      return answer ?? { t: "reply", id: msg.id, ok: false, code: "no-handler", message: `no page handler answered ${msg.name}` };
    },
    state: () => state,
  };
}
