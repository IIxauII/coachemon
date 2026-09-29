// Catch coach: each ball's odds on a wild foe, what the catch is worth to the team and to the account, and whether a
// throw ends a dangerous fight sooner. It reads the battle only through `turn`, the account only through `account`,
// and never the scene (game-code.md §20).
import { abilitiesOf, hasAttr, iconOf, typesOf } from "./01-core.js";
import { damagingTypes, partyProfile, partyReasons } from "./08-party.js";
import { koCurve, koTurn, useOf } from "./10-damage.js";
import { exchange, threatFrom } from "./30-planner.js";

const BALLS = [
  { id: PokeballType.POKEBALL, ball: "Poké Ball", short: "PB", key: "pb", mult: 1 },
  { id: PokeballType.GREAT_BALL, ball: "Great Ball", short: "GB", key: "gb", mult: 1.5 },
  { id: PokeballType.ULTRA_BALL, ball: "Ultra Ball", short: "UB", key: "ub", mult: 2 },
  { id: PokeballType.ROGUE_BALL, ball: "Rogue Ball", short: "RB", key: "rb", mult: 3 },
  { id: PokeballType.MASTER_BALL, ball: "Master Ball", short: "MB", key: "mb", mult: -1 },
];
const STATUS_MULT = {
  [StatusEffect.POISON]: 1.5, [StatusEffect.TOXIC]: 1.5, [StatusEffect.PARALYSIS]: 1.5,
  [StatusEffect.SLEEP]: 2.5, [StatusEffect.FREEZE]: 2.5, [StatusEffect.BURN]: 1.5,
};

// `critFactor`: the factor in front of `min(255, w) / 6` in the critical-capture chance, 0 for none.
export const captureChance = ({ maxHp, hp, catchRate, ball, status = 0, shiny = false, critFactor = 0, shinyMult = 2 }) => {
  const mult = BALLS[ball]?.mult ?? 1;
  if (mult === -1) return 1;
  const m = 3 * maxHp;
  const w = Math.round((m - 2 * hp) * catchRate * mult / m * (STATUS_MULT[status] ?? 1) * (shiny ? shinyMult : 1));
  if (w >= 255) return 1;
  if (!(w > 0)) return 0;
  const shake = Math.min(1, Math.round(65536 / (255 / w) ** 0.1875) / 65536);
  const crit = Math.max(0, Math.min(256, Math.floor(critFactor * Math.min(255, w) / 6))) / 256;
  return crit * shake + (1 - crit) * shake ** 3;
};

const big = x => { try { return BigInt(x ?? 0); } catch { return 0n; } };
const tryDo = (fn, fallback = null) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const isShinyMon = p => tryDo(() => p.isShiny(), !!p.shiny || (!!p.fusionSpecies && !!p.fusionShiny));

const critFactorOf = (turn, account) => {
  const { mode, modifiers } = turn.facts;
  if (mode.noCriticalCatch) return 0;
  let n = 0;
  for (const d of Object.values(account.dex)) if (d && big(d.caughtAttr)) n++;
  const charm = modifiers.find(x => x.constructor?.name === "CriticalCatchChanceBoosterModifier");
  const boost = charm ? 1.5 + (charm.getStackCount?.() ?? charm.stackCount ?? 1) / 2 : 1;
  return boost * (mode.daily || n > 800 ? 2.5 : n > 600 ? 2 : n > 400 ? 1.5 : n > 200 ? 1 : n > 100 ? 0.5 : 0);
};

const battleBlocked = (turn, account, active) => {
  const { trainer, battleType, mysteryEncounter, biomeId, mode } = turn.facts;
  if (trainer || battleType === BattleType.TRAINER) return "trainer";
  if (battleType === BattleType.MYSTERY_ENCOUNTER && !mysteryEncounter?.catchAllowed) return "mystery encounter";
  if (biomeId === BiomeId.END && (battleType ?? BattleType.WILD) === BattleType.WILD) {
    const dex = account.dex;
    const uncaught = active.some(f => !big(dex[f.species?.speciesId]?.caughtAttr));
    // `starterData`'s keys stand in for `getAllStarters()`: a fresh save holds one per starter, but a loaded one keeps
    // whatever keys it was saved with (game-code.md §20).
    const missing = Object.keys(account.starter).filter(id => !big(dex[id]?.caughtAttr)).length;
    if ((mode.classic && !mode.finalBoss && uncaught) || (mode.freshStart && !mode.finalBoss) || (mode.endless && !mode.endlessMinorBoss)) return "End biome";
    if ((mode.classic && mode.finalBoss && missing > 1) || (mode.freshStart && mode.finalBoss) || (mode.endless && mode.endlessMinorBoss)
      || (mode.daily && mode.waveFinal && !mode.dailyBossCatchable)) return "final boss";
  }
  return null;
};

