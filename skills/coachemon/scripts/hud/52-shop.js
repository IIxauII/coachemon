// The rewards card's model: what to take, what to buy, and whether to reroll. A reward is judged by who the game's own
// select filter lets use it, then by its tier; 51-items.js judges the ones that go to one member (game-code.md §15).
import { TIER_NAMES, TYPES, iconOf } from "./01-core.js";
import { waveKind } from "./03-calendar.js";
import { learnAdvice, learnMoveById } from "./40-learn.js";
import { aheadModel, doubleOdds, learnRoster } from "./49-ahead.js";
import { teamAudit } from "./50-audit.js";
import { rerollPreview, rerollSummary } from "./50-reroll.js";
import { isA, rewardContext, rewardValue } from "./51-items.js";

const isRevive = t => isA(t, "PokemonReviveModifierType");
const isHeal = t => isA(t, "PokemonHpRestoreModifierType") && !isRevive(t);
const isPp = t => isA(t, "PokemonPpRestoreModifierType");
const isAllPp = t => isA(t, "PokemonAllMovePpRestoreModifierType");
const healOn = (t, p) => Math.max(t.restorePoints ?? 0, Math.floor((t.restorePercent ?? 0) * p.getMaxHp() / 100));
const pct = p => Math.round(p.hp / p.getMaxHp() * 100);

// null when the filter can't tell (there is none, or it throws): unknown, not nobody.
const shopUsers = (t, party) => {
  if (typeof t.selectFilter !== "function") return null;
  try { return party.filter(p => t.selectFilter(p) == null); } catch { return null; }
};
const knowsMove = (p, id) => (p.moveset ?? []).some(m => m?.moveId === id);
// The TM's select filter, else the `isTmCompatible` it wraps (game-code.md §16). null when neither can tell.
const tmLearners = (t, party) => {
  let users = shopUsers(t, party);
  if (!users && party.length && party.every(p => typeof p.isTmCompatible === "function")) {
    try { users = party.filter(p => p.isTmCompatible(t.moveId, true)); } catch { users = null; }
  }
  return users && users.filter(p => !knowsMove(p, t.moveId));
};
// Who a Memory Mushroom could teach the move instead: a second route, never a reason to skip the TM, since the
// relearner is reachable only through the Mushroom, a reward slot of its own (game-code.md §16).
const tmRelearners = (t, users) => users.filter(p => {
  if (typeof p.getLearnableLevelMoves !== "function") return false;
  try {
    const ids = p.getLearnableLevelMoves();
    return Array.isArray(ids) && ids.some(x => (Array.isArray(x) ? x[1] : x) === t.moveId);
  } catch { return false; }
});
// Only Hardcore keeps a fainted member from being taught a TM, and a challenge is on at any value but 0, not only a
// positive one (game-code.md §16).
const isHardcore = s => (s.gameMode?.challenges ?? []).some(c => c.id === Challenges.HARDCORE && c.value !== 0);

// `take`: true with the best recipient; false when nobody gains (`closest` is the nearest miss); null when a member's
// learn card can't score the move, which leaves the call to the player — `best` is that member, or null for a status
// move no member's card can score.
// @only tests: tmAdvice
export const tmAdvice = (mv, users, ctx) => {
  const all = users.map(p => ({ p, a: learnAdvice(p, mv, ctx) }));
  const recipient = x => ({ icon: iconOf(x.p), name: x.p.name, forget: x.a.forget, against: x.a.against, slot: x.a.slot, gain: x.a.gain, reason: x.a.reason,
    ...(x.a.setup ? { setup: x.a.setup.text } : {}), ...(x.p.hp <= 0 ? { fainted: true } : {}) });
  const best = all.filter(x => x.a.learn).sort((a, b) => b.a.gain - a.a.gain)[0];
  if (best) return { take: true, best: recipient(best) };
  const setup = all.filter(x => x.a.setup).sort((a, b) => b.a.setup.value - a.a.setup.value)[0];
  if (setup?.a.setup.fits) return { take: true, best: { ...recipient(setup), gain: setup.a.setup.value } };
  if (mv.category === MoveCategory.STATUS && all.every(x => x.a.learn === null)) return { take: null, best: null };
  const open = all.find(x => x.a.learn === null);
  if (open) return { take: null, best: recipient(open) };
  const closest = all.filter(x => x.a.learn === false).sort((a, b) => b.a.gain - a.a.gain)[0];
  return { take: false, best: null, closest: closest ? recipient(closest) : null };
};

