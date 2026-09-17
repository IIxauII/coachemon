/**
 * Evaluate a JS body inside the game (after the scene locator) against the
 * attached tab, without going through the server. A probe for development.
 *
 *   node scripts/eval.ts 'return { biome: scene.arena.biomeType, wave: scene.currentBattle.waveIndex }'
 *
 * `L`, `scene`, `ui`, `game` are in scope, as in the handlers under src/page/.
 */
import { CdpSession, isThrown } from "../src/cdp/session.ts";
import { locate } from "../src/page/locate.ts";

const body = process.argv[2] ?? "return { mode: ui.mode }";
const session = new CdpSession();
await session.ensure();
const r = await session.evaluate<unknown>(`((locate) => { const L = locate(); if (!L.ready) return L; const { game, scene, ui } = L;\n${body}\n})(${locate})`);
console.log(isThrown(r) ? `THREW: ${r.__throw}` : JSON.stringify(r, null, 1));
session.detach();
