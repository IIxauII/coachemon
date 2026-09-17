/**
 * The tools riding on the hub link (§12.2, §12.3): every tool checks it can reach the game before it does anything,
 * acting tools take the grant before they settle, and `status` answers with the fleet and the first failing rung rather
 * than with an attachment.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Driver } from "../driver.ts";
import { Refusal } from "../envelope.ts";
import { fakeGame, type FakeScreen, type ScreenRead } from "../game/fake-game.ts";
import { UiMode } from "../enums/generated.ts";
import type { MenuRead } from "../game/port.ts";
import type { ExtensionInfo, TabInfo } from "../protocol/wire.ts";
import { PROTOCOL } from "../protocol/version.ts";
import type { Fleet, HubSide, Reach } from "./reach.ts";

const BROWSER: ExtensionInfo = { conn: 1, target: "chrome", version: "1.2.0", flavour: "store", protocol: PROTOCOL, consent: true, commands: ["probe", "menu", "snapshot", "press"] };
const TAB: TabInfo = { conn: 1, tab: 1, target: "chrome", title: "PokéRogue", state: "ready" };

/** A hub that answers whatever the test wants it to, and counts what the Driver asked it. */
function fakeHub(over: Partial<Fleet> & { claimed?: boolean } = {}) {
  const asked: (readonly string[])[] = [];
  let claims = 0;
  const hub: HubSide = {
    fleet: async (needed = []) => {
      asked.push(needed);
      return { browsers: [BROWSER], tabs: [TAB], driver: null, commands: new Set(BROWSER.commands), reach: null, skew: null, ...over };
    },
    claim: async () => {
      claims++;
      return over.claimed ?? true;
    },
  };
  return { hub, asked, claims: () => claims };
}

const COMMAND: ScreenRead = {
  ready: true, settled: true, reason: "menu-open", mode: UiMode.COMMAND, phaseName: "CommandPhase", wave: 4, turn: 1, money: 1000,
  runLive: true, tutorialActive: false, handler: "CommandUiHandler", cursor: 0, modeChain: [], messageText: null,
  onActionInput: false, awaitingActionInput: false, fine: "command|0", domMode: "COMMAND", gameVersion: "1.12.0.11", screen: "COMMAND",
};

const MENU: MenuRead = {
  readable: true, mode: UiMode.COMMAND, screen: "COMMAND", family: "command", cursor: 0, text: null, messagePending: false,
  options: [{ i: 0, label: "Fight" }], extra: { fieldIndex: 0, catchable: null },
};

function drive(hub: HubSide, screen: Partial<FakeScreen> = {}) {
  // The screen's fingerprint never moves, so every press reaches §6.4's one raw-keyboard retry; it answers, and stops.
  const fake = fakeGame({ read: () => COMMAND, menu: () => MENU, onPress: () => {}, onRawKey: () => true, hub, ...screen });
  return { ...fake, driver: new Driver(fake.game, fake.lock, fake.clock) };
}

/** What a tool refused with, as the MCP envelope would carry it. */
async function refusal(run: () => Promise<unknown>): Promise<Refusal> {
  try {
    await run();
  } catch (e) {
    assert.ok(e instanceof Refusal, String(e));
    return e;
  }
  throw new Error("expected a refusal");
}

// ------------------------------------------------------------------- §12.3 status

test("status over the hub reports the fleet and never launches a browser (§12.3)", async () => {
  const { hub } = fakeHub();
  const s = await drive(hub).driver.status();
  assert.equal(s.status, "ok");
  assert.equal(s.reachable, true);
  assert.equal(s.reach, null);
  assert.deepEqual(s.browsers, [{ target: "chrome", version: "1.2.0", flavour: "store", protocol: PROTOCOL, consent: true }]);
  assert.equal(s.tabs, 1);
  assert.equal(s.driver, null);
  assert.equal(s.wave, 4);
  assert.equal(s.screen, "COMMAND");
  assert.equal(s.run_live, true);
  assert.equal(s.game_version, "1.12.0.11");
  // The CDP payload's fields are gone: there is nothing to attach to and no pidfile to hold (§12.3).
  for (const gone of ["attached", "tab_contended", "lock_holder", "chrome_launched_by_server"]) assert.equal(gone in s, false, gone);
});

test("an unreachable game is what status is for: the failing rung's line, and no read attempted (§12.3)", async () => {
  const reach: Reach = { rung: 7, line: "Coachemon is connected, but no pokerogue.net tab is ready. Open or reload pokerogue.net." };
  const { hub } = fakeHub({ reach, tabs: [] });
  // `read` would throw `unexpected read`: status must not reach the game at all when it cannot.
  const s = await drive(hub, { read: undefined }).driver.status();
  assert.equal(s.reachable, false);
  assert.deepEqual(s.reach, reach);
  assert.equal(s.tabs, 0);
  assert.equal(s.screen, "UNKNOWN(-1)");
  assert.equal(s.run_live, false);
});

