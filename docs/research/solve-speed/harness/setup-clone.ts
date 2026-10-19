// Sets up the player's git-free clone with the plugin's own `setUpClone`, as a player's first solve would.
// usage: node setup-clone.ts <home>
import { setUpClone } from "../../../../src/solver/clone.ts";

const home = process.argv[2];
const started = Date.now();
const result = await setUpClone(home, {
  signal: new AbortController().signal,
  progress: line => console.log(`${((Date.now() - started) / 1000).toFixed(1)} s ${line}`),
});
console.log(JSON.stringify({ ...result, seconds: (Date.now() - started) / 1000 }));
