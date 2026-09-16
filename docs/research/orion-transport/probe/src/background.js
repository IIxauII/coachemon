// PROTOTYPE (#150) — background for the Orion loopback probe. One source for both builds:
// CWS-shape (background.service_worker) and AMO-shape (background.scripts).
// Holds a WebSocket and a long-poll to 127.0.0.1, relays each command to the pokerogue.net tab
// (isolated content script → MAIN world) and acks back over fetch.
const api = globalThis.browser ?? globalThis.chrome;
const BASE = "127.0.0.1:47150";
const BUILD = api.runtime.getManifest().name.includes("AMO") ? "amo" : "cws";
const STARTED = Date.now();
const tabs = new Set();
const seen = new Set();
const off = { ws: false, poll: false };

const report = (name, data = {}) =>
  fetch(`http://${BASE}/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: name, build: BUILD, bgUptimeS: Math.round((Date.now() - STARTED) / 1000), ...data }) })
    .catch(e => console.log("[probe150] event failed", name, String(e)));

const pageTabs = async () => {
  try {
    const found = await api.tabs.query({ url: "https://pokerogue.net/*" });
    for (const t of found) tabs.add(t.id);
  } catch (e) { report("tabs.query-error", { error: String(e) }); }
  return [...tabs];
};

const handle = async (cmd, via) => {
  if (cmd.kind === "disable") { off[via] = true; return report("means-disabled", { via }); }
  if (cmd.kind !== "cmd" || seen.has(cmd.id)) return;
  seen.add(cmd.id);
  const bgReceivedAt = Date.now();
  const results = [];
  for (const tabId of await pageTabs()) {
    try {
      const reply = await Promise.race([
        api.tabs.sendMessage(tabId, cmd),
        new Promise((_, rej) => setTimeout(() => rej(new Error("tab timeout 3s")), 3000)),
      ]);
      results.push({ tabId, reply });
    } catch (e) { results.push({ tabId, error: String(e) }); tabs.delete(tabId); }
  }
  fetch(`http://${BASE}/ack`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: cmd.id, build: BUILD, via, bgUptimeS: Math.round((bgReceivedAt - STARTED) / 1000), bgLagMs: bgReceivedAt - cmd.sentAt, results }),
  }).catch(e => console.log("[probe150] ack failed", String(e)));
};

// --- means 1: held WebSocket, reconnect on close ------------------------------
let wsBackoff = 1000;
const connectWs = () => {
  if (off.ws) return;
  let ws;
  try { ws = new WebSocket(`ws://${BASE}/ws?build=${BUILD}`); } catch (e) { report("ws-ctor-error", { error: String(e) }); return setTimeout(connectWs, 5000); }
  ws.onopen = () => { wsBackoff = 1000; };
  ws.onmessage = e => { try { handle(JSON.parse(e.data), "ws"); } catch {} };
  ws.onclose = e => { if (!off.ws) setTimeout(connectWs, wsBackoff = Math.min(wsBackoff * 2, 5000)); console.log("[probe150] ws closed", e.code); };
};

// --- means 2: long-poll -------------------------------------------------------
const poll = async () => {
  while (!off.poll) {
    try {
      const r = await fetch(`http://${BASE}/poll?build=${BUILD}`);
      if (r.status === 200) handle(await r.json(), "poll");
    } catch (e) { await new Promise(res => setTimeout(res, 2000)); }
  }
};

// --- wake source: content script keepalive / registration --------------------
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.tab?.id != null) tabs.add(sender.tab.id);
  if (msg?.kind === "hello") report("tab-hello", { tabId: sender.tab?.id, keepalive: msg.keepalive, url: sender.tab?.url });
  sendResponse({ build: BUILD, bgUptimeS: Math.round((Date.now() - STARTED) / 1000) });
});

report("bg-start", {
  ua: navigator.userAgent,
  isServiceWorker: typeof ServiceWorkerGlobalScope !== "undefined" && globalThis instanceof ServiceWorkerGlobalScope,
  hasDocument: typeof document !== "undefined",
  hasBrowserGlobal: typeof globalThis.browser !== "undefined",
});
connectWs();
poll();
