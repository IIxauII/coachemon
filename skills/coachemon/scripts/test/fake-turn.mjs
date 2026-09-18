// A **turn** built from tables, for testing everything that reads one.
//
// `hud/25-turn.js` is the one door between the coach engine and the live battle: the planner, the fight plan and the
// catch card ask a turn questions and never see the scene. That makes them testable without a scene at all — a
// scenario says what the damage is, what the enemy does and what the turn-end costs, and the module under test is
// driven through exactly the interface it uses in the page. The scene adapter itself is tested separately, against a
// fake scene (damagetest, enemyaitest, enginetest).
//
// Everything is optional. What a scenario doesn't say, the fake answers plainly: no damage, no enemy move, no
// turn-end change, a mon whose only facts are its HP and its boss bars.
//
// ```js
// const turn = fakeTurn({
//   wave: 200, party, foes, trainer,
//   outcome: (atk, def, pm, opts) => …,   // one record, or null when the move does nothing
//   moves: foe => [{ name, type, p, … }], // what the enemy AI picks
//   switchTo: foe => other,               // what the trainer switches to
//   heal: (p, opts) => n,                 // signed turn-end HP change
// });
// battleModel(turn);
// ```
// A hypothesis is written onto the mons and taken back off by the real thing (`25-turn`'s `withPatches`, exposed to
// tests), so a fake turn's `assuming` means exactly what the panel's does. The bundle is eval'd by the test before
// any turn is built; without it a fake turn simply has no hypotheses.
const hud = () => globalThis.__hud ?? {};
const writePatches = (patches, fn) => (hud()["25-turn"]?.withPatches ?? ((_, f) => f()))(patches, fn);

const STAT_SPD = 5;
const BRACKET_NORMAL = 1; // MovePriorityInBracket.NORMAL — the bracket a move is in unless something moves it
const stage = n => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
const TYPE_STATUS_IMMUNE = { 1: ["Poison", "Steel"], 2: ["Poison", "Steel"], 3: ["Electric"], 5: ["Ice"], 6: ["Fire"] };

// What decides a hit on `p`. 10-damage reads this off the mon itself — its HP, its boss bars, Sturdy, a Focus Band,
// a Reviver Seed — and only the wave's enemy endure token comes from anywhere else, so the fake asks it for the real
// answer rather than inventing one. `facts` on a scenario's `mon()` overrides any of it.
const plainFacts = (p, over = {}, enemyModifiers = []) => {
  const D = hud()["10-damage"];
  if (D) return { ...D.targetFacts({ enemyModifiers, finalBoss: false }, p), ...over };
  const maxHp = p.getMaxHp?.() ?? p.hp;
  const segs = p.bossSegments > 0 && (p.isBoss?.() ?? true) ? p.bossSegments : 0;
  return {
    maxHp, hp: p.hp, boss: segs > 0, segs, segSize: segs ? maxHp / segs : 0,
    idx: segs ? p.bossSegmentIndex ?? segs - 1 : 0, minIdx: 0, finalBoss: false,
    sturdy: false, pFocus: 0, pEndure: 0, revive: 0, ...over,
  };
};

