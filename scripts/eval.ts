/**
 * Runs a JS body in the game, with `L`, `scene`, `ui` and `game` in scope, without going through the server. Under the
 * hub it is the dev table's `eval` command (extension-distribution.md §10.6), which a store build answers
 * `unknown-command` (§5.4).
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
