// Which two members a DNA Splicer should fuse, in which order, and whether any fusion is worth the member it spends.
// The pairs are ranked by the fusion judgment (#588), so this module scores nothing itself: it reads the run, orders
// what comes back and says it in words. Every read here is pure, so no `sandbox` (game-code.md §24).
import { TYPES, iconOf } from "./01-core.js";
import { judgeFusionPair } from "./12-value.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const nameOf = x => String(x?.name ?? "").replace(/ \((N|P)\)$/, "");

// A team-value figure in the tenth of a turn the judgment's margin is set in, which 46-encounter and 47-biome print
// the same way: the card's figures are the judgment's own, rounded once here and nowhere else.
const r1 = x => Math.round((x ?? 0) * 10) / 10;
export const signed = n => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;

const attacksOf = p => (p.moveset ?? []).filter(Boolean).map(pm => tryDo(() => pm.getMove())).filter(mv => mv && mv.category !== MoveCategory.STATUS && mv.power !== 0);
const baseOf = p => [...(tryDo(() => p.getSpeciesForm(true), p.species)?.baseStats ?? [])];
const bstOf = row => (row.length === 6 ? row.reduce((t, x) => t + x, 0) : null);
// What the base runs on now and what the fused mon would: the halves' mean, as `calculateStats` takes it
// (game-code.md §24), and under Spliced Endless an unfused mon runs on half its own row.
const bstPair = (a, b, spliced) => {
  const ra = baseOf(a), rb = baseOf(b);
  if (ra.length < 6 || rb.length < 6) return { before: null, after: null };
  return { before: bstOf(spliced ? ra.map(x => Math.ceil(x / 2)) : ra),
    after: bstOf(ra.map((x, i) => Math.ceil((x + rb[i]) / 2))) };
};

/**
 * One pair, as the card says it: `a` is the base and `b` the half it spends (CONTEXT.md, `Fusion`), and `j` is the
 * judgment on them.
 *
 * `value` is **ΔV** — what the party is worth with the fused mon in the base's slot and the other half's slot left
 * empty, against what it is worth now — and `net` is ΔV less what releasing the other half destroys, which is what
 * decides the call. The pairs are ranked by ΔV (#567, story 24).
 *
 * `why` is the judgment's own reasons, so a reason can never argue with the call it explains: each names a threat
 * whose answer, backup or exposure moved most. The rest — the typing, the ability, the BST, the moves the other half
 * offers — is `notes`: the fused mon's own description, which the duels behind the judgment have already priced
 * through the combatant adapter and which no longer scores anything here (#588, #589).
 */
const fusionOf = (a, b, j, spliced) => {
  const fused = j.fused?.combatant ?? null;
  const bst = bstPair(a, b, spliced);
  const ability = nameOf(fused?.getAbility?.()) || null;
  const known = new Set((a.moveset ?? []).map(m => m?.moveId));
  const offered = attacksOf(b).filter(mv => !known.has(mv.id)).map(nameOf);
  const items = j.cost?.items ?? 0;
  const evolves = [a, b].filter(p => tryDo(() => p.species.getEvolutionLevels().length, 0) > 0).map(p => p.name);
  const notes = [
    // The unit, said once on the line the figure is on: the row prints `signed(value)` alone, and a bare number on a
    // card whose other newcomer cards all say "turns" would read as the percent of a carry's power it used to be.
    // The spec charges a release for the other half's items while the game moves them over, which is why the figure
    // and the note below are both said: the one is what the judgment netted off, the other what the game does (#588).
    `ΔV ${signed(r1(j.delta))} turns${j.release ? `, net ${signed(r1(j.net))} after a ${Math.abs(r1(j.release)).toFixed(1)} release` : ""}`,
    `spends ${b.name} L${b.level}${b.hp > 0 ? "" : " (fainted)"}`,
    bst.before != null && bst.after != null && bst.before !== bst.after ? `${a.name} BST ${bst.before} → ${bst.after}` : null,
    offered.length ? `offers ${offered.slice(0, 2).join("/")}${offered.length > 2 ? ` +${offered.length - 2}` : ""}` : null,
    items ? `${items} held item${items > 1 ? "s" : ""} move over` : null,
    evolves.length ? `${evolves.join(" & ")} still evolve${evolves.length > 1 ? "" : "s"}` : null,
    a.hasPassive?.() ? `keeps passive ${nameOf(tryDo(() => a.getPassiveAbility()))}` : null,
  ].filter(Boolean);
  return {
    a, b, value: r1(j.delta), release: r1(j.release), net: r1(j.net), fuse: j.verdict === "fuse",
    types: (tryDo(() => fused.getTypes(), []) ?? []).map(t => TYPES[t]).filter(Boolean),
    ability, bst: bst.after,
    why: [...(j.plain ? [j.plain.text] : []), ...j.reasons.map(r => r.text)],
    notes, confidence: j.confidence ?? null,
  };
};

/**
 * Every pair the Splicer would take, best ΔV first. `allowed(p)` is the Splicer's select filter: null means pickable.
 *
 * It runs inside a run read, which is the only read that can ask the judgment at all, and the answers live in the
 * run's own memo rather than in a cache of this module's: the card's cache is gone (#589). The memo key holds what
 * varies within one run key (26-run.js) — which members the Splicer will take, and the form, ability, nature and
 * moveset the run key does not carry.
 *
 * `unread` is the first thing the judgment could not reach, for a card that has no pair to show and has to say why
 * rather than go quiet: the game's species table lands partway through a run, and until it does there is no threat
 * set to judge a fusion against.
 */
