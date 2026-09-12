// PROTOTYPE — throwaway. One-shot read: predicate + reader + snapshot.
import { Cdp, nameOf } from './lib.mjs';
import { PREDICATE, READER, SNAPSHOT } from './game.mjs';

const cdp = await new Cdp().connect();
const p = await cdp.evalIn(PREDICATE);
const r = await cdp.evalIn(READER);
const s = await cdp.evalIn(SNAPSHOT);
console.log('mode      :', p.mode, nameOf(p.mode));
console.log('predicate :', JSON.stringify(p));
console.log('reader    :', JSON.stringify(r, null, 1));
console.log('snapshot  :', JSON.stringify(s, null, 1));
console.log('cdp       :', JSON.stringify(cdp.stats()));
cdp.ws.close();
