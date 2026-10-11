// The next big fight, and whether the party is ready for it. Nothing here draws: the schedule is the run calendar's,
// and the roster is `previewFor`'s replay.
import { TIER_NAMES, abilitiesOf } from "./01-core.js";
import { stage } from "./01-meter.js";
import { bigFightsAhead, isBossWave, isGruntWave, nextHeal } from "./03-calendar.js";
import { gameEvents } from "./04-game-tables.js";
import { partyAtFight, partyLuck, partyProfile } from "./08-party.js";
import { previewFor } from "./48-preview.js";

const LOOKAHEAD = 5;
const FINAL_NOTICE = 10;
const KIND_LABEL = { final: "final boss", fixed: "fixed battle", gym: "gym leader", boss: "boss" };

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

const LUCK_GRADES = ["D", "C", "C+", "B-", "B", "B+", "A-", "A", "A+", "A++", "S", "S+", "SS", "SS+", "SSS"];
// The luck loop's first roll: one reward's chance of at least one tier upgrade (game-code.md §12).
const upgradeChance = luck => 4 / Math.floor(128 / ((luck + 4) / 4));

// A fixed battle's pinned reward tiers (game-code.md §12), or null for a free roll.
const rewardRules = (s, wave) => {
  const cfg = tryDo(() => (s.gameMode?.isFixedBattle?.(wave) ? s.gameMode.getFixedBattle(wave) : null));
  const custom = cfg?.customModifierRewardSettings;
  if (!custom) return null;
  const tiers = (custom.guaranteedModifierTiers ?? []).map(t => TIER_NAMES[t] ?? `tier ${t}`);
  if (!tiers.length && custom.allowLuckUpgrades !== false) return null;
  return { tiers, luckUpgrades: custom.allowLuckUpgrades !== false };
};

const DOUBLE_HORIZON = 10;
const DOUBLE_ABILITIES = ["Illuminate", "Arena Trap", "No Guard", "Commander"];
const GRUNT_DOUBLE = 1 / 3;
// The expected share of double battles over the next `n` waves (game-code.md §16): a fixed battle at its config's
// `double`, a grunt wave at its unseeded 1/3 (§12).
export const doubleOdds = (s, from, n = DOUBLE_HORIZON) => stage("odds", () => {
  const gm = s?.gameMode;
  const lures = (s?.modifiers ?? []).filter(m => m?.constructor?.name === "DoubleBattleChanceBoosterModifier")
    .map(m => tryDo(() => m.getBattleCount(), m.battleCount ?? 0));
  const field = tryDo(() => s.getPlayerField(), null) ?? tryDo(() => s.getPlayerParty().filter(Boolean).slice(0, 1), []);
  const abilities = field.filter(p => tryDo(() => p.hasAbilityWithAttr("DoubleBattleChanceAbAttr"), null)
    ?? tryDo(() => abilitiesOf(p).some(a => DOUBLE_ABILITIES.includes(a)), false)).length;
  let doubles = 0;
  for (let i = 0; i < n; i++) {
    const w = from + i;
    if (tryDo(() => gm.isWaveFinal(w), false) || tryDo(() => gm.isEndlessBoss(w), false)) continue;
    const fixed = tryDo(() => (gm.isFixedBattle(w) ? gm.getFixedBattle(w) : null));
    if (fixed) { doubles += fixed.double === true ? 1 : fixed.double == null && isGruntWave(w) ? GRUNT_DOUBLE : 0; continue; }
    const lured = lures.filter(left => left > i).length;
    doubles += 1 / Math.max(1, (isBossWave(s, w) ? 32 : 8) / 4 ** (lured + abilities));
  }
  return doubles / n;
});

const readiness = (model, profile) => {
  const foes = model?.foes ?? [];
  const party = profile.members;
  if (!foes.length || !party.length) return null;
  const ourLevel = Math.max(...party.map(p => p.level ?? 1));
  const theirLevel = Math.max(...foes.map(f => f.level ?? 0));
  const answering = foes.map(f => new Set(profile.hitters(f)));
  const unanswered = foes.filter((_, i) => !answering[i].size);
  const hitters = party.filter(p => answering.some(set => set.has(p))).map(p => p.name);
  const theirTypes = [...new Set(foes.flatMap(f => (f.attackTypes?.length ? f.attackTypes : f.types) ?? []))];
  const threats = theirTypes.map(t => ({ type: t, n: profile.weakTo(t).length }))
    .filter(x => x.n >= Math.max(2, Math.ceil(party.length / 2))).sort((a, b) => b.n - a.n);
  const bars = foes.reduce((t, f) => t + Math.max(0, (f.segments ?? 0) - 1), 0);

  const notes = [];
  if (unanswered.length) {
    notes.push({ good: false, text: `nothing hits ${unanswered.slice(0, 2).map(f => f.name).join("/")} super-effectively` });
  }
  if (theirLevel > ourLevel) notes.push({ good: false, text: `they're +${theirLevel - ourLevel} levels on us` });
  else if (ourLevel - theirLevel >= 5) notes.push({ good: true, text: `we're +${ourLevel - theirLevel} levels on them` });
  if (threats.length) notes.push({ good: false, text: `${threats[0].n} of us weak to ${threats[0].type}` });
  if (hitters.length >= 2) notes.push({ good: true, text: `${hitters.length} mons hit super-effectively` });
  else if (hitters.length === 1) notes.push({ good: false, text: `only ${hitters[0]} hits super-effectively` });
  if (bars) notes.push({ good: false, text: `${bars} extra health ${bars === 1 ? "bar" : "bars"} to break` });

  const bad = unanswered.length + (theirLevel > ourLevel ? 1 : 0) + threats.length + (hitters.length ? 0 : 1);
  return {
    verdict: bad === 0 ? "ready" : bad === 1 ? "watch" : "risky",
    levelGap: ourLevel - theirLevel, ourLevel, theirLevel, bars,
    unanswered: unanswered.map(f => f.name), hitters, threats: threats.slice(0, 2), notes,
    sure: model.confidence?.foes === "exact",
  };
};

