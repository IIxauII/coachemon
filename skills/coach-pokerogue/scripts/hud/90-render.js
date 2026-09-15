// Panel DOM, views, drawing and the refresh loop.
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
      t.level === "ko" ? "💀" : "⚠", badge(t.type, t.e >= 2 ? `×${t.e}` : ""),
      t.hits ? h("span", { fontSize: "9px", marginLeft: "1px" }, `${t.hits} hits`) : null);
    n.title = `${t.next ? "next turn: " : ""}${t.from}'s ${t.move}: ~${t.pct}% of current HP`
      + `${t.pko > 0 && t.pko < 100 ? `, ${t.pko}% KO` : ""}${t.level === "ko" ? ", before it can act" : ""}`;
    return n;
  };
  // A switch uses the turn: with one, the plan reads as steps — `now:` the switch (and any slot that still
  // attacks this turn), `next:` the switch-in's move.
  const step = (label, icon, color, ...kids) => h("div", { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "1px" },
    label ? h("span", { ...dim, width: "30px", flex: "none" }, label) : null,
    h("span", { color, width: "14px", flex: "none" }, icon), ...kids);
  const swapLine = (sw, color, tail, label) => step(label, "⇄", color,
    ...(sw.out ? [mon(sw.out.icon, sw.out.name, 20), sw.out.threat ? threatTag(sw.out.threat) : null, h("span", { color, margin: "0 3px" }, "out ›")] : [h("span", { color, marginRight: "3px" }, "send")]),
    mon(sw.in.icon, sw.in.name, 20), h("span", { color, marginLeft: "3px" }, tail));
  // ⚔ what each field slot should do; ⇄ the switches to get there (dim: better, but not worth a turn).
  const f = m.field;
  const slotLine = (sl, label) => step(label, "⚔", "#8cf",
    mon(sl.icon, sl.name, 22),
    sl.threat ? threatTag(sl.threat) : null,
    ...(sl.move ? [badge(sl.type), h("span", { fontWeight: "bold" }, sl.move)] : [h("span", dim, "no damaging move")]),
    ...(sl.target === "both" ? [h("span", { color: "#8cf", marginLeft: "4px" }, "→ both")]
      : sl.target ? [h("span", { color: "#8cf", margin: "0 2px 0 4px" }, "→"), mon(sl.target.icon, sl.target.name, 20)] : []),
    h("span", { flex: "1" }),
    sl.ko ? h("span", dim, `${sl.ko}HKO`) : null,
    sl.notes?.length ? h("span", { ...dim, fontSize: "9px", marginLeft: "4px" }, sl.notes.join(" · ")) : null);
  const firstText = p => (p >= 100 ? "moves first" : p <= 0 ? "moves after" : `${p}% first`);
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
  const split = !!f?.slots.some(sl => sl.enter);
  const field = !f ? [...enemySwitches] : [
    ...enemySwitches,
    // The game is asking whether to switch before the turn: the answer first, then the coming turn's plan.
    ...(f.freeSwitch
      ? [...(f.switches.length
          ? f.switches.map(sw => line("⇄", "#6d6", h("span", { color: "#6d6", marginRight: "3px" }, "free switch?"),
              ...(sw.out ? [mon(sw.out.icon, sw.out.name, 20), h("span", { color: "#6d6", margin: "0 3px" }, "→")] : []),
              mon(sw.in.icon, sw.in.name, 20), h("span", { ...dim, marginLeft: "3px" }, "(no hit taken)")))
          : [line("⇄", "#6d6", h("span", { color: "#6d6", marginRight: "3px" }, "free switch? stay —"),
              h("span", dim, `${f.slots.map(sl => sl.name).join(" & ")} ${f.slots.length > 1 ? "are" : "is"} best here`))]),
        ...f.slots.map(sl => slotLine(sl))]
      : split
      ? [...f.switches.map(sw => swapLine(sw, "#fa4", "in", "now:")),
        ...f.slots.filter(sl => !sl.enter).map(sl => slotLine(sl, "now:")),
        ...f.slots.filter(sl => sl.enter).map(sl => slotLine(sl, "next:"))]
      : [...f.slots.map(sl => slotLine(sl)), ...f.switches.map(sw => swapLine(sw, "#fa4", "in"))]),
    // Doubles: both slots on one foe, or split for a reason worth saying.
    f.targeting?.kind === "focus" ? line("◎", "#8cf", h("span", { color: "#8cf", marginRight: "3px" }, "focus"), mon(f.targeting.target.icon, f.targeting.target.name, 18),
      h("span", dim, `: ${f.targeting.note}${f.targeting.pko > 0 && f.targeting.pko < 100 ? ` (${f.targeting.pko}%)` : ""}`)) : null,
    f.targeting?.kind === "split" ? line("⋔", "#8cf", h("span", dim, `split: ${f.targeting.note}`)) : null,
    ...(view === "full" ? f.optional.map(sw => swapLine(sw, "#9aa", "in · optional")) : []),
    f.noSafeSwitch ? line("⇄", "#e55", h("span", { color: "#e55" }, "no safe switch-in — every bench mon is KO'd coming in or before it acts")) : null,
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
    return [header, ...field, ...drawCatch(m), ...rows].filter(Boolean);
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
    // The enemy's likely move into the pokémon we put in front of it.
    r.likely ? line("↯", "#e77",
      badge(r.likely.type), h("span", { color: "#e77" }, r.likely.move),
      h("span", { ...dim, marginLeft: "4px" }, [r.likely.p != null ? `~${r.likely.p}%` : null, r.likely.hits ? `${r.likely.hits} hits` : null, firstText(r.likely.first)].filter(Boolean).join(" · "))) : null,
    r.pick
      ? line("➜", "#8cf",
          mon(r.pick.icon, r.pick.name, 22),
          img("categories", r.pick.cat, r.pick.cat, 12, null),
          badge(r.pick.type),
          h("span", { fontWeight: "bold" }, r.pick.move),
          h("span", { ...dim, marginLeft: "4px" }, `~${r.pick.pct}%${r.pick.ko ? ` · ${r.pick.ko}HKO` : ""}`),
          r.pick.risky ? h("span", { color: "#fa4" }, " ⚠ loses trade") : null,
          r.pick.later ? h("span", { color: "#9aa", fontSize: "9px", marginLeft: "4px" }, "later") : null,
          r.pick.notes?.length ? h("span", { color: "#9aa", fontSize: "9px", marginLeft: "4px" }, r.pick.notes.join(" · ")) : null,
          r.pick.vs ? [h("span", { color: "#c9f", fontSize: "9px", margin: "0 2px 0 4px" }, "into"), mon(r.pick.vs.icon, r.pick.vs.name, 18)] : null)
      : line("➜", "#8cf", h("span", dim, "no damaging move lands"))));
  return [header, ...field, ...drawCatch(m), team, ...rows, ...drawTeamPlan(m)].filter(Boolean);
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
    // Mid-reload or on the title screen: nothing to coach, and the scene isn't wired up yet.
    if (!s?.ui) { el.style.display = "none"; return; }
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
