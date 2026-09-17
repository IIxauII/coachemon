// Damage: what each move does to a target this turn, and how the target's HP holds up over repeated uses (KO pacing).
// While the game waits for a command, the numbers come from the game's own damage code (Pokemon.getAttackDamage,
// simulated, inside `sandbox`), so held items, abilities, stat stages, weather, screens and form-dependent types
// are the game's. Everything the simulated call leaves out is modelled here from the coach spec (game-code.md):
// the damage roll, crits, accuracy, multi-hit counts, boss HP segments, Sturdy / Focus Band / endure survival and
// turn-end HP changes (weather and status chip, berries, Leftovers and other heals). Outside the command phase, or against mocks without game functions, the old
// approximation keeps the panel rendering.

// Per-turn damage discount for moves that often don't land when chosen: Focus Punch fails if the user is hit
// first, charging and recharging moves spend a second turn, negative priority moves go last.
const reliability = mv => {
  if (hasAttr(mv, "PreUseInterruptAttr")) return 0.4;
  if (mv.isChargingMove?.() || hasAttr(mv, "RechargeAttr")) return 0.5;
  return mv.priority < 0 ? 0.8 : 1;
};
// Only used by the approximation: enemy damage estimated without rolls, crits or items gets a safety margin.
const FOE_MARGIN = 1.15;

