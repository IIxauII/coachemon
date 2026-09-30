/** The one socket to the hub per browser, which owns nothing about the game (extension-distribution.md §8). */
import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { COMMAND_NAMES } from "../../src/protocol/commands.ts";
import { DEV_COMMAND_NAMES } from "../../src/protocol/dev-commands.ts";
import { devFrames, startDev } from "../src/dev/live.ts";
import type { ToBackground } from "../src/messages.ts";
import { startConsent } from "../src/transport/consent.ts";
import { Transport } from "../src/transport/transport.ts";

export default defineBackground(() => {
  // A build-time constant, so a store build drops the dev modules and every name in them the guard bans
  // (extension-distribution.md §5.5).
  const dev = COACHEMON_FLAVOUR === "dev";

  const transport = new Transport({
    url: COACHEMON_HUB_URL,
    target: COACHEMON_TARGET,
    flavour: COACHEMON_FLAVOUR,
    version: COACHEMON_VERSION,
    build: COACHEMON_BUILD,
    commands: dev ? [...COMMAND_NAMES, ...DEV_COMMAND_NAMES] : [...COMMAND_NAMES],
    // extension-distribution.md §8.4.
    consent: COACHEMON_TARGET !== "firefox",
    dial: (url, h) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => h.open());
      ws.addEventListener("message", e => h.message(String(e.data)));
      ws.addEventListener("close", () => h.closed());
      ws.addEventListener("error", () => h.closed());
      return { send: data => ws.send(data), close: () => ws.close() };
    },
    after: (ms, fn) => {
      const handle = setTimeout(fn, ms);
      return () => clearTimeout(handle);
    },
    // No `tabs` permission: a tab we have a content script in is addressable by id anyway
    // (extension-distribution.md §8.3).
    toTab: (tab, message) => Promise.resolve(browser.tabs.sendMessage(tab, message)),
    local: dev ? startDev() : undefined,
    extra: dev ? devFrames : undefined,
  });

  // Every listener is registered in this first turn, before anything is awaited: Chrome's service worker restarts on
  // every event, and only a listener registered synchronously wakes it.
  browser.runtime.onMessage.addListener((message, sender) => {
    const tab = sender.tab?.id;
    if (tab != null && typeof (message as ToBackground | undefined)?.t === "string") {
      transport.fromTab(tab, message as ToBackground);
    }
  });

  // A tab that closes without firing `pagehide` never reports itself gone (extension-distribution.md §9.3).
  browser.tabs.onRemoved.addListener(tab => transport.tabClosed(tab));

  transport.start();

  void startConsent(
    {
      target: COACHEMON_TARGET,
      browserName: async () => {
        // Firefox-only and absent from Chrome's typings; it tells Firefox from Orion running the same AMO build
        // (extension-distribution.md §8.4).
        const runtime = browser.runtime as { getBrowserInfo?: () => Promise<{ name: string }> };
        const info = await runtime.getBrowserInfo?.();
        return info?.name ?? null;
      },
      permissions: {
        contains: p => browser.permissions.contains(p as never),
        request: p => browser.permissions.request(p as never),
      },
      onClick: fn => browser.action.onClicked.addListener(fn),
    },
    () => transport.grant(),
  );
});
