/**
 * `background.js` (§8): the one socket to the hub per browser. It owns nothing about the game — it dials while a tab
 * is present, forwards commands to the tab and replies back, and keeps itself alive.
 *
 * Listeners are registered in the first turn, before anything is awaited, because Chrome's service worker restarts on
 * every event and only listeners registered synchronously wake it (§8.2).
 */
import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { COMMAND_NAMES } from "../../src/protocol/commands.ts";
import { DEV_COMMAND_NAMES } from "../../src/protocol/dev-commands.ts";
import { devFrames, startDev } from "../src/dev/live.ts";
import type { ToBackground } from "../src/messages.ts";
import { startConsent } from "../src/transport/consent.ts";
import { Transport } from "../src/transport/transport.ts";

export default defineBackground(() => {
  // `COACHEMON_FLAVOUR` is a build-time constant, so a store build drops both branches and the dev modules with them:
  // everything they name — `captureVisibleTab`, `executeScript`, the dev command names — is what the guard bans (§5.5).
  const dev = COACHEMON_FLAVOUR === "dev";

  const transport = new Transport({
    url: COACHEMON_HUB_URL,
    target: COACHEMON_TARGET,
    flavour: COACHEMON_FLAVOUR,
    version: COACHEMON_VERSION,
    build: COACHEMON_BUILD,
    commands: dev ? [...COMMAND_NAMES, ...DEV_COMMAND_NAMES] : [...COMMAND_NAMES],
    // Firefox starts unconsented and says so on the wire; every other target has no consent step (§8.4).
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
    // No `tabs` permission: a tab we have a content script in is addressable by id anyway (§8.3).
    toTab: (tab, message) => Promise.resolve(browser.tabs.sendMessage(tab, message)),
    // The dev table's two background commands, and the re-injection that follows its own reload (§5.4, §10.6).
    local: dev ? startDev() : undefined,
    // The dev loop's reload, which needs no tab and so reaches a build whose relay the last change broke (§5.4).
    extra: dev ? devFrames : undefined,
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    const tab = sender.tab?.id;
    if (tab != null && typeof (message as ToBackground | undefined)?.t === "string") {
      transport.fromTab(tab, message as ToBackground);
    }
  });

  // `pagehide` is the usual way a tab leaves (§9.3); this catches the close that never fired one.
  browser.tabs.onRemoved.addListener(tab => transport.tabClosed(tab));

  transport.start();

  void startConsent(
    {
      target: COACHEMON_TARGET,
      browserName: async () => {
        // Firefox-only, and absent from Chrome's typings, which is the point: this is how the Firefox build tells
        // Firefox from Orion running the same AMO build (§8.4).
        const runtime = browser.runtime as { getBrowserInfo?: () => Promise<{ name: string }> };
        const info = await runtime.getBrowserInfo?.();
        return info?.name ?? null;
      },
      permissions: {
        getAll: () => browser.permissions.getAll() as Promise<Record<string, unknown>>,
        contains: p => browser.permissions.contains(p as never),
        request: p => browser.permissions.request(p as never),
      },
      store: {
        get: key => localStorage.getItem(key),
        set: (key, value) => localStorage.setItem(key, value),
      },
      onClick: fn => browser.action.onClicked.addListener(fn),
    },
    () => transport.grant(),
  );
});
