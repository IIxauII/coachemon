// The one door between the coach engine and the live battle: `readTurn` decides once whether answers come from the
// game's own code, opens the only sandbox, sets a predicted Tera, and hands callers a turn whose every answer is
// memoised under one key. 10-damage and 20-enemy-ai know how to ask the game; this file decides when.
import { TYPES, awaitingDecision, closeRead, effectiveness, openRead, sandbox, stat, typesOf } from "./01-core.js";
import { waveKind } from "./03-calendar.js";
import { moveTraits } from "./07-move-traits.js";
import { approxOutcome, approxOutcomes, barBreakFactors, sceneOutcome, sceneOutcomes, sceneStatusMoves, sceneStopped, sceneTurnEndHp, stateOf, targetFacts } from "./10-damage.js";
import { aiTargetScore, approxDistribution, sceneDistribution, sceneExactMoves, sceneReplayAI, sceneSendInScore, sceneSwitches, skipsTurn } from "./20-enemy-ai.js";

// Predicted Terastallization (game-code.md §7).
const teraSaved = new Map(); // mon → its pre-Tera { isTerastallized, addedType }
const teraOn = (e, on) => {
  e.isTerastallized = on ? true : teraSaved.get(e).isTerastallized;
  if (e.summonData) e.summonData.addedType = on ? null : teraSaved.get(e).addedType;
};
const withPredictedTera = (mons, fn) => {
  const fresh = mons.filter(e => e && !teraSaved.has(e));
  for (const e of fresh) {
    teraSaved.set(e, { isTerastallized: e.isTerastallized, addedType: e.summonData?.addedType ?? null });
    teraOn(e, true);
  }
  try { return fn(); } finally { for (const e of fresh) { teraOn(e, false); teraSaved.delete(e); } }
};
const beforeTera = fn => {
  const on = [...teraSaved.keys()];
  for (const e of on) teraOn(e, false);
  try { return fn(); } finally { for (const e of on) teraOn(e, true); }
};
const teraTypeOf = e => { try { return teraSaved.has(e) ? TYPES[e.getTeraType?.()] ?? null : null; } catch { return null; } };

// Patches: `{ mon, stages: { [stat 1–5]: change } }`, `{ mon, status }`, `{ mon, types }` and `{ mon, addedType }`,
// written onto the live mons for one synchronous call (game-code.md §14). `patchKey` is part of the derived turn's
// key, so no hypothetical answer is ever read from a real memo slot.
const patchKey = patches => patches.map(({ mon, stages, status, types, addedType }) => [
  stages ? `${mon.id}s${Object.entries(stages).map(([i, n]) => `${i}:${n}`).join(",")}` : null,
  status ? `${mon.id}x${status.effect}` : null,
  types ? `${mon.id}t${types.join(",")}` : null,
  addedType != null ? `${mon.id}+${addedType}` : null,
].filter(Boolean).join(";")).filter(Boolean).join("|");
// @only tests: withPatches
export const withPatches = (patches, fn) => {
  const undo = [];
  try {
    for (const { mon, stages, status, types, addedType } of patches) {
      if (stages && Array.isArray(mon.summonData?.statStages)) {
        const prev = mon.summonData.statStages;
        const next = [...prev];
        for (const [i, n] of Object.entries(stages)) next[i - 1] = Math.max(-6, Math.min(6, (next[i - 1] ?? 0) + n));
        mon.summonData.statStages = next;
        undo.push(() => { mon.summonData.statStages = prev; });
      }
      if (status) {
        const own = Object.prototype.hasOwnProperty.call(mon, "status"), prev = mon.status;
        mon.status = status;
        undo.push(() => { if (own) mon.status = prev; else delete mon.status; });
      }
      if (types && mon.summonData) {
        const prev = mon.summonData.types;
        mon.summonData.types = [...types];
        undo.push(() => { mon.summonData.types = prev; });
      }
      if (addedType != null && mon.summonData) {
        const prev = mon.summonData.addedType;
        mon.summonData.addedType = addedType;
        undo.push(() => { mon.summonData.addedType = prev; });
      }
    }
    return fn();
  } finally {
    for (const f of undo.reverse()) f();
  }
};

