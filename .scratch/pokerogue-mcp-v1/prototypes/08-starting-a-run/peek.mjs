// PROTOTYPE — read-only. One snapshot of the live tab, no presses.
import { connect, readState, fmt } from './lib.mjs';
const cdp = await connect();
const s = await readState(cdp);
console.log(fmt(s));
console.log('\nraw:', JSON.stringify(s, null, 2));
cdp.close();
