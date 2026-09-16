// PROTOTYPE (#161) — background for the Chrome/Firefox loopback probe, adapted from #150.
// CONFIG is prepended by build.mjs. Holds one channel to 127.0.0.1 (WebSocket or long-poll), relays each
// command to the pokerogue.net tab (isolated content script → MAIN world) and acks back over fetch.
// Deliberately sends nothing periodic of its own unless the variant says so: the control must be able to idle out.
const api = globalThis.browser ?? globalThis.chrome;
const BASE = "127.0.0.1:47161";
const STARTED = Date.now();
const tabs = new Set();
const seen = new Set();
const up = () => Math.round((Date.now() - STARTED) / 1000);

const post = (route, data, extra = {}) =>
  fetch(`http://${BASE}/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tag: CONFIG.tag, bgUptimeS: up(), ...data }), ...extra })
    .catch(e => console.log("[probe161]", route, "failed", String(e)));
const report = (event, data = {}) => post("event", { event, ...data });

const pageTabs = async () => {
  try { for (const t of await api.tabs.query({ url: "https://pokerogue.net/*" })) tabs.add(t.id); }
  catch (e) { report("tabs.query-error", { error: String(e) }); }
  return [...tabs];
};

const handle = async (cmd, via) => {
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
  post("ack", { id: cmd.id, via, bgLagMs: bgReceivedAt - cmd.sentAt, results });
};

// --- WebSocket, reconnect on close ---------------------------------------------
let wsBackoff = 1000, keepalives = 0;
const connectWs = () => {
  let ws;
  try { ws = new WebSocket(`ws://${BASE}/ws?tag=${encodeURIComponent(CONFIG.tag)}`); }
  catch (e) { report("ws-ctor-error", { error: String(e) }); return setTimeout(connectWs, 5000); }
  let ka;
  ws.onopen = () => {
    wsBackoff = 1000;
    if (CONFIG.wsKeepalive) ka = setInterval(() => ws.send(JSON.stringify({ kind: "keepalive", n: ++keepalives })), 20000);
  };
  ws.onmessage = e => { try { handle(JSON.parse(e.data), "ws"); } catch {} };
  ws.onerror = () => console.log("[probe161] ws error");
  ws.onclose = e => {
    clearInterval(ka);
    console.log("[probe161] ws closed", e.code);
    setTimeout(connectWs, wsBackoff = Math.min(wsBackoff * 2, 5000));
  };
};

// --- long-poll -------------------------------------------------------------------
const poll = async () => {
  for (;;) {
    try {
      const r = await fetch(`http://${BASE}/poll?tag=${encodeURIComponent(CONFIG.tag)}`);
      if (r.status === 200) handle(await r.json(), "poll");
    } catch (e) { console.log("[probe161] poll failed", String(e)); await new Promise(res => setTimeout(res, 2000)); }
  }
};

// --- content script registration / keepalive (a wake source) ----------------------
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.tab?.id != null) tabs.add(sender.tab.id);
  if (msg?.kind === "hello" && !msg.keepalive) report("tab-hello", { tabId: sender.tab?.id });
  sendResponse({ tag: CONFIG.tag, bgUptimeS: up() });
});

// Firefox fires this before unloading an idle event page; Chrome has no equivalent for workers.
api.runtime.onSuspend?.addListener(() => post("event", { event: "suspend" }, { keepalive: true }));

(async () => {
  let loopbackGranted = null;
  try { loopbackGranted = await api.permissions.contains({ origins: ["http://127.0.0.1/*"] }); } catch (e) { loopbackGranted = String(e); }
  report("bg-start", {
    ua: navigator.userAgent,
    isServiceWorker: typeof ServiceWorkerGlobalScope !== "undefined" && globalThis instanceof ServiceWorkerGlobalScope,
    hasDocument: typeof document !== "undefined",
    loopbackGranted,
    config: CONFIG,
  });
})();
if (CONFIG.means === "ws") connectWs(); else poll();
