// Starter picker: on the starter grid at the start of a run, which starters this account should take within the point
// budget. It proposes whole teams from what is unlocked, each pick with a short reason.
//
// ---- How the game decides (read from the pinned source, v1.12.0.11; references/game-code.md §23)
// - The grid is StarterSelectUiHandler, UiMode.STARTER_SELECT. Its pop-ups (add, moves, nature, start) change the UI
//   mode, so the handler is read from `ui.handlers[STARTER_SELECT]`; `starterSelectCallback` is set only while a team
//   is being chosen for a run (SelectStarterPhase). Daily runs never show the grid.
// - `validStarterContainers`: every starter the active challenges allow, the species itself or one of its evolutions
//   (the soft check). Uncaught species are in it too: `dexData[id].caughtAttr` tells them apart.
// - Budget: `getValueLimit()`, 10 (15 in Endless) minus Lower Starter Points. A species costs
//   `gameData.getSpeciesStarterValue(id)`: its base cost less its candy reductions, back to base under Fresh Start.
//   At most 6 starters, no duplicates.
// - The team being built: `starterSpecies` with a parallel `starters` (`abilityIndex`, `passive` when enabled, …).
// - A team can start once one member passes the strict challenge check (the species itself, not an evolution):
//   `isPartyValid`, which loops each active challenge's `applyStarterChoice(species, holder, props)`.
// - `getSpeciesData(id)` hands back copies of the dex and starter entries with the challenges applied: Fresh Start
//   clears egg moves, passives, hidden abilities and cost reductions, caps IVs at 15, drops shinies.
// - The run starts at level 5 (`getStartingLevel`, 20 only in Daily). Each starter adds luck by the best shiny tier ever
//   caught for it (`getDexAttrLuck`: variant 3 → 3, variant 2 → 2, shiny → 1), none under Fresh Start. Pokérus
//   starters (`pokerusSpecies`) earn 1.5× EXP.
// Every call here is a pure read (no RNG, no phase queue), so no `sandbox`.
//
// ---- Scoring (first cuts, all of them)
// A starter's value: its line's strongest final form (exact from the species registry the chunk scan finds, else the
// catch card's estimate), what it has at level 5, how soon it evolves, and the account's unlocks for it: passive,
// hidden ability, egg moves (the fourth is the rare one), IVs, Pokérus and luck.
// A team's score: its members' values, sorted, at falling weights (a sixth mon shares the EXP and the turns); plus the
// defending types its final forms' STAB hits super-effectively; minus attacking types two members are weak to that
// nobody resists (not under a single-type challenge, where everyone shares them); minus a team with no carry: nobody
// built to attack (by the moveset prior's roles, else base stats) with a final form of 480+.
import { TYPES, vs } from "./01-core.js";
import { RANDBATS } from "./05-randbats.js";
import { finalBstOf } from "./45-catch.js";
import { gameTables } from "./47-biome.js";

const MAX_PARTY = 6;
const WEIGHTS = [1, 0.8, 0.55, 0.35, 0.2, 0.1];
const COVER = 0.8, SHARED_WEAK = 4, NO_CARRY = 6, CARRY_FINAL = 480;
const BEAM = 40, TOP_VALUE = 24, TOP_RATIO = 12;
const CARRY_ROLES = new Set(["Wallbreaker", "Fast Attacker", "Setup Sweeper", "Bulky Attacker", "Bulky Setup", "Fast Bulky Setup",
  "Choice Item user", "Tera Blast user", "Offensive Protect", "Doubles Wallbreaker", "Doubles Fast Attacker",
  "Doubles Setup Sweeper", "Doubles Bulky Attacker", "Doubles Bulky Setup"]);

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const big = x => { try { return BigInt(x ?? 0); } catch { return 0n; } };

// The grid's handler while a team is being chosen for a run, else null.
export const starterScreen = s => {
  const h = s?.ui?.handlers?.[UiMode.STARTER_SELECT];
  return h?.starterSelectCallback && s.phaseManager?.getCurrentPhase?.()?.phaseName === "SelectStarterPhase" ? h : null;
};

