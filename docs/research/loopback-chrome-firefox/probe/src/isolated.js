// PROTOTYPE (#161) — ISOLATED-world relay: background ⇄ MAIN world, tagged per variant so the six
// probes loaded side by side never answer each other. The tab-ka variant messages its background every 20 s.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const hello = keepalive => api.runtime.sendMessage({ kind: "hello", keepalive }).catch(() => {});
  hello(false);
  if (CONFIG.tabKeepalive) setInterval(() => hello(true), 20000);

  const waiting = new Map();
  window.addEventListener("message", e => {
    if (e.source !== window || e.data?.source !== "probe161-main" || e.data.tag !== CONFIG.tag) return;
    waiting.get(e.data.id)?.(e.data);
    waiting.delete(e.data.id);
  });

  api.runtime.onMessage.addListener((cmd, _sender, sendResponse) => {
    if (cmd?.kind !== "cmd") return;
    const tabReceivedAt = Date.now();
    waiting.set(cmd.id, main => sendResponse({ tabLagMs: tabReceivedAt - cmd.sentAt, main }));
    window.postMessage({ source: "probe161-iso", tag: CONFIG.tag, id: cmd.id }, "*");
    return true;
  });
})();