const tryDo = (fn, fallback = null) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const sceneEnv = s => {
  const b = s?.currentBattle ?? {};
  const foes = tryDo(() => s.getEnemyParty(), []) ?? [];
  const party = tryDo(() => s.getPlayerParty(), []) ?? [];
  return {
    s, foes, playerParty: party,
    // The party on `p`'s side, for Beat Up.
    party: p => tryDo(() => (p?.isPlayer?.() ? party : foes), null),
    field: tryDo(() => s.getField(true), []) ?? [],
    slots: tryDo(() => s.getField(), []) ?? [],
    enemyModifiers: s?.enemyModifiers ?? [],
    modifiers: s?.modifiers ?? [],
    arenaTags: tryDo(() => s.arena?.tags, []) ?? [],
    weather: tryDo(() => s.arena?.weather?.weatherType, WeatherType.NONE) ?? WeatherType.NONE,
    terrain: tryDo(() => s.arena?.terrain?.terrainType, TerrainType.NONE) ?? TerrainType.NONE,
    finalBoss: !!b.isClassicFinalBoss,
    trainer: b.trainer ?? null,
    double: !!b.double,
    enemySwitchCounter: b.enemySwitchCounter ?? 0,
    mysteryEncounter: b.mysteryEncounter ?? null,
    isEnemy: p => foes.includes(p),
  };
};

const modeFlags = (s, live, wave) => {
  const mode = s?.gameMode ?? {};
  const has = (id, value) => (mode.challenges ?? []).some(c => c.id === id && (value == null ? c.value > 0 : c.value === value));
  const call = (fn, fallback) => (live ? tryDo(fn, fallback) : fallback);
  const lastWave = () => waveKind(s, wave) === "final";
  return {
    classic: !!mode.isClassic, daily: !!mode.isDaily, endless: !!mode.isEndless,
    freshStart: call(() => mode.isFullFreshStartChallenge(), has(Challenges.FRESH_START, 1)),
    limitedCatch: has(Challenges.LIMITED_CATCH),
    noCriticalCatch: call(() => mode.isFreshStartChallenge(), has(Challenges.FRESH_START)),
    // Zero-valued challenges count (game-code.md §20).
    anyChallenges: call(() => mode.hasAnyChallenges(), (mode.challenges ?? []).length > 0),
    finalBoss: call(() => mode.isBattleClassicFinalBoss(wave), !!mode.isClassic && lastWave()),
    endlessMinorBoss: call(() => mode.isEndlessMinorBoss(wave), !!mode.isEndless && lastWave()),
    waveFinal: call(() => mode.isWaveFinal(wave), lastWave()),
    // Off the config, not `getDailyEventSeedBoss()`, which also drops a boss the `SpeciesId` enum lacks
    // (game-code.md §20): a hand-written seed naming one reads catchable here and has no catchable boss in game.
    dailyBossCatchable: !!mode.dailyConfig?.boss?.catchable,
  };
};