// The classic final boss, all read and none rolled (game-code.md §12).
const ETERNATUS_FACTS = [
  { good: false, text: "phase 1 can't be KO'd — damage is capped at 1 HP, so it always reaches Eternamax" },
  { good: false, text: "Eternamax steals one held item per turn (Mini Black Hole) and the fight turns double" },
  // `new PokemonMove(MoveId.RECOVER, 0, -4)`'s −4 is `ppUp`, not priority: this line once warned of a −4-priority
  // Recover (#179).
  { good: true, text: "Eternamax's Recover has 1 PP (ppUp −4): it can heal half its bar exactly once" },
  { good: false, text: "phase 1's Cosmic Power raises its defences every use — stalling makes it worse" },
  { good: true, text: "it carries no held items in phase 1 and has no passive ability" },
];
const heldStacks = (s, party) => party.map(p => ({
  name: p.name,
  n: (s.modifiers ?? []).filter(m => m?.pokemonId != null && m.pokemonId === p.id)
    .reduce((t, m) => t + (tryDo(() => m.getStackCount(), 1) ?? 1), 0),
})).filter(x => x.n > 0).sort((a, b) => b.n - a.n);

const eternatusCard = (s, model, party) => {
  const foe = model?.foes?.[0] ?? null;
  const carrying = heldStacks(s, party);
  const facts = [...ETERNATUS_FACTS];
  if (party.length > 1 && carrying[0]?.n >= 3 && carrying[0].n >= (carrying[1]?.n ?? 0) * 2) {
    facts.push({ good: false, text: `${carrying[0].name} carries ${carrying[0].n} held items — spread them before 200` });
  }
  if (party.filter(p => p.hp > 0).length < 2) {
    facts.push({ good: false, text: "phase 2 is a double battle: bring a second mon that can stand in it" });
  }
  return { foe: foe && { name: foe.name, level: foe.level, types: foe.types, segments: foe.segments, moves: foe.moves }, facts };
};

// Memoised: the schedule calls `isFixedBattle` for every wave it walks, and each call builds a config and runs the
// challenge hooks (game-code.md §12).
export const aheadModel = run => {
  const s = run.scene;
  const wave = run.facts.wave;
  if (!wave || typeof s.gameMode?.isFixedBattle !== "function") return null;
  return run.memo("ahead", "model", () => build(run, wave));
};

const build = (run, wave) => {
  const s = run.scene;
  const schedule = bigFightsAhead(s, wave + 1).map(f => ({ ...f, label: KIND_LABEL[f.kind] }));
  const next = schedule[0] ?? null;
  const heal = nextHeal(s, wave + 1);
  const party = run.facts.party;
  const luck = partyLuck(party, s, gameEvents());

  const model = next && next.wave - wave <= LOOKAHEAD ? previewFor(run, next.wave) : null;
  const named = model && !model.unavailable ? model : null;
  if (next) {
    next.in = next.wave - wave;
    next.trainer = named?.trainer?.name ?? null;
    next.foes = named?.foes ?? [];
    next.double = named?.double ?? null;
    next.bars = (named?.foes ?? []).reduce((t, f) => t + Math.max(0, (f.segments ?? 0) - 1), 0);
    next.exact = named?.confidence?.foes === "exact";
    next.rewards = rewardRules(s, next.wave);
  }
  const final = schedule.find(f => f.kind === "final");
  const finalNear = final && final.wave - wave <= FINAL_NOTICE;
  return {
    wave, next, heal: heal == null ? null : { wave: heal, in: heal - wave },
    fightsBeforeHeal: heal == null ? schedule.length : schedule.filter(f => f.wave < heal).length,
    schedule: schedule.slice(0, 4).map(f => ({ ...f, in: f.wave - wave })),
    readiness: named ? readiness(named, partyProfile(partyAtFight(s, party, { from: wave, fight: next?.wave ?? null }).members)) : null,
    luck: { value: luck, grade: LUCK_GRADES[luck] ?? String(luck), upgradePct: Math.round(upgradeChance(luck) * 1000) / 10 },
    // The wave just cleared, not the one ahead: its rewards are the screen on show.
    thisWave: rewardRules(s, wave),
    eternatus: finalNear ? eternatusCard(s, next?.kind === "final" ? named : null, party) : null,
  };
};

// The next big fight's foes, which a learned move is judged against (#122).
export const learnRoster = model => {
  if (model?.unavailable) return { unavailable: model.unavailable };
  const next = model?.next;
  if (!next?.foes?.length) return null;
  return { wave: next.wave, exact: !!next.exact, foes: next.foes };
};

export const aheadIn = n => (n === 1 ? "next wave" : `in ${n}`);

export const aheadWho = a => (a.next.trainer ? `${a.next.trainer}${a.next.exact ? "" : "~"}` : a.next.label);

export const aheadSummary = a => {
  if (!a?.next) return null;
  const reasons = [...(a.readiness?.notes ?? []).filter(n => !n.good).map(n => n.text),
    !a.heal ? `no full heal left before the final wave`
      : a.fightsBeforeHeal >= 2 ? `${a.fightsBeforeHeal} big fights before the next full heal` : null].filter(Boolean);
  return `${aheadWho(a)} ${aheadIn(a.next.in)} (W${a.next.wave})${a.readiness ? ` ${a.readiness.verdict}` : ""}`
    + (reasons.length ? ` — ${reasons.slice(0, 3).join("; ")}` : "");
};
