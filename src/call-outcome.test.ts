import assert from "node:assert/strict";
import { test } from "node:test";
import { CallOutcomes, worst } from "./call-outcome.ts";
import { UiMode } from "./enums/generated.ts";
import type { PredicateRead, Ready } from "./game/port.ts";
import { CALL_BUDGET_MS, POLL_MS, type SettleResult } from "./settle.ts";
import { THRESHOLD, type Choice } from "./stuck/detector.ts";
import { HANG_CORROBORATED_MS, HANG_DWELL_MS } from "./stuck/hang.ts";

const disc = { partyUiMode: null, optionsMode: false, saveSlotUiMode: null, summaryUiMode: null, alertClosable: false, filterMode: false, transferMode: false };

function read(over: Partial<Ready> = {}): Ready {
  return {
    ready: true, settled: true, reason: "menu-open", mode: UiMode.COMMAND, phaseName: "CommandPhase", wave: 5, turn: 1, money: 1000,
    runLive: true, tutorialActive: false, handler: null, cursor: 0, modeChain: [], messageText: null, onActionInput: false,
    awaitingActionInput: false, fine: "command|0", frame: 1, domMode: null, gameVersion: "1.12.0.11", disc, ...over,
  };
}

function settled(last: Ready, over: Partial<SettleResult> = {}): SettleResult {
  return { settled: true, last, reason: last.reason, elapsedMs: 300, stallMs: 300, polls: 3, fpMoved: null, loopFrozen: false, aborted: false, ...over };
}

function timedOut(last: PredicateRead | null, over: Partial<SettleResult> = {}): SettleResult {
  return { settled: false, last, reason: "ui-transition", elapsedMs: CALL_BUDGET_MS, stallMs: CALL_BUDGET_MS, polls: 300, fpMoved: null, loopFrozen: false, aborted: false, ...over };
}

const title = read({ mode: UiMode.TITLE, phaseName: "TitlePhase", runLive: false, wave: null, turn: null, fine: "title" });
const menu = read({ mode: UiMode.MENU, phaseName: "CommandPhase", fine: "menu" });
const login = read({ settled: false, reason: "ui-transition", mode: UiMode.LOADING, phaseName: "LoginPhase", runLive: false, wave: null, turn: null, fine: "login" });
/** #11's save hang: `EncounterPhase` on `MESSAGE` with no `onActionInput`, which the predicate reads as busy. */
const hung = read({ settled: false, reason: "encounter", mode: UiMode.MESSAGE, phaseName: "EncounterPhase", onActionInput: false, fine: "encounter" });
/** A screen with no ladder entry, so a repeat there is `stuck` and never `ladder-exhausted`. */
const unmodelled = read({ mode: 999, phaseName: "UnmodelledPhase", runLive: false, fine: "unmodelled" });
const fight: Choice = { kind: "option", label: "Fight" };

/** A reading call that settles on `r`. */
function readCall(o: CallOutcomes, r: Ready) {
  const s = settled(r);
  o.waited(s);
  return o.end({ kind: "read", settle: s, options: null });
}

/** A live run, then a `LoginPhase` with no menu action in flight: the save failed (#11). */
function interrupt(o: CallOutcomes) {
  o.poll(read(), 0);
  o.poll(login, 100);
}

/** A live run, then `GameOverPhase`. */
function wipe(o: CallOutcomes) {
  o.poll(read(), 0);
  o.poll(read({ phaseName: "GameOverPhase", settled: false }), 100);
}

function holdHang(o: CallOutcomes, ms: number) {
  for (let t = 0; t <= ms; t += POLL_MS) o.poll(hung, t);
}

/** Acting calls on `r` that leave it where it was, until one more settled read of it is stuck. */
function repeat(o: CallOutcomes, r: Ready) {
  for (let i = 0; i < THRESHOLD - 1; i++) {
    o.waited(settled(r));
    o.pressing({ menuAction: false, on: r });
    o.end({ kind: "acting", pre: r, choice: fight, settle: settled(r), options: null });
  }
}

test("worst ranks run_interrupted over run_over over stuck over timed_out over ok", () => {
  assert.equal(worst(), "ok");
  assert.equal(worst("timed_out", "ok"), "timed_out");
  assert.equal(worst("timed_out", "stuck"), "stuck");
  assert.equal(worst("stuck", "run_over", "timed_out"), "run_over");
  assert.equal(worst("run_over", "run_interrupted", "stuck"), "run_interrupted");
});

test("a settled read with nothing latched is ok, without a diagnostic", () => {
  const o = new CallOutcomes();
  assert.deepEqual(readCall(o, read()), { status: "ok" });
});