const sceneFacts = (s, env, live) => {
  const b = s?.currentBattle ?? {};
  const ph = tryDo(() => s.phaseManager?.getCurrentPhase?.(), null);
  const cmd = b.turnCommands?.[0] ?? null;
  return {
    wave: b.waveIndex ?? null, turn: b.turn ?? null, enemySwitchCounter: env.enemySwitchCounter,
    double: env.double, trainer: env.trainer, decision: s ? awaitingDecision(s) : null,
    battleType: b.battleType, mysteryEncounter: env.mysteryEncounter,
    party: env.playerParty, foes: env.foes, field: env.field,
    trickRoom: !!tryDo(() => s.arena?.getTag?.("TRICK_ROOM"), false),
    weather: env.weather, weatherSuppressed: !!tryDo(() => s.arena?.weather?.isEffectSuppressed?.(), false),
    biomeId: tryDo(() => s.arena?.biomeId, null),
    hazards: (tagType, side) => tryDo(() => s.arena?.getTagOnSide?.(tagType, side)?.layers, 0) ?? 0,
    modifiers: env.modifiers, enemyModifiers: env.enemyModifiers,
    balls: id => s?.pokeballCounts?.[id] ?? 0,
    mode: modeFlags(s, live, b.waveIndex ?? 0),
    // Slot 0's command, as slot 1's command phase in a double sees it.
    command: b.double && ph?.phaseName === "CommandPhase" && ph.fieldIndex === 1 && cmd && !cmd.skip
      ? { kind: cmd.command, cursor: cmd.cursor, move: cmd.move, targets: cmd.targets?.length ? cmd.targets : cmd.move?.targets ?? [] }
      : null,
  };
};

// The shuffle `sortInSpeedOrder` makes before its stable sort decides a speed tie (game-code.md §5). In a single
// battle it is one draw over [ours, theirs], and 0 swaps them; anything else is null.
const sceneSpeedTie = (env, facts, a, b) => {
  try {
    if (facts.double || !a.isOnField?.() || !b.isOnField?.() || a.isPlayer?.() === b.isPlayer?.()) return null;
    const s = env.s;
    if (!(facts.turn > 0) || typeof s.executeWithSeedOffset !== "function") return null;
    let draw = null;
    s.executeWithSeedOffset(() => { draw = Phaser.Math.RND.integerInRange(0, 1); }, facts.turn * 1000 + 2, s.waveSeed);
    if (draw !== 0 && draw !== 1) return null;
    const playerFirst = (draw !== 0) !== !!facts.trickRoom;
    return a.isPlayer?.() === playerFirst ? 1 : 0;
  } catch { return null; }
};

