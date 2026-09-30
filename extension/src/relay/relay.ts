/**
 * The only place the upward direction is defended: a page event reaches the hub only if it is exactly what the HUD
 * sends (extension-distribution.md §9.5).
 */
import { KEEPALIVE_MS, TOO_LARGE, type CmdMessage, type RelayReply, type ToBackground } from "../messages.ts";
import type { TabState } from "../../../src/protocol/wire.ts";
import { EVENT, EVENT_BY_KIND, MAX_DETAIL_BYTES, decode, decodeAny, encode, eventBody, type Channel, type MakeEvent } from "./channel.ts";

export type RelayDeps = {
  channel: Channel;
  makeEvent: MakeEvent;
  build: string;
  /** Swallows failures: a background that is gone re-learns the tab from the next keepalive (extension-distribution.md §8.2). */
  send: (message: ToBackground) => void;
  title: () => string;
  onPageHide: (fn: () => void) => void;
  every: (fn: () => void, ms: number) => void;
};

export type Relay = {
  /** Synchronous (extension-distribution.md §9.2). */
  command: (msg: CmdMessage) => RelayReply;
  /** `null` until the page announces. */
  state: () => TabState | null;
};

const UTF8 = new TextEncoder();

/** `length` is a lower bound on UTF-8 bytes, so a string over the cap by `length` is over. */
function overCap(detail: string): boolean {
  return detail.length > MAX_DETAIL_BYTES || UTF8.encode(detail).length > MAX_DETAIL_BYTES;
}

export function startRelay(d: RelayDeps): Relay {
  /** At most one command in flight: `command` dispatches and reads the answer in one page turn (extension-distribution.md §9.2). */
  let pending: { id: number; reply: RelayReply | null } | null = null;
  let state: TabState | null = null;
  /** Answered once, so a hello storm between two loaded copies cannot bounce forever. */
  let greeted = false;

  const dispatch = (type: string, detail: unknown): void => {
    d.channel.dispatchEvent(d.makeEvent(type, encode({ build: d.build, ...(detail as object) })));
  };

  const report = (next: TabState): void => {
    state = next;
    d.send({ t: "tab", state: next, title: d.title() });
  };

  /** The relay pairs only with page scripts of its own build (extension-distribution.md §9.6). */
  const mine = (detail: unknown, read: (d: unknown) => Record<string, unknown> | null = decode): Record<string, unknown> | null => {
    const parsed = read(detail);
    return parsed && parsed.build === d.build ? parsed : null;
  };

  d.channel.addEventListener(EVENT.hello, e => {
    const hello = mine(e.detail);
    if (!hello || hello.side !== "page") return;
    if (!greeted) {
      greeted = true;
      dispatch(EVENT.hello, { side: "relay" });
    }
    // Presence waits on the page handlers alone, never on the HUD or on game boot (extension-distribution.md §9.3).
    if (state !== "ready") report("ready");
  });

  d.channel.addEventListener(EVENT.reply, e => {
    if (!pending || pending.reply) return;
    const raw = e.detail;
    // Ownership first, size second: otherwise any MAIN-world code could turn an in-flight command into `too-large` by
    // dispatching one oversized reply (extension-distribution.md §9.5).
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
      // An oversized event is dropped here, before anything upward carries it (extension-distribution.md §9.7).
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

  // What holds Firefox's event page, and how a restarted background re-learns this tab
  // (extension-distribution.md §8.2).
  d.every(() => d.send({ t: "keepalive", state, title: d.title() }), KEEPALIVE_MS);

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
      // No reply by the time dispatch returned means nobody is listening. No timer, ever
      // (extension-distribution.md §9.2).
      return answer ?? { t: "reply", id: msg.id, ok: false, code: "no-handler", message: `no page handler answered ${msg.name}` };
    },
    state: () => state,
  };
}
