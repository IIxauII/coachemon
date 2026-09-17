// PROTOTYPE (#174) — ISOLATED-world relay: background ⇄ MAIN world. Also messages the background every 20 s,
// the Firefox keepalive from #161; Chrome is kept up by the background's own WebSocket frames.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const hello = () => api.runtime.sendMessage({ kind: "hello" }).catch(() => {});
  hello();
  setInterval(hello, 20000);

  const waiting = new Map();
  window.addEventListener("message", e => {
    if (e.source !== window || e.data?.source !== "probe174-main") return;
    waiting.get(e.data.id)?.(e.data);
    waiting.delete(e.data.id);
  });

  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.kind !== "page") return;
    waiting.set(msg.id, sendResponse);
    window.postMessage({ source: "probe174-iso", id: msg.id, op: msg.op, args: msg.args }, "*");
    return true;
  });
})();