// The bosses that refuse even a Master Ball with bars left (game-code.md §20).
const masterBlocked = turn => {
  const { mode } = turn.facts;
  if (mode.finalBoss) return mode.anyChallenges;
  return mode.daily && mode.waveFinal && !!mode.dailyBossCatchable;
};

const teamReasons = (account, foe, limited) => {
  const all = account.party.filter(Boolean);
  const out = [];
  if (limited) return { out: [{ kind: "team", text: "Limited Catch: won't join the party", w: 0 }], replace: null };
  if (!all.length) return { out, replace: null };

  const profile = partyProfile(all);
  const reasons = partyReasons(profile, { species: foe.species, fusion: foe.fusionSpecies ?? null, level: foe.level,
    types: typesOf(foe), abilities: abilitiesOf(foe), moveTypes: damagingTypes(foe) });
  if (reasons.some(r => r.kind === "dupe")) return { out, replace: null };

  const show = x => (x.estimated ? `~${x.final}` : `${x.final}`);
  for (const r of reasons) {
    if (r.kind === "covers") out.push({ kind: "team", text: `covers ${r.types.slice(0, 2).join("/")} weakness`, w: r.types.length > 1 ? 1.5 : 1 });
    if (r.kind === "hole") out.push({ kind: "team", text: `hits ${r.types.slice(0, 3).join("/")} (no one else does)`, w: 0.5 });
    if (r.kind === "upgrade") {
      out.push({ kind: "team", w: 2,
        text: `stronger than ${r.against.name} (${r.estimated || r.against.estimated ? "final " : ""}BST ${show(r)} vs ${show(r.against)})` });
    }
  }
  const weakest = profile.weakest?.mon ?? null;
  const replace = all.length >= 6 && out.length && weakest ? { icon: iconOf(weakest), name: weakest.name } : null;
  if (replace) out.push({ kind: "team", text: `party full: replaces ${weakest.name}`, w: 0 });
  return { out, replace };
};

const rootOf = p => tryDo(() => p.species.getRootSpeciesId(true), p.species?.speciesId) ?? p.species?.speciesId;
// Candy goes to the prevolution-free species, not the first starter `rootOf` stops at: the two differ only on Pikachu's
// line, where a caught Raichu's candy, and the Daily `hasNewAttr` that gates it, are Pichu's (game-code.md §20).
const candyRootOf = p => tryDo(() => p.species.getRootSpeciesId(false), p.species?.speciesId) ?? p.species?.speciesId;

