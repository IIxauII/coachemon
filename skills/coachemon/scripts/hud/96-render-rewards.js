// Rewards card (the 52-shop model): what to buy, what free reward to take and who it goes to, then the sections the
// screen is judged against — the reroll ahead, the team audit, the next wave and the next big fight.
import { FS, bar, dim, h, itemImg, line, mon, sep, tab, view } from "./90-render.js";
import { drawAhead } from "./95-render-ahead.js";
import { drawAudit } from "./95-render-audit.js";
import { drawPreview } from "./95-render-preview.js";
import { drawReroll } from "./95-render-reroll.js";

export const drawRewards = m => {
  const p = m.pick >= 0 ? m.free[m.pick] : null;
  if (view() === "closed") return [tab("🛒", p ? itemImg(p.icon, p.name) : null)];
  const header = bar("🛒", `$${m.money}`, m.buys.length ? h("span", dim, `→ $${m.left}`) : null,
    view() === "full" && !m.buys.length && m.affordable === 0 ? h("span", { ...dim, fontWeight: "normal", fontSize: FS.tiny }, "nothing affordable") : null,
    m.bossNext ? h("span", { color: "#fa4", fontSize: FS.tiny }, "👑 boss next") : null);
  const buyRows = m.buys.length
    ? m.buys.map(b => line("💰", "#ec4", itemImg(b.icon, b.name),
        h("span", { fontWeight: "bold" }, b.name), h("span", { ...dim, marginLeft: "4px" }, `$${b.cost}`),
        h("span", { flex: "1" }), mon(b.target, b.targetName, 20), h("span", dim, b.why)))
    : [];
  // A TM names its best recipient by icon and the move it replaces, instead of the "TM for X (over Y)" text; full view
  // adds the effective power it gains. Other options' rows use it too, in their smaller type.
  const tmTo = (f, style = dim) => {
    const b = f.best;
    if (!b) return null;
    const forget = b.forget ? `→ forget ${b.forget}` : "free slot";
    const what = b.setup ? `setup ${b.setup}${b.forget ? ` ${forget}` : ""}` : f.tm === "maybe" ? `${b.reason} — your call` : forget;
    const gain = view() === "full" && f.tm === "take" && !b.setup && b.gain > 0 ? ` · +${b.gain} power` : "";
    // The recipient the TM could never have been drawn for: a Memory Mushroom would teach it the same move, so the
    // TM is one of two routes rather than the only one. Not a reason to skip it — the Mushroom costs a slot too.
    const relearn = (f.relearn ?? []).includes(b.name) ? " · or a Memory Mushroom" : "";
    return [mon(b.icon, b.name, 20), h("span", style, `${b.fainted ? "(fainted) " : ""}${what}${gain}${relearn}`)];
  };
  // A held item, mint, vitamin or candy names the member it should go to by icon, ahead of its reason — which then
  // drops the "<name> · " it opens with.
  const heldTo = (f, style = dim) => {
    if (!f.holder) return null;
    const lead = `${f.holder.name} · `;
    return [mon(f.holder.icon, f.holder.name, 20), h("span", style, f.why.startsWith(lead) ? f.why.slice(lead.length) : f.why)];
  };
  const take = p ? line("🎁", "#6d6", itemImg(p.icon, p.name),
    h("span", { fontWeight: "bold" }, p.name), h("span", { flex: "1" }), tmTo(p) ?? heldTo(p) ?? h("span", dim, p.why)) : null;
  if (view() === "mini") return [header, ...buyRows, take, ...drawReroll(m), ...drawAudit(m.audit), ...drawPreview(m.preview), ...drawAhead(m.ahead)].filter(Boolean);
  // Who can use it, when the reason doesn't already name them (a holder is the answer already).
  const usersText = f => {
    if (f.holder) return "";
    const rest = (f.users ?? []).filter(n => !f.why.includes(n));
    return rest.length ? ` · for ${rest.slice(0, 2).join("/")}${rest.length > 2 ? ` +${rest.length - 2}` : ""}` : "";
  };
  const others = m.free.filter((_, i) => i !== m.pick).map(f => line("·", "#9aa", itemImg(f.icon, f.name),
    h("span", dim, f.name), h("span", { flex: "1" }),
    tmTo(f, { color: "#9aa", fontSize: FS.tiny }) ?? heldTo(f, { color: "#9aa", fontSize: FS.tiny }) ?? h("span",{ color: f.tm === "skip" ? "#e77" : "#9aa", fontSize: FS.tiny }, `${f.why}${usersText(f)}`)));
  return [header,
    m.buys.length ? h("div", { ...dim, fontSize: FS.tiny }, "buy first — taking the free reward closes the shop") : null,
    ...buyRows, m.buys.length ? h("div", sep) : null, take, ...others,
    // What the next reroll brings, read off the stream (or the old hint without the preview).
    ...drawReroll(m),
    // What is wrong with the team itself, while this shop can still patch it.
    ...drawAudit(m.audit),
    // What the shop is being stocked for: the wave the run seed has already decided on (it draws its own rule), then
    // the next big fight the calendar holds and whether this party is ready for it.
    ...drawPreview(m.preview), ...drawAhead(m.ahead)].filter(Boolean);
};
