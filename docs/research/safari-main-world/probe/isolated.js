// Default (ISOLATED) world. Relays main.js results to the background page and draws a banner.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const env = { typeofPhaser: typeof window.Phaser, typeofBrowser: typeof globalThis.browser };
  const banner = document.createElement("pre");
  banner.id = "probe-119";
  banner.style.cssText = "position:fixed;top:0;left:0;z-index:2147483647;max-width:60vw;max-height:60vh;overflow:auto;margin:0;padding:8px;background:#111e;color:#9f9;font:11px/1.3 monospace;white-space:pre-wrap;";
  const lines = [];
  const log = (label, obj) => {
    lines.push(`${label}: ${JSON.stringify(obj, null, 1)}`);
    banner.textContent = "probe #119 — click to hide\n" + lines.join("\n");
  };
  banner.onclick = () => banner.remove();
  (document.body ?? document.documentElement).appendChild(banner);
  log("isolated.js env", env);

  const send = async (kind, payload) => {
    try {
      const reply = await api.runtime.sendMessage({ kind, payload, url: location.href });
      log(`bg reply (${kind})`, reply);
    } catch (err) { log(`sendMessage failed (${kind})`, String(err)); }
  };
  send("isolated-loaded", env);

  const seen = new Set();
  window.addEventListener("message", e => {
    if (e.source !== window || e.data?.source !== "probe-main") return;
    const key = JSON.stringify(e.data.res);
    if (seen.has(key)) return;
    seen.add(key);
    log("main.js", e.data.res);
    send("main-result", e.data.res);
  });
  // main.js may have posted before this listener existed.
  setTimeout(() => {
    const d = document.documentElement.dataset.probeMain;
    if (d && !seen.has(d)) { seen.add(d); log("main.js (dataset)", JSON.parse(d)); send("main-result", JSON.parse(d)); }
    if (!d) { log("main.js", "NO RESULT after 35s — MAIN script did not run or could not report"); send("main-missing", {}); }
  }, 35000);
})();
