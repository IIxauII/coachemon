/**
 * The key probe's background (#1018): every browser-side route that could carry a press, sent down to the tab as a
 * grab that names the route, and the answers the panel and the options page ask for.
 *
 * Registered in the first turn, before anything is awaited: Chrome's service worker wakes only for listeners it found
 * there, so a registration behind an await is a shortcut that never fires.
 */
import { browser } from "wxt/browser";
import type { GrabMessage, ProbeAsk } from "../messages.ts";
import { UPDATE_TRY } from "./commands.ts";
import { idbRead, localRead } from "./dummy.ts";

type Recent = { at: string; what: string };

/** What the background saw lately, newest last. Lost when Chrome's service worker stops, which is fine for a probe. */
const recent: Recent[] = [];

export function note(what: string): void {
  recent.push({ at: new Date().toISOString().slice(11, 23), what });
  if (recent.length > 40) recent.shift();
}

/** The parts of `commands` that only some engines have, and that Chrome's typings lack. */
type Commands = typeof browser.commands & {
  update?: (d: { name: string; shortcut: string }) => Promise<void>;
  reset?: (name: string) => Promise<void>;
  openShortcutSettings?: () => Promise<void>;
};
/** Orion's API support is partial: a missing `commands` reads as one with nothing in it, never as a throw. */
const commands = () => (browser.commands ?? {}) as Commands;

async function deliver(route: GrabMessage["route"], name: string, tabId: number | undefined): Promise<void> {
  const at = Date.now();
  let tab = tabId;
  let tabFrom: GrabMessage["tabFrom"] = "event";
  if (tab == null) {
    // No `tabs` permission is needed for a tab's id.
    tabFrom = "query";
    try {
      const [t] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      tab = t?.id;
    } catch (e) {
      note(`${route}:${name} fired; tabs.query failed: ${String(e)}`);
      return;
    }
  }
  if (tab == null) {
    note(`${route}:${name} fired; no tab to hand it to`);
    return;
  }
  const message: GrabMessage = { t: "grab", route, name, at, tabFrom };
  try {
    const ack = await browser.tabs.sendMessage(tab, message);
    note(`${route}:${name} → tab ${tab} (tab from ${tabFrom}): ${ack ? "delivered" : "sent, no relay answered"}`);
  } catch (e) {
    note(`${route}:${name} → tab ${tab} (tab from ${tabFrom}): not delivered, ${String(e)}`);
  }
}

async function browserInfo(): Promise<unknown> {
  const runtime = browser.runtime as { getBrowserInfo?: () => Promise<unknown> };
  try {
    return (await runtime.getBrowserInfo?.()) ?? null;
  } catch (e) {
    return `getBrowserInfo threw: ${String(e)}`;
  }
}

async function getAll(): Promise<unknown> {
  try {
    return await commands().getAll();
  } catch (e) {
    return `commands.getAll threw: ${String(e)}`;
  }
}

/** Runs one call the probe tries and reports what it did, never throwing. */
async function attempt(what: string, fn: (() => Promise<unknown>) | undefined): Promise<Record<string, unknown>> {
  if (!fn) {
    note(`${what}: not available on this engine`);
    return { ok: false, error: `${what} is not available on this engine` };
  }
  try {
    const result = await fn();
    note(`${what}: ok`);
    return { ok: true, result: result ?? null, commands: await getAll() };
  } catch (e) {
    note(`${what}: failed, ${String(e)}`);
    return { ok: false, error: String(e), commands: await getAll() };
  }
}

async function answer(ask: string, sender: { tab?: { id?: number }; url?: string; origin?: string; frameId?: number }): Promise<unknown> {
  const c = commands();
  switch (ask) {
    case "status":
      return {
        ok: true,
        target: COACHEMON_TARGET,
        build: COACHEMON_BUILD,
        info: await browserInfo(),
        commands: await getAll(),
        api: {
          update: typeof c.update === "function",
          reset: typeof c.reset === "function",
          openShortcutSettings: typeof c.openShortcutSettings === "function",
          action: Boolean(browser.action?.onClicked),
        },
        optionsUrl: browser.runtime.getURL("/options.html"),
        background: { document: typeof document !== "undefined", localStorage: localRead().available },
        recent,
      };
    case "update":
      return attempt(`commands.update(${UPDATE_TRY.name} → ${UPDATE_TRY.shortcut})`,
        c.update && (() => c.update!({ name: UPDATE_TRY.name, shortcut: UPDATE_TRY.shortcut })));
    case "reset":
      return attempt(`commands.reset(${UPDATE_TRY.name})`, c.reset && (() => c.reset!(UPDATE_TRY.name)));
    case "shortcuts":
      // Firefox opens its own page; Chrome lets an extension open its shortcuts page with no permission.
      if (c.openShortcutSettings) return attempt("commands.openShortcutSettings()", () => c.openShortcutSettings!());
      return attempt("open chrome://extensions/shortcuts", () => browser.tabs.create({ url: "chrome://extensions/shortcuts" }));
    case "options-open":
      return attempt("runtime.openOptionsPage()", () => browser.runtime.openOptionsPage());
    case "options-tab":
      return attempt("options page in a tab", () => browser.tabs.create({ url: browser.runtime.getURL("/options.html") }));
    case "ping":
      note(`ping from ${sender.url ?? "?"}; sender.tab ${sender.tab?.id ?? "unset"}`);
      return {
        ok: true,
        senderTab: sender.tab?.id ?? null,
        senderUrl: sender.url ?? null,
        senderOrigin: sender.origin ?? null,
        frameId: sender.frameId ?? null,
      };
    case "bg-stores":
      return { ok: true, local: localRead(), idb: await idbRead() };
    default:
      return { ok: false, error: `unknown probe question ${ask}` };
  }
}

/** Each route registers on its own, so one an engine lacks cannot take the others, or the panel's answers, down. */
function register(what: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    note(`${what} could not be registered: ${String(e)}`);
  }
}

export function startKeyProbe(): void {
  register("commands.onCommand", () => browser.commands.onCommand.addListener((name, tab) => {
    note(`onCommand ${name}; tab ${tab?.id ?? "not passed"}`);
    void deliver("command", name, tab?.id);
  }));
  register("action.onClicked", () => browser.action.onClicked.addListener(tab => {
    note(`action.onClicked; tab ${tab?.id ?? "not passed"}`);
    void deliver("action", "action.onClicked", tab?.id);
  }));
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if ((message as ProbeAsk | undefined)?.t !== "probe-ask") return;
    answer((message as ProbeAsk).ask, sender as never).then(sendResponse, e => sendResponse({ ok: false, error: String(e) }));
    // Keeps the reply channel open for the async answer.
    return true;
  });
  note("background started");
}
