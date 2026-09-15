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
    return m;
  };
  const stage = s => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
  // i: 1 atk, 2 def, 3 spa, 4 spd, 5 spe. statStages has no HP slot.
  const stat = (p, i) => p.getStat(i) * stage(p.summonData?.statStages?.[i - 1] ?? 0);

  // Rough damage of attacker's best usable damaging move into defender.
  const bestMove = (a, d) => {
    let best = null;
    for (const m of a.moveset.filter(Boolean)) {
      const mv = m.getMove();
      if (mv.category === 2 || !(mv.power > 0) || m.getMovePp() - m.ppUsed <= 0) continue;
      const type = TYPES[mv.type];
      const phys = mv.category === 0;
      const base = ((2 * a.level / 5 + 2) * mv.power * stat(a, phys ? 1 : 3) / stat(d, phys ? 2 : 4)) / 50 + 2;
      const e = effectiveness(type, d);
      const dmg = base * (typesOf(a).includes(type) ? 1.5 : 1) * e;
      if (!best || dmg > best.dmg) best = { name: m.getName(), type, cat: phys ? "physical" : "special", e, dmg };
    }
    return best;
  };

  // Positive score = we KO it in fewer turns than it KOs us.
  const matchup = (me, foe) => {
    const mine = bestMove(me, foe);
    const theirs = bestMove(foe, me);
    const myTurns = mine?.dmg > 0 ? Math.min(9, Math.ceil(foe.hp / mine.dmg)) : 9;
    const theirTurns = theirs?.dmg > 0 ? Math.min(9, Math.ceil(me.hp / theirs.dmg)) : 9;
    const faster = stat(me, 5) >= stat(foe, 5);
    return { me, mine, myTurns, score: theirTurns - myTurns + (faster ? 0.5 : -0.5) };
  };

  const TRAPS = new Set([...Object.keys(ABILITY_IMMUNE), "Wonder Guard", "Thick Fat", "Sturdy", "Intimidate", "Guts", "Fluffy", "Simple"]);
  const STATUS_FRAMES = [null, "poison", "toxic", "paralysis", "sleep", "freeze", "burn"];
  const iconOf = p => { try { return [p.getIconAtlasKey(), String(p.getIconId())]; } catch { return null; } };

  // Plain data for one refresh. Its JSON is the change signature, so the DOM is
  // only rebuilt when something the panel shows has actually changed.
  const model = (b, party, foes) => {
    const used = new Set();
    const picks = foes.map(foe => {
      const ranked = party.map(me => matchup(me, foe))
        .map(m => ({ ...m, rank: m.score - (used.has(m.me) ? 1 : 0) }))
        .sort((x, y) => y.rank - x.rank);
      const pick = ranked[0];
      if (pick) used.add(pick.me);
      return pick;
    });

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
      const p = picks[i];
      return {
        icon: iconOf(foe), name: foe.name, lv: foe.level, types: typesOf(foe),
        abilities: abilitiesOf(foe), boss: !!foe.isBoss?.(), status: foe.status?.effect ?? 0,
        hp: Math.round(foe.hp / foe.getMaxHp() * 100),
        weak, avoid,
        pick: p?.mine ? {
          icon: iconOf(p.me), name: p.me.name, move: p.mine.name, type: p.mine.type, cat: p.mine.cat,
          pct: Math.min(100, Math.round(p.mine.dmg / foe.getMaxHp() * 100)),
          ko: p.myTurns <= 3 ? p.myTurns : 0, risky: p.score < 0,
        } : null,
      };
    });

    return {
      kind: "battle",
      title: `W${b.waveIndex}${b.trainer ? ` · ${b.trainer.getName()}` : ""}`,
      order: [...new Set(picks.filter(Boolean).map(p => p.me))].map(me => ({ icon: iconOf(me), name: me.name })),
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

  const SPREAD_TARGETS = [2, 4, 6, 8]; // MoveTarget ALL_OTHERS, ALL_NEAR_OTHERS, ALL_NEAR_ENEMIES, ALL_ENEMIES
  const hasAttr = (mv, name) => (mv.attrs || []).some(a => a.constructor.name === name);

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
    if (mv.isChargingMove?.()) { value *= 0.5; notes.push("charges"); }
    if (hasAttr(mv, "RechargeAttr")) { value *= 0.5; notes.push("recharge"); }
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
    n.append(...kids.filter(k => k != null && k !== ""));
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

    if (view === "mini") {
      const rows = m.rows.map(r => h("div", { display: "flex", alignItems: "center", gap: "2px" },
        mon(r.icon, r.name, 22),
        h("span", { color: hpColor(r.hp), width: "30px" }, `${r.hp}%`),
        ...r.weak.slice(0, 3).map(([t, s]) => badge(t, s)),
        h("span", { flex: "1" }),
        r.pick ? h("span", { display: "flex", alignItems: "center" },
          h("span", { color: "#8cf" }, "➜"), mon(r.pick.icon, r.pick.name, 20), badge(r.pick.type),
          r.pick.risky ? h("span", { color: "#fa4" }, "⚠") : null) : null));
      return [header, ...rows];
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
      r.pick
        ? line("➜", "#8cf",
            mon(r.pick.icon, r.pick.name, 22),
            img("categories", r.pick.cat, r.pick.cat, 12, null),
            badge(r.pick.type),
            h("span", { fontWeight: "bold" }, r.pick.move),
            h("span", { ...dim, marginLeft: "4px" }, `~${r.pick.pct}%${r.pick.ko ? ` · ${r.pick.ko}HKO` : ""}`),
            r.pick.risky ? h("span", { color: "#fa4" }, " ⚠ loses trade") : null)
        : line("➜", "#8cf", h("span", dim, "no damaging move lands"))));
    return [header, team, ...rows].filter(Boolean);
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
        m = model(b, party, foes);
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
