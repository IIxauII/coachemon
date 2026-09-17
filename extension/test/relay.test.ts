/**
 * The relay contract (§9), driven end to end: the relay and the page script on one `EventTarget`, which is a faithful
 * stand-in for `document` in the one way that matters — `dispatchEvent` runs listeners synchronously, so a test that
 * passes here is a test of §9.2's "reply before dispatch returns" and not of a mock.
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { onPage } from "../../src/page/fake-page.ts";
import type { ToBackground } from "../src/messages.ts";
import { EVENT, MAX_DETAIL_BYTES, cardBody, encode } from "../src/relay/channel.ts";
import { startRelay, type Relay } from "../src/relay/relay.ts";
import { startPage, type Handler } from "../src/page/register.ts";
import type { Channel } from "../src/relay/channel.ts";

const BUILD = "1.2.3+abcdef012345";
const makeEvent = (type: string, detail: string) => new CustomEvent(type, { detail });

/** One tab: a shared channel, the messages the relay sent upward, and the timers it asked for. */
function tab(o: { build?: string } = {}) {
  const channel = new EventTarget() as unknown as Channel;
  const sent: ToBackground[] = [];
  const ticks: (() => void)[] = [];
  const pagehide: (() => void)[] = [];
  const relay = (build = o.build ?? BUILD): Relay =>
    startRelay({
      channel,
      makeEvent,
      build,
      send: m => void sent.push(m),
      title: () => "PokéRogue",
      onPageHide: fn => void pagehide.push(fn),
      every: fn => void ticks.push(fn),
    });
  const page = (p: { build?: string; isolated?: boolean; extra?: Record<string, Handler> } = {}) =>
    startPage({
      channel,
      makeEvent,
      build: p.build ?? BUILD,
      isolated: p.isolated ?? false,
      host: {},
      extra: p.extra,
    });
  const emit = (type: string, detail: unknown) => channel.dispatchEvent(makeEvent(type, encode(detail)));
  return { channel, sent, ticks, pagehide, relay, page, emit };
}

const tabFrames = (sent: ToBackground[]) => sent.filter(m => m.t === "tab");

test("the double announce makes a tab ready in either load order (§9.3)", () => {
  for (const order of ["relay first", "page first"] as const) {
    const t = tab();
    if (order === "relay first") {
      const r = t.relay();
      t.page();
      assert.equal(r.state(), "ready");
    } else {
      t.page();
      const r = t.relay();
      assert.equal(r.state(), "ready");
    }
    assert.deepEqual(tabFrames(t.sent), [{ t: "tab", state: "ready", title: "PokéRogue" }]);
  }
});

test("a page script of another build never makes the tab ready (§9.6)", () => {
  const t = tab();
  const r = t.relay("1.2.3+aaaaaaaaaaaa");
  t.page({ build: "1.2.4+bbbbbbbbbbbb" });
  assert.equal(r.state(), null);
  assert.deepEqual(tabFrames(t.sent), []);
});

test("a command is answered inside the dispatch that delivered it (§9.2)", (c: TestContext) => {
  onPage(c, { ui: { mode: 0, handlers: {} } });
  const t = tab();
  const r = t.relay();
  t.page();
  const reply = r.command({ t: "cmd", id: 7, name: "menu", args: {} });
  assert.equal(reply.t, "reply");
  assert.equal(reply.id, 7);
  assert.equal(reply.ok, true);
});

test("off the game every command still answers, with the locator's reason (§10.1)", () => {
  const t = tab();
  const r = t.relay();
  t.page();
  assert.deepEqual(r.command({ t: "cmd", id: 1, name: "menu", args: {} }), {
    t: "reply",
    id: 1,
    ok: true,
    result: { ok: false, why: "no-phaser" },
  });
  const probe = r.command({ t: "cmd", id: 2, name: "probe", args: {} }) as { result: { ready: boolean } };
  assert.equal(probe.result.ready, false);
});

test("no page script, or a name it does not hold, is `no-handler` with no timer (§9.2)", () => {
  const t = tab();
  const lonely = t.relay();
  assert.deepEqual(lonely.command({ t: "cmd", id: 3, name: "probe", args: {} }), {
    t: "reply",
    id: 3,
    ok: false,
    code: "no-handler",
    message: "no page handler answered probe",
  });
  t.page();
  const unknown = lonely.command({ t: "cmd", id: 4, name: "eval", args: {} });
  assert.equal(unknown.ok, false);
  assert.equal((unknown as { code: string }).code, "no-handler");
});

test("a handler that throws crosses as `threw`, its message only (§9.7)", (c: TestContext) => {
  onPage(c, { ui: { mode: 0, handlers: {} } });
  const t = tab();
  const r = t.relay();
  t.page({ extra: { boom: { kind: "read", run: () => { throw new Error("phaser is unhappy"); } } } });
  assert.deepEqual(r.command({ t: "cmd", id: 5, name: "boom", args: {} }), {
    t: "reply",
    id: 5,
    ok: false,
    code: "threw",
    message: "phaser is unhappy",
  });
});

test("a reply over 1 MB is dropped at the relay as `too-large` (§9.7)", (c: TestContext) => {
  onPage(c, { ui: { mode: 0, handlers: {} } });
  const t = tab();
  const r = t.relay();
  t.page({ extra: { fat: { kind: "read", run: () => "x".repeat(MAX_DETAIL_BYTES + 1) } } });
  const reply = r.command({ t: "cmd", id: 6, name: "fat", args: {} });
  assert.equal(reply.ok, false);
  assert.equal((reply as { code: string }).code, "too-large");
});

