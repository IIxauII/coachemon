/**
 * The background transport (§8) on a fake clock and a fake socket: dialing only with a tab, the welcome check and its
 * 10 min back-off, the retry schedule, the ping keepalive, forwarding, and Firefox's consent gate.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { COMMAND_NAMES } from "../../src/protocol/commands.ts";
import { PRODUCT, PROTOCOL, STORE_PORT } from "../../src/protocol/version.ts";
import type { ExtensionHello, FromExtension } from "../../src/protocol/wire.ts";
import { MAX_DETAIL_BYTES } from "../src/relay/channel.ts";
import { PING_MS, RETRY_MS, RETRY_STEADY_MS, Transport, WELCOME_BACKOFF_MS, WELCOME_MS, type SocketHandlers, type TransportDeps } from "../src/transport/transport.ts";

/** A clock the test winds by hand; `after` is the only timer the transport is given. */
function clock() {
  let now = 0;
  let due: { at: number; fn: () => void; live: boolean }[] = [];
  const after = (ms: number, fn: () => void) => {
    const entry = { at: now + ms, fn, live: true };
    due.push(entry);
    return () => void (entry.live = false);
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = due.filter(e => e.live && e.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      now = next.at;
      next.live = false;
      due = due.filter(e => e.live);
      next.fn();
    }
    now = end;
  };
  return { after, advance };
}

type Wire = { sent: FromExtension[]; h: SocketHandlers; closed: boolean };

function harness(o: Partial<TransportDeps> = {}) {
  const c = clock();
  const dials: Wire[] = [];
  const toTab: { tab: number; message: unknown }[] = [];
  let answer: (tab: number) => Promise<unknown> = () => Promise.resolve({ t: "reply", id: 0, ok: true, result: null });
  const t = new Transport({
    url: `ws://127.0.0.1:${STORE_PORT}/`,
    target: "chrome",
    flavour: "store",
    version: "1.2.3",
    build: "1.2.3+abcdef012345",
    commands: [...COMMAND_NAMES],
    consent: true,
    dial: (_url, h) => {
      const wire: Wire = { sent: [], h, closed: false };
      dials.push(wire);
      return { send: data => void wire.sent.push(JSON.parse(data) as FromExtension), close: () => void (wire.closed = true) };
    },
    after: c.after,
    toTab: (tab, message) => {
      toTab.push({ tab, message });
      return answer(tab);
    },
    ...o,
  });
  /** Bring the one socket all the way up: dialed, opened, welcomed. */
  const connect = () => {
    const wire = dials.at(-1)!;
    wire.h.open();
    wire.h.message(JSON.stringify({ t: "welcome", product: PRODUCT, protocol: PROTOCOL, version: "1.2.3" }));
    return wire;
  };
  return { t, dials, toTab, connect, advance: c.advance, reply: (fn: (tab: number) => Promise<unknown>) => void (answer = fn) };
}

/** What a relay says when its tab is ready; the tab id is the argument to `fromTab`, not part of the frame. */
const ready = () => ({ t: "tab", state: "ready", title: "PokéRogue" }) as const;

test("no game tab, no loopback traffic (§8.1)", () => {
  const h = harness();
  h.t.start();
  h.advance(60_000);
  assert.equal(h.dials.length, 0);
});

test("a ready tab dials, and the hello is all that crosses before the welcome (§7.4, §8.1)", () => {
  const h = harness();
  h.t.fromTab(1, ready());
  assert.equal(h.dials.length, 1);
  const wire = h.dials[0];
  wire.h.open();
  assert.equal(wire.sent.length, 1);
  const hello = wire.sent[0] as ExtensionHello;
  assert.deepEqual(hello, {
    t: "hello",
    protocol: PROTOCOL,
    version: "1.2.3",
    target: "chrome",
    flavour: "store",
    build: "1.2.3+abcdef012345",
    consent: true,
    commands: [...COMMAND_NAMES],
  });
  wire.h.message(JSON.stringify({ t: "welcome", product: PRODUCT, protocol: PROTOCOL, version: "1.2.3" }));
  assert.deepEqual(wire.sent.slice(1), [{ t: "tab", tab: 1, state: "ready", title: "PokéRogue" }]);
});

test("the ping holds the service worker, every 20 s while connected (§8.2)", () => {
  const h = harness();
  h.t.fromTab(1, ready());
  const wire = h.connect();
  h.advance(PING_MS * 3);
  assert.equal(wire.sent.filter(f => f.t === "ping").length, 3);
});

test("silence on the port backs off 10 minutes, then dials again (§8.1)", () => {
  const h = harness();
  h.t.fromTab(1, ready());
  h.advance(WELCOME_MS);
  assert.equal(h.dials[0].closed, true);
  h.advance(WELCOME_BACKOFF_MS - 1);
  assert.equal(h.dials.length, 1);
  h.advance(1);
  assert.equal(h.dials.length, 2);
});

