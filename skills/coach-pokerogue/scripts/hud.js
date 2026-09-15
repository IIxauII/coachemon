// Runs in the PokéRogue page world. Draws a small always-on coach panel over the
// game: what each live foe is weak to / resists, which party member to send
// against it and with which move. Read-only: presses nothing, writes nothing to
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
      title: `W${b.waveIndex}${b.trainer ? ` · ${b.trainer.getName()}` : ""}`,
      order: [...new Set(picks.filter(Boolean).map(p => p.me))].map(me => ({ icon: iconOf(me), name: me.name })),
      team: Object.entries(teamWeak).sort((x, y) => y[1] - x[1]).slice(0, 4),
      rows,
    };
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

  const draw = m => {
    if (view === "closed") {
      const tab = h("span", { cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" },
        "🎯", m.order[0] ? mon(m.order[0].icon, m.order[0].name, 20) : null);
      tab.title = "Open coach";
      tab.addEventListener("click", e => { e.stopPropagation(); setView("mini"); });
      return [tab];
    }

    const header = h("div", { display: "flex", alignItems: "center", gap: "4px", fontWeight: "bold" },
      "🎯", m.title, h("span", { flex: "1" }),
      ...m.order.flatMap((o, i) => [i ? h("span", dim, "›") : null, mon(o.icon, o.name, 20)]),
      h("span", { width: "4px" }),
      view === "full" ? button("−", "Minimal overview", "mini") : button("+", "Expand", "full"),
      button("×", "Close", "closed"));

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
      const b = s.currentBattle;
      const foes = s.getEnemyParty().filter(p => p.hp > 0);
      const party = s.getPlayerParty().filter(p => p.hp > 0);
      if (!b || !foes.length || !party.length) { el.style.display = "none"; return; }
      const m = model(b, party, foes);
      const sig = JSON.stringify([view, m]);
      el.style.display = "block";
      el.style.width = view === "full" ? "300px" : "auto";
      if (sig !== last) {
        missed = false;
        el.replaceChildren(...draw(m));
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