const TYPE_STATUS_IMMUNE = {
  [StatusEffect.POISON]: ["Poison", "Steel"], [StatusEffect.TOXIC]: ["Poison", "Steel"],
  [StatusEffect.PARALYSIS]: ["Electric"], [StatusEffect.FREEZE]: ["Ice"], [StatusEffect.BURN]: ["Fire"],
};
const stagesMultiplier = p => {
  let mult = 1;
  try {
    for (const a of [p.getAbility?.(), p.hasPassive?.() ? p.getPassiveAbility?.() : null]) {
      for (const x of a?.getAttrs?.("StatStageChangeMultiplierAbAttr") ?? []) mult *= x.multiplier ?? 1;
    }
  } catch {}
  return mult;
};
// `{ [stat 1–5]: change }` on `p` itself, after Simple, Contrary and the ±6 cap, or null. Accuracy and evasion
// aren't counted.
// @only tests: setupStages
export const setupStages = (p, mv) => {
  if (!mv || mv.category !== MoveCategory.STATUS) return null;
  const mult = stagesMultiplier(p);
  const out = {};
  for (const x of moveTraits(mv, p).stages) {
    if (!(x.self || (x.side && !x.ally))) continue;
    for (const st of x.stats) if (st >= Stat.ATK && st <= Stat.SPD) out[st] = (out[st] ?? 0) + x.stages * mult;
  }
  for (const st of Object.keys(out)) {
    const cur = p.summonData?.statStages?.[st - 1] ?? 0;
    out[st] = Math.max(-6, Math.min(6, cur + out[st])) - cur;
    if (!out[st]) delete out[st];
  }
  return Object.keys(out).length ? out : null;
};
const monRecord = (env, live, p) => {
  const facts = targetFacts(env, p);
  const trainer = tryDo(() => p.hasTrainer?.(), null) ?? !!env.trainer;
  const speed = live && typeof p.getEffectiveStat === "function" ? tryDo(() => p.getEffectiveStat(Stat.SPD), stat(p, Stat.SPD)) : stat(p, Stat.SPD);
  return {
    p, facts, state: stateOf(facts), speed, tera: teraTypeOf(p),
    // For a moveset entry or a bare `{ priority }`.
    order: pm => {
      const mv = pm?.getMove?.() ?? pm ?? {};
      return {
        priority: live && mv.getPriority ? tryDo(() => mv.getPriority(p, true), mv.priority ?? 0) : mv.priority ?? 0,
        bracket: live && mv.getPriorityModifier ? tryDo(() => mv.getPriorityModifier(p, true), MovePriorityInBracket.NORMAL) : MovePriorityInBracket.NORMAL,
        category: mv.category,
      };
    },
    setup: mv => setupStages(p, mv),
    // `canSetStatus` quiet, so it queues no message.
    canTake: (effect, by) => {
      if (live && typeof p.canSetStatus === "function") {
        const v = tryDo(() => !!p.canSetStatus(effect, true, false, by), null);
        if (v !== null) return v;
      }
      return !typesOf(p).some(ty => TYPE_STATUS_IMMUNE[effect]?.includes(ty));
    },
    // A Stealth Rock layer's share of its max HP.
    rockChip: (() => {
      if (tryDo(() => !!p.hasAbilityWithAttr?.("BlockNonDirectDamageAbAttr"), false)) return 0;
      const e = live ? tryDo(() => p.getAttackTypeEffectiveness(PokemonType.ROCK, { ignoreStrongWinds: true }), null) : null;
      return 0.125 * (e ?? effectiveness("Rock", p));
    })(),
    bars: (st, n, offence = false) => barBreakFactors(p, st, n, offence, trainer),
    // An override (Mega Sol) beats suppression; only the live weather is suppressible (game-code.md §14).
    weather: (() => {
      const override = tryDo(() => {
        if (!p?.hasAbilityWithAttr?.("PreAttackWeatherOverrideAbAttr")) return null;
        for (const a of [p.getAbility?.(), p.hasPassive?.() ? p.getPassiveAbility?.() : null]) {
          for (const x of a?.getAttrs?.("PreAttackWeatherOverrideAbAttr") ?? []) if (x?.weatherType) return x.weatherType;
        }
        return null;
      }, null);
      if (override) return override;
      return env.weather && !tryDo(() => env.s?.arena?.weather?.isEffectSuppressed?.(), false) ? env.weather : WeatherType.NONE;
    })(),
    hasAbility: id => tryDo(() => !!p.hasAbility?.(id, false, true), false),
    isOfType: t => tryDo(() => p.isOfType?.(t), null) ?? typesOf(p).includes(TYPES[t]),
  };
};

