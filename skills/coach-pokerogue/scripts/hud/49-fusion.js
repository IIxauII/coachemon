// Fusion advisor: which two party members a DNA Splicer should fuse, in which order, and whether any fusion is worth
// the party member it costs. Read on the rewards card (is the Splicer worth taking?) and on the party screen the
// Splicer opens (who to pick first, who second).
//
// ---- How the game fuses (read from the pinned source, v1.12.0.11; references/game-code.md §24)
// - DNA Splicers is a consumable (`FusePokemonModifierType`): it can't be held. Taking it opens the party screen in
//   `PartyUiMode.SPLICE`; the first pick (`transferCursor`) is the **base**, the second becomes its `fusionSpecies` and
//   leaves the party for good. Backing out returns to the rewards screen with the Splicer unspent.
// - Who can be picked: the type's `selectFilter` — not an existing fusion, not a fainted member under Hardcore.
// - The base keeps its level, EXP, IVs, nature, Tera type, passive, moveset and type 1. The other half brings its
//   ability (at its own ability index), type 2 (its type2 if set and not the base's type 1, else its type1 if that
//   differs, else the base keeps its own type 2), half of every base stat (`Math.ceil((a + b) / 2)`), its learnset
//   and TMs, its held items, and a learn prompt for each of its moves.
// - A fused mon's ability does nothing when it carries `NoFusionAbilityAbAttr` (Disguise, Zen Mode, Schooling, …).
// - Spliced Endless halves every unfused mon's base stats, so any fusion is a big step up there.
// Every read here is pure (species forms, abilities, the select filter), so no `sandbox`.
//
// ---- Scoring (first cuts, all of them)
// A fusion is scored on the party, not on the base: the party's value after it (both halves gone, the fused mon in)
// against before, in percent of the strongest member's power. The slot the fusion frees is counted as refilled by a
// catch worth 0.8 of the weakest member. A member's power is its stats at its own level by the
// game's formula (no held items): the stat it attacks with (Huge / Pure Power doubling Atk) 0.45, bulk (HP × mean
// defence, square-rooted) 0.35, Speed 0.2, as a weighted geometric mean; a fainted member counts 0.7. The party's
// value weighs its members strongest first, 1 / .8 / .55 / .35 / .2 / .1. The fused mon's power then moves by:
// - types: the 18 attacking types' multipliers on the new typing against the old (a weakness gone +1.5 %, a ×4
//   weakness gained −3 %), and ±12 % across the base's attacks that gain or lose STAB;
// - ability: the new ability against the old, from a short list of standouts (+12 %), good ones (+6 %) and
//   liabilities (−20 %).
// The fused mon has the base's level whatever the other half's, so a fusion onto a member far behind or one that spends
// a strong member rarely pays, and one that folds a strong species caught at a low level into the lead does.
import { TYPES, iconOf, natureOf, vs } from "./01-core.js";

export const FUSE_MIN = 5;
const W_OFF = 0.45, W_BULK = 0.35, W_SPE = 0.2;
const RANK = [1, 0.8, 0.55, 0.35, 0.2, 0.1], FAINTED_SHARE = 0.7, REFILL = 0.8;
const TYPE_POINT = 1.5, STAB_SWING = 12;
const GREAT_ABILITY = 12, GOOD_ABILITY = 6, BAD_ABILITY = -20;
const GREAT = new Set(["Speed Boost", "Parental Bond", "Adaptability", "Magic Guard", "Multiscale", "Shadow Shield", "Protean",
  "Libero", "Beast Boost", "Moxie", "Regenerator", "Intimidate", "Good as Gold", "Unaware", "Prankster", "Sheer Force",
  "Tough Claws", "Technician", "Levitate", "Drought", "Drizzle", "Magic Bounce", "Contrary", "Simple", "Tinted Lens",
  "Serene Grace", "Supreme Overlord", "Sword of Ruin", "Beads of Ruin", "Tablets of Ruin", "Vessel of Ruin"]);
const GOOD = new Set(["Sand Stream", "Snow Warning", "Thick Fat", "Filter", "Solid Rock", "Prism Armor", "Fur Coat", "Ice Scales",
  "Guts", "Download", "Mold Breaker", "Skill Link", "Strong Jaw", "Iron Fist", "Sharpness", "Aerilate", "Pixilate",
  "Refrigerate", "Galvanize", "Swift Swim", "Chlorophyll", "Sand Rush", "Slush Rush", "Poison Heal", "Water Absorb",
  "Volt Absorb", "Flash Fire", "Storm Drain", "Lightning Rod", "Sap Sipper", "Motor Drive", "Earth Eater",
  "Well-Baked Body", "Dragon's Maw", "Transistor", "Steelworker", "Rocky Payload", "Gorilla Tactics", "Sturdy",
  "Natural Cure", "Unburden", "Hustle", "Punk Rock", "Quark Drive", "Protosynthesis", "Stamina", "Justified"]);