// ---- The moveset prior's roles for a line: its own sets, its forms', or the ones it grows into.
const rbId = name => String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const rbAt = (table, id) => (table && Object.prototype.hasOwnProperty.call(table, id) ? table[id] : null);
const rolesOf = names => {
  const out = new Set();
  for (const name of names) {
    const id = rbId(name);
    const ids = rbAt(RANDBATS.s, id) ? [id] : rbAt(RANDBATS.f, id) ?? rbAt(RANDBATS.e, id) ?? [];
    for (const x of ids) for (const row of rbAt(RANDBATS.s, x) ?? []) out.add(RANDBATS.r[row[0]]);
  }
  return [...out];
};

const typeNames = sp => [sp?.type1, sp?.type2].map(t => TYPES[t]).filter((t, i, a) => t && a.indexOf(t) === i);

// The line's strongest final form and how its first evolution comes: from the registry when the chunk scan has found
// it, else the catch card's estimate from the evolution levels alone.
const lineOf = (sp, reg) => {
  const evos = tryDo(() => sp.getEvolutionLevels(), []);
  const own = { final: sp.baseTotal ?? 0, finalSp: sp, estimated: false };
  let best = own;
  if (evos.length && reg) {
    for (const [id] of evos) {
      const x = tryDo(() => reg.getSpecies(id));
      if (!x || tryDo(() => reg.hasEvolutions(id), false)) continue;
      if (!best || (x.baseTotal ?? 0) > best.final) best = { final: x.baseTotal ?? 0, finalSp: x, estimated: false };
    }
  } else if (evos.length) {
    const est = finalBstOf({ species: sp });
    best = { final: est.final, finalSp: null, estimated: est.estimated };
  }
  // How it first evolves: the lowest level among its direct evolutions, or an item or condition when all need one.
  let evo = null;
  if (evos.length) {
    const direct = reg ? tryDo(() => reg.getEvolutions(sp.speciesId), []) : [];
    const byLevel = direct.filter(e => !e.item && !e.condition && e.level > 1).map(e => e.level);
    evo = direct.length ? (byLevel.length ? { level: Math.min(...byLevel) } : { item: true })
      : evos[0][1] > 1 ? { level: evos[0][1] } : { item: true };
  }
  return { ...best, evo };
};

// What one starter is worth to a run, with its reasons ({ w, text }), the heaviest first. `starter`: the grid's own
// choices for a species already in the team (its ability and whether its passive is on).
const speciesValue = (s, h, sp, ctx, starter = null) => {
  const id = sp.speciesId;
  const { dexEntry: dex, starterDataEntry: st } = tryDo(() => h.getSpeciesData(id), null)
    ?? { dexEntry: s.gameData?.dexData?.[id] ?? {}, starterDataEntry: s.gameData?.starterData?.[id] ?? {} };
  const line = lineOf(sp, ctx.tables?.species);
  const why = [];
  const finalName = line.finalSp && line.finalSp.speciesId !== id ? ` (${line.finalSp.name})` : "";
  const power = 45 * clamp((line.final - 380) / 220, 0, 1.5) ** 1.5;
  why.push({ w: power, text: `final BST ${line.estimated ? "~" : ""}${line.final}${finalName}` });
  const early = 8 * clamp(((sp.baseTotal ?? 0) - 250) / 250, 0, 1);
  why.push({ w: early, text: `BST ${sp.baseTotal} from L5`, quiet: (sp.baseTotal ?? 0) < 450 });
  if (line.evo?.item) why.push({ w: -3, text: "evolves by item or condition" });
  else if (line.evo?.level > 36) why.push({ w: -4, text: `evolves at L${line.evo.level}` });

  const abilityName = aid => tryDo(() => ctx.tables.abilities[aid].name, null);
  const passiveOn = starter ? !!starter.passive : ((st.passiveAttr ?? 0) & Passive.UNLOCKED) !== 0;
  const passiveName = () => abilityName(tryDo(() => sp.getPassiveAbility(starter?.formIndex ?? 0)));
  if (passiveOn) why.push({ w: 8, text: passiveName() ? `passive ${passiveName()}` : "passive" });
  // Picked with an unlocked passive switched off: worth saying while the grid can still turn it on.
  else if (starter && ((st.passiveAttr ?? 0) & Passive.UNLOCKED)) why.push({ w: -3, text: `${passiveName() ?? "passive"} is off` });
  const hiddenOn = starter ? starter.abilityIndex === 2 : ((st.abilityAttr ?? 0) & AbilityAttr.ABILITY_HIDDEN) !== 0;
  if (hiddenOn && sp.abilityHidden) {
    const name = abilityName(sp.abilityHidden);
    why.push({ w: 3, text: name ? `hidden ${name}` : "hidden ability" });
  }
  const eggs = st.eggMoves ?? 0;
  const moveName = i => tryDo(() => ctx.tables.moves[ctx.tables.eggMoves[id][i]].name, null);
  if (eggs & 8) {
    const name = moveName(3);
    why.push({ w: 6, text: name ? `rare egg move ${name}` : "rare egg move" });
  }
  const common = [0, 1, 2].filter(i => eggs & (1 << i)).length;
  if (common) why.push({ w: 1.5 * common, text: `${common} egg move${common > 1 ? "s" : ""}`, quiet: true });
  const ivs = Array.isArray(dex.ivs) ? dex.ivs.reduce((t, x) => t + (x ?? 0), 0) : 0;
  why.push({ w: 8 * ivs / 186, text: `IVs ${ivs}/186`, quiet: ivs < 120 });
  if (ctx.pokerus.has(id)) why.push({ w: 2, text: "Pokérus 1.5× EXP" });
  // getDexAttrLuck: VARIANT_3 64n, VARIANT_2 32n, SHINY 2n.
  const caught = big(dex.caughtAttr);
  const luck = ctx.fresh ? 0 : caught & 64n ? 3 : caught & 32n ? 2 : caught & 2n ? 1 : 0;
  if (luck) why.push({ w: 1.5 * luck, text: `luck +${luck}` });

  const finalSp = line.finalSp ?? sp;
  const roles = rolesOf([finalSp.name, sp.name]);
  const [, atk, def, spa, spd] = finalSp.baseStats ?? sp.baseStats ?? [];
  const role = roles.some(r => CARRY_ROLES.has(r)) ? "carry" : roles.length ? "support"
    : Math.max(atk ?? 0, spa ?? 0) >= 1.1 * Math.max(def ?? 0, spd ?? 0) ? "carry" : null;
  const value = why.reduce((t, r) => t + r.w, 0);
  why.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  return { id, sp, name: sp.name, value, final: line.final, role, roles, types: typeNames(finalSp), why };
};

