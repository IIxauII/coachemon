// Rewards-screen card model.
// Rewards screen (UiMode 6). Needs come from the party; items are judged by their game class and fields
// (restorePoints / restorePercent, moveId, pokeballType), by who in the party the game itself would let use them
// (PokemonModifierType.selectFilter: null = usable — TM compatibility, evolution/form-change items, held-item stack
// limits), and only then by rarity tier. Held items, mints, EXP items, candy, vitamins and evolution items are judged
// on the member they'd go to by 51-items.js; nothing here depends on remembering what an item does.
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

// Who in the party can use a reward, by the game's own select filter (null = usable). null when it can't be told
// (no filter, or the filter throws): callers treat that as unknown, not as "nobody".
const shopUsers = (t, party) => {
  if (typeof t.selectFilter !== "function") return null;
  try { return party.filter(p => t.selectFilter(p) == null); } catch { return null; }
};
// Who can learn a TM: the game's select filter (TmModifierType's is `isTmCompatible(moveId, true)` — species and
// fusion TM lists, minus moves already known); without one, the same check called directly. Members who already know
// the move are dropped either way. null when it can't be told.
const knowsMove = (p, id) => (p.moveset ?? []).some(m => m?.moveId === id);
const tmLearners = (t, party) => {
  let users = shopUsers(t, party);
  if (!users && party.length && party.every(p => typeof p.isTmCompatible === "function")) {
    try { users = party.filter(p => p.isTmCompatible(t.moveId, true)); } catch { users = null; }
  }
  return users && users.filter(p => !knowsMove(p, t.moveId));
};
// Who would be spending the TM on something they get anyway. The offer itself is drawn from
// `getCompatibleTms(true, true, true)` (`TmModifierTypeGenerator`), which per member drops the moves it knows, the
// ones on its own level-up and relearn list, and the TMs it has already used — so a member missing from that list is
// one the game never drew this TM for: it learns the move by levelling, or can relearn it from a Memory Mushroom.
// Teaching is still allowed (the party screen only asks `isTmCompatible(moveId, true)`), so they are set aside rather
// than dropped: `free` carries them when nobody else can take the TM.
const tmPoolSplit = (t, users) => {
  const free = [];
  const paying = users.filter(p => {
    if (typeof p.getCompatibleTms !== "function") return true;
    let pool = null;
    try { pool = p.getCompatibleTms(true, true, true); } catch { return true; }
    if (!Array.isArray(pool) || pool.includes(t.moveId)) return true;
    free.push(p);
    return false;
  });
  return { paying, free };
};
// A fainted member can still be taught a TM: the party screen's TM mode offers TEACH whoever the cursor is on, and
// the TM pool itself is drawn from the whole party. Only the Hardcore challenge takes it away: a fainted member there
// goes through `PartyUiHandler.updateOptionsHardcore`, whose switch has no TM case at all, so it is offered nothing
// but Cancel and the scroll options — not even the Release its other modes push.
// The test is `GameMode.hasChallenge`'s own (`src/game-mode.ts:98-100`): a challenge counts when its value is
// anything but 0, not when it is positive.
const isHardcore = s => (s.gameMode?.challenges ?? []).some(c => c.id === Challenges.HARDCORE && c.value !== 0);

// TM advice: the learn decision (learnAdvice, the learn card's own) for every member who can learn the move, and the
// best recipient. `take` true with the member gaining the most effective power (or, for a setup move, the member it
// suits), false when nobody gains (`closest` is the nearest miss), null when nobody's card can score it.
// Status moves are scored on the same scale as attacks now (#70), so most of them land in the first branch — the
// `setup` field rides along on the recipient either way, because "setup TM for Comfey (+1 SpA/SpD)" says more than
// "over Tackle".
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
  // Nobody's card could score it: which slot to drop is the user's call.
  const open = all.find(x => x.a.learn === null);
  if (open) return { take: null, best: recipient(open) };
  const closest = all.filter(x => x.a.learn === false).sort((a, b) => b.a.gain - a.a.gain)[0];
  return { take: false, best: null, closest: closest ? recipient(closest) : null };
};

const shopTier = t => {
  if (t.tier != null) return t.tier;
  try { return t.getOrInferTier?.() ?? null; } catch { return null; }
};
// Forms that need the key item: mega forms for the Mega Bracelet, gigantamax for the Dynamax Band.
const hasFormKey = (p, re) => [p.species, p.fusionSpecies].some(sp => (sp?.forms ?? []).some(f => re.test(f?.formKey ?? "")));

