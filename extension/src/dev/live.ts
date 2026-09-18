/**
 * The dev table's live wiring (§5.4, §10.6): the browser APIs `commands.ts` and `reinject.ts` are injected with, and
 * what the dev background does on start. Kept apart from them so the logic stays testable with no browser, and so that
 * everything a store build must not contain — `captureVisibleTab`, `executeScript`, `runtime.reload` — sits in one
 * file that a store build never bundles (§5.5).
 */
import { browser } from "wxt/browser";
import type { ToExtension } from "../../../src/protocol/wire.ts";
import { MATCHES } from "../build/manifest.ts";
import { devCommands, type DevApi, type LocalAnswer } from "./commands.ts";
import { reinject, type Injector } from "./reinject.ts";

/** The real `DevApi`: the capture is of the window the game tab is in, not of whatever window happens to be focused. */
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
    // A turn of the event loop, which is all it takes for the reply to be on the socket before the extension goes.
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

/**
 * What a dev background does that a store one does not: answer `screenshot` and `reload` itself, and put the content
 * scripts back into the tabs its own `runtime.reload()` orphaned (§5.4).
 */
export function startDev(): LocalAnswer {
  void reinject(liveInjector());
  return devCommands(liveApi());
}

/**
 * The frames a dev build knows and the store transport does not (§5.4). The name lives here rather than in the
 * transport so that a store artifact never contains the string `dev-reload` at all (§5.5) — and it never needs to,
 * since the hub fans the frame out to dev builds alone.
 */
export function devFrames(frame: ToExtension): boolean {
  if (frame.t !== "dev-reload") return false;
  browser.runtime.reload();
  return true;
}