const shopTier = t => {
  if (t.tier != null) return t.tier;
  try { return t.getOrInferTier?.() ?? null; } catch { return null; }
};
const hasFormKey = (p, re) => [p.species, p.fusionSpecies].some(sp => (sp?.forms ?? []).some(f => re.test(f?.formKey ?? "")));

export const rewardsModel = (run, h) => {
  const s = run.scene;
  const party = s.getPlayerParty();
  const alive = party.filter(p => p.hp > 0);
  const wave = s.currentBattle?.waveIndex ?? 0;
  const ahead = aheadModel(run);
  const bossNext = waveKind(s, wave + 1) != null;
  const gauntlet = (ahead?.fightsBeforeHeal ?? 0) >= 2;
  const hurtBelow = gauntlet ? 90 : bossNext ? 80 : 60;
  const lowOn = m => {
    try { if (m.getMove?.()?.category === MoveCategory.STATUS) return false; } catch {}
    const max = m.getMovePp(), left = max - m.ppUsed;
    return m.ppUsed > 0 && left <= Math.min(5, Math.max(1, Math.floor(max / 4)));
  };
  const needs = {
    fainted: party.filter(p => p.hp <= 0),
    status: party.filter(p => p.hp > 0 && (p.status?.effect ?? 0) > StatusEffect.NONE),
    hurt: party.filter(p => p.hp > 0 && pct(p) < hurtBelow).sort((a, b) => pct(a) - pct(b)),
    lowPp: party.filter(p => p.hp > 0).map(p => ({ p, moves: p.moveset.filter(Boolean).filter(lowOn) })).filter(x => x.moves.length),
  };

  const shop = (h.shopOptionsRows || []).flat().map(o => ({ t: o.modifierTypeOption.type, cost: o.modifierTypeOption.cost }));
  const byCost = pred => shop.filter(i => pred(i.t)).sort((a, b) => a.cost - b.cost);
  // `covered`: the `[kind, member]` need the free reward takes care of, which is then not bought for.
  const planBuys = covered => {
    let money = s.money;
    const buys = [];
    const skip = (kind, target) => covered && covered[0] === kind && covered[1] === target;
    const buy = (list, target, kind, why) => {
      const item = list.filter(i => i.cost <= money)[0];
      if (!item) return;
      money -= item.cost;
      buys.push({ name: item.t.name, icon: item.t.iconImage, cost: item.cost, target: iconOf(target), targetName: target.name, why, kind, pokemon: target, t: item.t });
    };
    for (const p of needs.fainted) if (!skip("fainted", p)) buy(byCost(isRevive), p, "fainted", "fainted");
    for (const p of needs.status) if (!skip("status", p)) buy(byCost(t => isA(t, "PokemonStatusHealModifierType")), p, "status", "status");
    for (const p of needs.hurt) {
      if (skip("hurt", p)) continue;
      const missing = p.getMaxHp() - p.hp;
      const heals = byCost(isHeal);
      const enough = heals.filter(i => healOn(i.t, p) >= missing * 0.8);
      buy(enough.length ? enough : heals.sort((a, b) => healOn(b.t, p) - healOn(a.t, p)), p, "hurt", `${pct(p)}% HP`);
    }
    for (const { p, moves } of needs.lowPp) {
      if (skip("lowPp", p)) continue;
      const m = moves[0];
      const missing = m.ppUsed;
      const single = byCost(isPp);
      const list = moves.length >= 2 ? byCost(isAllPp)
        : [...single.filter(i => i.t.restorePoints === -1 || i.t.restorePoints >= missing), ...single];
      buy(list, p, "lowPp", moves.length >= 2 ? `${moves.length} moves low` : `${m.getName()} ${m.getMovePp() - m.ppUsed}/${m.getMovePp()}`);
    }
    return { buys, left: money };
  };
  const baseline = planBuys(null);
  const owned = name => (s.modifiers ?? []).some(m => m?.constructor?.name === name);

  const balls = s.pokeballCounts ?? {};
  const rctx = rewardContext(s, alive, { bossNext, gauntlet, double: doubleOdds(s, wave + 1) });
  const judge = t => {
    const tier = shopTier(t);
    let v = (tier ?? 0) * 10;
    let why = TIER_NAMES[tier] ?? "";
    let covers = null;
    const extra = {};
    const users = shopUsers(t, alive);
    const need = (list, kind, bonus, text, none) => {
      if (!list.length) {
        if (gauntlet) { v = 4 + (tier ?? 0) * 4; why = `${none} · spare for the gauntlet`; }
        else if (bossNext) { v = 2; why = `${none} · spare for the boss`; }
        else { v = -5; why = none; }
        return;
      }
      const targets = list.map(x => x.p ?? x);
      const boughtFor = p => baseline.buys.find(b => b.kind === kind && b.pokemon === p);
      const enough = p => kind !== "hurt" || healOn(t, p) >= Math.min((p.getMaxHp() - p.hp) * 0.8, healOn(boughtFor(p).t, p));
      const bought = targets.filter(p => boughtFor(p) && enough(p));
      if (kind === "hurt" && !bought.length && targets.every(p => healOn(t, p) < (p.getMaxHp() - p.hp) * 0.5)) {
        v = gauntlet ? 8 : bossNext ? 6 : 2; covers = null; why = `${text(list[0])} a little`;
      } else if (bought.length) {
        const savings = bought.map(p => ({ p, saved: boughtFor(p).cost })).sort((a, b) => b.saved - a.saved);
        v = 4 + Math.min(10, savings[0].saved / 100) + (gauntlet ? 4 : bossNext ? 2 : 0);
        covers = [kind, savings[0].p]; why = `${text(list[targets.indexOf(savings[0].p)])} · saves $${savings[0].saved}`;
        extra.saves = savings[0].saved;
      } else {
        v = 10 + bonus + (gauntlet ? 6 : bossNext ? 4 : 0); covers = [kind, targets[0]]; why = text(list[0]);
      }
    };
    const judged = rewardValue(t, rctx, users);
    if (judged) {
      v = judged.v; why = judged.why;
      if (judged.users) extra.users = judged.users;
      if (judged.holder) extra.holder = judged.holder;
    } else if (isRevive(t)) need(needs.fainted, "fainted", 15, p => `revives ${p.name}`, "nobody fainted");
    else if (isHeal(t)) need(needs.hurt, "hurt", 8, p => `heals ${p.name}`, "party healthy");
    else if (isA(t, "PokemonStatusHealModifierType")) need(needs.status, "status", 8, p => `cures ${p.name}`, "no status");
    else if (isPp(t) || isAllPp(t)) need(needs.lowPp, "lowPp", 6, x => `PP for ${x.p.name}`, "PP fine");
    else if (isA(t, "PokemonPpUpModifierType")) {
      if (users && !users.length) { v = -3; why = "every move's PP is maxed"; }
      else { v = (t.upPoints ?? 1) >= 3 ? 10 : 8; why = "more PP on a move (permanent)"; }
    } else if (isA(t, "AddVoucherModifierType")) {
      v += 8; why = "egg voucher — outlasts the run";
    } else if (isA(t, "AddPokeballModifierType")) {
      const n = balls[t.pokeballType] ?? 0;
      if (t.pokeballType === PokeballType.MASTER_BALL) { v = Math.max(v, 20); why = `Master Ball — catches anything · you have ${n}`; }
      else { v += n >= 10 ? -4 : n >= 5 ? 1 : 4; why = `you have ${n}`; }
    } else if (isA(t, "TempStatStageBoosterModifierType") || /LURE/.test(t.id ?? "")) {
      v = Math.min(v, 6) - 3; why = /LURE/.test(t.id ?? "") ? "more double battles for a while" : "only lasts a few battles";
    } else if (isA(t, "TmModifierType")) {
      const mv = learnMoveById(party, t.moveId);
      extra.moveId = t.moveId ?? null;
      extra.move = mv ? { name: mv.name, type: TYPES[mv.type] ?? "Normal", cat: ["physical", "special", "status"][mv.category] } : null;
      const users = tmLearners(t, isHardcore(s) ? alive : party);
      if (!users || !mv) { v = 5; why = "TM — can't check who learns it"; extra.tm = null; }
      else if (!users.length) { v = -6; why = "skip · nobody can learn it"; extra.users = []; extra.tm = "skip"; }
      else {
        // Only the no-recipient `maybe` names this in `why`: 96-render-rewards.js names it on a recipient's row, and a
        // skipped TM is no move to spend a Mushroom on.
        const relearn = tmRelearners(t, users);
        const relearnNote = relearn.length === users.length
          ? ` · ${relearn.length > 1 ? "all" : relearn[0].name} can relearn it (Memory Mushroom)` : "";
        // Kept for the run, so judged against the doubles and the roster ahead (#122), not this wave.
        const advice = tmAdvice(mv, users, { double: doubleOdds(s, wave + 1), party, roster: learnRoster(ahead) });
        const b = advice.best;
        extra.users = users.map(p => p.name);
        // Whatever the verdict: the watcher and the journal read the offer, not only the advice on it.
        if (relearn.length) extra.relearn = relearn.map(p => p.name);
        extra.tm = advice.take ? "take" : advice.take === false ? "skip" : "maybe";
        if (b) extra.best = { icon: b.icon, name: b.name, forget: b.forget, gain: b.gain, ...(b.setup ? { setup: b.setup } : {}), ...(b.fainted ? { fainted: true } : {}) };
        const to = b && `${b.name}${b.fainted ? " (fainted)" : ""}`;
        if (advice.take && b.setup) {
          v = 10 + Math.min(10, Math.round(b.gain / 10));
          why = `setup TM for ${to} (${b.setup})${b.forget ? ` over ${b.forget}` : ""}`;
        } else if (advice.take) {
          v = 5 + Math.min(20, Math.round(b.gain / 6));
          why = `TM for ${to}${b.forget ? ` (over ${b.forget})` : " (free slot)"} · +${b.gain} power`;
        } else if (b) {
          v = 3; why = `TM for ${to} — ${b.reason}, your call`;
        } else if (advice.take === null) {
          v = 3; why = `status TM — ${users[0].name}${users.length > 1 ? ` +${users.length - 1}` : ""} can learn it${relearnNote}`;
        } else {
          const c = advice.closest;
          v = -3; why = `skip · no upgrade for ${users.map(p => p.name).slice(0, 2).join("/")}${c?.against ? ` · ${c.name} keeps ${c.against}` : ""}`;
        }
      }
    } else if (isA(t, "EvolutionItemModifierType") || isA(t, "FormChangeItemModifierType")) {
      // An evolution item gets here only when the filter can't tell who: 51-items.js judges the rest.
      const evo = isA(t, "EvolutionItemModifierType");
      if (users) extra.users = users.map(p => p.name);
      if (users?.length) { v = evo ? 25 : 15; why = `${evo ? "evolves" : "changes form of"} ${users[0].name}`; }
      else if (users) { v = -5; why = `nobody can use it`; }
      else why = "check who can use it";
    } else if (t.id === "MEGA_BRACELET" || t.id === "DYNAMAX_BAND") {
      const mega = t.id === "MEGA_BRACELET";
      const can = alive.filter(p => hasFormKey(p, mega ? /^mega/ : /gigantamax/));
      extra.users = can.map(p => p.name);
      if (owned(mega ? "MegaEvolutionAccessModifier" : "GigantamaxAccessModifier")) { v = -5; why = "already have one"; }
      else if (can.length) { v = 20; why = `${can[0].name} can ${mega ? "Mega Evolve (needs its stone)" : "Gigantamax"}`; }
      else { v = -5; why = `nobody on the team can ${mega ? "Mega Evolve" : "Gigantamax"}`; }
    } else if (isA(t, "PokemonHeldItemModifierType")) {
      if (users) extra.users = users.map(p => p.name);
      if (users && !users.length) { v -= 8; why = "everyone's at max stack"; }
      else { v += 3; why = "held item"; }
    }
    return {
      name: t.name, icon: t.iconImage, v, why, covers,
      tier, tierName: TIER_NAMES[tier] ?? null, class: t.constructor?.name ?? null, id: t.id ?? null, ...extra,
    };
  };
  const free = (h.options || []).map(o => judge(o.modifierTypeOption.type));
  const pick = free.reduce((best, f, i) => (best < 0 || f.v > free[best].v ? i : best), -1);
  if (pick >= 0 && free[pick].v < 0) free[pick].why = `least bad · ${free[pick].why}`;
  const { buys, left: money } = planBuys(pick >= 0 ? free[pick].covers : null);
  for (const f of free) delete f.covers; // holds pokémon objects; the model must stay JSON-safe for the signature
  for (const b of buys) { delete b.pokemon; delete b.kind; delete b.t; }

  // `pinned` is this screen's alone: a reroll drops the wave's reward settings (game-code.md §19).
  const pinned = ahead?.thisWave ?? null;
  const preview = rerollPreview(run);
  const rerollAhead = preview?.rolls?.length ? rerollAdvice(preview, judge, pick >= 0 ? free[pick] : null, s.money, money) : null;
  const reroll = rerollAhead ? null
    : pick >= 0 && free[pick].v < 10 && h.rerollCost > 0 && money >= h.rerollCost * 3 ? `nothing good — reroll for $${h.rerollCost}?` : null;
  const luck = ahead?.luck
    ? { ...ahead.luck, upgrades: !pinned || pinned.luckUpgrades }
    : null;
  const affordable = shop.filter(i => i.cost <= s.money).length;
  return { kind: "rewards", money: s.money, left: money, buys, free, pick, reroll, rerollAhead, bossNext, gauntlet, luck, wave,
    affordable, ahead, audit: teamAudit(run, ahead) };
};

