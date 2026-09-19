// The turn read: the one door between the coach engine and the live battle.
//
// `readTurn(s, fn)` decides **once** whether this refresh's answers come from the game's own code, opens the single
// sandbox, sets the Tera a trainer is about to use, and hands `fn` a **turn** — an object that answers questions
// about this moment and nothing else. 30-planner, 35-team-plan and 45-catch ask it; they never see the scene.
//
// What that buys, each of which used to be a caller's problem:
// - **One sandbox.** It opens here and closes when `fn` returns. Nothing below opens another, and a turn used after
//   its callback throws rather than reading a scene that has moved on.
// - **One key.** Wave, turn, enemy switch counter, the decision kind, each mon's id / HP / boss bar / on-field flag /
//   Tera, and the assumption. Every answer is memoised under it, so damage, the AI, switches and the plan can no
//   longer disagree about what "this turn" is — five caches with four different keys did.
// - **Tera and hypotheses live here.** TeraPhase runs before any move, so damage answers are post-Tera; the AI chose
//   in EnemyCommandPhase, before it, so AI answers are pre-Tera. No caller wraps anything. `turn.assuming(patches)`
//   is a derived turn whose answers are the game's own on a state one move away (a Swords Dance, a Thunder Wave).
// - **One approximation.** Before the game waits on a decision, or against a mock, the same questions are answered
//   from the type chart with `live` false. Callers label; they don't branch on a scene.
//
// Game-calling code still lives where it belongs — 10-damage and 20-enemy-ai — and is imported only here (their
// `@only 25-turn, tests` exports). This file decides *when*; they know *how*.
import { TYPES, awaitingDecision, effectiveness, sandbox, stat, typesOf } from "./01-core.js";
import { waveKind } from "./03-calendar.js";
import { moveTraits } from "./07-move-traits.js";
import { approxOutcome, approxOutcomes, barBreakFactors, sceneOutcome, sceneOutcomes, sceneStatusMoves, sceneTurnEndHp, stateOf, targetFacts } from "./10-damage.js";
import { aiTargetScore, approxDistribution, sceneDistribution, sceneReplayAI, sceneSendInScore, sceneSwitches, skipsTurn } from "./20-enemy-ai.js";

// ---- Predicted Terastallization (spec §7)
// TeraPhase runs at TurnStart, before any move, so a trainer mon that Terastallizes this turn already defends with
// [getTeraType()] and gets Tera STAB by the time damage is dealt. The game computes all of that itself once
// `isTerastallized` is set (TeraPhase also clears an added type), so the whole refresh runs with the flag set on the
// foes that will Tera and takes it back off afterwards. Every AI answer is asked with it off (`beforeTera`), because
// EnemyCommandPhase ran before TeraPhase.
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

// ---- Hypotheses: a state one move away
// `turn.assuming(patches)` asks the game's own damage and AI code about a state this turn's move would make — our
// stat stages after Swords Dance, a foe paralysed by Thunder Wave — by writing that state onto the live mons for one
// synchronous call and putting it back. Patches: `{ mon, stages: { [stat 1–5]: change } }` (clamped to ±6),
// `{ mon, status: { effect, … } }`, `{ mon, types: [PokemonType] }` (Soak, Magic Powder) and
// `{ mon, addedType: PokemonType }` (Forest's Curse, Trick-or-Treat) — the two fields `getTypes` reads
// (`summonData.types`, `summonData.addedType`), so the game's own damage, STAB and AI code price a retyped mon.
// `patchKey` names the state, and it is part of the derived turn's key, so nothing hypothetical is ever answered
// from a real memo slot or the other way round.
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

