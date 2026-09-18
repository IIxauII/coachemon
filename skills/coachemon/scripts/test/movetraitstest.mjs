// Move traits (07-move-traits): one row per trait kind read off a move's attributes, the user modifiers that change
// them (Magic Guard, Rock Head, Skill Link, Parental Bond, Multi-Lens), the guaranteed-chance gate, `charge.skip`
// and the `costNotes` wording every card shares. Nothing here touches battle state — that is the point of the
// module, so the scene is a stub and no game call is made.
// Usage: node test/movetraitstest.mjs
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { MoveTarget, MultiHitType, MoveFlags, StatusEffect, Stat, SpeciesId, MoveId } from "../../../../src/enums/generated.ts";

// The HUD matches an attribute through its prototype chain, so a stand-in carries its parent where the game
// subclasses (a WeatherInstantChargeAttr *is* an InstantChargeAttr).
const PARENTS = { WeatherInstantChargeAttr: "InstantChargeAttr", BoostHealAttr: "HealAttr", PlantHealAttr: "HealAttr", LeechSeedAttr: "AddBattlerTagAttr", ProtectAttr: "AddBattlerTagAttr" };
const classFor = name => {
  const parent = PARENTS[name] ? classFor(PARENTS[name]) : null;
  const C = parent ? class extends parent {} : class {};
  Object.defineProperty(C, "name", { value: name });
  return C;
};
// "Name", or ["Name", { fields }].
const attr = a => (typeof a === "string" ? new (classFor(a))() : Object.assign(new (classFor(a[0]))(), a[1]));
const move = ({ id = 1, name = "Move", attrs = [], chargeAttrs = [], conditions = [], restrictions = [], flags = 0,
  target = MoveTarget.NEAR_OTHER, chance = -1, charging = false, moveTarget } = {}) => ({
  id, name, chance, moveTarget: moveTarget ?? target, flags, attrs: attrs.map(attr), chargeAttrs: chargeAttrs.map(attr),
  conditions: conditions.map(attr), conditionsSeq2: [], conditionsSeq3: [], restrictions,
  hasFlag(f) { return (this.flags & f) !== 0; }, isChargingMove: () => charging,
  canBeMultiStrikeEnhanced: () => !attrs.some(a => (typeof a === "string" ? a : a[0]) === "MultiHitAttr"),
});
const mon = ({ id = "user", abilities = [], items = [], species = 1, formIndex = 0, status = null } = {}) => ({
  id, species: { speciesId: species }, formIndex, status,
  hasAbilityWithAttr: a => abilities.includes(a), getHeldItems: () => items,
});
const lens = n => Object.assign(new (classFor("PokemonMultiHitModifier"))(), { getStackCount: () => n });

// The module is bundled with the rest of the HUD, so eval needs the page globals the panel touches on load.
globalThis.window = globalThis;
globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [] } } } };
const node = () => { const n = { style: {}, dataset: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren() {} }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "off", setItem() {} };
eval(bundle("hud", { expose: true }));
const { moveTraits, costNotes } = globalThis.__hud["07-move-traits"];

const log = (label, x) => console.log(`${label}: ${x}`);
const counts = t => t.hits.dist.map(x => `${x.n}@${x.p}`).join(" ");