export const rewardsModel = (s, h) => {
  const party = s.getPlayerParty();
  const alive = party.filter(p => p.hp > 0);
  // The reward before a big fight is the last chance to patch the team up. What counts as one is the run calendar's
  // answer for the next wave — the fixed battles and the gym waves as well as every tenth wave, and its own game-less
  // fallback when the live build hides the game mode. `gauntlet` is the Elite Four case: more than one big fight
  // before the next full heal, so the whole party has to last, not just the lead.
  const wave = s.currentBattle?.waveIndex ?? 0;
  const ahead = aheadModel(s);
  const bossNext = waveKind(s, wave + 1) != null;
  const gauntlet = (ahead?.fightsBeforeHeal ?? 0) >= 2;
  const hurtBelow = gauntlet ? 90 : bossNext ? 80 : 60;
  // Low PP: a damaging move nearly out (≤ a quarter of its PP and ≤ 5 left). Unused status moves and a few PP spent
  // don't count — the game's own Ether weight asks for over half used and ≤ 5 left.
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

  // Shop: buy for the worst needs first while money lasts, skipping the need the free reward covers ([kind, pokémon]).
  // Buying must happen before taking the free reward.
  const shop = (h.shopOptionsRows || []).flat().map(o => ({ t: o.modifierTypeOption.type, cost: o.modifierTypeOption.cost }));
  const byCost = pred => shop.filter(i => pred(i.t)).sort((a, b) => a.cost - b.cost);
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
      // Cheapest that tops it up; failing that, the biggest heal affordable.
      const enough = heals.filter(i => healOn(i.t, p) >= missing * 0.8);
      buy(enough.length ? enough : heals.sort((a, b) => healOn(b.t, p) - healOn(a.t, p)), p, "hurt", `${pct(p)}% HP`);
    }
    for (const { p, moves } of needs.lowPp) {
      if (skip("lowPp", p)) continue;
      const m = moves[0];
      const missing = m.ppUsed;
      // Cheapest that restores it all; failing that, any single-move restore we can afford.
      const single = byCost(isPp);
      const list = moves.length >= 2 ? byCost(isAllPp)
        : [...single.filter(i => i.t.restorePoints === -1 || i.t.restorePoints >= missing), ...single];
      buy(list, p, "lowPp", moves.length >= 2 ? `${moves.length} moves low` : `${m.getName()} ${m.getMovePp() - m.ppUsed}/${m.getMovePp()}`);
    }
    return { buys, left: money };
  };
  const baseline = planBuys(null);
  const owned = name => (s.modifiers ?? []).some(m => m?.constructor?.name === name);

  // Free rewards: what the item does for this party now, then rarity tier as a tiebreak for everything else.
  const balls = s.pokeballCounts ?? {};
  const rctx = rewardContext(s, alive, { bossNext, gauntlet, double: doubleOdds(s, wave + 1) });
  // One reward judged for this party: the options on screen, and the ones a reroll would bring.
  const judge = t => {
    const tier = shopTier(t);
    let v = (tier ?? 0) * 10;
    let why = TIER_NAMES[tier] ?? "";
    let covers = null;
    const extra = {};
    const users = shopUsers(t, alive);
    // A reward that covers a need: if we'd buy for that need anyway, it's worth the money it saves (take it free, buy
    // one fewer); if we couldn't buy for it, it's worth the need itself. A heal only stands in for a purchase that
    // heals no more than it does, and a heal far short of the damage is worth little.
    const need = (list, kind, bonus, text, none) => {
      if (!list.length) {
        // Nobody needs it now — but a spare is worth holding when a big fight is next. Through a gauntlet it is
        // worth what it is: a Max Revive carried into the Elite Four beats a thirty-fifth Great Ball, a Potion
        // doesn't, so the tier carries the weight rather than a flat number.
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
      // Permanent extra PP on one move.
      if (users && !users.length) { v = -3; why = "every move's PP is maxed"; }
      else { v = (t.upPoints ?? 1) >= 3 ? 10 : 8; why = "more PP on a move (permanent)"; }
    } else if (isA(t, "AddVoucherModifierType")) {
      v += 8; why = "egg voucher — outlasts the run";
    } else if (isA(t, "AddPokeballModifierType")) {
      const n = balls[t.pokeballType] ?? 0;
      if (t.pokeballType === PokeballType.MASTER_BALL) { v = Math.max(v, 20); why = `Master Ball — catches anything · you have ${n}`; }
      else { v += n >= 10 ? -4 : n >= 5 ? 1 : 4; why = `you have ${n}`; }
    } else if (isA(t, "TempStatStageBoosterModifierType") || /LURE/.test(t.id ?? "")) {
      // Tier says nothing here: a few battles of a stat stage or more doubles never beats covering a real need.
      v = Math.min(v, 6) - 3; why = /LURE/.test(t.id ?? "") ? "more double battles for a while" : "only lasts a few battles";
    } else if (isA(t, "TmModifierType")) {
      const mv = learnMoveById(party, t.moveId);
      extra.moveId = t.moveId ?? null;
      extra.move = mv ? { name: mv.name, type: TYPES[mv.type] ?? "Normal", cat: ["physical", "special", "status"][mv.category] } : null;
      const all = tmLearners(t, isHardcore(s) ? alive : party);
      const split = all && tmPoolSplit(t, all);
      // Everyone who can learn it gets it without the TM: nothing to spend a reward slot on.
      const users = split && (split.paying.length ? split.paying : []);
      if (!all || !mv) { v = 5; why = "TM — can't check who learns it"; extra.tm = null; }
      else if (!all.length) { v = -6; why = "skip · nobody can learn it"; extra.users = []; extra.tm = "skip"; }
      else if (!users.length) {
        v = -4; extra.users = split.free.map(p => p.name); extra.tm = "skip";
        why = `skip · ${split.free.map(p => p.name).slice(0, 2).join("/")} learn${split.free.length > 1 ? "" : "s"} it without the TM`;
      } else {
        // The learn card's own decision on every member that can learn it: best recipient wins. A TM is kept for the
        // run, so a spread or ally move is judged by the share of double battles ahead, not by the wave just won.
        // Disruption and inflicted status are weighed against the next big fight's roster, as on the learn card.
        const advice = tmAdvice(mv, users, { double: doubleOdds(s, wave + 1), party, roster: learnRoster(ahead) });
        const b = advice.best;
        extra.users = users.map(p => p.name);
        extra.tm = advice.take ? "take" : advice.take === false ? "skip" : "maybe";
        if (b) extra.best = { icon: b.icon, name: b.name, forget: b.forget, gain: b.gain, ...(b.setup ? { setup: b.setup } : {}), ...(b.fainted ? { fainted: true } : {}) };
        const to = b && `${b.name}${b.fainted ? " (fainted)" : ""}`;
        if (advice.take && b.setup) {
          // Setup moves: the member it suits best (boosts the stat it attacks with, no setup move yet).
          v = 10 + Math.min(10, Math.round(b.gain / 10));
          why = `setup TM for ${to} (${b.setup})${b.forget ? ` over ${b.forget}` : ""}`;
        } else if (advice.take) {
          v = 5 + Math.min(20, Math.round(b.gain / 6));
          why = `TM for ${to}${b.forget ? ` (over ${b.forget})` : " (free slot)"} · +${b.gain} power`;
        } else if (b) {
          v = 3; why = `TM for ${to} — ${b.reason}, your call`;
        } else if (advice.take === null) {
          v = 3; why = `status TM — ${users[0].name}${users.length > 1 ? ` +${users.length - 1}` : ""} can learn it`;
        } else {
          const c = advice.closest;
          v = -3; why = `skip · no upgrade for ${users.map(p => p.name).slice(0, 2).join("/")}${c?.against ? ` · ${c.name} keeps ${c.against}` : ""}`;
        }
      }
    } else if (isA(t, "EvolutionItemModifierType") || isA(t, "FormChangeItemModifierType")) {
      // 51-items.js takes evolution items whose users can be told; what's left is unknown, or a form change.
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
      else { v += 3; why = "held item"; } // one 51-items.js has no rule for
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

  // Rerolling. With the reroll preview (50-reroll.js) the card knows what the next reroll brings, so the advice is a
  // comparison: the best offer after it against the best offer now, on the same scale. Without it, the old hint: the
  // cost doubles every time (`2 ** rerollCount`), so a weak screen is worth one look, not a habit. A reroll is an
  // ordinary roll even after a fixed battle pinned this screen's tiers — the reroll drops the wave's reward settings.
  const pinned = ahead?.thisWave ?? null;
  const preview = rerollPreview(s);
  const rerollAhead = preview?.rolls?.length ? rerollAdvice(preview, judge, pick >= 0 ? free[pick] : null, s.money, money) : null;
  const reroll = rerollAhead ? null
    : pick >= 0 && free[pick].v < 10 && h.rerollCost > 0 && money >= h.rerollCost * 3 ? `nothing good — reroll for $${h.rerollCost}?` : null;
  const luck = ahead?.luck
    ? { ...ahead.luck, upgrades: !pinned || pinned.luckUpgrades }
    : null;
  // How many shop items the money covers at all: often none early on, when the shop is irrelevant.
  const affordable = shop.filter(i => i.cost <= s.money).length;
  return { kind: "rewards", money: s.money, left: money, buys, free, pick, reroll, rerollAhead, bossNext, gauntlet, luck, wave,
    affordable, ahead, audit: teamAudit(s, ahead) };
};

// How much better the best offer after a reroll has to be than the best offer now, on the card's scale (about 10 a
// rarity tier), before the reroll is worth its money. A first cut.
const REROLL_GAIN = 5;
// The reroll preview judged: per roll (the lock as it stands, then toggled), its offers, its best, and a verdict —
// `reroll` when it beats the screen by REROLL_GAIN and the money is there after the planned buys, `instead of buys`
// when it only fits by skipping them, `keep` when it doesn't beat the screen, `short` when it can't be paid for.
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
  return { n: preview.n, canLock: preview.canLock, locked: preview.locked, missed: preview.missed, rolls };
};

// `take Leftovers → Garchomp · buy Super Potion · reroll $500 → …`, for the watcher and the battle read.
export const rewardsSummary = m => {
  const p = m.pick >= 0 ? m.free[m.pick] : null;
  const take = p ? `take ${p.name}${p.best ? ` → ${p.best.name}${p.best.forget ? ` (forget ${p.best.forget})` : ""}` : p.holder ? ` → ${p.holder.name}` : ""}` : null;
  const buys = m.buys.length ? `buy ${m.buys.map(x => x.name).join(", ")}` : null;
  return [take, buys, rerollSummary(m)].filter(Boolean).join(" · ") || null;
};