// ---- What the scene says
// Everything 10-damage and 20-enemy-ai need from the scene, read once. `s` stays on it for the calls that are the
// arena's own (`isMoveWeatherCancelled`) and for the forced battle RNG.
const tryDo = (fn, fallback = null) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const sceneEnv = s => {
  const b = s?.currentBattle ?? {};
  const foes = tryDo(() => s.getEnemyParty(), []) ?? [];
  const party = tryDo(() => s.getPlayerParty(), []) ?? [];
  return {
    s, foes, playerParty: party,
    // The side a mon is on, which only Beat Up's hit count needs (10-damage's `traitsNow`).
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

// The game's own answers about the run, or the run calendar's where the call can't be made.
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
    // True for every challenge run: the mode copies the whole challenge list, values and all.
    anyChallenges: call(() => mode.hasAnyChallenges(), (mode.challenges ?? []).length > 0),
    finalBoss: call(() => mode.isBattleClassicFinalBoss(wave), !!mode.isClassic && lastWave()),
    endlessMinorBoss: call(() => mode.isEndlessMinorBoss(wave), !!mode.isEndless && lastWave()),
    waveFinal: call(() => mode.isWaveFinal(wave), lastWave()),
    // Read straight off the config rather than through `getDailyEventSeedBoss()` (`daily-run.ts:189-201`). Two of
    // that function's three steps are already here: `isDailyEventSeed()` is `isDaily && dailyConfig != null`, which
    // the optional chain and every caller's own `daily` check cover. The third, `validateDailyBossConfig`, returns
    // null for a boss whose `speciesId` the `SpeciesId` enum lacks — the schema requires a positive integer but
    // never checks membership — and then there is no custom boss and no catchable one. The HUD cannot test that:
    // the bundler injects only the enum members the HUD names, so it has no list to check against. Left as is: it
    // takes a hand-written daily seed naming a species that does not exist, and the miss is one line on one wave.
    dailyBossCatchable: !!mode.dailyConfig?.boss?.catchable,
  };
};

// The plain reads every battle caller used to take off the scene itself.
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
    // Slot 1's command phase in a double: slot 0's command is already in (`CommandPhase.handleFightCommand` /
    // `tryLeaveField`; `SelectTargetPhase` puts a chosen target on the command itself). The planner maps the cursor
    // and the battler indices onto its own party and field; what is read off the scene is only this.
    command: b.double && ph?.phaseName === "CommandPhase" && ph.fieldIndex === 1 && cmd && !cmd.skip
      ? { kind: cmd.command, cursor: cmd.cursor, move: cmd.move, targets: cmd.targets?.length ? cmd.targets : cmd.move?.targets ?? [] }
      : null,
  };
};

// ---- The speed tie the shuffle has already drawn
// A speed tie is not a coin flip. The game shuffles the turn's move phases with `randSeedShuffle` under
// `executeWithSeedOffset(turn × 1000 + <queue length>, waveSeed)` and only then sorts them by Speed — a stable sort,
// so the shuffle decides every tie, and the priority pass after it is stable too (spec §5, `sortInSpeedOrder`). That
// draw depends on nothing either side does this turn, so it is knowable before committing to a move.
// In a single battle with both sides using a move the queue is [ours, theirs] and length 2, so one Fisher-Yates draw
// settles it: drawing 0 swaps them. Trick Room reverses the sorted groups afterwards, which swaps a tie back.
// Everything else has no answer (null, so the caller keeps its coin flip) — doubles, where the queue's length and
// order turn on who is switching, and a mon not on the field, which has no phase in the queue at all.
// `executeWithSeedOffset` restores the RNG state, offset and override itself, so this reads the stream without
// moving it — which is why it is a turn read and not something a caller may do for itself.
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

