/**
 * The reach ladder (§12.3): why the game is not reachable, in one line the player can act on. `status` returns the line
 * from the first failing rung and every other tool refuses with it, so there is one answer to "why is nothing
 * happening" wherever it is asked.
 *
 * Rungs 1 and 2 are about the hub itself and are found while dialling (`src/hub/client.ts`); rungs 3 to 8 are read off
 * one `state` frame, evaluated over every connected browser.
 */
import { execFileSync } from "node:child_process";
import { PROTOCOL } from "../protocol/version.ts";
import type { ExtensionInfo, HubState, TabInfo } from "../protocol/wire.ts";

/** `missing` names the command the connected browser did not offer: the same rung, a different tool error (§12.2). */
export type Reach = { rung: number; line: string; missing?: string };

/** The rung for more than one ready tab: the one refusal a tool reports as its own error rather than as unreachable. */
export const TABS_RUNG = 8;

/** Everything `status` says about the fleet, and whether any tool can run at all. */
export type Fleet = {
  browsers: ExtensionInfo[];
  tabs: TabInfo[];
  driver: "you" | "other" | null;
  /** The commands the browser holding the one ready tab offers; empty when the count is not one. */
  commands: ReadonlySet<string>;
  /** The first failing rung, or `null` when the game is reachable. */
  reach: Reach | null;
  /** A plugin-against-hub version skew that refuses every tool call (§7.3). */
  skew: string | null;
};

/**
 * What the hub adds under a `GameLink`: the fleet every tool checks before it does anything, and the grant an acting
 * tool takes at its start (§12.2). The CDP link has neither, and the Driver treats its absence as "always reachable".
 */
export interface HubSide {
  fleet(needed?: readonly string[]): Promise<Fleet>;
  claim(): Promise<boolean>;
}

/** How a target browser is named to the player. */
const NAME = { chrome: "Chrome", firefox: "Firefox", safari: "Safari" } as const;

const INSTALL =
  "Install Coachemon (Chrome Web Store or Firefox Add-ons; Orion installs either; Safari: the signed download from GitHub Releases, then allow it on pokerogue.net in Safari Settings › Extensions) and open pokerogue.net.";

/** Rung 1: something that is not the hub answers on the port. */
export function foreignPort(port: number): Reach {
  const holder = portHolder(port);
  return { rung: 1, line: `Port ${port} is held by ${holder}, not the Coachemon hub. Quit it, then retry.` };
}

/** Rung 2: the hub was spawned and would not come up. */
export function hubWontStart(stderrLine: string): Reach {
  return { rung: 2, line: `The Coachemon hub would not start: ${stderrLine || "it exited without saying why"}.` };
}

/**
 * Rungs 3 to 8 over one `state` frame. `needed` are the commands the caller is about to send: a browser that did not
 * list one of them is rung 4, the same as a browser outside the protocol window, because the fix is the same.
 */
export function reachLadder(state: HubState, needed: readonly string[] = []): Reach | null {
  const browsers = state.extensions;
  if (browsers.length === 0) return { rung: 3, line: `No browser has Coachemon connected. ${INSTALL}` };

  for (const e of browsers) {
    const missing = needed.find(n => !e.commands.includes(n));
    if (e.protocol < PROTOCOL - 1 || missing !== undefined) {
      const line = `Coachemon ${e.version} in ${NAME[e.target]} is too old for this plugin. Update the extension.`;
      return missing === undefined ? { rung: 4, line } : { rung: 4, line, missing };
    }
    if (e.protocol > PROTOCOL) {
      return { rung: 4, line: `Coachemon ${e.version} in ${NAME[e.target]} is newer than this plugin. Update the plugin: claude plugin update coachemon.` };
    }
  }

  const waiting = browsers.find(e => e.target === "firefox" && !e.consent);
  if (waiting) return { rung: 5, line: "Coachemon in Firefox is waiting for your OK: click the Coachemon icon in the toolbar once." };

  const wrong = state.tabs.find(t => t.state === "wrong-world");
  if (wrong) return { rung: 6, line: `Coachemon can't reach the game in ${NAME[wrong.target]}. Update ${NAME[wrong.target]}.` };

  const ready = readyTabs(state);
  if (ready.length === 0) return { rung: 7, line: "Coachemon is connected, but no pokerogue.net tab is ready. Open or reload pokerogue.net." };
  if (ready.length > 1) {
    const list = ready.map(t => `${NAME[t.target]}: ${t.title}`).join("; ");
    return { rung: TABS_RUNG, line: `${ready.length} pokerogue.net tabs are open (${list}). Close all but one.` };
  }
  return null;
}

/** The tabs the hub would route to: ready, and on a browser that has consent (§7.5). */
export function readyTabs(state: { extensions: ExtensionInfo[]; tabs: TabInfo[] }): TabInfo[] {
  const consented = new Set(state.extensions.filter(e => e.consent).map(e => e.conn));
  return state.tabs.filter(t => t.state === "ready" && consented.has(t.conn));
}

/** The commands the browser holding the one ready tab offers; empty unless exactly one tab is ready. */
export function offeredCommands(state: HubState): ReadonlySet<string> {
  const ready = readyTabs(state);
  if (ready.length !== 1) return new Set();
  return new Set(state.extensions.find(e => e.conn === ready[0]!.conn)?.commands ?? []);
}

/** Who is listening on the port, for rung 1. `lsof` is not everywhere, and a failure is not worth a worse answer. */
function portHolder(port: number): string {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const row = out.split("\n").find(l => l && !l.startsWith("COMMAND"));
    const [name, pid] = row?.split(/\s+/) ?? [];
    if (name && pid) return `${name} (pid ${pid})`;
  } catch {
    // no lsof, or nothing listening any more: the generic line still says what to do
  }
  return "another program";
}
