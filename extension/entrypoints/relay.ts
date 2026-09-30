/** `relay.js`, the ISOLATED-world content script (extension-distribution.md §9). */
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { browser } from "wxt/browser";
import type { CmdMessage } from "../src/messages.ts";
import type { Channel } from "../src/relay/channel.ts";
import { startRelay } from "../src/relay/relay.ts";

export default defineUnlistedScript(() => {
  // The world marker (extension-distribution.md §9.4).
  (globalThis as Record<string, unknown>).__coachemonIsolated = COACHEMON_BUILD;

  const relay = startRelay({
    channel: document as unknown as Channel,
    makeEvent: (type, detail) => new CustomEvent(type, { detail }),
    build: COACHEMON_BUILD,
    send: message => void Promise.resolve(browser.runtime.sendMessage(message)).catch(() => {}),
    title: () => document.title,
    onPageHide: fn => window.addEventListener("pagehide", fn),
    every: (fn, ms) => void setInterval(fn, ms),
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if ((message as CmdMessage | undefined)?.t !== "cmd") return;
    // Answered in this turn; returning `false` keeps no async reply channel open (extension-distribution.md §9.2).
    sendResponse(relay.command(message as CmdMessage));
    return false;
  });
});
