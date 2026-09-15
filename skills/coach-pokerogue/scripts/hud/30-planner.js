// Battle planning: who should be on the field, what each slot does, and the per-foe rows.
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
