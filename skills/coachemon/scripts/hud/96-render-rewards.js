// Rewards card (the 52-shop model), as **group**s (#349 §1): `act` — the buys, then the free reward, then the
// reroll, because a reroll is a shop action and `act` already carries the ordering rule that taking the free reward
// closes the shop — then `options`, the rewards it passed over, then `audit` and `road`. Each group's summary is read
// off the model, never written here (§6).
import { auditSummary } from "./50-audit.js";
import { rewardsSummary } from "./52-shop.js";
import { roadSummary } from "./60-card.js";
import { bar, dim, h, ICON, itemImg, line, mon, sep, some } from "./90-render.js";
import { drawAhead } from "./95-render-ahead.js";
import { drawAudit } from "./95-render-audit.js";
import { drawPreview } from "./95-render-preview.js";
import { drawReroll } from "./95-render-reroll.js";

export const drawRewards = m => {
  const p = m.pick >= 0 ? m.free[m.pick] : null;
  const header = bar("🛒", `$${m.money}`, m.buys.length ? h("span", dim, `→ $${m.left}`) : null,
    !m.buys.length && m.affordable === 0 ? h("span", { ...dim, fontWeight: "normal" }, "nothing affordable") : null,
    m.bossNext ? h("span", { color: "#fa4" }, "👑 boss next") : null);
  const buyRows = m.buys.length
    ? m.buys.map(b => line("💰", "#ec4", itemImg(b.icon, b.name),
        h("span", { fontWeight: "bold" }, b.name), h("span", { ...dim, marginLeft: "4px" }, `$${b.cost}`),
        h("span", { flex: "1" }), mon(b.target, b.targetName, ICON.mon), h("span", dim, b.why)))
    : [];
  // A TM names its best recipient by icon and the move it replaces, instead of the "TM for X (over Y)" text, plus the
  // effective power it gains. Other options' rows use it too, in the dim ink that tells them from the pick.
  const tmTo = (f, style = dim) => {
    const b = f.best;
    if (!b) return null;
    const forget = b.forget ? `→ forget ${b.forget}` : "free slot";
    const what = b.setup ? `setup ${b.setup}${b.forget ? ` ${forget}` : ""}` : f.tm === "maybe" ? `${b.reason} — your call` : forget;
    const gain = f.tm === "take" && !b.setup && b.gain > 0 ? ` · +${b.gain} power` : "";
    // The recipient the TM could never have been drawn for: a Memory Mushroom would teach it the same move, so the
    // TM is one of two routes rather than the only one. Not a reason to skip it — the Mushroom costs a slot too.
    const relearn = (f.relearn ?? []).includes(b.name) ? " · or a Memory Mushroom" : "";
    return [mon(b.icon, b.name, ICON.mon), h("span", style, `${b.fainted ? "(fainted) " : ""}${what}${gain}${relearn}`)];
  };
  // A held item, mint, vitamin or candy names the member it should go to by icon, ahead of its reason — which then
  // drops the "<name> · " it opens with.
  const heldTo = (f, style = dim) => {
    if (!f.holder) return null;
    const lead = `${f.holder.name} · `;
    return [mon(f.holder.icon, f.holder.name, ICON.mon), h("span", style, f.why.startsWith(lead) ? f.why.slice(lead.length) : f.why)];
  };
  const take = p ? line("🎁", "#6d6", itemImg(p.icon, p.name),
    h("span", { fontWeight: "bold" }, p.name), h("span", { flex: "1" }), tmTo(p) ?? heldTo(p) ?? h("span", dim, p.why)) : null;
  // Who can use it, when the reason doesn't already name them (a holder is the answer already).
  const usersText = f => {
    if (f.holder) return "";
    const rest = (f.users ?? []).filter(n => !f.why.includes(n));
    return rest.length ? ` · for ${rest.slice(0, 2).join("/")}${rest.length > 2 ? ` +${rest.length - 2}` : ""}` : "";
  };
  const others = m.free.filter((_, i) => i !== m.pick).map(f => line("·", "#9aa", itemImg(f.icon, f.name),
    h("span", dim, f.name), h("span", { flex: "1" }),
    tmTo(f) ?? heldTo(f) ?? h("span", f.tm === "skip" ? { color: "#e77" } : dim, `${f.why}${usersText(f)}`)));
  // The header is the card's identity line and carries the panel's one control. The strip takes it in #356; until
  // then it is a row of `act` and draws in the dense register like any other row, because §9's chrome is the tab
  // labels, the strip, the verdict and the group summaries — and the strip is what this line becomes.
  //
  // The rule between the buys and the free reward stays: both are `act`'s own rows, so it separates two parts of one
  // group rather than two groups — which is the shell's business and nothing a renderer draws (§1).
  return [
    some("act", "Now", rewardsSummary(m), [header,
      m.buys.length ? h("div", dim, "buy first — taking the free reward closes the shop") : null,
      ...buyRows, m.buys.length ? h("div", sep) : null, take,
      // What the next reroll brings, read off the stream (or the old hint without the preview).
      ...drawReroll(m)]),
    // The shop's unpicked rewards: the judged list, which on every kind is `options` (§1). No summary and no count —
    // the options themselves say it one glance lower (§6).
    some("options", "Others", null, others),
    // What is wrong with the team itself, while this shop can still patch it.
    some("audit", "Team", auditSummary(m.audit), drawAudit(m.audit)),
    // What the shop is being stocked for: the wave the run seed has already decided on, then the next big fight the
    // calendar holds and whether this party is ready for it. The line is the battle card's own (`roadSummary`); the
    // two rows are spelled out again because the two cards that draw a road sit on the same bundle layer, so neither
    // can import a builder from the other and a shared one would have to sit below the sections it draws.
    some("road", "Road", roadSummary(m.preview, m.ahead), [...drawPreview(m.preview), ...drawAhead(m.ahead)]),
  ].filter(Boolean);
};