const IV_TOTAL = 30, IV_STAT = 15;
const accountReasons = (account, foe) => {
  const out = [];
  const sp = foe.species;
  if (!sp) return out;
  const dex = account.dex[sp.speciesId];
  const caught = big(dex?.caughtAttr);
  const root = rootOf(foe);
  const rootDex = account.dex[root];
  const candyRoot = candyRootOf(foe);
  const candyDex = account.dex[candyRoot];
  const rare = sp.legendary || sp.subLegendary || sp.mythical;
  if (!caught) {
    out.push({ kind: "account", text: root !== sp.speciesId && !big(rootDex?.caughtAttr) ? "new species + starter" : "new species", w: 3 });
    if (rare) out.push({ kind: "account", text: sp.mythical ? "mythical" : "legendary", w: 2 });
  }
  // `Pokemon.getDexAttr()`, rebuilt.
  const variant = foe.variant ?? 0;
  const attr = (foe.gender === Gender.GENDERLESS || foe.gender == null ? 0n : foe.gender === Gender.FEMALE ? 8n : 4n)
    | (foe.shiny ? 2n : 1n) | (variant >= 2 ? 64n : variant === 1 ? 32n : 16n) | (1n << BigInt(7 + (foe.formIndex ?? 0)));
  // Candy follows `isShiny()`, a shiny fusion half included, with the base `variant`; the dex's shiny bit is the base's
  // alone (game-code.md §20).
  const candy = 5 * 2 ** variant * (foe.isBoss?.() ? 2 : 1);
  // A Daily run pays candy only for a new dex attribute, asked of the **masked** bits of the entry the candy goes to
  // (game-code.md §20): read raw, `attr` promises candy the game won't pay. Only this line is masked. The reasons
  // below test bits the foe in front of us has, bar an `isUnobtainable` form, and masking that would turn "new form"
  // into a claim about no form at all.
  const unlocks = tryDo(() => account.species?.getSpecies?.(candyRoot)?.getFullUnlocksData?.());
  const candyAttr = typeof unlocks === "bigint" ? attr & unlocks : attr;
  const candyText = account.daily && (big(candyDex?.caughtAttr) & candyAttr) === candyAttr ? "" : ` · +${candy} candy`;
  if (foe.shiny) {
    if (caught && !(caught & 2n)) out.push({ kind: "account", text: `first shiny${candyText}`, w: 3 });
    else if (caught && (caught & attr & 112n) !== (attr & 112n)) out.push({ kind: "account", text: `new shiny variant${candyText}`, w: 2.5 });
    else out.push({ kind: "account", text: `shiny${candyText}`, w: 2 });
  } else if (isShinyMon(foe)) out.push({ kind: "account", text: `shiny fusion${candyText}`, w: 1.5 });
  if (caught && (caught & (attr & ~127n)) === 0n) out.push({ kind: "account", text: "new form", w: 2 });

  const ab = foe.abilityIndex ?? 0;
  const bit = ab !== 1 || sp.ability2 ? 1 << ab : AbilityAttr.ABILITY_HIDDEN;
  const known = account.starter[root]?.abilityAttr;
  if (known != null && !(known & bit)) {
    if (ab === 2 && sp.abilityHidden) out.push({ kind: "account", text: "new hidden ability", w: 2 });
    else if (caught) out.push({ kind: "account", text: "new ability", w: 0.5 });
  }

  const dexIvs = rootDex?.ivs;
  if (big(rootDex?.caughtAttr) && Array.isArray(dexIvs) && Array.isArray(foe.ivs)) {
    const gains = foe.ivs.map((v, i) => Math.max(0, v - (dexIvs[i] ?? 0)));
    const total = gains.reduce((t, x) => t + x, 0);
    const using = account.party.some(p => p && rootOf(p) === root);
    if (total >= IV_TOTAL || Math.max(...gains) >= IV_STAT) {
      out.push({ kind: "account", text: `IVs +${total} on ${gains.filter(Boolean).length} stats${using ? " (on the team)" : ""}`, w: using ? 2 : 1 });
    }
  }
  return out;
};

const CHIP = 1;
const fastestHit = (turn, a, target) => turn.outcomes(a, target).filter(x => x.dmg > 0)
  .map(x => ({ x, turns: koTurn(koCurve(turn.mon(target), useOf(x)).by) }))
  .reduce((b, y) => (!b || y.turns < b.turns || (y.turns === b.turns && y.x.dmg > b.x.dmg) ? y : b), null);
// `p`: one throw's chance with the cheapest ball this catch deserves.
const escapeReason = (turn, foe, party, p) => {
  if (!(p > 0)) return null;
  let best = null;
  for (const me of party.filter(x => x.isOnField?.())) {
    let turns = 9, first = turn.mon(me).speed >= turn.mon(foe).speed ? 1 : 0, theyFirst = 0;
    try {
      for (const pm of (me.moveset ?? []).filter(Boolean)) {
        const mv = pm.getMove?.();
        if (!mv || mv.category === MoveCategory.STATUS) continue;
        const x = exchange(turn, me, pm, foe);
        if (x && (x.turnsWe < turns || (x.turnsWe === turns && x.pTheyKoFirst < theyFirst))) {
          turns = x.turnsWe; theyFirst = x.pTheyKoFirst ?? 0; first = x.pFirst ?? first;
        }
      }
    } catch { turns = fastestHit(turn, me, foe)?.turns ?? 9; }
    let dmg = 0, pKo = 0;
    try {
      const t = threatFrom(turn, foe, me);
      if (t) { dmg = t.expected ?? 0; pKo = t.pKo ?? 0; }
      else { dmg = fastestHit(turn, foe, me)?.x.dmg ?? 0; pKo = dmg >= me.hp ? 1 : 0; }
    } catch {}
    const hitsFight = turns >= 9 ? 9 : Math.max(0, turns - first);
    const hitsThrow = (1 - p) / p;
    const danger = theyFirst >= 0.3 || (pKo >= 0.5 && turns >= 2) || dmg * hitsFight >= me.hp * CHIP;
    if (danger && hitsThrow + 0.25 < hitsFight && (!best || hitsFight - hitsThrow > best.gain)) {
      best = { gain: hitsFight - hitsThrow, me, turns, pKo };
    }
  }
  if (!best) return null;
  const how = best.turns >= 9 ? "we can't KO it" : `${best.turns} turns to KO`;
  return { kind: "escape", text: `ends it: ${how}${best.pKo >= 0.5 ? `, it KOs ${best.me.name}` : ""}`, w: 0 };
};