// ---- Teams
const effectiveness = (atk, types, inverse) => types.reduce((m, d) => {
  const x = vs(atk, d);
  return m * (inverse ? (x === 0 || x === 0.5 ? 2 : x === 2 ? 0.5 : 1) : x);
}, 1);

const teamScore = (members, ctx) => {
  const vals = members.map(m => m.value).sort((a, b) => b - a);
  let score = vals.reduce((t, v, i) => t + v * (WEIGHTS[i] ?? 0), 0);
  const stab = [...new Set(members.flatMap(m => m.types))];
  const covers = TYPES.filter(d => stab.some(t => effectiveness(t, [d], ctx.inverse) >= 2)).length;
  const weak = ctx.mono ? [] : TYPES.filter(t => {
    const n = members.filter(m => effectiveness(t, m.types, ctx.inverse) >= 2).length;
    return n >= 2 && !members.some(m => effectiveness(t, m.types, ctx.inverse) <= 0.5);
  });
  const carry = members.some(m => m.role === "carry" && m.final >= CARRY_FINAL);
  score += COVER * covers - SHARED_WEAK * weak.length - (carry || !members.length ? 0 : NO_CARRY);
  return { score, covers, weak, noCarry: !carry && members.length > 0 };
};

// The best teams that add from `cands` to `fixed` within `room` points: a beam over combinations, largest value first.
// `valid(members)`: a team the game would let start. Returns the best valid team overall and per size.
const search = (fixed, cands, room, ctx, valid) => {
  const bySize = new Map();
  let best = null;
  const consider = (picks, cost) => {
    const members = [...fixed, ...picks];
    const t = { members, cost, ...teamScore(members, ctx) };
    if (!valid(members)) return t;
    if (!best || t.score > best.score) best = t;
    const n = members.length;
    if (!bySize.has(n) || t.score > bySize.get(n).score) bySize.set(n, t);
    return t;
  };
  consider([], 0);
  let beam = [{ picks: [], cost: 0, last: -1 }];
  for (let depth = fixed.length; depth < MAX_PARTY && beam.length; depth++) {
    const next = [];
    for (const st of beam) {
      for (let i = st.last + 1; i < cands.length; i++) {
        const c = cands[i];
        const cost = st.cost + c.cost;
        if (cost > room + 1e-9) continue;
        const picks = [...st.picks, c];
        next.push({ picks, cost, last: i, score: consider(picks, cost).score });
      }
    }
    beam = next.sort((a, b) => b.score - a.score).slice(0, BEAM);
  }
  return { best, bySize };
};