export const fakeTurn = ({
  live = true,
  wave = 1, turn: turnNo = 1, enemySwitchCounter = 0, double = false, trainer = null, decision = "command",
  party = [], foes = [], field = null, command = null,
  trickRoom = false, weather = 0, modifiers = [], enemyModifiers = [], hazards = () => 0, balls = () => 0,
  mode = {}, battleType = 0, mysteryEncounter = null, biomeId = null,
  // The answers. Each takes the same arguments as the op it stands behind.
  outcome = () => null,
  outcomes = null,
  statusMoves = () => [],
  heal = () => 0,
  moves = () => [],
  switchTo = () => null,
  replay = () => null,
  sendIn = () => null,
  benefit = () => 0,
  speedTie = () => null,
  mon = () => ({}),
  patches = [],
} = {}) => {
  const caches = new Map();
  const memo = (bucket, k, fn) => {
    let m = caches.get(bucket);
    if (!m) caches.set(bucket, (m = new Map()));
    if (!m.has(k)) m.set(k, fn());
    return m.get(k);
  };
  // A hypothesis is written onto the mons for the length of each answer, exactly as the real turn writes it, so a
  // table that reads stat stages or a status off the mon sees the state being assumed.
  const as = fn => (patches.length ? writePatches(patches, fn) : fn());
  const mark = o => o && { live, ...o };
  const facts = {
    wave, turn: turnNo, enemySwitchCounter, double, trainer, decision, battleType, mysteryEncounter, biomeId,
    party, foes, field: field ?? [...party, ...foes].filter(p => p?.isOnField?.()),
    trickRoom, weather, weatherSuppressed: false, modifiers, enemyModifiers, hazards, balls, mode, command,
  };
  const active = () => {
    const out = foes.filter(p => p.isOnField?.());
    return (out.length ? out : foes).slice(0, double ? 2 : 1);
  };
  // What 10-damage's approximation needs: which side a mon is on, and the wave's modifiers.
  const approxEnv = {
    isEnemy: p => foes.includes(p), enemyModifiers, modifiers, finalBoss: false,
    field: facts.field, party: p => (foes.includes(p) ? foes : party),
  };
  const t = {
    live, key: `fake:${wave}|${turnNo}|${enemySwitchCounter}`, facts,
    mon: p => memo("mon", p, () => {
      const over = mon(p) ?? {};
      const f = plainFacts(p, over.facts ?? {}, facts.enemyModifiers);
      // Where the real turn's answer is the same with or without the game (the stat-stage maths, the bar-break
      // factors, the type immunities), the fake gives that answer rather than a stand-in, so a scenario only has to
      // say what the game alone could tell it.
      const core = hud()["01-core"], dmg = hud()["10-damage"];
      return {
        p, facts: f, state: { hp: f.hp, bar: f.idx, revived: false, tok: 0, facts: f },
        speed: p.getEffectiveStat?.(STAT_SPD) ?? (p.getStat?.(STAT_SPD) ?? 0) * stage(p.summonData?.statStages?.[STAT_SPD - 1] ?? 0),
        tera: null,
        order: pm => {
          const mv = pm?.getMove?.() ?? pm ?? {};
          return { priority: mv.priority ?? 0, bracket: BRACKET_NORMAL, category: mv.category };
        },
        setup: mv => hud()["25-turn"]?.setupStages(p, mv) ?? null,
        canTake: effect => !(p.getTypes?.() ?? []).some(t => TYPE_STATUS_IMMUNE[effect]?.includes(core?.TYPES?.[t])),
        rockChip: 0.125 * (core ? core.effectiveness("Rock", p) : 1),
        bars: (st, n, offence) => (dmg ? dmg.barBreakFactors(p, st, n, offence, p.hasTrainer?.() ?? !!trainer) : Array(Math.max(1, n)).fill(1)),
        weather,
        hasAbility: () => false,
        isOfType: () => false,
        ...over,
      };
    }),
    // A live turn's answers are live answers, the way the scene adapter marks its own; a record may say otherwise.
    // A pair the scenario's table says nothing about falls back to the approximation, exactly as a question the game
    // can't answer does in the page — so a scenario only has to table the matchups it is actually about.
    // An approximate turn has no game to ask, so its tables don't apply: it answers from the type chart, like the
    // page does before the game waits on a decision.
    outcome: (atk, def, pm, opts = {}) => (live
      ? mark(as(() => outcome(atk, def, pm, opts)))
      : hud()["10-damage"]?.approxOutcome(approxEnv, atk, def, pm) ?? null),
    outcomes: (atk, def) => memo("outcomes", `${atk.id}|${def.id}`, () => {
      const dmg = hud()["10-damage"];
      const approx = () => (dmg ? dmg.approxOutcomes(approxEnv, atk, def) : []);
      if (!live) return approx();
      const tabled = as(() => (outcomes ? outcomes(atk, def) : atk.moveset.map(pm => outcome(atk, def, pm, {})))).filter(Boolean);
      return tabled.length ? tabled.map(mark) : approx();
    }),
    statusMoves: (atk, def) => as(() => statusMoves(atk, def)),
    turnEndHp: (p, opts = {}) => as(() => heal(p, opts) ?? 0),
    // The enemy's whole turn. An approximate turn knows none of the AI's own reasoning: it predicts no switch (the
    // enemy hasn't decided) and ranks the foe's moves by rough damage, exactly as the page does.
    enemyAction: foe => memo("action", foe, () => {
      const to = live ? switchTo(foe) : null;
      if (to) return { moves: [], switchTo: to, tera: false, skip: false };
      const rough = () => hud()["20-enemy-ai"]?.approxDistribution(foe, (e, o) => t.outcomes(e, o)) ?? [];
      return { moves: (live ? as(() => moves(foe)) : rough()) ?? [], switchTo: null, tera: false, skip: false };
    }),
    switches: () => new Map(live ? active().flatMap(f => { const to = switchTo(f); return to ? [[f, { to, ratio: 1 }]] : []; }) : []),
    activeFoes: active,
    replayAI: (foe, target, opts = {}) => as(() => replay(foe, target, opts)),
    sendInScore: (f, me) => sendIn(f, me),
    benefit: (atk, def, mv) => benefit(atk, def, mv) ?? 0,
    // Which of two mons the turn's shuffle put first at a speed tie: null unless a scenario says.
    speedTie: (a, b) => speedTie(a, b),
    memo: (k, fn) => memo("caller", k, fn),
    assuming: more => fakeTurn({
      live, wave, turn: turnNo, enemySwitchCounter, double, trainer, decision, party, foes, field, command,
      trickRoom, weather, modifiers, enemyModifiers, hazards, balls, mode, battleType, mysteryEncounter, biomeId,
      outcome, outcomes, statusMoves, heal, moves, switchTo, replay, sendIn, benefit, speedTie, mon,
      patches: [...patches, ...more],
    }),
  };
  return t;
};