// ---- Turns and failure
{
  const sky = move({ name: "Sky Attack", charging: true });
  const fly = move({ name: "Fly", charging: true, chargeAttrs: ["SemiInvulnerableAttr"] });
  const sun = attr(["WeatherInstantChargeAttr", { weatherTypes: [3, 4], condition: u => u.id === "in sun" }]);
  const solar = move({ name: "Solar Beam", charging: true, chargeAttrs: [] });
  solar.chargeAttrs = [sun];

  const t = moveTraits(sky);
  assert.ok(t.charge && !t.charge.skip && !t.semiCharge, "a plain charging move spends a turn and hides nowhere");
  assert.ok(moveTraits(fly).semiCharge, "Fly is semi-invulnerable meanwhile");
  const st = moveTraits(solar, mon());
  assert.deepEqual(st.charge.skip, { weather: [3, 4] }, "the instant-charge condition comes back as data");
  assert.equal(st.charge.now(mon()), false, "…and is judged against a live user");
  assert.equal(st.charge.now(mon({ id: "in sun" })), true);
  log("charge", `${!!t.charge} · semi ${moveTraits(fly).semiCharge} · skip ${JSON.stringify(st.charge.skip)} · now ${st.charge.now(mon({ id: "in sun" }))}`);

  assert.equal(moveTraits(move({ attrs: ["RechargeAttr"] })).recharge, true);
  assert.equal(moveTraits(move({ attrs: ["PreUseInterruptAttr"] })).interrupt, true);
  assert.equal(moveTraits(move({ id: MoveId.SUCKER_PUNCH })).needsAttack, true, "Sucker Punch reads the target's command");
  assert.equal(moveTraits(move({ id: MoveId.THUNDERCLAP })).needsAttack, true);
  assert.equal(moveTraits(move({ id: MoveId.TACKLE })).needsAttack, false);
  // The game hangs FirstMoveCondition off any of the three condition lists.
  const fakeOut = move({ name: "Fake Out", conditions: ["FirstMoveCondition"] });
  const seq3 = move({ name: "First Impression" });
  seq3.conditionsSeq3 = [attr("FirstMoveCondition")];
  assert.equal(moveTraits(fakeOut).once, true);
  assert.equal(moveTraits(seq3).once, true, "conditionsSeq3 counts too");
  assert.equal(moveTraits(move({ attrs: ["FrenzyAttr"] })).lock, true);
  assert.equal(moveTraits(move({ restrictions: [{ i18nkey: "battle:moveDisabledConsecutive" }] })).noRepeat, true);
  assert.equal(moveTraits(move({ restrictions: [{ i18nkey: "battle:moveDisabledSomethingElse" }] })).noRepeat, false, "the exact i18n key, not a pattern");
  log("turns", `recharge ${moveTraits(move({ attrs: ["RechargeAttr"] })).recharge} · once ${moveTraits(fakeOut).once} · noRepeat ${moveTraits(move({ restrictions: [{ i18nkey: "battle:moveDisabledConsecutive" }] })).noRepeat}`);
}