// ---- The card
let cache = { key: null, value: null };

// The starter card's model: up to three proposals (the best team, the best without its lead pick, and a trio or a
// fuller team), and the species the cursor is on.
export const starterModel = (s, h) => {
  const tables = tryDo(() => gameTables());
  const challenges = (s.gameMode?.challenges ?? []).filter(c => c && c.value);
  const has = id => challenges.some(c => c.id === id);
  const limit = tryDo(() => h.getValueLimit(), 10);
  const chosen = (h.starterSpecies ?? []).filter(Boolean);
  const containers = h.validStarterContainers ?? h.starterContainers ?? [];
  // Candy spent on the grid (a passive, a cost reduction) changes a value without changing the team.
  let unlocks = 0;
  for (const st of Object.values(s.gameData?.starterData ?? {})) {
    unlocks += (st?.valueReduction ?? 0) + 3 * (st?.passiveAttr ?? 0) + 11 * (st?.eggMoves ?? 0) + 37 * (st?.abilityAttr ?? 0);
  }
  const key = JSON.stringify([limit, unlocks, chosen.map((sp, i) => [sp.speciesId, h.starters?.[i]?.passive, h.starters?.[i]?.abilityIndex]),
    containers.length, !!tables, !!tables?.abilities, !!tables?.eggMoves, challenges.map(c => [c.id, c.value])]);
  if (cache.key !== key) cache = { key, value: build(s, h, { tables, challenges, has, limit, chosen, containers }) };
  const m = cache.value;
  const viewing = viewed(h, m);
  return { ...m.card, viewing };
};

const iconOfContainer = c => {
  const key = tryDo(() => c.icon.texture.key), frame = tryDo(() => c.icon.frame.name);
  return key && frame != null ? [key, String(frame)] : null;
};
const speciesIcon = sp => tryDo(() => [sp.getIconAtlasKey(0, false, 0), String(sp.getIconId(false, 0, false, 0))]);

