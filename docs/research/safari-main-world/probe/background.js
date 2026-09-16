// Non-persistent background page. Records permission state, runs scripting.executeScript in MAIN,
// and forwards everything to a loopback listener over fetch and WebSocket.
const api = globalThis.browser ?? globalThis.chrome;
const LOOPBACK = "127.0.0.1:47119";
const ORIGIN = "https://pokerogue.net/*";

const note = (event, data = {}) => {
  const entry = { at: new Date().toISOString(), event, ...data };
  console.log("[probe]", entry);
  return entry;
};

const hasOrigin = async () => {
  try { return await api.permissions.contains({ origins: [ORIGIN] }); } catch (e) { return "err: " + e; }
};

const viaFetch = async body => {
  try {
    const r = await fetch(`http://${LOOPBACK}/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status, text: await r.text() };
  } catch (e) { return { error: String(e) }; }
};

const viaWebSocket = body => new Promise(resolve => {
  let ws;
  const done = r => { try { ws?.close(); } catch {} resolve(r); };
  const timer = setTimeout(() => done({ error: "timeout 5s" }), 5000);
  try { ws = new WebSocket(`ws://${LOOPBACK}/ws`); } catch (e) { clearTimeout(timer); return resolve({ error: "ctor: " + e }); }
  ws.onopen = () => ws.send(JSON.stringify(body));
  ws.onmessage = e => { clearTimeout(timer); done({ ok: true, echo: String(e.data).slice(0, 80) }); };
  ws.onerror = () => { clearTimeout(timer); done({ error: "onerror", readyState: ws.readyState }); };
});

const ship = async entry => {
  const fetchResult = await viaFetch(entry);
  const wsResult = await viaWebSocket(entry);
  console.log("[probe] loopback", entry.event, fetchResult, wsResult);
  return { fetch: fetchResult, ws: wsResult };
};

const probeInPage = () => {
  let game = null;
  try { game = Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p?.game)?.game ?? null; } catch {}
  return {
    typeofPhaser: typeof window.Phaser,
    typeofBrowser: typeof globalThis.browser,
    gameFound: !!game,
    battleScene: !!game?.scene?.getScene?.("battle"),
    frame: game?.loop?.frame ?? null,
  };
};

const runExecuteScript = async (tabId, trigger) => {
  const perm = await hasOrigin();
  try {
    const results = await api.scripting.executeScript({ target: { tabId }, world: "MAIN", func: probeInPage });
    return ship(note("executeScript", { trigger, tabId, originGranted: perm, result: results?.[0]?.result ?? results }));
  } catch (e) {
    return ship(note("executeScript-error", { trigger, tabId, originGranted: perm, error: String(e) }));
  }
};

(async () => {
  ship(note("background-start", { ua: navigator.userAgent, originGranted: await hasOrigin() }));
})();

api.permissions?.onAdded?.addListener(p => ship(note("permissions.onAdded", { p })));
api.permissions?.onRemoved?.addListener(p => ship(note("permissions.onRemoved", { p })));

api.tabs?.onUpdated?.addListener((tabId, info, tab) => {
  if (info.status !== "complete" || !tab?.url?.startsWith("https://pokerogue.net")) return;
  setTimeout(() => runExecuteScript(tabId, "tabs.onUpdated+8s"), 8000);
});

api.action?.onClicked?.addListener(tab => runExecuteScript(tab.id, "action.onClicked"));

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const entry = note("content:" + msg.kind, { tabId: sender.tab?.id, url: msg.url, originGranted: await hasOrigin(), payload: msg.payload });
    sendResponse({ loopback: await ship(entry) });
  })();
  return true;
});
