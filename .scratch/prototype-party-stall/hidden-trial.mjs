// PROTOTYPE — throwaway. #19: one PARTY<->MODIFIER_SELECT transition pressed while the window is
// hidden, then no input at all. Holds hidden for --hold ms, restores, waits for a real settle.
//   node hidden-trial.mjs --btn CANCEL|ACTION [--hold 30000] [--expect-mode 8]
import { Cdp, B, log } from './lib.mjs';
import { PROBE } from './probe.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const BTN = arg('--btn', 'CANCEL');
const HOLD = Number(arg('--hold', 30000));
const EXPECT = Number(arg('--expect-mode', 8));
const LOGFILE = './hidden-trial.jsonl';
const sleep = n => new Promise(r => setTimeout(r, n));

const cdp = await new Cdp().connect();
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find(t => t.type === 'page' && t.url.includes('pokerogue.net'));
const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: page.id });

const pre = await cdp.evalIn(PROBE);
if (pre.base.mode !== EXPECT || !pre.base.settled) throw new Error('not at expected settled screen: ' + JSON.stringify(pre.base));
log(LOGFILE, { kind: 'start', btn: BTN, hold: HOLD, pre });

await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
await sleep(1500);
const hid = await cdp.evalIn(PROBE);
console.log('hidden? ', hid.vis, 'frame', hid.frame);

const tPress = Date.now();
const res = await cdp.evalIn(`return { accepted: __locate().scene.ui.processInput(${B[BTN]}) === true };`);
console.log('pressed', BTN, 'returned', res.accepted);
log(LOGFILE, { kind: 'press', btn: BTN, returned: res.accepted, vis: hid.vis });

let last = null, restoredAt = null, agree = 0;
const summary = { btn: BTN, holdMs: HOLD };
for (;;) {
  const p = await cdp.evalIn(PROBE);
  const el = Date.now() - tPress;
  const sig = [p.vis, p.oa, p.base.reason, p.base.fp, JSON.stringify(p.twOv), p.timers].join('~');
  if (sig !== last) {
    const row = { el, vis: p.vis, frame: p.frame, oa: p.oa, ovAlpha: p.ovAlpha, reason: p.base.reason, mode: p.base.mode, twOv: p.twOv, timers: p.timers };
    console.log(JSON.stringify(row)); log(LOGFILE, { kind: 'watch', ...row, p }); last = sig;
  }
  if (restoredAt == null && el >= HOLD) {
    summary.atRestore = { oa: p.oa, reason: p.base.reason, frame: p.frame, framesSincePress: p.frame - hid.frame, fp: p.base.fp };
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    restoredAt = Date.now();
    console.log('--- restored at', el);
  }
  agree = p.base.settled ? agree + 1 : 0;
  if (restoredAt != null && agree >= 3 && p.base.fp !== pre.base.fp) {
    summary.settleAfterRestoreMs = Date.now() - restoredAt;
    summary.totalMs = el;
    summary.final = { mode: p.base.mode, reason: p.base.reason };
    break;
  }
  if (restoredAt != null && Date.now() - restoredAt > 60000) { summary.error = 'no settle 60 s after restore'; break; }
  await sleep(100);
}
log(LOGFILE, { kind: 'summary', ...summary });
console.log(JSON.stringify(summary, null, 1));
cdp.ws.close();