test("a read that does not settle is timed_out, carrying the busy reason", () => {
  const o = new CallOutcomes();
  const s = timedOut(read({ settled: false, reason: "ui-transition" }));
  o.waited(s);
  const r = o.end({ kind: "read", settle: s, options: null });
  assert.equal(r.status, "timed_out");
  assert.equal(r.diagnostic?.reason, "ui-transition");
});

test("the save-hang signature held for the dwell, then a timed-out end, is run_interrupted / save-hang (#126)", () => {
  const o = new CallOutcomes();
  holdHang(o, HANG_DWELL_MS);
  const s = timedOut(hung);
  o.waited(s);
  const r = o.end({ kind: "read", settle: s, options: null });
  assert.equal(r.status, "run_interrupted");
  assert.equal(r.diagnostic?.reason, "save-hang");
  assert.equal(r.diagnostic?.cause, "save_hang");
  assert.deepEqual(r.diagnostic?.hang, { heldMs: HANG_DWELL_MS, corroborated: false });
});

test("an unhandled rejection shortens the save-hang dwell for a timed-out end", () => {
  const o = new CallOutcomes();
  o.rejection(-1);
  holdHang(o, HANG_CORROBORATED_MS);
  const s = timedOut(hung, { elapsedMs: HANG_CORROBORATED_MS });
  o.waited(s);
  const r = o.end({ kind: "read", settle: s, options: null });
  assert.equal(r.status, "run_interrupted");
  assert.deepEqual(r.diagnostic?.hang, { heldMs: HANG_CORROBORATED_MS, corroborated: true });
});

test("LoginPhase after a live run with no menu action in flight is interrupted", () => {
  const o = new CallOutcomes();
  interrupt(o);
  const r = readCall(o, title);
  assert.equal(r.status, "run_interrupted");
  assert.equal(r.diagnostic?.reason, "login-phase-mid-session");
  assert.equal(o.runState(title), "interrupted");
});

test("LoginPhase reached by the call's own menu action is not interrupted (Save & Quit)", () => {
  const o = new CallOutcomes();
  o.poll(read(), 0);
  o.waited(settled(menu));
  o.pressing({ menuAction: true, on: menu });
  o.poll(login, 100);
  o.poll(title, 200);
  const r = o.end({ kind: "acting", pre: menu, choice: { kind: "option", label: "Save and Quit" }, settle: settled(title), options: null });
  assert.equal(r.status, "ok");
  assert.equal(o.runState(title), "none");
});

test("a timed-out end reports the interrupted latch", () => {
  const o = new CallOutcomes();
  interrupt(o);
  const s = timedOut(login);
  o.waited(s);
  const r = o.end({ kind: "read", settle: s, options: null });
  assert.equal(r.status, "run_interrupted");
  assert.equal(r.diagnostic?.reason, "login-phase-mid-session");
});

test("a refused end after pressing clears the menu action in flight, so a later LoginPhase latches", () => {
  const o = new CallOutcomes();
  o.poll(read(), 0);
  o.waited(settled(menu));
  o.pressing({ menuAction: true, on: menu });
  o.end({ kind: "refused", pre: menu, choice: { kind: "option", label: "Save and Quit" }, settle: null });

  o.poll(login, 100);
  const r = readCall(o, title);
  assert.equal(r.status, "run_interrupted");
});

test("a refused end after pressing records its choice: pending, then completed by the next settled read", () => {
  const o = new CallOutcomes();
  for (let i = 0; i < THRESHOLD - 1; i++) {
    const s = settled(unmodelled);
    o.waited(s);
    o.pressing({ menuAction: false, on: unmodelled });
    const r = o.end({ kind: "refused", pre: unmodelled, choice: fight, settle: s });
    assert.equal(r.status, "ok", `refusal ${i + 1}`);
  }
  const r = readCall(o, unmodelled);
  assert.equal(r.status, "stuck");
  assert.deepEqual(r.escape?.tried, [fight]);
});

test("a refused end that never pressed records no decision", () => {
  const o = new CallOutcomes();
  for (let i = 0; i < THRESHOLD - 1; i++) {
    const s = settled(unmodelled);
    o.waited(s);
    o.end({ kind: "refused", pre: null, choice: null, settle: s });
  }
  assert.equal(readCall(o, unmodelled).status, "ok");
});

test("GameOverPhase latched, then a timed-out end, is run_over", () => {
  const o = new CallOutcomes();
  wipe(o);
  const s = timedOut(read({ settled: false, phaseName: "GameOverPhase", runLive: false }));
  o.waited(s);
  const r = o.end({ kind: "read", settle: s, options: null });
  assert.equal(r.status, "run_over");
  assert.equal(r.diagnostic?.reason, "game-over-phase");
  assert.equal(o.runState(title), "over");
});

