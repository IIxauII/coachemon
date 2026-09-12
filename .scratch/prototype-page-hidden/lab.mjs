// PROTOTYPE — throwaway. Answers pokerogue-mcp #23 ("Keeping the game loop running when the page
// is hidden"). No game input at all: it only moves/minimizes/covers the Chrome window and counts
// frames. Judge by Phaser loop-frame delta, never by visibilityState.
//   node lab.mjs --label baseline [--hold 5000] [--only minimized,occluded]
import { appendFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const LABEL = arg('--label', 'unlabelled');
const HOLD = Number(arg('--hold', 5000));
const ONLY = arg('--only', null)?.split(',');
const PORT = Number(arg('--port', 9222));
const LOG = './lab.jsonl';
const sleep = n => new Promise(r => setTimeout(r, n));

class Ws {
  async open(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map();
    this.ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data); const p = this.pending.get(m.id);
      if (p) { this.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    });
    await new Promise(r => this.ws.addEventListener('open', r)); return this;
  }
  send(method, params = {}) { return new Promise((res, rej) => { const n = ++this.id; this.pending.set(n, { res, rej }); this.ws.send(JSON.stringify({ id: n, method, params })); }); }
  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
}

const base = `http://127.0.0.1:${PORT}`;
const version = await (await fetch(`${base}/json/version`)).json();
const targets = await (await fetch(`${base}/json/list`)).json();
const pageT = targets.find(t => t.type === 'page' && t.url.includes('pokerogue.net'));
if (!pageT) throw new Error('no pokerogue tab');
const page = await new Ws().open(pageT.webSocketDebuggerUrl);
const browser = await new Ws().open(version.webSocketDebuggerUrl);

// Counters that live in the page: raw rAF ticks and a 50 ms setInterval, installed once.
await page.ev(`(function(){ if (window.__lab) return;
  window.__lab = { raf: 0, tick: 0 };
  (function f(){ window.__lab.raf++; requestAnimationFrame(f); })();
  setInterval(function(){ window.__lab.tick++; }, 50);
})()`);

const LOCATE = `var P=globalThis.Phaser, pool=P&&P.Display&&P.Display.Canvas&&P.Display.Canvas.CanvasPool&&P.Display.Canvas.CanvasPool.pool, g=null;
  if (pool) for (var i=0;i<pool.length;i++){ var p=pool[i]&&pool[i].parent; if (p&&p.game&&p.game.scene){ g=p.game; break; } }`;
const SAMPLE = `(function(){ ${LOCATE}
  return { frame: g ? g.loop.frame : null, running: g ? g.loop.running : null, vis: document.visibilityState,
           focus: document.hasFocus(), raf: window.__lab.raf, tick: window.__lab.tick, t: performance.now() }; })()`;

const { windowId } = await browser.send('Browser.getWindowForTarget', { targetId: pageT.id });
const bounds = async () => (await browser.send('Browser.getWindowBounds', { windowId })).bounds;
const setBounds = b => browser.send('Browser.setWindowBounds', { windowId, bounds: b });
const normal = await bounds();
if (normal.windowState !== 'normal') { await setBounds({ windowState: 'normal' }); await sleep(800); }
const home = await bounds();

let extra = null; // a second target used to cover or background the game tab
const conditions = {
  front: { apply: async () => {}, revert: async () => {} },
  minimized: { apply: () => setBounds({ windowState: 'minimized' }), revert: () => setBounds({ windowState: 'normal' }) },
  // A second Chrome window placed exactly over the game window. macOS occlusion is per NSWindow.
  occluded: {
    apply: async () => {
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true });
      extra = targetId;
      const w = await browser.send('Browser.getWindowForTarget', { targetId });
      await browser.send('Browser.setWindowBounds', { windowId: w.windowId, bounds: { left: home.left, top: home.top, width: home.width, height: home.height } });
      await browser.send('Target.activateTarget', { targetId });
    },
    revert: async () => { await browser.send('Target.closeTarget', { targetId: extra }); extra = null; await page.send('Page.bringToFront'); },
  },
  // Another tab in the same window selected over the game tab.
  background_tab: {
    apply: async () => {
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: false, background: false });
      extra = targetId; await browser.send('Target.activateTarget', { targetId });
    },
    revert: async () => { await browser.send('Target.closeTarget', { targetId: extra }); extra = null; await page.send('Page.bringToFront'); },
  },
  offscreen: { apply: () => setBounds({ left: -20000, top: -20000 }), revert: () => setBounds({ left: home.left, top: home.top }) },
};

// Mitigations applied after the condition, from the page session.
const mitigations = {
  none: { apply: async () => {}, revert: async () => {} },
  focus_emulation: { apply: () => page.send('Emulation.setFocusEmulationEnabled', { enabled: true }), revert: () => page.send('Emulation.setFocusEmulationEnabled', { enabled: false }) },
  lifecycle_active: { apply: () => page.send('Page.setWebLifecycleState', { state: 'active' }), revert: async () => {} },
  bring_to_front: { apply: () => page.send('Page.bringToFront'), revert: async () => {} },
};

const measure = async () => {
  const a = await page.ev(SAMPLE); await sleep(HOLD); const b = await page.ev(SAMPLE);
  const s = (b.t - a.t) / 1000;
  return { vis: b.vis, focus: b.focus, running: b.running, fps: +((b.frame - a.frame) / s).toFixed(1),
           rafHz: +((b.raf - a.raf) / s).toFixed(1), tickHz: +((b.tick - a.tick) / s).toFixed(1) };
};

console.log(LABEL, version.Browser, version['User-Agent'].includes('Headless') ? 'HEADLESS' : 'headed');
for (const [cName, c] of Object.entries(conditions)) {
  if (ONLY && !ONLY.includes(cName)) continue;
  for (const [mName, m] of Object.entries(mitigations)) {
    if (cName === 'front' && mName !== 'none') continue;
    let row;
    try {
      await c.apply(); await sleep(1500); await m.apply(); await sleep(500);
      const r = await measure();
      const after = await bounds();
      row = { label: LABEL, cond: cName, mit: mName, ...r, windowStateAfter: after.windowState };
    } catch (e) { row = { label: LABEL, cond: cName, mit: mName, error: String(e.message).slice(0, 200) }; }
    try { await m.revert(); await c.revert(); } catch (e) { row.revertError = String(e.message).slice(0, 200); }
    await sleep(1500);
    const rec = await page.ev(SAMPLE);
    row.recoveredVis = rec.vis;
    console.log(JSON.stringify(row)); appendFileSync(LOG, JSON.stringify(row) + '\n');
  }
}

// Detection cost, N=50 each: the bare visibility read vs a locator + frame read.
const cost = async (expr) => { const ts = []; for (let i = 0; i < 50; i++) { const t = process.hrtime.bigint(); await page.ev(expr); ts.push(Number(process.hrtime.bigint() - t) / 1e6); } ts.sort((x, y) => x - y); return { p50: +ts[25].toFixed(2), max: +ts[49].toFixed(2) }; };
const costRow = { label: LABEL, kind: 'cost',
  vis: await cost(`document.visibilityState`),
  frame: await cost(`(function(){ ${LOCATE} return [document.visibilityState, g && g.loop.frame]; })()`) };
console.log(JSON.stringify(costRow)); appendFileSync(LOG, JSON.stringify(costRow) + '\n');
page.ws.close(); browser.ws.close();
