/**
 * `relay.js` (§9): the ISOLATED-world content script, listed in the manifest by hand at `document_start`. All it does
 * here is hand the real `document`, `runtime` and timers to `startRelay`; the contract itself is under `src/relay/`.
 *
 * An unlisted script rather than a WXT content script, so the file lands at the output root and the manifest stays
 * written by hand in one place (§5.3).
 */
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { browser } from "wxt/browser";
import type { CmdMessage } from "../src/messages.ts";
import type { Channel } from "../src/relay/channel.ts";
import { startRelay } from "../src/relay/relay.ts";

export default defineUnlistedScript(() => {
  // The world marker, in the relay's own world. A page script that can see this ran isolated (§9.4).
  (globalThis as Record<string, unknown>).__coachemonIsolated = COACHEMON_BUILD;

  const relay = startRelay({
    channel: document as unknown as Channel,
    makeEvent: (type, detail) => new CustomEvent(type, { detail }),
    build: COACHEMON_BUILD,
    // A background that is gone will re-learn this tab from the next keepalive, so a failed send is nothing (§8.2).
    send: message => void Promise.resolve(browser.runtime.sendMessage(message)).catch(() => {}),
    title: () => document.title,
    onPageHide: fn => window.addEventListener("pagehide", fn),
    every: (fn, ms) => void setInterval(fn, ms),
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if ((message as CmdMessage | undefined)?.t !== "cmd") return;
    // Answered in this same turn, and the listener returns falsy: no async reply channel, no timer (§9.2).
    sendResponse(relay.command(message as CmdMessage));
    return false;
  });
});
