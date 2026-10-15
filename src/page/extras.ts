import type { ArenaTagSide } from "../enums/generated.ts";
import type { Located } from "./locate.ts";

export type FaintEntry = { id: number; turn: number };

export type ArenaTagEntry = { tagType: string; side: ArenaTagSide };

export type MonExtras = {
  id: number | null;
  toxicTurnCount: number | null;
  tempSummonData: Record<string, number> | null;
  waveData: { endured: boolean; abilityRevealed: boolean; abilitiesApplied: number[] } | null;
};

/** `summonData` is null off the field. */
export type FoeExtras = MonExtras & { initialTeamIndex: number | null; bossSegmentIndex: number | null; onField: boolean | null; summonData: Record<string, unknown> | null };

export type ExtrasResult =
  | {
      ok: true;
      wave: number | null;
      battleSeed: string | null;
      turn: number | null;
      rndState: string | null;
      battleSeedState: string | null;
      enemySwitchCounter: number | null;
      lastMove: number | null;
      enemyFaints: number | null;
      playerFaintsHistory: FaintEntry[] | null;
      enemyFaintsHistory: FaintEntry[] | null;
      arenaTags: ArenaTagEntry[] | null;
      foes: FoeExtras[] | null;
      party: MonExtras[] | null;
      unread: string[];
    }
  | { ok: false; why: "no-battle" };

/**
 * The live fight's state that the session save lacks or a reload resets (game-code.md §28). A field the page could not
 * read is null and named in `unread` by its path in this result; every other null is the game's own. Self-contained
 * (extension-distribution.md §10.5).
 */
export function extras(L: Located, _args: Record<string, never>): ExtrasResult {
  const unread: string[] = [];
  const read = <T>(path: string, f: () => T): T | null => {
    try { return f() ?? null; } catch (e) { unread.push(path); return null; }
  };
  const b = L.scene.currentBattle;
  if (!b) return { ok: false, why: "no-battle" };
  // `pokemon` is the live mon, whose container is circular: only its id crosses (game-code.md §28).
  const faints = (path: string): FaintEntry[] | null => read(path, () => b[path].map((f: any) => ({ id: f.pokemon.id, turn: f.turn })));
  const mon = (path: string, p: any): MonExtras => ({
    id: read(`${path}.id`, () => p.id),
    toxicTurnCount: read(`${path}.toxicTurnCount`, () => (p.status ? p.status.toxicTurnCount : null)),
    tempSummonData: read(`${path}.tempSummonData`, () => ({ ...p.tempSummonData })),
    // `abilitiesApplied` is a Set, which JSON writes as `{}` (game-code.md §28).
    waveData: read(`${path}.waveData`, () => ({ endured: p.waveData.endured, abilityRevealed: p.waveData.abilityRevealed, abilitiesApplied: [...p.waveData.abilitiesApplied] })),
  });
  const foe = (p: any, i: number): FoeExtras => {
    const path = `foes.${i}`;
    const onField = read(`${path}.onField`, () => p.isOnField() === true);
    return {
      ...mon(path, p),
      initialTeamIndex: read(`${path}.initialTeamIndex`, () => p.initialTeamIndex),
      bossSegmentIndex: read(`${path}.bossSegmentIndex`, () => p.bossSegmentIndex),
      onField,
      // Copied as the save copies it, so it is the shape a load reads, less the tags a load drops (game-code.md §28).
      summonData: onField ? read(`${path}.summonData`, () => JSON.parse(JSON.stringify(new p.summonData.constructor(p.summonData)))) : null,
    };
  };
  return {
    ok: true,
    wave: read("wave", () => b.waveIndex),
    battleSeed: read("battleSeed", () => b.battleSeed),
    turn: read("turn", () => b.turn),
    rndState: read("rndState", () => (globalThis as any).Phaser.Math.RND.state()),
    battleSeedState: read("battleSeedState", () => b.battleSeedState),
    enemySwitchCounter: read("enemySwitchCounter", () => b.enemySwitchCounter),
    lastMove: read("lastMove", () => b.lastMove),
    enemyFaints: read("enemyFaints", () => b.enemyFaints),
    playerFaintsHistory: faints("playerFaintsHistory"),
    enemyFaintsHistory: faints("enemyFaintsHistory"),
    // Every tag, saved or not (extension-distribution.md §10.1).
    arenaTags: read("arenaTags", () => L.scene.arena.tags.map((t: any) => ({ tagType: t.tagType, side: t.side }))),
    foes: read("foes", () => b.enemyParty.map(foe)),
    party: read("party", () => L.scene.getPlayerParty().map((p: any, i: number) => mon(`party.${i}`, p))),
    unread,
  };
}