// ---- What it costs its user
{
  const braveBird = move({ name: "Brave Bird", attrs: [["RecoilAttr", { damageRatio: 0.33 }]] });
  const bare = move({ name: "Take Down", attrs: ["RecoilAttr"] });
  const chloroblast = move({ name: "Chloroblast", attrs: [["RecoilAttr", { useHp: true, damageRatio: 0.5 }]] });
  const struggle = move({ name: "Struggle", attrs: [["RecoilAttr", { useHp: true, damageRatio: 0.25, unblockable: true }]] });
  assert.equal(moveTraits(bare).recoil.ratio, 0.25, "RecoilAttr's own default, not a copy of it");
  assert.deepEqual(moveTraits(braveBird).recoil, { ratio: 0.33, useHp: false, blocked: false });
  assert.equal(moveTraits(braveBird, mon({ abilities: ["BlockRecoilDamageAttr"] })).recoil.blocked, true, "Rock Head, by ability attr");
  assert.equal(moveTraits(braveBird, mon({ abilities: ["BlockNonDirectDamageAbAttr"] })).recoil.blocked, true, "Magic Guard");
  assert.equal(moveTraits(struggle, mon({ abilities: ["BlockNonDirectDamageAbAttr"] })).recoil.blocked, false, "unblockable recoil goes through");
  assert.equal(moveTraits(chloroblast).recoil.useHp, true);
  log("recoil", `${JSON.stringify(moveTraits(braveBird).recoil)} · blocked ${moveTraits(braveBird, mon({ abilities: ["BlockRecoilDamageAttr"] })).recoil.blocked}`);

  const steelBeam = move({ name: "Steel Beam", attrs: ["HalfSacrificialAttr"] });
  const hjk = move({ name: "High Jump Kick", attrs: ["MissEffectAttr"] });
  const outrage = move({ name: "Outrage", attrs: ["FrenzyAttr", "MissEffectAttr"] });
  assert.equal(moveTraits(steelBeam).halfSac, true);
  assert.equal(moveTraits(steelBeam, mon({ abilities: ["BlockNonDirectDamageAbAttr"] })).halfSac, false, "Magic Guard pays nothing");
  assert.equal(moveTraits(hjk).crash, true);
  assert.equal(moveTraits(outrage).crash, false, "a frenzy move's miss effect only ends its lock");
  assert.equal(moveTraits(move({ attrs: ["SacrificialAttr"] })).selfKo, "always");
  assert.equal(moveTraits(move({ attrs: ["SacrificialAttrOnHit"] })).selfKo, "onHit");
  assert.equal(moveTraits(move({ attrs: ["RemoveTypeAttr"] })).removesType, true);
  log("hp", `halfSac ${moveTraits(steelBeam).halfSac} · crash ${moveTraits(hjk).crash} · Outrage crash ${moveTraits(outrage).crash} · selfKo ${moveTraits(move({ attrs: ["SacrificialAttrOnHit"] })).selfKo}`);

  // Guaranteed self stat changes only: a chance between 1 and 99 rolls for them.
  const overheat = move({ name: "Overheat", attrs: [["StatStageChangeAttr", { stats: [Stat.SPATK], stages: -2, selfTarget: true }]] });
  const closeCombat = move({ name: "Close Combat", attrs: [["StatStageChangeAttr", { stats: [Stat.DEF, Stat.SPDEF], stages: -1, selfTarget: true }]] });
  const rollsIt = move({ name: "Power-Up Punch", chance: 30, attrs: [["StatStageChangeAttr", { stats: [Stat.ATK], stages: 1, selfTarget: true }]] });
  const flameCharge = move({ name: "Flame Charge", chance: 100, attrs: [["StatStageChangeAttr", { stats: [Stat.SPD], stages: 1, selfTarget: true }]] });
  assert.deepEqual(moveTraits(overheat).drops, { [Stat.SPATK]: -2 });
  assert.deepEqual(moveTraits(closeCombat).drops, { [Stat.DEF]: -1, [Stat.SPDEF]: -1 });
  assert.deepEqual(moveTraits(rollsIt).drops, {}, "a 30 % chance isn't guaranteed");
  assert.deepEqual(moveTraits(flameCharge).drops, { [Stat.SPD]: 1 }, "a guaranteed boost is in `drops` too, signed");
  log("drops", `${JSON.stringify(moveTraits(closeCombat).drops)} · rolled ${JSON.stringify(moveTraits(rollsIt).drops)} · boost ${JSON.stringify(moveTraits(flameCharge).drops)}`);
}