// Private helpers live in this closure so their names can't collide with other hud modules.
const { moveOutcome, moveOutcomes, statusMoves, endOfTurnHp, hits, stateOf, hitOn, koCurve } = (() => {
  // Class names survive minification; subclasses count (FixedDamageAttr covers Super Fang, Seismic Toss…).
  const isA = (x, name) => {
    for (let c = x?.constructor; c?.name; c = Object.getPrototypeOf(c)) if (c.name === name) return true;
    return false;
  };
  const attrs = (mv, name) => (mv.attrs || []).filter(a => isA(a, name));
  const hasFlag = (mv, f) => (typeof mv.hasFlag === "function" ? mv.hasFlag(f) : !!((mv.flags ?? 0) & f));
  const ability = (p, attr) => { try { return !!p.hasAbilityWithAttr?.(attr); } catch { return false; } };
  const items = p => { try { return p.getHeldItems?.() ?? []; } catch { return []; } };
  const stack = (p, name) => items(p).filter(m => m.constructor.name === name).reduce((t, m) => t + (m.getStackCount?.() ?? m.stackCount ?? 1), 0);
  const sceneNow = () => {
    try { return Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p?.game).game.scene.getScene("battle"); } catch { return null; }
  };
  const gameReady = (s, atk, def) => !!s && awaitingCommand(s) && typeof def.getAttackDamage === "function" && typeof atk.getMoveType === "function";
  const turnKey = s => {
    const b = s.currentBattle;
    return [b?.waveIndex, b?.turn, b?.enemySwitchCounter, ...(s.getField?.() ?? []).map(p => p && `${p.id}:${p.hp}`)].join("|");
  };
  let cache = { key: null, map: new Map() };
  const cached = (s, key, fn) => {
    const turn = turnKey(s);
    if (cache.key !== turn) cache = { key: turn, map: new Map() };
    const k = `${key}|${activeHypothesisKey()}`;
    if (!cache.map.has(k)) cache.map.set(k, fn());
    return cache.map.get(k);
  };
  // Sucker Punch and Thunderclap read the target's chosen command, which doesn't exist yet while we choose: their
  // condition is left to the planner (`needsAttack`). (Upper Hand needs a priority move from the target: dropped.)
  const COMMAND_CONDITION = [MoveId.SUCKER_PUNCH, MoveId.THUNDERCLAP];
  // Damaging moves with PP left. With `def` and game calls allowed, also only what can be picked and would work this
  // turn: restrictions checked for selection (Disable, Taunt, Encore, Torment, Imprison…) and the move's own
  // conditions (Fake Out / First Impression after the first turn, Dream Eater on an awake target, Belch, Steel
  // Roller…). Conditions can draw from the battle RNG, so they run with it forced, like the enemy AI's.
  // `status`: the status moves instead.
  const usable = (p, def = null, s = null, status = false) => {
    const base = p.moveset.filter(Boolean).filter(pm => (pm.getMove().category === MoveCategory.STATUS) === status && pm.getMovePp() - pm.ppUsed > 0);
    if (!def || !gameReady(s, p, def)) return base;
    return cached(s, `u|${p.id}|${def.id}|${status}|${base.map(pm => pm.getMove().id)}`, () => guarded(s, () => base.filter(pm => {
      if (typeof pm.isUsable === "function") {
        const r = pm.isUsable(p, false, true);
        if (!(Array.isArray(r) ? r[0] : r)) return false;
      }
      const mv = pm.getMove();
      if (typeof mv.applyConditions !== "function" || COMMAND_CONDITION.includes(mv.id)) return true;
      try { return !!forcedRng(s, () => mv.applyConditions(p, def, -1)); } catch { return true; }
    })));
  };
  // What a move costs over turns and what it depends on. `charge`: a charging turn before the hit (Solar Beam
  // outside sun, Sky Attack, Skull Bash; Dig / Fly / Dive / Bounce semi-invulnerable meanwhile, `semiCharge`) —
  // unless its instant-charge condition holds now; `recharge`: a lost turn after it (Hyper Beam, Giga Impact);
  // `interrupt`: fails if the user is hit first (Focus Punch); `needsAttack`: fails unless the target attacks
  // (Sucker Punch, Thunderclap); `once`: only on the user's first turn out (Fake Out, First Impression).
  const traits = (atk, mv, live) => {
    const charging = !!mv.isChargingMove?.();
    const chargeAttrs = mv.chargeAttrs ?? [];
    const instant = charging && live && chargeAttrs.some(a => isA(a, "InstantChargeAttr") && a.condition?.(atk, mv));
    return {
      charge: charging && !instant,
      semiCharge: charging && !instant && chargeAttrs.some(a => isA(a, "SemiInvulnerableAttr")),
      recharge: attrs(mv, "RechargeAttr").length > 0,
      interrupt: attrs(mv, "PreUseInterruptAttr").length > 0,
      needsAttack: COMMAND_CONDITION.includes(mv.id),
      once: [mv.conditions, mv.conditionsSeq2, mv.conditionsSeq3].some(cs => (cs ?? []).some(c => isA(c, "FirstMoveCondition"))),
    };
  };

  // ---- Boss segments and survival (spec §3, §8). Pure math on read fields.
  // calculateBossSegmentDamage (utils/damage, exported; EnemyPokemon.damage calls it), verbatim.
  const bossSegmentDamage = (dmg, hp, segSize, minIdx = 0, idx) => {
    const a = idx ?? Math.ceil(hp / segSize) - 1;
    if (a <= 0) return [dmg, 1];
    const floorHp = segSize * a;
    const excess = dmg - (hp - Math.round(floorHp));
    if (excess < 0) return [dmg, a + 1];
    if (excess === 0) return [dmg, a];
    const c = Math.min(Math.max(Math.floor(Math.log2(excess / segSize)), 0), a - minIdx);
    return [Math.max(Math.floor(hp - floorHp + segSize * c), 1), a - c];
  };
  // What decides how a hit resolves on `t`. `ignoreAbility`: Mold Breaker, or the AI not knowing the ability.
  const targetFacts = (s, t, ignoreAbility = false) => {
    const maxHp = t.getMaxHp();
    const segs = t.bossSegments > 0 && (t.isBoss?.() ?? true) ? t.bossSegments : 0;
    const enemy = typeof t.isPlayer === "function" && !t.isPlayer();
    const endure = enemy && !t.waveData?.endured ? (s?.enemyModifiers ?? []).find(m => m.constructor.name === "EnemyEndureChanceModifier") : null;
    return {
      maxHp, hp: t.hp, boss: segs > 0, segs, segSize: segs ? maxHp / segs : 0, idx: segs ? t.bossSegmentIndex ?? segs - 1 : 0,
      minIdx: s?.currentBattle?.isClassicFinalBoss && !t.formIndex ? 1 : 0,
      finalBoss: enemy && !!s?.currentBattle?.isClassicFinalBoss && !t.formIndex,
      sturdy: !ignoreAbility && maxHp > 1 && ability(t, "PreDefendFullHpEndureAbAttr"),
      pFocus: Math.min(1, 0.1 * stack(t, "SurviveDamageModifier")),
      pEndure: endure ? Math.min(1, (endure.chance ?? 2) * (endure.getStackCount?.() ?? 1) / 100) : 0,
      // Reviver Seed (FaintPhase): a faint brings it straight back at half HP, so no KO.
      revive: stack(t, "PokemonInstantReviveModifier") ? Math.max(1, Math.floor(maxHp / 2)) : 0,
    };
  };
  // A landed hit of `d` at `hp` on boss bar `bar`, as EnemyPokemon.damage takes it before any survival: the bar rule
  // clamps it (a hit past a bar by 2^k bars' worth breaks k more at once), then the classic final boss's first form
  // stops at 1 HP on its last bar. [damage, bar after]. OHKO results skip segments.
  const barStep = (f, hp, bar, d, ohko = false) => {
    let after = bar;
    if (f.boss && !ohko) {
      const [bd, seg] = bossSegmentDamage(d, hp, f.segSize, f.minIdx, bar);
      d = bd;
      after = Math.max(0, Math.min(bar, seg - 1));
    }
    if (f.finalBoss && bar < 1) d = Math.min(d, hp - 1);
    return [d, after];
  };
  // One landed hit of `d` on state {hp, idx, tok} as EnemyPokemon.damage / Pokemon.damage resolve it:
  // [[state, probability], ...]. `tok`: the enemy endure token is up, so every later lethal hit this turn leaves 1 HP.
  const landHit = (f, st, d, ohko) => {
    let idx;
    [d, idx] = barStep(f, st.hp, st.idx, d, ohko);
    if (st.hp - d > 0) return [[{ hp: st.hp - d, idx, tok: st.tok }, 1]];
    if (st.tok || (f.sturdy && st.hp >= f.maxHp)) return [[{ hp: 1, idx, tok: st.tok }, 1]];
    return [
      [{ hp: 1, idx, tok: true }, f.pEndure],
      [{ hp: 1, idx, tok: false }, (1 - f.pEndure) * f.pFocus],
      [{ hp: 0, idx, tok: false }, (1 - f.pEndure) * (1 - f.pFocus)],
    ].filter(([, p]) => p > 0);
  };
  // Distribution of the target's end state over the whole move. `perHit[k]`: Map damage → probability for hit k;
  // `dist`: [{n, p}] hit counts; `acc`: chance each rolled hit lands; `checkAll`: every hit rolls (else only the
  // first). A miss or a faint ends the move; earlier hits stay.
  const resolve = (f, perHit, dist, acc, checkAll, ohko = false) => {
    const add = (m, st, p) => {
      if (!(p > 0)) return;
      const k = `${st.hp}|${st.idx}|${st.tok}`;
      const e = m.get(k);
      if (e) e.p += p; else m.set(k, { hp: st.hp, idx: st.idx, tok: st.tok, p });
    };
    const atLeast = n => dist.filter(x => x.n >= n).reduce((t, x) => t + x.p, 0);
    const done = new Map();
    let live = new Map();
    add(live, { hp: f.hp, idx: f.idx, tok: false }, 1);
    const hitsMax = Math.max(...dist.map(x => x.n));
    for (let k = 0; k < hitsMax && live.size; k++) {
      const go = (k ? atLeast(k + 1) / atLeast(k) : atLeast(1)) * (k === 0 || checkAll ? acc : 1);
      const next = new Map();
      for (const st of live.values()) {
        if (st.hp <= 0) { add(done, st, st.p); continue; }
        add(done, st, st.p * (1 - go));
        for (const [d, p] of perHit[Math.min(k, perHit.length - 1)]) for (const [ns, q] of landHit(f, st, d, ohko)) add(next, ns, st.p * go * p * q);
      }
      live = next;
    }
    for (const st of live.values()) add(done, st, st.p);
    return [...done.values()];
  };

  // Damage over one use of a move, before the target's HP or a boss bar cuts it: [{ d, p, n }] with a miss at 0, from
  // the per-hit Maps, the hit counts and accuracy as `resolve` reads them; `n` is the hits it lands in (a mean where
  // points were merged), which `koCurve` clamps at a boss bar one by one. Held to USE_POINTS points (`squeezeDist`):
  // later turns of a fight are played from it one KO-or-survive branch at a time.
  const USE_POINTS = 12;
  const useDist = (perHit, dist, acc, checkAll) => {
    const atLeast = n => dist.filter(x => x.n >= n).reduce((t, x) => t + x.p, 0);
    const done = new Map();
    const add = (m, d, p, n) => {
      if (!(p > 0)) return;
      const e = m.get(d);
      if (e) { e.n = (e.n * e.p + n * p) / (e.p + p); e.p += p; } else m.set(d, { d, p, n });
    };
    let live = [{ d: 0, p: 1, n: 0 }];
    const hitsMax = Math.max(...dist.map(x => x.n));
    for (let k = 0; k < hitsMax && live.length; k++) {
      const go = (k ? atLeast(k + 1) / (atLeast(k) || 1) : atLeast(1)) * (k === 0 || checkAll ? acc : 1);
      const next = new Map();
      for (const x of live) {
        add(done, x.d, x.p * (1 - go), x.n);
        for (const [d, q] of perHit[Math.min(k, perHit.length - 1)]) add(next, x.d + d, x.p * go * q, k + 1);
      }
      live = squeezeDist([...next.values()], 2 * USE_POINTS);
    }
    for (const x of live) add(done, x.d, x.p, x.n);
    return squeezeDist([...done.values()], USE_POINTS);
  };
  // Drain (Giga Drain, Leech Life, Draining Kiss): the share of the damage a hit deals that heals its user, signed.
  // HitHealAttr queues a PokemonHealPhase for floor(damage dealt × healRatio) after each hit; there a Heal Block stops
  // it and a player's Healing Charm raises it (×(1 + 0.1·stack)). A target with Liquid Ooze (ReverseDrainAbAttr) turns
  // the heal into that much damage to the user instead, unless the user has Magic Guard. Strength Sap heals by a stat,
  // not by damage, and is a status move: not counted.
  const drainRatio = (s, atk, def, move) => {
    const a = attrs(move, "HitHealAttr").find(x => x.healStat == null);
    if (!a) return 0;
    const ratio = a.healRatio ?? 0.5;
    if (ability(def, "ReverseDrainAbAttr")) return ability(atk, "BlockNonDirectDamageAbAttr") ? 0 : -ratio;
    if (atk.getTag?.("HEAL_BLOCK")) return 0;
    const charm = (atk.isPlayer?.() === false ? s?.enemyModifiers : s?.modifiers) ?? [];
    return ratio * charm.filter(m => m.constructor?.name === "HealingBoosterModifier")
      .reduce((t, m) => t * (1 + ((m.multiplier ?? 1.1) - 1) * (m.getStackCount?.() ?? 1)), 1);
  };
  // Chance a landed use of `move` flinches `def` (Fake Out, Iron Head): the move's effect chance as the game reads it
  // (Serene Grace, Shield Dust), none through Inner Focus. It only matters if the user moves first (the planner's call).
  const flinchChance = (atk, def, move, ignoreAbility) => {
    const fl = attrs(move, "FlinchAttr")[0];
    if (!fl || (!ignoreAbility && abilitiesOf(def).includes("Inner Focus"))) return 0;
    const c = typeof fl.getMoveChance === "function" ? fl.getMoveChance(atk, def, move, false, false) : move.chance ?? -1;
    return c < 0 ? 1 : Math.min(1, c / 100);
  };

  // One hit of `d` on `target` with no luck (Sturdy counts, Focus Band and the endure token don't): { hp, ko }.
  const applyHit = (s, target, d) => {
    const [end] = resolve({ ...targetFacts(s, target), pFocus: 0, pEndure: 0 }, [new Map([[Math.max(0, Math.floor(d)), 1]])], [{ n: 1, p: 1 }], 1, false);
    return { hp: Math.max(0, end.hp), ko: end.hp <= 0 };
  };

  // ---- KO pacing: how a target's HP holds up over repeated uses of a move — the chance it is down by each use, with
  // its boss bars, a Reviver Seed's second life, Focus Band and the enemy endure token behind it. Callers bring what
  // only they know (turn order, the AI's move mix, lost turns, stat changes over the fight) as `scale` and `act`.
  // A target's standing (`stateOf`): `hp`; its boss `bar` (bossSegmentIndex, 0 on the last or for a non-boss); whether
  // its Reviver Seed has been used (`revived`) and the enemy endure token (`tok`: 1 up this use, 2 spent for the wave);
  // and `facts`, what decides a hit on it (read once).
  const stateAt = (s, target, hp = target.hp, bar = null) => {
    const facts = targetFacts(s, target);
    return { hp, bar: bar ?? facts.idx, revived: false, tok: 0, facts };
  };
  const stateOf = (target, hp, bar) => stateAt(sceneNow(), target, hp, bar);
  // One landed hit of `dmg` on `state`, with no luck (no Focus Band, endure token or Reviver Seed): the state after it,
  // HP at least 0. The boss bar rule is the game's, per hit. A state without `facts` just loses the HP.
  const hitOn = (state, dmg) => {
    const [d, bar] = state.facts ? barStep(state.facts, state.hp, state.bar, Math.max(0, dmg)) : [Math.max(0, dmg), state.bar];
    return { ...state, hp: Math.max(0, state.hp - d), bar };
  };
  // A branch of a curve: a state (without its facts) with its probability `p`; `stop`: its use has ended (a revive).
  const branch = (hp, bar, revived, tok, p, stop = false) => ({ hp, bar, revived, tok, p, stop });
  // Lands a hit of `d` on branch `b` of a target with facts `f` and pushes what stands onto `out`; returns the probability
  // that goes down. A lethal hit meets the endure token (once a wave, then every lethal hit of that use leaves 1 HP),
  // Focus Band (each time) and a Reviver Seed (back at half HP, ending the use); without `luck` (status chip:
  // PostTurnStatusEffectPhase prevents enduring) only the seed.
  const land = (f, b, d, out, luck = true) => {
    const [dealt, bar] = barStep(f, b.hp, b.bar, Math.max(0, d));
    if (b.hp - dealt > 0) { out.push(branch(b.hp - dealt, bar, b.revived, b.tok, b.p)); return 0; }
    let gone = b.p;
    if (luck) {
      if (b.tok === 1) { out.push(branch(1, bar, b.revived, 1, b.p)); return 0; }
      const endure = b.tok ? 0 : f.pEndure;
      if (endure) out.push(branch(1, bar, b.revived, 1, b.p * endure));
      if (f.pFocus) out.push(branch(1, bar, b.revived, b.tok, b.p * (1 - endure) * f.pFocus));
      gone = b.p * (1 - endure) * (1 - f.pFocus);
    }
    if (!(gone > 0)) return 0;
    if (f.revive && !b.revived) { out.push(branch(f.revive, bar, true, b.tok, gone, true)); return 0; }
    return gone;
  };
  const KO_USES = 9;
  const KO_LEVELS = 4;
  // P(the target is down by the end of use n), `by[n - 1]` for n = 1..9. Each use splits every standing branch by the
  // damage points of `use` ([{ d, p, n }], `useOf`), landing its `n` hits one at a time on the game's bar rule, scaled by
  // `scale(i, broken)` on the i-th use (0-based; `broken`: bars broken since the start) and made with chance `act(i)`
  // (a lost turn deals nothing); the standing ones are merged back to a few HP levels per bar. `turnEnd`: the target's
  // HP change after each use it survives (heal +, capped at max HP; chip −, which a bar also stops and which can finish
  // it; a function of the use count when it changes over the fight). `cat` ("physical" / "special"): a wild boss's
  // Def / SpD rises as its bars break (`barBreakFactors`). `firstKo`: this turn's exact KO odds for use 1 (Sturdy, the
  // roll against the real HP), when the caller has them; the HP left still comes from the distribution. `hp`, `bar`:
  // where it starts, if not where it stands; `start`: the branches to begin from ([{ hp, bar, revived, tok, p }], p
  // summing to 1) when an earlier turn has already been played.
  // `after1`: the branches standing after use 1 and its turn end, p summing to 1 (none if it can't stand). `perChunk`:
  // the uses each bar takes before it breaks more likely than not, the last one's until the KO.
  const koCurve = (target, use, { hp, bar = null, start = null, scale = () => 1, act = () => 1, turnEnd = 0, firstKo = null, cat = null } = {}) => {
    const s = sceneNow();
    const init = stateAt(s, target, hp ?? target.hp, bar);
    const f = init.facts;
    const bars = init.bar + 1;
    const guard = cat && bars > 1 ? barBreakFactors(s, target, cat === "special" ? Stat.SPDEF : Stat.DEF, bars) : null;
    const points = use.map(x => ({ d: x.d, p: x.p, n: x.d > 0 ? Math.max(1, Math.round(x.n ?? 1)) : 0 }));
    let states = start?.length
      ? start.map(x => branch(x.hp, x.bar ?? init.bar, !!x.revived, x.tok ?? 0, x.p))
      : [branch(init.hp, init.bar, false, 0, 1)];
    const by = [];
    const brokeAt = Array(bars).fill(KO_USES);
    let down = 0, after1 = [];
    for (let i = 0; i < KO_USES; i++) {
      const a = Math.max(0, Math.min(1, act(i)));
      // The damage factor on this use, by bars broken so far.
      const factors = [];
      const factor = broken => (factors[broken] ??= scale(i, broken) * (guard ? guard[Math.min(broken, bars - 1)] : 1));
      const hit = [];
      let fell = 0;
      for (const st of states) {
        if (a < 1) hit.push(branch(st.hp, st.bar, st.revived, st.tok, st.p * (1 - a)));
        for (const x of points) {
          const q = st.p * a * x.p;
          if (!(q > 0)) continue;
          let branches = [branch(st.hp, st.bar, st.revived, st.tok, q)];
          for (let k = 0; k < x.n; k++) {
            const next = [];
            for (const b of branches) {
              if (b.stop) next.push(b);
              else fell += land(f, b, x.d / x.n * factor(init.bar - b.bar), next);
            }
            branches = next;
          }
          for (const b of branches) { b.stop = false; hit.push(b); }
        }
      }
      if (i === 0 && firstKo != null && !start) {
        const standing = hit.reduce((t, x) => t + x.p, 0);
        const k = Math.min(1, firstKo);
        if (standing > 0) for (const x of hit) x.p *= (1 - k) / standing;
        else if (k < 1) hit.push(branch(1, init.bar, false, 0, 1 - k));
        fell = k;
      }
      down += fell;
      // Turn end on each branch, then at most KO_LEVELS branches per bar (and seed and token state), the closest HPs
      // averaged: a hit or two left apart stay apart, rolls a few HP apart don't.
      const h = typeof turnEnd === "function" ? turnEnd(i + 1) : turnEnd;
      const groups = new Map();
      for (let b of hit) {
        if (b.tok) b.tok = 2;
        if (h > 0) b.hp = Math.min(f.maxHp, b.hp + h);
        else if (h < 0) {
          const out = [];
          down += land(f, b, -h, out, false);
          if (!out.length) continue;
          b = out[0];
        }
        const key = `${b.bar}|${b.revived}|${b.tok}`;
        if (!groups.has(key)) groups.set(key, { b, pts: [] });
        groups.get(key).pts.push({ d: b.hp, p: b.p });
      }
      states = [...groups.values()].flatMap(({ b, pts }) => squeezeDist(pts, KO_LEVELS).filter(x => x.p > 1e-9).map(x => branch(x.d, b.bar, b.revived, b.tok, x.p)));
      if (i === 0) {
        const p = states.reduce((t, x) => t + x.p, 0);
        after1 = p > 0 ? states.map(x => ({ hp: x.hp, bar: x.bar, revived: x.revived, tok: x.tok, p: x.p / p })) : [];
      }
      by.push(Math.min(1, down));
      for (let k = 1; k <= bars; k++) {
        if (brokeAt[k - 1] < KO_USES) continue;
        const gone = down + (k < bars ? states.reduce((t, x) => t + (init.bar - x.bar >= k ? x.p : 0), 0) : 0);
        if (gone >= 0.5) brokeAt[k - 1] = i + 1;
      }
    }
    const perChunk = brokeAt.map((n, k) => Math.max(0, n - (k ? brokeAt[k - 1] : 0)));
    return { by, after1, perChunk };
  };

  // ---- Turn end (spec §8). The HP a pokémon gains (+) or loses (−) between this turn's moves and the next command,
  // in the game's order: weather chip (WeatherEffectPhase), status chip (PostTurnStatusEffectPhase), berries
  // (BerryPhase), then TurnEndPhase heals. Chip can faint it, and a fainted mon heals nothing. `hp`: the HP it will
  // have by then, if not its current HP; `tookSuperEffective`: Enigma; `dealt`: damage it dealt this turn (Shell Bell).
  // Reads fields and item/ability attributes only.
  const abAttrs = (p, name) => (ability(p, name)
    ? [p.getAbility?.(), p.hasPassive?.() ? p.getPassiveAbility?.() : null].flatMap(a => a?.getAttrs?.(name) ?? []) : []);
  const frac = (max, n) => Math.max(1, Math.floor(max / n));
  const WEATHER_SPARED = { [WeatherType.SANDSTORM]: [PokemonType.GROUND, PokemonType.ROCK, PokemonType.STEEL], [WeatherType.HAIL]: [PokemonType.ICE] };
  const ORB_SPARED = { [StatusEffect.POISON]: [PokemonType.POISON, PokemonType.STEEL], [StatusEffect.TOXIC]: [PokemonType.POISON, PokemonType.STEEL], [StatusEffect.BURN]: [PokemonType.FIRE] };
  const endOfTurnHp = (p, { s = sceneNow(), tookSuperEffective = false, hp = p.hp, dealt = 0 } = {}) => {
    if (hp <= 0) return 0;
    const max = p.getMaxHp();
    const types = p.getTypes?.() ?? [];
    const guard = ability(p, "BlockNonDirectDamageAbAttr");
    const w = s?.arena?.weather?.weatherType ?? WeatherType.NONE;
    const weather = w && !(s.getField?.(true) ?? []).some(q => q && ability(q, "SuppressWeatherEffectAbAttr")) ? w : WeatherType.NONE;
    const inWeather = a => (a.weatherTypes ?? []).includes(weather);
    let chip = 0;
    if (WEATHER_SPARED[weather] && !guard && !types.some(t => WEATHER_SPARED[weather].includes(t))
      && !abAttrs(p, "BlockWeatherDamageAttr").some(a => !a.weatherTypes?.length || inWeather(a))
      && !p.getTag?.("UNDERGROUND") && !p.getTag?.("UNDERWATER")) chip += frac(max, 16);
    // Dry Skin / Solar Power in sun.
    if (!guard) for (const a of abAttrs(p, "PostWeatherLapseDamageAbAttr")) if (inWeather(a)) chip += frac(max, 16 / (a.damageFactor ?? 2));
    // Toxic / Flame Orb put their status on at turn end: counted as if already on, a turn early.
    const orb = p.status?.effect ? null : items(p).find(m => m.constructor.name === "TurnStatusEffectModifier" && !types.some(t => ORB_SPARED[m.effect]?.includes(t)));
    const effect = p.status?.effect || orb?.effect || 0;
    if ([StatusEffect.POISON, StatusEffect.TOXIC, StatusEffect.BURN].includes(effect) && !guard && !abAttrs(p, "BlockStatusDamageAbAttr").some(a => (a.effects ?? []).includes(effect))) {
      let d = effect === StatusEffect.POISON ? frac(max, 8) : effect === StatusEffect.TOXIC ? Math.max(1, Math.floor(max * ((p.status?.toxicTurnCount ?? 0) + 1) / 16)) : frac(max, 16);
      if (effect === StatusEffect.BURN) for (const a of abAttrs(p, "ReduceBurnDamageAbAttr")) d = Math.max(1, Math.floor(d * (a.multiplier ?? 0.5)));
      chip += d;
    }
    const left = hp - chip;
    if (left <= 0) return -hp;

    const quarter = Math.max(1, Math.floor(max / 4)) * (ability(p, "DoubleBerryEffectAbAttr") ? 2 : 1);
    const berry = t => items(p).some(m => m.constructor.name === "BerryModifier" && m.berryType === t);
    let heal = 0;
    if (berry(BerryType.SITRUS) && left / max < 0.5) heal += quarter;
    if (berry(BerryType.ENIGMA) && tookSuperEffective) heal += quarter;
    heal += frac(max, 16) * stack(p, "TurnHealModifier");
    if (s?.arena?.terrain?.terrainType === TerrainType.GRASSY && (p.isGrounded?.() ?? !types.includes(PokemonType.FLYING))) heal += frac(max, 16);
    if (p.isPlayer?.() === false) {
      const n = (s?.enemyModifiers ?? []).filter(m => m.constructor.name === "EnemyTurnHealModifier").reduce((t, m) => t + (m.getStackCount?.() ?? 1), 0);
      if (n) heal += Math.max(Math.floor(max / 50) * n, 1);
    }
    for (const a of abAttrs(p, "PostWeatherLapseHealAbAttr")) if (inWeather(a)) heal += frac(max, 16 / (a.healFactor ?? 1));
    if (abAttrs(p, "PostTurnStatusHealAbAttr").some(a => (a.effects ?? []).includes(effect))) heal += frac(max, 8);
    if (dealt > 0) heal += frac(dealt, 8) * stack(p, "HitHealModifier");
    return Math.min(max, left + heal) - hp;
  };

  // ---- Game path (spec §1, §2, §4, §5)
  const STAT_NAMES = ["HP", "Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];
  const RESULT_MULT = { [HitResult.EFFECTIVE]: 1, [HitResult.EXTREMELY_EFFECTIVE]: 4, [HitResult.SUPER_EFFECTIVE]: 2, [HitResult.NOT_VERY_EFFECTIVE]: 0.5,
    [HitResult.MOSTLY_INEFFECTIVE]: 0.25, [HitResult.ONE_HIT_KO]: 1, [HitResult.NO_EFFECT]: 0, [HitResult.IMMUNE]: 0 };
  // The random roll is 85..100 %, uniform over 16 values; the simulated call returns the 100 % one.
  const addRolls = (m, max, p) => {
    for (let r = 85; r <= 100; r++) {
      const d = max > 0 ? Math.max(1, Math.floor(max * r / 100)) : 0;
      m.set(d, (m.get(d) ?? 0) + p / 16);
    }
  };
  // Present draws its power from Phaser's RNG: pin the draw to get each power's damage.
  const withSeed = (seed, fn) => {
    const R = Phaser.Math.RND, own = Object.prototype.hasOwnProperty.call(R, "integerInRange"), orig = R.integerInRange;
    R.integerInRange = min => min + seed;
    try { return fn(); } finally { if (own) R.integerInRange = orig; else delete R.integerInRange; }
  };
  const PRESENT = [[0, 0.4], [150, 0.3], [190, 0.1]]; // 40 / 80 / 120 power; the other 20 % heals the target

  // Accuracy (§5): P(hit) = min(ceil(acc × multiplier), 100) %; later hits only roll for CHECK_ALL_HITS moves.
  const accuracy = (atk, def, move, ohko = false) => {
    if (move.moveTarget === MoveTarget.USER) return 1;
    if (ability(atk, "AlwaysHitAbAttr") || ability(def, "AlwaysHitAbAttr") || atk.getTag?.("IGNORE_ACCURACY")
      || def.getTag?.("ALWAYS_GET_HIT") || (def.getTag?.("TELEKINESIS") && !ohko)) return 1;
    const w = typeof move.calculateBattleAccuracy === "function" ? move.calculateBattleAccuracy(atk, def, true) : move.accuracy;
    if (w === -1 || w == null) return 1;
    const mult = atk.getAccuracyMultiplier?.(def, move) ?? 1;
    return Math.max(0, Math.min(100, Math.ceil(w * mult - 1e-9))) / 100;
  };
  // Primordial sun and rain stop a Water or Fire move before it runs, and Psychic Terrain a priority move into a
  // grounded target (MovePhase, both checked before the damage step, so the simulated call never sees them).
  const cancelledBy = (s, atk, def, move) => {
    try {
      if (s.arena?.isMoveWeatherCancelled?.(atk, move)) return "weather";
      if (s.arena?.isMoveTerrainCancelled?.(atk, [def.getBattlerIndex?.()], move)) return "terrain";
    } catch {}
    return null;
  };
  // Protect-type moves block it unless it ignores them (Feint, Unseen Fist on contact).
  const bypassesProtect = (atk, def, move) => {
    try { return typeof move.doesFlagEffectApply === "function" ? !!move.doesFlagEffectApply({ flag: MoveFlags.IGNORE_PROTECT, user: atk, target: def }) : hasFlag(move, MoveFlags.IGNORE_PROTECT); } catch { return false; }
  };

  const fromGame = (s, atk, def, pm, opts) => {
    const move = pm.getMove();
    if (attrs(move, "CounterDamageAttr").length) return null; // reacts to damage taken this turn: nothing yet
    const aiBlind = !!opts.aiView && !def.waveData?.abilityRevealed;
    const ignoreAbility = aiBlind || ability(atk, "MoveAbilityBypassAbAttr") || hasFlag(move, MoveFlags.IGNORE_ABILITIES);
    const ignoreAllyAbility = !!opts.aiView && !def.getAlly?.()?.waveData?.abilityRevealed;
    // A cached Tera Shell result from an earlier call would leak into this move; the sandbox restores it.
    if (def.turnData) def.turnData.moveEffectiveness = null;

    const type = TYPES[atk.getMoveType(move)] ?? "Normal";
    const cat = (atk.getMoveCategory?.(def, move) ?? move.category) === MoveCategory.PHYSICAL ? "physical" : "special";
    const priority = move.getPriority?.(atk, true) ?? move.priority ?? 0;
    const spread = SPREAD_TARGETS.includes(move.moveTarget);
    const others = (s.getField?.(true) ?? []).filter(p => p && p !== atk && p.hp > 0 && (p.isOnField?.() ?? true));
    const spreadApplied = spread && (move.moveTarget === MoveTarget.ALL_OTHERS || move.moveTarget === MoveTarget.ALL_NEAR_OTHERS ? others : others.filter(p => p.isPlayer?.() !== atk.isPlayer?.())).length > 1;

    // Hit counts (§2): MultiHitAttr type, Skill Link, Beat Up, plus Parental Bond / Multi-Lens strikes.
    const mh = attrs(move, "MultiHitAttr")[0];
    let mhType = mh ? mh.multiHitType ?? mh.intrinsicMultiHitType : null;
    if (mh && attrs(move, "ChangeMultiHitTypeAttr").length && atk.species?.speciesId === SpeciesId.GRENINJA && atk.formIndex === 2) mhType = MultiHitType.THREE;
    const skillLink = ability(atk, "MaxMultiHitAbAttr");
    const party = () => (atk.isPlayer?.() ? s.getPlayerParty() : s.getEnemyParty()) ?? [];
    let dist = mhType == null ? [{ n: 1, p: 1 }]
      : mhType === MultiHitType.TWO_TO_FIVE ? (skillLink ? [{ n: 5, p: 1 }] : [{ n: 2, p: 0.35 }, { n: 3, p: 0.35 }, { n: 4, p: 0.15 }, { n: 5, p: 0.15 }])
      : [{ n: mhType === MultiHitType.TWO ? 2 : mhType === MultiHitType.THREE ? 3 : mhType === MultiHitType.TEN ? 10 : party().reduce((t, n) => t + (n.id === atk.id ? 1 : n?.status && n.status.effect !== StatusEffect.NONE ? 0 : 1), 0), p: 1 }];
    const enhanced = (...args) => (typeof move.canBeMultiStrikeEnhanced === "function" ? !!move.canBeMultiStrikeEnhanced(...args) : !mh && !spread);
    const lenses = stack(atk, "PokemonMultiHitModifier");
    const extra = (ability(atk, "AddSecondStrikeAbAttr") && enhanced(atk, true, def) ? 1 : 0) + (lenses && enhanced(atk) ? lenses : 0);
    if (extra) dist = dist.map(x => ({ n: x.n + extra, p: x.p }));
    const hitsMax = Math.max(...dist.map(x => x.n));

    // One hit at the max roll. Multi-hit power steps and Parental Bond / Multi-Lens factors read the user's
    // turnData, which is fresh (hitCount 0) at the command phase, so set it the way MoveEffectPhase does. The 2–5
    // hit moves reuse the longest count's per-hit numbers: nothing that reads hitCount applies to them.
    const call = (k, isCritical) => {
      if (atk.turnData) { atk.turnData.hitCount = hitsMax; atk.turnData.hitsLeft = hitsMax - k; }
      return def.getAttackDamage({ source: atk, move, ignoreAbility, ignoreSourceAbility: false, ignoreAllyAbility, ignoreSourceAllyAbility: false, isCritical, simulated: true });
    };
    const first = call(0, false);
    const eGame = def.getMoveEffectiveness?.(atk, move, ignoreAbility, true);
    const e = first.cancelled ? 0 : typeof eGame === "number" ? eGame : RESULT_MULT[first.result] ?? 1;
    const base = { name: pm.getName(), type, cat, e, priority, spread, spreadApplied, ...traits(atk, move, true), self: 0, bypassProtect: bypassesProtect(atk, def, move) };
    const blocked = cancelledBy(s, atk, def, move);
    if (first.cancelled || first.result === HitResult.NO_EFFECT || first.result === HitResult.IMMUNE || blocked) {
      return { ...base, acc: 0, crit: 0, dist, perHit: [{ max: 0, min: 0 }], targetHp: def.hp, expected: 0, uncapped: 0, max: 0, pKo: 0, revive: 0, notes: [blocked ? `stopped by ${blocked}` : "no effect"], use: [{ d: 0, p: 1, n: 0 }], focus: 0, flinch: 0 };
    }

    const ohko = first.result === HitResult.ONE_HIT_KO;
    const fixed = !ohko && attrs(move, "FixedDamageAttr").length > 0;
    const psywave = attrs(move, "RandomLevelDamageAttr").length > 0;
    const present = attrs(move, "PresentPowerAttr").length > 0;
    const crit = opts.crit === true ? 1 : opts.crit === false || fixed || ohko ? 0 : (() => {
      if (!ignoreAbility && ability(def, "BlockCritAbAttr")) return 0;
      const side = def.isPlayer?.() ? ArenaTagSide.PLAYER : ArenaTagSide.ENEMY;
      if ((s.arena?.tags ?? []).some(t => t.constructor.name === "NoCritTag" && (!t.side || t.side === side))) return 0;
      if (attrs(move, "CritOnlyAttr").length || atk.getTag?.("ALWAYS_CRIT") || (ability(atk, "ConditionalCritAbAttr") && [StatusEffect.POISON, StatusEffect.TOXIC].includes(def.status?.effect))) return 1;
      return [1 / 24, 1 / 8, 1 / 2, 1][Math.max(0, Math.min(3, def.getCritStage?.(atk, move) ?? 0))];
    })();

    // Damage outcomes per hit index: Map damage → probability, plus the non-crit max roll for the worst case.
    const maxes = [];
    const perHit = [];
    for (let k = 0; k < hitsMax; k++) {
      const m = new Map();
      if (ohko) {
        const blocked = !ignoreAbility && ability(def, "BlockOneHitKOAbAttr");
        maxes.push(blocked ? 0 : def.hp);
        m.set(maxes[k], 1);
      } else if (psywave) {
        for (let r = 50; r <= 150; r++) { const d = Math.max(1, Math.floor(atk.level * r / 100)); m.set(d, (m.get(d) ?? 0) + 1 / 101); }
        maxes.push(Math.floor(atk.level * 1.5));
      } else if (fixed) {
        maxes.push(k ? call(k, false).damage : first.damage);
        m.set(maxes[k], 1);
      } else {
        let top = 0;
        for (const [seed, pv] of present ? PRESENT : [[null, 1]]) {
          const run = isCritical => (seed === null ? (k || isCritical ? call(k, isCritical) : first) : withSeed(seed, () => call(k, isCritical))).damage;
          if (crit < 1) { const d = run(false); top = Math.max(top, d); addRolls(m, d, pv * (1 - crit)); }
          if (crit > 0) { const d = run(true); if (crit === 1) top = Math.max(top, d); addRolls(m, d, pv * crit); }
        }
        if (present) m.set(0, (m.get(0) ?? 0) + 0.2);
        maxes.push(top);
      }
      perHit.push(m);
    }
    const acc = accuracy(atk, def, move, ohko);
    const checkAll = hasFlag(move, MoveFlags.CHECK_ALL_HITS) && !skillLink;
    // Before Disguise takes this turn's first hit: a later use meets no disguise.
    const use = useDist(perHit, dist, acc, checkAll);
    // Disguise / Ice Face take the first hit (the simulated call doesn't zero it).
    const disguise = !ignoreAbility && !!def.getAbility?.()?.getAttrs?.("FormBlockDamageAbAttr")?.some(a => a.formIndex === def.formIndex);
    if (disguise) { perHit[0] = new Map([[0, 1]]); maxes[0] = 0; }

    const f = targetFacts(s, def, ignoreAbility);
    const ends = resolve(f, perHit, dist, acc, checkAll, ohko);
    const expected = f.hp - ends.reduce((t, x) => t + x.p * Math.max(0, x.hp), 0);
    const pKo = f.revive ? 0 : ends.filter(x => x.hp <= 0).reduce((t, x) => t + x.p, 0);
    // Expected damage per use before the target's HP or a boss bar's boundary cuts it: what later turns deal.
    const uncapped = perHit.reduce((t, m, k) => t + (k === 0 || checkAll ? acc ** (k + 1) : acc)
      * dist.filter(x => x.n > k).reduce((u, x) => u + x.p, 0) * [...m].reduce((u, [d, p]) => u + d * p, 0), 0);
    const [worst] = resolve({ ...f, pFocus: 0, pEndure: 0 }, maxes.map(d => new Map([[d, 1]])), [{ n: hitsMax, p: 1 }], 1, false, ohko);

    // A target mid-Dig / Fly / Dive / Shadow Force is only hit if it moves first and comes out (spec §5), unless the
    // move reaches it there (Earthquake into Dig) or accuracy is bypassed. The planner knows the order.
    const semiTag = (def.summonData?.tags ?? []).find(t => isA(t, "SemiInvulnerableTag"));
    const semi = !!semiTag && move.moveTarget !== MoveTarget.USER && !(ability(atk, "AlwaysHitAbAttr") || ability(def, "AlwaysHitAbAttr")
      || atk.getTag?.("IGNORE_ACCURACY") || attrs(move, "HitsTagAttr").some(h => h.tagType === semiTag.tagType));
    const notes = [];

    // What the move costs its user per use: the target's contact-chip ability (Rough Skin / Iron Barbs, 1/8 max HP)
    // for each landed contact hit, and recoil (a share of the damage dealt, or of max HP). Magic Guard blocks both,
    // Rock Head the recoil. Hits are counted as if the target doesn't faint before the last one.
    const maxHp = atk.getMaxHp?.() ?? 0;
    const guard = ability(atk, "BlockNonDirectDamageAbAttr");
    let self = 0;
    const landed = checkAll
      ? Array.from({ length: hitsMax }, (_, k) => acc ** (k + 1) * dist.filter(x => x.n > k).reduce((t, x) => t + x.p, 0)).reduce((t, x) => t + x, 0)
      : acc * dist.reduce((t, x) => t + x.n * x.p, 0);
    const contact = typeof move.doesFlagEffectApply === "function" ? move.doesFlagEffectApply({ flag: MoveFlags.MAKES_CONTACT, user: atk, target: def }) : hasFlag(move, MoveFlags.MAKES_CONTACT);
    if (contact && !guard && maxHp && ability(def, "PostDefendContactDamageAbAttr")) {
      const [abName, ratio] = [def.getAbility?.(), def.hasPassive?.() ? def.getPassiveAbility?.() : null]
        .flatMap(a => (a?.getAttrs?.("PostDefendContactDamageAbAttr") ?? []).map(x => [a.name, x.damageRatio])).find(Boolean) ?? ["contact", 8];
      const chip = Math.max(1, Math.floor(maxHp / (ratio || 8))) * landed;
      self += chip;
      notes.push(`${abName}: ${base.name} ≈−${Math.round(chip / maxHp * 100)}%`);
    }
    const pctOf = x => Math.round(x / maxHp * 100);
    const recoil = attrs(move, "RecoilAttr")[0];
    if (recoil && maxHp && !(!recoil.unblockable && (guard || ability(atk, "BlockRecoilDamageAttr")))) {
      const hurt = recoil.useHp ? Math.max(1, Math.floor(maxHp * recoil.damageRatio)) * acc : expected * (recoil.damageRatio ?? 0.25);
      self += hurt;
      notes.push(`recoil ≈−${pctOf(hurt)}%`);
    }
    // Steel Beam / Mind Blown cost half max HP, hit or miss; High Jump Kick-type moves crash for half on a miss
    // (Outrage's miss effect only ends its lock). Magic Guard blocks all three.
    if (maxHp && !guard && attrs(move, "HalfSacrificialAttr").length) {
      self += Math.max(1, Math.floor(maxHp / 2));
      notes.push(`${base.name}: −50% HP`);
    }
    if (maxHp && !guard && acc < 1 && attrs(move, "MissEffectAttr").length && !attrs(move, "FrenzyAttr").length) {
      self += Math.max(1, Math.floor(maxHp / 2)) * (1 - acc);
      notes.push(`${base.name}: crash −50% on a miss`);
    }
    // Explosion / Self-Destruct faint the user regardless; Final Gambit only when it hits.
    const selfKo = attrs(move, "SacrificialAttrOnHit").length ? acc : attrs(move, "SacrificialAttr").length ? 1 : 0;
    if (selfKo) notes.push(`${base.name}: user faints`);
    // Outrage / Thrash / Petal Dance / Raging Fury: locked in for 2–3 turns, then confused.
    const lock = attrs(move, "FrenzyAttr").length > 0;
    if (lock) notes.push(`${base.name}: locks 2–3 turns → confused`);
    // Gigaton Hammer / Blood Moon can't be selected twice in a row.
    const noRepeat = (move.restrictions ?? []).some(r => r.i18nkey === "battle:moveDisabledConsecutive");
    if (noRepeat) notes.push(`${base.name}: not twice in a row`);
    // Guaranteed drops to the user's own stats (Overheat −2 SpA, Close Combat −1 Def/SpD): { stat index: stages }.
    const drops = {};
    for (const a of attrs(move, "StatStageChangeAttr")) {
      if (!a.selfTarget || !(a.stages < 0) || (move.chance > 0 && move.chance < 100)) continue;
      for (const st of a.stats ?? []) drops[st] = (drops[st] ?? 0) + a.stages;
    }
    const dropText = Object.entries(drops).map(([st, n]) => `−${-n} ${STAT_NAMES[st] ?? st}`);
    if (dropText.length) notes.push(`${base.name}: ${dropText.join(" ")}`);
    const drain = drainRatio(s, atk, def, move);
    if (drain > 0) notes.push(`drains ${Math.round(drain * 100)}%`);
    else if (drain < 0) notes.push(`Liquid Ooze: ${base.name} hurts ${Math.round(-drain * 100)}%`);

    if (dist.length > 1) notes.push(`${dist[0].n}–${hitsMax} hits`);
    else if (hitsMax > 1) notes.push(`${hitsMax} hits`);
    if (f.boss && f.idx > 0) notes.push(`boss ${f.idx + 1} bars`);
    if (f.sturdy && f.hp >= f.maxHp) notes.push("sturdy");
    if (f.pFocus) notes.push("focus band");
    if (f.revive) notes.push("reviver seed");
    if (disguise) notes.push("disguise");
    if (crit === 1) notes.push("crit");
    if (base.charge) notes.push("charges a turn");
    if (base.recharge) notes.push("recharges a turn");
    if (base.interrupt) notes.push("fails if hit");
    if (semi) notes.push("target semi-invulnerable");
    return {
      ...base, acc, crit, dist, semi, self, selfKo, lock, noRepeat, drops, drain,
      perHit: maxes.map(max => ({ max, min: Math.floor(max * 0.85) })), targetHp: f.hp,
      expected, uncapped, max: f.hp - Math.max(0, worst.hp), pKo, revive: f.revive, notes,
      use, focus: f.pFocus, flinch: flinchChance(atk, def, move, ignoreAbility),
    };
  };

  // ---- Approximation, for when game calls aren't allowed
  const ATE = { Refrigerate: "Ice", Pixilate: "Fairy", Aerilate: "Flying", Galvanize: "Electric" };
  // Rough max-roll damage of one move, or null when it isn't a damaging move with power.
  const approx = (a, d, pm) => {
    const mv = pm.getMove();
    if (mv.category === MoveCategory.STATUS || !(mv.power > 0) || pm.getMovePp() - pm.ppUsed <= 0) return null;
    const ab = abilitiesOf(a);
    let type = TYPES[mv.type];
    let power = mv.power;
    const ate = ab.map(x => ATE[x]).find(Boolean);
    if (ate && type === "Normal") { type = ate; power *= 1.2; }
    if (ab.includes("Technician") && power <= 60) power *= 1.5;
    const phys = mv.category === MoveCategory.PHYSICAL;
    let atk = stat(a, phys ? Stat.ATK : Stat.SPATK);
    if (phys && (ab.includes("Huge Power") || ab.includes("Pure Power"))) atk *= 2;
    if (phys && ab.includes("Hustle")) atk *= 1.5;
    const base = ((2 * a.level / 5 + 2) * power * atk / stat(d, phys ? Stat.DEF : Stat.SPDEF)) / 50 + 2;
    const e = effectiveness(type, d, mv);
    const stab = typesOf(a).includes(type) ? (ab.includes("Adaptability") ? 2 : 1.5) : 1;
    let dmg = base * stab * e;
    if (phys && ab.includes("Tough Claws")) dmg *= 1.3; // most physical moves make contact
    if (ab.includes("Sheer Force")) dmg *= 1.3;
    if (ab.includes("Strong Jaw") && /bite|crunch|fang|jaw/i.test(pm.getName())) dmg *= 1.5;
    return { name: pm.getName(), type, cat: phys ? "physical" : "special", e, dmg, spread: SPREAD_TARGETS.includes(mv.moveTarget), priority: mv.priority ?? 0 };
  };
  const fromApprox = (s, atk, def, pm) => {
    const x = approx(atk, def, pm);
    if (!x) return null;
    const mv = pm.getMove();
    const acc = mv.accuracy > 0 ? mv.accuracy / 100 : 1;
    const max = Math.floor(x.dmg);
    const end = applyHit(s, def, max);
    const { revive, pFocus } = targetFacts(s, def);
    const rolls = new Map();
    addRolls(rolls, max, 1);
    return {
      name: x.name, type: x.type, cat: x.cat, e: x.e, priority: x.priority, spread: x.spread, spreadApplied: false, ...traits(atk, mv, false), semi: false, self: 0,
      acc, crit: 0, dist: [{ n: 1, p: 1 }], perHit: [{ max, min: Math.floor(max * 0.85) }], targetHp: def.hp,
      expected: Math.min(def.hp - end.hp, max * 0.925) * acc, uncapped: max * 0.925 * acc, max: def.hp - end.hp, pKo: end.ko && !revive ? acc : 0, revive, notes: ["estimate"],
      use: useDist([rolls], [{ n: 1, p: 1 }], acc, false), focus: pFocus, flinch: flinchChance(atk, def, mv, false), drain: drainRatio(s, atk, def, mv),
    };
  };

  // ---- Public
  // One sandbox per outermost call (a caller's own sandbox or moveOutcomes covers the calls inside it); the
  // per-turn cache keeps repeated planner queries free.
  let depth = 0;
  const guarded = (s, fn) => {
    if (depth) return fn();
    depth++;
    try { return sandbox(s, fn); } finally { depth--; }
  };
  const moveOutcome = (s, atk, def, pm, opts = {}) => {
    if (!gameReady(s, atk, def)) return fromApprox(s, atk, def, pm);
    const turn = turnKey(s);
    if (cache.key !== turn) cache = { key: turn, map: new Map() };
    // A predicted Tera is set and taken back off around parts of a refresh (20-enemy-ai), and it changes types,
    // STAB and Tera Blast's type: both sides' flags belong in the key.
    const key = [atk.id, atk.hp, def.id, def.hp, atk.moveset.indexOf(pm), pm.getMove().id, !!opts.aiView, opts.crit,
      !!atk.isTerastallized, !!def.isTerastallized, activeHypothesisKey()].join("|");
    if (cache.map.has(key)) return cache.map.get(key);
    let out;
    try {
      out = guarded(s, () => fromGame(s, atk, def, pm, opts));
    } catch (e) {
      moveOutcome.lastError = e;
      return fromApprox(s, atk, def, pm);
    }
    cache.map.set(key, out);
    return out;
  };
  const moveOutcomes = (s, atk, def) => (gameReady(s, atk, def) ? guarded(s, () => usable(atk, def, s).map(pm => moveOutcome(s, atk, def, pm))) : usable(atk).map(pm => fromApprox(s, atk, def, pm))).filter(Boolean);
  // `atk`'s status moves that can be picked and would work into `def` this turn, game calls only (empty otherwise):
  // [{ pm, name, type, acc, e, priority, bypassProtect, bounce, blocked }]. `e`: 0 when the target is immune — a type
  // the move respects (Thunder Wave into Ground), a powder move into Grass, an ability (Good as Gold), a Substitute;
  // `bounce`: Magic Bounce sends it back. Accuracy and immunity only mean anything for a move aimed at `def`.
  const statusMoves = (s, atk, def) => {
    if (!gameReady(s, atk, def)) return [];
    return cached(s, `st|${atk.id}|${def.id}|${atk.hp}|${def.hp}`, () => guarded(s, () => usable(atk, def, s, true).map(pm => {
      const move = pm.getMove();
      try {
        if (def.turnData) def.turnData.moveEffectiveness = null;
        const e = def.getMoveEffectiveness?.(atk, move, false, true) ?? 1;
        return {
          pm, name: pm.getName(), type: TYPES[atk.getMoveType(move)] ?? "Normal", cat: "status", acc: accuracy(atk, def, move), e,
          priority: move.getPriority?.(atk, true) ?? move.priority ?? 0, bypassProtect: bypassesProtect(atk, def, move),
          bounce: ability(def, "ReflectStatusMoveAbAttr") && !ability(atk, "MoveAbilityBypassAbAttr"), blocked: cancelledBy(s, atk, def, move),
        };
      } catch { return null; }
    }).filter(Boolean)));
  };

  // Per-move damage records for the planner and learn cards: `dmg` is the expected damage (discounted for moves
  // that may not land) for our moves, the max roll for a foe's. The game already applies the ¾ spread factor when
  // a spread move has two targets; the planner applies it itself, so it is taken back out here.
  const hits = (a, d, foe = false, s = sceneNow()) => {
    if (gameReady(s, a, d)) {
      // No sandbox here: moveOutcome opens one only on a cache miss, and the panel asks every second.
      return usable(a, d, s).map(pm => {
        const o = moveOutcome(s, a, d, pm);
        return o && { ...o, dmg: (foe ? o.max : o.expected * reliability(pm.getMove())) / (o.spreadApplied ? 0.75 : 1) };
      }).filter(Boolean);
    }
    const out = [];
    for (const pm of a.moveset.filter(Boolean)) {
      const x = approx(a, d, pm);
      if (x) out.push({ ...x, dmg: x.dmg * (foe ? FOE_MARGIN : reliability(pm.getMove())) });
    }
    return out;
  };

  return { moveOutcome, moveOutcomes, statusMoves, endOfTurnHp, hits, stateOf, hitOn, koCurve };
})();

