import { STATUS_FRAMES } from "./01-core.js";
import { catchSummary } from "./45-catch.js";
import { actSummary, deadEndText, foesSummary, hitsText, planSummary, roadSummary } from "./60-card.js";
import { badge, caption, dim, group, gutterMark, h, hpBar, ICON, img, IMMUNE, ink, line, mon, ROW, rung, some } from "./90-render.js";
import { drawAhead } from "./95-render-ahead.js";
import { drawCatch } from "./95-render-catch.js";
import { drawPreview } from "./95-render-preview.js";
import { drawTeamPlan } from "./95-render-team.js";

export const captionBattle = m => {
  const slotNames = new Set(m.field?.slots.map(sl => sl.name) ?? []);
  const order = m.trainer || (m.order ?? []).some(o => !slotNames.has(o.name)) ? m.order ?? [] : [];
  return caption("🎯", m.title,
    ...order.flatMap((o, i) => [i ? h("span", dim, "›") : null, mon(o.icon, o.name, ICON.mon)]));
};

export const drawBattle = m => {
  if (m.unavailable) return [group("act", "Now", actSummary(m), [])];
  const f = m.field;

  const threatTag = t => {
    const n = h("span", { display: "inline-flex", alignItems: "center", marginRight: "4px", ...ink.theirs },
      t.level === "ko" ? "💀" : "⚠", badge(t.type, t.e >= 2 ? `×${t.e}` : "", true),
      h("span", { marginLeft: "1px" }, `${t.pct}%${t.hits ? ` ${t.hits}-hit` : ""}`));
    n.title = `${t.next ? "next turn: " : ""}${t.from}'s ${t.move}: ~${t.pct}% of current HP`
      + `${t.pko > 0 && t.pko < 100 ? `, ${t.pko}% KO` : ""}${t.level === "ko" ? ", before it can act" : ""}`;
    return n;
  };
  const step = (label, mark, ...kids) => h("div", ROW,
    label ? h("span", { ...dim, width: rung(3.75), flex: "none" }, label) : null,
    gutterMark(mark), ...kids);
  const takesText = x => (x ? `takes ~${x.pct}%${x.e === 0 ? ` · immune to ${x.move}` : x.e != null && x.e < 1 ? ` · resists ${x.move}` : x.e > 1 ? ` · weak to ${x.move}` : ""}` : null);
  const swapLine = (sw, style, tail, label) => step(label, "⇄",
    ...(sw.out ? [mon(sw.out.icon, sw.out.name, ICON.mon), sw.out.threat ? threatTag(sw.out.threat) : null, h("span", { ...style, margin: "0 3px" }, "out ›")] : [h("span", { ...style, marginRight: "3px" }, "send")]),
    mon(sw.in.icon, sw.in.name, ICON.mon), h("span", { ...style, marginLeft: "3px" }, tail),
    sw.in.takes ? h("span", { ...dim, marginLeft: "4px" }, `· ${takesText(sw.in.takes)}`) : null);
  const slotLine = (sl, label) => step(label, "⚔",
    mon(sl.icon, sl.name, ICON.mon),
    sl.threat ? threatTag(sl.threat) : null,
    ...(sl.move ? [badge(sl.type), h("span", { fontWeight: "bold" }, sl.move)] : [h("span", dim, deadEndText(sl))]),
    ...(sl.target === "both" ? [h("span", { ...ink.ours, marginLeft: "4px" }, "→ both")]
      : sl.target ? [h("span", { ...ink.ours, margin: "0 2px 0 4px" }, "→"), mon(sl.target.icon, sl.target.name, ICON.mon)] : []),
    h("span", { flex: "1" }),
    sl.ko ? h("span", dim, hitsText(sl.ko)) : null,
    sl.notes?.length ? h("span", { ...dim, marginLeft: "4px" }, sl.notes.join(" · ")) : null);
  const firstText = p => (p >= 100 ? "moves first" : p <= 0 ? "moves after" : `${p}% first`);
  const slotMove = sl => [
    mon(sl.icon, sl.name, ICON.mon),
    ...(sl.move ? [badge(sl.type), h("span", { marginRight: "2px" }, sl.move)] : [h("span", dim, "—")]),
    ...(sl.target === "both" ? [h("span", dim, "→ both")] : sl.target ? [h("span", dim, "→"), mon(sl.target.icon, sl.target.name, ICON.ref)] : []),
  ];
  const enemySwitches = m.enemySwitches.map(es => line("⇄",
    mon(es.from.icon, es.from.name, ICON.mon), h("span", { ...ink.theirs, margin: "0 3px" }, "→"),
    mon(es.to.icon, es.to.name, ICON.mon), h("span", { ...ink.theirs, marginLeft: "3px" },
      es.back ? "returns from the other slot — moves aimed at it" : "switches — moves aimed at it")));
  const ifStay = m.ifStay
    ? line("↺", h("span", { ...dim, marginRight: "4px" }, "if it stays:"), ...m.ifStay.flatMap((sl, i) => [i ? h("span", dim, " · ") : null, ...slotMove(sl)]))
    : null;
  const noSafeSwitch = () => {
    const n = line("⇄", h("span", ink.ours, "no safe switch"));
    n.title = "every bench mon is KO'd coming in or before it acts";
    return n;
  };
  const split = !!f?.slots.some(sl => sl.enter);
  const field = !f ? [...enemySwitches] : [
    ...enemySwitches,
    ...(f.freeSwitch
      ? [...(f.switches.length
          ? f.switches.map(sw => line("⇄", h("span", { ...ink.ours, marginRight: "3px" }, "free switch?"),
              ...(sw.out ? [mon(sw.out.icon, sw.out.name, ICON.mon), h("span", { ...ink.ours, margin: "0 3px" }, "→")] : []),
              mon(sw.in.icon, sw.in.name, ICON.mon), h("span", { ...dim, marginLeft: "3px" }, "(no hit taken)")))
          : [line("⇄", h("span", { ...ink.ours, marginRight: "3px" }, "free switch? stay —"),
              h("span", dim, `${f.slots.map(sl => sl.name).join(" & ")} ${f.slots.length > 1 ? "are" : "is"} best here`))]),
        ...f.slots.map(sl => slotLine(sl))]
      : split
      ? [...f.switches.map(sw => swapLine(sw, ink.ours, "in", "now:")),
        ...f.slots.filter(sl => !sl.enter).map(sl => slotLine(sl, "now:")),
        ...f.slots.filter(sl => sl.enter).map(sl => slotLine(sl, "next:"))]
      : [...f.slots.map(sl => slotLine(sl)), ...f.switches.map(sw => swapLine(sw, ink.ours, "in"))]),
    f.freeEntry ? line("⤵", mon(f.freeEntry.out.icon, f.freeEntry.out.name, ICON.mon),
      h("span", { ...dim, margin: "0 3px" }, "falls this turn ›"), mon(f.freeEntry.in.icon, f.freeEntry.in.name, ICON.mon),
      h("span", { ...ink.ours, marginLeft: "3px" }, "in free")) : null,
    f.nextIn ? line("⤵", h("span", { ...dim, marginRight: "3px" }, "next in likely:"),
      mon(f.nextIn.foe.icon, f.nextIn.foe.name, ICON.mon), h("span", { ...ink.later, margin: "0 3px" }, "› answer"),
      mon(f.nextIn.answer.icon, f.nextIn.answer.name, ICON.mon)) : null,
    f.targeting?.kind === "focus" ? line("·", h("span", { ...ink.ours, marginRight: "3px" }, "focus"), mon(f.targeting.target.icon, f.targeting.target.name, ICON.ref),
      h("span", dim, `: ${f.targeting.note}${f.targeting.pko > 0 && f.targeting.pko < 100 ? ` (${f.targeting.pko}%)` : ""}`)) : null,
    ...f.optional.map(sw => swapLine(sw, dim, "in · optional")),
    f.noSafeSwitch ? noSafeSwitch() : null,
    ifStay,
  ];

  const usable = ([t]) => !m.moveTypes || m.moveTypes.includes(t);
  const teamWeak = m.team.filter(usable);
  const team = m.trainer && m.rows.length > 1 && teamWeak.length
    // `×n` counts foes weak to the type, not an effectiveness, so the badge is not told `eff`.
    ? line("", h("span", { ...ink.theirs, marginRight: "4px" }, "foes weak to:"), ...teamWeak.map(([t, n]) => badge(t, `×${n}`)))
    : null;
  const rows = m.rows.map(r => {
    const weak = r.weak.filter(usable), avoid = r.avoid.filter(usable);
    return h("div", { marginTop: "5px", paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,.12)" },
      h("div", { display: "flex", alignItems: "center", gap: "3px" },
        mon(r.icon, r.name, ICON.big),
        h("span", { fontWeight: "bold" }, r.name),
        h("span", dim, `L${r.lv}`),
        ...r.types.map(t => badge(t)),
        r.tera ? h("span", { ...ink.theirs, marginRight: "3px" }, "TERA") : null,
        r.boss ? "👑" : null,
        STATUS_FRAMES[r.status] ? img("statuses", STATUS_FRAMES[r.status], STATUS_FRAMES[r.status], ICON.mark, null) : null,
        h("span", { flex: "1" }),
        hpBar(r.hp)),
      r.traps.length ? line("✦", ...r.traps.map(a => h("span", { ...ink.theirs, marginRight: "6px" }, a))) : null,
      line("▲", ...(weak.length ? weak.map(([t, x]) => badge(t, x, true)) : [h("span", dim, "—")])),
      avoid.length ? line(avoid.every(([, x]) => x === "×0") ? IMMUNE : "▼", ...avoid.map(([t, x]) => badge(t, x, true))) : null,
      r.likely ? line("↯",
        badge(r.likely.type), h("span", ink.theirs, r.likely.move),
        ...(r.likely.at ? r.likely.at.flatMap(x => [h("span", { ...dim, margin: "0 2px 0 3px" }, "\u2192"), mon(x.icon, x.name, ICON.ref)])
          : r.pick ? [h("span", { ...dim, margin: "0 2px 0 3px" }, "\u2192"), mon(r.pick.icon, r.pick.name, ICON.ref)] : []),
        h("span", { ...dim, marginLeft: "4px" }, [
          r.likely.pct != null ? `~${r.likely.pct}% HP` : r.likely.p != null ? `${r.likely.p}% likely` : null,
          r.likely.hits ? `${r.likely.hits}-hit` : null, firstText(r.likely.first),
          r.likely.confidence === "replay" ? "~" : null].filter(Boolean).join(" · "))) : null,
      r.pick?.later
        ? line("➜",
            mon(r.pick.icon, r.pick.name, ICON.mon),
            img("categories", r.pick.cat, r.pick.cat, ICON.mark, null),
            badge(r.pick.type),
            h("span", { fontWeight: "bold" }, r.pick.move),
            h("span", { ...dim, marginLeft: "4px" }, `~${r.pick.pct}%${r.pick.ko ? ` · ${hitsText(r.pick.ko)}` : ""}`),
            r.pick.risky ? h("span", ink.later, " ⚠ loses trade") : null,
            h("span", { ...ink.later, marginLeft: "4px" }, "later"),
            r.pick.notes?.length ? h("span", { ...dim, marginLeft: "4px" }, r.pick.notes.join(" · ")) : null)
        : !r.pick && !f ? line("➜", h("span", dim, "no damaging move lands")) : null,
      r.notes?.length ? line("·", h("span", dim, r.notes.join(" · "))) : null);
  });
  // The same rows as 96-render-rewards' road, which a file on this layer can't import: change both.
  const road = [...drawPreview(m.preview), ...drawAhead(m.ahead)];
  return [
    some("act", "Now", actSummary(m), field),
    some("foes", "Foes", foesSummary(m), [team, ...rows]),
    some("catch", "Catch", catchSummary(m.catch), drawCatch(m)),
    some("plan", "Plan", planSummary(m.teamPlan), drawTeamPlan(m)),
    some("road", "Road", roadSummary(m.preview, m.ahead), road),
  ].filter(Boolean);
};