// ---- Hit shape: one model for every card
{
  const twoToFive = move({ name: "Bullet Seed", attrs: [["MultiHitAttr", { multiHitType: MultiHitType.TWO_TO_FIVE }]] });
  const t = moveTraits(twoToFive, mon());
  assert.deepEqual(t.hits.dist, [{ n: 2, p: 0.35 }, { n: 3, p: 0.35 }, { n: 4, p: 0.15 }, { n: 5, p: 0.15 }]);
  assert.equal(t.hits.mean, 3.1, "the distribution's mean is the 3.1 the cards print");
  assert.equal(moveTraits(twoToFive, mon({ abilities: ["MaxMultiHitAbAttr"] })).hits.mean, 5, "Skill Link takes the maximum");
  const axel = move({ name: "Triple Axel", flags: MoveFlags.CHECK_ALL_HITS, attrs: [["MultiHitAttr", { multiHitType: MultiHitType.THREE }], "MultiHitPowerIncrementAttr"] });
  const at = moveTraits(axel, mon());
  assert.deepEqual([at.hits.mean, at.hits.checkAll, at.hits.grows], [3, true, true]);
  assert.equal(moveTraits(axel, mon({ abilities: ["MaxMultiHitAbAttr"] })).hits.checkAll, false, "Skill Link skips the per-hit checks");
  assert.equal(moveTraits(move({ attrs: [["MultiHitAttr", { multiHitType: MultiHitType.TEN }]] }), mon()).hits.mean, 10);

  // Beat Up counts the user plus every party member with no status, the way the game does — a fainted member too.
  const party = [mon({ id: "user" }), mon({ id: "fine" }), mon({ id: "poisoned", status: { effect: StatusEffect.POISON } }), mon({ id: "fainted", status: { effect: StatusEffect.FAINT } })];
  const beatUp = move({ name: "Beat Up", attrs: [["MultiHitAttr", { multiHitType: MultiHitType.BEAT_UP }]] });
  assert.equal(moveTraits(beatUp, party[0], { party }).hits.mean, 2, "the user and the one healthy member");

  // Extra strikes: Parental Bond adds one, each Multi-Lens stack one, and neither touches a multi-hit move.
  const tackle = move({ name: "Tackle" });
  assert.equal(moveTraits(tackle, mon({ abilities: ["AddSecondStrikeAbAttr"] })).hits.mean, 2);
  assert.equal(moveTraits(tackle, mon({ items: [lens(2)] })).hits.mean, 3);
  assert.equal(moveTraits(twoToFive, mon({ items: [lens(2)] })).hits.mean, 3.1, "a multi-hit move takes no lens strikes");
  // Ash-Greninja's Water Shuriken is three hits, not two to five.
  const shuriken = move({ name: "Water Shuriken", attrs: [["MultiHitAttr", { multiHitType: MultiHitType.TWO_TO_FIVE }], "ChangeMultiHitTypeAttr"] });
  assert.equal(moveTraits(shuriken, mon({ species: SpeciesId.GRENINJA, formIndex: 2 })).hits.mean, 3);
  log("hits", `2–5 ${counts(t)} · Skill Link ${moveTraits(twoToFive, mon({ abilities: ["MaxMultiHitAbAttr"] })).hits.mean} · Beat Up ${moveTraits(beatUp, party[0], { party }).hits.mean} · lens ${moveTraits(tackle, mon({ items: [lens(2)] })).hits.mean}`);
}

