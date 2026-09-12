// PROTOTYPE — press ACTION until ui.mode reaches the target, logging every
// screen crossed (tutorials included). Used to walk EncounterPhase dialogue
// down to the first COMMAND prompt.
//   node advance.mjs <targetMode> [maxPresses]
import { connect, readState, settle, press, fmt, Button } from './lib.mjs';

const target = Number(process.argv[2] ?? 2);
const max = Number(process.argv[3] ?? 40);

const cdp = await connect();
let s = await readState(cdp);
console.log('start:', `mode=${s.mode} ${s.handler}`);
let n = 0;
const seen = [];
while (s.mode !== target && n < max) {
  n++;
  const accepted = await press(cdp, Button.ACTION);
  await settle(cdp);
  s = await readState(cdp);
  const tag = `${s.mode}/${s.domUiMode}${s.tutorialActive ? ' TUTORIAL' : ''}`;
  seen.push(tag);
  console.log(`  #${n} ACTION accepted=${accepted} -> ${tag}${s.text ? '  text=' + JSON.stringify(s.text.slice(0, 70)) : ''}`);
}
console.log(`\n${n} ACTION presses; ${s.mode === target ? 'REACHED' : 'DID NOT REACH'} mode ${target}`);
console.log(fmt(s));
cdp.close();