test("page scripts that ran isolated report `wrong-world` and register nothing (§9.4)", () => {
  const t = tab();
  const r = t.relay();
  t.page({ isolated: true });
  assert.equal(r.state(), "wrong-world");
  assert.deepEqual(tabFrames(t.sent), [{ t: "tab", state: "wrong-world", title: "PokéRogue" }]);
  assert.deepEqual(r.command({ t: "cmd", id: 8, name: "probe", args: {} }), {
    t: "reply",
    id: 8,
    ok: false,
    code: "wrong-world",
    message: "the page scripts ran isolated",
  });
});

test("the newest page script replaces the running one in place (§9.6)", (c: TestContext) => {
  onPage(c, { ui: { mode: 0, handlers: {} } });
  const channel = new EventTarget() as unknown as Channel;
  const host: { __coachemonPage?: { build: string; stop: () => void } } = {};
  const start = (build: string) => startPage({ channel, makeEvent, build, isolated: false, host });
  const first = start(BUILD);
  const second = start("9.9.9+ffffffffffff");
  assert.equal(host.__coachemonPage, second);
  assert.equal(host.__coachemonPage?.build, "9.9.9+ffffffffffff");
  // The replaced copy answers nothing: a relay of the old build finds no handler at all.
  const t = tab();
  first.stop();
  const orphan = startRelay({
    channel,
    makeEvent,
    build: BUILD,
    send: () => {},
    title: () => "PokéRogue",
    onPageHide: () => {},
    every: () => {},
  });
  assert.equal(orphan.command({ t: "cmd", id: 9, name: "probe", args: {} }).ok, false);
  assert.equal(t.sent.length, 0);
  second.stop();
});

test("a card event crosses only with exactly the declared keys and types (§9.5)", () => {
  const t = tab();
  t.relay();
  t.page();
  const card = { build: BUILD, kind: "battle", key: "w12", wave: 12, verdict: "danger", text: "switch" };
  t.emit(EVENT.card, card);
  t.emit(EVENT.card, { ...card, extra: 1 });
  t.emit(EVENT.card, { ...card, wave: "12" });
  t.emit(EVENT.card, { ...card, kind: "shop" });
  t.emit(EVENT.card, { ...card, build: "9.9.9+ffffffffffff" });
  t.emit(EVENT.coachError, { build: BUILD, message: "the HUD fell over" });
  t.emit(EVENT.coachError, { build: BUILD, message: 7 });
  assert.deepEqual(t.sent.filter(m => m.t === "event"), [
    { t: "event", kind: "card", body: { kind: "battle", key: "w12", wave: 12, verdict: "danger", text: "switch" } },
    { t: "event", kind: "coach-error", body: { message: "the HUD fell over" } },
  ]);
});

test("an event over 1 MB is dropped, not truncated (§9.7)", () => {
  const t = tab();
  t.relay();
  t.page();
  t.emit(EVENT.card, { build: BUILD, kind: "battle", key: "w1", wave: 1, verdict: "easy", text: "x".repeat(MAX_DETAIL_BYTES) });
  assert.deepEqual(t.sent.filter(m => m.t === "event"), []);
});

test("the relay never turns a page event into a command (§9.5)", () => {
  const t = tab();
  const r = t.relay();
  t.page();
  // A forged reply for an id nothing is waiting on, and a forged relay hello: both dropped, and nothing goes upward.
  t.emit(EVENT.reply, { build: BUILD, id: 999, ok: true, result: "forged" });
  t.emit(EVENT.hello, { build: BUILD, side: "relay" });
  const before = t.sent.length;
  t.emit(EVENT.cmd, { build: BUILD, id: 1000, name: "press", args: { button: 0, fine: "x" } });
  assert.equal(t.sent.length, before);
  assert.equal(r.state(), "ready");
});

test("the 20 s tick carries the tab's state, which is how a restarted background re-learns it (§8.2)", () => {
  const t = tab();
  t.relay();
  t.page();
  assert.equal(t.ticks.length, 1);
  t.ticks[0]();
  assert.deepEqual(t.sent.at(-1), { t: "keepalive", state: "ready", title: "PokéRogue" });
});

test("`pagehide` takes the tab out of the count (§9.3)", () => {
  const t = tab();
  t.relay();
  t.page();
  assert.equal(t.pagehide.length, 1);
  t.pagehide[0]();
  assert.deepEqual(tabFrames(t.sent).at(-1), { t: "tab", state: "gone", title: "PokéRogue" });
});

test("`cardBody` rejects every shape but the one the HUD sends (§9.5)", () => {
  const good = { build: BUILD, kind: "learn", key: "w14-x", wave: 14, verdict: "your call", text: "keep" };
  assert.deepEqual(cardBody(good), { kind: "learn", key: "w14-x", wave: 14, verdict: "your call", text: "keep" });
  for (const bad of [
    { ...good, wave: Number.NaN },
    { ...good, key: undefined },
    { build: BUILD, kind: "learn", key: "k", wave: 1, verdict: "v" },
  ]) {
    assert.equal(cardBody(bad as Record<string, unknown>), null, JSON.stringify(bad));
  }
});
