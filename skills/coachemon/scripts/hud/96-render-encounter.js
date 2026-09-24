// Mystery Encounter card (UiMode 45), as **group**s (#349 §1): `act` · `options` · `notes`, the same three every
// light card takes. Loads after 90-render: only call these from a draw, never at load time. Takes the
// `encounterModel` view.
// The judged options are `options` — one line per option, `★ Open it — pick of 3 Ultra items`, and under it what it
// starts (a battle), what it costs, who it takes and why the call went that way; a seed-fixed outcome says `fixed`.
// The call itself is `act.summary`, read off the model and never written here (§6).
import { encounterSummary } from "./46-encounter.js";
import { caption, dim, h, ink, line, some } from "./90-render.js";

// An option the party can't pick is neutral news, not bad news, so it takes `·` and the word `off` leads its row.
// The unknown verdict falls on `·` too, since `?` is confidence and confidence is not a gutter mark (90-render).
// This card is one of the no-arrow kinds 90-render names, so the law degrades to **ours** alone (#349 §8). Which is
// why a verdict is a mark and no longer a mark and an ink: good-or-bad is the gutter's one question, answered once.
const ENCOUNTER_MARK = { take: "★", ok: "·", avoid: "✗", off: "·" };
// The strip's caption: which encounter this is, and how rare it is.
export const captionEncounter = m => caption("🎭", m.name, m.tier ? h("span", { ...dim, fontWeight: "normal" }, m.tier) : null);

export const drawEncounter = m => {
  const options = [];
  m.options.forEach((o, k) => {
    const mark = o.verdict === "take" && k !== m.pick ? "✓" : ENCOUNTER_MARK[o.verdict] ?? "·";
    // Seed-fixed is `exact` confidence, which the register leaves unmarked; on an encounter, where the default is
    // odds, the exception is named in a word rather than given a glyph of its own.
    const seed = o.exact ? h("span", { ...dim, marginRight: "2px" }, "fixed") : null;
    if (seed) seed.title = "fixed by the run seed: this is what happens";
    // One predicate, asked once: the word, the label's ink and the outcome's ink are three faces of it. An option
    // the party cannot pick is nobody's — neither, the law's grey — and one it can is **ours**.
    const isOff = o.verdict === "off";
    const off = isOff ? h("span", { ...dim, marginRight: "3px" }, "off") : null;
    const label = h("span", { ...(isOff ? dim : ink.ours), fontWeight: k === m.pick ? "bold" : "normal", marginRight: "3px" }, o.label);
    const outcome = o.outcome ? h("span", isOff ? dim : {}, `— ${o.outcome}`) : null;
    options.push(line(mark, off, label, seed, outcome));
    const bits = [
      o.battle ? `⚔ ${o.battle}` : null,
      o.cost && !o.outcome ? `$${o.cost.toLocaleString("en-US")}` : null, // a judged outcome names its own price
      // A judged option names the mon the game will use; elsewhere the player may be asked to choose, so list who can.
      m.known && o.by ? `by ${o.by}` : o.qualifies?.length ? `${o.qualifies.join(", ")} qualif${o.qualifies.length === 1 ? "ies" : "y"}` : null,
      o.why,
    ].filter(Boolean);
    if (bits.length) options.push(line("", h("span", dim, bits.join(" · "))));
  });
  const notes = [
    ...m.notes.map(n => line("·", h("span", dim, n))),
    m.known ? null : line("", h("span", dim, "not judged yet: options and requirements only")),
  ];
  // `options` and `notes` head their panes with their label alone — the options themselves say it one glance lower (§6).
  return [
    some("act", "Now", encounterSummary(m), []),
    some("options", "Options", null, options),
    some("notes", "Notes", null, notes),
  ].filter(Boolean);
};
