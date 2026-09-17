/**
 * The reachability ladder (§12.3): what stands between a tool call and a game tab, as one line the player can act on.
 * Eight rungs, evaluated in order over every connected browser; the first failing one is what `status` reports and what
 * every other tool refuses with. Version skew (§7.3) is not a rung: it has its own two lines and no number.
 *
 * Pure: it reads the hub's `state` and how the connection to the hub itself went, and knows nothing about sockets.
 */
import { PROTOCOL } from "../protocol/version.ts";
import type { ExtensionInfo, Target, TabInfo } from "../protocol/wire.ts";

/** Why nothing can be asked of the hub: the port is not ours (rung 1), it would not start (rung 2), or we are skewed (§7.3). */
export type HubTrouble =
  | { kind: "foreign"; port: number; process: string | null; pid: number | null }
  | { kind: "no-start"; stderr: string }
  | { kind: "skew-driving" }
  | { kind: "skew-hub-newer" };

/** What a tool says instead of reaching the game: `rung` is null when the trouble is skew, which the ladder does not number. */
export type Reach = {
  code: "unreachable" | "tabs" | "missing_command";
  rung: number | null;
  line: string;
  /** The tab list, on rung 8: the player has to know which windows to close. */
  tabs?: TabInfo[];
};

export type Reachability = {
  trouble: HubTrouble | null;
  extensions: readonly ExtensionInfo[];
  tabs: readonly TabInfo[];
  /** The commands the tool is about to use; one the extension did not list refuses alone, on rung 4's wording (§8.5). */
  needs?: readonly string[];
};

const INSTALL =
  "No browser has Coachemon connected. Install Coachemon (Chrome Web Store or Firefox Add-ons; Orion installs either; Safari: the signed download from GitHub Releases, then allow it on pokerogue.net in Safari Settings › Extensions) and open pokerogue.net.";

const NAME: Record<Target, string> = { chrome: "Chrome", firefox: "Firefox", safari: "Safari" };

/** Null when a command can reach the one ready tab; otherwise the first failing rung, in the words the tool shows. */
export function reach(s: Reachability): Reach | null {
  const unreachable = (rung: number | null, line: string): Reach => ({ code: "unreachable", rung, line });

  if (s.trouble) {
    switch (s.trouble.kind) {
      case "foreign": {
        const who = s.trouble.process ?? "another program";
        const pid = s.trouble.pid === null ? "" : ` (pid ${s.trouble.pid})`;
        return unreachable(1, `Port ${s.trouble.port} is held by ${who}${pid}, not the Coachemon hub. Quit it, then retry.`);
      }
      case "no-start":
        return unreachable(2, `The Coachemon hub would not start: ${firstLine(s.trouble.stderr)}.`);
      case "skew-driving":
        return unreachable(null, "Another session is driving on an older Coachemon hub. Finish or close that session, then retry.");
      case "skew-hub-newer":
        return unreachable(null, "This Claude session's Coachemon plugin is older than the running hub. Restart this Claude session.");
    }
  }

  if (s.extensions.length === 0) return unreachable(3, INSTALL);

  const old = s.extensions.find(e => e.protocol < PROTOCOL - 1);
  if (old) return unreachable(4, tooOld(old));
  const ahead = s.extensions.find(e => e.protocol > PROTOCOL);
  if (ahead) return unreachable(4, `Coachemon ${ahead.version} in ${NAME[ahead.target]} is newer than this plugin. Update the plugin: claude plugin update coachemon.`);
  // A command the installed extension never registered: this one tool refuses, and every other keeps working (§8.5).
  const short = s.needs?.length ? s.extensions.find(e => s.needs!.some(n => !e.commands.includes(n))) : undefined;
  if (short) return { code: "missing_command", rung: 4, line: tooOld(short) };

  // Only the Firefox build ever withholds consent (§8.4); the target is named anyway, because Orion runs that build too.
  const waiting = s.extensions.find(e => !e.consent);
  if (waiting) return unreachable(5, `Coachemon in ${NAME[waiting.target]} is waiting for your OK: click the Coachemon icon in the toolbar once.`);

  const isolated = s.tabs.find(t => t.state === "wrong-world");
  if (isolated) return unreachable(6, `Coachemon can't reach the game in ${NAME[isolated.target]}. Update ${NAME[isolated.target]}.`);

  const ready = s.tabs.filter(t => t.state === "ready");
  if (ready.length === 0) return unreachable(7, "Coachemon is connected, but no pokerogue.net tab is ready. Open or reload pokerogue.net.");
  if (ready.length > 1) {
    const which = ready.map(t => `${NAME[t.target]}: ${t.title}`).join("; ");
    return { code: "tabs", rung: 8, line: `${ready.length} pokerogue.net tabs are open (${which}). Close all but one.`, tabs: [...ready] };
  }
  return null;
}

const tooOld = (e: ExtensionInfo) => `Coachemon ${e.version} in ${NAME[e.target]} is too old for this plugin. Update the extension.`;

/** The hub's stderr can be a stack; only its first line is a sentence the player can read. */
function firstLine(stderr: string): string {
  const line = stderr.split("\n").find(l => l.trim() !== "");
  return line === undefined ? "it exited without saying why" : line.trim();
}
