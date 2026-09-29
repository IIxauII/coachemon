// Which two members a DNA Splicer should fuse, in which order, and whether any fusion is worth the member it spends.
// Every read here is pure, so no `sandbox` (game-code.md §24).
import { TYPES, abilityValue, iconOf, natureOf, vs } from "./01-core.js";

export const FUSE_MIN = 5;
const W_OFF = 0.45, W_BULK = 0.35, W_SPE = 0.2;
const RANK = [1, 0.8, 0.55, 0.35, 0.2, 0.1], FAINTED_SHARE = 0.7, REFILL = 0.8;
const TYPE_POINT = 1.5, STAB_SWING = 12;
const ATK_DOUBLED = new Set(["Huge Power", "Pure Power"]);

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const nameOf = x => String(x?.name ?? "").replace(/ \((N|P)\)$/, "");

const abilityOf = p => tryDo(() => p.getAbility(true));
const worksFused = ab => !(ab?.attrs ?? []).some(a => a?.constructor?.name === "NoFusionAbilityAbAttr");

const halfOf = p => {
  const form = tryDo(() => p.getSpeciesForm(true), p.species);
  const custom = p.customPokemonData?.types ?? [];
  return { stats: [...(form?.baseStats ?? [])], type1: custom[0] ?? form?.type1, type2: custom[1] ?? form?.type2 ?? null };
};
// `getBaseTypes`' fusion rule, re-implemented (game-code.md §24).
const fusedTypes = (a, b) => {
  let second = a.type2;
  if (b.type2 != null && b.type2 !== a.type1) second = b.type2;
  else if (b.type1 !== a.type1) second = b.type1;
  return [a.type1, second].filter((t, i, xs) => t != null && t >= 0 && xs.indexOf(t) === i).map(t => TYPES[t]).filter(Boolean);
};

// `calculateStats` without held items, re-implemented (game-code.md §24).
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

const partyValue = powers => [...powers].sort((x, y) => y - x).reduce((t, v, i) => t + v * (RANK[i] ?? 0), 0);
const memberPower = (p, spliced) => {
  let base = halfOf(p).stats;
  const fu = p.fusionSpecies ? tryDo(() => p.getFusionSpeciesForm(true), p.fusionSpecies) : null;
  if (fu?.baseStats?.length === 6) base = base.map((x, i) => Math.ceil((x + fu.baseStats[i]) / 2));
  else if (spliced) base = base.map(x => Math.ceil(x / 2));
  if (base.length < 6) return 0;
  return powerOf(statsAt(base, p), nameOf(abilityOf(p))) * (p.hp > 0 ? 1 : FAINTED_SHARE);
};

const defenceOf = types => TYPES.reduce((t, atk) => t - Math.log2(Math.max(0.25, types.reduce((m, d) => m * vs(atk, d), 1))), 0);

const attacksOf = p => (p.moveset ?? []).filter(Boolean).map(pm => tryDo(() => pm.getMove())).filter(mv => mv && mv.category !== MoveCategory.STATUS && mv.power !== 0);

// `a` is the base, picked first (CONTEXT.md, `Fusion`). `ctx`: `{ party, powers, carryPower, refill, spliced, held }`.
// `value` is the party's value after against before, in percent of the carry's power.
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

  // Alive when either half is: HP becomes the halves' mean share (game-code.md §24).
  const raw = powerOf(statsAt(fusedBase, a), nameB) * (a.hp > 0 || b.hp > 0 ? 1 : FAINTED_SHARE);
  const fused = raw * Math.max(0.2, 1 + (typing + ability) / 100);
  const pa = ctx.powers.get(a), pb = ctx.powers.get(b);
  const rest = ctx.party.filter(p => p !== a && p !== b).map(p => ctx.powers.get(p));
  const value = pct(partyValue([...rest, fused, ctx.refill]) - partyValue([...rest, pa, pb]));

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

// `allowed(p)` is the Splicer's select filter: null means pickable. The cache key holds everything the scoring reads.
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

export const fusionRow = f => ({
  base: { name: f.a.name, icon: iconOf(f.a), level: f.a.level }, other: { name: f.b.name, icon: iconOf(f.b), level: f.b.level },
  value: Math.round(f.value), fuse: f.value >= FUSE_MIN, types: f.types, ability: f.ability, bst: f.bst,
  why: f.why.filter(r => !r.quiet).slice(0, 3).map(r => r.text), notes: f.notes,
});

// `v` is on the rewards card's scale, about 10 a rarity tier.
export const splicerReward = (s, t) => {
  const { options, pickable } = fusionOptions(s, { allowed: p => (typeof t?.selectFilter === "function" ? t.selectFilter(p) : null) });
  if (pickable < 2 || !options.length) return { v: -6, why: "nobody left to fuse" };
  const row = fusionRow(options[0]);
  const order = `${row.base.name} ← ${row.other.name}`;
  if (!row.fuse) return { v: -2, why: `no fusion worth a member · best ${order} ${row.value >= 0 ? "+" : "−"}${Math.abs(row.value)}` };
  return { v: 12 + Math.min(25, row.value), why: [`fuse ${order} · +${row.value}`, row.why[0]].filter(Boolean).join(" · "),
    holder: { icon: row.base.icon, name: row.base.name } };
};

export const spliceScreen = (s, h) => (s.ui?.getMode?.() === UiMode.PARTY && h?.partyUiMode === PartyUiMode.SPLICE ? h : null);

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

export const signed = n => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
export const fusionCall = m => {
  const top = m.rows[0];
  if (!top) return m.picked ? `nothing to fuse ${m.picked.name} with` : "no two members can be fused";
  if (m.better) return `back out: ${m.better.base.name} ← ${m.better.other.name} is better (${signed(m.better.value)})`;
  if (!top.fuse) return "no fusion worth a member — back out, the Splicer stays unspent";
  return m.picked ? `then pick ${top.other.name}` : `pick ${top.base.name} first, then ${top.other.name}`;
};

export const fusionSummary = m =>
  [m.rows[0] ? `${m.rows[0].base.name} ← ${m.rows[0].other.name} (${signed(m.rows[0].value)})` : null, fusionCall(m)].filter(Boolean).join(" · ");