// ---- Status effects, as data
{
  const willowisp = move({ name: "Will-O-Wisp", attrs: [["StatusEffectAttr", { effect: StatusEffect.BURN }]] });
  const rest = move({ name: "Rest", target: MoveTarget.USER, attrs: [["StatusEffectAttr", { effect: StatusEffect.SLEEP, selfTarget: true }]] });
  assert.deepEqual(moveTraits(willowisp).inflicts.map(x => [x.effect, x.self, x.side]), [[StatusEffect.BURN, false, false]]);
  assert.equal(moveTraits(rest).inflicts[0].self, true);

  // Howl's attr carries no `selfTarget`: only the move's target says it is aimed at our own side. An ally-only move
  // is on that side too, but it is the partner's stats that move — the flags keep the two apart.
  const howl = move({ name: "Howl", target: MoveTarget.USER_AND_ALLIES, attrs: [["StatStageChangeAttr", { stats: [Stat.ATK], stages: 1 }]] });
  const decorate = move({ name: "Decorate", target: MoveTarget.NEAR_ALLY, attrs: [["StatStageChangeAttr", { stats: [Stat.ATK, Stat.SPATK], stages: 2 }]] });
  assert.deepEqual(moveTraits(howl).stages.map(x => [x.self, x.side, x.ally]), [[false, true, false]]);
  assert.deepEqual(moveTraits(decorate).stages.map(x => [x.self, x.side, x.ally]), [[false, true, true]]);
  // Belly Drum's stages are a function of the user, and its HP cost is its own trait.
  const bellyDrum = move({ name: "Belly Drum", target: MoveTarget.USER, attrs: [["StatStageChangeAttr", { stats: [Stat.ATK], selfTarget: true, getLevels: () => 6 }], ["CutHpStatStageBoostAttr", { cutRatio: 2 }]] });
  assert.equal(moveTraits(bellyDrum, mon()).stages[0].stages, 6, "getLevels answers for the user");
  assert.deepEqual(moveTraits(bellyDrum, mon()).cutHp, { ratio: 2 });

  const recover = move({ name: "Recover", target: MoveTarget.USER, attrs: [["HealAttr", { healRatio: 0.5, selfTarget: true }]] });
  const synthesis = move({ name: "Synthesis", target: MoveTarget.USER, attrs: [["PlantHealAttr", { healRatio: 0.5, selfTarget: true, getWeatherHealRatio: w => (w === 3 ? 0.667 : 0.25) }]] });
  assert.deepEqual([moveTraits(recover).heal.ratio, moveTraits(recover).heal.cls], [0.5, "HealAttr"]);
  assert.equal(moveTraits(synthesis).heal.ratioIn(3), 0.667, "the weather ratio is the attribute's own answer");
  assert.equal(moveTraits(synthesis).heal.cls, "PlantHealAttr", "…and the concrete class says which heal it is");

  const spikes = move({ name: "Spikes", target: MoveTarget.ENEMY_SIDE, attrs: [["AddArenaTrapTagAttr", { tagType: "SPIKES" }]] });
  assert.deepEqual(moveTraits(spikes).hazard, { tag: "SPIKES" });
  assert.equal(moveTraits(move({ name: "Protect", target: MoveTarget.USER, attrs: ["ProtectAttr"] })).protect, true);
  assert.equal(moveTraits(move({ name: "Iron Head", attrs: ["FlinchAttr"] })).flinches, true);

  // A subclass counts as its parent, and `cls` keeps them apart for a caller whose table is keyed by the concrete
  // class: Leech Seed is a battler tag, but it is valued as Leech Seed, not as a bare tag.
  const leechSeed = move({ name: "Leech Seed", attrs: [["LeechSeedAttr", { tagType: "SEEDED" }]] });
  assert.deepEqual(moveTraits(leechSeed).tags.map(x => [x.tag, x.cls]), [["SEEDED", "LeechSeedAttr"]]);
  assert.ok(moveTraits(leechSeed).attrNames.has("LeechSeedAttr") && !moveTraits(leechSeed).attrNames.has("AddBattlerTagAttr"), "attrNames holds the concrete class only");

  // Typing written onto the target: Soak replaces its types with one, Trick-or-Treat adds a third. Whether the move
  // would do anything (a Tera target, Multitype, a typing it already has) is the caller's, live: that is the
  // attribute's condition, not its data.
  const soak = move({ name: "Soak", attrs: [["ChangeTypeAttr", { type: 10 }]] });
  const trickOrTreat = move({ name: "Trick-or-Treat", attrs: [["AddTypeAttr", { type: 7 }]] });
  assert.deepEqual(moveTraits(soak).typeChange, { kind: "set", type: 10 });
  assert.deepEqual(moveTraits(trickOrTreat).typeChange, { kind: "add", type: 7 });
  assert.equal(moveTraits(move({ name: "Tackle" })).typeChange, null);

  const gigaDrain = move({ name: "Giga Drain", attrs: [["HitHealAttr", { healRatio: 0.5 }]] });
  const strengthSap = move({ name: "Strength Sap", attrs: [["HitHealAttr", { healStat: Stat.ATK }]] });
  assert.deepEqual(moveTraits(gigaDrain).drain, { ratio: 0.5 });
  assert.equal(moveTraits(strengthSap).drain, null, "healing by a stat isn't drain");
  log("status", `burn ${moveTraits(willowisp).inflicts[0].effect} · Howl side ${moveTraits(howl).stages[0].side} · heal ${moveTraits(recover).heal.ratio} · hazard ${moveTraits(spikes).hazard.tag} · drain ${moveTraits(gigaDrain).drain.ratio} · types ${moveTraits(soak).typeChange.kind}/${moveTraits(trickOrTreat).typeChange.kind}`);
}