const RISKY_KO = 0.05;
const lowerHpTip = (turn, foe, party) => {
  const field = party.filter(x => x.isOnField?.());
  const by = me => (field.length > 1 ? `${me.name}'s ` : "");
  for (const me of field) {
    for (const pm of (me.moveset ?? []).filter(Boolean)) {
      let mv = null;
      try { mv = pm.getMove(); } catch {}
      if (mv && hasAttr(mv, "SurviveDamageAttr") && (pm.getMovePp?.() ?? 1) - (pm.ppUsed ?? 0) > 0) return `lower its HP with ${by(me)}${pm.getName()}`;
    }
  }
  let safe = null, risky = false;
  for (const me of field) {
    for (const o of turn.outcomes(me, foe)) {
      if (!(o.expected > 0)) continue;
      if (o.pKo > RISKY_KO) risky = true;
      else if (!safe || o.expected > safe.o.expected) safe = { me, o };
    }
  }
  if (safe) return `lower its HP with ${by(safe.me)}${safe.o.name} (won't KO)`;
  return risky ? "careful: our attacks can KO it" : "lower its HP first";
};

const maxBallFor = (value, counts) => (value >= 5 ? PokeballType.MASTER_BALL : value >= 2.5 ? PokeballType.ROGUE_BALL : value >= 1.5 || counts[PokeballType.ULTRA_BALL] >= 5 ? PokeballType.ULTRA_BALL : PokeballType.GREAT_BALL);
const GOOD = 0.6;
const SHOW = 2;
const pickBall = (chance, maxId) => {
  const allowed = chance.filter(c => c.id <= maxId && c.count > 0 && c.p > 0);
  return allowed.find(c => c.p >= GOOD) ?? allowed.reduce((b, c) => (!b || c.p > b.p ? c : b), null);
};

