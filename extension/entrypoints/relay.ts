/** `relay.js`, the ISOLATED-world content script (extension-distribution.md §9). */
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { browser } from "wxt/browser";
import type { ProbeAsk, ToRelay } from "../src/messages.ts";
import { EVENT, decode, type Channel } from "../src/relay/channel.ts";
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
    const m = message as ToRelay | undefined;
    if (m?.t === "grab") {
      relay.grab({ route: m.route, name: m.name, at: m.at, tabFrom: m.tabFrom, relayAt: Date.now() });
      // #418 answered nothing. The probe acknowledges, so the background can tell "fired, not delivered" (a tab with
      // no content scripts, as Orion leaves a reloaded one) from "never fired".
      sendResponse({ delivered: true });
      return false;
    }
    if (m?.t !== "cmd") return;
    // Answered in this turn; returning `false` keeps no async reply channel open (extension-distribution.md §9.2).
    sendResponse(relay.command(m));
    return false;
  });

  // The key probe's questions from the page (#1018). Only this build's page is answered.
  document.addEventListener(EVENT.probeAsk, e => {
    const d = decode((e as CustomEvent).detail);
    if (!d || d.build !== COACHEMON_BUILD || typeof d.ask !== "string") return;
    const ask: ProbeAsk = { t: "probe-ask", ask: d.ask };
    Promise.resolve(browser.runtime.sendMessage(ask)).then(
      answer => relay.probeAnswer({ id: d.id, answer: answer ?? { ok: false, error: "no answer from the background" } }),
      err => relay.probeAnswer({ id: d.id, answer: { ok: false, error: String(err) } }),
    );
  });
});
