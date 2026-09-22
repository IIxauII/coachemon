// Battle card (the 60-card battle model): the ⚔ line per field slot, the switches, the catch section, the foe rows
// and the fight plan.
import { STATUS_FRAMES } from "./01-core.js";
import { deadEndText, hitsText } from "./60-card.js";
import { FS, badge, bar, closed, dim, h, hpColor, img, line, mon, tab } from "./90-render.js";
import { drawAhead } from "./95-render-ahead.js";
import { drawCatch } from "./95-render-catch.js";
import { drawPreview } from "./95-render-preview.js";
import { drawTeamPlan } from "./95-render-team.js";

export const drawBattle = m => {
  // The exact enemy move couldn't be made (#183): the card says so and shows nothing else. The next refresh tries
  // again, so a one-off breach flickers rather than sticking.
  if (m.unavailable) {
    if (closed()) return [tab("\u26a0", null)];
    return [bar("\ud83c\udfaf", m.title), line("\u26a0", "#fa4", h("span", { color: "#fa4" }, `no advice — ${m.unavailable}`))];
  }
  if (closed()) return [tab("🎯", m.order[0] ? mon(m.order[0].icon, m.order[0].name, 20) : null)];
  const f = m.field;

  // Send-in icons only add something when they go beyond the ⚔ mons: a trainer's later foes.
  const slotNames = new Set(f?.slots.map(sl => sl.name) ?? []);
  const order = m.trainer || m.order.some(o => !slotNames.has(o.name)) ? m.order : [];
  const header = bar("🎯", m.title,
    ...order.flatMap((o, i) => [i ? h("span", dim, "›") : null, mon(o.icon, o.name, 20)]));

  const threatTag = t => {
    const n = h("span", { display: "inline-flex", alignItems: "center", marginRight: "4px", color: t.level === "ko" ? "#e55" : "#fa4" },
      t.level === "ko" ? "💀" : "⚠", badge(t.type, t.e >= 2 ? `×${t.e}` : ""),
      h("span", { fontSize: FS.tiny, marginLeft: "1px" }, `${t.pct}%${t.hits ? ` ${t.hits}-hit` : ""}`));
    n.title = `${t.next ? "next turn: " : ""}${t.from}'s ${t.move}: ~${t.pct}% of current HP`
      + `${t.pko > 0 && t.pko < 100 ? `, ${t.pko}% KO` : ""}${t.level === "ko" ? ", before it can act" : ""}`;
    return n;
  };
  // A switch uses the turn: with one, the plan reads as steps — `now:` the switch (and any slot that still
  // attacks this turn), `next:` the switch-in's move.
  const step = (label, icon, color, ...kids) => h("div", { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "1px" },
    label ? h("span", { ...dim, width: "30px", flex: "none" }, label) : null,
    h("span", { color, width: "14px", flex: "none" }, icon), ...kids);
  // A paid switch-in also says what coming in costs it, and why that's cheap: "takes ~6% · resists Lunge".
  const takesText = x => (x ? `takes ~${x.pct}%${x.e === 0 ? ` · immune to ${x.move}` : x.e != null && x.e < 1 ? ` · resists ${x.move}` : x.e > 1 ? ` · weak to ${x.move}` : ""}` : null);
  const swapLine = (sw, color, tail, label) => step(label, "⇄", color,
    ...(sw.out ? [mon(sw.out.icon, sw.out.name, 20), sw.out.threat ? threatTag(sw.out.threat) : null, h("span", { color, margin: "0 3px" }, "out ›")] : [h("span", { color, marginRight: "3px" }, "send")]),
    mon(sw.in.icon, sw.in.name, 20), h("span", { color, marginLeft: "3px" }, tail),
    sw.in.takes ? h("span", { ...dim, fontSize: FS.tiny, marginLeft: "4px" }, `· ${takesText(sw.in.takes)}`) : null);
  // ⚔ what each field slot should do; ⇄ the switches to get there (dim: better, but not worth a turn). The trap
  // abilities the move runs into are on the foe rows below, not here.
  const slotLine = (sl, label) => step(label, "⚔", "#8cf",
    mon(sl.icon, sl.name, 22),
    sl.threat ? threatTag(sl.threat) : null,
    ...(sl.move ? [badge(sl.type), h("span", { fontWeight: "bold" }, sl.move)] : [h("span", dim, deadEndText(sl))]),
    ...(sl.target === "both" ? [h("span", { color: "#8cf", marginLeft: "4px" }, "→ both")]
      : sl.target ? [h("span", { color: "#8cf", margin: "0 2px 0 4px" }, "→"), mon(sl.target.icon, sl.target.name, 20)] : []),
    h("span", { flex: "1" }),
    sl.ko ? h("span", dim, hitsText(sl.ko)) : null,
    sl.notes?.length ? h("span", { ...dim, fontSize: FS.tiny, marginLeft: "4px" }, sl.notes.join(" · ")) : null);
  const firstText = p => (p >= 100 ? "moves first" : p <= 0 ? "moves after" : `${p}% first`);
  const slotMove = sl => [
    mon(sl.icon, sl.name, 20),
    ...(sl.move ? [badge(sl.type), h("span", { marginRight: "2px" }, sl.move)] : [h("span", dim, "—")]),
    ...(sl.target === "both" ? [h("span", dim, "→ both")] : sl.target ? [h("span", dim, "→"), mon(sl.target.icon, sl.target.name, 18)] : []),
  ];
  // `back`: the switch-in is the mon the other slot is withdrawing this same turn, walking straight back in on this
  // one (#285). Named as a return, because the usual tail rendered while the player watches it leave reads as a bug.
  const enemySwitches = m.enemySwitches.map(es => line("⇆", "#c9f",
    mon(es.from.icon, es.from.name, 20), h("span", { color: "#c9f", margin: "0 3px" }, "→"),
    mon(es.to.icon, es.to.name, 20), h("span", { color: "#c9f", marginLeft: "3px" },
      es.back ? "returns from the other slot — moves aimed at it" : "switches — moves aimed at it")));
  const ifStay = m.ifStay
    ? line("↺", "#9aa", h("span", { ...dim, marginRight: "4px" }, "if it stays:"), ...m.ifStay.flatMap((sl, i) => [i ? h("span", dim, " · ") : null, ...slotMove(sl)]))
    : null;
  const noSafeSwitch = () => {
    const n = line("⇄", "#e55", h("span", { color: "#e55" }, "no safe switch"));
    n.title = "every bench mon is KO'd coming in or before it acts";
    return n;
  };
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
    // The mon on the field is going down this turn, so the next one comes in without paying for a switch (#170 §E):
    // the fight plan's own step 2, named here so the turn line reads as "stay, and this is what follows".
    f.freeEntry ? line("⤵", "#6d6", mon(f.freeEntry.out.icon, f.freeEntry.out.name, 20),
      h("span", { ...dim, margin: "0 3px" }, "falls this turn ›"), mon(f.freeEntry.in.icon, f.freeEntry.in.name, 20),
      h("span", { color: "#6d6", marginLeft: "3px" }, "in free")) : null,
    // After our KO the trainer sends the best matchup against what we leave out, so the next foe is predictable and
    // the plan already has an answer in front of it (#170 §G).
    f.nextIn ? line("↪", "#c9f", h("span", { ...dim, marginRight: "3px" }, "next in likely:"),
      mon(f.nextIn.foe.icon, f.nextIn.foe.name, 20), h("span", { color: "#c9f", margin: "0 3px" }, "› answer"),
      mon(f.nextIn.answer.icon, f.nextIn.answer.name, 20)) : null,
    // Doubles: both slots on one foe says why. A split needs no line: the ⚔ targets already show it.
    f.targeting?.kind === "focus" ? line("◎", "#8cf", h("span", { color: "#8cf", marginRight: "3px" }, "focus"), mon(f.targeting.target.icon, f.targeting.target.name, 18),
      h("span", dim, `: ${f.targeting.note}${f.targeting.pko > 0 && f.targeting.pko < 100 ? ` (${f.targeting.pko}%)` : ""}`)) : null,
    ...f.optional.map(sw => swapLine(sw, "#9aa", "in · optional")),
    f.noSafeSwitch ? noSafeSwitch() : null,
    ifStay,
  ];

  // Only types the party has a damaging move of: a weakness nobody can hit is noise.
  const usable = ([t]) => !m.moveTypes || m.moveTypes.includes(t);
  const teamWeak = m.team.filter(usable);
  const team = m.trainer && m.rows.length > 1 && teamWeak.length
    ? line("", "#e77", h("span", { color: "#e77", marginRight: "4px" }, "foes weak to:"), ...teamWeak.map(([t, n]) => badge(t, `×${n}`)))
    : null;
  const rows = m.rows.map(r => {
    // `r.traps`: only the abilities the planner found biting one of our own options, not every ability the foe has.
    const weak = r.weak.filter(usable), avoid = r.avoid.filter(usable);
    return h("div", { marginTop: "5px", paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,.12)" },
      h("div", { display: "flex", alignItems: "center", gap: "3px" },
        mon(r.icon, r.name, 28),
        h("span", { fontWeight: "bold" }, r.name),
        h("span", dim, `L${r.lv}`),
        ...r.types.map(t => badge(t)),
        // It Terastallizes before it moves this turn, so the types, weaknesses and damage above are already its
        // Tera type's.
        r.tera ? h("span", { color: "#c9f", fontSize: "9px", marginRight: "3px" }, "TERA") : null,
        r.boss ? "👑" : null,
        STATUS_FRAMES[r.status] ? img("statuses", STATUS_FRAMES[r.status], STATUS_FRAMES[r.status], 10, null) : null,
        h("span", { flex: "1" }),
        h("span", { color: hpColor(r.hp) }, `${r.hp}%`)),
      r.traps.length ? line("✦", "#fa4", ...r.traps.map(a => h("span", { color: "#fa4", marginRight: "6px" }, `⚠ ${a}`))) : null,
      line("▲", "#6d6", ...(weak.length ? weak.map(([t, x]) => badge(t, x)) : [h("span", dim, "—")])),
      avoid.length ? line("✕", "#e55", ...avoid.map(([t, x]) => badge(t, x))) : null,
      // The enemy's likely move into the pokémon we put in front of it: its damage (% of that mon's HP) once the
      // model carries it, otherwise how likely the AI is to pick it.
      r.likely ? line("↯", "#e77",
        badge(r.likely.type), h("span", { color: "#e77" }, r.likely.move),
        ...(r.likely.at ? r.likely.at.flatMap(x => [h("span", { ...dim, margin: "0 2px 0 3px" }, "\u2192"), mon(x.icon, x.name, 18)])
          : r.pick ? [h("span", { ...dim, margin: "0 2px 0 3px" }, "\u2192"), mon(r.pick.icon, r.pick.name, 18)] : []),
        h("span", { ...dim, marginLeft: "4px" }, [
          r.likely.pct != null ? `~${r.likely.pct}% HP` : r.likely.p != null ? `${r.likely.p}% likely` : null,
          r.likely.hits ? `${r.likely.hits}-hit` : null, firstText(r.likely.first),
          // `~`: right only while the game's own draws for this turn are the draws the coach made (a random-target
          // command of ours in a double). An exact move carries no mark — no `% likely` is the mark.
          r.likely.confidence === "replay" ? "~" : null].filter(Boolean).join(" · "))) : null,
      // A foe on the field already has its ⚔ line; the pick is only news for one no slot is on yet.
      r.pick?.later
        ? line("➜", "#8cf",
            mon(r.pick.icon, r.pick.name, 22),
            img("categories", r.pick.cat, r.pick.cat, 12, null),
            badge(r.pick.type),
            h("span", { fontWeight: "bold" }, r.pick.move),
            h("span", { ...dim, marginLeft: "4px" }, `~${r.pick.pct}%${r.pick.ko ? ` · ${hitsText(r.pick.ko)}` : ""}`),
            r.pick.risky ? h("span", { color: "#fa4" }, " ⚠ loses trade") : null,
            h("span", { color: "#9aa", fontSize: FS.tiny, marginLeft: "4px" }, "later"),
            r.pick.notes?.length ? h("span", { color: "#9aa", fontSize: FS.tiny, marginLeft: "4px" }, r.pick.notes.join(" · ")) : null)
        : !r.pick && !f ? line("➜", "#8cf", h("span", dim, "no damaging move lands")) : null,
      r.notes?.length ? line("·", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, r.notes.join(" · "))) : null);
  });
  return [header, ...field, ...drawCatch(m), team, ...rows, ...drawTeamPlan(m), ...drawPreview(m.preview),
    ...drawAhead(m.ahead)].filter(Boolean);
};