test("stall counts measure the current wait and reset once a read settles", () => {
  const o = new CallOutcomes();
  const stalled = read({ settled: false, reason: "ui-transition" });
  const counts = () => {
    const s = timedOut(stalled);
    o.waited(s);
    const d = o.end({ kind: "read", settle: s, options: null }).diagnostic;
    return [d?.resume_count, d?.cumulative_stall_ms];
  };
  assert.deepEqual(counts(), [0, 0]);
  assert.deepEqual(counts(), [1, CALL_BUDGET_MS]);
  readCall(o, read());
  assert.deepEqual(counts(), [0, 0]);
});

test("an acting call that settled before pressing starts a new wait when it times out", () => {
  const o = new CallOutcomes();
  const stalled = read({ settled: false, reason: "ui-transition" });
  let s = timedOut(stalled);
  o.waited(s);
  o.end({ kind: "read", settle: s, options: null });

  o.waited(settled(read()));
  o.pressing({ menuAction: false, on: read() });
  s = timedOut(stalled);
  const d = o.end({ kind: "acting", pre: read(), choice: fight, settle: s, options: null }).diagnostic;
  assert.deepEqual([d?.resume_count, d?.cumulative_stall_ms], [0, 0]);
});

test("repeats on a screen are stuck, with the escape attached", () => {
  const o = new CallOutcomes();
  repeat(o, unmodelled);
  const r = readCall(o, unmodelled);
  assert.equal(r.status, "stuck");
  assert.equal(r.diagnostic?.reason, "stuck:dead_end");
  assert.equal(r.escape?.verdict, "dead_end");
});

test("stuck is judged only on a settled end", () => {
  const o = new CallOutcomes();
  repeat(o, unmodelled);
  const s = timedOut({ ...unmodelled, settled: false });
  o.waited(s);
  const r = o.end({ kind: "read", settle: s, options: null });
  assert.equal(r.status, "timed_out");
  assert.equal(r.escape, undefined);
});

test("precedence: run_over beats stuck", () => {
  const o = new CallOutcomes();
  wipe(o);
  repeat(o, unmodelled);
  const r = readCall(o, unmodelled);
  assert.equal(r.status, "run_over");
  assert.equal(r.escape, undefined);
});

test("precedence: the interrupted latch beats stuck", () => {
  const o = new CallOutcomes();
  repeat(o, unmodelled);
  interrupt(o);
  const r = readCall(o, unmodelled);
  assert.equal(r.status, "run_interrupted");
  assert.equal(r.diagnostic?.reason, "login-phase-mid-session");
});

test("precedence: save-hang beats the interrupted latch and stuck", () => {
  const o = new CallOutcomes();
  repeat(o, unmodelled);
  interrupt(o);
  holdHang(o, HANG_DWELL_MS);
  const r = readCall(o, unmodelled);
  assert.equal(r.status, "run_interrupted");
  assert.equal(r.diagnostic?.reason, "save-hang");
});

test("pressing on TITLE clears the interrupted latch; a call refused on TITLE does not", () => {
  const o = new CallOutcomes();
  interrupt(o);
  const s = settled(title);
  o.waited(s);
  o.end({ kind: "refused", pre: null, choice: null, settle: s });
  assert.equal(o.runState(title), "interrupted");
  assert.equal(readCall(o, title).status, "run_interrupted");

  o.waited(settled(title));
  o.pressing({ menuAction: false, on: title });
  const after = read({ mode: UiMode.OPTION_SELECT, phaseName: "TitlePhase", runLive: false, wave: null, fine: "mode" });
  const r = o.end({ kind: "acting", pre: title, choice: { kind: "option", label: "Continue" }, settle: settled(after), options: null });
  assert.equal(r.status, "ok");
  assert.equal(o.runState(after), "none");
});

test("a press on TITLE that leaves the game on TITLE keeps the interrupted latch", () => {
  const o = new CallOutcomes();
  interrupt(o);
  o.waited(settled(title));
  o.pressing({ menuAction: false, on: title });
  const moved = read({ ...title, cursor: 1, fine: "title|1" });
  const r = o.end({ kind: "acting", pre: title, choice: { kind: "button", button: "DOWN" }, settle: settled(moved), options: null });
  assert.equal(r.status, "run_interrupted");

  const s = settled(title);
  o.waited(s);
  o.pressing({ menuAction: false, on: title });
  o.end({ kind: "refused", pre: title, choice: { kind: "option", label: "Continue" }, settle: s });
  assert.equal(o.runState(title), "interrupted", "refused after pressing, with no read off TITLE");
});

test("newRun forgets the latch and the stuck history", () => {
  const o = new CallOutcomes();
  wipe(o);
  repeat(o, unmodelled);
  o.newRun();
  assert.equal(readCall(o, unmodelled).status, "ok");
});
