// Runs in the PokéRogue page world. Draws a small always-on coach panel over the
// game: in battle, what each live foe is weak to / resists, which party member
// to send against it and with which move; on a learn-move prompt, whether to
// learn the new move and which one to forget; on the rewards screen, what to buy
// for the party's needs and which free reward to take. Read-only: presses nothing, writes nothing to
// the game. Idempotent — injecting again replaces the running panel.
// __MODE__ is replaced by read.sh with "hud" (install) or "hud-off" (remove).
(() => {
  const MODE = "__MODE__";
  window.__coachHud?.stop();
  if (MODE === "hud-off") {
    document.documentElement.dataset.mcpOut = JSON.stringify({ hud: "off" });
    return;
  }

  const TYPES = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
  // attacker: [super effective, not very effective, no effect]
  const CHART = {
    Normal: [[], ["Rock","Steel"], ["Ghost"]],
    Fighting: [["Normal","Rock","Steel","Ice","Dark"], ["Flying","Poison","Bug","Psychic","Fairy"], ["Ghost"]],
    Flying: [["Fighting","Bug","Grass"], ["Rock","Steel","Electric"], []],
    Poison: [["Grass","Fairy"], ["Poison","Ground","Rock","Ghost"], ["Steel"]],
    Ground: [["Poison","Rock","Steel","Fire","Electric"], ["Bug","Grass"], ["Flying"]],
    Rock: [["Flying","Bug","Fire","Ice"], ["Fighting","Ground","Steel"], []],
    Bug: [["Grass","Psychic","Dark"], ["Fighting","Flying","Poison","Ghost","Steel","Fire","Fairy"], []],
    Ghost: [["Ghost","Psychic"], ["Dark"], ["Normal"]],
    Steel: [["Rock","Ice","Fairy"], ["Steel","Fire","Water","Electric"], []],
    Fire: [["Bug","Steel","Grass","Ice"], ["Rock","Fire","Water","Dragon"], []],
    Water: [["Ground","Rock","Fire"], ["Water","Grass","Dragon"], []],
    Grass: [["Ground","Rock","Water"], ["Flying","Poison","Bug","Steel","Fire","Grass","Dragon"], []],
    Electric: [["Flying","Water"], ["Grass","Electric","Dragon"], ["Ground"]],
    Psychic: [["Fighting","Poison"], ["Steel","Psychic"], ["Dark"]],
    Ice: [["Flying","Ground","Grass","Dragon"], ["Steel","Fire","Water","Ice"], []],
    Dragon: [["Dragon"], ["Steel"], ["Fairy"]],
    Dark: [["Ghost","Psychic"], ["Fighting","Dark","Fairy"], []],
    Fairy: [["Fighting","Dragon","Dark"], ["Poison","Steel","Fire"], []],
  };
  const ABILITY_IMMUNE = {
    "Levitate": "Ground", "Earth Eater": "Ground",
    "Flash Fire": "Fire", "Well-Baked Body": "Fire",
    "Water Absorb": "Water", "Storm Drain": "Water", "Dry Skin": "Water",
    "Volt Absorb": "Electric", "Lightning Rod": "Electric", "Motor Drive": "Electric",
    "Sap Sipper": "Grass",
  };

  const typesOf = p => p.getTypes().map(t => TYPES[t]).filter(Boolean);
  const abilitiesOf = p => [p.getAbility()?.name, p.hasPassive?.() ? p.getPassiveAbility()?.name : null].filter(Boolean);
  const vs = (atk, def) => {
    const [se, nve, none] = CHART[atk] ?? [[], [], []];
    return none.includes(def) ? 0 : se.includes(def) ? 2 : nve.includes(def) ? 0.5 : 1;
  };
  const effectiveness = (type, p) => {
    const ab = abilitiesOf(p);
    if (ab.some(a => ABILITY_IMMUNE[a] === type)) return 0;
    let m = typesOf(p).reduce((x, d) => x * vs(type, d), 1);
    if (ab.includes("Wonder Guard") && m < 2) return 0;
    if (ab.includes("Thick Fat") && (type === "Fire" || type === "Ice")) m /= 2;
    if (ab.includes("Heatproof") && type === "Fire") m /= 2;
    if (m >= 2 && ab.some(a => a === "Solid Rock" || a === "Filter" || a === "Prism Armor")) m *= 0.75;
    return m;
  };
  const stage = s => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
  // i: 1 atk, 2 def, 3 spa, 4 spd, 5 spe. statStages has no HP slot.
  const stat = (p, i) => p.getStat(i) * stage(p.summonData?.statStages?.[i - 1] ?? 0);

  const SPREAD_TARGETS = [2, 4, 6, 8]; // MoveTarget ALL_OTHERS, ALL_NEAR_OTHERS, ALL_NEAR_ENEMIES, ALL_ENEMIES
  const hasAttr = (mv, name) => (mv.attrs || []).some(a => a.constructor.name === name);
  // Per-turn damage discount for moves that often don't land when chosen: Focus Punch fails if the user is hit
  // first, charging and recharging moves spend a second turn, negative priority moves go last.
  const reliability = mv => {
    if (hasAttr(mv, "PreUseInterruptAttr")) return 0.4;
    if (mv.isChargingMove?.() || hasAttr(mv, "RechargeAttr")) return 0.5;
    return mv.priority < 0 ? 0.8 : 1;
  };

  const ATE = { Refrigerate: "Ice", Pixilate: "Fairy", Aerilate: "Flying", Galvanize: "Electric" };
  // Enemy damage is estimated pessimistically: held items, crits and rolls aren't modelled, and a recommendation
  // that underestimates an enemy hit gets a pokémon killed.
  const FOE_MARGIN = 1.15;

  // Rough damage of each usable damaging move of attacker into defender. `foe` marks an enemy attacking us:
  // it gets the safety margin and no discount for moves that may not land, since it might still use them.
  const hits = (a, d, foe = false) => {
    const out = [];
    const ab = abilitiesOf(a);
    for (const m of a.moveset.filter(Boolean)) {
      const mv = m.getMove();
      if (mv.category === 2 || !(mv.power > 0) || m.getMovePp() - m.ppUsed <= 0) continue;
      let type = TYPES[mv.type];
      let power = mv.power;
      const ate = ab.map(x => ATE[x]).find(Boolean);
      if (ate && type === "Normal") { type = ate; power *= 1.2; }
      if (ab.includes("Technician") && power <= 60) power *= 1.5;
      const phys = mv.category === 0;
      let atk = stat(a, phys ? 1 : 3);
      if (phys && (ab.includes("Huge Power") || ab.includes("Pure Power"))) atk *= 2;
      if (phys && ab.includes("Hustle")) atk *= 1.5;
      const base = ((2 * a.level / 5 + 2) * power * atk / stat(d, phys ? 2 : 4)) / 50 + 2;
      const e = effectiveness(type, d);
      const stab = typesOf(a).includes(type) ? (ab.includes("Adaptability") ? 2 : 1.5) : 1;
      let dmg = base * stab * e;
      if (phys && ab.includes("Tough Claws")) dmg *= 1.3; // most physical moves make contact
      if (ab.includes("Sheer Force")) dmg *= 1.3;
      if (ab.includes("Strong Jaw") && /bite|crunch|fang|jaw/i.test(m.getName())) dmg *= 1.5;
      dmg *= foe ? FOE_MARGIN : reliability(mv);
      out.push({ name: m.getName(), type, cat: phys ? "physical" : "special", e, dmg, spread: SPREAD_TARGETS.includes(mv.moveTarget), priority: mv.priority ?? 0 });
    }
    return out;
  };
  const bestMove = (a, d, foe = false) => hits(a, d, foe).reduce((best, x) => (!best || x.dmg > best.dmg ? x : best), null);
  const turnsToKo = (hp, dmg) => (dmg > 0 ? Math.min(9, Math.ceil(hp / dmg)) : 9);

  // Positive score = we KO it in fewer turns than it KOs us.
  const matchup = (me, foe) => {
    const mine = bestMove(me, foe);
    const theirs = bestMove(foe, me, true);
    const myTurns = mine?.dmg > 0 ? Math.min(9, Math.ceil(foe.hp / mine.dmg)) : 9;
    const theirTurns = theirs?.dmg > 0 ? Math.min(9, Math.ceil(me.hp / theirs.dmg)) : 9;
    const faster = stat(me, 5) >= stat(foe, 5);
    return { me, mine, myTurns, score: theirTurns - myTurns + (faster ? 0.5 : -0.5) };
  };

  // Trainer switch prediction with the game's own code. EnemyCommandPhase (read from the live build): a trainer's
  // active mon that isn't trapped or locked into a move switches when
  //   bestBenchScore × (1 − 0.1^(1/enemySwitchCounter)) ≥ avg own matchup score × (boss ? 2 : 3)
  // and sends trainer.getNextSummonIndex(). Switches resolve before moves, so our attack lands on the switch-in.
  // getMatchupScore isn't fully side-effect free — non-simulated type checks can queue a strong-winds message or
  // an ability display — so every call runs with the phase queue muted (see `muted`), and only once per turn.
  const QUEUE_METHODS = ["pushPhase", "unshiftPhase", "pushNew", "unshiftNew", "queueMessage", "queueAbilityDisplay", "hideAbilityBar"];
  const muted = (s, fn) => {
    const pm = s.phaseManager;
    const saved = QUEUE_METHODS.filter(k => typeof pm[k] === "function").map(k => [k, Object.prototype.hasOwnProperty.call(pm, k), pm[k]]);
    for (const [k] of saved) pm[k] = () => {};
    try {
      return fn();
    } finally {
      // Synchronous: nothing else runs while muted, and the queue is restored exactly as it was.
      for (const [k, own, f] of saved) { if (own) pm[k] = f; else delete pm[k]; }
    }
  };
  let switchCache = { key: null, value: new Map() };
  const predictSwitches = (s, b, active) => {
    const tr = b.trainer;
    if (!tr?.getPartyMemberMatchupScores) return new Map();
    const key = [b.waveIndex, b.turn, b.enemySwitchCounter, ...s.getField().map(p => p && `${p.id}:${p.hp}`)].join("|");
    if (switchCache.key === key) return switchCache.value;
    const out = new Map();
    const enemies = s.getEnemyParty();
    muted(s, () => {
      for (const e of active) {
        try {
          if (e.getMoveQueue().length || e.isTrapped()) continue;
          const scores = tr.getPartyMemberMatchupScores(e.trainerSlot, true);
          if (!scores.length) continue;
          const own = e.getOpponents().map(o => e.getMatchupScore(o));
          const avg = own.reduce((t, x) => t + x, 0) / own.length;
          const best = tr.getSortedPartyMemberMatchupScores(scores)[0][1];
          const counter = b.enemySwitchCounter;
          const w = 1 - (counter ? 0.1 ** (1 / counter) : 0);
          if (best * w < avg * (tr.config.isBoss ? 2 : 3)) continue;
          const to = enemies[tr.getNextSummonIndex(e.trainerSlot, scores)];
          if (to && ![...out.values()].some(v => v.to === to)) out.set(e, { to, ratio: 1 });
        } catch {}
      }
    });
    switchCache = { key, value: out };
    return out;
  };

  // Who should be on the field now and what each slot does. For doubles every pair of healthy party members is
  // tried with every option per slot — a single-target move into either foe, or a spread move into both at the
  // game's ¾ spread damage — scored by turns to KO against how fast the worse foe KOs that member, plus speed,
  // with a bonus for pairs that cover both foes.
  // `active`: the foes our moves land on this turn (a predicted switch-in replaces the mon leaving).
  // `attackers`: the foes that actually attack this turn — a mon switching out doesn't, nor does its switch-in.
  const fieldPlan = (party, active, double, attackers = active) => {
    const slots = double && active.length === 2 ? 2 : 1;
    const current = party.filter(p => p.isOnField?.());
    // Hardest hit a foe lands on `me` this turn (spread moves at ¾ in doubles).
    const foeTop = (f, me) => Math.max(0, ...hits(f, me, true).map(x => x.dmg * (slots === 2 && x.spread ? 0.75 : 1)));
    // A voluntary switch-in is hit before it acts: the worst foe's hit, plus half the other's in doubles.
    const incoming = me => {
      const tops = attackers.map(f => foeTop(f, me)).sort((a, b) => b - a);
      return (tops[0] ?? 0) + (tops[1] ?? 0) * 0.5;
    };

    // `entering`: switched in by choice this turn — it arrives with the incoming hit taken and a turn lost, and
    // a switch-in that doesn't survive the hit is never an option.
    const options = (me, entering) => {
      const hp = entering ? me.hp - incoming(me) : me.hp;
      if (hp <= 0) return [{ me, move: null, target: null, turns: 9, score: -99 }];
      const lost = entering ? 1 : 0;
      const danger = Math.min(...active.map(f => turnsToKo(hp, foeTop(f, me))));
      const out = [];
      active.forEach((f, fi) => {
        // In doubles a spread move always hits both, so it only counts as the "both" option below.
        const m = hits(me, f).filter(x => slots === 1 || !x.spread).reduce((best, x) => (!best || x.dmg > best.dmg ? x : best), null);
        if (!(m?.dmg > 0)) return;
        const turns = turnsToKo(f.hp, m.dmg) + lost;
        out.push({ me, move: m, target: fi, turns, score: danger - turns + (stat(me, 5) >= stat(f, 5) ? 0.5 : -0.5) });
      });
      if (slots === 2) {
        for (const m of hits(me, active[0]).filter(x => x.spread)) {
          const other = hits(me, active[1]).find(x => x.name === m.name);
          const turns = Math.max(turnsToKo(active[0].hp, m.dmg * 0.75), turnsToKo(active[1].hp, (other?.dmg ?? 0) * 0.75)) + lost;
          const faster = active.every(f => stat(me, 5) >= stat(f, 5));
          if (turns < 9) out.push({ me, move: m, target: "both", turns, score: danger - turns + 1 + (faster ? 0.5 : -0.5) });
        }
      }
      if (!out.length) out.push({ me, move: null, target: null, turns: 9, score: danger - 9 });
      return out;
    };
    const cache = new Map();
    const opt = (me, entering) => {
      const k = `${party.indexOf(me)}|${entering}`;
      if (!cache.has(k)) cache.set(k, options(me, entering));
      return cache.get(k);
    };

    // Every candidate field. Newcomers fill empty slots (a fainted member's) for free; any beyond that are
    // voluntary switches, which take the incoming hit. `extra` counts those.
    const free = Math.max(0, slots - current.length);
    const plans = [];
    const add = (picks, extra) => {
      const covers = picks.length < 2 || picks[0].target === "both" || picks[1].target === "both"
        || (picks[0].target !== null && picks[1].target !== null && picks[0].target !== picks[1].target);
      plans.push({ picks, extra, score: picks.reduce((t, p) => t + p.score, 0) + (picks.length === 2 ? (covers ? 1 : -1) : 0) });
    };
    const fields = [];
    if (slots === 1 || party.length < 2) party.forEach(p => fields.push([p]));
    else for (let i = 0; i < party.length; i++) for (let j = i + 1; j < party.length; j++) fields.push([party[i], party[j]]);
    for (const members of fields) {
      const newcomers = members.filter(p => !current.includes(p));
      const paying = Math.max(0, newcomers.length - free);
      // With one free slot and two newcomers, either of them could be the one that switches in under fire.
      const assignments = paying === 0 ? [[]] : paying === newcomers.length ? [newcomers] : newcomers.map(p => [p]);
      for (const payers of assignments) {
        const [a, b] = members.map(p => opt(p, payers.includes(p)));
        if (!b) a.forEach(x => add([x], payers.length));
        else for (const x of a) for (const y of b) add([x, y], payers.length);
      }
    }
    if (!plans.length) return null;

    // Stay with the current field unless it is actually failing: a member with nothing that damages, a member
    // that loses its trade, or a switch that is clearly better. Switching costs a turn and a free hit, so a
    // merely better field is shown as an optional hint instead.
    const top = list => list.reduce((b, p) => (!b || p.score > b.score ? p : b), null);
    const bestAny = top(plans);
    const bestStay = top(plans.filter(p => p.extra === 0));
    const failing = plan => plan.picks.some(p => !p.move || p.score < 0);
    const stay = bestStay && !failing(bestStay) && bestAny.score - bestStay.score < 3;
    const best = stay ? bestStay : bestAny;
    const alt = stay && bestAny !== bestStay && bestAny.extra > 0 ? bestAny : null;

    // How badly the worst foe hits a slot's pokémon this turn. "ko": its best move takes the current HP and it
    // acts first (faster, or a priority move); "risk": it can KO but we act first, or a super-effective hit
    // takes half the current HP or more.
    const threat = me => {
      let worst = null;
      for (const f of attackers) {
        for (const x of hits(f, me, true)) {
          const dmg = x.dmg * (slots === 2 && x.spread ? 0.75 : 1);
          if (!worst || dmg > worst.dmg) worst = { ...x, dmg, from: f };
        }
      }
      if (!worst || !(worst.dmg > 0)) return null;
      const pct = Math.round(worst.dmg / me.hp * 100);
      const first = worst.priority > 0 || stat(worst.from, 5) > stat(me, 5);
      const level = pct >= 100 && first ? "ko" : pct >= 100 || (worst.e >= 2 && pct >= 50) ? "risk" : null;
      return level && { level, move: worst.name, type: worst.type, e: worst.e, pct: Math.min(pct, 999), from: worst.from.name };
    };

    const swaps = plan => {
      const chosen = plan.picks.map(p => p.me);
      const outs = current.filter(p => !chosen.includes(p));
      return chosen.filter(p => !current.includes(p))
        .map((p, i) => ({ out: outs[i] ? { icon: iconOf(outs[i]), name: outs[i].name, threat: threat(outs[i]) } : null, in: { icon: iconOf(p), name: p.name } }));
    };
    const ins = swaps(best);


    return {
      picks: best.picks, // live objects for the per-foe rows; not part of the JSON-safe view
      view: {
      optional: alt ? swaps(alt) : [],
      // Staying is failing but every switch-in would be KO'd coming in: say so rather than stay silent.
      noSafeSwitch: best.extra === 0 && failing(best) && party.length > current.length,
      slots: best.picks.map(p => ({
        icon: iconOf(p.me), name: p.me.name, out: !!p.me.isOnField?.(),
        move: p.move?.name ?? null, type: p.move?.type ?? null, cat: p.move?.cat ?? null,
        target: p.target === "both" ? "both" : p.target === null ? null : { icon: iconOf(active[p.target]), name: active[p.target].name },
        ko: p.turns <= 3 ? p.turns : 0,
        threat: threat(p.me),
      })),
      switches: ins,
      },
    };
  };

  const TRAPS = new Set([...Object.keys(ABILITY_IMMUNE), "Wonder Guard", "Thick Fat", "Heatproof", "Solid Rock", "Filter", "Prism Armor", "Sturdy", "Intimidate", "Guts", "Fluffy", "Simple"]);
  const STATUS_FRAMES = [null, "poison", "toxic", "paralysis", "sleep", "freeze", "burn"];
  const iconOf = p => { try { return [p.getIconAtlasKey(), String(p.getIconId())]; } catch { return null; } };

  // Plain data for one refresh. Its JSON is the change signature, so the DOM is
  // only rebuilt when something the panel shows has actually changed.
  const model = (s, b, party, foes) => {
    const onField = foes.filter(f => f.isOnField?.());
    const active = (onField.length ? onField : foes).slice(0, b.double ? 2 : 1);
    const predicted = predictSwitches(s, b, active);
    const switching = f => (predicted.get(f)?.ratio ?? 0) >= 1;
    // Plan against the field our moves will actually hit; if a switch is predicted, also keep the plan for
    // the case it stays, shown dim.
    const facing = active.map(f => (switching(f) ? predicted.get(f).to : f));
    const plan = fieldPlan(party, facing, !!b.double, active.filter(f => !switching(f)));
    const ifStay = active.some(switching) ? fieldPlan(party, active, !!b.double) : null;

    // Foes on the field take their pokémon and move from the field plan, so the rows never contradict it.
    // A trainer's waiting mons (or a foe no slot is on) get the best 1-v-1 pick, preferring members not
    // already busy, and are marked `later`.
    const used = new Set(plan?.picks.map(p => p.me) ?? []);
    const pickFor = foe => {
      // A foe predicted to switch out shares its switch-in's pick: that's who the move lands on.
      const target = switching(foe) ? predicted.get(foe).to : foe;
      const ai = facing.indexOf(target);
      const slot = ai >= 0 && plan ? plan.picks.find(p => p.target === ai) ?? plan.picks.find(p => p.target === "both") : null;
      if (slot?.move) {
        const dmg = slot.target === "both" ? (hits(slot.me, target).find(x => x.name === slot.move.name)?.dmg ?? 0) * 0.75 : slot.move.dmg;
        return { me: slot.me, mine: { ...slot.move, dmg }, myTurns: turnsToKo(target.hp, dmg), score: slot.score, later: false, vs: target };
      }
      const ranked = party.map(me => matchup(me, foe))
        .map(m => ({ ...m, rank: m.score - (used.has(m.me) ? 1 : 0) }))
        .sort((x, y) => y.rank - x.rank);
      const pick = ranked[0];
      if (pick) used.add(pick.me);
      return pick ? { ...pick, later: ai < 0 } : null;
    };
    const picks = new Map();
    for (const f of [...facing, ...active, ...foes.filter(f => !active.includes(f) && !facing.includes(f))]) if (!picks.has(f)) picks.set(f, pickFor(f));

    const teamWeak = {};
    const rows = foes.map((foe, i) => {
      // Plain 2× resists are too many to scan mid-battle; only list the hard walls.
      const weak = [], avoid = [];
      for (const t of TYPES) {
        const e = effectiveness(t, foe);
        if (e >= 2) { weak.push([t, e >= 4 ? "×4" : ""]); teamWeak[t] = (teamWeak[t] ?? 0) + 1; }
        else if (e === 0) avoid.push([t, "×0"]);
        else if (e <= 0.25) avoid.push([t, "×¼"]);
      }
      const p = picks.get(foe);
      return {
        icon: iconOf(foe), name: foe.name, lv: foe.level, types: typesOf(foe),
        abilities: abilitiesOf(foe), boss: !!foe.isBoss?.(), status: foe.status?.effect ?? 0,
        hp: Math.round(foe.hp / foe.getMaxHp() * 100),
        weak, avoid,
        switchTo: predicted.has(foe) ? { icon: iconOf(predicted.get(foe).to), name: predicted.get(foe).to.name, sure: switching(foe) } : null,
        pick: p?.mine ? {
          icon: iconOf(p.me), name: p.me.name, move: p.mine.name, type: p.mine.type, cat: p.mine.cat,
          pct: Math.min(100, Math.round(p.mine.dmg / (p.vs ?? foe).getMaxHp() * 100)),
          vs: p.vs && p.vs !== foe ? { icon: iconOf(p.vs), name: p.vs.name } : null,
          ko: p.myTurns <= 3 ? p.myTurns : 0, risky: p.score < 0, later: p.later,
        } : null,
      };
    });

    const sendIns = [...(plan?.picks.map(p => p.me) ?? []), ...foes.map(f => picks.get(f)?.me).filter(Boolean)];
    return {
      kind: "battle",
      field: plan?.view ?? null,
      enemySwitches: active.filter(f => predicted.has(f)).map(f => ({
        from: { icon: iconOf(f), name: f.name }, to: { icon: iconOf(predicted.get(f).to), name: predicted.get(f).to.name }, sure: switching(f),
      })),
      ifStay: ifStay ? ifStay.view.slots : null,
      title: `W${b.waveIndex}${b.trainer ? ` · ${b.trainer.getName()}` : ""}`,
      order: [...new Set(sendIns)].map(me => ({ icon: iconOf(me), name: me.name })),
      team: Object.entries(teamWeak).sort((x, y) => y[1] - x[1]).slice(0, 4),
      rows,
    };
  };

  // Learn-move: the SUMMARY screen (UiMode 9, summaryUiMode 1) holds the new move; before it opens, the
  // "forget a move?" prompt only has LearnMovePhase's moveId, so the move is built from a PokemonMove.
  const learnState = s => {
    const h = s.ui.getHandler();
    const double = !!s.currentBattle?.double;
    if (s.ui.getMode() === 9 && h?.summaryUiMode === 1 && h.newMove) return { pk: h.pokemon, mv: h.newMove, double };
    const phase = s.phaseManager?.getCurrentPhase?.();
    if (phase?.phaseName !== "LearnMovePhase") return null;
    const pk = s.getPlayerParty()[phase.partyMemberIndex];
    const pm = pk?.moveset.find(Boolean);
    return pk && pm ? { pk, mv: new pm.constructor(phase.moveId).getMove(), double } : null;
  };

  // Effective power of a move on this pokémon: power × accuracy × STAB × how well its attack stat suits the
  // category, then adjusted for what it costs or adds, each adjustment named in `notes` so the card can show why.
  // null value for status moves, which can't be scored.
  const moveScore = (pk, mv, others, double) => {
    if (mv.category === 2 || !(mv.power > 0)) return { value: null, notes: [] };
    const type = TYPES[mv.type];
    const atk = pk.getStat(1), spa = pk.getStat(3);
    const fit = (mv.category === 0 ? atk : spa) / Math.max(atk, spa);
    const acc = mv.accuracy > 0 ? mv.accuracy / 100 : 1;
    let value = mv.power * acc * (typesOf(pk).includes(type) ? 1.5 : 1) * fit;
    const notes = [];
    const sameType = others.filter(o => o.category !== 2 && o.power > 0 && TYPES[o.type] === type).length;
    if (sameType === 0) { value *= 1.2; notes.push("coverage"); }
    else if (sameType >= 2) { value *= 0.8; notes.push(`${sameType + 1}× ${type}`); }
    if (hasAttr(mv, "RecoilAttr")) { value *= 0.67; notes.push("recoil"); }
    if (hasAttr(mv, "PreUseInterruptAttr")) { value *= 0.4; notes.push("fails if hit"); }
    else if (mv.isChargingMove?.()) { value *= 0.5; notes.push("charges"); }
    else if (hasAttr(mv, "RechargeAttr")) { value *= 0.5; notes.push("recharge"); }
    else if (mv.priority < 0) { value *= 0.8; notes.push("moves last"); }
    if (double && SPREAD_TARGETS.includes(mv.moveTarget)) { value *= 1.15; notes.push("spread"); }
    if (fit < 0.9) notes.push(mv.category === 0 ? "weak Atk" : "weak SpA");
    return { value: Math.round(value), notes };
  };

  const learnModel = ({ pk, mv, double }) => {
    const current = pk.moveset.filter(Boolean).map(m => m.getMove());
    const info = (x, score) => ({ name: x.name, type: TYPES[x.type] ?? "Normal", cat: ["physical", "special", "status"][x.category], ...score });
    // Each slot is judged against the other three, so coverage counts for both the old move and its replacement.
    const moves = current.map((x, i) => {
      const rest = current.filter((_, j) => j !== i);
      return { ...info(x, moveScore(pk, x, rest, double)), replacement: moveScore(pk, mv, rest, double).value };
    });
    const incoming = info(mv, moveScore(pk, mv, current.slice(0, 3), double));
    let forget = -1;
    let verdict;
    if (current.length < 4) verdict = ["Learns it — free slot", "#6d6"];
    else if (incoming.value === null) verdict = ["Status move — your call", "#fa4"];
    else {
      const gain = m => m.replacement - m.value;
      moves.forEach((m, i) => { if (m.value !== null && (forget < 0 || gain(m) > gain(moves[forget]))) forget = i; });
      if (forget < 0) verdict = ["Only status moves to drop — your call", "#fa4"];
      else if (moves[forget].replacement > moves[forget].value * 1.1) verdict = [`Learn → forget ${moves[forget].name}`, "#6d6"];
      else { verdict = ["Skip — not an upgrade", "#e55"]; forget = -1; }
    }
    // Shown against the slot it would take, or against the first three when skipping.
    if (forget >= 0) Object.assign(incoming, moveScore(pk, mv, current.filter((_, j) => j !== forget), double));
    return { kind: "learn", icon: iconOf(pk), name: pk.name, move: incoming, moves, forget, verdict };
  };

  // Rewards screen (UiMode 6). Needs come from the party; items are judged by their game class and fields
  // (restorePoints / restorePercent), and free rewards by the game's own rarity tier — nothing here depends on
  // remembering what an item does.
  const TIER_NAMES = ["Common", "Great", "Ultra", "Rogue", "Master", "Luxury"];
  const isA = (t, name) => {
    for (let p = t && Object.getPrototypeOf(t); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      if (p.constructor?.name === name) return true;
    }
    return false;
  };
  const isRevive = t => isA(t, "PokemonReviveModifierType");
  const isHeal = t => isA(t, "PokemonHpRestoreModifierType") && !isRevive(t);
  const isPp = t => isA(t, "PokemonPpRestoreModifierType");
  const isAllPp = t => isA(t, "PokemonAllMovePpRestoreModifierType");
  const healOn = (t, p) => Math.max(t.restorePoints ?? 0, Math.floor((t.restorePercent ?? 0) * p.getMaxHp() / 100));
  const pct = p => Math.round(p.hp / p.getMaxHp() * 100);

  const shopModel = (s, h) => {
    const party = s.getPlayerParty();
    const needs = {
      fainted: party.filter(p => p.hp <= 0),
      status: party.filter(p => p.hp > 0 && (p.status?.effect ?? 0) > 0),
      hurt: party.filter(p => p.hp > 0 && pct(p) < 60).sort((a, b) => pct(a) - pct(b)),
      lowPp: party.filter(p => p.hp > 0).map(p => ({
        p, moves: p.moveset.filter(Boolean).filter(m => m.getMovePp() - m.ppUsed <= Math.max(1, Math.floor(m.getMovePp() / 4))),
      })).filter(x => x.moves.length),
    };

    // Free rewards: tier sets the baseline, then what the party needs right now.
    const balls = s.pokeballCounts ?? {};
    const free = (h.options || []).map(o => {
      const t = o.modifierTypeOption.type;
      let v = (t.tier ?? 0) * 10;
      let why = TIER_NAMES[t.tier] ?? "";
      let covers = null;
      if (isRevive(t)) {
        if (needs.fainted.length) { v += 15; covers = ["fainted", needs.fainted[0]]; why = `revives ${needs.fainted[0].name}`; } else { v -= 5; why = "nobody fainted"; }
      } else if (isHeal(t)) {
        if (needs.hurt.length) { v += 12; covers = ["hurt", needs.hurt[0]]; why = `heals ${needs.hurt[0].name}`; } else { v -= 5; why = "party healthy"; }
      } else if (isA(t, "PokemonStatusHealModifierType")) {
        if (needs.status.length) { v += 12; covers = ["status", needs.status[0]]; why = `cures ${needs.status[0].name}`; } else { v -= 5; why = "no status"; }
      } else if (isPp(t) || isAllPp(t)) {
        if (needs.lowPp.length) { v += 10; covers = ["lowPp", needs.lowPp[0]]; why = `PP for ${needs.lowPp[0].p.name}`; } else { v -= 5; why = "PP fine"; }
      } else if (isA(t, "AddVoucherModifierType")) {
        v += 8; why = "egg voucher — outlasts the run";
      } else if (isA(t, "AddPokeballModifierType")) {
        const n = balls[t.pokeballType] ?? 0;
        v += n >= 10 ? -4 : 2; why = `you have ${n}`;
      } else if (isA(t, "TempStatStageBoosterModifierType") || /LURE/.test(t.id ?? "")) {
        v -= 3; why = "only lasts a few battles";
      } else if (isA(t, "TmModifierType")) {
        why = "TM — check who can learn it";
      } else if (isA(t, "PokemonHeldItemModifierType")) {
        v += 3; why = "held item";
      }
      return { name: t.name, icon: t.iconImage, v, why, covers };
    });
    const pick = free.reduce((best, f, i) => (best < 0 || f.v > free[best].v ? i : best), -1);
    if (pick >= 0 && free[pick].v < 0) free[pick].why = `least bad · ${free[pick].why}`;
    const covered = pick >= 0 ? free[pick].covers : null;
    const skip = (kind, target) => covered && covered[0] === kind && (covered[1] === target || covered[1]?.p === target);
    for (const f of free) delete f.covers; // holds pokémon objects; the model must stay JSON-safe for the signature

    // Shop: buy for the worst needs first while money lasts. Buying must happen before taking the free reward.
    const shop = (h.shopOptionsRows || []).flat().map(o => ({ t: o.modifierTypeOption.type, cost: o.modifierTypeOption.cost }));
    let money = s.money;
    const buys = [];
    const buy = (list, target, why) => {
      const item = list.filter(i => i.cost <= money)[0];
      if (!item) return;
      money -= item.cost;
      buys.push({ name: item.t.name, icon: item.t.iconImage, cost: item.cost, target: iconOf(target), targetName: target.name, why });
    };
    const byCost = pred => shop.filter(i => pred(i.t)).sort((a, b) => a.cost - b.cost);
    for (const p of needs.fainted) if (!skip("fainted", p)) buy(byCost(isRevive), p, "fainted");
    for (const p of needs.status) if (!skip("status", p)) buy(byCost(t => isA(t, "PokemonStatusHealModifierType")), p, "status");
    for (const p of needs.hurt) {
      if (skip("hurt", p)) continue;
      const missing = p.getMaxHp() - p.hp;
      const heals = byCost(isHeal);
      // Cheapest that tops it up; failing that, the biggest heal affordable.
      const enough = heals.filter(i => healOn(i.t, p) >= missing * 0.8);
      buy(enough.length ? enough : heals.sort((a, b) => healOn(b.t, p) - healOn(a.t, p)), p, `${pct(p)}% HP`);
    }
    for (const { p, moves } of needs.lowPp) {
      if (skip("lowPp", p)) continue;
      const m = moves[0];
      const missing = m.ppUsed;
      const list = moves.length >= 2 ? byCost(isAllPp) : byCost(t => isPp(t) && (t.restorePoints === -1 || t.restorePoints >= missing));
      buy(list, p, moves.length >= 2 ? `${moves.length} moves low` : `${m.getName()} ${m.getMovePp() - m.ppUsed}/${m.getMovePp()}`);
    }

    const reroll = pick >= 0 && free[pick].v < 10 && h.rerollCost > 0 && money >= h.rerollCost * 3
      ? `nothing good — reroll for $${h.rerollCost}?` : null;
    return { kind: "shop", money: s.money, left: money, buys, free, pick, reroll };
  };

  let game = null;
  const sprites = new Map();
  let missed = false; // a wanted sprite wasn't loaded yet during the last draw
  const sprite = (key, frame) => {
    const id = `${key}/${frame}`;
    if (!sprites.has(id)) {
      try {
        const t = game.textures;
        // Icon atlases load lazily; don't cache a miss, retry next refresh.
        if (t.exists(key) && t.get(key).has(frame)) sprites.set(id, t.getBase64(key, frame));
      } catch {}
    }
    return sprites.get(id) ?? "";
  };

  const h = (tag, style, ...kids) => {
    const n = document.createElement(tag);
    Object.assign(n.style, style);
    n.append(...kids.flat().filter(k => k != null && k !== ""));
    return n;
  };
  const img = (key, frame, title, height, fallback = title) => {
    const url = sprite(key, frame);
    if (!url) {
      // Optional sprites (fallback null) may simply not exist; don't retry those.
      if (fallback !== null) missed = true;
      return fallback;
    }
    const i = document.createElement("img");
    i.src = url;
    i.title = title;
    Object.assign(i.style, { height: `${height}px`, imageRendering: "pixelated", verticalAlign: "middle", margin: "0 1px" });
    return i;
  };
  const mon = (icon, name, height = 24) => (icon ? img(icon[0], icon[1], name, height, name) : name);
  const badge = (type, suffix = "") => h("span", { whiteSpace: "nowrap", marginRight: "3px" },
    img("types", type.toLowerCase(), type, 12), suffix && h("b", { fontSize: "10px" }, suffix));
  const dim = { color: "#9aa" };
  const line = (label, color, ...kids) => h("div", { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "1px" },
    h("span", { color, width: "14px", flex: "none" }, label), ...kids);
  const hpColor = hp => (hp > 50 ? "#6d6" : hp > 20 ? "#ec4" : "#e55");

  // Panel views: "full" (everything), "mini" (one line per foe), "closed" (tab).
  const VIEW_KEY = "coach-hud-view";
  let view = "full";
  try { view = localStorage.getItem(VIEW_KEY) || view; } catch {}
  const setView = v => {
    view = v;
    last = "";
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
    tick();
  };
  const button = (label, title, next) => {
    const n = h("span", { cursor: "pointer", padding: "0 4px", borderRadius: "3px", background: "rgba(255,255,255,.1)", fontWeight: "bold" }, label);
    n.title = title;
    n.addEventListener("click", e => { e.stopPropagation(); setView(next); });
    return n;
  };

  const tab = (emoji, icon) => {
    const n = h("span", { cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }, emoji, icon);
    n.title = "Open coach";
    n.addEventListener("click", e => { e.stopPropagation(); setView("mini"); });
    return n;
  };
  const bar = (emoji, title, ...right) => h("div", { display: "flex", alignItems: "center", gap: "4px", fontWeight: "bold" },
    emoji, title, h("span", { flex: "1" }), ...right,
    h("span", { width: "4px" }),
    view === "full" ? button("−", "Minimal overview", "mini") : button("+", "Expand", "full"),
    button("×", "Close", "closed"));

  const drawLearn = m => {
    if (view === "closed") return [tab("🎓", mon(m.icon, m.name, 20))];
    const header = bar("🎓", `${m.name} learns`, mon(m.icon, m.name, 20));
    const row = (x, mark, color) => line(mark, color,
      badge(x.type), img("categories", x.cat, x.cat, 12, null),
      h("span", { fontWeight: "bold", marginLeft: "2px" }, x.name),
      h("span", { flex: "1" }),
      x.notes.length ? h("span", { color: "#9aa", fontSize: "9px", marginRight: "4px" }, x.notes.join(" · ")) : null,
      h("span", dim, x.value === null ? "status" : `≈${x.value}`));
    const verdict = h("div", { color: m.verdict[1], fontWeight: "bold", marginTop: "3px" }, m.verdict[0]);
    if (view === "mini") return [header, row(m.move, "✚", "#6d6"), verdict];
    return [header, row(m.move, "✚", "#6d6"),
      h("div", { borderTop: "1px solid rgba(255,255,255,.12)", margin: "3px 0" }),
      ...m.moves.map((x, i) => (i === m.forget ? row(x, "✕", "#e55") : row(x, "·", "#9aa"))),
      verdict];
  };

  const itemImg = (icon, name) => img("items", icon, name, 18, null);
  const sep = { borderTop: "1px solid rgba(255,255,255,.12)", margin: "3px 0" };
  const drawShop = m => {
    const p = m.pick >= 0 ? m.free[m.pick] : null;
    if (view === "closed") return [tab("🛒", p ? itemImg(p.icon, p.name) : null)];
    const header = bar("🛒", `$${m.money}`, m.buys.length ? h("span", dim, `→ $${m.left}`) : null);
    const buyRows = m.buys.length
      ? m.buys.map(b => line("💰", "#ec4", itemImg(b.icon, b.name),
          h("span", { fontWeight: "bold" }, b.name), h("span", { ...dim, marginLeft: "4px" }, `$${b.cost}`),
          h("span", { flex: "1" }), mon(b.target, b.targetName, 20), h("span", dim, b.why)))
      : [line("💰", "#ec4", h("span", dim, "nothing to buy"))];
    const take = p ? line("🎁", "#6d6", itemImg(p.icon, p.name),
      h("span", { fontWeight: "bold" }, p.name), h("span", { flex: "1" }), h("span", dim, p.why)) : null;
    if (view === "mini") return [header, ...buyRows, take].filter(Boolean);
    const others = m.free.filter((_, i) => i !== m.pick).map(f => line("·", "#9aa", itemImg(f.icon, f.name),
      h("span", dim, f.name), h("span", { flex: "1" }), h("span", { color: "#9aa", fontSize: "9px" }, f.why)));
    return [header,
      h("div", { ...dim, fontSize: "9px" }, "buy first — taking the free reward closes the shop"),
      ...buyRows, h("div", sep), take, ...others,
      m.reroll ? line("🎲", "#8cf", h("span", dim, m.reroll)) : null].filter(Boolean);
  };

  const drawBattle = m => {
    if (view === "closed") return [tab("🎯", m.order[0] ? mon(m.order[0].icon, m.order[0].name, 20) : null)];

    const header = bar("🎯", m.title,
      ...m.order.flatMap((o, i) => [i ? h("span", dim, "›") : null, mon(o.icon, o.name, 20)]));

    const threatTag = t => {
      const n = h("span", { display: "inline-flex", alignItems: "center", marginRight: "4px", color: t.level === "ko" ? "#e55" : "#fa4" },
        t.level === "ko" ? "💀" : "⚠", badge(t.type, t.e >= 2 ? `×${t.e}` : ""));
      n.title = `${t.from}'s ${t.move}: ~${t.pct}% of current HP${t.level === "ko" ? ", before it can act" : ""}`;
      return n;
    };
    const swapLine = (sw, color, tail) => line("⇄", color,
      ...(sw.out ? [mon(sw.out.icon, sw.out.name, 20), sw.out.threat ? threatTag(sw.out.threat) : null, h("span", { color, margin: "0 3px" }, "out ›")] : [h("span", { color, marginRight: "3px" }, "send")]),
      mon(sw.in.icon, sw.in.name, 20), h("span", { color, marginLeft: "3px" }, tail));
    // ⚔ what each field slot should do; ⇄ the switches to get there (dim: better, but not worth a turn).
    const f = m.field;
    const slotMove = sl => [
      mon(sl.icon, sl.name, 20),
      ...(sl.move ? [badge(sl.type), h("span", { marginRight: "2px" }, sl.move)] : [h("span", dim, "—")]),
      ...(sl.target === "both" ? [h("span", dim, "→ both")] : sl.target ? [h("span", dim, "→"), mon(sl.target.icon, sl.target.name, 18)] : []),
    ];
    const enemySwitches = m.enemySwitches.map(es => line("⇆", "#c9f",
      mon(es.from.icon, es.from.name, 20), h("span", { color: "#c9f", margin: "0 3px" }, "→"),
      mon(es.to.icon, es.to.name, 20), h("span", { color: "#c9f", marginLeft: "3px" }, "switches — moves aimed at it")));
    const ifStay = m.ifStay && view === "full"
      ? line("↺", "#9aa", h("span", { ...dim, marginRight: "4px" }, "if it stays:"), ...m.ifStay.flatMap((sl, i) => [i ? h("span", dim, " · ") : null, ...slotMove(sl)]))
      : null;
    const field = !f ? [...enemySwitches] : [
      ...enemySwitches,
      ...f.slots.map(sl => line("⚔", "#8cf",
        mon(sl.icon, sl.name, 22),
        sl.threat ? threatTag(sl.threat) : null,
        ...(sl.move ? [badge(sl.type), h("span", { fontWeight: "bold" }, sl.move)] : [h("span", dim, "no damaging move")]),
        ...(sl.target === "both" ? [h("span", { color: "#8cf", marginLeft: "4px" }, "→ both")]
          : sl.target ? [h("span", { color: "#8cf", margin: "0 2px 0 4px" }, "→"), mon(sl.target.icon, sl.target.name, 20)] : []),
        h("span", { flex: "1" }),
        sl.ko ? h("span", dim, `${sl.ko}HKO`) : null)),
      ...f.switches.map(sw => swapLine(sw, "#fa4", "in")),
      ...(view === "full" ? f.optional.map(sw => swapLine(sw, "#9aa", "in · optional")) : []),
      f.noSafeSwitch ? line("⇄", "#e55", h("span", { color: "#e55" }, "no safe switch-in — every bench mon gets KO'd coming in")) : null,
      ifStay,
    ];

    if (view === "mini") {
      const rows = m.rows.map(r => h("div", { display: "flex", alignItems: "center", gap: "2px" },
        mon(r.icon, r.name, 22),
        h("span", { color: hpColor(r.hp), width: "30px" }, `${r.hp}%`),
        ...r.weak.slice(0, 3).map(([t, s]) => badge(t, s)),
        h("span", { flex: "1" }),
        r.pick ? h("span", { display: "flex", alignItems: "center" },
          h("span", { color: r.pick.later ? "#9aa" : "#8cf" }, r.pick.later ? "later" : "➜"), mon(r.pick.icon, r.pick.name, 20), badge(r.pick.type),
          r.pick.risky ? h("span", { color: "#fa4" }, "⚠") : null) : null));
      return [header, ...field, ...rows].filter(Boolean);
    }

    // With one foe the team line just repeats its weaknesses.
    const team = m.rows.length > 1 ? line("🩸", "#e77", ...m.team.map(([t, n]) => badge(t, `×${n}`))) : null;
    const rows = m.rows.map(r => h("div", { marginTop: "5px", paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,.12)" },
      h("div", { display: "flex", alignItems: "center", gap: "3px" },
        mon(r.icon, r.name, 28),
        h("span", { fontWeight: "bold" }, r.name),
        h("span", dim, `L${r.lv}`),
        ...r.types.map(t => badge(t)),
        r.boss ? "👑" : null,
        STATUS_FRAMES[r.status] ? img("statuses", STATUS_FRAMES[r.status], STATUS_FRAMES[r.status], 10, null) : null,
        h("span", { flex: "1" }),
        h("span", { color: hpColor(r.hp) }, `${r.hp}%`)),
      r.abilities.length ? line("✦", "#bbd", ...r.abilities.map(a =>
        h("span", { color: TRAPS.has(a) ? "#fa4" : "#bbd", marginRight: "6px" }, TRAPS.has(a) ? `⚠ ${a}` : a))) : null,
      line("▲", "#6d6", ...(r.weak.length ? r.weak.map(([t, s]) => badge(t, s)) : [h("span", dim, "—")])),
      r.avoid.length ? line("✕", "#e55", ...r.avoid.map(([t, s]) => badge(t, s))) : null,
      r.switchTo ? line("⇆", "#c9f",
        h("span", { color: "#c9f", marginRight: "3px" }, "switches to"),
        mon(r.switchTo.icon, r.switchTo.name, 20)) : null,
      r.pick
        ? line("➜", "#8cf",
            mon(r.pick.icon, r.pick.name, 22),
            img("categories", r.pick.cat, r.pick.cat, 12, null),
            badge(r.pick.type),
            h("span", { fontWeight: "bold" }, r.pick.move),
            h("span", { ...dim, marginLeft: "4px" }, `~${r.pick.pct}%${r.pick.ko ? ` · ${r.pick.ko}HKO` : ""}`),
            r.pick.risky ? h("span", { color: "#fa4" }, " ⚠ loses trade") : null,
            r.pick.later ? h("span", { color: "#9aa", fontSize: "9px", marginLeft: "4px" }, "later") : null,
            r.pick.vs ? [h("span", { color: "#c9f", fontSize: "9px", margin: "0 2px 0 4px" }, "into"), mon(r.pick.vs.icon, r.pick.vs.name, 18)] : null)
        : line("➜", "#8cf", h("span", dim, "no damaging move lands"))));
    return [header, ...field, team, ...rows].filter(Boolean);
  };

  const el = document.createElement("div");
  el.id = "coach-hud";
  Object.assign(el.style, {
    position: "fixed", top: "8px", left: "8px", zIndex: "2147483647",
    maxWidth: "min(300px, calc(100vw - 16px))", padding: "6px 8px", borderRadius: "6px",
    background: "rgba(12,12,24,.88)", color: "#eee",
    font: "11px/1.4 ui-monospace, Menlo, monospace",
    userSelect: "none", display: "none",
  });
  // Keep clicks on the panel from reaching the game underneath.
  for (const ev of ["click", "mousedown", "pointerdown", "touchstart"]) el.addEventListener(ev, e => e.stopPropagation());
  let last = "";
  document.body.appendChild(el);

  const tick = () => {
    try {
      game ??= Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game;
      const s = game.scene.getScene("battle");
      const learn = learnState(s);
      const handler = s.ui.getHandler();
      let m;
      if (learn) {
        m = learnModel(learn);
      } else if (s.ui.getMode() === 6 && handler?.options?.length) {
        m = shopModel(s, handler);
      } else {
        const b = s.currentBattle;
        const foes = s.getEnemyParty().filter(p => p.hp > 0);
        const party = s.getPlayerParty().filter(p => p.hp > 0);
        if (!b || !foes.length || !party.length) { el.style.display = "none"; return; }
        m = model(s, b, party, foes);
      }
      const sig = JSON.stringify([view, m]);
      el.style.display = "block";
      el.style.width = view === "full" ? "300px" : "auto";
      if (sig !== last) {
        missed = false;
        el.replaceChildren(...({ learn: drawLearn, shop: drawShop, battle: drawBattle }[m.kind])(m));
        // Icon atlases load lazily; redraw next tick until every sprite is in.
        last = missed ? "" : sig;
      }
    } catch (e) {
      game = null;
      el.style.display = "block";
      el.textContent = `coach: ${e.message}`;
      last = "";
    }
  };
  const timer = setInterval(tick, 1000);
  tick();
  window.__coachHud = { stop: () => { clearInterval(timer); el.remove(); delete window.__coachHud; } };
  document.documentElement.dataset.mcpOut = JSON.stringify({ hud: "on" });
})();
