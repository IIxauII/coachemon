// PROTOTYPE (#174) — background. Holds one WebSocket to the lab, keeps itself up with a 20 s text frame, and
// answers two kinds of op: window ops it performs itself (hide the pokerogue.net tab behind another tab, minimise
// its window, restore) and page ops it relays to the tab's MAIN world. CONFIG is prepended by build.mjs.
const api = globalThis.browser ?? globalThis.chrome;
const URL_BASE = "ws://127.0.0.1:47174/ws";
let blankTabId = null;

const gameTab = async () => {
  const [tab] = await api.tabs.query({ url: "https://pokerogue.net/*" });
  if (!tab) throw new Error("no pokerogue.net tab");
  return tab;
};

const windowOps = {
  place: async ({ left, top, width, height }) => {
    const tab = await gameTab();
    await api.windows.update(tab.windowId, { state: "normal" });
    const w = await api.windows.update(tab.windowId, { left, top, width, height, focused: true });
    return { windowId: w.id, left: w.left, top: w.top, width: w.width, height: w.height, state: w.state };
  },
  bounds: async () => {
    const tab = await gameTab();
    const w = await api.windows.get(tab.windowId);
    return { left: w.left, top: w.top, width: w.width, height: w.height, state: w.state, focused: w.focused, tabActive: tab.active };
  },
  hide: async ({ state }) => {
    const tab = await gameTab();
    if (state === "bgtab") {
      const t = await api.tabs.create({ windowId: tab.windowId, url: "about:blank", active: true });
      blankTabId = t.id;
      return { blankTabId };
    }
    if (state === "minimize") {
      const w = await api.windows.update(tab.windowId, { state: "minimized" });
      return { state: w.state };
    }
    throw new Error("unknown state " + state);
  },
  show: async () => {
    const tab = await gameTab();
    if (blankTabId !== null) { await api.tabs.remove(blankTabId).catch(() => {}); blankTabId = null; }
    await api.tabs.update(tab.id, { active: true });
    const w = await api.windows.update(tab.windowId, { state: "normal", focused: true });
    return { state: w.state };
  },
};

const handle = async msg => {
  if (windowOps[msg.op]) return windowOps[msg.op](msg.args ?? {});
  const tab = await gameTab();
  const reply = await Promise.race([
    api.tabs.sendMessage(tab.id, { kind: "page", id: msg.id, op: msg.op, args: msg.args }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("tab timeout 5s")), 5000)),
  ]);
  if (reply?.error) throw new Error(reply.error);
  return reply.ok;
};

let backoff = 500;
const connect = () => {
  const ws = new WebSocket(`${URL_BASE}?tag=${encodeURIComponent(CONFIG.tag)}`);
  let ka;
  ws.onopen = () => {
    backoff = 500;
    ws.send(JSON.stringify({ kind: "hello", tag: CONFIG.tag, ua: navigator.userAgent }));
    ka = setInterval(() => ws.send(JSON.stringify({ kind: "keepalive" })), 20000);
  };
  ws.onmessage = async e => {
    const msg = JSON.parse(e.data);
    const bgAt = Date.now();
    try { ws.send(JSON.stringify({ kind: "reply", id: msg.id, ok: await handle(msg), bgAt })); }
    catch (err) { ws.send(JSON.stringify({ kind: "reply", id: msg.id, error: String(err), bgAt })); }
  };
  ws.onclose = () => { clearInterval(ka); setTimeout(connect, backoff = Math.min(backoff * 2, 5000)); };
};

api.runtime.onMessage.addListener((_msg, _sender, sendResponse) => { sendResponse({ tag: CONFIG.tag }); });
connect();