let open = false;
const makeTurn = (env, { live, facts, baseKey, patches = [], shared }) => {
  const key = patches.length ? `${baseKey}#${patchKey(patches)}` : baseKey;
  const caches = new Map();
  let closed = false;
  const guard = () => {
    if (closed) throw new Error("turn read after its callback returned");
    if (!open) throw new Error("turn read outside readTurn");
  };
  const memo = (bucket, k, fn) => {
    guard();
    let m = caches.get(bucket);
    if (!m) caches.set(bucket, (m = new Map()));
    if (!m.has(k)) m.set(k, fn());
    return m.get(k);
  };
  // Every game call below goes through one of these: damage with the predicted Tera on, the AI with it off.
  const asDamage = fn => (patches.length ? withPatches(patches, fn) : fn());
  const asAi = fn => beforeTera(() => asDamage(fn));

  const turn = {
    live, key, facts,
    mon: p => memo("mon", p, () => monRecord(env, live, p)),
    outcome: (atk, def, pm, opts = {}) => memo("outcome", `${atk.id}|${def.id}|${atk.moveset?.indexOf?.(pm)}|${pm?.getMove?.()?.id}|${!!opts.aiView}|${opts.crit}`,
      () => (live ? asDamage(() => sceneOutcome(env, atk, def, pm, opts)) : approxOutcome(env, atk, def, pm))),
    outcomes: (atk, def) => memo("outcomes", `${atk.id}|${def.id}`,
      () => (live ? asDamage(() => sceneOutcomes(env, atk, def)) : approxOutcomes(env, atk, def))),
    statusMoves: (atk, def) => memo("statusMoves", `${atk.id}|${def.id}`,
      () => (live ? asDamage(() => sceneStatusMoves(env, atk, def)) : [])),
    stopped: (atk, def) => memo("stopped", `${atk.id}|${def.id}`,
      () => (live ? asDamage(() => sceneStopped(env, atk, def)) : [])),
    // Answered live or not, since it decides nothing. Not memoised: callers ask about made-up HP, statuses and item
    // stacks on `Object.create` clones.
    turnEndHp: (p, opts = {}) => { guard(); return asDamage(() => sceneTurnEndHp(env, p, opts)); },
    // The base turn's, even on a derived turn: the enemy picked before any move a hypothesis could make.
    exactMoves: ranges => shared.exactMoves(ranges ?? []),
    // The gate (#183). `ok` only means nothing has failed; whether a foe's move is exact is `enemyAction(foe).exact`.
    exact: () => shared.exactMoves([]),
    // `moves` is empty where the exact call was there to make and failed: the distribution is never substituted (#183).
    enemyAction: (foe, { ranges = [] } = {}) => memo(`enemyAction:${ranges.join(",")}`, foe, () => {
      const sw = turn.switches().get(foe);
      // `switchBack` (#285) arrives with `resetSummonData()`, so readers price it at base stat stages
      // (game-code.md §7).
      if (sw) return { moves: [], switchTo: sw.to, switchBack: !!sw.back, tera: false, skip: false, exact: false, confidence: null };
      const skip = skipsTurn(env, foe);

      const ex = live ? turn.exactMoves(ranges) : null;
      if (ex && !ex.ok) return { moves: [], switchTo: null, tera: false, skip, unavailable: ex.reason, exact: false, confidence: null };
      // A skipped foe was still asked above, since it spends its draws (game-code.md §6); it never acts.
      if (skip) return { moves: [], switchTo: null, tera: false, skip: true, exact: false, confidence: null };
      const row = ex?.moves?.get(foe) ?? null;
      if (row) return { moves: [row], switchTo: null, tera: turn.teraNow(foe), skip, exact: true, confidence: ranges.length ? "replay" : "exact" };
      return { moves: turn.enemyDistribution(foe), switchTo: null, tera: turn.teraNow(foe), skip, exact: false, confidence: "estimate" };
    }),
    // Asked on its own, not through `enemyAction`: the Tera flags must be settled before any damage answer is memoised,
    // and a turn whose AI can't be asked would otherwise memo our damage priced pre-Tera.
    teraNow: foe => memo("tera", foe, () => !turn.switches().get(foe) && !!tryDo(() => env.trainer?.shouldTera?.(foe), false)),
    // Whatever the exact call said: later turns are played from it, and it is that call's oracle at a pin bump (#183).
    enemyDistribution: foe => memo("dist", foe, () => (live
      ? tryDo(() => asAi(() => sceneDistribution(env, foe)), null) ?? approxDistribution(foe, (e, o) => turn.outcomes(e, o))
      : approxDistribution(foe, (e, o) => turn.outcomes(e, o)))),
    // All slots at once: each decision moves the counter the next reads (game-code.md §7).
    switches: () => memo("switches", "", () => (live ? asAi(() => sceneSwitches(env, turn.activeFoes())) : new Map())),
    activeFoes: () => memo("activeFoes", "", () => {
      const out = env.foes.filter(p => p.isOnField?.());
      return (out.length ? out : env.foes).slice(0, env.double ? 2 : 1);
    }),
    replayAI: (foe, target, opts = {}) => memo("replay", `${foe.id}|${target.id}|${opts.hp ?? ""}|${opts.bi ?? ""}`,
      () => (live ? tryDo(() => asAi(() => sceneReplayAI(env, foe, target, opts)), null) : null)),
    sendInScore: (f, me) => memo("sendIn", `${f.id}|${me.id}`, () => (live ? tryDo(() => asAi(() => sceneSendInScore(env, f, me)), null) : null)),
    // Step 7's score for a move of ours (game-code.md §6), as one number; 0 without game code, so nothing is nudged.
    benefit: (atk, def, mv) => memo("benefit", `${atk.id}|${def.id}|${mv?.id ?? mv?.name}`, () => {
      if (!live || !mv) return 0;
      const n = tryDo(() => asAi(() => (aiTargetScore(env, atk, mv, def.getBattlerIndex?.() ?? BattlerIndex.ENEMY, def) ?? [])
        .reduce((t, b) => t + b.score * b.p, 0)), 0);
      return Number.isFinite(n) ? n : 0;
    }),
    // 1 when `a` goes first at a speed tie, 0 when `b` does, null when nothing settles it.
    speedTie: (a, b) => memo("speedTie", `${a.id}|${b.id}`, () => (live ? sceneSpeedTie(env, facts, a, b) : null)),
    // A caller's own memo, with this turn's lifetime; a derived turn keeps its own.
    memo: (k, fn) => memo("caller", k, fn),
    assuming: more => makeTurn(env, { live, facts, baseKey, patches: [...patches, ...more], shared }),
    __close: () => { closed = true; },
  };
  // Only at a command prompt: at the free switch prompt or a faint's replacement the enemy decides later, against a
  // field still being chosen. A foe the trainer switches out is never asked, and must not spend draws before the next
  // slot's call (game-code.md §6).
  if (!patches.length) {
    shared.exactMoves = ranges => memo("exact", ranges.join(","), () => {
      if (!live || facts.decision !== "command") return { ok: true, moves: new Map() };
      const sw = turn.switches();
      const asking = turn.activeFoes().filter(f => !sw.has(f));
      if (!asking.length) return { ok: true, moves: new Map() };
      return beforeTera(() => sceneExactMoves(env, asking, ranges));
    });
  }
  return turn;
};