test("status shows a version skew as its own rung rather than pretending the game is reachable (§7.3)", async () => {
  const { hub } = fakeHub({ skew: "This Claude session's Coachemon plugin is older than the running hub. Restart this Claude session." });
  const s = await drive(hub, { read: undefined }).driver.status();
  assert.equal(s.reachable, false);
  assert.deepEqual(s.reach, { rung: 0, line: "This Claude session's Coachemon plugin is older than the running hub. Restart this Claude session." });
});

// --------------------------------------------------------- §12.2 reachability

test("every tool checks reachability first, and an unreachable game refuses before anything is read (§12.2)", async () => {
  const reach: Reach = { rung: 3, line: "No browser has Coachemon connected. Install Coachemon …" };
  const { hub } = fakeHub({ reach });
  const d = drive(hub, { read: undefined, menu: undefined }).driver;
  for (const call of [() => d.readMenu({}), () => d.getState("lean", {}), () => d.press("ACTION", {}), () => d.startRun(["Bulbasaur"], undefined, false, {})]) {
    const r = await refusal(call);
    assert.equal(r.code, "unreachable");
    assert.equal(r.message, reach.line);
    assert.deepEqual(r.detail, { rung: 3, line: reach.line });
  }
});

test("more than one tab is its own error, carrying the list, because the server never guesses which save (§1.6)", async () => {
  const second: TabInfo = { conn: 2, tab: 4, target: "firefox", title: "PokéRogue", state: "ready" };
  const reach: Reach = { rung: 8, line: "2 pokerogue.net tabs are open (Chrome: PokéRogue; Firefox: PokéRogue). Close all but one." };
  const { hub } = fakeHub({ reach, tabs: [TAB, second] });
  const r = await refusal(() => drive(hub, { read: undefined, menu: undefined }).driver.readMenu({}));
  assert.equal(r.code, "tabs");
  assert.deepEqual((r.detail as { tabs: TabInfo[] }).tabs, [TAB, second]);
});

test("a command the browser never listed refuses that tool alone, with the rung 4 wording (§8.5)", async () => {
  const reach: Reach = { rung: 4, line: "Coachemon 1.2.0 in Chrome is too old for this plugin. Update the extension.", missing: "snapshot" };
  const { hub } = fakeHub({ reach });
  const r = await refusal(() => drive(hub, { read: undefined, menu: undefined }).driver.getState("lean", {}));
  assert.equal(r.code, "missing_command");
  assert.equal(r.message, reach.line);
  assert.equal((r.detail as { command: string }).command, "snapshot");
});

test("each tool asks about the commands it actually sends, so a missing act never stops a read (§12.2)", async () => {
  const { hub, asked } = fakeHub();
  const d = drive(hub).driver;
  await d.readMenu({});
  await d.getState("lean", {});
  await d.press("ACTION", {});
  assert.deepEqual(asked, [["probe", "menu"], ["probe", "menu", "snapshot"], ["probe", "menu", "press"]]);
});

test("a plugin and hub skew refuses every tool call until one of them is restarted (§7.3)", async () => {
  const { hub } = fakeHub({ skew: "Another session is driving on an older Coachemon hub. Finish or close that session, then retry." });
  const r = await refusal(() => drive(hub, { read: undefined, menu: undefined }).driver.readMenu({}));
  assert.equal(r.code, "version_skew");
  assert.match(r.message, /Another session is driving on an older Coachemon hub/);
});

// ---------------------------------------------------------------- §7.5 grant

test("an acting call claims the grant at its start; a reading call never does (§7.5)", async () => {
  const { hub, claims } = fakeHub();
  const d = drive(hub).driver;
  await d.readMenu({});
  await d.getState("lean", {});
  assert.equal(claims(), 0);
  await d.press("ACTION", {});
  assert.equal(claims(), 1);
});

test("a refused claim refuses the call having pressed nothing (§7.5)", async () => {
  const { hub } = fakeHub({ claimed: false });
  const presses: number[] = [];
  const r = await refusal(() => drive(hub, { onPress: b => void presses.push(b) }).driver.press("ACTION", {}));
  assert.equal(r.code, "contended");
  assert.match(r.message, /Nothing was pressed\.$/);
  assert.deepEqual(presses, []);
});

test("over the hub nothing consults the pidfile lock or emulates focus: the grant and the pump replaced both (§13.2)", async () => {
  const { hub } = fakeHub();
  // `frame` returning a constant froze the loop on CDP; over the hub the guard never looks, because the settles pump.
  const d = drive(hub, { frame: () => 7 }).driver;
  const out = await d.press("ACTION", {});
  assert.equal(out.status, "ok");
});
