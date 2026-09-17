import assert from "node:assert/strict";
import { test } from "node:test";
import { reach, type Reachability } from "./ladder.ts";
import { PROTOCOL } from "../protocol/version.ts";
import { COMMAND_NAMES } from "../protocol/commands.ts";
import type { ExtensionInfo, Target, TabInfo } from "../protocol/wire.ts";

function ext(o: Partial<ExtensionInfo> = {}): ExtensionInfo {
  return { conn: 1, target: "chrome", version: "1.2.0", flavour: "store", protocol: PROTOCOL, consent: true, commands: [...COMMAND_NAMES], ...o };
}

function tab(o: Partial<TabInfo> = {}): TabInfo {
  return { conn: 1, tab: 1, target: "chrome", title: "PokéRogue", state: "ready", ...o };
}

function sight(o: Partial<Reachability> = {}): Reachability {
  return { trouble: null, extensions: [ext()], tabs: [tab()], ...o };
}

test("rung 1: the port is held by something that is not the hub (§12.3)", () => {
  const r = reach(sight({ trouble: { kind: "foreign", port: 47147, process: "node", pid: 811 } }));
  assert.deepEqual(r, { code: "unreachable", rung: 1, line: "Port 47147 is held by node (pid 811), not the Coachemon hub. Quit it, then retry." });
  // `lsof` is not everywhere, and the line still has to work without it.
  const anon = reach(sight({ trouble: { kind: "foreign", port: 47147, process: null, pid: null } }));
  assert.equal(anon?.line, "Port 47147 is held by another program, not the Coachemon hub. Quit it, then retry.");
});

test("rung 2: the hub would not start, named by the first line of its stderr (§12.3)", () => {
  const r = reach(sight({ trouble: { kind: "no-start", stderr: "Error: cannot find module ws\n    at file:///x\n" } }));
  assert.deepEqual(r, { code: "unreachable", rung: 2, line: "The Coachemon hub would not start: Error: cannot find module ws." });
});

test("version skew is not a rung: each side gets its own line (§7.3)", () => {
  assert.deepEqual(reach(sight({ trouble: { kind: "skew-driving" } })), {
    code: "unreachable",
    rung: null,
    line: "Another session is driving on an older Coachemon hub. Finish or close that session, then retry.",
  });
  assert.deepEqual(reach(sight({ trouble: { kind: "skew-hub-newer" } })), {
    code: "unreachable",
    rung: null,
    line: "This Claude session's Coachemon plugin is older than the running hub. Restart this Claude session.",
  });
});

test("rung 3: the hub is up and no browser has connected (§12.3)", () => {
  const r = reach(sight({ extensions: [], tabs: [] }));
  assert.equal(r?.rung, 3);
  assert.match(r!.line, /^No browser has Coachemon connected\. Install Coachemon .*and open pokerogue\.net\.$/);
});

test("rung 4: an extension outside the protocol window, in whichever direction (§8.5, §12.3)", () => {
  const behind = reach(sight({ extensions: [ext({ protocol: PROTOCOL - 2, version: "0.9.0", target: "firefox" })] }));
  assert.deepEqual(behind, { code: "unreachable", rung: 4, line: "Coachemon 0.9.0 in Firefox is too old for this plugin. Update the extension." });
  const ahead = reach(sight({ extensions: [ext({ protocol: PROTOCOL + 1, version: "2.0.0" })] }));
  assert.deepEqual(ahead, { code: "unreachable", rung: 4, line: "Coachemon 2.0.0 in Chrome is newer than this plugin. Update the plugin: claude plugin update coachemon." });
  // The window is two wide: the previous protocol is reachable, which is what covers store review lag.
  assert.equal(reach(sight({ extensions: [ext({ protocol: PROTOCOL - 1 })] })), null);
});

test("rung 4 also covers a command the extension did not list, and that tool alone (§8.5)", () => {
  const s = sight({ extensions: [ext({ commands: ["probe", "menu"] })] });
  assert.equal(reach({ ...s, needs: ["probe", "menu"] }), null, "a tool whose commands are all there keeps working");
  const r = reach({ ...s, needs: ["probe", "starters"] });
  assert.deepEqual(r, { code: "missing_command", rung: 4, line: "Coachemon 1.2.0 in Chrome is too old for this plugin. Update the extension." });
});

test("rung 5: a browser waiting for consent (§8.4, §12.3)", () => {
  const r = reach(sight({ extensions: [ext({ target: "firefox", consent: false })] }));
  assert.deepEqual(r, { code: "unreachable", rung: 5, line: "Coachemon in Firefox is waiting for your OK: click the Coachemon icon in the toolbar once." });
});

test("rung 6: a tab whose page scripts ran isolated (§9.4, §12.3)", () => {
  const r = reach(sight({ extensions: [ext({ target: "safari" })], tabs: [tab({ target: "safari", state: "wrong-world" })] }));
  assert.deepEqual(r, { code: "unreachable", rung: 6, line: "Coachemon can't reach the game in Safari. Update Safari." });
});

test("rung 7: connected, with no ready tab (§12.3)", () => {
  const r = reach(sight({ tabs: [] }));
  assert.deepEqual(r, { code: "unreachable", rung: 7, line: "Coachemon is connected, but no pokerogue.net tab is ready. Open or reload pokerogue.net." });
});

test("rung 8: more than one ready tab refuses with the list, never a guess (§1.6, §12.3)", () => {
  const tabs = [tab({ tab: 1 }), tab({ conn: 2, tab: 9, target: "firefox" as Target, title: "PokéRogue — save 2" })];
  const r = reach(sight({ extensions: [ext(), ext({ conn: 2, target: "firefox" })], tabs }));
  assert.equal(r?.code, "tabs");
  assert.equal(r?.rung, 8);
  assert.equal(r?.line, "2 pokerogue.net tabs are open (Chrome: PokéRogue; Firefox: PokéRogue — save 2). Close all but one.");
  assert.deepEqual(r?.tabs, tabs);
});

test("one ready tab behind a consented, in-window extension is reachable", () => {
  assert.equal(reach(sight()), null);
  // A second tab that is not ready is not a second save.
  assert.equal(reach(sight({ tabs: [tab(), tab({ tab: 2, state: "gone" })] })), null);
});