// ---- The per-mon record
// One read per mon per turn of everything that takes a game call: what decides a hit on it (`facts`), where it
// stands (`state`), its effective Speed and a move's priority bracket, the stages its own setup move would add,
// whether a status can be put on it, and its Stealth Rock share. Callers keep the Pokemon itself for plain fields
// and for identity; the fake turn hands back records built from tables instead.
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
// Stat stages a status move of `p`'s changes on `p` itself (Swords Dance, Dragon Dance, Shell Smash, Belly Drum):
// { [stat 1–5]: change } after Simple / Contrary and the ±6 cap, or null. Accuracy and evasion aren't counted.
// Which stages a move moves is the traits' (a move aimed at the user's own side counts even when its attribute
// doesn't say so — Howl carries no `selfTarget`); a move aimed at a partner's slot moves the partner's stats, not
// ours. The ability multiplier and the cap are the moment's, which is why this is the turn's answer and not 07's.
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
    // Priority, the bracket a held item or Quick Draw can jump, for one moveset entry (or a bare `{ priority }`).
    order: pm => {
      const mv = pm?.getMove?.() ?? pm ?? {};
      return {
        priority: live && mv.getPriority ? tryDo(() => mv.getPriority(p, true), mv.priority ?? 0) : mv.priority ?? 0,
        bracket: live && mv.getPriorityModifier ? tryDo(() => mv.getPriorityModifier(p, true), MovePriorityInBracket.NORMAL) : MovePriorityInBracket.NORMAL,
        category: mv.category,
      };
    },
    setup: mv => setupStages(p, mv),
    // Can `effect` be put on it by `by`? The game's own check, quiet so no messages; the type immunities otherwise.
    canTake: (effect, by) => {
      if (live && typeof p.canSetStatus === "function") {
        const v = tryDo(() => !!p.canSetStatus(effect, true, false, by), null);
        if (v !== null) return v;
      }
      return !typesOf(p).some(ty => TYPE_STATUS_IMMUNE[effect]?.includes(ty));
    },
    // The share of its max HP a Stealth Rock layer takes off it (⅛ × Rock effectiveness), 0 through Magic Guard.
    rockChip: (() => {
      if (tryDo(() => !!p.hasAbilityWithAttr?.("BlockNonDirectDamageAbAttr"), false)) return 0;
      const e = live ? tryDo(() => p.getAttackTypeEffectiveness(PokemonType.ROCK, { ignoreStrongWinds: true }), null) : null;
      return 0.125 * (e ?? effectiveness("Rock", p));
    })(),
    // A wild boss's stat rise as each of its bars breaks, as a damage factor on each bar from now.
    bars: (st, n, offence = false) => barBreakFactors(p, st, n, offence, trainer),
    // The weather a move of its own is judged in (`getEffectiveWeatherForMove`, `src/data/weather.ts:233`): an
    // ability that overrides it (Mega Sol) answers first and **supersedes suppression**, so a Cloud Nine on the
    // field doesn't take the overridden weather away; only the live weather is suppressible.
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