// Everything that changes an answer belongs in the key: the card's hold and the derived turns are told apart by it.
const turnKeyOf = (env, facts) => [facts.wave, facts.turn, facts.enemySwitchCounter, facts.decision,
  ...[...env.playerParty, ...env.foes].map(p => p && `${p.id}:${p.hp}:${p.bossSegmentIndex ?? ""}:${p.isOnField?.() ? 1 : 0}:${p.isTerastallized ? 1 : 0}`)].join("|");

const predictedTeras = (env, turn) => {
  if (!env.trainer?.shouldTera) return [];
  return turn.activeFoes().filter(e => tryDo(() => turn.teraNow(e), false));
};

// The turn is dead once `fn` returns.
export const readTurn = (s, fn) => {
  openRead("turn"); // refuses while a turn or a run read is open: sequential, never nested
  try {
    return readOpened(s, fn);
  } finally { closeRead(); }
};
const readOpened = (s, fn) => {
  const env = sceneEnv(s);
  // Live while the game waits on a decision (game-code.md §9). A call that can't be answered falls back for that
  // answer alone, and its record says so.
  const live = !!s && awaitingDecision(s) !== null;
  const facts = sceneFacts(s, env, live);
  const turn = makeTurn(env, { live, facts, baseKey: turnKeyOf(env, facts), shared: {} });
  const finish = () => { try { return fn(turn); } finally { turn.__close(); } };
  open = true;
  try {
    // The Tera prediction is itself an AI answer, so it is read (inside the sandbox) before the flags go on.
    return live ? sandbox(s, () => withPredictedTera(predictedTeras(env, turn), finish)) : finish();
  } finally { open = false; }
};
