// Look-ahead card (the 49-ahead model) and its plain-text summary. Loads after 90-render: only call these from a
// draw or a summary, never at load time.
// Mini: one line — `⚑ Cynthia in 3 (W195) · 5 mons L92 · risky`. Full adds the readiness reasons, the no-heal
// stretch, what the wave's rewards are pinned to, party luck, and the Eternatus checklist before wave 200.
// The card only ever says what the calendar and the seed already decided: the schedule is arithmetic on the wave
// index, and a named trainer comes from the preview's replay, which marks its own confidence.
const AHEAD_COLOR = { ready: "#6d6", watch: "#ec4", risky: "#e55" };
const AHEAD_MARK = { ready: "✓", watch: "≈", risky: "⚠" };
const aheadIn = n => (n === 1 ? "next wave" : `in ${n}`);
// `Cynthia`, `gym leader`, `boss` — the trainer's own name when the preview could name it, else what the calendar
// says it is. A fight the preview can only half-believe carries the preview's own `~`.
const aheadWho = a => (a.next.trainer ? `${a.next.trainer}${a.next.exact ? "" : "~"}` : a.next.label);

const drawAhead = (a, viewOverride) => {
  if (!a?.next) return [];
  const v = viewOverride ?? view;
  const r = a.readiness;
  const color = r ? AHEAD_COLOR[r.verdict] : "#9aa";
  const head = h("span", { fontWeight: "bold", marginRight: "3px" }, `${aheadWho(a)} ${aheadIn(a.next.in)}`);
  const where = h("span", dim, `W${a.next.wave}`);
  if (v !== "full") {
    return [line("⚑", color, head, where,
      h("span", { flex: "1" }),
      r ? h("span", { color }, `${AHEAD_MARK[r.verdict]} ${r.verdict}`) : null)];
  }
  // A section inside the shop or battle card, not a card of its own: its own rule above it, and no view buttons.
  const out = [h("div", sep), line("⚑", color, h("span", { fontWeight: "bold", marginRight: "3px" }, "Next big fight"),
    head, where, h("span", { flex: "1" }),
    a.next.double ? h("span", { ...dim, fontSize: FS.tiny, marginRight: "3px" }, "double") : null,
    a.next.bars ? h("span", { color: "#fa4", fontSize: FS.tiny }, `👑 ${a.next.bars + 1} bars`) : null)];
  // The roster, unless the next-wave card above is already showing it: the same foes twice is noise, the readiness
  // reasons under them are not.
  if (a.next.foes?.length && a.next.in > 1) {
    out.push(line("·", "#9aa", h("span", { ...dim, fontSize: FS.tiny },
      a.next.foes.map(f => `${f.name} L${f.level}`).join(" · "))));
  }
  // What beating it pays, when the fixed-battle table pins the tiers. No roll: it is the config's own list.
  if (a.next.rewards?.tiers.length) {
    out.push(line("🎁", "#8cf", h("span", dim, `it pays ${a.next.rewards.tiers.join(" · ")}`)));
  }
  for (const n of r?.notes ?? []) {
    out.push(line(n.good ? "✓" : "✗", n.good ? "#6d6" : "#e77", h("span", {}, n.text)));
  }
  // The stretch this shop is stocking for: two big fights before the next full heal is the Elite Four, and one mon
  // topped up isn't a plan for it.
  if (a.fightsBeforeHeal >= 2 || !a.heal) {
    out.push(line("✗", "#e77", h("span", { color: "#e77" }, a.heal
      ? `${a.fightsBeforeHeal} big fights before the next full heal (W${a.heal.wave})`
      : `no full heal left — ${a.fightsBeforeHeal} big ${a.fightsBeforeHeal === 1 ? "fight" : "fights"} on what you have`)));
  } else {
    out.push(line("✚", "#6d6", h("span", dim, `full heal entering W${a.heal.wave} — HP, status, PP, revives, Tera`)));
  }
  if (a.thisWave) {
    out.push(line("🎁", "#8cf", h("span", dim, a.thisWave.tiers.length
      ? `these rewards are pinned to ${a.thisWave.tiers.join(" · ")}${a.thisWave.luckUpgrades ? "" : " — luck can't upgrade them"}`
      : "luck can't upgrade these rewards")));
  }
  out.push(line("🍀", "#9aa", h("span", { ...dim, fontSize: FS.tiny },
    `luck ${a.luck.value} (${a.luck.grade}) — ${a.luck.upgradePct}% tier upgrade per reward${a.thisWave && !a.thisWave.luckUpgrades ? ", off this wave" : ""}`)));
  for (const f of a.eternatus?.facts ?? []) {
    out.push(line(f.good ? "✓" : "☠", f.good ? "#6d6" : "#c9f", h("span", { fontSize: FS.tiny }, f.text)));
  }
  return out;
};

// `Cynthia in 3 (W195) risky — nothing hits Garchomp super-effectively; 2 big fights before the next full heal`.
const aheadSummary = a => {
  if (!a?.next) return null;
  const reasons = [...(a.readiness?.notes ?? []).filter(n => !n.good).map(n => n.text),
    !a.heal ? `no full heal left before the final wave`
      : a.fightsBeforeHeal >= 2 ? `${a.fightsBeforeHeal} big fights before the next full heal` : null].filter(Boolean);
  return `${aheadWho(a)} ${aheadIn(a.next.in)} (W${a.next.wave})${a.readiness ? ` ${a.readiness.verdict}` : ""}`
    + (reasons.length ? ` — ${reasons.slice(0, 3).join("; ")}` : "");
};