// ---- The wording every card shares
{
  const say = (mv, user, amounts) => costNotes(moveTraits(mv, user), amounts);
  const solar = move({ name: "Solar Beam", charging: true, chargeAttrs: [["WeatherInstantChargeAttr", { weatherTypes: [3] }]] });
  assert.deepEqual(say(move({ name: "Fly", charging: true, chargeAttrs: ["SemiInvulnerableAttr"] })), ["two-turn (dodges)"]);
  assert.deepEqual(say(move({ charging: true })), ["charge turn"]);
  assert.deepEqual(say(solar, null, { sun: true }), ["charge turn (skipped in sun)"]);
  assert.deepEqual(say(solar, null, { sun: false }), ["charge turn (not in sun)"]);
  assert.deepEqual(say(move({ attrs: ["RechargeAttr"] })), ["recharge turn"]);
  assert.deepEqual(say(move({ attrs: ["PreUseInterruptAttr"] })), ["fails if hit first"]);
  assert.deepEqual(say(move({ id: MoveId.SUCKER_PUNCH })), ["fails unless the foe attacks"]);
  assert.deepEqual(say(move({ conditions: ["FirstMoveCondition"] })), ["first turn only"]);
  assert.deepEqual(say(move({ attrs: ["FrenzyAttr"] })), ["locks 2–3 turns, then confused"]);
  assert.deepEqual(say(move({ restrictions: [{ i18nkey: "battle:moveDisabledConsecutive" }] })), ["not twice in a row"]);
  assert.deepEqual(say(move({ attrs: [["RecoilAttr", { damageRatio: 0.33 }]] })), ["recoil 33% of damage"]);
  assert.deepEqual(say(move({ attrs: [["RecoilAttr", { useHp: true, damageRatio: 0.5 }]] })), ["−50% HP each use"]);
  assert.deepEqual(say(move({ attrs: ["RecoilAttr"] }), mon({ abilities: ["BlockRecoilDamageAttr"] })), ["recoil (blocked)"]);
  // With this matchup's numbers at hand (10-damage has them), recoil is named as the share of the user's HP it takes.
  assert.deepEqual(say(move({ attrs: ["RecoilAttr"] }), null, { recoil: 0.18 }), ["recoil ≈−18%"]);
  assert.deepEqual(say(move({ attrs: ["HalfSacrificialAttr"] })), ["−50% HP each use"]);
  assert.deepEqual(say(move({ attrs: ["MissEffectAttr"] })), ["−50% HP if it misses"]);
  assert.deepEqual(say(move({ attrs: ["SacrificialAttr"] })), ["user faints"]);
  assert.deepEqual(say(move({ attrs: ["RemoveTypeAttr"] }), null, { type: "Fire" }), ["loses its Fire type"]);
  // Stats that fall by the same amount are named together; a guaranteed boost is no cost at all.
  assert.deepEqual(say(move({ attrs: [["StatStageChangeAttr", { stats: [Stat.DEF, Stat.SPDEF], stages: -1, selfTarget: true }]] })), ["−1 Def/SpD after use"]);
  assert.deepEqual(say(move({ attrs: [["StatStageChangeAttr", { stats: [Stat.SPATK], stages: -2, selfTarget: true }]] })), ["−2 SpA after use"]);
  assert.deepEqual(say(move({ chance: 100, attrs: [["StatStageChangeAttr", { stats: [Stat.SPD], stages: 1, selfTarget: true }]] })), []);
  assert.deepEqual(say(move({ name: "Tackle" })), [], "a move with nothing to pay says nothing");
  // Every cost of one move, in the order a reader meets them: the turns, then the HP, then the stats.
  const brutal = move({ name: "Everything", attrs: ["RechargeAttr", ["RecoilAttr", { damageRatio: 0.33 }], ["StatStageChangeAttr", { stats: [Stat.SPATK], stages: -2, selfTarget: true }]] });
  log("costs", costNotes(moveTraits(brutal)).join(" · "));
  assert.deepEqual(costNotes(null), [], "no traits, nothing to say");
}

console.log("move traits: ok");
