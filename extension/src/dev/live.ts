/**
 * Everything a store build must not contain — `captureVisibleTab`, `executeScript`, `runtime.reload` — sits here, in
 * the one file a store build never bundles (extension-distribution.md §5.5).
 */
import { browser } from "wxt/browser";
import type { ToExtension } from "../../../src/protocol/wire.ts";
import { MATCHES } from "../build/manifest.ts";
import { devCommands, type DevApi, type LocalAnswer } from "./commands.ts";
import { reinject, type Injector } from "./reinject.ts";

/** The capture is of the game tab's window, not of whichever window has focus. */
export function liveApi(): DevApi {
  const tabs = browser.tabs as unknown as {
    get: (tab: number) => Promise<{ windowId?: number }>;
    captureVisibleTab: (windowId: number, options: { format: string }) => Promise<string>;
  };
  return {
    capture: async tab => {
      const { windowId } = await tabs.get(tab);
      return tabs.captureVisibleTab(windowId as number, { format: "png" });
    },
    reload: () => browser.runtime.reload(),
    soon: fn => void setTimeout(fn, 0),
  };
}

function liveInjector(): Injector {
  const api = browser as unknown as {
    tabs: { query: (q: { url: string[] }) => Promise<{ id?: number }[]> };
    scripting: { executeScript: (o: { target: { tabId: number }; files: string[]; world: string }) => Promise<unknown> };
  };
  return {
    gameTabs: async () => (await api.tabs.query({ url: [...MATCHES] })).flatMap(t => (t.id === undefined ? [] : [t.id])),
    inject: (tabId, files, world) => api.scripting.executeScript({ target: { tabId }, files, world }),
  };
}

export function startDev(): LocalAnswer {
  void reinject(liveInjector());
  return devCommands(liveApi());
}

/** `dev-reload` is named here, never in the transport, so a store artifact does not contain it (extension-distribution.md §5.5). */
export function devFrames(frame: ToExtension): boolean {
  if (frame.t !== "dev-reload") return false;
  browser.runtime.reload();
  return true;
}
