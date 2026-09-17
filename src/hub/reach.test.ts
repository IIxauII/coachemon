/**
 * Every rung of the ladder (§12.3). The wording is the contract: `status` returns it, the watch CLI prints it, and
 * every other tool refuses with it, so one line has to carry the whole fix.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PROTOCOL } from "../protocol/version.ts";
import type { ExtensionInfo, HubState, TabInfo } from "../protocol/wire.ts";
import { foreignPort, hubWontStart, ladder, offeredCommands, readyTabs } from "./reach.ts";

const COMMANDS = ["probe", "menu", "snapshot", "press"];

function browser(over: Partial<ExtensionInfo> = {}): ExtensionInfo {
  return { conn: 1, target: "chrome", version: "1.2.0", flavour: "store", protocol: PROTOCOL, consent: true, commands: COMMANDS, ...over };
}

function tab(over: Partial<TabInfo> = {}): TabInfo {
  return { conn: 1, tab: 1, target: "chrome", title: "PokéRogue", state: "ready", ...over };
}

function state(extensions: ExtensionInfo[], tabs: TabInfo[]): HubState {
  return { t: "state", extensions, tabs, driver: null };
}

test("rung 1: something else holds the port, and the line says to quit it", () => {
  const r = foreignPort(47147);
  assert.equal(r.rung, 1);
  assert.match(r.line, /^Port 47147 is held by .+, not the Coachemon hub\. Quit it, then retry\.$/);
});

test("rung 2: the hub would not start, and the line carries what it said", () => {
  assert.deepEqual(hubWontStart("EACCES: permission denied"), { rung: 2, line: "The Coachemon hub would not start: EACCES: permission denied." });
  assert.match(hubWontStart("").line, /would not start: it exited without saying why\.$/);
});

test("rung 3: the hub is up but no browser is connected, and the line says where to get one", () => {
  const r = ladder(state([], []));
  assert.equal(r?.rung, 3);
  assert.match(r!.line, /^No browser has Coachemon connected\. Install Coachemon \(Chrome Web Store or Firefox Add-ons; Orion installs either; Safari: /);
  assert.match(r!.line, /and open pokerogue\.net\.$/);
});

test("rung 4: a browser below the protocol window is too old, one above it means the plugin is", () => {
  const old = ladder(state([browser({ protocol: PROTOCOL - 2 })], [tab()]));
  assert.deepEqual(old, { rung: 4, line: "Coachemon 1.2.0 in Chrome is too old for this plugin. Update the extension." });
  const newer = ladder(state([browser({ protocol: PROTOCOL + 1, target: "firefox" })], [tab({ target: "firefox" })]));
  assert.deepEqual(newer, { rung: 4, line: "Coachemon 1.2.0 in Firefox is newer than this plugin. Update the plugin: claude plugin update coachemon." });
});

test("rung 4 also covers a command this call needs that the browser never listed (§8.5)", () => {
  const r = ladder(state([browser({ commands: ["probe", "menu"] })], [tab()]), ["probe", "menu", "snapshot"]);
  assert.equal(r?.rung, 4);
  assert.equal(r?.missing, "snapshot");
  assert.match(r!.line, /is too old for this plugin\. Update the extension\.$/);
  // A tool needing only what the browser offers is unaffected: one tool refuses, not every tool.
  assert.equal(ladder(state([browser({ commands: ["probe", "menu"] })], [tab()]), ["probe", "menu"]), null);
});

test("rung 5: Firefox connected without consent names the click that fixes it (§8.4)", () => {
  const r = ladder(state([browser({ target: "firefox", consent: false })], [tab({ target: "firefox" })]));
  assert.deepEqual(r, { rung: 5, line: "Coachemon in Firefox is waiting for your OK: click the Coachemon icon in the toolbar once." });
  // Chrome and Safari have no consent step, so the same flag off them is not this rung.
  assert.notEqual(ladder(state([browser({ consent: false })], [tab()]))?.rung, 5);
});

test("rung 6: a tab whose page scripts ran isolated means the browser is too old (§9.7)", () => {
  const r = ladder(state([browser({ target: "safari" })], [tab({ target: "safari", state: "wrong-world" })]));
  assert.deepEqual(r, { rung: 6, line: "Coachemon can't reach the game in Safari. Update Safari." });
});

test("rung 7: connected, but nothing is ready to play", () => {
  const r = ladder(state([browser()], []));
  assert.deepEqual(r, { rung: 7, line: "Coachemon is connected, but no pokerogue.net tab is ready. Open or reload pokerogue.net." });
});

test("rung 8: more than one tab names each of them, because the server never guesses which save (§1.6)", () => {
  const r = ladder(state(
    [browser(), browser({ conn: 2, target: "firefox" })],
    [tab(), tab({ conn: 2, tab: 4, target: "firefox", title: "PokéRogue — second" })],
  ));
  assert.deepEqual(r, { rung: 8, line: "2 pokerogue.net tabs are open (Chrome: PokéRogue; Firefox: PokéRogue — second). Close all but one." });
});

test("one ready tab on a browser that is up to date is reachable: no rung at all", () => {
  assert.equal(ladder(state([browser()], [tab()]), COMMANDS), null);
});

test("a tab on a browser without consent is not counted, so it reads as rung 5 rather than as a second tab (§7.5)", () => {
  const s = state([browser(), browser({ conn: 2, target: "firefox", consent: false })], [tab(), tab({ conn: 2, tab: 4, target: "firefox" })]);
  assert.deepEqual(readyTabs(s).map(t => t.conn), [1]);
  assert.equal(ladder(s)?.rung, 5);
});

test("the offered commands are the one ready tab's browser's, and nothing while the count is off one", () => {
  assert.deepEqual([...offeredCommands(state([browser()], [tab()]))], COMMANDS);
  assert.equal(offeredCommands(state([browser()], [])).size, 0);
  assert.equal(offeredCommands(state([browser(), browser({ conn: 2 })], [tab(), tab({ conn: 2, tab: 2 })])).size, 0);
});
