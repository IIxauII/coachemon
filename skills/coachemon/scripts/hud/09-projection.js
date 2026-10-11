// The level a party member, or a newcomer, stands at by the time the run reaches the next big fight, and the species
// it stands as there. Nothing here draws, and nothing here is certain: the EXP stream a projection runs over is a
// model, so every answer it gives carries `estimate` (CONTEXT.md, `Level projection`).
import { gameTables } from "./04-game-tables.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// game-less-backed
// `getMaxExpLevel` (game-code.md §15). The game's own call answers for the wave the run stands on; a projection asks
// about a wave ahead of it, and about the waves on the way.
export const levelCapAt = (s, wave) => {
  const r = Math.ceil(Math.max(1, Math.floor(wave) || 1) / 10) * 10;
  const w = s?.gameMode?.isDaily ? r + 30 + Math.floor(r / 5) : r;
  return Math.ceil((1 + w / 2 + (w / 25) ** 2) * 1.2 / 2) * 2 + 2;
};

// Every growth rate is a blend of `level³` (newcomer-mechanics.md §1.3), and the projection runs on that one curve
// for everyone. A member's own `exp` is on its species' curve instead, so reading it in would move the member's
// level before a single wave had been projected.
const expAt = level => level ** 3;
const levelAt = exp => Math.max(1, Math.floor(Math.cbrt(Math.max(0, exp))));

/**
 * What one wave is worth, in EXP, to the mon that fights it alone. The game publishes no such figure — EXP comes off
 * whatever the wave happens to field (game-code.md §17) — so this is calibrated against the level cap: the cap is
 * about the boss level of its decade, which is the level a mon fighting every wave on its own keeps pace with. One
 * wave is then a tenth of the climb the cap makes over the decade ahead.
 */
const waveExp = (s, wave) => Math.max(0, (expAt(levelCapAt(s, wave + 10)) - expAt(levelCapAt(s, wave))) / 10);

const stacksOf = m => tryDo(() => m.getStackCount(), m?.stackCount ?? 1) ?? 1;
const heldStacks = (s, mon, id) => (mon?.id == null ? 0 : (s?.modifiers ?? [])
  .filter(m => m?.pokemonId != null && m.pokemonId === mon.id && m.type?.id === id)
  .reduce((t, m) => t + stacksOf(m), 0));
const classStacks = (s, name) => (s?.modifiers ?? []).filter(m => m?.constructor?.name === name)
  .reduce((t, m) => t + stacksOf(m), 0);

// No line in the game is four evolutions long, and a registry that somehow pointed back at itself cannot spin the
// walk below for longer than that either.
const MAX_STEPS = 4;

/**
 * The species a mon stands as at the level a projection reaches, and the evolutions it passes through on the way.
 * An evolution counts only where the coach can read that it *lands* by then (#567, story 8); otherwise the mon is
 * scored as it is, which is what the walk falls back to.
 *
 * - Its level is above where the mon stands now and at or below the projected level. A mon already past its own
 *   evolution level has not evolved for a reason the coach cannot see, so the projection does not evolve it either.
 *   `evoLevelThreshold` is not read: it raises the bar for a *wild* spawn (`determineEnemySpecies`, game-code.md
 *   §10), never for a member levelling up.
 * - It needs no item. An evolution item applies the moment it is picked up (game-code.md §15), so none is ever held
 *   or in the bag: an item evolution waits on a draw, and luck is not counted.
 * - It carries no `condition`. **This refusal is on purpose**: a condition is read against the mon as it stands now,
 *   while what the projection needs is whether it holds at the fight, which is a different question. So a
 *   conditional line — Golbat's friendship, an Eevee — is scored as it stands even where the condition does hold
 *   today. The evolution's own `validate` is deliberately never called.
 * - The member's evolutions are not paused, which the player may switch off per member.
 *
 * Without the species registry (game-code.md §23) there is no evolved species to score at all, so nothing evolves.
 */
