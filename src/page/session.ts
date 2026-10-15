import type { Located } from "./locate.ts";

export type SessionResult =
  | { ok: true; wave: number; battleSeed: string; stored: string[]; export: Record<string, unknown> }
  | { ok: false; why: "no-battle" };

/**
 * `stored`: every copy of the wave-start save under the live slot, as the game stores them (game-code.md §29). Never
 * `gameData.getSession`, which can fetch and write (§29). Self-contained (extension-distribution.md §10.5).
 */
export function session(L: Located, _args: Record<string, never>): SessionResult {
  const battle = L.scene.currentBattle;
  if (!battle) return { ok: false, why: "no-battle" };
  const prefix = "sessionData" + (L.scene.sessionSlotId || "") + "_";
  const ls = (globalThis as any).localStorage;
  const stored: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    const v = typeof k === "string" && k.startsWith(prefix) ? ls.getItem(k) : null;
    if (v) stored.push(v);
  }
  return { ok: true, wave: battle.waveIndex, battleSeed: battle.battleSeed, stored, export: L.scene.gameData.getSessionSaveData() };
}
