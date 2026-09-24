// Mystery Encounter card (UiMode 45), as **group**s (#349 §1): `act` · `options` · `notes`, the same three every
// light card takes. Loads after 90-render: only call these from a draw, never at load time. Takes the
// `encounterModel` view.
// The judged options are `options` — one line per option, `★ Open it — pick of 3 Ultra items`, and under it what it
// starts (a battle), what it costs, who it takes and why the call went that way; a seed-fixed outcome is marked 🔮.
// The call itself is `act.summary`, read off the model and never written here (§6).
import { encounterSummary } from "./46-encounter.js";
import { FS, bar, dim, h, line, some } from "./90-render.js";

const ENCOUNTER_MARK = { take: ["★", "#6d6"], ok: ["·", "#9aa"], avoid: ["✗", "#e77"], off: ["–", "#667"] };
export const drawEncounter = m => {
  // The header is the card's own identity line; the strip takes it in #356.
  const header = bar("🎭", m.name, m.tier ? h("span", { ...dim, fontWeight: "normal", fontSize: FS.tiny }, m.tier) : null);
  const options = [];
  m.options.forEach((o, k) => {
    const [mark, color] = ENCOUNTER_MARK[o.verdict] ?? ["?", "#ec4"];
    const shown = o.verdict === "take" && k !== m.pick ? ["✓", "#6d6"] : [mark, color];
    const seed = o.exact ? h("span", { marginRight: "2px" }, "🔮") : null;
    if (seed) seed.title = "fixed by the run seed: this is what happens";
    const label = h("span", { color: o.verdict === "off" ? "#667" : shown[1], fontWeight: k === m.pick ? "bold" : "normal", marginRight: "3px" }, o.label);
    const outcome = o.outcome ? h("span", o.verdict === "off" ? { color: "#667" } : {}, `— ${o.outcome}`) : null;
    options.push(line(shown[0], shown[1], label, seed, outcome));
    const bits = [
      o.battle ? `⚔ ${o.battle}` : null,
      o.cost && !o.outcome ? `$${o.cost.toLocaleString("en-US")}` : null, // a judged outcome names its own price
      // A judged option names the mon the game will use; elsewhere the player may be asked to choose, so list who can.
      m.known && o.by ? `by ${o.by}` : o.qualifies?.length ? `${o.qualifies.join(", ")} qualif${o.qualifies.length === 1 ? "ies" : "y"}` : null,
      o.why,
    ].filter(Boolean);
    if (bits.length) options.push(line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, bits.join(" · "))));
  });
  const notes = [
    ...m.notes.map(n => line("·", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, n))),
    m.known ? null : line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, "not judged yet: options and requirements only")),
  ];
  // `options` and `notes` head their panes with their label alone — the options themselves say it one glance lower (§6).
  return [
    some("act", "Now", encounterSummary(m), [header]),
    some("options", "Options", null, options),
    some("notes", "Notes", null, notes),
  ].filter(Boolean);
};
