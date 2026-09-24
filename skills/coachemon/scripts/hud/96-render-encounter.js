// Mystery Encounter card (UiMode 45), as **group**s (#349 §1): `act` · `options` · `notes`, the same three every
// light card takes. Loads after 90-render: only call these from a draw, never at load time. Takes the
// `encounterModel` view.
// The judged options are `options` — one line per option, `★ Open it — pick of 3 Ultra items`, and under it what it
// starts (a battle), what it costs, who it takes and why the call went that way; a seed-fixed outcome says `fixed`.
// The call itself is `act.summary`, read off the model and never written here (§6).
import { encounterSummary } from "./46-encounter.js";
import { caption, dim, h, line, some } from "./90-render.js";

// An option the party can't pick is neutral news, not bad news, so it takes `·` and the word `off` leads its row.
// The unknown verdict falls on `·` too, since `?` is confidence and confidence is not a gutter mark (90-render).
const ENCOUNTER_MARK = { take: ["★", "#6d6"], ok: ["·", "#9aa"], avoid: ["✗", "#e77"], off: ["·", "#667"] };
// The strip's caption: which encounter this is, and how rare it is.
export const captionEncounter = m => caption("🎭", m.name, m.tier ? h("span", { ...dim, fontWeight: "normal" }, m.tier) : null);

export const drawEncounter = m => {
  const options = [];
  m.options.forEach((o, k) => {
    const [mark, color] = ENCOUNTER_MARK[o.verdict] ?? ["·", "#ec4"];
    const shown = o.verdict === "take" && k !== m.pick ? ["✓", "#6d6"] : [mark, color];
    // Seed-fixed is `exact` confidence, which the register leaves unmarked; on an encounter, where the default is
    // odds, the exception is named in a word rather than given a glyph of its own.
    const seed = o.exact ? h("span", { ...dim, marginRight: "2px" }, "fixed") : null;
    if (seed) seed.title = "fixed by the run seed: this is what happens";
    // One predicate, asked once: the word, the label's ink and the outcome's ink are three faces of it.
    const isOff = o.verdict === "off";
    const off = isOff ? h("span", { color: "#667", marginRight: "3px" }, "off") : null;
    const label = h("span", { color: isOff ? "#667" : shown[1], fontWeight: k === m.pick ? "bold" : "normal", marginRight: "3px" }, o.label);
    const outcome = o.outcome ? h("span", isOff ? { color: "#667" } : {}, `— ${o.outcome}`) : null;
    options.push(line(shown[0], shown[1], off, label, seed, outcome));
    const bits = [
      o.battle ? `⚔ ${o.battle}` : null,
      o.cost && !o.outcome ? `$${o.cost.toLocaleString("en-US")}` : null, // a judged outcome names its own price
      // A judged option names the mon the game will use; elsewhere the player may be asked to choose, so list who can.
      m.known && o.by ? `by ${o.by}` : o.qualifies?.length ? `${o.qualifies.join(", ")} qualif${o.qualifies.length === 1 ? "ies" : "y"}` : null,
      o.why,
    ].filter(Boolean);
    if (bits.length) options.push(line("", "#9aa", h("span", dim, bits.join(" · "))));
  });
  const notes = [
    ...m.notes.map(n => line("·", "#9aa", h("span", dim, n))),
    m.known ? null : line("", "#9aa", h("span", dim, "not judged yet: options and requirements only")),
  ];
  // `options` and `notes` head their panes with their label alone — the options themselves say it one glance lower (§6).
  return [
    some("act", "Now", encounterSummary(m), []),
    some("options", "Options", null, options),
    some("notes", "Notes", null, notes),
  ].filter(Boolean);
};