// ---- KO pacing, the parts that read no target
// The use a curve's target is more likely down than not by: what the panel calls "2 hits".
const koTurn = by => { const k = by.findIndex(x => x >= 0.5); return k < 0 ? 9 : k + 1; };
// The use it's expected to fall to, 9 at most: what scoring compares, so a sure 5HKO beats a 5HKO that is a coin
// flip on the 5th.
const koTurns = by => Math.min(9, 1 + by.slice(0, 8).reduce((t, x) => t + (1 - x), 0));

// All hits of the likeliest hit count at max roll, before any boss-bar clamp.
const rawMax = o => {
  const n = o.dist?.length ? o.dist.reduce((b, d) => (d.p > b.p ? d : b)).n : 1;
  return o.perHit?.length ? o.perHit.slice(0, n).reduce((t, h) => t + (h.max ?? 0), 0) : o.max;
};
// The damage over one use of an outcome record, as `koCurve` takes it: its own `use`, or — for a record without one
// (an approximation, a `hits` record) — the 16 rolls of the likeliest hit count's max damage, missing with the record's
// accuracy, and centred on the record's own mean a use (an approximation's `max` is often that mean already).
const useOf = o => {
  if (o?.use?.length) return o.use;
  const max = o ? rawMax(o) || o.max || o.dmg || 0 : 0;
  if (!(max > 0)) return [{ d: 0, p: 1, n: 0 }];
  const acc = Math.min(1, o.acc ?? 1);
  const n = o.dist?.length ? o.dist.reduce((b, d) => (d.p > b.p ? d : b)).n : 1;
  const pts = Array.from({ length: 16 }, (_, r) => ({ d: Math.max(1, Math.floor(max * (85 + r) / 100)), p: acc / 16 }));
  const mean = o.uncapped ?? o.expected;
  const k = mean > 0 ? mean / pts.reduce((t, x) => t + x.d * x.p, 0) : 1;
  return squeezeDist([...(acc < 1 ? [{ d: 0, p: 1 - acc, n: 0 }] : []), ...pts.map(x => ({ d: x.d * k, p: x.p, n }))], 12);
};
// P(an outcome record KOs its target at `hp` instead of the HP it was worked out for (`targetHp`), after an incoming
// hit): below the max roll the chance grows with how deep into the 85–100 % roll range the HP sits. A record not
// from game code (`live === false`) is all or nothing, like the rest of the approximation.
const koChanceAt = (o, hp) => {
  if (!o) return 0;
  if (hp <= 0) return 1;
  if (o.revive) return 0;
  if (hp >= (o.targetHp ?? Infinity)) return o.pKo ?? 0;
  if (!(o.max >= hp)) return 0;
  return o.live === false ? 1 : Math.max(o.pKo ?? 0, (o.acc ?? 1) * Math.min(1, (o.max - hp) / (0.15 * o.max) + 1 / 16));
};

