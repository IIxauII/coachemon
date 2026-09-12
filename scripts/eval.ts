/**
 * Evaluate a JS body inside the game (after the scene locator) against the
 * attached tab, without going through the server. A probe for development.
 *
 *   node scripts/eval.ts 'return { biome: scene.arena.biomeType, wave: scene.currentBattle.waveIndex }'
 *
 * `L`, `scene`, `ui`, `game` are in scope, as in src/game/js.ts.
 */
import { CdpSession, inGame, isThrown } from "../src/cdp/session.ts";

const body = process.argv[2] ?? "return { mode: ui.mode }";
const session = new CdpSession();
await session.ensure();
const r = await session.evaluate<unknown>(inGame(`const L = __locate(); if (!L.ready) return { ready: false, why: L.why }; const { game, scene, ui } = L;\n${body}`));
console.log(isThrown(r) ? `THREW: ${r.__throw}` : JSON.stringify(r, null, 1));
session.detach();
