// PROTOTYPE — throwaway. #19: does the Phaser loop (and so ui.overlayActive's fadeIn) stop when
// the window is hidden? No game input. Minimizes the Chrome window over CDP, samples the probe,
// restores.
//   node hidden.mjs [--ms N] [--state minimized|normal]
import { Cdp } from './lib.mjs';
import { PROBE } from './probe.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const HOLD = Number(arg('--ms', 6000));
const sleep = n => new Promise(r => setTimeout(r, n));

const cdp = await new Cdp().connect();
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find(t => t.type === 'page' && t.url.includes('pokerogue.net'));
const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: page.id });

const line = (tag, p) => console.log(tag, JSON.stringify({ vis: p.vis, focus: p.focus, frame: p.frame, loopRunning: p.loopRunning,
  oa: p.oa, reason: p.base.reason, mode: p.base.mode, twOv: p.twOv, timers: p.timers, now: p.now }));

line('before   ', await cdp.evalIn(PROBE));
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
const t0 = Date.now();
while (Date.now() - t0 < HOLD) { await sleep(1000); line(`hidden+${Date.now() - t0}`, await cdp.evalIn(PROBE)); }
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
await sleep(1000);
line('restored ', await cdp.evalIn(PROBE));
cdp.ws.close();
