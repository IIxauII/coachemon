import type { Located } from "./locate.ts";

export type SnapshotDetail = "lean" | "party" | "items" | "full";

/**
 * `get_state` (#7 §6.2). Every field inside its own guard; `detail` widens it. Self-contained (§10.5).
 *
 * `full` adds the coach's battle fields to every party **and** enemy member — the ones `probe.js` read for the coach
 * skill (§11.4) — so a coach reading through the MCP server sees what `read.sh battle` showed it. Its `stats` are the
 * named `getStat` six; `party`'s stay the raw array they have always been.
 */
export function snapshot(L: Located, args: { detail: SnapshotDetail }): Record<string, unknown> {
  const __try = (f: () => any) => { try { return f(); } catch (e) { return null; } };
  const withParty = args.detail === "party" || args.detail === "full";
  const withItems = args.detail === "items" || args.detail === "full";
  // The coach's fields ride on `full` alone: they are several game calls per mon, on both sides of the field.
  const withCoach = args.detail === "full";
  const { scene, ui } = L;
  const b = scene.currentBattle || null;
  const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
  const move = (m: any) => m ? __try(() => {
    const mv = m.getMove ? m.getMove() : null;
    return { name: m.getName(), pp: m.getMovePp() - m.ppUsed, maxPp: m.getMovePp(), power: mv ? mv.power : null, category: mv ? mv.category : null, type: mv ? mv.type : null, accuracy: mv ? mv.accuracy : null };
  }) : null;
  const mon = (p: any, deep: boolean, coach: boolean) => p ? {
    name: __try(() => p.name), species: __try(() => p.species.name), level: __try(() => p.level),
    hp: __try(() => p.hp), maxHp: __try(() => p.getMaxHp()),
    status: __try(() => p.status ? p.status.effect : 0),
    fainted: __try(() => p.isFainted()),
    active: __try(() => p.isActive(true)),
    moves: deep || coach ? __try(() => p.getMoveset().map(move)) : undefined,
    types: deep || coach ? __try(() => p.getTypes().slice()) : undefined,
    ability: deep || coach ? __try(() => p.getAbility().name) : undefined,
    nature: deep ? __try(() => p.nature) : undefined,
    ivs: deep ? __try(() => p.ivs.slice()) : undefined,
    stats: coach ? __try(() => Object.fromEntries(STATS.map((k, i) => [k, p.getStat(i)]))) : deep ? __try(() => p.stats.slice()) : undefined,
    passive: coach ? __try(() => p.hasPassive() ? p.getPassiveAbility().name : null) : undefined,
    statStages: coach ? __try(() => p.summonData.statStages.slice()) : undefined,
    onField: coach ? __try(() => p.isOnField()) : undefined,
    boss: coach ? __try(() => p.isBoss()) : undefined,
    // HP bars still standing out of the boss's total (bossSegmentIndex counts down to 0 on the last bar).
    bossBars: coach ? __try(() => p.isBoss() && p.bossSegments > 1 ? { left: (p.bossSegmentIndex ?? p.bossSegments - 1) + 1, of: p.bossSegments } : null) : undefined,
    held: coach ? __try(() => p.getHeldItems().map((m: any) => `${m.type.name} x${m.stackCount}`)) : undefined,
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
    active: __try(() => { const a = scene.getPlayerField()[fieldIndex]; const m = mon(a, false, false); if (m) m.moves = __try(() => a.getMoveset().map(move)); return m; }),
    enemy: __try(() => (b ? b.enemyParty : []).map((p: any) => mon(p, false, withCoach))),
    party: __try(() => scene.getPlayerParty().map((p: any) => mon(p, withParty, withCoach))),
    mode: ui.mode,
  };
  if (withCoach) out.trainer = __try(() => b && b.trainer ? b.trainer.getName() : null);
  if (withItems) {
    // The party's own modifiers and the held ones together: `held` says which is which, and a mon's own `held` names
    // what it is holding (§11.4).
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
