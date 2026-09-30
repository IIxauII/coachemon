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
  if (out === "missing value") throw new Error("Orion is not running JavaScript: check Develop → Allow JavaScript from Apple Events");
  return out;
}

// read.sh's wrapper: the probe reaches the page world through a <script> tag and answers on the DOM.
const probe = (mode: string) => `(() => { const e = document.createElement('script'); e.textContent = ${JSON.stringify(bundle(mode))};
  document.documentElement.appendChild(e); e.remove(); const r = document.documentElement.dataset.mcpOut;
  delete document.documentElement.dataset.mcpOut; return r || JSON.stringify({ error: 'no result (CSP or page not loaded)' }); })()`;

// The phases that wait on a sound's end, such as the heal after a boss wave, wait forever on a locked AudioContext:
// WebKit unlocks it on a real gesture, never on `do JavaScript`, and the run's reload locks it again (#499).
const AUDIO = `(() => { const e = document.createElement('script'); e.textContent = ${JSON.stringify(`try {
  const game = Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game;
  document.documentElement.dataset.mcpOut = JSON.stringify({ state: game.sound.context?.state ?? null });
} catch (err) { document.documentElement.dataset.mcpOut = JSON.stringify({ error: String(err) }); }`)};
  document.documentElement.appendChild(e); e.remove(); const r = document.documentElement.dataset.mcpOut;
  delete document.documentElement.dataset.mcpOut; return r || JSON.stringify({ error: 'no result' }); })()`;

export type Drained = { hudActive: boolean; meterActive: boolean; stats: Record<string, unknown> & { ticks: unknown[]; gaps: unknown[] } | null; error?: string };

export function orion() {
  const drainJs = probe("drain");
  return {
    drain: (): Drained => JSON.parse(inTab(drainJs)) as Drained,
    reload: (): void => { inTab("location.reload(), 'ok'"); },
    /** `hidden`, `visible`, or the tab's error. */
    visibility: (): string => inTab("document.visibilityState"),
    /** The AudioContext's state: Phaser's own `locked` stays true when auto-play, not a gesture, started it. */
    audio: (): { state?: string | null; error?: string } => JSON.parse(inTab(AUDIO)),
  };
}

export const lowPowerMode = (): boolean => /lowpowermode\s+1/.test(execFileSync("pmset", ["-g"], { encoding: "utf8" }));
