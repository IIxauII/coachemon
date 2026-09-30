/**
 * The lag run's side door into the Orion tab: AppleScript's `do JavaScript`, as `read.sh orion` uses it. The hub is
 * the run's only way to press anything; this reads the meter and reloads the page.
 */
import { execFileSync } from "node:child_process";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../skills/coachemon/scripts/hud-bundle.mjs";

const TAB = `on run argv
  tell application "Orion"
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t starts with "https://pokerogue.net" then return do JavaScript (item 1 of argv) in t
      end repeat
    end repeat
  end tell
  return "{\\"error\\":\\"no pokerogue.net tab in Orion\\"}"
end run`;

function inTab(js: string): string {
  const out = execFileSync("osascript", ["-", js], { input: TAB, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
  // Develop → Allow JavaScript from Apple Events off: `do JavaScript` runs nothing.
  if (out === "missing value") throw new Error("Orion is not running JavaScript: check Develop → Allow JavaScript from Apple Events");
  return out;
}

// read.sh's wrapper: the probe reaches the page world through a <script> tag and answers on the DOM.
const probe = (mode: string) => `(() => { const e = document.createElement('script'); e.textContent = ${JSON.stringify(bundle(mode))};
  document.documentElement.appendChild(e); e.remove(); const r = document.documentElement.dataset.mcpOut;
  delete document.documentElement.dataset.mcpOut; return r || JSON.stringify({ error: 'no result (CSP or page not loaded)' }); })()`;

export type Drained = { hudActive: boolean; meterActive: boolean; stats: Record<string, unknown> & { ticks: unknown[]; gaps: unknown[] } | null; error?: string };

export function orion() {
  const drainJs = probe("drain");
  return {
    drain: (): Drained => JSON.parse(inTab(drainJs)) as Drained,
    reload: (): void => { inTab("location.reload(), 'ok'"); },
    /** `hidden`, `visible`, or the tab's error. */
    visibility: (): string => inTab("document.visibilityState"),
  };
}

export const lowPowerMode = (): boolean => /lowpowermode\s+1/.test(execFileSync("pmset", ["-g"], { encoding: "utf8" }));
