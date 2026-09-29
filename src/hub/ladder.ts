/** The reachability ladder (extension-distribution.md §12.3). Pure: it knows nothing about sockets. */
import { PROTOCOL } from "../protocol/version.ts";
import type { ExtensionInfo, Target, TabInfo } from "../protocol/wire.ts";

export type HubTrouble =
  | { kind: "foreign"; port: number; process: string | null; pid: number | null }
  | { kind: "no-start"; stderr: string }
  | { kind: "skew-driving" }
  | { kind: "skew-hub-newer" };

/** `rung` is null on version skew, which the ladder does not number (extension-distribution.md §7.3). */
export type Reach = {
  code: "unreachable" | "tabs" | "missing_command";
  rung: number | null;
  line: string;
  /** Rung 8 only. */
  tabs?: TabInfo[];
};

export type Reachability = {
  trouble: HubTrouble | null;
  extensions: readonly ExtensionInfo[];
  tabs: readonly TabInfo[];
  /** One the extension did not list refuses this tool alone (extension-distribution.md §8.5). */
  needs?: readonly string[];
};

const INSTALL =
  "No browser has Coachemon connected. Install Coachemon (Chrome Web Store or Firefox Add-ons; Orion installs either; Safari: the signed download from GitHub Releases, then allow it on pokerogue.net in Safari Settings › Extensions) and open pokerogue.net.";

const NAME: Record<Target, string> = { chrome: "Chrome", firefox: "Firefox", safari: "Safari" };

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
  const short = s.needs?.length ? s.extensions.find(e => s.needs!.some(n => !e.commands.includes(n))) : undefined;
  if (short) return { code: "missing_command", rung: 4, line: tooOld(short) };

  // The target is named, not "Firefox" as extension-distribution.md §12.3 words it: Orion runs that build too (§8.4).
  const waiting = s.extensions.find(e => !e.consent);
  if (waiting) return unreachable(5, `Coachemon in ${NAME[waiting.target]} is waiting for your OK: click the Coachemon icon in the toolbar once.`);

  const isolated = s.tabs.find(t => t.state === "wrong-world");
  if (isolated) return unreachable(6, `Coachemon can't reach the game in ${NAME[isolated.target]}. Update ${NAME[isolated.target]}.`);

  const ready = s.tabs.filter(t => t.state === "ready");
  if (ready.length === 0) return unreachable(7, "Coachemon is connected, but no pokerogue.net tab is ready. Open or reload pokerogue.net.");
  if (ready.length > 1) return { code: "tabs", rung: 8, line: tabsLine(ready), tabs: [...ready] };
  return null;
}

export function tabsLine(tabs: readonly TabInfo[]): string {
  const which = tabs.map(t => `${NAME[t.target]}: ${t.title}`).join("; ");
  return `${tabs.length} pokerogue.net tabs are open (${which}). Close all but one.`;
}

const tooOld = (e: ExtensionInfo) => `Coachemon ${e.version} in ${NAME[e.target]} is too old for this plugin. Update the extension.`;

function firstLine(stderr: string): string {
  const line = stderr.split("\n").find(l => l.trim() !== "");
  return line === undefined ? "it exited without saying why" : line.trim();
}
