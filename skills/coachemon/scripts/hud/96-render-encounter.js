// Mystery Encounter card (UiMode 45) and its plain-text summary. Loads after 90-render: only call these from a draw or a
// summary, never at load time. Takes the `encounterModel` view.
// One line per option — `★ Open it — pick of 3 Ultra items` — and under it what it starts (a battle), what it costs,
// who it takes and why the call went that way; a seed-fixed outcome is marked 🔮.
import { FS, bar, closed, dim, h, line, tab } from "./90-render.js";

const ENCOUNTER_MARK = { take: ["★", "#6d6"], ok: ["·", "#9aa"], avoid: ["✗", "#e77"], off: ["–", "#667"] };
export const drawEncounter = m => {
  const pick = m.pick >= 0 ? m.options[m.pick] : null;
  if (closed()) return [tab("🎭", pick ? h("span", {}, pick.label) : null)];
  const out = [bar("🎭", m.name, m.tier ? h("span", { ...dim, fontWeight: "normal", fontSize: FS.tiny }, m.tier) : null)];
  m.options.forEach((o, k) => {
    const [mark, color] = ENCOUNTER_MARK[o.verdict] ?? ["?", "#ec4"];
    const shown = o.verdict === "take" && k !== m.pick ? ["✓", "#6d6"] : [mark, color];
    const seed = o.exact ? h("span", { marginRight: "2px" }, "🔮") : null;
    if (seed) seed.title = "fixed by the run seed: this is what happens";
    const label = h("span", { color: o.verdict === "off" ? "#667" : shown[1], fontWeight: k === m.pick ? "bold" : "normal", marginRight: "3px" }, o.label);
    const outcome = o.outcome ? h("span", o.verdict === "off" ? { color: "#667" } : {}, `— ${o.outcome}`) : null;
    out.push(line(shown[0], shown[1], label, seed, outcome));
    const bits = [
      o.battle ? `⚔ ${o.battle}` : null,
      o.cost && !o.outcome ? `$${o.cost.toLocaleString("en-US")}` : null, // a judged outcome names its own price
      // A judged option names the mon the game will use; elsewhere the player may be asked to choose, so list who can.
      m.known && o.by ? `by ${o.by}` : o.qualifies?.length ? `${o.qualifies.join(", ")} qualif${o.qualifies.length === 1 ? "ies" : "y"}` : null,
      o.why,
    ].filter(Boolean);
    if (bits.length) out.push(line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, bits.join(" · "))));
  });
  for (const n of m.notes) out.push(line("·", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, n)));
  if (!m.known) out.push(line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, "not judged yet: options and requirements only")));
  return out;
};
