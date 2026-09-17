// Research harness for #113 (throwaway, lives on research/hud-authority only).
//
// `hudAgreement(m, ctx)` compares the ⚔ turn line with step 1 of the ♟ fight plan on one battle model: the JSON-safe
// object the HUD draws (`window.__coachHud.last()` in the page, the same object offline). It needs nothing but that
// model, so it runs unchanged in node and in the live page. `ctx` carries what only the offline harness can know
// (a stale ♟ cache, counterfactual reruns); in the page it is empty.
//
// Returns null when there is nothing to compare (not a battle, no ⚔ field, no ♟ plan: a wild wave), else
// { turn: [⚔ per slot], plan: ♟ step 1, verdict: agree|mon|target|move|action, features, buckets: [all that fit], bucket }.
// `action` (added to the ticket's four): same mon, move and target, but ♟ has it switching in while it is already out.
// Bucket numbers follow the ticket (1–8), plus 9 (⚔ stay margin) found here.
(function (root) {
  const BUCKETS = {
    1: "objective (1 turn vs whole fight)",
    2: "move rule for the same matchup",
    3: "granularity (♟ gets there on a later step)",
    4: "reserve holdback",
    5: "free entry vs paid switch (doomed mon)",
    6: "predicted enemy switch",
    7: "fidelity gap (doubles / status-setup pick)",
    8: "stale ♟ cache",
    9: "⚔ stay margin (♟ mon shown only as an optional switch)",
  };

  const pickOf = sl => ({
    mon: sl.name, move: sl.move ?? null, cat: sl.cat ?? null, then: sl.then ?? null,
    target: sl.target === "both" ? "both" : sl.target?.name ?? null,
    switchIn: !!sl.enter, onField: !!sl.out, support: sl.support ?? null, locked: !!sl.locked,
    threat: sl.threat ? { level: sl.threat.level, next: !!sl.threat.next, after: !!sl.threat.after, from: sl.threat.from } : null,
  });

  const compare = (slots, plan) => {
    const turn = slots.map(pickOf);
    const slot = turn.find(x => x.mon === plan.mon) ?? turn[0];
    if (!slot) return { turn, slot: null, verdict: "mon" };
    // A move on the user (Swords Dance) aims at nobody: its target can't disagree.
    const targetOk = slot.target === plan.target || slot.target === "both" || (slot.target == null && slot.cat === "status");
    // `action`: the right mon, but an action it can't take — a ♟ "switch in" for a mon already on the field (doubles
    // plan one mon as "out"), or "stay" for one ⚔ is bringing in.
    const actionOk = !((slot.onField && !slot.switchIn && plan.entry === "switch") || (slot.switchIn && plan.entry === "stay"));
    const verdict = slot.mon !== plan.mon ? "mon" : !targetOk ? "target" : slot.move !== plan.move ? "move" : !actionOk ? "action" : "agree";
    return { turn, slot, verdict };
  };

  const hudAgreement = (m, ctx = {}) => {
    if (!m || m.kind !== "battle" || !m.field?.slots?.length || !m.teamPlan?.steps?.length) return null;
    const tp = m.teamPlan, f = m.field, s1 = tp.steps[0];
    const plan = {
      mon: s1.send.name, move: s1.move ?? null, target: s1.vs.name, entry: s1.entry,
      falls: s1.hp === 0, foeFalls: s1.foeHp === 0, sacrifice: !!s1.sacrifice, why: s1.why,
      step2: tp.steps[1] ? { mon: tp.steps[1].send.name, target: tp.steps[1].vs.name, entry: tp.steps[1].entry } : null,
    };
    const { turn, slot, verdict } = compare(f.slots, plan);

    const sure = (m.enemySwitches ?? []).filter(x => x.sure);
    const reserve = (tp.reserve ?? []).map(r => ({ mon: r.name, for: r.for?.name ?? null }));
    const reserved = name => reserve.some(r => r.mon === name);
    const slotIdx = f.slots.findIndex(sl => sl.name === slot?.mon);
    // The mon ⚔ takes off the field this turn (a paid switch), or the one it keeps on.
    const out = slot?.switchIn ? f.switches?.find(sw => sw.in?.name === slot.mon)?.out ?? null : null;
    const outThreat = out?.threat ?? null;
    const stayThreat = slot && !slot.switchIn ? slot.threat : null;
    const ifStay = m.ifStay?.length ? compare(m.ifStay, plan) : null;

    const features = {
      double: !!m.double,
      freeSwitch: !!f.freeSwitch,
      // Nobody of ours on the field (a faint's replacement): every ⚔ newcomer is free.
      replacing: turn.every(x => !x.onField) && (f.switches ?? []).every(sw => !sw.out),
      predictedSwitch: sure.length > 0,
      planAimsAtLeaving: sure.some(x => x.from.name === plan.target),
      turnAimsAtSwitchIn: sure.some(x => x.to.name === slot?.target),
      ifStayVerdict: ifStay?.verdict ?? null,
      reserveActive: reserve.length > 0,
      reserve,
      turnSpendsReserve: !!slot && reserved(slot.mon) && !reserve.some(r => r.mon === slot.mon && r.for === slot.target),
      planHoldsBack: !!slot && reserved(slot.mon) && !reserved(plan.mon),
      // Doomed: likely KO'd before it acts this turn (💀), or after acting once (⚠ after).
      doomedOut: !!outThreat && (outThreat.level === "ko" || outThreat.after),
      doomedStaying: !!stayThreat && !stayThreat.next && (stayThreat.level === "ko" || stayThreat.after),
      paidSwitch: !!slot?.switchIn && !f.freeSwitch,
      planStaysAndFalls: plan.entry === "stay" && plan.falls,
      planSwitches: plan.entry === "switch",
      statusPick: !!slot && (slot.cat === "status" || !!slot.support),
      statusThenPlanMove: !!slot && slot.cat === "status" && slot.then === plan.move,
      sameMatchupMoveDiffers: !!slot && slot.mon === plan.mon && (slot.target === plan.target || slot.target === "both") && slot.cat !== "status" && slot.move !== plan.move,
      optionalSwitchToPlanMon: (f.optional ?? []).some(o => o.in?.name === plan.mon),
      noSafeSwitch: !!f.noSafeSwitch,
      laterStepIsTurnMon: !!slot && plan.step2?.mon === slot.mon && plan.mon !== slot.mon,
      // Doubles: ♟ pays to bring a bench mon in while ⚔'s field mons are all still standing in the plan.
      planBenchesInWhileFieldStands: !!m.double && tp.steps.some((x, i) => x.entry === "switch" && !turn.some(t => t.mon === x.send.name)
        && turn.every(t => !tp.steps.slice(0, i).some(y => y.send.name === t.mon && y.hp === 0))),
      stale: !!ctx.stale,
      ...(ctx.extra ?? {}),
    };

    const buckets = [];
    if (verdict !== "agree") {
      const add = n => { if (!buckets.includes(n)) buckets.push(n); };
      if (features.stale) add(8);
      if (features.predictedSwitch && (features.planAimsAtLeaving || features.turnAimsAtSwitchIn || ifStay?.verdict === "agree")) add(6);
      if (features.double || verdict === "action") add(7);
      if (features.statusPick) add(7);
      // Offline the holdback is tested directly (♟ re-searched without it); in the page only its footprint shows.
      if (ctx.extra && "noReserveAgrees" in ctx.extra ? ctx.extra.noReserveAgrees : verdict === "mon" && (features.turnSpendsReserve || features.planHoldsBack)) add(4);
      // 5: ⚔ pays a switch where ♟ lets the mon out fall and brings the same mon in free; or ⚔ vetoes the switch-in ♟
      // pays for (offline: ⚔ pinned to ♟'s mon scores the −99 "KO'd before acting" option; in the page, "no safe switch").
      const vetoed = ctx.extra?.pinTurn ? ctx.extra.pinTurn.score <= -50 : features.noSafeSwitch;
      if (verdict === "mon" && ((features.paidSwitch && features.planStaysAndFalls && plan.step2?.mon === slot?.mon)
        || (features.planSwitches && !slot?.switchIn && vetoed))) add(5);
      if (features.sameMatchupMoveDiffers) add(2);
      if (verdict === "mon" && features.optionalSwitchToPlanMon) add(9);
      // 3: ⚔ pays a switch for this turn's gain while ♟ keeps the mon out for its whole exchange (it doesn't fall).
      if (verdict === "mon" && features.paidSwitch && plan.entry === "stay" && !plan.falls && !features.predictedSwitch) add(3);
      if (!buckets.length) add(1);
    }
    return {
      wave: m.wave ?? null, verdict, bucket: buckets[0] ?? null, buckets,
      fight: { result: tp.result, win: tp.win ? `${tp.win.name} KOs ${tp.win.kills}/${tp.win.of}` : null, steps: tp.steps.length, approxDoubles: !!tp.approxDoubles },
      turn: turn.map(x => ({ mon: x.mon, move: x.move, target: x.target, switchIn: x.switchIn, cat: x.cat, then: x.then })),
      slot: slotIdx, plan, features,
    };
  };

  root.hudAgreement = hudAgreement;
  root.HUD_BUCKETS = BUCKETS;
})(typeof window !== "undefined" ? window : globalThis);
