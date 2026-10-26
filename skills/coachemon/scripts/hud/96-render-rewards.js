import { auditSummary } from "./50-audit.js";
import { leadMark } from "./51-lead.js";
import { rewardsSummary } from "./52-shop.js";
import { roadSummary } from "./60-card.js";
import { caption, dim, h, ICON, ink, itemImg, line, mon, sep, some } from "./90-render.js";
import { drawAhead } from "./95-render-ahead.js";
import { drawAudit } from "./95-render-audit.js";
import { drawPreview } from "./95-render-preview.js";
import { drawReroll } from "./95-render-reroll.js";

const note = text => h("span", { ...dim, fontWeight: "normal" }, text);

const head = m => ({
  money: `$${m.money}`, left: m.buys.length ? `→ $${m.left}` : null,
  notes: [!m.buys.length && m.affordable === 0 ? "nothing affordable" : null, !m.free.length ? "no free reward" : null].filter(Boolean),
  boss: m.bossNext ? "👑 boss next" : null,
});
export const captionRewards = m => {
  const x = head(m);
  return caption("🛒", x.money, x.left ? h("span", dim, x.left) : null, ...x.notes.map(note), x.boss ? h("span", {}, x.boss) : null);
};
const leadRewards = m => {
  const x = head(m);
  return [[x.money, x.left].filter(Boolean).join(" "), ...x.notes, x.boss].filter(Boolean).join(" · ");
};

export const drawRewards = m => {
  const p = m.pick >= 0 ? m.free[m.pick] : null;
  const buyRows = m.buys.length
    ? m.buys.map(b => line("✓", itemImg(b.icon, b.name),
        h("span", { fontWeight: "bold" }, b.name), h("span", { ...dim, marginLeft: "4px" }, `$${b.cost}`),
        h("span", { flex: "1" }), mon(b.target, b.targetName, ICON.mon), h("span", dim, b.why)))
    : [];
  const tmTo = (f, style = dim) => {
    const b = f.best;
    if (!b) return null;
    const forget = b.forget ? `→ forget ${b.forget}` : "free slot";
    const what = b.setup ? `setup ${b.setup}${b.forget ? ` ${forget}` : ""}` : f.tm === "maybe" ? `${b.reason} — your call` : forget;
    const gain = f.tm === "take" && !b.setup && b.gain > 0 ? ` · +${b.gain} power` : "";
    const relearn = (f.relearn ?? []).includes(b.name) ? " · or a Memory Mushroom" : "";
    return [mon(b.icon, b.name, ICON.mon), h("span", style, `${b.fainted ? "(fainted) " : ""}${what}${gain}${relearn}`)];
  };
  const heldTo = (f, style = dim) => {
    if (!f.holder) return null;
    const lead = `${f.holder.name} · `;
    return [mon(f.holder.icon, f.holder.name, ICON.mon), h("span", style, f.why.startsWith(lead) ? f.why.slice(lead.length) : f.why)];
  };
  const leadRows = (m.lead?.swaps ?? []).map(sw => line("⇄", h("span", { ...ink.ours, marginRight: "3px" }, "lead"),
    mon(sw.in.icon, sw.in.name, ICON.mon), h("span", { flex: "1" }),
    h("span", dim, `switch with ${sw.out.name} · beats ${sw.foe}${leadMark(m.lead)}`)));
  const first = [m.buys.length ? "buy" : null, leadRows.length ? "reorder" : null].filter(Boolean).join(" and ");
  const take = p ? line("★", itemImg(p.icon, p.name),
    h("span", { fontWeight: "bold" }, p.name), h("span", { flex: "1" }), tmTo(p) ?? heldTo(p) ?? h("span", dim, p.why)) : null;
  const usersText = f => {
    if (f.holder) return "";
    const rest = (f.users ?? []).filter(n => !f.why.includes(n));
    return rest.length ? ` · for ${rest.slice(0, 2).join("/")}${rest.length > 2 ? ` +${rest.length - 2}` : ""}` : "";
  };
  const others = m.free.filter((_, i) => i !== m.pick).map(f => line("·", itemImg(f.icon, f.name),
    h("span", dim, f.name), h("span", { flex: "1" }),
    tmTo(f) ?? heldTo(f) ?? h("span", dim, `${f.why}${usersText(f)}`)));
  return [
    some("act", "Now", rewardsSummary(m), [
      first && m.free.length ? h("div", dim, `${first} first — taking the free reward closes the shop`) : null,
      ...buyRows, ...leadRows, first ? h("div", sep) : null, take,
      ...drawReroll(m)], leadRewards(m)),
    some("options", "Others", null, others),
    // Owed, the group keeps what it drew before, or its tab alone, until every chunk is in (#922).
    m.auditOwed && !m.auditBefore ? some("audit", "Team", "checking the team", [])
      : some("audit", "Team", auditSummary(m.auditOwed ? m.auditBefore : m.audit), drawAudit(m.auditOwed ? m.auditBefore : m.audit)),
    // The same rows as 96-render-battle's road, which a file on this layer can't import: change both.
    some("road", "Road", roadSummary(m.preview, m.ahead), [...drawPreview(m.preview), ...drawAhead(m.ahead)]),
  ].filter(Boolean);
};
