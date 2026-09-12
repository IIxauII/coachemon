// PROTOTYPE — throwaway. Press a sequence of buttons, settling and logging
// full state after each one, so every press is attributable.
//   node step.mjs ACTION DOWN DOWN ACTION
//   node step.mjs --raw ACTION        (dispatch a real key event instead)
// Every press is counted; the total is the press budget the ticket asks for.
import { connect, readState, settle, press, rawPress, fmt, Button } from './lib.mjs';

const argv = process.argv.slice(2);
const raw = argv.includes('--raw');
const names = argv.filter(a => a !== '--raw');

const cdp = await connect();
console.log('=== before ===');
console.log(fmt(await readState(cdp)));

let n = 0;
for (const name of names) {
  n++;
  if (!(name in Button)) throw new Error('unknown button: ' + name);
  const t0 = Date.now();
  const accepted = raw ? (await rawPress(cdp, name), '(raw)') : await press(cdp, Button[name]);
  const st = await settle(cdp);
  const s = await readState(cdp);
  console.log(`\n=== press #${n}: ${name}  accepted=${accepted}  settle=${st.settled ? st.ms + 'ms' : 'FAILED ' + st.why} (total ${Date.now() - t0}ms) ===`);
  console.log(fmt(s));
}
console.log(`\n--- ${n} presses sent ---`);
cdp.close();
