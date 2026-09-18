/**
 * Evaluate a JS body inside the game (after the scene locator) against the
 * attached tab, without going through the server. A probe for development.
 *
 *   node scripts/eval.ts 'return { biome: scene.arena.biomeType, wave: scene.currentBattle.waveIndex }'
 *
 * `L`, `scene`, `ui`, `game` are in scope, as in the handlers under src/page/.
 *
 * With `COACHEMON_TRANSPORT=hub` it goes as the dev table's `eval` command instead (§10.6), to the dev hub's port when
 * `COACHEMON_DEV=1` (§7.2). Only a dev build of the extension registers the command; a store build answers
 * `unknown-command`, which is the whole point of the flavours (§5.4).
 */
import { CdpSession, isThrown } from "../src/cdp/session.ts";
import { HubClient } from "../src/hub/client.ts";
import { hubPort, usesHub } from "../src/hub/link.ts";
import { locate } from "../src/page/locate.ts";
import { PLUGIN_VERSION } from "../src/plugin-version.ts";

const body = process.argv[2] ?? "return { mode: ui.mode }";

if (usesHub()) {
  const client = new HubClient({ port: hubPort(), version: PLUGIN_VERSION });
  const r = await client.send("eval", { source: body });
  client.close();
  if (r.ok) console.log(JSON.stringify(r.result, null, 1));
  else {
    console.error(`${r.code}: ${r.message}`);
    process.exitCode = 1;
  }
} else {
  const session = new CdpSession();
  await session.ensure();
  const r = await session.evaluate<unknown>(`((locate) => { const L = locate(); if (!L.ready) return L; const { game, scene, ui } = L;\n${body}\n})(${locate})`);
  console.log(isThrown(r) ? `THREW: ${r.__throw}` : JSON.stringify(r, null, 1));
  session.detach();
}