const REROLL_GAIN = 5;
const rerollAdvice = (preview, judge, now, money, afterBuys) => {
  const rolls = preview.rolls.map(r => {
    const offers = r.types.map((t, i) => {
      const f = judge(t);
      delete f.covers;
      return { ...f, ...(r.upgrades[i] > 0 ? { upgraded: r.upgrades[i] } : {}) };
    });
    const best = offers.reduce((b, f, i) => (b < 0 || f.v > offers[b].v ? i : b), -1);
    const gain = best >= 0 ? offers[best].v - (now?.v ?? 0) : 0;
    const verdict = r.cost > money ? "short" : gain < REROLL_GAIN ? "keep" : r.cost > afterBuys ? "instead of buys" : "reroll";
    return { lock: r.lock, cost: r.cost, offers, best, gain: Math.round(gain * 10) / 10, verdict };
  });
  return { n: preview.n, canLock: preview.canLock, locked: preview.locked, missed: preview.missed, rolls, byLock: preview.byLock };
};

export const rewardsSummary = m => {
  const p = m.pick >= 0 ? m.free[m.pick] : null;
  const take = p ? `take ${p.name}${p.best ? ` → ${p.best.name}${p.best.forget ? ` (forget ${p.best.forget})` : ""}` : p.holder ? ` → ${p.holder.name}` : ""}` : null;
  const buys = m.buys.length ? `buy ${m.buys.map(x => x.name).join(", ")}` : null;
  return [take, buys, rerollSummary(m)].filter(Boolean).join(" · ") || null;
};
