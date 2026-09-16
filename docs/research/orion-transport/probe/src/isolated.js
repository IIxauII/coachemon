// PROTOTYPE (#150) — ISOLATED-world relay: background ⇄ MAIN world. Optional keepalive when the
// page URL carries #probe-keepalive: a runtime message every 20 s, which also wakes an unloaded background.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const keepalive = location.hash.includes("probe-keepalive");
  const badge = document.createElement("div");
  badge.style.cssText = "position:fixed;bottom:4px;right:4px;z-index:2147483647;padding:2px 6px;background:#111d;color:#9f9;font:11px monospace;pointer-events:none;";
  const show = text => { badge.textContent = `probe150 ${keepalive ? "[keepalive] " : ""}${text}`; };
  (document.body ?? document.documentElement).appendChild(badge);
  show("loaded");

  const hello = () => api.runtime.sendMessage({ kind: "hello", keepalive }).then(r => show(`bg ${r?.build} up ${r?.bgUptimeS}s`), e => show("bg unreachable: " + e));
  hello();
  if (keepalive) setInterval(hello, 20000);

  const waiting = new Map();
  window.addEventListener("message", e => {
    if (e.source !== window || e.data?.source !== "probe150-main") return;
    waiting.get(e.data.id)?.(e.data);
    waiting.delete(e.data.id);
  });

  api.runtime.onMessage.addListener((cmd, _sender, sendResponse) => {
    if (cmd?.kind !== "cmd") return;
    const tabReceivedAt = Date.now();
    waiting.set(cmd.id, main => {
      show(`${cmd.id} ${Date.now() - cmd.sentAt} ms`);
      sendResponse({ tabLagMs: tabReceivedAt - cmd.sentAt, main });
    });
    window.postMessage({ source: "probe150-iso", id: cmd.id }, "*");
    return true;
  });
})();