export const fusionOptions = (run, { allowed = () => null } = {}) => {
  const s = run.scene;
  const party = (run.facts?.party ?? []).filter(Boolean);
  const spliced = !!s?.gameMode?.isSplicedOnly;
  const pickable = party.filter(p => !p.fusionSpecies && tryDo(() => allowed(p), null) == null);
  const key = JSON.stringify([spliced, pickable.map(p => p.id), party.map(p => [p.id, p.species?.speciesId, p.formIndex,
    p.fusionSpecies?.speciesId ?? null, p.abilityIndex, p.level, p.hp > 0, p.nature, (p.moveset ?? []).map(m => m?.moveId)])]);
  return run.memo("fusion", key, () => build(run, party, pickable, spliced));
};

const build = (run, party, pickable, spliced) => {
  const options = [];
  let unread = null;
  for (const a of pickable) {
    for (const b of pickable) {
      if (a === b) continue;
      const j = tryDo(() => judgeFusionPair(run, a, b));
      if (!j) continue;
      // A pair the judgment refuses — a base that is dead weight, a half that is fused already — is no option at
      // all, and the threat set it could not read is the one thing a card with no options has to say.
      if (j.unavailable) { unread ??= j.unavailable; continue; }
      options.push(fusionOf(a, b, j, spliced));
    }
  }
  // Ranked by ΔV (#567, story 24), and stable, so two pairs worth the same fall to the base the party lists first.
  options.sort((x, y) => y.value - x.value);
  return { spliced, options, pickable: pickable.length, unread };
};

export const fusionRow = f => ({
  base: { name: f.a.name, icon: iconOf(f.a), level: f.a.level }, other: { name: f.b.name, icon: iconOf(f.b), level: f.b.level },
  value: f.value, release: f.release, net: f.net, fuse: f.fuse, types: f.types, ability: f.ability, bst: f.bst,
  why: f.why.slice(0, 2), notes: f.notes, confidence: f.confidence,
});

// `v` is on the rewards card's scale, about 10 a rarity tier. The figure it reads is the fusion's **net value** in
// turns, one point to the turn, which is 47-biome's own rate for the same judgment: a Splicer is worth a tier and a
// bit where a fusion clears the margin, and never the Master tier its rarity would hand it.
export const splicerReward = (run, t) => {
  if (!run) return { v: -6, why: "no team read here" };
  const { options, pickable, unread } = fusionOptions(run, { allowed: p => (typeof t?.selectFilter === "function" ? t.selectFilter(p) : null) });
  if (pickable < 2) return { v: -6, why: "nobody left to fuse" };
  if (!options.length) return { v: -6, why: unread ? `no team read here: ${unread}` : "nobody left to fuse" };
  const row = fusionRow(options[0]);
  const order = `${row.base.name} ← ${row.other.name}`;
  if (!row.fuse) return { v: -2, why: `no fusion worth a member · best ${order} ${signed(row.value)}` };
  return { v: 12 + Math.min(25, row.net), why: [`fuse ${order} · ${signed(row.value)}`, row.why[0]].filter(Boolean).join(" · "),
    holder: { icon: row.base.icon, name: row.base.name } };
};

export const spliceScreen = (s, h) => (s.ui?.getMode?.() === UiMode.PARTY && h?.partyUiMode === PartyUiMode.SPLICE ? h : null);

// The margin a pair has to clear is ΔV less the release, in turns, so two pairs can be within it of each other: the
// `better` prompt stays on the gap it was on, read in the judgment's unit rather than in percent of a carry's power.
const BETTER_BY = 0.2;

export const fusionModel = (run, h) => {
  const party = (run.facts?.party ?? []).filter(Boolean);
  const all = fusionOptions(run, { allowed: p => (typeof h.selectFilter === "function" ? h.selectFilter(p) : null) });
  const picked = h.transferMode && h.transferCursor >= 0 ? party[h.transferCursor] ?? null : null;
  const rows = (picked ? all.options.filter(f => f.a === picked) : all.options).slice(0, 3).map(fusionRow);
  const best = all.options[0] ? fusionRow(all.options[0]) : null;
  return {
    kind: "fusion", spliced: all.spliced, pickable: all.pickable, unread: all.unread ?? null,
    picked: picked ? { name: picked.name, icon: iconOf(picked) } : null,
    rows,
    better: picked && best?.fuse && (!rows[0] || best.value > rows[0].value + BETTER_BY) ? best : null,
  };
};

export const fusionCall = m => {
  const top = m.rows[0];
  if (!top) {
    if (m.unread) return `no team read here: ${m.unread}`;
    return m.picked ? `nothing to fuse ${m.picked.name} with` : "no two members can be fused";
  }
  if (m.better) return `back out: ${m.better.base.name} ← ${m.better.other.name} is better (${signed(m.better.value)})`;
  // Story 25: no pair clears the margin, so the member is spent for nothing and the Splicer is better left unspent.
  if (!top.fuse) return "no fusion worth a member — back out, the Splicer stays unspent";
  return m.picked ? `then pick ${top.other.name}` : `pick ${top.base.name} first, then ${top.other.name}`;
};

export const fusionSummary = m =>
  [m.rows[0] ? `${m.rows[0].base.name} ← ${m.rows[0].other.name} (${signed(m.rows[0].value)})` : null, fusionCall(m)].filter(Boolean).join(" · ");
