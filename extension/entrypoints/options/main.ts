/**
 * The key probe's options page (#1018): it shows that it opened and where, and whether a dummy key binding survives in
 * each store that needs no permission (§7 of the note on `research/preferences-page`). It writes no real setting.
 */
import { browser } from "wxt/browser";
import type { ProbeAsk } from "../../src/messages.ts";
import { idbRead, idbWrite, localRead, localWrite, nextRecord, type DummyRead } from "../../src/keyprobe/dummy.ts";

const $ = (id: string): HTMLElement => document.getElementById(id)!;

const ask = (what: string): Promise<Record<string, unknown>> => {
  const message: ProbeAsk = { t: "probe-ask", ask: what };
  return Promise.resolve(browser.runtime.sendMessage(message)).then(
    a => (a as Record<string, unknown>) ?? { ok: false, error: "no answer" },
    e => ({ ok: false, error: String(e) }),
  );
};

const show = (r: DummyRead): string => {
  if (!r.available) return r.error ? `not available: ${r.error}` : "not available here";
  if (!r.value) return "empty (first open, or it was wiped)";
  const v = r.value;
  return `found: opened ${v.opens}×, first ${v.first}, last ${v.last}, build ${v.build}, by ${v.by}, origin ${v.origin}`;
};

function solving(): void {
  const box = $("solving") as HTMLInputElement;
  box.addEventListener("change", () => {
    $("solving-note").textContent = `A dummy switch, now ${box.checked ? "on" : "off"}: nothing was written anywhere.`;
  });
}

async function where(): Promise<void> {
  const runtime = browser.runtime as { getBrowserInfo?: () => Promise<unknown> };
  let info: unknown = null;
  try { info = (await runtime.getBrowserInfo?.()) ?? "no runtime.getBrowserInfo"; } catch (e) { info = `threw: ${String(e)}`; }
  let tab = "";
  try {
    const t = await browser.tabs.getCurrent();
    tab = t?.id != null ? `tab ${t.id}` : "no tab (embedded in the browser's own page?)";
  } catch (e) {
    tab = `tabs.getCurrent threw: ${String(e)}`;
  }
  $("where").textContent = [
    `build ${COACHEMON_BUILD}, ${COACHEMON_TARGET}-flavoured`,
    `url ${location.href}`,
    `origin ${location.origin}`,
    `getBrowserInfo ${JSON.stringify(info)}`,
    `window.KAGI ${typeof (window as unknown as { KAGI?: unknown }).KAGI}`,
    `userAgent ${navigator.userAgent}`,
    `tabs.getCurrent → ${tab}`,
    `top-level window ${window.top === window ? "yes" : "no (framed)"} · viewport ${innerWidth}×${innerHeight}`,
    `opened at ${new Date().toISOString()}`,
  ].join("\n");
}

async function background(): Promise<void> {
  const t0 = performance.now();
  const a = await ask("ping");
  const ms = Math.round(performance.now() - t0);
  $("background").textContent = a.ok
    ? `heard this page in ${ms} ms · sender.tab ${a.senderTab ?? "unset"} · sender.url ${a.senderUrl} · sender.origin ${a.senderOrigin ?? "unset"} · frameId ${a.frameId ?? "unset"}`
    : `no answer: ${String(a.error)}`;
}

async function stores(): Promise<void> {
  const by = "options page";
  const localBefore = localRead();
  const idbBefore = await idbRead();
  const localError = localBefore.available ? localWrite(nextRecord(localBefore.value, COACHEMON_BUILD, by)) : null;
  const idbError = idbBefore.available ? await idbWrite(nextRecord(idbBefore.value, COACHEMON_BUILD, by)) : null;
  const localAfter = localRead();
  const idbAfter = await idbRead();
  const bg = await ask("bg-stores");
  const bgLocal = bg.ok ? show(bg.local as DummyRead) : `no answer: ${String(bg.error)}`;
  const bgIdb = bg.ok ? show(bg.idb as DummyRead) : `no answer: ${String(bg.error)}`;

  const row = (store: string, before: string, after: string): HTMLTableRowElement => {
    const tr = document.createElement("tr");
    for (const text of [store, before, after]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    return tr;
  };
  $("stores").replaceChildren(
    row("this page's localStorage", show(localBefore), localError ? `write failed: ${localError}` : show(localAfter)),
    row("this page's IndexedDB", show(idbBefore), idbError ? `write failed: ${idbError}` : show(idbAfter)),
    row("the background's localStorage", "—", bgLocal),
    row("the background's IndexedDB", "—", bgIdb),
  );
}

function clear(): void {
  $("clear").addEventListener("click", () => {
    void (async () => {
      const errors = [localWrite(null), await idbWrite(null)].filter(Boolean);
      $("clear-note").textContent = errors.length ? `clear failed: ${errors.join("; ")}` : "Cleared. Close and reopen this page to see both empty.";
    })();
  });
}

solving();
clear();
void where();
void background();
void stores();
