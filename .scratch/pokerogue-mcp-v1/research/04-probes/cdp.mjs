// Minimal read-only CDP client: Runtime.evaluate against the PokéRogue tab.
// Usage: node cdp.mjs <file-with-js-expression> [--repeat N]
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const repeatIdx = process.argv.indexOf('--repeat');
const repeat = repeatIdx > -1 ? Number(process.argv[repeatIdx + 1]) : 1;
const expression = readFileSync(file, 'utf8');

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find(t => t.type === 'page' && t.url.includes('pokerogue.net'));
if (!page) { console.error('no pokerogue tab'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
});
await new Promise(r => ws.addEventListener('open', r));

const times = [];
let last;
for (let i = 0; i < repeat; i++) {
  const t0 = process.hrtime.bigint();
  last = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, generatePreview: false,
  });
  times.push(Number(process.hrtime.bigint() - t0) / 1e6);
}

if (last.exceptionDetails) {
  console.log('EXCEPTION:', last.exceptionDetails.text, last.exceptionDetails.exception?.description?.split('\n')[0] ?? '');
} else {
  console.log(JSON.stringify(last.result.value, null, 2));
}
if (repeat > 1) {
  const s = [...times].sort((a, b) => a - b);
  const pct = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  console.log(`\n--- timing over ${repeat} evaluates (ms, round-trip incl. CDP transport) ---`);
  console.log(`min ${s[0].toFixed(2)}  p50 ${pct(0.5).toFixed(2)}  p90 ${pct(0.9).toFixed(2)}  max ${s[s.length-1].toFixed(2)}  mean ${(times.reduce((a,b)=>a+b,0)/times.length).toFixed(2)}`);
} else {
  console.log(`\n(single evaluate round-trip: ${times[0].toFixed(2)} ms)`);
}
ws.close();