const BAD = new Set(["Truant", "Slow Start", "Defeatist", "Klutz", "Stall", "Normalize"]);
const ATK_DOUBLED = new Set(["Huge Power", "Pure Power"]);

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const nameOf = x => String(x?.name ?? "").replace(/ \((N|P)\)$/, "");

// The ability a member's half brings: its own at its ability index, or an encounter's custom one. A fusion carries no
// ability whose attrs say it doesn't work fused.
const abilityOf = p => tryDo(() => p.getAbility(true));
const worksFused = ab => !(ab?.attrs ?? []).some(a => a?.constructor?.name === "NoFusionAbilityAbAttr");
const abilityValue = name => (GREAT.has(name) ? GREAT_ABILITY : GOOD.has(name) ? GOOD_ABILITY : BAD.has(name) ? BAD_ABILITY : 0);

// A member's own half: base stats, types (custom types from an encounter first), as `Pokemon.getBaseTypes` reads them.
const halfOf = p => {
  const form = tryDo(() => p.getSpeciesForm(true), p.species);
  const custom = p.customPokemonData?.types ?? [];
  return { stats: [...(form?.baseStats ?? [])], type1: custom[0] ?? form?.type1, type2: custom[1] ?? form?.type2 ?? null };
};
const fusedTypes = (a, b) => {
  let second = a.type2;
  if (b.type2 != null && b.type2 !== a.type1) second = b.type2;
  else if (b.type1 !== a.type1) second = b.type1;
  return [a.type1, second].filter((t, i, xs) => t != null && t >= 0 && xs.indexOf(t) === i).map(t => TYPES[t]).filter(Boolean);
};

// `Pokemon.calculateStats` without held items: `floor((2·base + iv) · level / 100)`, HP + level + 10, the rest + 5
// and the nature (ceil up, floor down).
const statsAt = (base, p) => base.map((b, s) => {
  const v = Math.floor((2 * b + (p.ivs?.[s] ?? 0)) * p.level * 0.01);
  if (s === Stat.HP) return v + p.level + 10;
  const fx = natureOf(tryDo(() => p.getNature(), p.nature) ?? 0);
  const m = fx.upStat === s ? 1.1 : fx.downStat === s ? 0.9 : 1;
  return m === 1 ? v + 5 : Math.max(1, Math[m > 1 ? "ceil" : "floor"]((v + 5) * m));
});
const offOf = (st, ability) => Math.max(st[Stat.ATK] * (ATK_DOUBLED.has(ability) ? 2 : 1), st[Stat.SPATK]);
const bulkOf = st => Math.sqrt(st[Stat.HP] * (st[Stat.DEF] + st[Stat.SPDEF]) / 2);
const powerOf = (st, ability) => offOf(st, ability) ** W_OFF * bulkOf(st) ** W_BULK * Math.max(1, st[Stat.SPD]) ** W_SPE;

// A party's value: its members' powers, strongest first, at falling weights (the lead fights most, a sixth mon least).
const partyValue = powers => [...powers].sort((x, y) => y - x).reduce((t, v, i) => t + v * (RANK[i] ?? 0), 0);
// A member as it stands: its base stats (a fusion's averaged, Spliced Endless halving an unfused one) and its power.
const memberPower = (p, spliced) => {
  let base = halfOf(p).stats;
  const fu = p.fusionSpecies ? tryDo(() => p.getFusionSpeciesForm(true), p.fusionSpecies) : null;
  if (fu?.baseStats?.length === 6) base = base.map((x, i) => Math.ceil((x + fu.baseStats[i]) / 2));
  else if (spliced) base = base.map(x => Math.ceil(x / 2));
  if (base.length < 6) return 0;
  return powerOf(statsAt(base, p), nameOf(abilityOf(p))) * (p.hp > 0 ? 1 : FAINTED_SHARE);
};

// How a typing takes hits: −log2 of each attacking type's multiplier, an immunity counted as ¼.
const defenceOf = types => TYPES.reduce((t, atk) => t - Math.log2(Math.max(0.25, types.reduce((m, d) => m * vs(atk, d), 1))), 0);

const attacksOf = p => (p.moveset ?? []).filter(Boolean).map(pm => tryDo(() => pm.getMove())).filter(mv => mv && mv.category !== MoveCategory.STATUS && mv.power !== 0);