test("a wrong product on the port is the same 10 minutes (§8.1)", () => {
  const h = harness();
  h.t.fromTab(1, ready());
  h.dials[0].h.open();
  h.dials[0].h.message(JSON.stringify({ t: "welcome", product: "something-else", protocol: 1, version: "1" }));
  assert.equal(h.dials[0].closed, true);
  h.advance(WELCOME_BACKOFF_MS - 1);
  assert.equal(h.dials.length, 1);
  h.advance(1);
  assert.equal(h.dials.length, 2);
});

test("a dropped socket retries 1 s, 2 s, 5 s, then every 20 s (§8.1)", () => {
  const h = harness();
  h.t.fromTab(1, ready());
  for (const [i, ms] of [...RETRY_MS, RETRY_STEADY_MS, RETRY_STEADY_MS].entries()) {
    h.dials.at(-1)!.h.closed();
    h.advance(ms - 1);
    assert.equal(h.dials.length, i + 1, `no dial before ${ms} ms`);
    h.advance(1);
    assert.equal(h.dials.length, i + 2, `dialed after ${ms} ms`);
  }
});

test("a welcome resets the retry schedule (§8.1)", () => {
  const h = harness();
  h.t.fromTab(1, ready());
  h.connect().h.closed();
  h.advance(RETRY_MS[0]);
  h.connect().h.closed();
  h.advance(RETRY_MS[0]);
  assert.equal(h.dials.length, 3);
});

test("a command goes to its tab and the relay's reply goes back unchanged (§8.3)", async () => {
  const h = harness();
  h.reply(() => Promise.resolve({ t: "reply", id: 17, ok: true, result: { mode: 3 } }));
  h.t.fromTab(1, ready());
  const wire = h.connect();
  wire.h.message(JSON.stringify({ t: "cmd", id: 17, tab: 1, name: "press", args: { button: 0, fine: "x" } }));
  await Promise.resolve();
  assert.deepEqual(h.toTab, [{ tab: 1, message: { t: "cmd", id: 17, name: "press", args: { button: 0, fine: "x" } } }]);
  assert.deepEqual(wire.sent.at(-1), { t: "reply", id: 17, ok: true, result: { mode: 3 } });
});

test("a command the background answers itself never reaches the tab (§10.6)", async () => {
  const asked: string[] = [];
  const h = harness({
    local: cmd => {
      asked.push(cmd.name);
      return cmd.name === "screenshot" ? Promise.resolve({ t: "reply", id: cmd.id, ok: true, result: { png: "x" } }) : null;
    },
  });
  h.t.fromTab(1, ready());
  const wire = h.connect();
  wire.h.message(JSON.stringify({ t: "cmd", id: 9, tab: 1, name: "screenshot", args: {} }));
  await Promise.resolve();
  assert.deepEqual(h.toTab, [], "a background command was forwarded to the tab");
  assert.deepEqual(wire.sent.at(-1), { t: "reply", id: 9, ok: true, result: { png: "x" } });
  // A name it does not own still goes to the tab, so the seam costs the store table nothing.
  wire.h.message(JSON.stringify({ t: "cmd", id: 10, tab: 1, name: "probe", args: {} }));
  await Promise.resolve();
  assert.deepEqual(asked, ["screenshot", "probe"]);
  assert.equal(h.toTab.length, 1);
});

test("a frame only this build knows is handled by it and answered by nobody (§5.4)", () => {
  const seen: string[] = [];
  const h = harness({
    extra: frame => {
      seen.push(frame.t);
      return frame.t === "dev-reload";
    },
  });
  h.t.fromTab(1, ready());
  const wire = h.connect();
  const before = wire.sent.length;
  wire.h.message(JSON.stringify({ t: "dev-reload" }));
  assert.deepEqual(seen, ["dev-reload"]);
  assert.equal(wire.sent.length, before, "a dev-reload was answered");
  assert.deepEqual(h.toTab, [], "a dev-reload was forwarded to a tab");
  // A frame it does not claim still takes its usual route: the seam costs the store table nothing.
  wire.h.message(JSON.stringify({ t: "cmd", id: 3, tab: 1, name: "probe", args: {} }));
  assert.deepEqual(seen, ["dev-reload", "cmd"]);
});

test("a store build knows no such frame, and one it cannot have is dropped in silence", () => {
  const h = harness();
  h.t.fromTab(1, ready());
  const wire = h.connect();
  const before = wire.sent.length;
  wire.h.message(JSON.stringify({ t: "dev-reload" }));
  assert.deepEqual(h.toTab, []);
  assert.equal(wire.sent.length, before);
});