const evolveTo = (x, level) => {
  const own = { species: x?.species ?? null, form: x?.formIndex ?? 0, evolved: [] };
  const reg = tryDo(() => gameTables().species);
  const was = Math.max(1, Math.floor(x?.level ?? 1));
  if (!own.species || x?.pauseEvolutions || level <= was || typeof reg?.getEvolutions !== "function") return own;
  let sp = own.species;
  const evolved = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const lands = (tryDo(() => reg.getEvolutions(sp.speciesId), []) ?? [])
      .filter(e => !e?.item && !e?.condition && typeof e?.level === "number" && e.level > was && e.level <= level);
    // A branching line with no condition on either side is not one the game has today. Were one to appear, the
    // projection refuses it rather than guess which branch the game would take.
    if (lands.length !== 1) break;
    const next = tryDo(() => reg.getSpecies(lands[0].speciesId));
    if (!next) break;
    sp = next;
    evolved.push(sp);
  }
  // The registry names a species, not a form, so an evolved mon is judged on that species' own first form.
  return evolved.length ? { species: sp, form: 0, evolved } : own;
};

/**
 * Everything `of` reads off one mon that the run key does not carry (26-run.js: a replay may read only what the run
 * key or a memo's `k` holds). The run key has the species, the level and the modifier *count*, so a Lucky Egg handed
 * from one member to another, or Pokérus turning up mid-run, moves nothing in it — a caller memoising a projection
 * names this instead, and gets a fresh answer when it changes.
 */
const inputsOf = (s, x) => [x?.id ?? null, heldStacks(s, x, "LUCKY_EGG"), heldStacks(s, x, "GOLDEN_EGG"),
  !!x?.pokerus, !!x?.pauseEvolutions];

/**
 * The levels the party and a would-be newcomer reach by the big fight on wave `fight`, projected from the wave
 * `from` the run stands on. With no `fight` to reach, or none ahead, every level stands where it is.
 *
 * `of(x, { participant, participants })` projects one of them: a live member, or a stand-in carrying a `level`.
 * `participant` says it fights the waves in between, `participants` how many fight each of them alongside it. A mon
 * whose EXP routing is not stated is projected on the bench share alone — a projection never flatters what it does
 * not know (CONTEXT.md, `Combatant`) — which is nothing at all without EXP. All.
 *
 * Each answer also carries the `species` and `form` the mon stands as at the fight, which is its own unless an
 * evolution lands on the way (`evolveTo`), and `evolved`, the species it passes through to get there.
 *
 * `inputs(x)` is what a memo key has to name to keep an answer for `x` honest; `expAll` is the one run-wide input of
 * the same kind.
 */
export const levelProjection = (s, { from = 0, fight = null } = {}) => {
  const start = Math.floor(from) || 0;
  const waves = fight == null ? 0 : Math.max(0, Math.floor(fight) - start);
  const expAll = classStacks(s, "ExpShareModifier");
  const cap = levelCapAt(s, fight ?? start);
  const of = (x, { participant = false, participants = 1 } = {}) => {
    const n = Math.max(1, Math.floor(participants) || 1);
    const share = participant ? 1 / n : 0.2 * expAll / n;
    // A Lucky Egg adds 40 % and a Golden Egg 100 % (game-code.md §17).
    const egg = 1 + 0.4 * heldStacks(s, x, "LUCKY_EGG") + heldStacks(s, x, "GOLDEN_EGG");
    const rate = share * egg * (x?.pokerus ? 1.5 : 1);
    const was = Math.max(1, Math.floor(x?.level ?? 1));
    let level = was, exp = expAt(was);
    for (let w = start; w < start + waves; w++) {
      const lid = levelCapAt(s, w);
      // A member at the cap takes no share, and the share it would have taken is lost rather than passed on to the
      // members below it (game-code.md §15).
      if (level >= lid) continue;
      exp = Math.min(expAt(lid), exp + waveExp(s, w) * rate);
      level = levelAt(exp);
    }
    return { level, was, gained: level - was, cap, capped: level >= cap, waves, share, ...evolveTo(x, level),
      confidence: "estimate" };
  };
  return { from: start, fight: fight == null ? null : Math.floor(fight), waves, cap, expAll, of,
    inputs: x => inputsOf(s, x), confidence: "estimate" };
};