// One ordered fusion: `a` the base (picked first), `b` the half it takes in (picked second). `ctx`: { party, powers,
// carryPower, spliced, held }. `value` is the party's value after against before, in percent of the carry's power.
export const fusionOf = (a, b, ctx) => {
  const ha = halfOf(a), hb = halfOf(b);
  if (ha.stats.length < 6 || hb.stats.length < 6) return null;
  const ownBase = ctx.spliced ? ha.stats.map(x => Math.ceil(x / 2)) : ha.stats;
  const fusedBase = ha.stats.map((x, i) => Math.ceil((x + hb.stats[i]) / 2));
  const abA = abilityOf(a), abB = abilityOf(b);
  const nameA = nameOf(abA), nameB = worksFused(abB) ? nameOf(abB) : "";
  const pct = x => 100 * x / Math.max(1e-9, ctx.carryPower);

  const typesBefore = fusedTypes(ha, { type1: ha.type1, type2: null }), typesAfter = fusedTypes(ha, hb);
  let typing = TYPE_POINT * (defenceOf(typesAfter) - defenceOf(typesBefore));
  const attacks = attacksOf(a);
  if (attacks.length) {
    const stab = types => attacks.filter(mv => types.includes(TYPES[mv.type])).length;
    typing += STAB_SWING * (stab(typesAfter) - stab(typesBefore)) / attacks.length;
  }
  const ability = abilityValue(nameB) - abilityValue(nameA);

  // The fused mon is alive when either half was (its HP is the halves' average share).
  const raw = powerOf(statsAt(fusedBase, a), nameB) * (a.hp > 0 || b.hp > 0 ? 1 : FAINTED_SHARE);
  const fused = raw * Math.max(0.2, 1 + (typing + ability) / 100);
  const pa = ctx.powers.get(a), pb = ctx.powers.get(b);
  const rest = ctx.party.filter(p => p !== a && p !== b).map(p => ctx.powers.get(p));
  const value = pct(partyValue([...rest, fused, ctx.refill]) - partyValue([...rest, pa, pb]));

  // The reasons, weighed by how far each moves the fused mon's power (the member lost by its own).
  const why = [];
  const bstBefore = ownBase.reduce((t, x) => t + x, 0), bstAfter = fusedBase.reduce((t, x) => t + x, 0);
  why.push({ w: pct(raw - pa), text: `${a.name} BST ${bstBefore} → ${bstAfter}` });
  if (typesAfter.join("/") !== typesBefore.join("/") || Math.abs(typing) >= 3) {
    why.push({ w: pct(raw * typing / 100), text: `${typesBefore.join("/")} → ${typesAfter.join("/")}` });
  }
  if (nameB !== nameA) {
    const lost = !worksFused(abB) ? ` (${nameOf(abB)} doesn't work fused)` : "";
    why.push({ w: pct(raw * ability / 100), text: `${nameA || "—"} → ${nameB || "no ability"}${lost}`, quiet: !ability && !lost });
  }
  why.push({ w: -pct(pb) * 0.5, text: `spends ${b.name} L${b.level}${b.hp > 0 ? "" : " (fainted)"}` });
  why.sort((x, y) => Math.abs(y.w) - Math.abs(x.w));

  const known = new Set((a.moveset ?? []).map(m => m?.moveId));
  const offered = attacksOf(b).filter(mv => !known.has(mv.id)).map(nameOf);
  const items = tryDo(() => ctx.held(b).length, 0);
  const evolves = [a, b].filter(p => tryDo(() => p.species.getEvolutionLevels().length, 0) > 0).map(p => p.name);
  const notes = [
    offered.length ? `offers ${offered.slice(0, 2).join("/")}${offered.length > 2 ? ` +${offered.length - 2}` : ""}` : null,
    items ? `${items} held item${items > 1 ? "s" : ""} move over` : null,
    evolves.length ? `${evolves.join(" & ")} still evolve${evolves.length > 1 ? "" : "s"}` : null,
    a.hasPassive?.() ? `keeps passive ${nameOf(tryDo(() => a.getPassiveAbility()))}` : null,
  ].filter(Boolean);
  return { a, b, value, types: typesAfter, ability: nameB || null, bst: bstAfter, why, notes };
};