const build = (s, h, { tables, challenges, has, limit, chosen, containers }) => {
  const ctx = {
    tables,
    fresh: has(Challenges.FRESH_START), mono: has(Challenges.SINGLE_TYPE), inverse: has(Challenges.INVERSE_BATTLE),
    pokerus: new Set((h.pokerusSpecies ?? []).map(sp => sp?.speciesId)),
  };
  const iconById = new Map((h.starterContainers ?? containers).map(c => [c.species?.speciesId, iconOfContainer(c)]));
  const costOf = (sp, c) => tryDo(() => s.gameData.getSpeciesStarterValue(sp.speciesId), c?.cost ?? 1);
  // The strict check a team needs one member to pass (challenge runs only).
  const strictCache = new Map();
  const strict = sp => {
    if (!challenges.length) return true;
    if (!strictCache.has(sp.speciesId)) {
      const props = tryDo(() => s.gameData.getSpeciesDexAttrProps(sp, h.getCurrentDexProps(sp.speciesId)));
      strictCache.set(sp.speciesId, challenges.every(c => {
        if (typeof c.applyStarterChoice !== "function") return true;
        const holder = { value: true };
        try { c.applyStarterChoice(sp, holder, props); } catch { return true; }
        return holder.value !== false;
      }));
    }
    return strictCache.get(sp.speciesId);
  };
  const valid = members => !members.length || members.some(m => strict(m.sp));

  const withIcon = (v, cost, chosenIdx) => ({ ...v, cost, icon: iconById.get(v.id) ?? speciesIcon(v.sp), chosen: chosenIdx >= 0 });
  const fixed = chosen.map((sp, i) => withIcon(speciesValue(s, h, sp, ctx, h.starters?.[i]), costOf(sp), i));
  const spent = fixed.reduce((t, m) => t + m.cost, 0);
  const room = limit - spent;
  const taken = new Set(chosen.map(sp => sp.speciesId));
  const all = containers
    .filter(c => c?.species && !taken.has(c.species.speciesId))
    .filter(c => big(tryDo(() => h.getSpeciesData(c.species.speciesId).dexEntry.caughtAttr, s.gameData?.dexData?.[c.species.speciesId]?.caughtAttr)) > 0n)
    .map(c => withIcon(speciesValue(s, h, c.species, ctx), costOf(c.species, c), -1))
    .sort((a, b) => b.value - a.value);
  const values = new Map(all.map((v, i) => [v.id, { v, rank: i + 1 }]));
  const pool = all.filter(v => v.cost <= room + 1e-9);
  const pickCands = list => {
    const byRatio = [...list].sort((a, b) => b.value / Math.max(0.25, b.cost) - a.value / Math.max(0.25, a.cost));
    return [...new Set([...list.slice(0, TOP_VALUE), ...byRatio.slice(0, TOP_RATIO)])].sort((a, b) => b.value - a.value);
  };
  const full = fixed.length >= MAX_PARTY;
  const main = search(fixed, full ? [] : pickCands(pool), room, ctx, valid);

  const proposals = [];
  const seen = new Set();
  const add = (label, t) => {
    if (!t || t.members.length === fixed.length) return;
    const ids = t.members.map(m => m.id).sort((a, b) => a - b).join(",");
    if (seen.has(ids)) return;
    seen.add(ids);
    proposals.push({ label, ...t });
  };
  add("best", main.best);
  const lead = main.best?.members.filter(m => !m.chosen).sort((a, b) => b.value - a.value)[0];
  if (lead) add(`without ${lead.name}`, search(fixed, pickCands(pool.filter(v => v.id !== lead.id)), room, ctx, valid).best);
  const size = main.best?.members.length ?? 0;
  const pickSize = (from, to) => [...main.bySize].filter(([n]) => n >= from && n <= to).map(([, t]) => t)
    .reduce((b, t) => (!b || t.score > b.score ? t : b), null);
  if (size > 3) add("trio", pickSize(Math.max(1, fixed.length), 3));
  else add("fuller", pickSize(size + 1, MAX_PARTY));

  const reasons = m => m.why.filter(r => r.w > 0 && !r.quiet).slice(0, 2).map(r => r.text)
    .concat(m.why.filter(r => r.w <= -3).slice(0, 1).map(r => `but ${r.text}`));
  const lead0 = t => t.members.filter(m => m.role === "carry").sort((a, b) => b.value - a.value)[0] ?? null;
  const card = {
    kind: "starters", limit, spent: Math.round(spent * 100) / 100, full, room: Math.round(room * 100) / 100,
    data: !!tables?.species, fresh: ctx.fresh, mono: ctx.mono, inverse: ctx.inverse,
    chosen: fixed.map(m => ({ name: m.name, icon: m.icon, cost: m.cost, value: Math.round(m.value), why: reasons(m) })),
    picks: proposals.map(t => {
      const carry = lead0(t);
      return {
        label: t.label, cost: Math.round(t.cost * 100) / 100 + Math.round(spent * 100) / 100, score: Math.round(t.score),
        covers: t.covers, weak: t.weak, noCarry: t.noCarry,
        members: [...t.members].sort((a, b) => b.value - a.value).map(m => ({
          name: m.name, icon: m.icon, cost: m.cost, chosen: m.chosen, value: Math.round(m.value),
          role: m === carry ? "carry" : m.role === "support" ? "support" : null, why: reasons(m),
        })),
      };
    }),
  };
  return { card, values, proposals };
};

// The species under the cursor: its value, rank among what's caught and whether a proposal takes it.
const viewed = (h, m) => {
  const sp = h.lastSpecies;
  if (!sp) return null;
  const hit = m.values.get(sp.speciesId);
  if (!hit) return null;
  const inPick = m.proposals.find(t => t.members.some(x => x.id === sp.speciesId))?.label ?? null;
  const { v, rank } = hit;
  return { name: v.name, icon: v.icon, cost: v.cost, value: Math.round(v.value), rank, of: m.values.size, inPick,
    why: v.why.filter(r => Math.abs(r.w) >= 1.5).slice(0, 3).map(r => (r.w < 0 ? `but ${r.text}` : r.text)) };
};