test("a tab that closed under us is `tab-gone`, the code only the background adds (§9.7)", async () => {
  for (const answer of [() => Promise.reject(new Error("no receiving end")), () => Promise.resolve(undefined)]) {
    const h = harness();
    h.reply(answer);
    h.t.fromTab(1, ready());
    const wire = h.connect();
    wire.h.message(JSON.stringify({ t: "cmd", id: 3, tab: 1, name: "probe", args: {} }));
    await new Promise(r => setImmediate(r));
    const reply = wire.sent.at(-1) as { t: string; ok: boolean; code: string };
    assert.equal(reply.t, "reply");
    assert.equal(reply.ok, false);
    assert.equal(reply.code, "tab-gone");
  }
});

test("a reply frame over 1 MB is refused rather than sent (§8.3)", async () => {
  const h = harness();
  h.reply(() => Promise.resolve({ t: "reply", id: 4, ok: true, result: "x".repeat(MAX_DETAIL_BYTES) }));
  h.t.fromTab(1, ready());
  const wire = h.connect();
  wire.h.message(JSON.stringify({ t: "cmd", id: 4, tab: 1, name: "snapshot", args: { detail: "full" } }));
  await new Promise(r => setImmediate(r));
  assert.deepEqual(wire.sent.at(-1), { t: "reply", id: 4, ok: false, code: "too-large", message: "reply over 1 MB" });
});

test("a HUD event carries the tab it came from (§8.3)", () => {
  const h = harness();
  h.t.fromTab(9, ready());
  const wire = h.connect();
  h.t.fromTab(9, { t: "event", kind: "card", body: { kind: "battle", wave: 3 } });
  assert.deepEqual(wire.sent.at(-1), { t: "event", tab: 9, kind: "card", body: { kind: "battle", wave: 3 } });
});

test("a gone tab is reported, and stops being one the hub counts (§9.3)", () => {
  const h = harness();
  h.t.fromTab(1, ready());
  const wire = h.connect();
  h.t.fromTab(1, { t: "tab", state: "gone", title: "PokéRogue" });
  assert.deepEqual(wire.sent.at(-1), { t: "tab", tab: 1, state: "gone", title: "PokéRogue" });
  assert.deepEqual(h.t.ready, []);
});

test("a restarted background re-learns its tabs from the keepalive and dials again (§8.2)", () => {
  const h = harness();
  h.t.start();
  assert.equal(h.dials.length, 0);
  h.t.fromTab(5, { t: "keepalive", state: "ready", title: "PokéRogue" });
  assert.equal(h.dials.length, 1);
  const wire = h.connect();
  assert.deepEqual(wire.sent.at(-1), { t: "tab", tab: 5, state: "ready", title: "PokéRogue" });
});

test("a keepalive from a tab with no state yet dials but announces nothing (§8.1)", () => {
  const h = harness();
  h.t.fromTab(1, ready());
  const wire = h.connect();
  const before = wire.sent.length;
  h.t.fromTab(2, { t: "keepalive", state: null, title: "PokéRogue" });
  assert.equal(wire.sent.length, before);
  assert.deepEqual(h.t.ready, [1]);
});

test("Firefox connects, says `consent: false`, and sends nothing else until the click (§8.4)", async () => {
  const h = harness({ target: "firefox", consent: false });
  h.reply(() => Promise.resolve({ t: "reply", id: 1, ok: true, result: "leaked" }));
  h.t.fromTab(1, ready());
  // It dials: that `consent: false` hello is the only thing that lets the status ladder name the click (§12.3).
  const wire = h.connect();
  assert.equal((wire.sent[0] as ExtensionHello).consent, false);
  h.t.fromTab(1, { t: "event", kind: "card", body: { kind: "battle", wave: 1 } });
  wire.h.message(JSON.stringify({ t: "cmd", id: 1, tab: 1, name: "probe", args: {} }));
  await new Promise(r => setImmediate(r));
  assert.deepEqual(wire.sent.map(f => f.t), ["hello"]);
  assert.deepEqual(h.t.ready, []);
});

test("the click sends `consent`, then every tab the hub was never told about (§8.4)", () => {
  const h = harness({ target: "firefox", consent: false });
  h.t.fromTab(1, ready());
  const wire = h.connect();
  h.t.fromTab(2, ready());
  h.t.grant();
  assert.deepEqual(wire.sent.slice(1), [
    { t: "consent", consent: true },
    { t: "tab", tab: 1, state: "ready", title: "PokéRogue" },
    { t: "tab", tab: 2, state: "ready", title: "PokéRogue" },
  ]);
  assert.deepEqual(h.t.ready, [1, 2]);
});

test("a wrong-world tab is reported and never counted (§9.4)", () => {
  const h = harness();
  h.t.fromTab(1, ready());
  const wire = h.connect();
  h.t.fromTab(1, { t: "tab", state: "wrong-world", title: "PokéRogue" });
  assert.deepEqual(wire.sent.at(-1), { t: "tab", tab: 1, state: "wrong-world", title: "PokéRogue" });
  assert.deepEqual(h.t.ready, []);
});