const targetAdvice = (turn, account, foe, party, crit, counts, multi, noMaster) => {
  const bossLocked = !!foe.isBoss?.() && (foe.bossSegmentIndex ?? 0) >= 1
    && !(turn.live ? turn.mon(foe).hasAbility(AbilityId.WONDER_GUARD) : abilitiesOf(foe).includes("Wonder Guard"));
  const sealed = bossLocked && noMaster;
  const chance = BALLS.filter(x => counts[x.id] > 0).map(x => ({
    id: x.id, ball: x.ball, short: x.short, key: x.key, count: counts[x.id],
    p: bossLocked && (sealed || x.id < PokeballType.MASTER_BALL) ? 0 : Math.round(captureChance({
      maxHp: foe.getMaxHp(), hp: foe.hp, catchRate: foe.species?.catchRate ?? 0, ball: x.id,
      status: foe.status?.effect ?? 0, shiny: isShinyMon(foe), shinyMult: account.shinyCatchMultiplier, critFactor: crit,
    }) * 1000) / 1000,
  }));

  const team = teamReasons(account, foe, turn.facts.mode.limitedCatch && turn.facts.wave % 10 !== 1);
  const reasons = [...accountReasons(account, foe), ...team.out];
  let value = reasons.reduce((t, r) => t + r.w, 0);
  const cheap = pickBall(chance, value >= 1.5 ? maxBallFor(value, counts) : maxBallFor(0, counts));
  const escape = !multi && cheap ? escapeReason(turn, foe, party, cheap.p) : null;
  if (escape) reasons.push(escape);
  const best = pickBall(chance, maxBallFor(value, counts));
  const p = best?.p ?? 0;
  const hp = foe.hp / foe.getMaxHp();

  let verdict = "skip";
  if ((value >= 2.5 && p >= 0.3) || (value >= SHOW && p >= 0.5) || (escape && p >= 0.5)) verdict = "catch";
  else if (value >= SHOW || (escape && p >= 0.25)) verdict = "maybe";

  const rank = r => (r.kind === "escape" ? 9 : r.w);
  const main = reasons.filter(r => r.w > 0 || r.kind === "escape").sort((x, y) => rank(y) - rank(x)).map(r => r.text);
  const blockers = [], tips = [];
  if (multi && verdict !== "skip") { verdict = "maybe"; blockers.push("KO the other foe first"); }
  if (sealed && verdict !== "skip") blockers.push("break its bars first — no ball works on this boss");
  else if (bossLocked && verdict !== "skip") blockers.push(counts[PokeballType.MASTER_BALL] > 0 && value >= 5 ? "Master Ball, or break its bars first" : "break its bars first — only a Master Ball works now");
  else if (verdict !== "skip" && p < GOOD) {
    if (hp > 0.5) tips.push(lowerHpTip(turn, foe, party));
    else if (!foe.status?.effect) {
      // The wave's status-cure tokens (game-code.md §21).
      const cure = turn.facts.enemyModifiers.filter(m => m.constructor?.name === "EnemyStatusEffectHealChanceModifier")
        .reduce((t, m) => t + 2.5 * (m.getStackCount?.() ?? 1), 0);
      tips.push(`sleep/paralyse it for better odds${cure ? ` (it cures itself ${Math.min(100, cure)}%/turn)` : ""}`);
    }
  }
  let why;
  if (verdict === "skip") why = reasons.some(r => r.w > 0) ? `low chance, ${main.slice(0, 2).join(", ")}` : p < 0.3 ? "low chance, nothing new" : "nothing new";
  else why = [...blockers, ...main.slice(0, 2), ...tips].join(", ");

  return {
    icon: iconOf(foe), name: foe.name, hp: Math.round(hp * 100),
    chance: chance.map(({ id, ...c }) => c),
    best: best && p > 0 ? { ball: best.ball, short: best.short, key: best.key, count: best.count, p } : null,
    reasons: reasons.map(({ kind, text }) => ({ kind, text })),
    replace: team.replace, boss: bossLocked, verdict, why,
  };
};

export const catchAdvice = (turn, account) => {
  const party = turn.facts.party.filter(p => p && p.hp > 0);
  const foes = turn.facts.foes.filter(f => f && f.hp > 0);
  if (!foes.length || !party.length) return null;
  const counts = BALLS.map(x => turn.facts.balls(x.id));
  const onField = foes.filter(f => f.isOnField?.());
  const active = onField.length ? onField : foes.slice(0, 1);
  if (battleBlocked(turn, account, active) || !counts.some(Boolean)) return null;
  const crit = critFactorOf(turn, account);
  const multi = active.length > 1;
  const noMaster = masterBlocked(turn);
  const targets = active.map(f => targetAdvice(turn, account, f, party, crit, counts, multi, noMaster));
  if (multi && targets.every(t => t.verdict === "skip")) return null;
  return { targets };
};

// The one filter the pane and the catch group's line both read, so the two never disagree about what is on offer.
export const catchTargets = c => (c?.targets ?? []).filter(t => t.verdict !== "skip");

// The catch group's line, `catch Toxicroak — Ultra 62%`. A `catch` verdict alone earns one: a `maybe` is still drawn
// in the pane, but its group is headed by its label alone (#349).
export const catchSummary = c => {
  const targets = catchTargets(c).filter(t => t.verdict === "catch");
  if (!targets.length) return null;
  const [t] = targets.slice().sort((a, b) => (b.best?.p ?? 0) - (a.best?.p ?? 0));
  const odds = t.best ? ` — ${t.best.ball.replace(/ Ball$/, "")} ${Math.round(t.best.p * 100)}%` : "";
  return `catch ${t.name}${odds}`;
};

export const catchWorth = (account, foe) => {
  const reasons = [...accountReasons(account, foe), ...teamReasons(account, foe, false).out];
  return { value: reasons.reduce((t, r) => t + r.w, 0), reasons: reasons.map(r => r.text), show: SHOW };
};
