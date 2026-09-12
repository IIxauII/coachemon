// PROTOTYPE — throwaway. #23: does a fix actually unfreeze #19's mechanism? Replays
// setModeInternal's fade chain (fadeOut(250) -> time.delayedCall(100) -> fadeIn(250)) with no mode
// change and no button, while the window is minimized, and times how long overlayActive stays set.
//   node fade.mjs --emulate on|off [--hold 10000]
//   node fade.mjs --lifetime        emulation set on one CDP session, that session closed, measured on another
//   node fade.mjs --long 120000     emulation on, minimized, frame delta sampled every 10 s
//   node fade.mjs --watch 120000 [--emulate on|off]   window untouched; the dev locks the screen
import { appendFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes(k);
const HOLD = Number(arg('--hold', 10000));
const LOG = './fade.jsonl';
const sleep = n => new Promise(r => setTimeout(r, n));

class Ws {
  async open(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map();
    this.ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
    await new Promise(r => this.ws.addEventListener('open', r)); return this;
  }
  send(method, params = {}) { return new Promise((res, rej) => { const n = ++this.id; this.pending.set(n, { res, rej }); this.ws.send(JSON.stringify({ id: n, method, params })); }); }
  async ev(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; }
  close() { this.ws.close(); }
}
const version = await (await fetch('http://127.0.0.1:9222/json/version')).json();
const pageT = (await (await fetch('http://127.0.0.1:9222/json/list')).json()).find(t => t.type === 'page' && t.url.includes('pokerogue.net'));
const browser = await new Ws().open(version.webSocketDebuggerUrl);
const openPage = () => new Ws().open(pageT.webSocketDebuggerUrl);
const { windowId } = await browser.send('Browser.getWindowForTarget', { targetId: pageT.id });
const setState = s => browser.send('Browser.setWindowBounds', { windowId, bounds: { windowState: s } });

const G = `var P=globalThis.Phaser, pool=P.Display.Canvas.CanvasPool.pool, g=null;
  for (var i=0;i<pool.length;i++){ var p=pool[i]&&pool[i].parent; if (p&&p.game&&p.game.scene){ g=p.game; break; } }
  var s=g.scene.getScene('battle'), ui=s.ui;`;
const READ = `(function(){ ${G} return { frame: g.loop.frame, oa: ui.overlayActive === true, mode: ui.mode, vis: document.visibilityState, t: performance.now() }; })()`;
const row = r => { console.log(JSON.stringify(r)); appendFileSync(LOG, JSON.stringify(r) + '\n'); };

if (has('--lifetime')) {
  const a = await openPage();
  await a.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  a.close(); await sleep(500);
  const b = await openPage();
  await setState('minimized'); await sleep(1500);
  const x = await b.ev(READ); await sleep(5000); const y = await b.ev(READ);
  await setState('normal');
  row({ test: 'lifetime', note: 'emulation set on a closed session', vis: y.vis, fps: +((y.frame - x.frame) / ((y.t - x.t) / 1000)).toFixed(1) });
  b.close(); browser.close(); process.exit(0);
}

const page = await openPage();
// Human-driven: emulation on, window untouched, fps logged every 5 s while the dev locks the screen
// or lets the display sleep.
if (has('--watch')) {
  const W = Number(arg('--watch', 120000));
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: arg('--emulate', 'on') === 'on' });
  let prev = await page.ev(READ); const t0 = Date.now(); const samples = [];
  while (Date.now() - t0 < W) {
    await sleep(5000); const cur = await page.ev(READ);
    const s = { at: Math.round((Date.now() - t0) / 1000), vis: cur.vis, fps: +((cur.frame - prev.frame) / ((cur.t - prev.t) / 1000)).toFixed(1) };
    console.log(JSON.stringify(s)); samples.push(s); prev = cur;
  }
  row({ test: 'watch', emulate: arg('--emulate', 'on') === 'on', samples });
  page.close(); browser.close(); process.exit(0);
}
if (has('--long')) {
  const LONG = Number(arg('--long', 120000));
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await setState('minimized'); await sleep(1500);
  let prev = await page.ev(READ); const t0 = Date.now(); const rates = [];
  while (Date.now() - t0 < LONG) { await sleep(10000); const cur = await page.ev(READ); rates.push(+((cur.frame - prev.frame) / ((cur.t - prev.t) / 1000)).toFixed(1)); prev = cur; }
  await setState('normal');
  row({ test: 'long', holdMs: LONG, vis: prev.vis, fpsEvery10s: rates });
  page.close(); browser.close(); process.exit(0);
}

const EMU = arg('--emulate', 'off') === 'on';
const pre = await page.ev(READ);
if (pre.oa) throw new Error('overlay already active');
await page.send('Emulation.setFocusEmulationEnabled', { enabled: EMU });
await setState('minimized'); await sleep(1500);
const hid = await page.ev(READ);
const t0 = Date.now();
await page.ev(`(function(){ ${G} ui.fadeOut(250).then(function(){ s.time.delayedCall(100, function(){ ui.fadeIn(250); }); }); })()`);
let cleared = null, last;
while (Date.now() - t0 < HOLD) { last = await page.ev(READ); if (!last.oa) { cleared = Date.now() - t0; break; } await sleep(50); }
const heldAtRestoreMs = cleared == null ? Date.now() - t0 : null;
await setState('normal');
let clearedAfterRestore = null;
if (cleared == null) { const tr = Date.now(); for (;;) { const r = await page.ev(READ); if (!r.oa) { clearedAfterRestore = Date.now() - tr; break; } if (Date.now() - tr > 20000) break; await sleep(50); } }
await page.send('Emulation.setFocusEmulationEnabled', { enabled: false });
row({ test: 'fade', emulate: EMU, visWhileMinimized: hid.vis, mode: pre.mode, overlayClearedMs: cleared, heldAtRestoreMs,
      framesWhileHeld: last.frame - hid.frame, clearedAfterRestoreMs: clearedAfterRestore });
page.close(); browser.close();
