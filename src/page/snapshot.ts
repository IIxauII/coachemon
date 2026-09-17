import type { Located } from "./locate.ts";

export type SnapshotDetail = "lean" | "party" | "items" | "full";

/** `get_state` (#7 §6.2). Every field inside its own guard; `detail` widens it. Self-contained (§10.5). */
export function snapshot(L: Located, args: { detail: SnapshotDetail }): Record<string, unknown> {
  const __try = (f: () => any) => { try { return f(); } catch (e) { return null; } };
  const withParty = args.detail === "party" || args.detail === "full";
  const withItems = args.detail === "items" || args.detail === "full";
  const { scene, ui } = L;
  const b = scene.currentBattle || null;
  const move = (m: any) => m ? __try(() => {
    const mv = m.getMove ? m.getMove() : null;
    return { name: m.getName(), pp: m.getMovePp() - m.ppUsed, maxPp: m.getMovePp(), power: mv ? mv.power : null, category: mv ? mv.category : null, type: mv ? mv.type : null };
  }) : null;
  const mon = (p: any, full: boolean) => p ? {
    name: __try(() => p.name), species: __try(() => p.species.name), level: __try(() => p.level),
    hp: __try(() => p.hp), maxHp: __try(() => p.getMaxHp()),
    status: __try(() => p.status ? p.status.effect : 0),
    fainted: __try(() => p.isFainted()),
    active: __try(() => p.isActive(true)),
    moves: full ? __try(() => p.getMoveset().map(move)) : undefined,
    types: full ? __try(() => p.getTypes().slice()) : undefined,
    ability: full ? __try(() => p.getAbility().name) : undefined,
    nature: full ? __try(() => p.nature) : undefined,
    ivs: full ? __try(() => p.ivs.slice()) : undefined,
    stats: full ? __try(() => p.stats.slice()) : undefined,
  } : null;
  const h = ui.handlers[ui.mode];
  const fieldIndex = h && typeof h.fieldIndex === "number" ? h.fieldIndex : 0;
  const out: Record<string, unknown> = {
    ready: true,
    wave: b ? b.waveIndex : null,
    turn: b ? b.turn : null,
    double: b ? b.double === true : null,
    battleType: b ? __try(() => b.battleType) : null,
    money: __try(() => scene.money),
    biome: __try(() => scene.arena.biomeId ?? scene.arena.biomeType ?? null),
    active: __try(() => { const a = scene.getPlayerField()[fieldIndex]; const m = mon(a, false); if (m) m.moves = __try(() => a.getMoveset().map(move)); return m; }),
    enemy: __try(() => (b ? b.enemyParty : []).map((p: any) => mon(p, false))),
    party: __try(() => scene.getPlayerParty().map((p: any) => mon(p, withParty))),
    mode: ui.mode,
  };
  if (withItems) {
    out.items = __try(() => (scene.modifiers || []).map((m: any) => ({
      name: __try(() => m.type.name), type: __try(() => m.type.id || m.type.identifier || null),
      stack: __try(() => m.stackCount), max: __try(() => m.getMaxStackCount ? m.getMaxStackCount() : null),
      pokemonId: __try(() => m.pokemonId === undefined ? null : m.pokemonId),
      held: __try(() => typeof m.pokemonId === "number"),
    })));
    out.enemyItems = __try(() => (scene.enemyModifiers || []).map((m: any) => ({ name: __try(() => m.type.name), stack: __try(() => m.stackCount) })));
    out.partyIds = __try(() => scene.getPlayerParty().map((p: any) => p.id));
  }
  return out;
}