// Every fusion the Splicer allows, best first. `allowed(p)`: the game's select filter for the Splicer (null = can be
// picked). Cached on everything it reads.
let cache = { key: null, value: null };
export const fusionOptions = (s, { allowed = () => null } = {}) => {
  const party = tryDo(() => s.getPlayerParty().filter(Boolean), []) ?? [];
  const spliced = !!s.gameMode?.isSplicedOnly;
  const held = p => (s.modifiers ?? []).filter(m => m?.pokemonId != null && m.pokemonId === p.id);
  const pickable = party.filter(p => !p.fusionSpecies && tryDo(() => allowed(p), null) == null);
  const key = JSON.stringify([spliced, (s.modifiers ?? []).length, pickable.map(p => p.id), party.map(p => [p.id, p.species?.speciesId, p.formIndex,
    p.fusionSpecies?.speciesId ?? null, p.abilityIndex, p.level, p.hp > 0, p.nature, (p.moveset ?? []).map(m => m?.moveId)])]);
  if (cache.key === key) return cache.value;
  const powers = new Map(party.map(p => [p, tryDo(() => memberPower(p, spliced), 0)]));
  const ctx = { party, powers, carryPower: Math.max(1, ...powers.values()), refill: REFILL * Math.min(...powers.values()), spliced, held };
  const options = [];
  for (const a of pickable) {
    for (const b of pickable) {
      if (a === b) continue;
      const f = tryDo(() => fusionOf(a, b, ctx));
      if (f) options.push(f);
    }
  }
  options.sort((x, y) => y.value - x.value);
  cache = { key, value: { spliced, options, pickable: pickable.length } };
  return cache.value;
};

// A fusion as plain data for a card: the pick order by name and icon, its score and reasons.
export const fusionRow = f => ({
  base: { name: f.a.name, icon: iconOf(f.a), level: f.a.level }, other: { name: f.b.name, icon: iconOf(f.b), level: f.b.level },
  value: Math.round(f.value), fuse: f.value >= FUSE_MIN, types: f.types, ability: f.ability, bst: f.bst,
  why: f.why.filter(r => !r.quiet).slice(0, 3).map(r => r.text), notes: f.notes,
});

// The Splicer on the rewards screen, on the card's scale (about 10 a rarity tier): a good reward's floor plus the best
// fusion's score, or a pass when no fusion clears FUSE_MIN.
export const splicerReward = (s, t) => {
  const { options, pickable } = fusionOptions(s, { allowed: p => (typeof t?.selectFilter === "function" ? t.selectFilter(p) : null) });
  if (pickable < 2 || !options.length) return { v: -6, why: "nobody left to fuse" };
  const row = fusionRow(options[0]);
  const order = `${row.base.name} ← ${row.other.name}`;
  if (!row.fuse) return { v: -2, why: `no fusion worth a member · best ${order} ${row.value >= 0 ? "+" : "−"}${Math.abs(row.value)}` };
  return { v: 12 + Math.min(25, row.value), why: [`fuse ${order} · +${row.value}`, row.why[0]].filter(Boolean).join(" · "),
    holder: { icon: row.base.icon, name: row.base.name } };
};

// The party screen the Splicer opens, or null.
export const spliceScreen = (s, h) => (s.ui?.getMode?.() === UiMode.PARTY && h?.partyUiMode === PartyUiMode.SPLICE ? h : null);

// The 🧬 card: with no first pick, the best fusions; once one is picked, the best partners for it, and a better
// fusion elsewhere (which means backing out and starting over).
export const fusionModel = (s, h) => {
  const party = tryDo(() => s.getPlayerParty().filter(Boolean), []) ?? [];
  const all = fusionOptions(s, { allowed: p => (typeof h.selectFilter === "function" ? h.selectFilter(p) : null) });
  const picked = h.transferMode && h.transferCursor >= 0 ? party[h.transferCursor] ?? null : null;
  const rows = (picked ? all.options.filter(f => f.a === picked) : all.options).slice(0, 3).map(fusionRow);
  const best = all.options[0] ? fusionRow(all.options[0]) : null;
  return {
    kind: "fusion", spliced: all.spliced, pickable: all.pickable,
    picked: picked ? { name: picked.name, icon: iconOf(picked) } : null,
    rows,
    better: picked && best?.fuse && (!rows[0] || best.value > rows[0].value + 2) ? best : null,
  };
};

// ---- How the card and its one-line summary word a fusion.
export const signed = n => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
export const fusionCall = m => {
  const top = m.rows[0];
  if (!top) return m.picked ? `nothing to fuse ${m.picked.name} with` : "no two members can be fused";
  if (m.better) return `back out: ${m.better.base.name} ← ${m.better.other.name} is better (${signed(m.better.value)})`;
  if (!top.fuse) return "no fusion worth a member — back out, the Splicer stays unspent";
  return m.picked ? `then pick ${top.other.name}` : `pick ${top.base.name} first, then ${top.other.name}`;
};

// `Garchomp ← Dragonite (+21) · pick Garchomp first, then Dragonite`, for the watcher and the battle read.
export const fusionSummary = m =>
  [m.rows[0] ? `${m.rows[0].base.name} ← ${m.rows[0].other.name} (${signed(m.rows[0].value)})` : null, fusionCall(m)].filter(Boolean).join(" · ");