// ---- The turn
let open = false;
const makeTurn = (env, { live, facts, baseKey, patches = [] }) => {
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
  // Every game call the turn makes runs with the assumption written on, and with a predicted Tera on for damage and
  // off for the AI. Nothing below this point re-decides either.
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
    // Signed turn-end HP change. Answered on either turn: it reads the mon's items, tags and abilities and the
    // arena, and calls nothing that decides anything. Not memoised — callers ask about made-up HP, made-up statuses
    // and made-up item stacks (`Object.create` clones), which is the question, not a repeat of one.
    turnEndHp: (p, opts = {}) => { guard(); return asDamage(() => sceneTurnEndHp(env, p, opts)); },
    // `{ moves, switchTo, tera, skip }` — the enemy's whole turn. A switching mon doesn't Terastallize.
    enemyAction: foe => memo("enemyAction", foe, () => {
      const sw = turn.switches().get(foe);
      if (sw) return { moves: [], switchTo: sw.to, tera: false, skip: false };
      if (skipsTurn(env, foe)) return { moves: [], switchTo: null, tera: false, skip: true };
      const moves = live
        ? tryDo(() => asAi(() => sceneDistribution(env, foe)), null) ?? approxDistribution(foe, (e, o) => turn.outcomes(e, o))
        : approxDistribution(foe, (e, o) => turn.outcomes(e, o));
      return { moves, switchTo: null, tera: !!tryDo(() => env.trainer?.shouldTera?.(foe), false), skip: false };
    }),
    // The trainer's switch decisions for this turn, all slots at once: each one moves the counter the next reads.
    switches: () => memo("switches", "", () => (live ? asAi(() => sceneSwitches(env, turn.activeFoes())) : new Map())),
    activeFoes: () => memo("activeFoes", "", () => {
      const out = env.foes.filter(p => p.isOnField?.());
      return (out.length ? out : env.foes).slice(0, env.double ? 2 : 1);
    }),
    // getNextMove replayed against one target, which need not be on the field: what the foe picks next turn against
    // a mon of ours that isn't out yet, or against a field one a move from now. Null when it can't be replayed.
    replayAI: (foe, target, opts = {}) => memo("replay", `${foe.id}|${target.id}|${opts.hp ?? ""}|${opts.bi ?? ""}`,
      () => (live ? tryDo(() => asAi(() => sceneReplayAI(env, foe, target, opts)), null) : null)),
    sendInScore: (f, me) => memo("sendIn", `${f.id}|${me.id}`, () => (live ? tryDo(() => asAi(() => sceneSendInScore(env, f, me)), null) : null)),
    // What the game's own move scoring makes of a move of ours here — full step 7 of `getNextMove` — as one number.
    // 0 without game code, so nothing is nudged.
    benefit: (atk, def, mv) => memo("benefit", `${atk.id}|${def.id}|${mv?.id ?? mv?.name}`, () => {
      if (!live || !mv) return 0;
      const n = tryDo(() => asAi(() => (aiTargetScore(env, atk, mv, def.getBattlerIndex?.() ?? BattlerIndex.ENEMY, def) ?? [])
        .reduce((t, b) => t + b.score * b.p, 0)), 0);
      return Number.isFinite(n) ? n : 0;
    }),
    // Which of two mons the turn's own shuffle put first at a speed tie, or null when nothing settles it.
    speedTie: (a, b) => memo("speedTie", `${a.id}|${b.id}`, () => (live ? sceneSpeedTie(env, facts, a, b) : null)),
    // A caller's own working: the plan searches the same exchange from many candidate fields, and every answer it
    // builds is a fact about this turn like any other. One key, one lifetime, and a derived turn keeps its own.
    memo: (k, fn) => memo("caller", k, fn),
    // A derived turn: the same questions, answered on a state one move away, in its own memo slots.
    assuming: more => makeTurn(env, { live, facts, baseKey, patches: [...patches, ...more] }),
    __close: () => { closed = true; },
  };
  return turn;
};

// The wide key: everything that changes an answer. It is what the card's hold and the derived turns are told apart by.
const turnKeyOf = (env, facts) => [facts.wave, facts.turn, facts.enemySwitchCounter, facts.decision,
  ...[...env.playerParty, ...env.foes].map(p => p && `${p.id}:${p.hp}:${p.bossSegmentIndex ?? ""}:${p.isOnField?.() ? 1 : 0}:${p.isTerastallized ? 1 : 0}`)].join("|");

// The foes that Terastallize before they move this turn: on the field, acting, and the trainer says so.
const predictedTeras = (env, turn) => {
  if (!env.trainer?.shouldTera) return [];
  return turn.activeFoes().filter(e => tryDo(() => turn.enemyAction(e).tera, false));
};

// Reads this turn and hands it to `fn`. The only sandbox the battle engine opens, and the only place that decides
// whether the answers are the game's own: while the game waits on a decision (CommandPhase, the free "will you
// switch?" prompt, a faint's replacement) and the damage call is actually there to make. `fn`'s value is returned;
// the turn is dead afterwards.
export const readTurn = (s, fn) => {
  if (open) throw new Error("readTurn: a turn is already open");
  const env = sceneEnv(s);
  // Live means the game is waiting on a decision — no phase is mid-execution and the enemy hasn't chosen yet — which
  // is the one thing that decides whether its own code may be called (game-code.md §9). Whether a *particular* call
  // can be answered is the adapter's business: a question the game can't answer falls back to the approximation for
  // that answer alone, and the record says so, so nothing is ever labelled live that isn't.
  const live = !!s && awaitingDecision(s) !== null;
  const facts = sceneFacts(s, env, live);
  const turn = makeTurn(env, { live, facts, baseKey: turnKeyOf(env, facts) });
  const finish = () => { try { return fn(turn); } finally { turn.__close(); } };
  open = true;
  try {
    // The Tera prediction is itself an AI answer, so it is read (inside the sandbox) before the flags go on.
    return live ? sandbox(s, () => withPredictedTera(predictedTeras(env, turn), finish)) : finish();
  } finally { open = false; }
};
