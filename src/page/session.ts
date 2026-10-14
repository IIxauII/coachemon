import type { Located } from "./locate.ts";

export type SessionResult =
  | { ok: true; wave: number; battleSeed: string; stored: string[]; export: Record<string, unknown> }
  | { ok: false; why: "no-battle" };

/**
 * `stored` is every copy of the wave-start save under the live slot, still encrypted: the key ends in a username the
 * scene never carries, so each account that played this slot in this browser has one (game-code.md §28). Never
 * `gameData.getSession`: it is async, and with the key missing it fetches the save and writes the key. Self-contained
 * (extension-distribution.md §10.5).
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
