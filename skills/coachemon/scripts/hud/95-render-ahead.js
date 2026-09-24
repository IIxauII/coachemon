// Look-ahead card (the 49-ahead model) and its plain-text summary. Loads after 90-render: only call these from a
// draw or a summary, never at load time.
// The readiness reasons, the no-heal stretch, what the wave's rewards are pinned to, party luck, and the Eternatus
// checklist before wave 200.
// The card only ever says what the calendar and the seed already decided: the schedule is arithmetic on the wave
// index, and a named trainer comes from the preview's replay, which marks its own confidence.
import { aheadIn, aheadWho } from "./49-ahead.js";
import { dim, h, line } from "./90-render.js";

const AHEAD_COLOR = { ready: "#6d6", watch: "#ec4", risky: "#e55" };
export const drawAhead = a => {
  if (!a?.next) return [];
  const r = a.readiness;
  const color = r ? AHEAD_COLOR[r.verdict] : "#9aa";
  const head = h("span", { fontWeight: "bold", marginRight: "3px" }, `${aheadWho(a)} ${aheadIn(a.next.in)}`);
  const where = h("span", dim, `W${a.next.wave}`);
  // Rows of the road group, not a card of its own: the shell rules groups apart (#349 §1), and no section has a
  // control of its own.
  const out = [line("", color, h("span", { fontWeight: "bold", marginRight: "3px" }, "Next big fight"),
    head, where, h("span", { flex: "1" }),
    a.next.double ? h("span", { ...dim, marginRight: "3px" }, "double") : null,
    a.next.bars ? h("span", { color: "#fa4" }, `👑 ${a.next.bars + 1} bars`) : null)];
  // The roster, unless the next-wave card above is already showing it: the same foes twice is noise, the readiness
  // reasons under them are not.
  if (a.next.foes?.length && a.next.in > 1) {
    out.push(line("·", "#9aa", h("span", dim,
      a.next.foes.map(f => `${f.name} L${f.level}`).join(" · "))));
  }
  // What beating it pays, when the fixed-battle table pins the tiers. No roll: it is the config's own list.
  if (a.next.rewards?.tiers.length) {
    out.push(line("·", "#8cf", h("span", dim, `it pays ${a.next.rewards.tiers.join(" · ")}`)));
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
    out.push(line("✓", "#6d6", h("span", dim, `full heal entering W${a.heal.wave} — HP, status, PP, revives, Tera`)));
  }
  if (a.thisWave) {
    out.push(line("·", "#8cf", h("span", dim, a.thisWave.tiers.length
      ? `these rewards are pinned to ${a.thisWave.tiers.join(" · ")}${a.thisWave.luckUpgrades ? "" : " — luck can't upgrade them"}`
      : "luck can't upgrade these rewards")));
  }
  out.push(line("·", "#9aa", h("span", dim,
    `luck ${a.luck.value} (${a.luck.grade}) — ${a.luck.upgradePct}% tier upgrade per reward${a.thisWave && !a.thisWave.luckUpgrades ? ", off this wave" : ""}`)));
  for (const f of a.eternatus?.facts ?? []) {
    out.push(line(f.good ? "✓" : "✗", f.good ? "#6d6" : "#c9f", f.text));
  }
  return out;
};
