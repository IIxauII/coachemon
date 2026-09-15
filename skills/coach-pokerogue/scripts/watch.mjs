// Always-on coach feed for Claude's Monitor tool: prints one stdout line per new
// battle (wave or enemy party changed), and one per distinct read error. Also
// keeps the HUD overlay alive, re-injecting it whenever the page has lost it.
// Read-only, like read.sh.
// Usage: node watch.mjs <chrome|orion> [--no-hud]
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const [browser, flag] = process.argv.slice(2);
if (!["chrome", "orion"].includes(browser)) {
  console.error("usage: node watch.mjs <chrome|orion> [--no-hud]");
  process.exit(2);
}
const withHud = flag !== "--no-hud";
const readSh = fileURLToPath(new URL("./read.sh", import.meta.url));
const read = async mode => JSON.parse((await run(readSh, [browser, mode])).stdout);

let lastBattle = null;
let lastError = null;
for (;;) {
  try {
    const snap = await read("battle");
    if (snap.error) throw new Error(snap.error);
    lastError = null;
    if (withHud && !snap.hudActive) await read("hud");
    const live = snap.enemy.some(e => !e.hp.startsWith("0/"));
    const key = live && snap.wave != null ? `${snap.wave}|${snap.enemy.map(e => e.name).join(",")}` : null;
    if (key && key !== lastBattle) {
      console.log(`NEW BATTLE ${JSON.stringify(snap)}`);
      lastBattle = key;
    }
  } catch (e) {
    const msg = String(e.message ?? e).split("\n")[0];
    if (msg !== lastError) console.log(`COACH ERROR ${msg}`);
    lastError = msg;
  }
  await new Promise(r => setTimeout(r, 2000));
}