// A wild boss gains stat stages each time a bar breaks (EnemyPokemon.handleBossSegmentCleared): +1 to a random stat
// not yet at +6, weighted by its stats; +2 for the last bar of a 3+ bar boss and for the last two of a 5+ bar one.
// Returns the damage factor on each bar from now (1 for the current one) from the expected rise of `st` (1 Atk,
// 2 Def, 3 SpA, 4 SpD): what hits into it lose for a defence (`koCurve`), what its own hits gain for an attack
// (`offence`, the planner's). A trainer's boss gets none.
const barBreakFactors = (s, foe, st, bars, offence = false) => {
  const out = [1];
  if (bars <= 1 || (foe.hasTrainer?.() ?? !!s?.currentBattle?.trainer)) return Array(Math.max(1, bars)).fill(1);
  const w = [Stat.ATK, Stat.DEF, Stat.SPATK, Stat.SPDEF, Stat.SPD].map(i => Math.max(0, foe.getStat?.(i, false) || 0));
  const share = w[st - 1] / (w.reduce((t, x) => t + x, 0) || 1);
  const s0 = foe.summonData?.statStages?.[st - 1] ?? 0;
  let up = 0;
  for (let i = 1; i < bars; i++) {
    const idx = bars - 1 - i;
    up += share * (1 + (foe.bossSegments >= 3 && idx === 0 ? 1 : 0) + (foe.bossSegments >= 5 && idx === 1 ? 1 : 0));
    const f = stage(s0) / stage(Math.min(6, s0 + up));
    out.push(offence ? 1 / f : f);
  }
  return out;
};
